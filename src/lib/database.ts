import "server-only";
import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { authorize, type User } from "./permissions";
import { auditedTables, installAuditing, systemContext } from "./audit-schema";
import { mutations, type MutationName } from "./mutations";
import { AUDIT_PAGE_SIZE, type AuditEntry } from "./audit";

export const SESSION_SECONDS = 60 * 60 * 8;
export const demoUsers: User[] = [
  { id: "user-agent", name: "Alex Morgan", email: "alex@example.test", role: "agent" },
  { id: "user-reviewer", name: "Sam Rivera", email: "sam@example.test", role: "reviewer" },
  { id: "user-admin", name: "Jordan Lee", email: "jordan@example.test", role: "admin" },
];

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export class Store {
  readonly #client: Client;
  #operations: Promise<void> = Promise.resolve();
  private ready: Promise<void>;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
    this.#client = createClient({ url: path === ":memory:" ? path : `file:${resolve(path)}`, concurrency: 1 });
    this.ready = this.initialize();
  }

  // One connection preserves PRAGMAs; queued access prevents transaction reentry.
  #run<T>(run: () => Promise<T>): Promise<T> {
    const pending = this.#operations.then(run);
    this.#operations = pending.then(() => {}, () => {});
    return pending;
  }

  private async initialize() {
    await this.#client.execute("PRAGMA foreign_keys = ON");
    await this.#client.execute("PRAGMA busy_timeout = 5000");
    await this.#client.execute("PRAGMA recursive_triggers = ON");
    const tx = await this.#client.transaction("write");
    try {
      await tx.batch([
        `CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL CHECK (role IN ('agent', 'reviewer', 'admin'))
        )`,
        `CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS workspace_note (
          id INTEGER PRIMARY KEY CHECK (id = 1), content TEXT NOT NULL,
          updated_by TEXT REFERENCES users(id), updated_at TEXT NOT NULL
        )`,
        ...demoUsers.map((user) => ({
          sql: "INSERT OR IGNORE INTO users (id, name, email, role) VALUES (?, ?, ?, ?)",
          args: [user.id, user.name, user.email, user.role],
        })),
      ]);
      await installAuditing(tx);
      await systemContext(tx, "workspace_note", "system.seed");
      await tx.execute({ sql: "INSERT INTO workspace_note SELECT 1, ?, NULL, ? WHERE NOT EXISTS (SELECT 1 FROM workspace_note WHERE id = 1)", args: ["A shared starting point for better internal tools. Switch roles to see server-side permissions in action.", new Date().toISOString()] });
      await tx.execute("DELETE FROM audit_context");
      await tx.commit();
    } finally { tx.close(); }
  }

  async users(): Promise<User[]> {
    await this.ready;
    const result = await this.#run(() => this.#client.execute("SELECT id, name, email, role FROM users ORDER BY CASE role WHEN 'agent' THEN 1 WHEN 'reviewer' THEN 2 ELSE 3 END"));
    return result.rows as unknown as User[];
  }

  async createSession(userId: string, previousToken?: string): Promise<string | null> {
    await this.ready;
    if (!(await this.users()).some((user) => user.id === userId)) return null;
    const token = randomBytes(32).toString("hex");
    await this.#run(() => this.#client.batch([
      { sql: "DELETE FROM sessions WHERE expires_at <= ?", args: [Date.now()] },
      ...(previousToken ? [{ sql: "DELETE FROM sessions WHERE token_hash = ?", args: [hashToken(previousToken)] }] : []),
      { sql: "INSERT INTO sessions VALUES (?, ?, ?)", args: [hashToken(token), userId, Date.now() + SESSION_SECONDS * 1000] },
    ], "write"));
    return token;
  }

  async sessionUser(token?: string): Promise<User | null> {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    await this.ready;
    const result = await this.#run(() => this.#client.execute({
      sql: "SELECT users.id, name, email, role FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?",
      args: [hashToken(token), Date.now()],
    }));
    return (result.rows[0] as unknown as User) ?? null;
  }

  async deleteSession(token?: string) {
    await this.ready;
    if (token) await this.#run(() => this.#client.execute({ sql: "DELETE FROM sessions WHERE token_hash = ?", args: [hashToken(token)] }));
  }

  async note() {
    await this.ready;
    const result = await this.#run(() => this.#client.execute("SELECT content, updated_at AS updatedAt, users.name AS updatedBy FROM workspace_note LEFT JOIN users ON users.id = workspace_note.updated_by WHERE workspace_note.id = 1"));
    return result.rows[0] as unknown as { content: string; updatedAt: string; updatedBy: string | null };
  }

  async mutate(name: MutationName, actorId: string, input: unknown) {
    await this.ready;
    const mutation = mutations[name];
    if (!mutation || !auditedTables.some((table) => table.table === mutation.table)) throw new Error("Unregistered business mutation");
    return this.#run(async () => {
      const tx = await this.#client.transaction("write");
      try {
        const actorRow = await tx.execute({ sql: "SELECT id, name, email, role FROM users WHERE id = ?", args: [actorId] });
        const actor = authorize((actorRow.rows[0] as unknown as User) ?? null, mutation.permission);
        const statement = mutation.statement(input, actor.id);
        const mutationId = randomUUID();
        await tx.execute({ sql: "INSERT INTO audit_context VALUES (1, ?, ?, ?, ?, ?, ?, ?)", args: [mutationId, actor.id, actor.name, actor.email, actor.role, name, mutation.table] });
        await tx.execute(statement);
        const audit = await tx.execute({ sql: "SELECT id FROM audit_log WHERE mutation_id = ?", args: [mutationId] });
        if (!audit.rows.length) throw new Error("Mutation did not produce an audit entry");
        await tx.execute("DELETE FROM audit_context");
        await tx.commit();
        return { mutationId };
      } finally { tx.close(); }
    });
  }

  async auditEntries(before?: number) {
    await this.ready;
    const result = await this.#run(() => this.#client.execute({
      sql: `SELECT * FROM audit_log ${before === undefined ? "" : "WHERE id < ?"} ORDER BY id DESC LIMIT ?`,
      args: before === undefined ? [AUDIT_PAGE_SIZE + 1] : [before, AUDIT_PAGE_SIZE + 1],
    }));
    const entries: AuditEntry[] = result.rows.slice(0, AUDIT_PAGE_SIZE).map((row) => ({
      id: Number(row.id), mutationId: String(row.mutation_id), occurredAt: String(row.occurred_at),
      actor: { id: String(row.actor_id), name: String(row.actor_name), email: row.actor_email === null ? null : String(row.actor_email), role: String(row.actor_role) },
      action: String(row.action), table: String(row.table_name), recordId: String(row.record_id), operation: row.operation as AuditEntry["operation"],
      before: row.before_json === null ? null : JSON.parse(String(row.before_json)),
      after: row.after_json === null ? null : JSON.parse(String(row.after_json)),
    }));
    return { entries, nextCursor: result.rows.length > AUDIT_PAGE_SIZE ? entries.at(-1)!.id : null };
  }

  close() {
    this.#client.close();
  }
}

const globalStore = globalThis as unknown as { toolsStore?: unknown };
export function getStore() {
  const existing = globalStore.toolsStore;
  if (existing instanceof Store) return existing;
  if (existing && typeof existing === "object" && "close" in existing && typeof existing.close === "function") existing.close();
  const store = new Store(process.env.DATABASE_PATH || "./data/internal-tools.db");
  globalStore.toolsStore = store;
  return store;
}

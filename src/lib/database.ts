import "server-only";
import { createClient, type Client, type Transaction } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { authorize, roles, type User } from "./permissions";
import { auditedTables, installAuditing, systemContext } from "./audit-schema";
import { mutations, type MutationName } from "./mutations";
import { AUDIT_PAGE_SIZE, type AuditEntry } from "./audit";
import type { Refund } from "./refund-types";
import { COMPLIANCE_SIGNOFF_ABOVE_CENTS } from "./refunds";
import type { KycCase } from "./kyc-types";

export const SESSION_SECONDS = 60 * 60 * 8;
export const demoUsers: User[] = [
  { id: "user-agent", name: "Alex Morgan", email: "alex@example.test", role: "agent" },
  { id: "user-agent-2", name: "Casey Chen", email: "casey@example.test", role: "agent" },
  { id: "user-reviewer", name: "Sam Rivera", email: "sam@example.test", role: "reviewer" },
  { id: "user-reviewer-2", name: "Priya Shah", email: "priya@example.test", role: "reviewer" },
  { id: "user-compliance", name: "Morgan Ellis", email: "morgan@example.test", role: "compliance" },
  { id: "user-admin", name: "Jordan Lee", email: "jordan@example.test", role: "admin" },
];

const usersTable = (name: string) => `CREATE TABLE ${name} (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN (${roles.map((role) => `'${role}'`).join(", ")}))
)`;

async function addColumn(tx: Transaction, table: string, column: string, definition: string) {
  const columns = await tx.execute(`PRAGMA table_info(${table})`);
  if (!columns.rows.some((row) => row.name === column)) await tx.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

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

  // SQLite cannot alter a CHECK constraint, so a new role rebuilds the users table with foreign keys off.
  private async migrateUserRoles() {
    const [existing] = (await this.#client.execute("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'users'")).rows;
    if (!existing || roles.every((role) => String(existing.sql).includes(`'${role}'`))) return;
    await this.#client.execute("PRAGMA foreign_keys = OFF");
    const tx = await this.#client.transaction("write");
    try {
      await tx.execute(usersTable("users_next"));
      await tx.execute("INSERT INTO users_next (id, name, email, role) SELECT id, name, email, role FROM users");
      await tx.execute("DROP TABLE users");
      await tx.execute("ALTER TABLE users_next RENAME TO users");
      if ((await tx.execute("PRAGMA foreign_key_check")).rows.length) throw new Error("User role migration broke a foreign key");
      await tx.commit();
    } finally { tx.close(); }
  }

  private async initialize() {
    await this.migrateUserRoles();
    await this.#client.execute("PRAGMA foreign_keys = ON");
    await this.#client.execute("PRAGMA busy_timeout = 5000");
    await this.#client.execute("PRAGMA recursive_triggers = ON");
    const tx = await this.#client.transaction("write");
    try {
      await tx.batch([
        usersTable("IF NOT EXISTS users"),
        `CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS workspace_note (
          id INTEGER PRIMARY KEY CHECK (id = 1), content TEXT NOT NULL,
          updated_by TEXT REFERENCES users(id), updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS approval_requests (
          id TEXT PRIMARY KEY, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL,
          requested_by TEXT NOT NULL REFERENCES users(id), policy_key TEXT NOT NULL, policy_version INTEGER NOT NULL,
          required_approvals INTEGER NOT NULL CHECK (required_approvals >= 1),
          signoff_required INTEGER NOT NULL DEFAULT 0 CHECK (signoff_required IN (0, 1)),
          approval_count INTEGER NOT NULL DEFAULT 0 CHECK (approval_count >= 0 AND approval_count <= required_approvals),
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          UNIQUE (resource_type, resource_id)
        )`,
        `CREATE TABLE IF NOT EXISTS approval_decisions (
          id TEXT PRIMARY KEY, approval_id TEXT NOT NULL REFERENCES approval_requests(id),
          reviewer_id TEXT NOT NULL REFERENCES users(id), decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject')),
          capacity TEXT NOT NULL DEFAULT 'review' CHECK (capacity IN ('review', 'signoff')),
          decided_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          UNIQUE (approval_id, reviewer_id)
        )`,
        `CREATE TABLE IF NOT EXISTS refund_requests (
          id TEXT PRIMARY KEY, approval_id TEXT NOT NULL UNIQUE REFERENCES approval_requests(id),
          customer TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents BETWEEN 1 AND 9007199254740991), reason TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS kyc_cases (
          id TEXT PRIMARY KEY NOT NULL, approval_id TEXT NOT NULL UNIQUE REFERENCES approval_requests(id),
          customer TEXT NOT NULL, country TEXT NOT NULL CHECK (length(country) = 2),
          document_type TEXT NOT NULL CHECK (document_type IN ('passport', 'national_id', 'driving_licence')),
          risk_score REAL NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
          assigned_to TEXT REFERENCES users(id), escalated INTEGER NOT NULL DEFAULT 0 CHECK (escalated IN (0, 1))
        )`,
        `CREATE TABLE IF NOT EXISTS kyc_events (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, case_id TEXT NOT NULL REFERENCES kyc_cases(id),
          actor_id TEXT NOT NULL REFERENCES users(id), actor_name TEXT NOT NULL, actor_role TEXT NOT NULL,
          action TEXT NOT NULL CHECK (action IN ('submit', 'claim', 'release', 'approve', 'reject', 'escalate')),
          note TEXT NOT NULL, occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        )`,
        "CREATE INDEX IF NOT EXISTS kyc_events_case ON kyc_events(case_id, id)",
        ...demoUsers.map((user) => ({
          sql: "INSERT OR IGNORE INTO users (id, name, email, role) VALUES (?, ?, ?, ?)",
          args: [user.id, user.name, user.email, user.role],
        })),
      ]);
      await addColumn(tx, "approval_requests", "signoff_required", "INTEGER NOT NULL DEFAULT 0 CHECK (signoff_required IN (0, 1))");
      await addColumn(tx, "approval_decisions", "capacity", "TEXT NOT NULL DEFAULT 'review' CHECK (capacity IN ('review', 'signoff'))");
      await installAuditing(tx);
      await tx.execute("INSERT OR IGNORE INTO schema_migrations VALUES (2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))");
      await tx.execute("INSERT OR IGNORE INTO schema_migrations VALUES (3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))");
      if (!(await tx.execute("SELECT 1 FROM schema_migrations WHERE version = 4")).rows.length) {
        // Compliance sign-off above $5,000 is effective immediately, so pending v1 refunds move to the v2 policy.
        await systemContext(tx, "approval_requests", "system.migration.refund-compliance-signoff");
        await tx.execute({
          sql: `UPDATE approval_requests SET policy_version = 2,
              signoff_required = (SELECT r.amount_cents > ? FROM refund_requests r WHERE r.id = approval_requests.resource_id),
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE resource_type = 'refund' AND policy_key = 'refunds' AND policy_version = 1 AND status = 'pending'`,
          args: [COMPLIANCE_SIGNOFF_ABOVE_CENTS],
        });
        await tx.execute("DELETE FROM audit_context");
        await tx.execute("INSERT INTO schema_migrations VALUES (4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))");
      }
      await systemContext(tx, "workspace_note", "system.seed");
      await tx.execute({ sql: "INSERT INTO workspace_note SELECT 1, ?, NULL, ? WHERE NOT EXISTS (SELECT 1 FROM workspace_note WHERE id = 1)", args: ["A shared starting point for better internal tools. Switch roles to see server-side permissions in action.", new Date().toISOString()] });
      await tx.execute("DELETE FROM audit_context");
      await tx.commit();
    } finally { tx.close(); }
  }

  async users(): Promise<User[]> {
    await this.ready;
    const result = await this.#run(() => this.#client.execute("SELECT id, name, email, role FROM users ORDER BY CASE role WHEN 'agent' THEN 1 WHEN 'reviewer' THEN 2 WHEN 'compliance' THEN 3 ELSE 4 END"));
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
    if (!mutation || !mutation.tables.length || !mutation.tables.every((name) => auditedTables.some((table) => table.table === name))) throw new Error("Unregistered business mutation");
    return this.#run(async () => {
      const tx = await this.#client.transaction("write");
      try {
        const actorRow = await tx.execute({ sql: "SELECT id, name, email, role FROM users WHERE id = ?", args: [actorId] });
        const actor = authorize((actorRow.rows[0] as unknown as User) ?? null, mutation.permission);
        const mutationId = randomUUID();
        await tx.execute({ sql: "INSERT INTO audit_context VALUES (1, ?, ?, ?, ?, ?, ?, ?)", args: [mutationId, actor.id, actor.name, actor.email, actor.role, name, mutation.tables[0]] });
        const result = await mutation.run({
          actor,
          async read(statement) {
            if (!/^\s*SELECT\b/i.test(statement.sql)) throw new Error("Mutation reads must be SELECT statements");
            return (await tx.execute(statement)).rows;
          },
          async write(table, statement) {
            if (!(mutation.tables as readonly string[]).includes(table)) throw new Error("Mutation cannot write an undeclared table");
            await tx.execute({ sql: "UPDATE audit_context SET table_name = ? WHERE id = 1", args: [table] });
            const before = await tx.execute({ sql: "SELECT COUNT(*) AS count FROM audit_log WHERE mutation_id = ?", args: [mutationId] });
            const changed = await tx.execute(statement);
            const after = await tx.execute({ sql: "SELECT COUNT(*) AS count FROM audit_log WHERE mutation_id = ?", args: [mutationId] });
            if (!changed.rowsAffected || Number(after.rows[0].count) - Number(before.rows[0].count) < changed.rowsAffected) throw new Error("Mutation did not produce an audit entry for every changed row");
          },
        }, input);
        const audit = await tx.execute({ sql: "SELECT id FROM audit_log WHERE mutation_id = ?", args: [mutationId] });
        if (!audit.rows.length) throw new Error("Mutation did not produce an audit entry");
        await tx.execute("DELETE FROM audit_context");
        await tx.commit();
        return { mutationId, result };
      } finally { tx.close(); }
    });
  }

  async refunds(): Promise<Refund[]> {
    await this.ready;
    const result = await this.#run(() => this.#client.execute(`
      SELECT r.*, a.requested_by, u.name AS requester_name, a.status, a.required_approvals,
        a.signoff_required, a.approval_count, a.created_at, a.updated_at,
        (SELECT json_group_array(json_object('reviewerId', d.reviewer_id, 'reviewerName', reviewer.name,
          'decision', d.decision, 'capacity', d.capacity, 'decidedAt', d.decided_at))
         FROM approval_decisions d JOIN users reviewer ON reviewer.id = d.reviewer_id
         WHERE d.approval_id = a.id) AS decisions_json
      FROM refund_requests r JOIN approval_requests a ON a.id = r.approval_id
      JOIN users u ON u.id = a.requested_by
      WHERE a.resource_type = 'refund' AND a.resource_id = r.id
      ORDER BY a.created_at DESC, r.id DESC`));
    return result.rows.map((row) => ({
      id: String(row.id), customer: String(row.customer), amountCents: Number(row.amount_cents), reason: String(row.reason),
      requestedBy: String(row.requested_by), requesterName: String(row.requester_name), status: row.status as Refund["status"],
      approvalCount: Number(row.approval_count), requiredApprovals: Number(row.required_approvals), signoffRequired: Number(row.signoff_required) === 1,
      createdAt: String(row.created_at), updatedAt: String(row.updated_at), decisions: JSON.parse(String(row.decisions_json)),
    }));
  }

  async kycCases(): Promise<KycCase[]> {
    await this.ready;
    const result = await this.#run(() => this.#client.execute(`
      SELECT k.*, a.requested_by, a.status, a.required_approvals, a.approval_count, a.created_at,
        u.name AS assignee_name,
        (SELECT json_group_array(json_object('id', e.id, 'actorId', e.actor_id, 'actorName', e.actor_name,
          'actorRole', e.actor_role, 'action', e.action, 'note', e.note, 'occurredAt', e.occurred_at))
          FROM (SELECT * FROM kyc_events WHERE case_id = k.id ORDER BY id) e) AS history_json
      FROM kyc_cases k JOIN approval_requests a ON a.id = k.approval_id
      LEFT JOIN users u ON u.id = k.assigned_to
      WHERE a.resource_type = 'kyc' AND a.resource_id = k.id
      ORDER BY a.created_at DESC, k.id DESC`));
    return result.rows.map((row) => ({
      id: String(row.id), customer: String(row.customer), country: String(row.country),
      documentType: row.document_type as KycCase["documentType"], riskScore: Number(row.risk_score),
      requestedBy: String(row.requested_by), status: row.status as KycCase["status"],
      approvalCount: Number(row.approval_count), requiredApprovals: Number(row.required_approvals),
      assignedTo: row.assigned_to === null ? null : String(row.assigned_to),
      assigneeName: row.assignee_name === null ? null : String(row.assignee_name), escalated: !!row.escalated,
      createdAt: String(row.created_at), history: JSON.parse(String(row.history_json)),
    }));
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

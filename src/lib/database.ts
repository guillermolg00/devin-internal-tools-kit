import "server-only";
import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import type { User } from "./permissions";

export const SESSION_SECONDS = 60 * 60 * 8;
export const demoUsers: User[] = [
  { id: "user-agent", name: "Alex Morgan", email: "alex@example.test", role: "agent" },
  { id: "user-reviewer", name: "Sam Rivera", email: "sam@example.test", role: "reviewer" },
  { id: "user-admin", name: "Jordan Lee", email: "jordan@example.test", role: "admin" },
];

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export class Store {
  readonly client: Client;
  private ready: Promise<void>;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
    this.client = createClient({ url: path === ":memory:" ? path : `file:${resolve(path)}` });
    this.ready = this.initialize();
  }

  private async initialize() {
    await this.client.execute("PRAGMA foreign_keys = ON");
    await this.client.execute("PRAGMA busy_timeout = 5000");
    await this.client.batch([
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
      { sql: "INSERT OR IGNORE INTO workspace_note VALUES (1, ?, NULL, ?)", args: ["A shared starting point for better internal tools. Switch roles to see server-side permissions in action.", new Date().toISOString()] },
    ], "write");
  }

  async users(): Promise<User[]> {
    await this.ready;
    const result = await this.client.execute("SELECT id, name, email, role FROM users ORDER BY CASE role WHEN 'agent' THEN 1 WHEN 'reviewer' THEN 2 ELSE 3 END");
    return result.rows as unknown as User[];
  }

  async createSession(userId: string, previousToken?: string): Promise<string | null> {
    await this.ready;
    if (!(await this.users()).some((user) => user.id === userId)) return null;
    const token = randomBytes(32).toString("hex");
    await this.client.batch([
      { sql: "DELETE FROM sessions WHERE expires_at <= ?", args: [Date.now()] },
      ...(previousToken ? [{ sql: "DELETE FROM sessions WHERE token_hash = ?", args: [hashToken(previousToken)] }] : []),
      { sql: "INSERT INTO sessions VALUES (?, ?, ?)", args: [hashToken(token), userId, Date.now() + SESSION_SECONDS * 1000] },
    ], "write");
    return token;
  }

  async sessionUser(token?: string): Promise<User | null> {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    await this.ready;
    const result = await this.client.execute({
      sql: "SELECT users.id, name, email, role FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?",
      args: [hashToken(token), Date.now()],
    });
    return (result.rows[0] as unknown as User) ?? null;
  }

  async deleteSession(token?: string) {
    await this.ready;
    if (token) await this.client.execute({ sql: "DELETE FROM sessions WHERE token_hash = ?", args: [hashToken(token)] });
  }

  async note() {
    await this.ready;
    const result = await this.client.execute("SELECT content, updated_at AS updatedAt, users.name AS updatedBy FROM workspace_note LEFT JOIN users ON users.id = workspace_note.updated_by WHERE workspace_note.id = 1");
    return result.rows[0] as unknown as { content: string; updatedAt: string; updatedBy: string | null };
  }

  async updateNote(content: string, userId: string) {
    await this.ready;
    await this.client.execute({ sql: "UPDATE workspace_note SET content = ?, updated_by = ?, updated_at = ? WHERE id = 1", args: [content, userId, new Date().toISOString()] });
    return this.note();
  }
}

const globalStore = globalThis as unknown as { toolsStore?: Store };
export function getStore() {
  return globalStore.toolsStore ??= new Store(process.env.DATABASE_PATH || "./data/internal-tools.db");
}

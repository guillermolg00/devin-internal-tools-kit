import "server-only";
import type { Transaction } from "@libsql/client";
import { randomUUID } from "node:crypto";

export type AuditedTable = { table: string; columns: readonly string[] };

export const auditedTables: readonly AuditedTable[] = [
  { table: "workspace_note", columns: ["id", "content", "updated_by", "updated_at"] },
];

const internalTables = new Set(["users", "sessions", "schema_migrations", "audit_log", "audit_context", "audited_tables"]);
const identifier = (value: string) => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw new Error(`Invalid SQL identifier: ${value}`);
  return `"${value}"`;
};
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

export async function systemContext(tx: Transaction, table: string, action: string) {
  await tx.execute({
    sql: "INSERT INTO audit_context (id, mutation_id, actor_id, actor_name, actor_email, actor_role, action, table_name) VALUES (1, ?, 'system', 'System', NULL, 'system', ?, ?)",
    args: [randomUUID(), action, table],
  });
}

export async function installAuditing(tx: Transaction, definitions: readonly AuditedTable[] = auditedTables) {
  await tx.executeMultiple(`
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_context (
      id INTEGER PRIMARY KEY CHECK (id = 1), mutation_id TEXT NOT NULL,
      actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, actor_email TEXT,
      actor_role TEXT NOT NULL, action TEXT NOT NULL, table_name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audited_tables (table_name TEXT PRIMARY KEY, columns_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mutation_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, actor_email TEXT, actor_role TEXT NOT NULL,
      action TEXT NOT NULL, table_name TEXT NOT NULL, record_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete', 'baseline')),
      before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
      after_json TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
      CHECK (before_json IS NOT NULL OR after_json IS NOT NULL)
    );
    CREATE INDEX IF NOT EXISTS audit_log_mutation ON audit_log(mutation_id);
    CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
      BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
      BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS audit_log_insert_guard BEFORE INSERT ON audit_log BEGIN
      SELECT RAISE(ABORT, 'audit_log is append-only') WHERE EXISTS (SELECT 1 FROM audit_log WHERE id = NEW.id);
      SELECT RAISE(ABORT, 'audit insert requires mutation context') WHERE NOT EXISTS (
        SELECT 1 FROM audit_context WHERE id = 1 AND mutation_id = NEW.mutation_id
          AND actor_id = NEW.actor_id AND actor_name = NEW.actor_name
          AND actor_email IS NEW.actor_email AND actor_role = NEW.actor_role
          AND action = NEW.action AND table_name = NEW.table_name
      );
    END;
  `);

  if (new Set(definitions.map((definition) => definition.table)).size !== definitions.length) throw new Error("Duplicate audited table declaration");
  const tables = await tx.execute("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
  for (const row of tables.rows) {
    if (!internalTables.has(String(row.name)) && !definitions.some((definition) => definition.table === row.name)) {
      throw new Error(`Business table ${row.name} needs an auditedTables declaration`);
    }
  }
  const prior = await tx.execute("SELECT table_name FROM audited_tables");
  for (const row of prior.rows) {
    if (!definitions.some((definition) => definition.table === row.table_name)) throw new Error(`Cannot remove audited table declaration: ${row.table_name}`);
  }
  for (const definition of definitions) await installTable(tx, definition);
  await tx.execute("INSERT OR IGNORE INTO schema_migrations VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))");
}

async function installTable(tx: Transaction, { table, columns }: AuditedTable) {
  const tableId = identifier(table);
  if (internalTables.has(table)) throw new Error(`Cannot register internal table ${table}`);
  const schema = await tx.execute(`PRAGMA table_info(${tableId})`);
  const keys = schema.rows.filter((row) => Number(row.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk)).map((row) => String(row.name));
  if (!keys.length) throw new Error(`Audited table ${table} needs an explicit primary key`);
  if (!columns.length || new Set(columns).size !== columns.length) throw new Error(`Invalid snapshot columns for ${table}`);
  for (const column of columns) {
    identifier(column);
    if (!schema.rows.some((row) => row.name === column)) throw new Error(`Unknown snapshot column ${table}.${column}`);
  }
  const snapshot = (prefix: string) => `json_object(${columns.flatMap((column) => [literal(column), `${prefix}.${identifier(column)}`]).join(", ")})`;
  const recordId = (prefix: string) => keys.length === 1 ? `CAST(${prefix}.${identifier(keys[0])} AS TEXT)` : `json_object(${keys.flatMap((key) => [literal(key), `${prefix}.${identifier(key)}`]).join(", ")})`;
  const matchKey = keys.map((key) => `${identifier(key)} IS NEW.${identifier(key)}`).join(" AND ");

  for (const operation of ["insert", "update", "delete"] as const) {
    const prefix = operation === "delete" ? "OLD" : "NEW";
    const guard = identifier(`audit_${table}_${operation}_guard`);
    const log = identifier(`audit_${table}_${operation}_log`);
    await tx.execute(`DROP TRIGGER IF EXISTS ${guard}`);
    await tx.execute(`DROP TRIGGER IF EXISTS ${log}`);
    await tx.execute(`CREATE TRIGGER ${guard} BEFORE ${operation.toUpperCase()} ON ${tableId} BEGIN
      SELECT RAISE(ABORT, 'business writes require mutation context') WHERE NOT EXISTS (SELECT 1 FROM audit_context WHERE id = 1 AND table_name = ${literal(table)});
      ${operation === "insert" ? `SELECT RAISE(ABORT, 'audited primary keys must not be null') WHERE ${keys.map((key) => `NEW.${identifier(key)} IS NULL`).join(" OR ")};` : ""}
      ${operation === "insert" ? `SELECT RAISE(ABORT, 'replace is not an audited insert') WHERE EXISTS (SELECT 1 FROM ${tableId} WHERE ${matchKey});` : ""}
      ${operation === "update" ? `SELECT RAISE(ABORT, 'audited primary keys are immutable') WHERE ${keys.map((key) => `OLD.${identifier(key)} IS NOT NEW.${identifier(key)}`).join(" OR ")};` : ""}
    END`);
    await tx.execute(`CREATE TRIGGER ${log} AFTER ${operation.toUpperCase()} ON ${tableId} BEGIN
      INSERT INTO audit_log (mutation_id, actor_id, actor_name, actor_email, actor_role, action, table_name, record_id, operation, before_json, after_json)
      SELECT mutation_id, actor_id, actor_name, actor_email, actor_role, action, table_name, ${recordId(prefix)}, ${literal(operation)},
        ${operation === "insert" ? "NULL" : snapshot("OLD")}, ${operation === "delete" ? "NULL" : snapshot("NEW")}
      FROM audit_context WHERE id = 1;
    END`);
  }

  const registered = await tx.execute({ sql: "SELECT table_name FROM audited_tables WHERE table_name = ?", args: [table] });
  if (!registered.rows.length) {
    await systemContext(tx, table, "system.baseline");
    await tx.execute(`INSERT INTO audit_log (mutation_id, actor_id, actor_name, actor_email, actor_role, action, table_name, record_id, operation, before_json, after_json)
      SELECT c.mutation_id, c.actor_id, c.actor_name, c.actor_email, c.actor_role, c.action, c.table_name, ${recordId("existing")}, 'baseline', NULL, ${snapshot("existing")}
      FROM ${tableId} AS existing CROSS JOIN audit_context AS c WHERE c.id = 1`);
    await tx.execute("DELETE FROM audit_context");
  }
  await tx.execute({ sql: "INSERT INTO audited_tables VALUES (?, ?) ON CONFLICT(table_name) DO UPDATE SET columns_json = excluded.columns_json", args: [table, JSON.stringify(columns)] });
}

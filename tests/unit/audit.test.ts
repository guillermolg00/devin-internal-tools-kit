import { afterEach, describe, expect, test } from "bun:test";
import { fixture } from "../fixture";
import { Store } from "../../src/lib/database";
import { auditedTables, installAuditing, systemContext } from "../../src/lib/audit-schema";
import { auditCursor } from "../../src/lib/audit";

const fixtures: Awaited<ReturnType<typeof fixture>>[] = [];
async function database(setup?: Parameters<typeof fixture>[0]) { const db = await fixture(setup); fixtures.push(db); return db; }
afterEach(() => { for (const db of fixtures.splice(0)) db.close(); });

describe("atomic, append-only business audit", () => {
  test("records exact before/after, server-resolved actor snapshot, action, and UTC time", async () => {
    const { store, raw } = await database();
    const before = await store.note();
    await store.mutate("workspace.note.update", "user-reviewer", { content: "  Reviewed note  ", actorId: "user-admin", role: "admin" });
    const entry = (await store.auditEntries()).entries[0];
    expect(entry).toMatchObject({ action: "workspace.note.update", table: "workspace_note", recordId: "1", operation: "update", actor: { id: "user-reviewer", name: "Sam Rivera", email: "sam@example.test", role: "reviewer" } });
    expect(entry.before).toEqual({ id: 1, content: before.content, updated_by: null, updated_at: before.updatedAt });
    expect(entry.after).toEqual({ id: 1, content: "Reviewed note", updated_by: "user-reviewer", updated_at: (await store.note()).updatedAt });
    expect(entry.occurredAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    await raw.execute("UPDATE users SET name = 'Renamed', role = 'agent' WHERE id = 'user-reviewer'");
    expect((await store.auditEntries()).entries[0].actor.name).toBe("Sam Rivera");
    expect((await raw.execute("SELECT * FROM audit_context")).rows.length).toBe(0);
  });

  test("direct business INSERT, UPDATE, DELETE, and REPLACE fail without context", async () => {
    const { store, raw } = await database();
    for (const sql of [
      "UPDATE workspace_note SET content = 'bypass' WHERE id = 1",
      "DELETE FROM workspace_note WHERE id = 1",
      "INSERT INTO workspace_note VALUES (2, 'bypass', NULL, 'now')",
      "INSERT OR REPLACE INTO workspace_note VALUES (1, 'bypass', NULL, 'now')",
    ]) await expect(raw.execute(sql)).rejects.toThrow("require mutation context");
    expect((await store.note()).content).toContain("shared starting point");
    expect((await store.auditEntries()).entries.length).toBe(1);
  });

  test("audit rows reject UPDATE, DELETE, UPSERT, and REPLACE with recursive triggers disabled", async () => {
    const { store, raw } = await database();
    await raw.execute("PRAGMA recursive_triggers = OFF");
    const before = await store.auditEntries();
    for (const sql of [
      "UPDATE audit_log SET actor_name = 'Forged'", "DELETE FROM audit_log",
      "INSERT OR REPLACE INTO audit_log SELECT * FROM audit_log WHERE id = 1",
      "REPLACE INTO audit_log SELECT * FROM audit_log WHERE id = 1",
      "INSERT INTO audit_log SELECT * FROM audit_log WHERE id = 1 ON CONFLICT(id) DO UPDATE SET actor_name = 'Forged'",
    ]) await expect(raw.execute(sql)).rejects.toThrow("append-only");
    expect(await store.auditEntries()).toEqual(before);
    await expect(raw.execute("INSERT INTO audit_log (mutation_id, actor_id, actor_name, actor_role, action, table_name, record_id, operation, after_json) VALUES ('fake', 'admin', 'Fake', 'admin', 'fake', 'workspace_note', '1', 'insert', '{}')")).rejects.toThrow("requires mutation context");
  });

  test("audit insertion failure rolls back the note and context; subsequent writes work", async () => {
    const { store, raw } = await database();
    const before = await store.note();
    await raw.execute("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log WHEN NEW.operation = 'update' BEGIN SELECT RAISE(ABORT, 'audit storage unavailable'); END");
    await expect(store.mutate("workspace.note.update", "user-admin", { content: "Must roll back" })).rejects.toThrow("audit storage unavailable");
    expect(await store.note()).toEqual(before);
    expect((await store.auditEntries()).entries.length).toBe(1);
    expect((await raw.execute("SELECT * FROM audit_context")).rows).toEqual([]);
    await raw.execute("DROP TRIGGER fail_audit");
    await store.mutate("workspace.note.update", "user-admin", { content: "Recovered" });
    expect((await store.auditEntries()).entries.length).toBe(2);
  });

  test("a missing audit trigger fails closed and rolls back an otherwise successful mutation", async () => {
    const { store, raw } = await database();
    const before = await store.note();
    await raw.execute("DROP TRIGGER audit_workspace_note_update_log");
    await expect(store.mutate("workspace.note.update", "user-admin", { content: "Unaudited" })).rejects.toThrow("did not produce an audit");
    expect(await store.note()).toEqual(before);
  });

  test("failed validation and authorization produce neither changes nor audit entries", async () => {
    const { store, raw } = await database();
    const before = await store.note();
    await expect(store.mutate("workspace.note.update", "user-agent", { content: "Denied" })).rejects.toThrow("permission");
    await expect(store.mutate("workspace.note.update", "missing-user", { content: "Denied" })).rejects.toThrow("Choose a demo user");
    await expect(store.mutate("workspace.note.update", "user-admin", { content: " " })).rejects.toThrow("between 1");
    await raw.execute("UPDATE users SET role = 'agent' WHERE id = 'user-reviewer'");
    await expect(store.mutate("workspace.note.update", "user-reviewer", { content: "Denied after demotion" })).rejects.toThrow("permission");
    expect(await store.note()).toEqual(before);
    expect((await store.auditEntries()).entries.length).toBe(1);
  });

  test("business failure after a triggered audit insert rolls back both", async () => {
    const { store, raw } = await database();
    const before = await store.note();
    const tx = await raw.transaction("write");
    try {
      await systemContext(tx, "workspace_note", "test.rollback");
      await tx.execute("UPDATE workspace_note SET content = 'Uncommitted' WHERE id = 1");
      expect((await tx.execute("SELECT * FROM audit_log")).rows.length).toBe(2);
      await expect(tx.execute("INSERT INTO workspace_note VALUES (2, 'invalid id', NULL, 'now')")).rejects.toThrow();
    } finally { tx.close(); }
    expect(await store.note()).toEqual(before);
    expect((await store.auditEntries()).entries.length).toBe(1);
  });

  test("migrates an existing note once as a baseline without inventing history", async () => {
    const { store, path } = await database(async (raw) => {
      await raw.execute("CREATE TABLE workspace_note (id INTEGER PRIMARY KEY CHECK (id = 1), content TEXT NOT NULL, updated_by TEXT, updated_at TEXT NOT NULL)");
      await raw.execute("INSERT INTO workspace_note VALUES (1, 'Existing note', NULL, '2026-01-01T00:00:00.000Z')");
    });
    expect((await store.note()).content).toBe("Existing note");
    expect((await store.auditEntries()).entries[0]).toMatchObject({ operation: "baseline", action: "system.baseline", actor: { id: "system" }, before: null, after: { content: "Existing note" } });
    store.close();
    const reopened = new Store(path);
    try { expect((await reopened.auditEntries()).entries.length).toBe(1); }
    finally { reopened.close(); }
  });

  test("pagination uses stable descending IDs without duplicate entries", async () => {
    const { store } = await database();
    for (let i = 0; i < 22; i++) await store.mutate("workspace.note.update", "user-admin", { content: `Version ${i}` });
    const first = await store.auditEntries();
    expect(first.entries.length).toBe(20);
    const second = await store.auditEntries(first.nextCursor!);
    expect(second.entries.length).toBe(3);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.entries, ...second.entries].map((entry) => entry.id)).size).toBe(23);
  });

  test("concurrent mutations keep each actor and before/after chain distinct", async () => {
    const { store } = await database();
    const [, , token] = await Promise.all([
      store.mutate("workspace.note.update", "user-reviewer", { content: "Reviewer version" }),
      store.mutate("workspace.note.update", "user-admin", { content: "Admin version" }),
      store.createSession("user-admin"),
      store.note(),
      store.auditEntries(),
    ]);
    expect((await store.sessionUser(token!))?.id).toBe("user-admin");
    const changes = (await store.auditEntries()).entries.filter((entry) => entry.operation === "update");
    expect(changes.length).toBe(2);
    expect(changes[0].before).toEqual(changes[1].after);
    expect(new Set(changes.map((entry) => entry.actor.id)).size).toBe(2);
    expect(new Set(changes.map((entry) => entry.mutationId)).size).toBe(2);
  });

  test("a second table needs only table/columns to generate all three operations and composite IDs", async () => {
    const { raw } = await database();
    const tx = await raw.transaction("write");
    try {
      await tx.execute("CREATE TABLE review_items (tenant TEXT, id INTEGER, value TEXT, ignored TEXT, PRIMARY KEY(tenant, id))");
      await installAuditing(tx, [...auditedTables, { table: "review_items", columns: ["value"] }]);
      await systemContext(tx, "review_items", "test.review_items");
      await tx.execute("INSERT INTO review_items VALUES ('one', 7, 'Before', 'not snapshotted')");
      await tx.execute("UPDATE review_items SET value = 'After' WHERE tenant = 'one' AND id = 7");
      await tx.execute("DELETE FROM review_items WHERE tenant = 'one' AND id = 7");
      await tx.execute("DELETE FROM audit_context");
      await tx.commit();
    } finally { tx.close(); }
    const entries = await raw.execute("SELECT * FROM audit_log WHERE table_name = 'review_items' ORDER BY id");
    expect(entries.rows.map((row) => row.operation)).toEqual(["insert", "update", "delete"]);
    expect(JSON.parse(String(entries.rows[0].record_id))).toEqual({ tenant: "one", id: 7 });
    expect(JSON.parse(String(entries.rows[1].before_json))).toEqual({ value: "Before" });
    expect(JSON.parse(String(entries.rows[1].after_json))).toEqual({ value: "After" });
    expect(entries.rows[2].after_json).toBeNull();
    await expect(raw.execute("INSERT INTO review_items VALUES ('one', 8, 'Bypass', NULL)")).rejects.toThrow("require mutation context");
  });

  test("an undeclared business table fails initialization instead of silently opting out", async () => {
    const { store, raw, path } = await database();
    await raw.execute("CREATE TABLE forgotten_tool (id INTEGER PRIMARY KEY, value TEXT)");
    store.close();
    const reopened = new Store(path);
    try { await expect(reopened.users()).rejects.toThrow("needs an auditedTables declaration"); }
    finally { reopened.close(); }
  });

  test("session bookkeeping does not place credentials into the business audit", async () => {
    const { store } = await database();
    const before = await store.auditEntries();
    const token = (await store.createSession("user-admin"))!;
    await store.deleteSession(token);
    expect(await store.auditEntries()).toEqual(before);
    expect(JSON.stringify(before)).not.toContain(token);
  });

  test("audit cursors reject invalid and unsafe integers", () => {
    expect(auditCursor(undefined)).toBeUndefined();
    expect(auditCursor("21")).toBe(21);
    for (const value of ["", "0", "-1", "1.5", "1e2", "01", "9007199254740992", "abc"]) expect(() => auditCursor(value)).toThrow();
  });
});

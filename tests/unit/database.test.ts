import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { Store } from "../../src/lib/database";
import { fixture } from "../fixture";

const fixtures: Awaited<ReturnType<typeof fixture>>[] = [];
async function database() { const db = await fixture(); fixtures.push(db); return db; }
afterEach(() => { for (const db of fixtures.splice(0)) db.close(); });

describe("SQLite and sessions", () => {
  test("seeds three roles and a workspace note", async () => {
    const { store } = await database();
    expect((await store.users()).map((user) => user.role)).toEqual(["agent", "reviewer", "admin"]);
    expect((await store.note()).content).toContain("shared starting point");
    expect("client" in store).toBe(false);
  });

  test("session tokens are opaque, hashed at rest, and rotated", async () => {
    const { store, raw } = await database();
    const token = (await store.createSession("user-agent"))!;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect((await store.sessionUser(token))?.role).toBe("agent");
    const stored = await raw.execute("SELECT token_hash FROM sessions");
    expect(stored.rows[0].token_hash).not.toBe(token);
    const next = (await store.createSession("user-admin", token))!;
    expect(await store.sessionUser(token)).toBeNull();
    expect((await store.sessionUser(next))?.role).toBe("admin");
    await store.deleteSession(next);
    expect(await store.sessionUser(next)).toBeNull();
  });

  test("invalid, forged, unknown, and expired sessions are rejected", async () => {
    const { store, raw } = await database();
    expect(await store.createSession("missing-user")).toBeNull();
    for (const token of [undefined, "admin", "user-admin", "a".repeat(64)]) expect(await store.sessionUser(token)).toBeNull();
    const token = (await store.createSession("user-agent"))!;
    await raw.execute({ sql: "UPDATE sessions SET expires_at = ? WHERE token_hash = ?", args: [Date.now() - 1, createHash("sha256").update(token).digest("hex")] });
    expect(await store.sessionUser(token)).toBeNull();
  });

  test("roles come from current database state, not a cached token", async () => {
    const { store, raw } = await database();
    const token = (await store.createSession("user-admin"))!;
    await raw.execute("UPDATE users SET role = 'agent' WHERE id = 'user-admin'");
    expect((await store.sessionUser(token))?.role).toBe("agent");
  });

  test("setup is idempotent and notes survive a database reopen", async () => {
    const { store, path } = await database();
    await store.mutate("workspace.note.update", "user-reviewer", { content: "Persist this note" });
    store.close();
    const reopened = new Store(path);
    try {
      expect((await reopened.users()).length).toBe(3);
      expect(await reopened.note()).toMatchObject({ content: "Persist this note", updatedBy: "Sam Rivera" });
      expect((await reopened.auditEntries()).entries.length).toBe(2);
    } finally { reopened.close(); }
  });
});

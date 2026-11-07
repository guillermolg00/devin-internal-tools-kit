import { afterEach, describe, expect, test } from "bun:test";
import { fixture } from "../fixture";
import { Store } from "../../src/lib/database";
import { parseUSDCents } from "../../src/lib/refunds";
import { formatUSD } from "../../src/lib/refund-types";

const fixtures: Awaited<ReturnType<typeof fixture>>[] = [];
async function database() { const db = await fixture(); fixtures.push(db); return db; }
afterEach(() => { for (const db of fixtures.splice(0)) db.close(); });
async function create(store: Store, amount = "500.01", extra = {}) {
  const result = await store.mutate("refunds.create", "user-agent", { customer: "Customer 42", amount, reason: "Duplicate charge", ...extra });
  return { id: (result.result as { id: string }).id, mutationId: result.mutationId };
}
const review = (store: Store, id: string, reviewer = "user-reviewer", decision = "approve") => store.mutate("refunds.review", reviewer, { id, decision });
const signOff = (store: Store, id: string, actor = "user-compliance", decision = "approve") => store.mutate("refunds.signoff", actor, { id, decision });
const find = async (store: Store, id: string) => (await store.refunds()).find((row) => row.id === id)!;
const addUser = (raw: Awaited<ReturnType<typeof fixture>>["raw"], id: string, role: string) => raw.execute({ sql: "INSERT INTO users VALUES (?, ?, ?, ?)", args: [id, id, `${id}@example.test`, role] });

describe("refund requests using shared approvals and atomic auditing", () => {
  test("USD parsing never uses floating-point rounding", () => {
    for (const [value, cents] of [["0.01", 1], ["0.29", 29], ["500", 50000], ["500.00", 50000], ["500.01", 50001], ["90071992547409.91", Number.MAX_SAFE_INTEGER]] as const) expect(parseUSDCents(value)).toBe(cents);
    for (const value of [null, undefined, 1.01, NaN, Infinity, "", "0", "-1", "01", "1.001", "1e3", "1,000", "90071992547409.92"]) expect(() => parseUSDCents(value)).toThrow();
    expect(formatUSD(Number.MAX_SAFE_INTEGER)).toBe("$90,071,992,547,409.91");
  });

  test("creation freezes server-calculated policy and actor, with two audited rows in one mutation", async () => {
    const { store, raw } = await database();
    const created = await create(store, "500.01", { requestedBy: "user-admin", approvalCount: 2, requiredApprovals: 1, status: "approved" });
    expect((await store.refunds())[0]).toMatchObject({ id: created.id, requestedBy: "user-agent", amountCents: 50001, requiredApprovals: 2, approvalCount: 0, status: "pending", decisions: [] });
    const entries = (await store.auditEntries()).entries.filter((entry) => entry.mutationId === created.mutationId);
    expect(entries.length).toBe(2);
    expect(new Set(entries.map((entry) => entry.table))).toEqual(new Set(["approval_requests", "refund_requests"]));
    expect(entries.every((entry) => entry.actor.id === "user-agent" && entry.before === null)).toBe(true);
    expect((await raw.execute("SELECT * FROM audit_context")).rows).toEqual([]);
  });

  test("$500 needs one approval, $500.01 needs two distinct reviewers", async () => {
    const { store } = await database();
    const low = await create(store, "500.00");
    await review(store, low.id);
    expect((await store.refunds()).find((row) => row.id === low.id)).toMatchObject({ status: "approved", requiredApprovals: 1, approvalCount: 1 });
    const high = await create(store);
    await review(store, high.id);
    expect((await store.refunds()).find((row) => row.id === high.id)).toMatchObject({ status: "pending", requiredApprovals: 2, approvalCount: 1 });
    await expect(review(store, high.id)).rejects.toThrow("already reviewed");
    await expect(review(store, high.id, "user-reviewer", "reject")).rejects.toThrow("already reviewed");
    await review(store, high.id, "user-reviewer-2");
    const final = (await store.refunds()).find((row) => row.id === high.id)!;
    expect(final).toMatchObject({ status: "approved", approvalCount: 2 });
    expect(new Set(final.decisions.map((decision) => decision.reviewerId)).size).toBe(2);
  });

  test("rejection is immediately terminal, including after one high-value approval", async () => {
    const { store } = await database();
    for (const partial of [false, true]) {
      const { id } = await create(store);
      if (partial) await review(store, id);
      await review(store, id, "user-reviewer-2", "reject");
      const before = (await store.refunds()).find((row) => row.id === id);
      const history = await store.auditEntries();
      expect(before).toMatchObject({ status: "rejected", approvalCount: partial ? 1 : 0 });
      await expect(review(store, id)).rejects.toThrow("final");
      await expect(review(store, id, "user-reviewer", "reject")).rejects.toThrow("final");
      expect((await store.refunds()).find((row) => row.id === id)).toEqual(before);
      expect(await store.auditEntries()).toEqual(history);
    }
  });

  test("fully approved requests reject further approvals and rejection without audit noise", async () => {
    const { store } = await database();
    const { id } = await create(store, "25.00");
    await review(store, id);
    const before = await store.refunds();
    const history = await store.auditEntries();
    await expect(review(store, id, "user-reviewer-2")).rejects.toThrow("final");
    await expect(review(store, id, "user-reviewer-2", "reject")).rejects.toThrow("final");
    expect(await store.refunds()).toEqual(before);
    expect(await store.auditEntries()).toEqual(history);
  });

  test("a creator promoted to reviewer still cannot approve or reject their own request", async () => {
    const { store, raw } = await database();
    const { id } = await create(store);
    await raw.execute("UPDATE users SET role = 'reviewer' WHERE id = 'user-agent'");
    for (const decision of ["approve", "reject"]) await expect(review(store, id, "user-agent", decision)).rejects.toThrow("own request");
    expect((await store.refunds())[0]).toMatchObject({ status: "pending", approvalCount: 0, decisions: [] });
  });

  test("permissions are checked again in the transaction with no admin override", async () => {
    const { store, raw } = await database();
    const { id } = await create(store);
    for (const actor of ["user-agent", "user-admin", "missing-user"]) await expect(review(store, id, actor)).rejects.toThrow();
    for (const actor of ["user-reviewer", "user-admin"]) await expect(store.mutate("refunds.create", actor, { customer: "Other", amount: "1", reason: "No" })).rejects.toThrow("permission");
    await raw.execute("UPDATE users SET role = 'agent' WHERE id = 'user-reviewer'");
    await expect(review(store, id)).rejects.toThrow("permission");
    expect((await store.auditEntries()).entries.length).toBe(3);
  });

  test("invalid submissions, decisions, and missing IDs produce no business changes", async () => {
    const { store } = await database();
    for (const extra of [{ customer: " " }, { customer: "x".repeat(201) }, { reason: "" }, { reason: "x".repeat(1001) }, { amount: "0" }, { amount: 10.01 }]) await expect(create(store, "20", extra)).rejects.toThrow();
    expect(await store.refunds()).toEqual([]);
    const { id } = await create(store);
    await expect(review(store, id, "user-reviewer", "reset")).rejects.toThrow("approve or reject");
    await expect(review(store, "missing")).rejects.toThrow("valid refund ID");
    await expect(review(store, "00000000-0000-4000-8000-000000000000")).rejects.toThrow("not found");
    expect((await store.auditEntries()).entries.length).toBe(3);
  });

  test("simultaneous distinct reviewers reach quorum exactly once and audit a continuous state chain", async () => {
    const { store } = await database();
    const { id } = await create(store);
    await Promise.all([review(store, id), review(store, id, "user-reviewer-2")]);
    expect((await store.refunds())[0]).toMatchObject({ status: "approved", approvalCount: 2 });
    const changes = (await store.auditEntries()).entries.filter((entry) => entry.table === "approval_requests" && entry.operation === "update");
    expect(changes.length).toBe(2);
    expect(changes[0].before).toEqual(changes[1].after);
    expect(changes[0].after).toMatchObject({ status: "approved", approval_count: 2 });
    expect(changes[1].after).toMatchObject({ status: "pending", approval_count: 1 });
  });

  test("simultaneous duplicate reviews and competing terminal decisions have one winner", async () => {
    const { store } = await database();
    const { id } = await create(store);
    const duplicate = await Promise.allSettled([review(store, id), review(store, id)]);
    expect(duplicate.filter((result) => result.status === "fulfilled").length).toBe(1);
    expect((await store.refunds())[0]).toMatchObject({ status: "pending", approvalCount: 1 });
    const low = await create(store, "1");
    const terminal = await Promise.allSettled([review(store, low.id), review(store, low.id, "user-reviewer-2", "reject")]);
    expect(terminal.filter((result) => result.status === "fulfilled").length).toBe(1);
    expect((await store.refunds()).find((row) => row.id === low.id)?.decisions.length).toBe(1);
  });

  test("a later business or audit failure rolls back an entire multi-table creation", async () => {
    const { store, raw } = await database();
    for (const trigger of [
      "CREATE TRIGGER fail_create BEFORE INSERT ON refund_requests BEGIN SELECT RAISE(ABORT, 'business unavailable'); END",
      "CREATE TRIGGER fail_create BEFORE INSERT ON audit_log WHEN NEW.table_name = 'refund_requests' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END",
    ]) {
      await raw.execute(trigger);
      await expect(create(store)).rejects.toThrow("unavailable");
      expect(await store.refunds()).toEqual([]);
      expect((await raw.execute("SELECT * FROM approval_requests")).rows).toEqual([]);
      expect((await store.auditEntries()).entries.length).toBe(1);
      expect((await raw.execute("SELECT * FROM audit_context")).rows).toEqual([]);
      await raw.execute("DROP TRIGGER fail_create");
    }
  });

  test("an audit failure or missing state trigger rolls back the decision and its audit too", async () => {
    const { store, raw } = await database();
    const { id } = await create(store);
    await raw.execute("CREATE TRIGGER fail_review BEFORE INSERT ON audit_log WHEN NEW.table_name = 'approval_requests' AND NEW.operation = 'update' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END");
    await expect(review(store, id)).rejects.toThrow("audit unavailable");
    await raw.execute("DROP TRIGGER fail_review");
    await raw.execute("DROP TRIGGER audit_approval_requests_update_log");
    await expect(review(store, id)).rejects.toThrow("did not produce an audit");
    expect((await store.refunds())[0]).toMatchObject({ status: "pending", approvalCount: 0, decisions: [] });
    expect((await raw.execute("SELECT * FROM approval_decisions")).rows).toEqual([]);
    expect((await store.auditEntries()).entries.length).toBe(3);
  });

  test("direct edits/deletes fail and pending decisions survive a reopen without duplicate seeding", async () => {
    const { store, raw, path } = await database();
    const { id } = await create(store);
    await review(store, id);
    for (const sql of ["UPDATE refund_requests SET amount_cents = 1", "DELETE FROM refund_requests", "UPDATE approval_requests SET status = 'approved'", "DELETE FROM approval_decisions", "UPDATE approval_decisions SET decision = 'reject'"]) await expect(raw.execute(sql)).rejects.toThrow("require mutation context");
    const before = await store.refunds();
    store.close();
    const reopened = new Store(path);
    try {
      expect(await reopened.refunds()).toEqual(before);
      expect((await reopened.users()).length).toBe(6);
      await review(reopened, id, "user-reviewer-2");
      expect((await reopened.refunds())[0].status).toBe("approved");
    } finally { reopened.close(); }
  });

  test("$5,000.00 needs no sign-off; $5,000.01 needs two reviewers and compliance", async () => {
    const { store, raw } = await database();
    const atLimit = await create(store, "5000.00");
    expect(await find(store, atLimit.id)).toMatchObject({ requiredApprovals: 2, signoffRequired: false });
    await expect(signOff(store, atLimit.id)).rejects.toThrow("does not need a sign-off");
    await review(store, atLimit.id); await review(store, atLimit.id, "user-reviewer-2");
    expect((await find(store, atLimit.id)).status).toBe("approved");
    const high = await create(store, "5000.01");
    expect(await find(store, high.id)).toMatchObject({ requiredApprovals: 2, signoffRequired: true, status: "pending" });
    await review(store, high.id); await review(store, high.id, "user-reviewer-2");
    expect(await find(store, high.id)).toMatchObject({ status: "pending", approvalCount: 2 });
    await addUser(raw, "user-reviewer-3", "reviewer");
    await expect(review(store, high.id, "user-reviewer-3")).rejects.toThrow("waiting for sign-off");
    const signed = await signOff(store, high.id);
    expect(signed.result).toMatchObject({ status: "approved", approvalCount: 2, signedOff: true });
    const final = await find(store, high.id);
    expect(final).toMatchObject({ status: "approved", approvalCount: 2 });
    expect(final.decisions.map((decision) => decision.capacity).sort()).toEqual(["review", "review", "signoff"]);
    const audits = (await store.auditEntries()).entries.filter((entry) => entry.mutationId === signed.mutationId);
    expect(audits.length).toBe(2);
    expect(audits.every((entry) => entry.actor.id === "user-compliance" && entry.actor.role === "compliance" && entry.action === "refunds.signoff")).toBe(true);
    expect(audits.find((entry) => entry.table === "approval_decisions")?.after).toMatchObject({ capacity: "signoff", decision: "approve" });
  });

  test("compliance can sign off before reviewers, but it never replaces a reviewer approval", async () => {
    const { store } = await database();
    const { id } = await create(store, "12000.00");
    await signOff(store, id);
    expect(await find(store, id)).toMatchObject({ status: "pending", approvalCount: 0 });
    await expect(signOff(store, id)).rejects.toThrow("already reviewed");
    await review(store, id);
    expect((await find(store, id)).status).toBe("pending");
    await review(store, id, "user-reviewer-2");
    expect(await find(store, id)).toMatchObject({ status: "approved", approvalCount: 2 });
  });

  test("compliance cannot review normal refunds; reviewers, agents and admins cannot sign off", async () => {
    const { store } = await database();
    const low = await create(store, "25.00");
    const high = await create(store, "9000.00");
    const history = await store.auditEntries();
    for (const id of [low.id, high.id]) {
      for (const decision of ["approve", "reject"]) await expect(review(store, id, "user-compliance", decision)).rejects.toThrow("permission");
      for (const actor of ["user-reviewer", "user-agent", "user-agent-2", "user-admin"]) await expect(signOff(store, id, actor)).rejects.toThrow("permission");
    }
    await expect(store.mutate("refunds.create", "user-compliance", { customer: "Other", amount: "1", reason: "No" })).rejects.toThrow("permission");
    await expect(signOff(store, low.id)).rejects.toThrow("does not need a sign-off");
    expect(await store.auditEntries()).toEqual(history);
    expect((await find(store, low.id)).decisions).toEqual([]);
  });

  test("a compliance decline is terminal, and sign-off eligibility is rechecked per person", async () => {
    const { store, raw } = await database();
    await addUser(raw, "user-compliance-2", "compliance");
    const declined = await create(store, "6000.00");
    await review(store, declined.id); await review(store, declined.id, "user-reviewer-2");
    await signOff(store, declined.id, "user-compliance", "reject");
    expect(await find(store, declined.id)).toMatchObject({ status: "rejected", approvalCount: 2 });
    await expect(signOff(store, declined.id, "user-compliance-2")).rejects.toThrow("final");
    const pending = await create(store, "6000.00");
    await signOff(store, pending.id);
    await expect(signOff(store, pending.id, "user-compliance-2")).rejects.toThrow("already been signed off");
    const other = await create(store, "6000.00");
    await review(store, other.id);
    await raw.execute("UPDATE users SET role = 'compliance' WHERE id = 'user-reviewer'");
    await expect(signOff(store, other.id, "user-reviewer")).rejects.toThrow("already reviewed");
    await raw.execute("UPDATE users SET role = 'compliance' WHERE id = 'user-agent'");
    await expect(signOff(store, other.id, "user-agent")).rejects.toThrow("own request");
    await raw.execute("UPDATE users SET role = 'agent' WHERE id = 'user-compliance-2'");
    await expect(signOff(store, other.id, "user-compliance-2")).rejects.toThrow("permission");
    expect(await find(store, other.id)).toMatchObject({ status: "pending", approvalCount: 1 });
  });

  test("a simultaneous final review and compliance sign-off approve exactly once", async () => {
    const { store } = await database();
    const { id } = await create(store, "8000.00");
    await review(store, id);
    await Promise.all([review(store, id, "user-reviewer-2"), signOff(store, id)]);
    expect(await find(store, id)).toMatchObject({ status: "approved", approvalCount: 2 });
    const changes = (await store.auditEntries()).entries.filter((entry) => entry.table === "approval_requests" && entry.operation === "update");
    expect(changes.length).toBe(3);
    expect(changes[0].before).toEqual(changes[1].after);
    expect(changes[0].after).toMatchObject({ status: "approved" });
  });

  test("upgrading moves pending refunds onto the compliance policy with audited migration, keeping users and sessions", async () => {
    const { store, raw, path } = await database();
    const big = await create(store, "6000.00");
    await review(store, big.id);
    const small = await create(store, "600.00");
    const done = await create(store, "700.00");
    await review(store, done.id); await review(store, done.id, "user-reviewer-2");
    const token = await store.createSession("user-reviewer-2");
    store.close();
    const triggers = (table: string) => ["insert", "update", "delete"].flatMap((op) => [`DROP TRIGGER audit_${table}_${op}_guard;`, `DROP TRIGGER audit_${table}_${op}_log;`]).join(" ");
    await raw.executeMultiple(`PRAGMA foreign_keys = OFF; ${triggers("approval_requests")} ${triggers("approval_decisions")}
      ALTER TABLE approval_requests DROP COLUMN signoff_required; ALTER TABLE approval_decisions DROP COLUMN capacity;
      UPDATE approval_requests SET policy_version = 1; DELETE FROM schema_migrations WHERE version = 4; DELETE FROM users WHERE id = 'user-compliance';
      CREATE TABLE users_old (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL CHECK (role IN ('agent', 'reviewer', 'admin')));
      INSERT INTO users_old SELECT * FROM users; DROP TABLE users; ALTER TABLE users_old RENAME TO users;`);
    const before = Number((await raw.execute("SELECT COUNT(*) AS count FROM audit_log")).rows[0].count);
    const upgraded = new Store(path);
    try {
      expect((await upgraded.users()).map((user) => user.id)).toContain("user-compliance");
      expect((await upgraded.sessionUser(token!))?.id).toBe("user-reviewer-2");
      expect(await find(upgraded, big.id)).toMatchObject({ status: "pending", approvalCount: 1, signoffRequired: true });
      expect(await find(upgraded, small.id)).toMatchObject({ status: "pending", signoffRequired: false });
      expect(await find(upgraded, done.id)).toMatchObject({ status: "approved", signoffRequired: false });
      expect((await raw.execute("SELECT resource_id, policy_version FROM approval_requests ORDER BY policy_version")).rows.map((row) => [row.resource_id, row.policy_version]))
        .toEqual(expect.arrayContaining([[done.id, 1], [big.id, 2], [small.id, 2]]));
      const migration = (await upgraded.auditEntries()).entries.filter((entry) => entry.action === "system.migration.refund-compliance-signoff");
      expect(migration.length).toBe(2);
      expect(migration.every((entry) => entry.actor.id === "system" && entry.before?.policy_version === 1 && entry.after?.policy_version === 2)).toBe(true);
      expect(migration.find((entry) => entry.recordId !== migration[0].recordId)).toBeDefined();
      await review(upgraded, big.id, "user-reviewer-2");
      expect((await find(upgraded, big.id)).status).toBe("pending");
      await signOff(upgraded, big.id);
      expect((await find(upgraded, big.id)).status).toBe("approved");
      await review(upgraded, small.id); await review(upgraded, small.id, "user-reviewer-2");
      expect((await find(upgraded, small.id)).status).toBe("approved");
      await expect(addUser(raw, "invented", "invented")).rejects.toThrow();
      expect(Number((await raw.execute("SELECT COUNT(*) AS count FROM audit_log")).rows[0].count)).toBeGreaterThan(before);
    } finally { upgraded.close(); }
    const reopened = new Store(path);
    try {
      await reopened.users();
      expect((await reopened.auditEntries()).entries.filter((entry) => entry.action.startsWith("system.migration")).length).toBe(2);
    } finally { reopened.close(); }
  });
});

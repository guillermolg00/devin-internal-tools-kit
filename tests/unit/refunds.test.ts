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
      expect((await reopened.users()).length).toBe(4);
      await review(reopened, id, "user-reviewer-2");
      expect((await reopened.refunds())[0].status).toBe("approved");
    } finally { reopened.close(); }
  });
});

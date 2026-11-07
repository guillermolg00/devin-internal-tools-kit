import { afterEach, describe, expect, test } from "bun:test";
import { fixture } from "../fixture";
import { Store } from "../../src/lib/database";
import { kycPolicy } from "../../src/lib/kyc";

const fixtures: Awaited<ReturnType<typeof fixture>>[] = [];
async function database() { const db = await fixture(); fixtures.push(db); return db; }
afterEach(() => { for (const db of fixtures.splice(0)) db.close(); });
const details = { customer: "Fictional Customer", country: "es", documentType: "passport", riskScore: 70 };
async function create(store: Store, riskScore = 70) {
  return (await store.mutate("kyc.create", "user-agent", { ...details, riskScore })).result!.id;
}
function act(store: Store, id: string, actor: string, action: string, note = "Reviewed the vendor result.") {
  return store.mutate("kyc.review", actor, { id, action, note });
}
async function review(store: Store, id: string, actor: string, action = "approve") {
  await act(store, id, actor, "claim");
  return act(store, id, actor, action);
}
async function state(store: Store, id: string) { return (await store.kycCases()).find((item) => item.id === id)!; }
async function auditCount(raw: Awaited<ReturnType<typeof fixture>>["raw"]) {
  return Number((await raw.execute("SELECT count(*) AS count FROM audit_log")).rows[0].count);
}

describe("KYC queue on shared approvals", () => {
  test("intake freezes details, server actor and risk quorum; all three rows share one audit mutation", async () => {
    const { store, raw } = await database();
    const created = await store.mutate("kyc.create", "user-agent", { ...details, actorId: "user-admin", status: "approved", requiredApprovals: 1, assignedTo: "user-agent" });
    const row = await state(store, created.result!.id);
    expect(row).toMatchObject({ customer: details.customer, country: "ES", riskScore: 70, status: "pending", requiredApprovals: 2, assignedTo: null, escalated: false, requestedBy: "user-agent" });
    expect(row.history).toHaveLength(1);
    expect(row.history[0]).toMatchObject({ actorId: "user-agent", actorName: "Alex Morgan", actorRole: "agent", action: "submit" });
    const audit = (await raw.execute({ sql: "SELECT * FROM audit_log WHERE mutation_id = ?", args: [created.mutationId] })).rows;
    expect(audit.map((entry) => entry.table_name).sort()).toEqual(["approval_requests", "kyc_cases", "kyc_events"]);
    expect(audit.every((entry) => entry.actor_id === "user-agent")).toBe(true);
  });

  test("scores 0 and 69.99 need one approval; 70 and 100 need two with a senior second", async () => {
    const { store } = await database();
    for (const risk of [0, 69.99, 70, 100]) {
      const id = await create(store, risk);
      await review(store, id, "user-agent-2");
      expect(await state(store, id)).toMatchObject({ status: risk >= 70 ? "pending" : "approved", approvalCount: 1, requiredApprovals: risk >= 70 ? 2 : 1, assignedTo: null });
      if (risk >= 70) {
        await review(store, id, "user-reviewer");
        expect(await state(store, id)).toMatchObject({ status: "approved", approvalCount: 2 });
      }
    }
  });

  test("a senior first approval still requires a different senior second; analysts cannot take the second stage", async () => {
    const { store, raw } = await database();
    const id = await create(store);
    await review(store, id, "user-reviewer");
    const before = await auditCount(raw);
    await expect(act(store, id, "user-agent-2", "claim")).rejects.toThrow("permission");
    await expect(act(store, id, "user-reviewer", "claim")).rejects.toThrow("already reviewed");
    expect(await auditCount(raw)).toBe(before);
    await review(store, id, "user-reviewer-2");
    expect((await state(store, id)).status).toBe("approved");
  });

  test("escalation records a reason, releases the claim, and routes low-risk cases to a senior without counting as approval", async () => {
    const { store, raw } = await database();
    const id = await create(store, 20);
    await review(store, id, "user-agent-2", "escalate");
    expect(await state(store, id)).toMatchObject({ escalated: true, assignedTo: null, status: "pending", approvalCount: 0 });
    expect((await state(store, id)).history.map((event) => event.action)).toEqual(["submit", "claim", "escalate"]);
    await raw.execute("UPDATE users SET role = 'reviewer' WHERE id = 'user-agent-2'");
    await expect(act(store, id, "user-agent-2", "claim")).rejects.toThrow("escalated yourself");
    await review(store, id, "user-reviewer");
    expect((await state(store, id)).status).toBe("approved");
  });

  test("all prior escalators remain ineligible even after another senior escalates the case", async () => {
    const { store } = await database();
    const id = await create(store);
    await review(store, id, "user-agent-2", "escalate");
    await review(store, id, "user-reviewer", "escalate");
    await expect(act(store, id, "user-reviewer", "claim")).rejects.toThrow("escalated yourself");
    await review(store, id, "user-reviewer-2");
    await expect(act(store, id, "user-reviewer", "claim")).rejects.toThrow("escalated yourself");
    expect((await state(store, id)).approvalCount).toBe(1);
  });

  test("high-risk escalation still needs two distinct approvals, including a senior second", async () => {
    const { store } = await database();
    const id = await create(store, 100);
    await review(store, id, "user-agent-2", "escalate");
    await review(store, id, "user-reviewer");
    expect(await state(store, id)).toMatchObject({ status: "pending", approvalCount: 1, escalated: true });
    await review(store, id, "user-reviewer-2");
    expect(await state(store, id)).toMatchObject({ status: "approved", approvalCount: 2, requiredApprovals: 2 });
  });

  test("rejection before or after a partial approval is terminal and cannot be reversed", async () => {
    const { store, raw } = await database();
    for (const partial of [false, true]) {
      const id = await create(store);
      if (partial) await review(store, id, "user-agent-2");
      await review(store, id, "user-reviewer", "reject");
      expect((await state(store, id)).status).toBe("rejected");
      const before = await auditCount(raw);
      for (const action of ["approve", "reject", "escalate", "claim", "release"]) await expect(act(store, id, "user-reviewer-2", action)).rejects.toThrow("final");
      expect(await auditCount(raw)).toBe(before);
    }
  });

  test("approved cases lock claims, decisions and escalation without audit noise", async () => {
    const { store, raw } = await database();
    const id = await create(store, 69);
    await review(store, id, "user-agent-2");
    const before = await auditCount(raw);
    for (const action of ["claim", "release", "approve", "reject", "escalate"]) await expect(act(store, id, "user-reviewer", action)).rejects.toThrow("final");
    expect(await auditCount(raw)).toBe(before);
  });

  test("claims require an eligible actor and only the assignee can act; releasing permits another claimant", async () => {
    const { store } = await database();
    const id = await create(store);
    await expect(act(store, id, "user-agent", "claim")).rejects.toThrow("own request");
    await act(store, id, "user-agent-2", "claim");
    for (const action of ["approve", "reject", "escalate", "release"]) await expect(act(store, id, "user-reviewer", action)).rejects.toThrow("Claim this case");
    await expect(act(store, id, "user-reviewer", "claim")).rejects.toThrow("already claimed");
    await act(store, id, "user-agent-2", "release");
    await act(store, id, "user-reviewer", "claim");
    expect((await state(store, id)).assigneeName).toBe("Sam Rivera");
  });

  test("self-review remains denied after creator promotion; admin has no review or intake override", async () => {
    const { store, raw } = await database();
    const id = await create(store);
    await raw.execute("UPDATE users SET role = 'reviewer' WHERE id = 'user-agent'");
    await expect(act(store, id, "user-agent", "claim")).rejects.toThrow("own request");
    await expect(act(store, id, "user-admin", "claim")).rejects.toThrow("permission");
    await expect(store.mutate("kyc.create", "user-admin", details)).rejects.toThrow("permission");
    await expect(store.mutate("kyc.create", "user-reviewer", details)).rejects.toThrow("permission");
    await expect(act(store, id, "unknown", "claim")).rejects.toThrow("Choose a demo user");
  });

  test("seniority is checked again at decision time after demotion", async () => {
    const { store, raw } = await database();
    const id = await create(store);
    await review(store, id, "user-agent-2");
    await act(store, id, "user-reviewer", "claim");
    await raw.execute("UPDATE users SET role = 'agent' WHERE id = 'user-reviewer'");
    const before = await auditCount(raw);
    for (const action of ["approve", "reject"]) await expect(act(store, id, "user-reviewer", action)).rejects.toThrow("permission");
    expect(await auditCount(raw)).toBe(before);
    await act(store, id, "user-reviewer", "release");
    await review(store, id, "user-reviewer-2");
  });

  test("invalid intake, IDs, actions and missing reasons leave no rows or audits", async () => {
    const { store, raw } = await database();
    const before = await auditCount(raw);
    for (const input of [null, {}, { ...details, customer: " " }, { ...details, customer: "x".repeat(201) }, { ...details, country: "Spain" }, { ...details, country: "1A" }, { ...details, documentType: "__proto__" }, ...[-1, 101, NaN, Infinity, "70", null].map((riskScore) => ({ ...details, riskScore }))]) {
      await expect(store.mutate("kyc.create", "user-agent", input)).rejects.toThrow();
    }
    expect(await store.kycCases()).toEqual([]);
    expect(await auditCount(raw)).toBe(before);
    const id = await create(store);
    await act(store, id, "user-agent-2", "claim");
    const afterClaim = await auditCount(raw);
    for (const action of ["approve", "reject", "escalate"]) for (const note of ["", " ", "x".repeat(1001)]) await expect(act(store, id, "user-agent-2", action, note)).rejects.toThrow("Decision reason");
    await expect(act(store, id, "user-agent-2", "delete")).rejects.toThrow("Choose claim");
    await expect(act(store, "invalid", "user-agent-2", "claim")).rejects.toThrow("valid KYC");
    await expect(act(store, "00000000-0000-0000-0000-000000000000", "user-agent-2", "claim")).rejects.toThrow("not found");
    expect(await auditCount(raw)).toBe(afterClaim);
  });

  test("simultaneous claims have one winner; duplicate decisions and competing actions serialize", async () => {
    const { store } = await database();
    const id = await create(store);
    const claims = await Promise.allSettled([act(store, id, "user-agent-2", "claim"), act(store, id, "user-reviewer", "claim")]);
    expect(claims.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const actor = (await state(store, id)).assignedTo!;
    const decisions = await Promise.allSettled([act(store, id, actor, "approve"), act(store, id, actor, "reject"), act(store, id, actor, "escalate")]);
    expect(decisions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await state(store, id)).history.filter((event) => ["approve", "reject", "escalate"].includes(event.action))).toHaveLength(1);
  });

  test("later event or audit failure rolls back all workflow, assignment, decision and audit writes", async () => {
    const { store, raw } = await database();
    const beforeCreate = await auditCount(raw);
    await raw.execute("CREATE TRIGGER fail_event BEFORE INSERT ON kyc_events BEGIN SELECT RAISE(ABORT, 'event unavailable'); END");
    await expect(create(store)).rejects.toThrow("event unavailable");
    expect((await raw.execute("SELECT * FROM approval_requests WHERE resource_type = 'kyc'")).rows).toHaveLength(0);
    expect(await store.kycCases()).toEqual([]);
    expect(await auditCount(raw)).toBe(beforeCreate);
    await raw.execute("DROP TRIGGER fail_event");
    const id = await create(store);
    await act(store, id, "user-agent-2", "claim");
    const before = await state(store, id);
    const count = await auditCount(raw);
    await raw.execute("CREATE TRIGGER fail_event BEFORE INSERT ON kyc_events BEGIN SELECT RAISE(ABORT, 'event unavailable'); END");
    await expect(act(store, id, "user-agent-2", "approve")).rejects.toThrow("event unavailable");
    await expect(act(store, id, "user-agent-2", "escalate")).rejects.toThrow("event unavailable");
    expect(await state(store, id)).toEqual(before);
    expect((await raw.execute("SELECT * FROM approval_decisions")).rows).toHaveLength(0);
    expect(await auditCount(raw)).toBe(count);
    await raw.execute("DROP TRIGGER fail_event");
    await raw.execute("CREATE TRIGGER fail_kyc_audit BEFORE INSERT ON audit_log WHEN NEW.table_name = 'kyc_events' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END");
    await expect(act(store, id, "user-agent-2", "approve")).rejects.toThrow("audit unavailable");
    expect(await state(store, id)).toEqual(before);
    expect(await auditCount(raw)).toBe(count);
    await raw.execute("DROP TRIGGER fail_kyc_audit");
    await raw.execute("DROP TRIGGER audit_kyc_events_insert_log");
    await expect(act(store, id, "user-agent-2", "approve")).rejects.toThrow("did not produce an audit");
    expect(await state(store, id)).toEqual(before);
    expect(await auditCount(raw)).toBe(count);
    expect((await raw.execute("SELECT * FROM audit_context")).rows).toHaveLength(0);
  });

  test("history retains actor names and roles after renames; direct edits/deletes and policy mismatches fail closed", async () => {
    const { store, raw } = await database();
    const id = await create(store);
    await review(store, id, "user-agent-2", "escalate");
    await raw.execute("UPDATE users SET name = 'Renamed', role = 'reviewer' WHERE id = 'user-agent-2'");
    expect((await state(store, id)).history.at(-1)).toMatchObject({ actorName: "Casey Chen", actorRole: "agent" });
    for (const sql of ["UPDATE kyc_cases SET risk_score = 1", "DELETE FROM kyc_cases", "UPDATE kyc_events SET note = 'fake'", "DELETE FROM kyc_events"]) await expect(raw.execute(sql)).rejects.toThrow("require mutation context");
    await act(store, id, "user-reviewer", "claim");
    const version = kycPolicy.version;
    try {
      kycPolicy.version++;
      await expect(act(store, id, "user-reviewer", "approve")).rejects.toThrow("original approval policy");
    } finally { kycPolicy.version = version; }
  });

  test("pending workflow and complete history survive reopening without duplicate events or migrations", async () => {
    const { store, path, raw } = await database();
    const id = await create(store);
    await review(store, id, "user-agent-2");
    const before = await store.kycCases();
    const count = await auditCount(raw);
    store.close();
    const reopened = new Store(path);
    try {
      expect(await reopened.kycCases()).toEqual(before);
      expect(await auditCount(raw)).toBe(count);
      expect((await raw.execute("SELECT * FROM schema_migrations WHERE version = 3")).rows).toHaveLength(1);
      await review(reopened, id, "user-reviewer");
      expect((await state(reopened, id)).status).toBe("approved");
    } finally { reopened.close(); }
  });

  test("upgrading the v2 schema adds KYC without changing refunds, sessions or earlier audits", async () => {
    const { store, raw, path } = await database();
    await store.mutate("refunds.create", "user-agent", { customer: "Existing", amount: "500.01", reason: "Old request" });
    const token = await store.createSession("user-reviewer");
    const refunds = await store.refunds();
    const count = await auditCount(raw);
    store.close();
    await raw.executeMultiple("DROP TABLE kyc_events; DROP TABLE kyc_cases; DELETE FROM audited_tables WHERE table_name IN ('kyc_cases', 'kyc_events'); DELETE FROM schema_migrations WHERE version = 3; DELETE FROM users WHERE id = 'user-agent-2';");
    const upgraded = new Store(path);
    try {
      expect(await upgraded.refunds()).toEqual(refunds);
      expect(await upgraded.kycCases()).toEqual([]);
      expect((await upgraded.sessionUser(token!))?.id).toBe("user-reviewer");
      expect(await auditCount(raw)).toBe(count);
      await create(upgraded);
    } finally { upgraded.close(); }
  });
});

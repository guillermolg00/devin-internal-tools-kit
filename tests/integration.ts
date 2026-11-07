import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "tools-integration-"));
const port = Number(process.env.TEST_PORT || 3107);
const origin = `http://127.0.0.1:${port}`;
let server: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined;

async function start(demo: boolean) {
  server = Bun.spawn([process.execPath, "run", "start", "--port", String(port), "--hostname", "127.0.0.1"], {
    env: { ...process.env, NODE_ENV: "production", ENABLE_DEMO_AUTH: demo ? "true" : "false", DATABASE_PATH: join(dir, "app.db") },
    stdin: "ignore", stdout: "pipe", stderr: "pipe",
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${await new Response(server.stderr).text()}`);
    try { if ((await fetch(`${origin}/login`)).ok) return; } catch { /* Wait for the server's ready signal. */ }
    await Bun.sleep(100);
  }
  throw new Error("Server did not become ready.");
}

async function stop() {
  if (server) { server.kill(); await server.exited; server = undefined; }
}

async function request(path: string, options: { method?: string; cookie?: string; body?: unknown; requestOrigin?: string; rawBody?: string } = {}) {
  return fetch(`${origin}${path}`, {
    method: options.method || "GET", redirect: "manual",
    headers: { "Content-Type": "application/json", Origin: options.requestOrigin ?? origin, ...(options.cookie ? { Cookie: options.cookie } : {}) },
    ...((options.body !== undefined || options.rawBody !== undefined) ? { body: options.rawBody ?? JSON.stringify(options.body) } : {}),
  });
}

async function login(userId: string, previous?: string) {
  const response = await request("/api/session", { method: "POST", body: { userId, role: "admin" }, cookie: previous });
  assert.equal(response.status, 200);
  const header = response.headers.get("set-cookie")!;
  assert.match(header, /HttpOnly/i); assert.match(header, /SameSite=lax/i); assert.match(header, /Max-Age=28800/i);
  return header.split(";")[0];
}

try {
  await start(true);
  assert.equal((await request("/")).status, 307);
  assert.equal((await request("/team")).status, 307);
  assert.equal((await request("/api/note")).status, 401);
  assert.equal((await request("/api/users")).status, 401);
  assert.equal((await request("/api/audit")).status, 401);
  assert.equal((await request("/audit")).status, 307);
  assert.equal((await request("/api/note", { method: "PUT", body: { content: "anonymous" } })).status, 401);
  assert.equal((await request("/api/users", { cookie: "tools_session=user-admin" })).status, 401);
  assert.equal((await request("/api/session", { method: "POST", body: { userId: "missing" } })).status, 400);
  assert.equal((await request("/api/session", { method: "POST", rawBody: "{" })).status, 400);
  assert.equal((await request("/api/session", { method: "POST", body: { userId: "user-admin" }, requestOrigin: "https://elsewhere.example" })).status, 403);
  console.log("PASS anonymous requests, forged cookies, malformed login, and cross-origin login");

  const agent = await login("user-agent");
  const before = await (await request("/api/note", { cookie: agent })).json();
  const denied = await request("/api/note", { method: "PUT", cookie: agent, body: { content: "agent should not write", role: "admin", userId: "user-admin" } });
  assert.equal(denied.status, 403);
  assert.equal((await (await request("/api/note", { cookie: agent })).json()).content, before.content);
  assert.equal((await request("/api/users", { cookie: agent })).status, 403);
  assert.equal((await request("/api/audit", { cookie: agent })).status, 403);
  assert.match(await (await request("/audit", { cookie: agent })).text(), /The audit log is restricted/);
  assert.match(await (await request("/team", { cookie: agent })).text(), /This space has a boundary/);
  assert.equal((await request("/access", { cookie: agent })).status, 200);
  console.log("PASS agent read access and server rejection of direct note/team requests, including spoofed roles");

  const reviewer = await login("user-reviewer", agent);
  assert.equal((await request("/api/note", { cookie: agent })).status, 401);
  assert.equal((await request("/api/note", { method: "PUT", cookie: reviewer, body: { content: "  Persisted integration note  " } })).status, 200);
  assert.equal((await (await request("/api/note", { cookie: reviewer })).json()).content, "Persisted integration note");
  assert.equal((await request("/api/users", { cookie: reviewer })).status, 403);
  assert.equal((await request("/api/audit", { cookie: reviewer })).status, 403);
  assert.match(await (await request("/audit", { cookie: reviewer })).text(), /The audit log is restricted/);
  assert.match(await (await request("/team", { cookie: reviewer })).text(), /This space has a boundary/);
  for (const content of ["", "   ", "x".repeat(1001), 123, null]) assert.equal((await request("/api/note", { method: "PUT", cookie: reviewer, body: { content } })).status, 400);
  assert.equal((await request("/api/note", { method: "PUT", cookie: reviewer, rawBody: "{" })).status, 400);
  assert.equal((await request("/api/note", { method: "PUT", cookie: reviewer, body: { content: "cross-site" }, requestOrigin: "https://elsewhere.example" })).status, 403);
  console.log("PASS reviewer write/read, input validation, cross-origin mutation rejection, and session rotation");

  const admin = await login("user-admin");
  const team = await request("/api/users", { cookie: admin });
  assert.equal(team.status, 200); assert.equal((await team.json()).users.length, 4);
  assert.equal(team.headers.get("cache-control"), "no-store");
  assert.match(await (await request("/team", { cookie: admin })).text(), /Workspace members/);
  const audit = await request("/api/audit", { cookie: admin });
  assert.equal(audit.status, 200);
  assert.equal(audit.headers.get("cache-control"), "no-store");
  const history = await audit.json();
  assert.equal(history.entries.length, 2);
  assert.equal(history.entries[0].actor.id, "user-reviewer");
  assert.equal(history.entries[0].actor.role, "reviewer");
  assert.equal(history.entries[0].before.content, before.content);
  assert.equal(history.entries[0].after.content, "Persisted integration note");
  assert.equal(history.entries[0].operation, "update");
  assert.equal(history.entries[1].action, "system.seed");
  assert.match(await (await request("/audit", { cookie: admin })).text(), /Inspect before &amp; after/);
  for (const cursor of ["0", "-1", "abc", "1.2", "9007199254740992"]) assert.equal((await request(`/api/audit?before=${cursor}`, { cookie: admin })).status, 400);
  assert.equal((await request("/api/audit", { method: "DELETE", cookie: admin })).status, 405);
  assert.equal((await request("/api/audit", { method: "PUT", cookie: admin, body: {} })).status, 405);
  for (let i = 0; i < 22; i++) assert.equal((await request("/api/note", { method: "PUT", cookie: admin, body: { content: `Audit page ${i}` } })).status, 200);
  const firstPage = await (await request("/api/audit", { cookie: admin })).json();
  const secondPage = await (await request(`/api/audit?before=${firstPage.nextCursor}`, { cookie: admin })).json();
  assert.equal(firstPage.entries.length, 20);
  assert.equal(secondPage.entries.length, 4);
  assert.equal(new Set([...firstPage.entries, ...secondPage.entries].map((entry: { id: number }) => entry.id)).size, 24);
  assert.match(await (await request(`/audit?before=${firstPage.nextCursor}`, { cookie: admin })).text(), /Latest entries/);
  console.log("PASS admin-only audit page/API, exact snapshots and actor attribution, rejected-write exclusion, and pagination");
  assert.equal((await request("/api/note", { method: "PUT", cookie: admin, body: { content: "Admin persisted note" } })).status, 200);
  assert.equal((await request("/api/session", { method: "DELETE", cookie: admin })).status, 200);
  assert.equal((await request("/api/users", { cookie: admin })).status, 401);
  console.log("PASS admin access, non-cacheable responses, writes, and logout revocation");

  await stop(); await start(false);
  assert.equal((await request("/api/session", { method: "POST", body: { userId: "user-admin" } })).status, 403);
  assert.equal((await request("/api/note", { cookie: reviewer })).status, 401);
  assert.match(await (await request("/login")).text(), /Demo login is disabled/);
  console.log("PASS fake login disabled in production by default");

  await stop(); await start(true);
  const afterRestart = await login("user-agent");
  assert.equal((await (await request("/api/note", { cookie: afterRestart })).json()).content, "Admin persisted note");
  const auditAdmin = await login("user-admin");
  const persistedAudit = await (await request("/api/audit", { cookie: auditAdmin })).json();
  assert.equal(persistedAudit.entries[0].after.content, "Admin persisted note");
  console.log("PASS SQLite persistence across server restarts");

  assert.equal((await request("/refunds")).status, 307);
  assert.equal((await request("/api/refunds")).status, 401);
  assert.equal((await request("/api/refunds", { method: "POST", body: {} })).status, 401);
  const refundReviewer = await login("user-reviewer");
  const secondReviewer = await login("user-reviewer-2");
  assert.equal((await request("/refunds", { cookie: afterRestart })).status, 200);
  assert.match(await (await request("/refunds", { cookie: afterRestart })).text(), /New refund request/);
  assert.doesNotMatch(await (await request("/refunds", { cookie: refundReviewer })).text(), /New refund request/);
  for (const cookie of [refundReviewer, auditAdmin]) assert.equal((await request("/api/refunds", { method: "POST", cookie, body: { customer: "Denied", amount: "1", reason: "Denied" } })).status, 403);
  assert.equal((await request("/api/refunds", { method: "POST", cookie: afterRestart, requestOrigin: "https://elsewhere.example", body: {} })).status, 403);
  assert.equal((await request("/api/refunds", { method: "POST", cookie: afterRestart, rawBody: "{" })).status, 400);
  for (const amount of ["0", "-1", "1.001", 500.01]) assert.equal((await request("/api/refunds", { method: "POST", cookie: afterRestart, body: { customer: "Bad", amount, reason: "Bad amount" } })).status, 400);
  async function submitRefund(amount: string) {
    const response = await request("/api/refunds", { method: "POST", cookie: afterRestart, body: { customer: `Customer ${amount}`, amount, reason: "Duplicate charge", requestedBy: "user-admin", requiredApprovals: 1, status: "approved" } });
    assert.equal(response.status, 201);
    return response.json();
  }
  async function decideRefund(id: string, cookie: string, decision = "approve") {
    return request(`/api/refunds/${id}/decisions`, { method: "POST", cookie, body: { decision, reviewerId: "user-admin", role: "admin" } });
  }
  const high = await submitRefund("500.01");
  const low = await submitRefund("500.00");
  for (const cookie of [afterRestart, auditAdmin]) assert.equal((await decideRefund(high.result.id, cookie)).status, 403);
  assert.equal((await request(`/api/refunds/${high.result.id}/decisions`, { method: "POST", body: { decision: "approve" } })).status, 401);
  assert.equal((await request(`/api/refunds/${high.result.id}/decisions`, { method: "POST", cookie: refundReviewer, requestOrigin: "https://elsewhere.example", body: { decision: "approve" } })).status, 403);
  assert.equal((await request(`/api/refunds/${high.result.id}/decisions`, { method: "POST", cookie: refundReviewer, body: { decision: "reset" } })).status, 400);
  assert.equal((await decideRefund("00000000-0000-4000-8000-000000000000", refundReviewer)).status, 404);
  const initialRefunds = await request("/api/refunds", { cookie: afterRestart });
  assert.equal(initialRefunds.headers.get("cache-control"), "no-store");
  const initialHigh = (await initialRefunds.json()).refunds.find((row: { id: string }) => row.id === high.result.id);
  assert.equal(initialHigh.requestedBy, "user-agent"); assert.equal(initialHigh.requiredApprovals, 2); assert.equal(initialHigh.status, "pending");
  const firstDecision = await decideRefund(high.result.id, refundReviewer);
  assert.equal(firstDecision.status, 200);
  const firstDecisionResult = await firstDecision.json();
  assert.equal(firstDecisionResult.result.status, "pending");
  assert.equal((await decideRefund(high.result.id, refundReviewer)).status, 409);
  assert.equal((await decideRefund(high.result.id, refundReviewer, "reject")).status, 409);
  assert.equal((await decideRefund(high.result.id, secondReviewer)).status, 200);
  assert.equal((await decideRefund(high.result.id, secondReviewer, "reject")).status, 409);
  assert.equal((await decideRefund(low.result.id, secondReviewer)).status, 200);
  assert.equal((await decideRefund(low.result.id, refundReviewer)).status, 409);
  const rejected = await submitRefund("900.00");
  assert.equal((await decideRefund(rejected.result.id, refundReviewer)).status, 200);
  assert.equal((await decideRefund(rejected.result.id, secondReviewer, "reject")).status, 200);
  assert.equal((await decideRefund(rejected.result.id, refundReviewer)).status, 409);
  const racing = await submitRefund("1000.00");
  const races = await Promise.all([decideRefund(racing.result.id, refundReviewer), decideRefund(racing.result.id, secondReviewer)]);
  assert.ok(races.every((response) => response.status === 200));
  const rows = (await (await request("/api/refunds", { cookie: auditAdmin })).json()).refunds;
  assert.equal(rows.find((row: { id: string }) => row.id === high.result.id).approvalCount, 2);
  assert.equal(rows.find((row: { id: string }) => row.id === low.result.id).status, "approved");
  assert.equal(rows.find((row: { id: string }) => row.id === rejected.result.id).status, "rejected");
  assert.equal(rows.find((row: { id: string }) => row.id === racing.result.id).approvalCount, 2);
  assert.equal((await request("/api/refunds", { method: "PUT", cookie: afterRestart, body: { amount: "1" } })).status, 405);
  assert.equal((await request(`/api/refunds/${high.result.id}/decisions`, { method: "DELETE", cookie: refundReviewer })).status, 405);
  const allHistory = [];
  let cursor: number | null = null;
  do {
    const page = await (await request(`/api/audit${cursor ? `?before=${cursor}` : ""}`, { cookie: auditAdmin })).json();
    allHistory.push(...page.entries); cursor = page.nextCursor;
  } while (cursor);
  const creationAudit = allHistory.filter((entry) => entry.mutationId === high.mutationId);
  assert.equal(creationAudit.length, 2); assert.ok(creationAudit.every((entry) => entry.actor.id === "user-agent"));
  const decisionAudit = allHistory.filter((entry) => entry.mutationId === firstDecisionResult.mutationId);
  assert.equal(decisionAudit.length, 2); assert.ok(decisionAudit.every((entry) => entry.actor.id === "user-reviewer"));
  const stateChange = decisionAudit.find((entry) => entry.table === "approval_requests");
  assert.equal(stateChange.before.approval_count, 0); assert.equal(stateChange.after.approval_count, 1);
  assert.equal(stateChange.after.status, "pending");
  assert.match((await (await request("/refunds", { cookie: secondReviewer })).text()).replace(/<!--.*?-->/g, ""), /No pending refund requests/);
  await stop(); await start(true);
  const refundsAfterRestart = await (await request("/api/refunds", { cookie: auditAdmin })).json();
  assert.deepEqual(refundsAfterRestart.refunds, rows);
  console.log("PASS refunds: role boundaries, threshold/quorum, duplicate and terminal decisions, concurrency, grouped audits, SSR, and persistence");
  console.log("All HTTP integration checks passed.");
} finally {
  await stop();
  rmSync(dir, { recursive: true, force: true });
}

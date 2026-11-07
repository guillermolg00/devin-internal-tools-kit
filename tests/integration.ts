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
  assert.match(await (await request("/team", { cookie: agent })).text(), /This space has a boundary/);
  assert.equal((await request("/access", { cookie: agent })).status, 200);
  console.log("PASS agent read access and server rejection of direct note/team requests, including spoofed roles");

  const reviewer = await login("user-reviewer", agent);
  assert.equal((await request("/api/note", { cookie: agent })).status, 401);
  assert.equal((await request("/api/note", { method: "PUT", cookie: reviewer, body: { content: "  Persisted integration note  " } })).status, 200);
  assert.equal((await (await request("/api/note", { cookie: reviewer })).json()).content, "Persisted integration note");
  assert.equal((await request("/api/users", { cookie: reviewer })).status, 403);
  assert.match(await (await request("/team", { cookie: reviewer })).text(), /This space has a boundary/);
  for (const content of ["", "   ", "x".repeat(1001), 123, null]) assert.equal((await request("/api/note", { method: "PUT", cookie: reviewer, body: { content } })).status, 400);
  assert.equal((await request("/api/note", { method: "PUT", cookie: reviewer, rawBody: "{" })).status, 400);
  assert.equal((await request("/api/note", { method: "PUT", cookie: reviewer, body: { content: "cross-site" }, requestOrigin: "https://elsewhere.example" })).status, 403);
  console.log("PASS reviewer write/read, input validation, cross-origin mutation rejection, and session rotation");

  const admin = await login("user-admin");
  const team = await request("/api/users", { cookie: admin });
  assert.equal(team.status, 200); assert.equal((await team.json()).users.length, 3);
  assert.equal(team.headers.get("cache-control"), "no-store");
  assert.match(await (await request("/team", { cookie: admin })).text(), /Workspace members/);
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
  console.log("PASS SQLite persistence across server restarts");
  console.log("All HTTP integration checks passed.");
} finally {
  await stop();
  rmSync(dir, { recursive: true, force: true });
}

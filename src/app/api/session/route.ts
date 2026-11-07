import { cookies } from "next/headers";
import { demoAuthEnabled, SESSION_COOKIE } from "@/lib/auth";
import { getStore, SESSION_SECONDS } from "@/lib/database";
import { apiError, checkOrigin, json } from "@/lib/http";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    if (!demoAuthEnabled()) return json({ error: "Demo login is disabled in production." }, 403);
    const body = await request.json();
    if (typeof body?.userId !== "string") return json({ error: "Choose a valid demo user." }, 400);
    const jar = await cookies();
    const token = await getStore().createSession(body.userId, jar.get(SESSION_COOKIE)?.value);
    if (!token) return json({ error: "Unknown demo user." }, 400);
    jar.set(SESSION_COOKIE, token, {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_SECONDS,
      secure: new URL(request.headers.get("origin")!).protocol === "https:",
    });
    return json({ ok: true });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const jar = await cookies();
    await getStore().deleteSession(jar.get(SESSION_COOKIE)?.value);
    jar.delete(SESSION_COOKIE);
    return json({ ok: true });
  } catch (error) { return apiError(error); }
}

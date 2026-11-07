import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getStore } from "./database";
import { authorize, type Permission } from "./permissions";

export const SESSION_COOKIE = "tools_session";
export const demoAuthEnabled = () => process.env.NODE_ENV !== "production" || process.env.ENABLE_DEMO_AUTH === "true";

export async function currentUser() {
  const jar = await cookies();
  if (!demoAuthEnabled()) return null;
  return getStore().sessionUser(jar.get(SESSION_COOKIE)?.value);
}

export async function requirePermission(permission: Permission) {
  return authorize(await currentUser(), permission);
}

export async function pageUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return authorize(user, "workspace:read");
}

// Shared-password gate for public demo deployments. Enabled only when DEMO_PASSWORD is set.
// It sits in front of the fake-identity picker; it is not the app's authorization model.
export const GATE_COOKIE = "demo_gate";
export const GATE_MAX_AGE = 60 * 60 * 24 * 7;

export const gatePassword = () => process.env.DEMO_PASSWORD || "";

export async function gateToken(password: string) {
  const data = new TextEncoder().encode(`foundry-demo-gate:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function safeNext(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

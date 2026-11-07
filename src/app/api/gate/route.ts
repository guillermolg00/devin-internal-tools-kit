import { NextResponse } from "next/server";
import { GATE_COOKIE, GATE_MAX_AGE, gatePassword, gateToken, safeEqual, safeNext } from "@/lib/gate";

export async function POST(request: Request) {
  const form = await request.formData();
  const next = safeNext(form.get("next"));
  const expected = gatePassword();
  const given = typeof form.get("password") === "string" ? String(form.get("password")) : "";
  if (!expected || !safeEqual(await gateToken(given), await gateToken(expected))) {
    return NextResponse.redirect(new URL(`/gate?error=1&next=${encodeURIComponent(next)}`, request.url), 303);
  }
  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set(GATE_COOKIE, await gateToken(expected), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: GATE_MAX_AGE,
    secure: new URL(request.url).protocol === "https:",
  });
  return response;
}

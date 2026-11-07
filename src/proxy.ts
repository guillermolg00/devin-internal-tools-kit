import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, gatePassword, gateToken, safeEqual } from "@/lib/gate";

export async function proxy(request: NextRequest) {
  const password = gatePassword();
  if (!password) return NextResponse.next();
  const cookie = request.cookies.get(GATE_COOKIE)?.value ?? "";
  if (cookie && safeEqual(cookie, await gateToken(password))) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Enter the demo password first." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/gate";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!gate|api/gate|_next/static|_next/image|favicon.ico).*)"],
};

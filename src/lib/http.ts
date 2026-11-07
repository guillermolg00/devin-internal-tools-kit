import "server-only";
import { NextResponse } from "next/server";
import { AccessError } from "./permissions";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  let host: string | undefined;
  try { host = origin ? new URL(origin).host : undefined; } catch { /* Invalid origins are rejected below. */ }
  if (!host || host !== request.headers.get("host") || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AccessError(403, "A same-origin request is required.");
  }
}

export function apiError(error: unknown) {
  if (error instanceof AccessError) return json({ error: error.message }, error.status);
  if (error instanceof SyntaxError) return json({ error: "Invalid JSON body." }, 400);
  console.error("API request failed", error);
  return json({ error: "Something went wrong. Please try again." }, 500);
}

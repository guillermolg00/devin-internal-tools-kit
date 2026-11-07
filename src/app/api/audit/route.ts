import { requirePermission } from "@/lib/auth";
import { auditCursor } from "@/lib/audit";
import { getStore } from "@/lib/database";
import { apiError, json } from "@/lib/http";

export async function GET(request: Request) {
  try {
    await requirePermission("audit:read");
    let before: number | undefined;
    try { before = auditCursor(new URL(request.url).searchParams.get("before") ?? undefined); }
    catch { return json({ error: "The before cursor must be a positive, safe integer." }, 400); }
    return json(await getStore().auditEntries(before));
  } catch (error) { return apiError(error); }
}

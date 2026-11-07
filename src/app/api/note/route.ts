import { requirePermission } from "@/lib/auth";
import { getStore } from "@/lib/database";
import { apiError, checkOrigin, json } from "@/lib/http";

export async function GET() {
  try {
    await requirePermission("workspace:read");
    return json(await getStore().note());
  } catch (error) { return apiError(error); }
}

export async function PUT(request: Request) {
  try {
    checkOrigin(request);
    const user = await requirePermission("note:write");
    const body = await request.json();
    if (typeof body?.content !== "string" || !body.content.trim() || body.content.trim().length > 1000) {
      return json({ error: "Write a note between 1 and 1,000 characters." }, 400);
    }
    return json(await getStore().updateNote(body.content.trim(), user.id));
  } catch (error) { return apiError(error); }
}

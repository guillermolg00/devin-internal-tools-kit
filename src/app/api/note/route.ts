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
    const store = getStore();
    await store.mutate("workspace.note.update", user.id, await request.json());
    return json(await store.note());
  } catch (error) { return apiError(error); }
}

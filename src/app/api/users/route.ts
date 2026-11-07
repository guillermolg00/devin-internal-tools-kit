import { requirePermission } from "@/lib/auth";
import { getStore } from "@/lib/database";
import { apiError, json } from "@/lib/http";

export async function GET() {
  try {
    await requirePermission("users:read");
    return json({ users: await getStore().users() });
  } catch (error) { return apiError(error); }
}

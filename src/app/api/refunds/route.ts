import { requirePermission } from "@/lib/auth";
import { getStore } from "@/lib/database";
import { apiError, checkOrigin, json } from "@/lib/http";

export async function GET() {
  try {
    await requirePermission("refunds:read");
    return json({ refunds: await getStore().refunds() });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requirePermission("refunds:create");
    const result = await getStore().mutate("refunds.create", user.id, await request.json());
    return json(result, 201);
  } catch (error) { return apiError(error); }
}

import { requirePermission } from "@/lib/auth";
import { getStore } from "@/lib/database";
import { apiError, checkOrigin, json } from "@/lib/http";

export async function GET() {
  try {
    await requirePermission("kyc:read");
    return json({ cases: await getStore().kycCases() });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requirePermission("kyc:create");
    return json(await getStore().mutate("kyc.create", user.id, await request.json()), 201);
  } catch (error) { return apiError(error); }
}

import { requirePermission } from "@/lib/auth";
import { getStore } from "@/lib/database";
import { apiError, checkOrigin, json } from "@/lib/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const user = await requirePermission("refunds:compliance-signoff");
    const { id } = await params;
    const body = await request.json();
    return json(await getStore().mutate("refunds.signoff", user.id, { id, decision: body?.decision }));
  } catch (error) { return apiError(error); }
}

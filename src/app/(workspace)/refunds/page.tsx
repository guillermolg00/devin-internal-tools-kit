import { pageUser } from "@/lib/auth";
import { authorize, can } from "@/lib/permissions";
import { getStore } from "@/lib/database";
import { RefundDashboard } from "@/components/refund-dashboard";

export default async function RefundsPage() {
  const user = authorize(await pageUser(), "refunds:read");
  return <RefundDashboard key={user.id} refunds={await getStore().refunds()} userId={user.id}
    canCreate={can(user, "refunds:create")} canReview={can(user, "refunds:review")} />;
}

import { pageUser } from "@/lib/auth";
import { authorize, can } from "@/lib/permissions";
import { getStore } from "@/lib/database";
import { KycQueue } from "@/components/kyc-queue";

export default async function KycPage() {
  const user = authorize(await pageUser(), "kyc:read");
  return <KycQueue key={user.id} cases={await getStore().kycCases()} userId={user.id}
    canCreate={can(user, "kyc:create")} canReview={can(user, "kyc:review")} canSeniorReview={can(user, "kyc:senior-review")} />;
}

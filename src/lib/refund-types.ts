import type { ApprovalStatus, Decision } from "./approvals";

export type Refund = {
  id: string; customer: string; amountCents: number; reason: string;
  requestedBy: string; requesterName: string; status: ApprovalStatus;
  approvalCount: number; requiredApprovals: number; createdAt: string; updatedAt: string;
  decisions: { reviewerId: string; reviewerName: string; decision: Decision; decidedAt: string }[];
};

export function formatUSD(amountCents: number) {
  const cents = BigInt(amountCents);
  return `$${(cents / 100n).toLocaleString("en-US")}.${(cents % 100n).toString().padStart(2, "0")}`;
}

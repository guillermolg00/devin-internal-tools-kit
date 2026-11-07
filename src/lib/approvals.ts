import "server-only";
import { randomUUID } from "node:crypto";
import { AccessError, authorize, type Permission } from "./permissions";
import { MutationConflictError, MutationNotFoundError, type MutationContext } from "./mutation";

export type ApprovalStatus = "pending" | "approved" | "rejected";
export type Decision = "approve" | "reject";
export type ApprovalPolicy<Facts> = {
  key: string;
  version: number;
  resourceType: string;
  permission: Permission;
  requiredApprovals(facts: Facts): number;
  validateDecision?(context: MutationContext, review: { resourceId: string; decision: Decision; priorApprovals: number; requiredApprovals: number }): Promise<void>;
};

export function transitionApproval(
  state: { status: ApprovalStatus; requestedBy: string; requiredApprovals: number; decisions: { reviewerId: string; decision: Decision }[] },
  reviewerId: string,
  decision: Decision,
) {
  if (state.status !== "pending") throw new MutationConflictError("This request is final and cannot change again.");
  if (reviewerId === state.requestedBy) throw new AccessError(403, "You cannot review your own request.");
  if (state.decisions.some((entry) => entry.reviewerId === reviewerId)) throw new MutationConflictError("You have already reviewed this request.");
  const approvalCount = state.decisions.filter((entry) => entry.decision === "approve").length + (decision === "approve" ? 1 : 0);
  const status: ApprovalStatus = decision === "reject" ? "rejected" : approvalCount >= state.requiredApprovals ? "approved" : "pending";
  return { status, approvalCount };
}

export async function createApproval<Facts>(context: MutationContext, policy: ApprovalPolicy<Facts>, resourceId: string, facts: Facts) {
  const required = policy.requiredApprovals(facts);
  if (!Number.isSafeInteger(required) || required < 1) throw new Error("Invalid approval quorum");
  const id = randomUUID();
  await context.write("approval_requests", {
    sql: `INSERT INTO approval_requests (id, resource_type, resource_id, requested_by, policy_key, policy_version, required_approvals)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, policy.resourceType, resourceId, context.actor.id, policy.key, policy.version, required],
  });
  return id;
}

export async function decideApproval<Facts>(context: MutationContext, policy: ApprovalPolicy<Facts>, resourceId: string, decision: Decision) {
  authorize(context.actor, policy.permission);
  const [request] = await context.read({ sql: "SELECT * FROM approval_requests WHERE resource_type = ? AND resource_id = ?", args: [policy.resourceType, resourceId] });
  if (!request) throw new MutationNotFoundError("Request not found.");
  if (request.policy_key !== policy.key || request.policy_version !== policy.version) throw new MutationConflictError("This request requires its original approval policy.");
  const decisions = await context.read({ sql: "SELECT reviewer_id, decision FROM approval_decisions WHERE approval_id = ?", args: [String(request.id)] });
  const next = transitionApproval({
    status: request.status as ApprovalStatus, requestedBy: String(request.requested_by), requiredApprovals: Number(request.required_approvals),
    decisions: decisions.map((row) => ({ reviewerId: String(row.reviewer_id), decision: row.decision as Decision })),
  }, context.actor.id, decision);
  await policy.validateDecision?.(context, {
    resourceId, decision, priorApprovals: decisions.filter((row) => row.decision === "approve").length,
    requiredApprovals: Number(request.required_approvals),
  });
  await context.write("approval_decisions", {
    sql: "INSERT INTO approval_decisions (id, approval_id, reviewer_id, decision) VALUES (?, ?, ?, ?)",
    args: [randomUUID(), String(request.id), context.actor.id, decision],
  });
  await context.write("approval_requests", {
    sql: "UPDATE approval_requests SET status = ?, approval_count = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND status = 'pending'",
    args: [next.status, next.approvalCount, String(request.id)],
  });
  return { id: resourceId, ...next };
}

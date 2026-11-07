import { expect, test } from "bun:test";
import { createApproval, decideApproval, type ApprovalPolicy, type Decision } from "../../src/lib/approvals";
import type { MutationContext } from "../../src/lib/mutation";

test("a KYC-style policy reuses shared approval operations with a different quorum and permission", async () => {
  const policy: ApprovalPolicy<{ risk: string }> = { key: "kyc-test", version: 7, resourceType: "kyc-test", permission: "note:write", requiredApprovals: ({ risk }) => risk === "high" ? 3 : 1 };
  let request: Record<string, unknown>;
  const decisions: { reviewer_id: string; decision: Decision }[] = [];
  const context: MutationContext = {
    actor: { id: "creator", name: "Creator", email: "test@example.test", role: "reviewer" },
    async read(statement) { return statement.sql.includes("approval_decisions") ? decisions : [request]; },
    async write(table, statement) {
      const args = statement.args!;
      if (table === "approval_requests" && statement.sql.startsWith("INSERT")) request = { id: args[0], resource_type: args[1], resource_id: args[2], requested_by: args[3], policy_key: args[4], policy_version: args[5], required_approvals: args[6], status: "pending" };
      else if (table === "approval_decisions") decisions.push({ reviewer_id: String(args[2]), decision: args[3] as Decision });
      else request.status = args[0];
    },
  };
  await createApproval(context, policy, "customer-verification", { risk: "high" });
  policy.requiredApprovals = () => 1;
  for (let index = 1; index <= 3; index++) {
    context.actor = { ...context.actor, id: `reviewer-${index}` };
    expect((await decideApproval(context, policy, "customer-verification", "approve")).status).toBe(index === 3 ? "approved" : "pending");
  }
  expect(policy.requiredApprovals({ risk: "low" })).toBe(1);
  context.actor = { ...context.actor, id: "another", role: "agent" };
  await expect(decideApproval(context, policy, "customer-verification", "approve")).rejects.toThrow("permission");
});

import "server-only";
import { randomUUID } from "node:crypto";
import { createApproval, decideApproval, type ApprovalPolicy, type Decision } from "./approvals";
import { MutationInputError, type MutationContext } from "./mutation";

export const COMPLIANCE_SIGNOFF_ABOVE_CENTS = 500_000;

export const refundPolicy: ApprovalPolicy<{ amountCents: number }> = {
  key: "refunds", version: 2, resourceType: "refund", permission: "refunds:review",
  requiredApprovals: ({ amountCents }) => amountCents > 50_000 ? 2 : 1,
  signoff: { permission: "refunds:compliance-signoff", required: ({ amountCents }) => amountCents > COMPLIANCE_SIGNOFF_ABOVE_CENTS },
};

export function parseUSDCents(value: unknown) {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/.test(value.trim())) throw new MutationInputError("Enter a USD amount with at most two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents <= 0n || cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new MutationInputError("The amount must be positive and within the supported range.");
  return Number(cents);
}

function text(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new MutationInputError(`${label} must contain 1–${max} characters.`);
  return value.trim();
}

export async function createRefund(context: MutationContext, input: unknown) {
  const body = input as { customer?: unknown; amount?: unknown; reason?: unknown } | null;
  const customer = text(body?.customer, "Customer", 200);
  const reason = text(body?.reason, "Reason", 1000);
  const amountCents = parseUSDCents(body?.amount);
  const id = randomUUID();
  const approvalId = await createApproval(context, refundPolicy, id, { amountCents });
  await context.write("refund_requests", {
    sql: "INSERT INTO refund_requests (id, approval_id, customer, amount_cents, reason) VALUES (?, ?, ?, ?, ?)",
    args: [id, approvalId, customer, amountCents, reason],
  });
  return { id };
}

function decisionInput(input: unknown): { id: string; decision: Decision } {
  const body = input as { id?: unknown; decision?: unknown } | null;
  if (typeof body?.id !== "string" || !/^[0-9a-f-]{36}$/.test(body.id)) throw new MutationInputError("A valid refund ID is required.");
  if (body.decision !== "approve" && body.decision !== "reject") throw new MutationInputError("Choose approve or reject.");
  return { id: body.id, decision: body.decision };
}

export async function reviewRefund(context: MutationContext, input: unknown) {
  const { id, decision } = decisionInput(input);
  return decideApproval(context, refundPolicy, id, decision);
}

export async function signOffRefund(context: MutationContext, input: unknown) {
  const { id, decision } = decisionInput(input);
  return decideApproval(context, refundPolicy, id, decision, "signoff");
}

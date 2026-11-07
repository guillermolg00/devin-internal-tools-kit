import "server-only";
import { randomUUID } from "node:crypto";
import { createApproval, decideApproval, type ApprovalPolicy } from "./approvals";
import { AccessError, authorize } from "./permissions";
import { MutationConflictError, MutationInputError, MutationNotFoundError, type MutationContext } from "./mutation";
import { documentTypes, type KycAction } from "./kyc-types";

export const kycPolicy: ApprovalPolicy<{ riskScore: number }> = {
  key: "kyc", version: 1, resourceType: "kyc", permission: "kyc:review",
  requiredApprovals: ({ riskScore }) => riskScore >= 70 ? 2 : 1,
  async validateDecision(context, { resourceId, decision, priorApprovals, requiredApprovals }) {
    const row = await pendingCase(context, resourceId);
    requireAssignee(context, row);
    if (row.escalated || (requiredApprovals > 1 && priorApprovals > 0)) authorize(context.actor, "kyc:senior-review");
    if (decision === "approve") await preventSelfEscalation(context, resourceId);
  },
};

function text(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new MutationInputError(`${label} must contain 1–${max} characters.`);
  return value.trim();
}

async function pendingCase(context: MutationContext, id: string) {
  const [row] = await context.read({
    sql: `SELECT k.*, a.status, a.requested_by, a.approval_count, a.required_approvals
      FROM kyc_cases k JOIN approval_requests a ON a.id = k.approval_id WHERE k.id = ?`, args: [id],
  });
  if (!row) throw new MutationNotFoundError("KYC case not found.");
  if (row.status !== "pending") throw new MutationConflictError("This case is final and cannot change again.");
  return row;
}

function requireAssignee(context: MutationContext, row: Record<string, unknown>) {
  if (row.assigned_to !== context.actor.id) throw new MutationConflictError("Claim this case before reviewing it.");
}

async function preventSelfEscalation(context: MutationContext, id: string) {
  const events = await context.read({ sql: "SELECT id FROM kyc_events WHERE case_id = ? AND actor_id = ? AND action = 'escalate'", args: [id, context.actor.id] });
  if (events.length) throw new AccessError(403, "You cannot approve a case you escalated yourself.");
}

async function recordEvent(context: MutationContext, id: string, action: KycAction, note = "") {
  await context.write("kyc_events", {
    sql: "INSERT INTO kyc_events (case_id, actor_id, actor_name, actor_role, action, note) VALUES (?, ?, ?, ?, ?, ?)",
    args: [id, context.actor.id, context.actor.name, context.actor.role, action, note],
  });
}

export async function createKyc(context: MutationContext, input: unknown) {
  const body = input as { customer?: unknown; country?: unknown; documentType?: unknown; riskScore?: unknown } | null;
  const customer = text(body?.customer, "Customer", 200);
  const country = text(body?.country, "Country", 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new MutationInputError("Use a two-letter country code.");
  if (typeof body?.documentType !== "string" || !Object.hasOwn(documentTypes, body.documentType)) throw new MutationInputError("Choose a supported document type.");
  const riskScore = body.riskScore;
  if (typeof riskScore !== "number" || !Number.isFinite(riskScore) || riskScore < 0 || riskScore > 100) throw new MutationInputError("Risk score must be a number from 0 to 100.");
  const id = randomUUID();
  const approvalId = await createApproval(context, kycPolicy, id, { riskScore });
  await context.write("kyc_cases", {
    sql: "INSERT INTO kyc_cases (id, approval_id, customer, country, document_type, risk_score) VALUES (?, ?, ?, ?, ?, ?)",
    args: [id, approvalId, customer, country, body.documentType, riskScore],
  });
  await recordEvent(context, id, "submit");
  return { id };
}

export async function reviewKyc(context: MutationContext, input: unknown) {
  const body = input as { id?: unknown; action?: unknown; note?: unknown } | null;
  if (typeof body?.id !== "string" || !/^[0-9a-f-]{36}$/.test(body.id)) throw new MutationInputError("A valid KYC case ID is required.");
  const { id, action } = body;
  if (action !== "claim" && action !== "release" && action !== "approve" && action !== "reject" && action !== "escalate") throw new MutationInputError("Choose claim, release, approve, reject, or escalate.");
  const note = action === "approve" || action === "reject" || action === "escalate" ? text(body.note, "Decision reason", 1000) : "";
  const row = await pendingCase(context, id);
  if (action === "claim") {
    if (row.assigned_to !== null) throw new MutationConflictError("This case is already claimed. Refresh the queue.");
    if (row.requested_by === context.actor.id) throw new AccessError(403, "You cannot review your own request.");
    await preventSelfEscalation(context, id);
    const decisions = await context.read({ sql: "SELECT id FROM approval_decisions WHERE approval_id = ? AND reviewer_id = ?", args: [String(row.approval_id), context.actor.id] });
    if (decisions.length) throw new MutationConflictError("You have already reviewed this request.");
    if (row.escalated || (Number(row.required_approvals) > 1 && Number(row.approval_count) > 0)) authorize(context.actor, "kyc:senior-review");
    await context.write("kyc_cases", { sql: "UPDATE kyc_cases SET assigned_to = ? WHERE id = ? AND assigned_to IS NULL", args: [context.actor.id, id] });
  } else {
    requireAssignee(context, row);
    if (action === "approve" || action === "reject") await decideApproval(context, kycPolicy, id, action);
    if (action === "escalate" && row.requested_by === context.actor.id) throw new AccessError(403, "You cannot review your own request.");
    await context.write("kyc_cases", {
      sql: "UPDATE kyc_cases SET assigned_to = NULL, escalated = ? WHERE id = ?",
      args: [action === "escalate" ? 1 : Number(row.escalated), id],
    });
  }
  await recordEvent(context, id, action, note);
  return { id };
}

import type { ApprovalStatus } from "./approvals";
import type { Role } from "./permissions";

export const documentTypes = { passport: "Passport", national_id: "National ID", driving_licence: "Driving licence" } as const;
export type KycAction = "submit" | "claim" | "release" | "approve" | "reject" | "escalate";
export type KycCase = {
  id: string; customer: string; country: string; documentType: keyof typeof documentTypes; riskScore: number;
  requestedBy: string; status: ApprovalStatus; approvalCount: number; requiredApprovals: number;
  assignedTo: string | null; assigneeName: string | null; escalated: boolean; createdAt: string;
  history: { id: number; actorId: string; actorName: string; actorRole: Role; action: KycAction; note: string; occurredAt: string }[];
};

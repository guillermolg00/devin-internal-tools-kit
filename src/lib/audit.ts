export type AuditEntry = {
  id: number;
  mutationId: string;
  occurredAt: string;
  actor: { id: string; name: string; email: string | null; role: string };
  action: string;
  table: string;
  recordId: string;
  operation: "insert" | "update" | "delete" | "baseline";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export const AUDIT_PAGE_SIZE = 20;

export function auditCursor(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(parsed)) throw new Error("Invalid audit cursor");
  return parsed;
}

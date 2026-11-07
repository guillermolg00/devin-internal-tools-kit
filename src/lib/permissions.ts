export const roles = ["agent", "reviewer", "admin"] as const;
export type Role = (typeof roles)[number];
export type User = { id: string; name: string; email: string; role: Role };

export const permissions = {
  "workspace:read": { label: "View the workspace", description: "Access shared workspace data", roles },
  "note:write": { label: "Edit the workspace note", description: "Update the shared demo note", roles: ["reviewer", "admin"] },
  "users:read": { label: "View team directory", description: "Access the protected member list", roles: ["admin"] },
  "audit:read": { label: "Browse the audit log", description: "Inspect business changes and before/after snapshots", roles: ["admin"] },
  "refunds:read": { label: "View refunds", description: "Browse refund requests and review progress", roles },
  "refunds:create": { label: "Request a refund", description: "Submit a fixed customer, amount, and reason", roles: ["agent"] },
  "refunds:review": { label: "Review refunds", description: "Approve or reject another person's request", roles: ["reviewer"] },
  "kyc:read": { label: "View KYC cases", description: "Browse verification details and complete case history", roles },
  "kyc:create": { label: "Submit KYC verification", description: "Record signup verification details from the vendor", roles: ["agent"] },
  "kyc:review": { label: "Review KYC cases", description: "Claim, approve, reject, or escalate customer verification", roles: ["agent", "reviewer"] },
  "kyc:senior-review": { label: "Senior KYC review", description: "Review escalations and provide the second high-risk approval", roles: ["reviewer"] },
} as const satisfies Record<string, { label: string; description: string; roles: readonly Role[] }>;

export type Permission = keyof typeof permissions;

export function can(user: Pick<User, "role"> | null, permission: Permission): boolean {
  return !!user && (permissions[permission].roles as readonly string[]).includes(user.role);
}

export class AccessError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
  }
}

export function authorize(user: User | null, permission: Permission): User {
  if (!user) throw new AccessError(401, "Choose a demo user to continue.");
  if (!can(user, permission)) throw new AccessError(403, "Your role does not have permission to do that.");
  return user;
}

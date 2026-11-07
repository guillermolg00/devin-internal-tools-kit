import "server-only";
import { MutationInputError, type MutationDefinition, type MutationContext } from "./mutation";
import { createRefund, reviewRefund } from "./refunds";
import { createKyc, reviewKyc } from "./kyc";

export const mutations = {
  "kyc.create": { permission: "kyc:create", tables: ["approval_requests", "kyc_cases", "kyc_events"], run: createKyc },
  "kyc.review": { permission: "kyc:review", tables: ["approval_requests", "approval_decisions", "kyc_cases", "kyc_events"], run: reviewKyc },
  "refunds.create": { permission: "refunds:create", tables: ["approval_requests", "refund_requests"], run: createRefund },
  "refunds.review": { permission: "refunds:review", tables: ["approval_requests", "approval_decisions"], run: reviewRefund },
  "workspace.note.update": {
    permission: "note:write",
    tables: ["workspace_note"],
    async run(context: MutationContext, input: unknown) {
      const content = (input as { content?: unknown } | null)?.content;
      if (typeof content !== "string" || !content.trim() || content.trim().length > 1000) {
        throw new MutationInputError("Write a note between 1 and 1,000 characters.");
      }
      await context.write("workspace_note", {
        sql: "UPDATE workspace_note SET content = ?, updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1",
        args: [content.trim(), context.actor.id],
      });
    },
  },
} as const satisfies Record<string, MutationDefinition>;

export type MutationName = keyof typeof mutations;

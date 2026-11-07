import "server-only";
import type { Permission } from "./permissions";

export class MutationInputError extends Error {}

export const mutations = {
  "workspace.note.update": {
    permission: "note:write" satisfies Permission,
    table: "workspace_note",
    statement(input: unknown, actorId: string) {
      const content = (input as { content?: unknown } | null)?.content;
      if (typeof content !== "string" || !content.trim() || content.trim().length > 1000) {
        throw new MutationInputError("Write a note between 1 and 1,000 characters.");
      }
      return {
        sql: "UPDATE workspace_note SET content = ?, updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1",
        args: [content.trim(), actorId],
      };
    },
  },
} as const;

export type MutationName = keyof typeof mutations;

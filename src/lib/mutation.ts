import "server-only";
import type { Permission, User } from "./permissions";

export class MutationInputError extends Error {}
export class MutationConflictError extends Error {}
export class MutationNotFoundError extends Error {}

export type Statement = { sql: string; args?: (string | number | null)[] };
export type MutationContext = {
  actor: User;
  read(statement: Statement): Promise<Record<string, unknown>[]>;
  write(table: string, statement: Statement): Promise<void>;
};
export type MutationDefinition = {
  permission: Permission;
  tables: readonly string[];
  run(context: MutationContext, input: unknown): Promise<unknown>;
};

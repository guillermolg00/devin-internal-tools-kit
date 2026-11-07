# Add an internal tool

## Overview

A tool is a module in the existing Next.js workspace, not a separate service. Start with [AGENTS.md](../AGENTS.md) for setup/check commands and [README](../README.md) for demo limitations. Use fictional data only.

## Inputs

Choose a URL/name, fields, allowed roles per action, immutable details, and any approval quorum. Identify resource/tenant checks needed; there is no tenant model yet. Follow [refunds](../src/lib/refunds.ts), but omit approvals if unnecessary.

## Procedure

### 1. Declare permissions

Add `<tool>:read`, `<tool>:create`, and optionally `<tool>:review` to [permissions.ts](../src/lib/permissions.ts), with `label`, `description`, and explicit `roles`. `Permission` is inferred; admin is not a wildcard. Extend [permissions.test.ts](../tests/unit/permissions.test.ts) for all roles and anonymous access.

### 2. Add schema and audit registration

Add idempotent schema changes in `Store.initialize()` in [database.ts](../src/lib/database.ts), **before** `installAuditing(tx)`; record the next `schema_migrations` version. `CREATE TABLE IF NOT EXISTS` does not upgrade existing columns. Preserve existing data; give tables explicit, non-null, immutable primary keys and appropriate constraints/foreign keys.

Add one entry to `auditedTables` in [audit-schema.ts](../src/lib/audit-schema.ts). For example, refunds already declares:

```ts
{ table: "refund_requests", columns: ["id", "approval_id", "customer", "amount_cents", "reason"] }
```

List all traceable columns, never secrets. The generator discovers primary keys, installs write guards/snapshot triggers, and baselines existing rows on first registration. **No hand-written audit triggers or business-table exclusions:** undeclared tables fail startup.

### 3. Register named mutations

Implement server-only `(context: MutationContext, input: unknown)` operations, as in [refunds.ts](../src/lib/refunds.ts). Validate input/resource access there; use `context.actor`, SELECT-only `context.read()`, and parameterized `context.write(table, { sql, args })`. Never import a database driver into a tool.

Register operations in [mutations.ts](../src/lib/mutations.ts) with `permission`, every table they write, and `run`. The existing refund entries are:

```ts
"refunds.create": { permission: "refunds:create", tables: ["approval_requests", "refund_requests"], run: createRefund },
"refunds.review": { permission: "refunds:review", tables: ["approval_requests", "approval_decisions"], run: reviewRefund },
```

Call `getStore().mutate(name, serverUser.id, input)`: it reauthorizes the actor and commits all writes/audits with one transaction/mutation UUID. Exceptions, missing audits, or zero-row writes roll everything back. Never split one action across calls or insert audits yourself. [mutation.ts](../src/lib/mutation.ts) supplies input/conflict/not-found errors (HTTP 400/409/404).

### 4. Define an approval policy, if needed

Import `ApprovalPolicy`, `createApproval`, and `decideApproval` from [approvals.ts](../src/lib/approvals.ts). Refunds supplies this policy:

```ts
export const refundPolicy: ApprovalPolicy<{ amountCents: number }> = {
  key: "refunds", version: 1, resourceType: "refund", permission: "refunds:review",
  requiredApprovals: ({ amountCents }) => amountCents > 50_000 ? 2 : 1,
};
```

Choose a stable key/resource type, version, registered review permission, and positive integer quorum from **server-validated facts**. Inside the create mutation, call `createApproval(context, policy, resourceId, facts)` and save its approval ID with the domain row. Inside review, validate the decision then call `decideApproval(context, policy, resourceId, decision)`. Declare shared tables as above.

The engine owns reviewer uniqueness, no self-review, immediate rejection, and finality; policy identity/version and quorum are saved at creation. Route in-flight requests to their original policy when introducing versions; mismatches fail closed. Never duplicate transitions/counts in tools or UI. [approvals.test.ts](../tests/unit/approvals.test.ts) shows a different, KYC-style quorum. For money, follow refunds' integer cents/decimal strings, not floats.

### 5. Wire server reads, routes, and UI

Add a plain-DTO read method to `Store`, following `refunds()`. Create `src/app/(workspace)/<tool>/page.tsx`; call `authorize(await pageUser(), "<tool>:read")` **before** loading data. Pass serializable props to client UI.

Add `src/app/api/<tool>/` handlers following the [collection](../src/app/api/refunds/route.ts) and [decision](../src/app/api/refunds/[id]/decisions/route.ts) routes: `requirePermission()` independently in each, plus `checkOrigin()` for mutations. Use the session-derived actor and `Store.mutate()`, then [http.ts](../src/lib/http.ts)'s `json()` / `apiError()`. Await dynamic `params`; never trust body-supplied actors, roles, quorum, or status.

Add [navigation](../src/components/navigation.tsx) and [overview](../src/app/(workspace)/page.tsx) links; remove any placeholder. `can()` reflects permissions, never enforces them. Keep domain rules out of components.

### 6. Add regression coverage

- Use [tests/fixture.ts](../tests/fixture.ts) for isolated SQLite/cleanup. Follow [audit tests](../tests/unit/audit.test.ts): validation, snapshots/actors, shared mutation IDs, business/audit rollback, direct-SQL bypass rejection, and reopen/migration persistence. Raw SQL is for test setup/probes only.
- Follow [refunds tests](../tests/unit/refunds.test.ts) for quorum boundaries, promoted-creator self-review, duplicates, partial rejection, finality, concurrency, and unchanged data/audits after denials.
- Extend [HTTP integration](../tests/integration.ts) for anonymous/wrong-role access, spoofed identities, malformed input, cross-origin writes, no-store responses, and restart persistence. Hidden buttons do not prove authorization.

## Done when

Run [AGENTS.md](../AGENTS.md)'s full verification command (build before integration). For schema changes, test fresh and upgrade fixtures. Update user-facing docs; open a focused PR stating checks/untested behavior, without merging it yourself.

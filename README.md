# Foundry · Internal tools kit

A small shared foundation for code-based internal tools, built with Next.js App Router, TypeScript, and local SQLite. Includes a workspace shell, seeded demo identities, server-side role-based permissions, and a persisted note as a minimal read/write example.

The first tool is a refunds dashboard with audited, reusable approvals. The KYC queue and feature-flag admin remain **future modules**. No payments are issued by this app.

## Run

Requires Node.js 22+. Either package manager works:

```sh
npm install && npm run dev      # or: bun install && bun run dev
```

Open http://localhost:3000 and choose a demo user. No environment file, external service, manual migration, or seed command is required. Next.js runs on Node in both cases; Bun is only required for the test suite (`bun run test`, `bun run test:integration`). The first database access creates `data/internal-tools.db`, sets up the schema, and seeds fictional users and a note. Setup is idempotent and never overwrites existing notes or roles.

Optional configuration is documented in `.env.example`. Set `DATABASE_PATH` to use another SQLite file. The directory is created automatically. Stop the app and delete its database file to reset the sandbox; the next access recreates it. Database files, sessions, environment files, and build output are ignored by git.

## Demo roles

| Identity | Role | Workspace / note read | Note write | Team directory |
| --- | --- | --- | --- | --- |
| Alex Morgan | agent | Yes | No | No |
| Sam Rivera | reviewer | Yes | Yes | No |
| Priya Shah | reviewer | Yes | Yes | No |
| Jordan Lee | admin | Yes | Yes | Yes |

Only admins can also browse `/audit` and `GET /api/audit`.

All three roles can view refunds. Only agents submit requests; only reviewers decide. Admins have read/audit access, not an approval override. The second reviewer is added automatically to existing databases without changing existing users or roles.

Switch users from the top-right identity menu or sign out to return to the picker. The access page includes the policy matrix and a button that calls the admin-only API directly.

### This is deliberately fake authentication

**Anyone can select admin in demo mode. Never expose this app publicly or put real customer, payment, or KYC data into it.** The role switcher demonstrates authorization boundaries, not trustworthy identity verification. There are no passwords, SSO, MFA, tenants, or production identity provisioning.

- Sessions use random 256-bit opaque tokens in HTTP-only, SameSite=Lax cookies, with an eight-hour expiry; only SHA-256 token hashes are stored in SQLite. HTTPS-origin requests receive Secure cookies.
- Switching identity revokes the previous session. Signing out revokes the server-side session. Invalid or expired tokens are unauthenticated.
- The role is loaded from SQLite on each request, never taken from the cookie payload, a client-supplied role, or React state.
- Every protected page checks access before fetching protected data. Every API handler checks independently; a layout or hidden button is not the security boundary.
- API responses use `Cache-Control: no-store`. Mutations require a same-origin Origin header.
- `next build` / `next start` disables fake login by default. For a **private demo only**, use `ENABLE_DEMO_AUTH=true bun run start` after building. Do not enable it on a real-data deployment.

Before production, replace `/api/session` and the seeded picker with a real identity provider and controlled user provisioning. Keep the permission policy and server guards; add tool-specific resource/tenant checks, audit trails, and operational controls. Use a persistent disk if hosting SQLite: this setup is for a single local server, not ephemeral or horizontally scaled serverless instances.

## Shared structure

```text
src/app/(workspace)/     Shared layout, overview, refunds, permissions, team, audit
src/app/login/           Explicit fake-login picker
src/app/api/             Guarded session, note, user, refund, and audit endpoints
src/components/          Navigation, role switcher, note editor, permission probe
src/lib/permissions.ts   Typed roles, permission map, can(), authorize()
src/lib/auth.ts          Server-only session lookup and request/page guards
src/lib/database.ts      Private SQLite client, atomic mutations, read access, sessions
src/lib/audit-schema.ts  Audited-table declarations and generated SQL protections
src/lib/mutations.ts     Typed business mutation registry and input validation
src/lib/mutation.ts      Internal transactional capabilities and mutation errors
src/lib/approvals.ts     Shared policy-driven approval operations and transitions
src/lib/refunds.ts       Refund policy, exact USD validation, and named operations
src/lib/http.ts          Same-origin mutation check and consistent API errors
tests/unit/              Policy, seeding, session, and persistence regression tests
tests/integration.ts     Real HTTP checks against a production build
```

SQLite is accessed with `@libsql/client` using a local `file:` URL; **no Turso account or network database is used**. Queries are parameterized. Initialization applies audit schema version 1 and approval/refund schema version 2, generating table protections transactionally. Existing notes become one explicitly labelled system baseline; no old values or actors are invented. Fresh notes are recorded as system seeds. Reopening the database neither reseeds nor duplicates the baseline. Future structural table changes still need their own migrations.

## Refunds and shared approvals

Open `/refunds`. Agents submit a customer name/reference, positive USD amount, and reason. Amounts are stored as integer cents, parsed from decimal strings without floating-point rounding. Submission details cannot be edited or deleted. The dashboard filters pending, approved, and rejected requests, shows decision history, and preserves the current page when switching demo users. Refresh to see another browser's changes.

- Up to and including **$500.00**: one reviewer approval completes review.
- **$500.01 and above**: two different reviewers must approve. The first approval leaves the request pending with progress 1/2.
- A reviewer gets one immutable decision per request. Any rejection makes a pending request final, including after a partial approval. Approval and rejection after a terminal state return `409` without changing data or generating audit noise.
- Nobody may review their own request, even if the creator's role changes later. Role permissions are reloaded inside the write transaction; admin is not an override.
- Concurrent decisions are serialized and re-read inside `BEGIN IMMEDIATE`, with a unique `(approval_id, reviewer_id)` constraint as defense in depth.

`ApprovalPolicy<Facts>` supplies a key/version, resource type, reviewer permission, and quorum function. Refunds supplies only the amount-based rule. The shared engine owns self-review prevention, reviewer uniqueness, progress, rejection, and finality. The policy identity/version and required quorum are saved on submission, so a later rule change cannot silently change an in-flight request's quorum. Retain support for old policy versions when evolving policies; mismatched versions fail closed. A KYC-style policy test exercises the same operations with risk-based three-person approval and a different permission, without adding a KYC tool.

Shared tables `approval_requests` and `approval_decisions` store workflow state and decisions; `refund_requests` stores fixed domain details. All three use the same one-declaration audit generator. Creation writes a workflow and a refund; review inserts a decision and updates progress/state. Each operation shares one mutation UUID across all affected audit rows. A business failure, missing audit trigger, or failed audit insert rolls back every row in the operation.

### Refund API

- `GET /api/refunds`: authenticated list, newest first, `Cache-Control: no-store`.
- `POST /api/refunds`: agent only; e.g. `{ "customer": "Customer 42", "amount": "500.01", "reason": "Duplicate charge" }`. Amount is a decimal **string**, not a JSON float. Returns `201` with `result.id` and `mutationId`.
- `POST /api/refunds/:id/decisions`: reviewer only; `{ "decision": "approve" }` or `{ "decision": "reject" }`. The actor comes from the session, and the target ID from the URL. Client-supplied identities, status, and quorum are not trusted.
- All writes require same-origin requests. There are no request-edit/delete or decision-edit/delete endpoints. These are approval records, **not payment execution**.

## Atomic business auditing

`Store.mutate(name, actorId, input)` is the only exposed business-write API. The HTTP handler obtains the actor ID from the server session, never from the request body. Inside a `BEGIN IMMEDIATE` transaction it reloads the actor, checks the registered mutation's permission, validates input, establishes a transaction-scoped context, and performs the change. Registry implementations receive SELECT-only reads and writes restricted to their declared audited tables, never a raw client. Each write must produce an audit entry for every affected row; no-op writes fail closed too. Generated SQLite triggers append exact `OLD`/`NEW` snapshots. The writes and audit commit together. Any exception rolls the entire transaction back; the context is cleared before commit. Callers cannot supply arbitrary transaction callbacks, and lint rejects direct database-driver imports outside database internals.

Each entry records a stable sequence ID, mutation UUID, database-generated UTC timestamp, actor ID/name/email/role **as they were at the time**, action, table, primary-key identity, operation, and the declared before/after columns. Actor snapshots have no foreign-key cascade to live users. A deletion has no after-record; an insertion has no before-record. A baseline only says what existed when audit capture began, not who originally changed it.

SQLite triggers reject direct business row writes without a matching mutation context and reject audit-row UPDATE, DELETE, UPSERT, and REPLACE attempts. Audit INSERT also requires a matching context; log replacement protection does not rely on a connection's `recursive_triggers` setting. Business primary keys are immutable and non-null. Named operations may explicitly write multiple declared tables in one transaction; each statement's context targets its own table, so implicit cross-table cascades remain rejected rather than silently skipped. Unknown business tables cause initialization to fail unless declared for auditing. The explicitly excluded internal tables are user/session provisioning, audit infrastructure, and migration metadata; tokens and session bookkeeping never enter business snapshots. User/role administration is not yet a supported mutation workflow and would need dedicated audited operations before production.

Database operations (including session bookkeeping) are queued within the singleton store on one connection, preserving connection-local PRAGMAs and preventing transaction reentry or lock contention between simultaneous requests. This is a single-server development foundation, not a multi-process write coordinator.

**Boundary:** SQLite has no separate untrusted-DML role here. A person with arbitrary SQL/file ownership can forge the internal context, drop triggers, or replace the file. These controls prevent ordinary row tampering and accidental application bypass; they are not protection against the database owner, cryptographic integrity, WORM storage, or a compliance certification. Production requires trusted authentication, restricted filesystem/database access, and independently retained audit copies. Snapshot declarations must exclude secrets and select appropriate retention-sensitive data.

Admins can expand before/after snapshots in `/audit`. Both page and API enforce `audit:read` on the server. Entries use ID-based pagination (20 at a time, newest first); `?before=<positive ID>` retrieves older rows without offset pagination shifting under new writes. There are no edit/delete audit endpoints.

### Adding a tool

1. Create its table with an explicit primary key in a schema migration. Add **one** declaration to `auditedTables` in `src/lib/audit-schema.ts`, for example `{ table: "refunds", columns: ["id", "amount", "status"] }`. Primary keys (including composite keys) are discovered automatically. All INSERT/UPDATE/DELETE guard and snapshot triggers are generated; **do not hand-write triggers**. Columns must exist and be JSON-compatible. Only the declared columns are snapshotted.
2. Add permissions to `src/lib/permissions.ts` and a named operation to `src/lib/mutations.ts` with its allowed `tables`, permission, and validated implementation. Use the internal context's `read()` for SELECTs and `write(table, statement)` for each parameterized change. Route callers through `Store.mutate()`; do not add unaudited write methods or expose the client. A second-table test proves the declaration-based generator works without note-specific SQL.
3. Put its page beneath `src/app/(workspace)/`. Authorize server-side before protected reads. In **each** API handler, independently call `requirePermission()`; for mutations also call `checkOrigin()` and pass the server user's ID to `mutate()`, never a body-supplied actor. Input and authorization checks repeat inside the transaction.
4. Use `can()` only to reflect access in the UI. Add negative HTTP and audit-rollback tests. Add resource/tenant checks inside the mutation transaction when a global role is insufficient.
5. For approvals, define a tool policy and call `createApproval()` / `decideApproval()` from its named operations. Declare the shared workflow/decision tables alongside the tool's tables in the operation. Do not implement approval counting or finality again in routes or UI.

## Verify

```sh
bun run lint
bun run typecheck
bun run test
bun run build
bun run test:integration
```

Use `bun run test`, not bare `bun test`: the test script supplies the `react-server` condition so Bun can import modules protected by `server-only`. Integration checks start their own production server on port 3107 (`TEST_PORT` can override it), use a disposable database, and stop it afterward. They cover unauthenticated requests, forged cookies and roles, all three role boundaries, mutation validation, cross-origin rejection, session switching/logout, production demo-login gating, and persistence across server restarts. No browser automation is needed for these API checks.

CI runs the same verification commands. There are no pre-commit hooks; run the checks before committing.

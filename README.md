# Foundry · Internal tools kit

## For evaluators: internal tools with Devin instead of Power Apps

**What this is.** A prototype that answers one question: *can a fintech build its internal tools in code with Devin instead of paying for Microsoft Power Apps?* It is evidence for that decision, not a production system. Sign-in is a demo picker, storage is single-node SQLite, and nothing is deployed.

**Results at a glance.**

| | |
| --- | --- |
| Wall-clock time | About 1h40m from first commit to final merge, including human review (budget: 2h) |
| Devin compute | The whole prototype used **17% of one week's included quota on a $20/month Devin Pro seat**: about $0.80 of plan usage, with $0.00 on-demand spend. Every session also fell in Devin's smallest reporting tier, XS (≤ $4). |
| Who wrote it | Devin opened the 9 PRs that contain all the application code. A human reviewed and merged every PR, and wrote only small ones (a run fix, a review pass, and docs). |
| App #N | The KYC queue came from **one plain-language message** in a fresh session, with zero interventions during the build |
| Change request | Compliance sign-off came from a single ticket written as a finance ops lead. It added a new role, migrated the schema in place, and **flagged** its in-flight policy decision for human review instead of making it silently. |
| Assurance | 106 unit tests, HTTP integration tests against a real server, Devin-run browser E2E checks, and CI on every PR. The E2E run caught a UI bug that the unit tests missed (#10). |

Our estimate, not a measurement: comparable scope with this level of testing usually takes an engineer several weeks. Here the engineer's job was to review, decide, and correct. Devin's compute is negligible next to the people. The cost that matters is the review and ownership time described below.

**What was built.**
- A shared platform: server-side permission checks on every page and API; an atomic, append-only audit log, where a business write and its audit rows commit or roll back together; and a reusable approval engine with quorum, no self-review, and final decisions.
- On top of the platform: a refunds dashboard and a KYC review queue.
- A later change request: compliance sign-off for refunds above $5,000.
- Feature-flag admin is only a placeholder.

**Power Apps capabilities, mapped to this repo.** Effort estimates assume Devin builds and an engineer reviews. They are judgment, not measured.

| Power Apps capability | Built here | Not built in this prototype, buildable with Devin (rough effort) | Not a code problem: owned by the client regardless |
| --- | --- | --- | --- |
| Fast app creation over Dataverse | Shared platform plus [playbook](docs/new-app-playbook.md); the KYC queue came from one ticket | Postgres plus per-tool versioned migrations (~1–2 days) | — |
| Entra ID sign-in and provisioning | Demo login only; anyone can pick admin | SSO (Entra ID/Okta OIDC) plus SCIM (~1–3 days, including security review) | — |
| Dataverse security roles | Server-side role checks, but roles are global, not per tool | Per-tool roles plus audited access changes (~1–2 days) | Access decisions: who may do what |
| Power Automate approvals | Shared approval engine with an optional extra sign-off | — | Policy decisions, e.g. when a new rule takes effect |
| Dataverse auditing | Append-only audit log with actor snapshots, guarded by SQLite triggers (not tamper-proof storage) | Export to tamper-resistant storage, part of the Postgres move (not estimated) | — |
| 1,000+ connectors | None; KYC has an intake endpoint but no vendor client | Only the few in use, e.g. ledger, payment processor, KYC vendor, Slack (hours to a day each) | — |
| Environments, ALM, hosting | Git, PRs, CI (tests plus a dev-server smoke test) | Deploy on their cloud: IaC, CI/CD, observability, backups (~3–5 days) | Operations: on-call, uptime, incident response |
| DLP | Not a toggle here; code review is the closest equivalent | Secrets management and egress control (not estimated) | — |
| Compliance attestations (SOC, ISO) | — | — | Compliance accountability: Microsoft certifies its own platform, not customer-built apps |

Total one-time platform hardening: roughly 2–4 engineer-weeks with Devin.

**Citizen development changes shape.** In Power Apps, a non-engineer builds and publishes without code review. Here, the same person writes a plain-language ticket, Devin opens a tested PR, and an engineer reviews it before anything ships. For a regulated company, that is a deliberate trade-off.

**How it was built.** Devin sessions opened the PRs below, apart from #4 and #9, which a human wrote. A human reviewed and merged every PR.
1. A research session, running in parallel with the rest: [#1](https://github.com/guillermolg00/devin-internal-tools-kit/pull/1), a sourced brief on Power Apps.
2. The foundation session: [#2](https://github.com/guillermolg00/devin-internal-tools-kit/pull/2) the platform and permissions, [#3](https://github.com/guillermolg00/devin-internal-tools-kit/pull/3) the audit log, [#5](https://github.com/guillermolg00/devin-internal-tools-kit/pull/5) refunds, and [#6](https://github.com/guillermolg00/devin-internal-tools-kit/pull/6) contributor conventions and the playbook.
3. Human: [#4](https://github.com/guillermolg00/devin-internal-tools-kit/pull/4), so that a fresh clone runs on Node.
4. A fresh session given one plain-language ticket: [#7](https://github.com/guillermolg00/devin-internal-tools-kit/pull/7), the KYC queue. It mapped KYC roles onto the existing roles without asking; see Known gaps.
5. Another fresh session given a change request: [#8](https://github.com/guillermolg00/devin-internal-tools-kit/pull/8), compliance sign-off. It flagged its in-flight policy decision for review: pending refunds move to the new rule.
6. Human review pass: [#9](https://github.com/guillermolg00/devin-internal-tools-kit/pull/9), CI hardening, Known gaps, and the reasoning log.
7. Devin's own browser E2E run of the compliance flow: [#10](https://github.com/guillermolg00/devin-internal-tools-kit/pull/10). It caught a misleading "sign-off complete" label after compliance declined a refund, a bug that every unit and HTTP test had missed.

**More detail:** [Power Apps research](docs/research/power-apps.md) · [Reasoning log](docs/reasoning-log.md) (step 23 explains the three categories) · [New-tool playbook](docs/new-app-playbook.md) · [Known gaps before production](#known-gaps-before-production-from-human-review)

---

A small shared foundation for code-based internal tools, built with Next.js App Router, TypeScript, and local SQLite. Includes a workspace shell, seeded demo identities, server-side role-based permissions, and a persisted note as a minimal read/write example.

Includes a refunds dashboard and KYC review queue with audited, reusable approvals. Feature-flag admin remains a **future module**. No payments are issued by this app.

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
| Casey Chen | agent | Yes | No | No |
| Sam Rivera | reviewer | Yes | Yes | No |
| Priya Shah | reviewer | Yes | Yes | No |
| Morgan Ellis | compliance | Yes | No | No |
| Jordan Lee | admin | Yes | Yes | Yes |

Only admins can also browse `/audit` and `GET /api/audit`.

All roles can view refunds. Only agents submit requests; only reviewers approve or reject them. Compliance users can only sign off (or decline) refunds above $5,000; they cannot approve or reject any refund as a reviewer. Admins have read/audit access, not an approval override. New demo users are added automatically to existing databases without changing existing users or roles; adding the compliance role rebuilds the `users` table once to widen its role constraint, preserving users and sessions.

For KYC, agents are analysts and the reviewer role is explicitly granted senior KYC review. Both can claim and decide cases; only agents submit vendor results. Admins have read/audit access only. Casey is a second analyst so a different person can review Alex’s intake. New demo users are added without changing existing identities or roles.

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
src/app/(workspace)/     Shared layout, overview, refunds, KYC, permissions, team, audit
src/app/login/           Explicit fake-login picker
src/app/api/             Guarded session, note, user, refund, KYC, and audit endpoints
src/components/          Navigation, role switcher, note editor, permission probe
src/lib/permissions.ts   Typed roles, permission map, can(), authorize()
src/lib/auth.ts          Server-only session lookup and request/page guards
src/lib/database.ts      Private SQLite client, atomic mutations, read access, sessions
src/lib/audit-schema.ts  Audited-table declarations and generated SQL protections
src/lib/mutations.ts     Typed business mutation registry and input validation
src/lib/mutation.ts      Internal transactional capabilities and mutation errors
src/lib/approvals.ts     Shared policy-driven approval operations and transitions
src/lib/refunds.ts       Refund policy, exact USD validation, and named operations
src/lib/kyc.ts           Risk-based policy, claims, escalation, and case history
src/lib/http.ts          Same-origin mutation check and consistent API errors
tests/unit/              Policy, seeding, session, and persistence regression tests
tests/integration.ts     Real HTTP checks against a production build
```

SQLite is accessed with `@libsql/client` using a local `file:` URL; **no Turso account or network database is used**. Queries are parameterized. Initialization applies audit schema version 1, approval/refund schema version 2, KYC schema version 3, and compliance sign-off schema version 4, generating table protections transactionally. Version 4 also moves **pending** version-1 refunds onto refund policy version 2 so the sign-off rule applies to them immediately (above $5,000 they now also need compliance; existing approvals are kept); this is one audited `system.migration.refund-compliance-signoff` update per request. Final refunds keep their original policy version. Existing notes become one explicitly labelled system baseline; no old values or actors are invented. Fresh notes are recorded as system seeds. Reopening the database neither reseeds nor duplicates the baseline. Future structural table changes still need their own migrations.

## Refunds and shared approvals

Open `/refunds`. Agents submit a customer name/reference, positive USD amount, and reason. Amounts are stored as integer cents, parsed from decimal strings without floating-point rounding. Submission details cannot be edited or deleted. The dashboard filters pending, approved, and rejected requests, shows decision history, and preserves the current page when switching demo users. Refresh to see another browser's changes.

- Up to and including **$500.00**: one reviewer approval completes review.
- **$500.01 and above**: two different reviewers must approve. The first approval leaves the request pending with progress 1/2.
- **$5,000.01 and above**: in addition to the two reviewer approvals, someone with `refunds:compliance-signoff` (the compliance role) must sign off. The sign-off can come before or after the reviewers, never counts as a reviewer approval, and a further reviewer approval cannot replace it. A compliance decline is a rejection and is final. Exactly $5,000.00 needs no sign-off.
- Nobody may act twice on the same request in any capacity: a reviewer who later moves to compliance cannot also sign off, and the requester cannot sign off their own request.
- A reviewer gets one immutable decision per request. Any rejection makes a pending request final, including after a partial approval. Approval and rejection after a terminal state return `409` without changing data or generating audit noise.
- Nobody may review their own request, even if the creator's role changes later. Role permissions are reloaded inside the write transaction; admin is not an override.
- Concurrent decisions are serialized and re-read inside `BEGIN IMMEDIATE`, with a unique `(approval_id, reviewer_id)` constraint as defense in depth.

`ApprovalPolicy<Facts>` supplies a key/version, resource type, reviewer permission, and quorum function, plus an optional `signoff: { permission, required(facts) }` for one extra sign-off from a separate permission. Refunds supplies only the amount-based rules (policy version 2 adds the compliance sign-off). Whether a sign-off is required is saved on submission next to the quorum, and each decision records its `capacity` (`review` or `signoff`). The shared engine owns self-review prevention, reviewer uniqueness, progress, rejection, and finality. The policy identity/version and required quorum are saved on submission, so a later rule change cannot silently change an in-flight request's quorum; deliberately applying a new rule to in-flight requests needs an explicit, audited migration (as schema version 4 does for compliance sign-off). Retain support for old policy versions when evolving policies; mismatched versions fail closed. A KYC-style policy test exercises the same operations with risk-based three-person approval and a different permission, without adding a KYC tool.

Shared tables `approval_requests` and `approval_decisions` store workflow state and decisions; `refund_requests` stores fixed domain details. All three use the same one-declaration audit generator. Creation writes a workflow and a refund; review inserts a decision and updates progress/state. Each operation shares one mutation UUID across all affected audit rows. A business failure, missing audit trigger, or failed audit insert rolls back every row in the operation.

### Refund API

- `GET /api/refunds`: authenticated list, newest first, `Cache-Control: no-store`.
- `POST /api/refunds`: agent only; e.g. `{ "customer": "Customer 42", "amount": "500.01", "reason": "Duplicate charge" }`. Amount is a decimal **string**, not a JSON float. Returns `201` with `result.id` and `mutationId`.
- `POST /api/refunds/:id/decisions`: reviewer only; `{ "decision": "approve" }` or `{ "decision": "reject" }`. The actor comes from the session, and the target ID from the URL. Client-supplied identities, status, and quorum are not trusted.
- `POST /api/refunds/:id/signoff`: compliance only; `{ "decision": "approve" }` signs off, `{ "decision": "reject" }` declines. Returns `409` for refunds of $5,000.00 or less, after a sign-off already exists, or once final. The capacity is fixed by the route; a body cannot change it.
- All writes require same-origin requests. There are no request-edit/delete or decision-edit/delete endpoints. These are approval records, **not payment execution**.

## KYC review queue

Open `/kyc`. The queue shows customer name, two-letter country code, document type, vendor risk score, assignment, status, and approval progress. Filter pending, escalated, assigned-to-me, approved, rejected, or all cases. Open a case to inspect its immutable intake details and full chronological history. Refresh to see another browser’s changes.

- **Below 70:** one approval completes review. **70–100 inclusive:** two distinct approvals are required; the second must have `kyc:senior-review` (the existing reviewer role). A senior first approval does not bypass the second-person requirement.
- Analysts and senior reviewers must **claim** a pending case before acting. Claims are exclusive and audited. The owner can release a case without a decision. A partial approval releases the case for a different senior reviewer; terminal cases are locked.
- Approve, reject, and escalate require a reason. Rejection is final, including after a partial approval. Escalation is not an approval or rejection: it releases the claim and routes the still-pending case to senior review, even for low scores. High-risk escalations still require two approvals.
- Anyone who has **ever escalated** a case cannot pick it up or approve it, even after a role change or another escalation. The intake submitter cannot review their own case, and a reviewer can approve/reject only once. Roles and eligibility are rechecked inside the transaction; admins have no override.
- Every submission, claim, release, escalation and decision records an ordered case event with timestamp, reason, and actor name/role **at the time**. Approval decisions also use the shared engine. All affected rows and before/after audits commit under one mutation ID or roll back together. There are no intake-edit, history-edit, or delete endpoints.

### KYC intake and API

This repo has no customer-signup system or vendor client. `POST /api/kyc` is the authenticated intake adapter to call when signup verification results are available; the “Add signup verification” form exercises it with fictional data. It does **not** fetch vendor scores, accept document uploads, or install an external webhook. Production integration must use trusted service authentication, authenticated vendor results, and idempotent vendor/customer references rather than expose this demo endpoint to customers.

- `GET /api/kyc`: all roles; returns `{ cases }` with full case history, newest cases first and events in sequence order.
- `POST /api/kyc`: agent only; `{ "customer": "Fictional Customer", "country": "ES", "documentType": "passport", "riskScore": 70 }`. Document types: `passport`, `national_id`, `driving_licence`. Risk must be a numeric, finite value from 0 to 100; decimal scores are supported. Returns `201` with `result.id` and `mutationId`. Actor, quorum, assignment, and status cannot be supplied by the caller.
- `POST /api/kyc/:id/actions`: agent/reviewer; `{ "action": "claim" }`, `{ "action": "release" }`, or `{ "action": "approve" | "reject" | "escalate", "note": "Reason, 1–1000 characters" }`. Eligibility is resource- and stage-specific, not just role-based.
- Every API response is `no-store`; mutations require the same Origin and a server session. Invalid input returns `400`, denied access `401`/`403`, missing cases `404`, and claim/finality conflicts `409`. Failed attempts create no audit noise.

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

## Known gaps before production (from human review)

All of these pass the test suite, because the tests encode the current design. They need a decision before real use:

- **Roles are global, not per tool.** One `role` per user drives every tool. KYC maps "analyst" to `agent` and "senior reviewer" to `reviewer`, so anyone who reviews refunds is automatically a senior KYC approver, and any support agent can approve low-risk KYC. `kyc:read`, including customer PII, is granted to every role. Production needs per-tool role assignments (least privilege, segregation of duties) sourced from the identity provider.
- **Access changes are not audited.** `users` is internal and seeded. Role assignment should come from the IdP (SSO + SCIM) with its own audit trail, or through dedicated audited operations.
- **Tool migrations live in the platform core.** `Store.initialize()` in `src/lib/database.ts` holds every tool's schema and data migrations (the v4 refunds-policy migration imports a refunds constant). Before more tools are added, move to per-tool, versioned migrations.
- **Policy changes need an explicit in-flight decision.** Approval requests store their policy version. v4 deliberately moved pending refunds onto the new compliance policy, and each move is audited. Any future policy change must make the same call on purpose.
- **Single-node SQLite.** All database access is serialized on one connection. Production means Postgres, with the actor carried per transaction, plus audit export to tamper-resistant storage.
- **Demo identity only.** See "This is deliberately fake authentication" above.

## Verify

```sh
bun run lint
bun run typecheck
bun run test
bun run build
bun run test:integration
```

Use `bun run test`, not bare `bun test`: the test script supplies the `react-server` condition so Bun can import modules protected by `server-only`. Integration checks start their own production server on port 3107 (`TEST_PORT` can override it), use a disposable database, and stop it afterward. They cover unauthenticated requests, forged cookies and roles, all four role boundaries, mutation validation, cross-origin rejection, session switching/logout, production demo-login gating, and persistence across server restarts. No browser automation is needed for these API checks.

CI runs the same verification commands, plus a smoke test that `bun run dev` serves `/login` from a fresh checkout. There are no pre-commit hooks; run the checks before committing.

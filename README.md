# Foundry · Internal tools kit

A small shared foundation for code-based internal tools, built with Next.js App Router, TypeScript, and local SQLite. Includes a workspace shell, seeded demo identities, server-side role-based permissions, and a persisted note as a minimal read/write example.

The KYC queue, refunds dashboard, and feature-flag admin are **future modules**, not implemented business workflows.

## Run

Install [Bun](https://bun.sh/docs/installation) (verified with 1.4.4), then:

```sh
bun install && bun run dev
```

Open http://localhost:3000 and choose a demo user. No environment file, external service, Node installation, manual migration, or seed command is required. The first database access creates `data/internal-tools.db`, sets up the schema, and seeds fictional users and a note. Setup is idempotent and never overwrites existing notes or roles. Bun executes Next.js itself, not just the package scripts.

Optional configuration is documented in `.env.example`. Set `DATABASE_PATH` to use another SQLite file. The directory is created automatically. Stop the app and delete its database file to reset the sandbox; the next access recreates it. Database files, sessions, environment files, and build output are ignored by git.

## Demo roles

| Identity | Role | Workspace / note read | Note write | Team directory |
| --- | --- | --- | --- | --- |
| Alex Morgan | agent | Yes | No | No |
| Sam Rivera | reviewer | Yes | Yes | No |
| Jordan Lee | admin | Yes | Yes | Yes |

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
src/app/(workspace)/     Shared layout, overview, permissions, protected team page
src/app/login/           Explicit fake-login picker
src/app/api/             Session endpoints and guarded note / user endpoints
src/components/          Navigation, role switcher, note editor, permission probe
src/lib/permissions.ts   Typed roles, permission map, can(), authorize()
src/lib/auth.ts          Server-only session lookup and request/page guards
src/lib/database.ts      Server-only SQLite access, schema, seeds, sessions
src/lib/http.ts          Same-origin mutation check and consistent API errors
tests/unit/              Policy, seeding, session, and persistence regression tests
tests/integration.ts     Real HTTP checks against a production build
```

SQLite is accessed with `@libsql/client` using a local `file:` URL; **no Turso account or network database is used**. Queries are parameterized. The initial schema is created transactionally on first use. Add versioned migrations before evolving an existing database schema.

### Adding a tool

1. Add its permissions to `src/lib/permissions.ts`, explicitly granting allowed roles.
2. Put its page beneath `src/app/(workspace)/` to reuse the shell. Resolve the server user and call `authorize()` before fetching protected data. The directory page shows an access-denied state without reading its protected data.
3. In **each** API handler, call `requirePermission()` before data access. On mutations, also call `checkOrigin()`, validate input, and use parameterized queries. Return 401 for missing/invalid sessions and 403 for insufficient permission.
4. Use `can()` only to reflect access in the UI, never as a substitute for the server check.
5. Add negative HTTP tests, including direct requests made without the UI. Add resource-level checks when the permission is narrower than a global role.

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

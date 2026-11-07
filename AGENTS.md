# Working in this repository

Next.js App Router + TypeScript + local SQLite. Tools share one app, shell, sessions, permissions, audit path, and approval engine. Follow [the new-tool playbook](docs/new-app-playbook.md); refunds is the working example, while KYC and feature flags are placeholders.

## Run and verify

Requires Node.js 22+ and Bun 1.4.4:

```sh
bun install --frozen-lockfile
bun run dev
```

Open http://localhost:3000 and choose a demo user. SQLite initializes automatically at `data/internal-tools.db` (`DATABASE_PATH` overrides it). Keep Next.js on **Node**, not `bun --bun`.

```sh
bun run lint && bun run typecheck && bun run test && bun run build && bun run test:integration
```

Use `bun run test`, not bare `bun test`, for the `react-server` condition. Build before integration tests; they start their own server and disposable database. See [README](README.md) for configuration.

## Contribution rules

- Guard every page/API independently before protected reads; `can()` only controls UI. Admin is not a wildcard. Mutation routes require `checkOrigin()` and a session-derived actor.
- Business writes use named `Store.mutate()` operations. Validate input/resource access inside the transaction; never expose a raw database client or bypass auditing.
- Add schema changes in `src/lib/database.ts` and table/column declarations in `src/lib/audit-schema.ts`; never hand-write audit triggers or exempt business tables.
- Reuse `src/lib/approvals.ts`; tools supply policies, not duplicate state machines.
- Keep server-only modules on the server. Preserve `currentUser()`'s plain object and serialize Client Component props. Use shared HTTP helpers for errors/no-store responses.
- Test denied access, workflow boundaries, concurrency, and audit rollback. Update these guides when shared patterns change.

Demo login lets anyone choose admin: never expose it publicly or use real customer data. Audit triggers guard row writes, not an owner who can alter the SQLite file or drop triggers.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

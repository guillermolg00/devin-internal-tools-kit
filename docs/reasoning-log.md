# Reasoning Log — Power Apps vs. Devin (build vs. buy)

Running log of how the problem was framed and how each decision was made, in order.
Started: 2026-11-07.

---

## Step 1 — Reframe the question

The VP asks: *"Can we use Devin to build our internal tools instead of paying for Power Apps?"*

Taken literally, the answer is trivially yes: Devin can build a CRUD screen over a refunds table.
That says nothing useful. The real question is:

> **Who owns the capabilities Power Apps gives them today, and what does owning them cost across 13+ apps?**

Power Apps' value for a fintech is not the screens. It is the platform layer around them:
identity (Entra ID SSO), role- and row-level permissions, audit trail, environments (dev/test/prod),
DLP policies, connectors, hosting, and governance. That layer is what is expensive to build and,
more importantly, to **maintain and keep compliant**.

## Step 2 — What actually drives the decision

Four variables matter more than "can Devin write the code":

1. **Who builds the apps today.** If ops/compliance staff build them in Power Apps (citizen developers),
   moving to code shifts that work onto engineers. That changes the opportunity-cost math completely.
2. **What the $250K actually buys.** For a ~60-engineer company that is a lot of licensing. It likely
   bundles non-engineer users, Dataverse capacity, Power Automate premium, maybe partner support.
   If they're on M365 E3/E5, part of Power Platform stays paid for regardless.
3. **The fintech compliance layer.** Maker-checker approvals, immutable audit logs, access reviews for
   SOC 2, segregation of duties, PII handling in the KYC app. Any build option has to own all of this.
4. **Why the question is being asked now.** Probably: cost scales with 10+ more apps, customization
   ceilings, no real git/tests/code review in low-code, Dataverse lock-in. These are exactly the
   things a code-based approach does better, so they're the build case's strongest argument.

## Step 3 — Explicit assumptions (we can't interview the client)

| # | Assumption | If wrong, the recommendation shifts toward… |
|---|-----------|------------------------------------------------|
| A1 | The 3 apps were built and are maintained mostly by engineers | **Buy**: if ops staff build them, code means engineers take that work on |
| A2 | The $250K grows roughly linearly with the 10 new apps and their users | **Buy**: if it's mostly a fixed cost already sunk via M365, the savings shrink |
| A3 | They already run cloud infra with SSO (Okta/Entra) and a CI/CD pipeline | **Buy**: without that base, the build option has to stand up infra first |
| A4 | Compliance scope is SOC 2 (plus PCI-adjacent for refunds), not a regulator-mandated vendor stack | **Buy**: if a regulator expects a certified platform, owning it is riskier |
| A5 | The new tools are workflow-heavy (queues, approvals, admin panels), not BI/reporting | **Buy, or another tool**: reporting-heavy needs point to Power BI or Retool, not custom code |

The recommendation will be conditional on these. Stating them is part of the answer.

## Step 4 — What the prototype must prove (and what it must not fake)

A prototype with 3 polished apps would prove the least interesting thing. Instead it should test the
three claims the build case depends on:

1. **The platform layer can be built correctly**: server-side RBAC, append-only audit log,
   and a maker-checker approval primitive. This is the risky part, so it goes first.
2. **The marginal cost of app #N is low**: once conventions and a playbook exist, a new app comes
   from a short ticket with little human intervention. This is the core of the economic argument.
3. **Devin fits their SDLC**: work arrives as PRs with tests, a human reviews and merges.
   Governance comes from code review instead of a low-code admin console.

**Out of scope on purpose.** These are the areas where Power Apps wins, and the evaluation will
say so openly instead of the prototype faking them: real SSO integration, production hosting,
a citizen-developer UX, the breadth of 1000+ connectors, and mobile.

**Stack:** Next.js + TypeScript + SQLite (Drizzle). The reviewer can run it with one command
and no infrastructure. The database layer is portable to Postgres for production.

**Metrics to record per Devin session:** wall-clock time, ACUs consumed, number of human
interventions, and defects found in review. These numbers feed the build-cost estimate.

## Step 5 — How to work with Devin: one step at a time

First draft: a single large prompt covering auth, RBAC, audit, approvals and the Refunds app.
**Rejected.** It doesn't match how an engineer actually works with Devin, and it makes every
piece harder to review. If something comes out wrong, you can't tell which decision caused it.

Instead: small, sequential steps, each one reviewed before the next, the way a team would
hand tickets to a teammate.

1. Base app + identity (who is the user, what role do they have)
2. Audit log
3. Refunds app with maker-checker approvals
4. Second app (KYC queue) built from the conventions, to measure the marginal cost of app #N
5. Third app (feature flags), if time allows

**Why identity first:** every other primitive depends on knowing who is acting. Audit needs an
actor, and approvals need to know that the approver isn't the requester. It's also the smallest
step that proves the stack runs end to end.

**Step 1 prompt, written the way you'd brief a teammate:** context first, then one task,
then ask for the approach before any code.

## Step 6 — Work backwards from what gets submitted

Deliverables: (1) GitHub repo + README, (2) 5-min Loom for the VP, (3) a one-page key decisions doc.
Repo: https://github.com/guillermolg00/devin-internal-tools-kit

What this changes in how we work:

- **The prototype is evidence for the recommendation, not the product.** Every step has to
  produce something the Loom can point at: a Devin session, a PR, a number.
- **Map Power Apps' core capabilities to the prototype explicitly**, so the demo answers
  "what's replicable and what isn't" instead of just showing screens:

| Power Apps capability | What it gives the team | In the prototype |
|---|---|---|
| Fast app creation over Dataverse | New tool in days, no infra | Conventions + playbook, so a new app comes from one Devin session |
| Entra ID + security roles | SSO, role- and row-level access | Mock SSO + server-side RBAC (real OIDC is a swap) |
| Power Automate approvals | Workflows without code | Maker-checker approval primitive |
| Dataverse auditing | Audit trail for compliance | Append-only audit log |
| 1000+ connectors | Integrations out of the box | **Not replicated.** Each integration is code to own |
| Environments, ALM, DLP, CoE | Governance at scale | Partly: git + PRs + CI. **DLP/CoE not replicated** |
| Citizen developers | Non-engineers build their own tools | Candidate answer: non-engineers file a plain-language ticket to Devin, engineers review the PR. **Needs testing** |

- **Record evidence as we go:** time and ACUs per Devin session, session links, how many times
  a human had to correct Devin, and what the review caught. The Loom and the one-pager both
  draw on this log.
- **Time box:** ~2h for the prototype in Devin. If step 3 (Refunds) isn't done by about 1h15,
  cut feature flags and spend the remaining time on the second app. The marginal-cost
  measurement matters more than having a third app.
- **This log goes into the repo** (`docs/reasoning-log.md`) as the trail behind the one-pager.
  The one-pager is a 1-page distillation of it, not a copy.

## Step 7 — Research runs in Devin too, in parallel with step 1

Decision: the Power Apps research runs as a second Devin session, in parallel with the
foundation build. It does not run in a separate assistant.

- **Why Devin:** the research is then traceable in the repo (`docs/research/power-apps.md`,
  with sources). It also shows the client something real: Devin handles discovery work, not
  only code, and two sessions run at the same time without blocking each other.
- **Division of labor:** Devin gathers the **facts** (capabilities, licensing, governance,
  limits, with a source for each). **Interpreting** where the value lies for *this* client
  stays with us. Handing over the judgment would produce the generic analysis the assignment
  warns against.
- **Risk:** pricing and licensing change often, and web research can be stale. We check the
  key numbers against the cited sources before using them in the Loom.

## Step 8 — Cost model (first pass, before measuring anything)

Built while the first two Devin sessions run, so we know which numbers to measure.

**Inputs (judgment calls, stated as assumptions):**
- Loaded engineer cost: $150–200K/yr, which at ~2,000 h/yr is **$75–100/h**
- Maintenance per internal app once stable: **8 h/month** (deps, patches, change requests, bugs)
- Platform ownership (on-call, SOC 2 evidence, access reviews, upgrades): **~0.25 FTE**. Assumption.
- Hosting for 13 small apps: **~$10K/yr**. Assumption.

**Build, recurring cost at 13 apps:**

| Item | Calculation | $/yr |
|---|---|---|
| App maintenance | 8 h × 13 apps × 12 = 1,248 h (≈0.6 FTE) | $94–125K |
| Platform ownership | 0.25 FTE | $38–50K |
| Hosting | — | ~$10K |
| Devin | to measure | ? |
| **Total** | | **~$142–185K + Devin** |

**Buy:** $250K/yr today. Whether it grows with 10 more apps depends on the licensing model
(open question for the research). Under per-user licensing, a new app for existing users costs
close to nothing extra.

**What this first pass says:**
1. **On recurring cost alone, build saves ~$65–110K/yr minus Devin, minus year-one costs.**
   That is a real saving, but a modest one. It is not a slam dunk, and it's sensitive to the
   maintenance assumption.
2. **The biggest lever is maintenance hours, not build hours.** Devin makes building cheap,
   and building was never the dominant cost. If Devin takes over routine maintenance
   (dependency bumps, small change requests) and an engineer only reviews, 8 h/app/month could
   plausibly drop a lot. That's the claim that would move the decision. We can't fully prove it
   in 2 hours, but we can show one change request done end to end.
3. **The opportunity cost is ~0.85 FTE of real engineers** pulled from product work. Money
   saved doesn't capture that.
4. **If cost alone doesn't decide it, the build case has to win on something else:** control,
   speed of change, real SDLC (git, tests, review), and no lock-in. The Loom should say this
   plainly instead of overselling the savings.

**Numbers to measure in the prototype:** ACUs and wall time per app, engineer review time per
app, and the time Devin needs to handle one realistic change request on an existing app.

## Step 9 — First friction: research PR landed in the wrong repo

The research session opened its PR against an older repo instead of `devin-internal-tools-kit`.
The cause was our prompt, not Devin: it said "on its own branch" without naming the repo, so Devin
picked one it already had access to. Fixed with a one-line correction in the same session.

**Takeaway for the client:** Devin acts on the context it has. If a team has many repos connected,
the repo has to be explicit, either in the prompt or in the session's repo selection. This is a
small version of a real governance point: what Devin can reach should be scoped deliberately.

## Step 10 — What the research changes

Research brief merged as `docs/research/power-apps.md` (PR #1, 47 Microsoft sources).
Its density suits an appendix; the Loom will use only the points below. **Not yet verified by us:**
the 2027 price change ($20 → $22). The pricing pages render client-side, so a quick check didn't
confirm it. It has to be verified before it goes in the Loom, or left out.

**1. $250K is not "60 engineers × licenses". It's ~1,000 users.**
At $20/user/month for Power Apps Premium, $250K/yr ≈ 1,040 seats. The people paying for
Power Apps are mostly **ops, support and compliance staff using the apps**, not the engineers.
Implications:
- A1 ("engineers build the apps") is still open, but the user base is clearly non-engineers.
  Whatever replaces Power Apps has to serve ~1,000 people in ops-critical workflows (KYC, refunds).
  Downtime or a bad UX in a homegrown tool hits operations directly.
- In favor of build: a homegrown tool has no per-seat cost, so the $250K doesn't come back as
  user count grows.

**2. Under Premium, the 10 new apps cost ~$0 in extra licenses.**
Premium licenses the person, not the app. The intuition "13 apps will cost 13/3 × today" is
**wrong** if they're on Premium. That kills the strongest-sounding build argument and corrects
our own assumption A2. The buy option's marginal cost per new app is roughly zero. The real
comparison is **$250K/yr flat (rising ~10% if the 2027 change holds)** against the
~$142–185K/yr + Devin from Step 8.

**3. Compliance: the gap is smaller than it looks, but it moves rather than disappears.**
Power Apps and Power Automate are in scope for Microsoft's SOC 1/2, ISO 27001 and PCI DSS
attestations. Microsoft also states explicitly that this **does not certify customer-built apps**:
it's shared responsibility. So the apps are not "compliant for free" today either. What Power Apps
does give them is the **platform controls**: Entra Conditional Access, Purview activity logs,
DLP, environment isolation. A build has to replace those with their own stack (cloud provider IAM,
SSO, log pipeline). That's the security work the build option takes on.

**4. The documented limitations strengthen the engineering case for build:**
- Delegation limits (500 rows by default, configurable up to 10,000 per current docs) in canvas apps can return **silently
  incomplete results** on larger datasets. For a KYC queue, that's a correctness risk.
- Source control is a bolt-on: committed after publishing, with editing restrictions.
  Real code review and tests are hard to get.
- Governance is getting more expensive: Microsoft is pushing Managed Environments
  (pipelines blocked without them, developer environments deprecated, stricter license
  enforcement from Feb 2027).

**Updated position (still provisional):**
- On **cost**, build is a modest win at best. It is not the headline.
- On **engineering quality and control** (correctness, SDLC, no lock-in), build is clearly better.
- The real risk of build is **operational**: owning tools that ~1,000 non-engineers depend on
  every day.
- The prototype should therefore show that the operational and compliance basics can be owned
  cheaply: audited actions, enforced approvals, and fast safe changes. Screens matter less.

## Step 11 — Review of the foundation PR (#2)

**What came back is better than asked for on security:**
- Every page and every API handler checks permissions on the server, independently.
- Sessions are opaque random tokens; only their hashes are stored. They live in HTTP-only cookies.
- Mutations require a same-origin request (basic CSRF protection).
- Demo login is disabled by default in production builds.
- Integration tests hit the real HTTP server: forged cookies, forged roles, cross-origin requests.
- CI is green.

**Where it deviated or left gaps:**
1. **Bun instead of npm.** We asked for `npm install && npm run dev`. Devin chose Bun and said
   so in the PR, but didn't ask first. Small, but it's the pattern a reviewer has to catch:
   reasonable deviations still need a human to accept them. It also adds friction for anyone
   running the repo.
2. **There is no seam for auditing yet.** Data access is one `Store` class that writes directly
   (`updateNote`). Nothing yet forces writes through a single path. This defines step 2.
3. **AGENTS.md has no real conventions.** It only holds the auto-generated Next.js block; the
   "Adding a tool" recipe lives in the README. That's fine for now. The conventions should be
   written *after* the audit log and Refunds exist, from patterns that are real rather than
   guessed.
4. **One role per user.** Dataverse roles are cumulative, and real ops staff often hold several.
   Fine for a prototype, but it's a known gap for the evaluation.

**Takeaway for the client:** the review took minutes, not hours, because the PR was small and
did one thing. That supports the step-by-step approach from Step 5.

## Step 12 — Audit log: Devin's plan, and one correction

Devin's plan, which is sound:
- **A single typed write path.** The raw database client is hidden. Each mutation declares its
  permission and runs inside a transaction with the actor resolved on the server. This merges RBAC
  and audit into one choke point.
- **Enforcement at the database.** Triggers refuse writes that have no active mutation context,
  so the change and its audit entry commit together or roll back together.
- **Append-only audit table.** Triggers reject UPDATE and DELETE on audit rows.
- **An honest caveat, stated without being asked:** SQLite can't stop someone with access to the
  file. This protects against application bugs and direct row edits; it is not tamper-proof
  compliance storage. In production that means Postgres with a separate DB role, plus shipping
  audit events to WORM storage or a SIEM.

**Process note:** we asked for the approach *before* any code. Devin posted the plan and then
started implementing in the same turn, without waiting. That's fine when the plan is good, but
the client needs to know: "wait for approval" in a prompt is not a hard gate. If a team wants an
approval gate, it belongs in tooling (branch protection, required reviews), not in prompt wording.

**Correction sent while it works:** trigger-based auditing risks making every new table
hand-written trigger boilerplate. That would quietly raise the cost of app #N, which is the number
our whole thesis depends on. We asked that registering a new audited table be a single
declaration, with the triggers generated from it.

## Step 13 — Review of the audit PR (#3)

**Solid:**
- `mutate()` is the only write path. It re-checks the actor's permission inside the transaction
  and rolls everything back if no audit row was produced.
- Initialization **fails if a business table has no audit declaration**, so skipping the audit
  by omission is impossible.
- A lint rule bans importing the raw DB client outside the database internals.
- 13 adversarial tests.
- Our correction landed: a second table needed only one declaration.

**CI failed on first push** (a type error). Devin noticed and started fixing it on its own.
Takeaway: CI is the real gate. "Verification is running" in a PR body is not verification.

**Design limit caught in review, before it bit:** a mutation targets one table with one
statement, and the guard trigger checks the context against that table. Approving a refund
touches at least two tables (refund + approvals), so the current design would block it.
We flagged it in the Refunds prompt rather than letting Devin hit it mid-task.
**This is the reviewer's real job with Devin: spot the next step's constraints in this step's design.**

**For the evaluation (not fixed):**
- About 120 lines of generated-trigger SQL. Clever, but the client's team has to be able to own
  it. Devin makes writing it cheap; it doesn't make owning it cheap.
- Reads are not audited (who *viewed* KYC data). Dataverse doesn't audit reads by default
  either, so there is no gap against the status quo, but it's worth naming for PII.

**Fix commit, then merged.** Devin fixed the type error and also caught a real concurrency bug
on its own. The audit context is a single-row table, so two concurrent requests could interleave
and attribute a change to the wrong actor. The fix serializes all database access through one
connection and one queue, with a test for concurrent attribution. CI green, merged.

Trade-off to name: serializing everything is correct for a single-node SQLite prototype, but
it's a throughput ceiling. In production, Postgres would carry the actor per transaction
(`SET LOCAL`) and the global queue goes away. Another example of a decision that's right for the
demo but has to change before real use.

## Step 14 — Running it locally from a fresh clone

**The documented command fails on a fresh machine.** `bun install && bun run dev` returned HTTP
500 on every page: Bun (local 1.4.0, repo pins 1.4.4) can't resolve the hashed external module
Turbopack generates for `@libsql/client`. The same code under Node (`npx next dev`) works.
CI never caught it because CI tests the production build, not `dev`.

This ties directly back to Step 11's Bun deviation. A "reasonable" unrequested choice became the
first thing a new engineer, or the evaluator, would hit. **Green CI is not "it runs on someone
else's machine."** Someone still has to clone it and run it.

**Behavior checked by hand:**
- A reviewer edited the note, and the audit log shows the actor, role, UTC time, and before/after values.
- The reviewer gets 403 on `/api/audit`; the admin can read it.
- Minor bug: React warns "Only plain objects can be passed to Client Components". Raw database
  row objects are passed straight to the user switcher. Harmless here, but it's sloppy.

**Backlog for one cleanup PR later, not now:** make the run command work for any engineer with
Node (npm), and map DB rows to plain objects.

**Update: fixed by hand instead (PR #4)**, because the bug blocked anyone from running the app.
It was three small changes: run the Next.js scripts on Node (Bun only runs tests), update the
README run line to work with npm or bun, and make `currentUser()` return a plain object.
Verified locally with lint, typecheck, 32 tests, build, integration tests, and `bun run dev`
from a clean cache.

**Why a human fix and not Devin:** it was a ~10-line fix that the reviewer already understood,
and Devin was busy with Refunds on another branch. Context-switching Devin would have cost more
than doing it. This is what the realistic workflow looks like: engineers make small fixes
directly, Devin takes the scoped tasks, and both go through the same PR + CI gate. Devin is
told so it rebases instead of overwriting.

## Step 15 — Plan for after Refunds: measuring app #N honestly

**Key decision: build the KYC queue in a *fresh* Devin session, not the one that built the
foundation.** The current session holds all the context from building the platform. App #2 there
would look cheap because of what Devin remembers, not because the platform is good. The client's
reality is different: a different engineer, months later, files a ticket. A fresh session only
has what's in the repo, which makes it a fair test of the conventions.

Sequence:
1. **Codify conventions (current session, small).** Now that real patterns exist (mutation
   registry, audited tables, approval policies), have Devin write AGENTS.md and the new-app
   playbook from the code. These become the only context the fresh session has.
2. **KYC queue (fresh session).** Requested as a plain-language ticket an ops lead could write,
   with no file names and no architecture hints. This tests the "citizen developer → ticket"
   hypothesis from Step 6. Measure wall time, ACUs, interventions, and review findings.
3. **Change request on Refunds (fresh session).** This tests the maintenance lever from Step 8,
   the number that actually moves the cost model.
4. Feature flags only if time remains. It adds a third data point but no new insight.

## Step 16 — Refunds PR (#5): reviewed, verified by hand, merged

**Design:**
- **A shared approval engine** (`approvals.ts`). Refunds only declares a policy: one approval
  up to $500.00, two above. Quorum, distinct reviewers, no self-review, and immutable final
  states all live in the foundation.
- **Multi-table mutations.** Each write must produce an audit row per changed row, or the whole
  transaction rolls back. This is the constraint we flagged in Step 13, resolved.
- Money is stored as integer cents. Each request stores its policy version and quorum.
- 55 unit tests plus HTTP integration tests. CI green.

**Verified by hand against the running app, through the HTTP API:** created a $750 refund as the
agent, then:
- the agent approving it → 403;
- Sam approves → 200, still pending;
- Sam approves again → 409;
- the admin approving → 403 (no override);
- Priya approves → 200, now **approved 2/2**;
- Priya rejecting afterwards → 409 (final state).

The audit log holds 6 entries across 3 tables, each attributed to the right person.

**A trap waiting for the change-request test:** `decideApproval` refuses any request whose
stored policy version differs from the current one. If we bump the refunds policy (e.g. a new
compliance approval above $5K), **every pending refund becomes undecidable**. Freezing a request's
rules at submission is defensible, but it needs a migration path for pending items, and nothing
in the code provides one. This is exactly what a maintenance change surfaces and a greenfield
build doesn't. We won't warn Devin ahead of time: the point is to see whether a fresh session
catches it.

## Step 17 — Conventions PR (#6): merged without edits

AGENTS.md (rules) and `docs/new-app-playbook.md` (6-step recipe with links to the real refunds
code). Docs only; CI green.

**Two things worth noting before the fresh KYC session reads it:**
- **Devin documented the policy-version trap itself:** "Route in-flight requests to their
  original policy when introducing versions; mismatches fail closed." The code still has no
  helper for it, but a future session now has the warning. The change-request test will show
  whether the warning gets followed.
- **A gap I deliberately did not fill:** the playbook doesn't cover adding a **new role**, and
  roles are hardcoded in two places (`permissions.ts` and a SQL `CHECK` constraint on `users`,
  which in SQLite needs a table rebuild to change). The KYC ticket asks for a "senior reviewer".
  Prediction: this is where the fresh session either does a clean migration or patches around
  it. Filling the gap now would hide the result we want to measure.

## Step 18 — KYC from a fresh session (PR #7): the app #N test

**Setup:** a new Devin session given only a plain-language ticket written as a compliance ops
lead, with no file names or architecture hints. Its only context was the repo and the
conventions from Step 17.

**Did the conventions work? Yes.**
- It reused the shared approval engine and extended it cleanly with a `validateDecision` hook
  instead of forking it.
- It declared audited tables, used `mutate()`, and updated the playbook with the new pattern,
  as AGENTS.md asks.
- 84 tests, CI green. Devin also ran its own browser test of the workflow ("Test KYC workflow"),
  which passed.
- The live database upgraded from schema v2 to v3 in place, and the existing refunds survived.

**Verified by hand via the HTTP API** (high-risk case, score 82):
- Casey (analyst) claims and approves → first approval.
- Casey tries again → 409.
- Sam (senior) escalates the case.
- Sam tries to claim it again → **403 "cannot approve a case you escalated yourself"**.
- Priya (senior) approves → **approved 2/2**.
- The history records all 7 events with their actors.

**Step 17 prediction confirmed, and it's the most important finding so far.** The ticket asked
for a "senior reviewer" role. Devin **did not add a role**, which would have needed the SQLite
table rebuild. It **mapped the ticket onto existing roles**: support agents became KYC
analysts, and refunds reviewers became KYC seniors. It said so in the PR body but never asked.
- That's a reasonable engineering shortcut, but **a product and compliance decision made
  silently**. Now anyone who reviews refunds is automatically a senior KYC approver, and any
  support agent can approve low-risk KYC. Least privilege and segregation of duties are blurred.
- Root cause in the platform: **roles are global, not per tool**. With 13 tools this becomes a
  real need. Dataverse security roles grant privileges per table, so Power Apps has this out of
  the box.
- **What it means for the client:** Devin resolves ambiguity in a ticket by deciding and
  documenting, not by asking. A ticket from a non-engineer *will* be ambiguous. That makes the
  PR reviewer the control point, and the citizen-developer hypothesis (Step 6) holds only
  partly: an ops lead can request the tool, but an engineer has to review its access model.

## Step 19 — What it cost (Devin Session insights)

| Session | What it built | User messages | Size (cost bucket) |
|---|---|---|---|
| Research | Power Apps brief (47 sources) + moving it to the right repo | 3 | XS (≤ $4) |
| Foundation | Foundation, audit log, refunds, conventions (4 PRs) | 7 | XS (≤ $4) |
| KYC (fresh) | Full KYC queue from one ops-style ticket | **1** | XS (≤ $4) |

On-demand usage shows $0.00 because the usage was covered by Guillermo's existing plan/subscription
(he notes he used his Codex subscription during the process). The honest number is therefore the
**size bucket: each session ≤ $4, so ≤ ~$12 of compute for the whole prototype.**

**What this does to the cost model (Step 8):**
- **The KYC app took one message and zero human interventions** during the build. The human
  cost was the review: reading the PR, testing it, and catching the role-mapping decision.
- **Devin's compute is a rounding error next to the people.** Even at 100× these numbers, 13 apps
  cost less than one week of one engineer. The build case is not limited by build cost. It is
  limited by **review and ownership time**. That confirms Step 8's thesis with data: the
  maintenance-hours lever is what matters, and the change-request test (Step 20) measures it.
- **Calibration:** the change-request session (Step 20) runs billed by Devin on-demand, not on
  the subscription, to get one exact dollar figure that anchors the buckets above. It's one data
  point for a smaller task than KYC, so it calibrates the scale, not every session.
- Caveat: size buckets are coarse, and a prototype is not production. A real build adds SSO,
  infra, a security review, and migrations from the existing Power Apps data.

## Step 20 — How much better could the Devin workflow get?

The prototype used the basics: sessions, PRs, AGENTS.md, and a browser test. The big gain isn't
compute, which is already negligible. It's **reducing human review and maintenance hours**, the
dominant cost. Each friction we observed maps to a lever:

| Observed | Lever | Effect |
|---|---|---|
| Silent role decision in KYC | Knowledge/Playbook rule: "if a request changes who can access what, stop and ask, or flag it in the PR" + human CODEOWNERS on `permissions.ts` | Access decisions can't pass silently |
| Didn't wait for approval | Branch protection + required review; Devin never merges | The gate lives in tooling, not prompt wording |
| Bun broke fresh clones | Pinned Devin environment + Knowledge rule (Node, not `bun --bun`) | Fewer unrequested deviations |
| Maintenance dominates cost | Automations: scheduled dependency and patch sessions that open PRs; PR monitoring already auto-fixes CI | The engineer reviews instead of doing the work |
| Review is the bottleneck | Devin Review as a first pass before the human | Less human time per PR |
| Ops wants to request tools | Slack/Linear integration: ticket → session with the playbook | The ops lead asks, an engineer approves |
| ~120 lines of trigger SQL someone must own | Devin Wiki over the repo | Lower key-person risk |

**Estimate, explicitly a hypothesis:** with these levers, maintenance could drop from ~8 to
~3–4 h/app/month. That takes 13-app maintenance from ~$94–125K to ~$40–60K/yr and roughly doubles
the savings margin. **Not measured.** The change request measures one instance; a quarter-long
pilot would measure the rest.

**What Devin does not change:** platform-level SSO, DLP, connectors and attestations remain the
client's to own, and so does operational accountability.

**Recommendation shape (provisional):** a hybrid as a *steady state* is the worst option: the
license stays because it's per user, and the ownership cost gets added on top. The useful form is
a **time-boxed pilot with a decision date before renewal**: build 2–3 of the new tools with Devin
using these levers, measure real maintenance hours per app, then either commit to a full exit
(migrate the 3 existing apps) or stay on Power Apps.

## Step 21 — Assurance: Devin raises the quality floor, with one blind spot

Guillermo's point, and the evidence supports it: **the guarantees go up a lot when Devin builds.**
Without being asked for each one, every PR shipped with:
- adversarial unit tests (bypass attempts, races, rollbacks, boundaries like $500 vs $500.01
  and risk 69.99 vs 70);
- HTTP integration tests against a real server (forged cookies and roles, cross-origin writes);
- a browser E2E check of the KYC workflow;
- green CI.

That's 84 tests across ~4 PRs. Under deadline pressure, a human team usually skips most of
this. Power Apps canvas apps have no comparable story for unit, integration or adversarial
testing. As a developer, this is real leverage: a reviewer starts from a well-tested PR instead
of having to write the safety net.

**The blind spot, and it matters for the pitch:** the tests come from the same agent that wrote
the code, so they verify **the implementation against Devin's interpretation of the request**,
not the requester's intent. KYC's role mapping passed all 84 tests because the tests encoded
Devin's choice. Tests raise confidence that the code does what Devin meant. A human still has to
confirm that what Devin meant is what the business asked for. That's why the review steps in
this log caught things CI never would: the role mapping, the policy-version trap, and the
fresh-clone failure.

## Step 22 — Change request: compliance sign-off above $5,000 (PR #8, fresh session)

The ticket was written as a finance ops lead: "effective now, refunds > $5,000 also need
compliance sign-off; compliance can't approve normal refunds." It deliberately contained the
two traps from Steps 16–17.

**Both traps handled, and this time the decision was surfaced instead of silent:**
1. **New role, done properly.** It added a real `compliance` role. Since SQLite can't alter the
   `CHECK` constraint, it rebuilds the `users` table once with foreign keys off, checks foreign
   keys before commit, and keeps users and sessions. It did *not* map onto an existing role,
   unlike KYC. The difference: here no existing role fit at all.
2. **Policy version.** It bumped the refunds policy to v2 and **migrated pending v1 refunds onto
   v2**, so pending refunds above $5K now need compliance too. Each move is an audited
   `system.migration` entry; final refunds keep v1. The PR states it explicitly under
   **"Decision to review: 'effective now' applies to in-flight refunds"**, along with the
   alternative and its risk (a pending $10K refund approved without compliance). This is the
   behavior we want: a judgment call flagged for a human, not buried.

**Design:** sign-off is a separate *capacity* in the shared approval engine, not a refunds
hack. It never counts toward the reviewer quorum, either capacity can reject, and the existing
`UNIQUE(approval, person)` means **one person can't both review and sign off**, which preserves
segregation of duties.

**Verified by hand on the real local database, upgraded live from v3 to v4:**
- existing refunds preserved and moved to v2 with the correct sign-off flag;
- a new $9,000 refund:
  - compliance using the reviewer route → 403;
  - a reviewer using the sign-off route → 403;
  - two reviewer approvals → still **pending 2/2**;
  - compliance signs off → **approved**, with each decision labelled by capacity.
- UI checked as Morgan (compliance): Sign off / Decline only on refunds above $5,000,
  "No sign-off needed" on the rest.

**New finding, for the evaluation:** the v4 migration lives in `database.ts`, which now imports
a constant from `refunds.ts`. **The platform core is starting to know about individual tools.**
At 13 tools, that file becomes the place where every tool's migrations collide. A real build
needs per-tool migrations (a migrations folder or registry) before tool #4 or #5. This is the
kind of structural debt that compounds quietly as an agent adds tools fast.

## Step 23 — "Not replicated" mixes three different things

Guillermo's challenge: is what Devin "can't do" really a Devin limitation, or is it something
else? We're presenting Devin, so the framing has to be honest *and* precise. Lumping everything
under "not replicated" undersells Devin and misinforms the client. The list splits into three
groups:

**1. Not built in a 2-hour prototype, but buildable with Devin (a scope issue, not a capability
limit).** Effort estimates assume Devin builds and an engineer reviews. They are judgment, not
measured:
- Real SSO (Entra ID/Okta OIDC) + SCIM provisioning: ~1–3 days including security review.
- Per-tool roles + audited access changes: ~1–2 days.
- Postgres + per-tool versioned migrations: ~1–2 days.
- Deploy on their cloud (IaC, CI/CD, observability, backups): ~3–5 days.
- Connectors: Power Apps ships 1,000+, but this client needs the handful they actually use
  (core ledger/DB, Stripe or their processor, the KYC vendor, Slack). That's hours to a day each.
- Feature-flag admin: same pattern as refunds/KYC. Same-day.

→ Platform hardening is roughly **2–4 engineer-weeks with Devin**, one time.

**2. Not a code problem: it belongs to the client whether they build with Devin, by hand, or
with any other tool.**
- **Operational ownership:** on-call, uptime, incident response for ~1,000 daily users.
- **Compliance accountability:** an auditor attests *their* controls. Microsoft's certifications
  cover Microsoft's platform, and Microsoft itself says they don't certify customer-built apps.
  Devin can implement controls and generate evidence; it can't be the accountable party.
- **Business decisions:** who should access what, and when a rule takes effect. Devin should
  surface these, as it did in PR #8, not decide them, as it did in PR #7.

**3. Different by design, and arguably better for a fintech.**
- **Citizen development.** In Power Apps a non-engineer builds and ships with no code review.
  With Devin, the same person writes a ticket in plain language, and an engineer reviews a
  tested PR before anything ships. For a regulated company, *review before production* is a
  feature, not a gap.
- **DLP.** It isn't a toggle here. Its equivalent is code review, secrets management and egress
  control. The shape is different, and so is who owns it.

**Revised framing for the pitch:** Devin isn't the bottleneck. Almost everything on the gap
list is a Devin task with an effort estimate attached. What remains is **ownership**: operations,
compliance accountability, and decisions. Devin lowers its cost (tests, maintenance automation,
flagged decisions) but doesn't remove it. That's the honest version, and it's also the one that
sells, because a VP of Engineering will trust it.

**Timing (reported by Guillermo):** ~40 min of prototype time so far. That covers the
foundation, audit log, refunds, conventions, and one human fix, plus the research in parallel.
That leaves ~80 min of the 2h budget for KYC, the change request, and wrap-up.

---

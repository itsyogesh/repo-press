# RepoPress Automation Backbone and Daily Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add production-safe background automation so RepoPress can reliably run scheduled publishing and optional daily draft seeding while preserving the existing human review and PR-based Git workflow.

**Architecture:** Keep GitHub as source of truth, keep Convex as workflow/state metadata, and add an internal automation layer that does not depend on browser session cookies. Reuse existing publish orchestration semantics by extracting shared server-side publish services that can be called by both UI-triggered publish and background jobs.

**Tech Stack:** Next.js App Router, Convex queries/mutations/actions/crons, Better Auth, Octokit GitHub API, existing RepoPress status workflow and publish branch model.

---

## 1) Scope and Non-Goals

### In Scope
- Scheduled publish execution driven by background jobs.
- Internal publish path that works without interactive user session cookies.
- Safe state transitions for automation (`scheduled` to publish path).
- Optional daily draft seeding pipeline for selected projects.
- Review queue visibility improvements for operators.
- Observability, idempotency, retry safety, and runbook documentation.

### Out of Scope
- Full autonomous merge policy across all repositories without repository-specific policy review.
- Replacing existing manual Studio publish flow.
- Introducing external workflow engines.
- Large UI redesign unrelated to automation operations.

---

## 2) Current Baseline (Validated)

### Existing Capabilities
- Document statuses and transitions are implemented in Convex documents logic.
- PR-based publish orchestration exists in API route `app/api/github/publish-ops/route.ts`.
- GitHub webhook callbacks reconcile publish-branch and document status updates.
- Multi-project config sync and per-project setup flows exist.

### Confirmed Gaps
- No Convex cron exists for scheduled publishing in this repository.
- Publish route currently depends on `getGitHubToken()` from cookies/auth-session path.
- No dedicated background identity/credential strategy for automation execution.
- No global review queue dashboard route for review operators.

---

## 3) Architecture Decisions to Lock Before Implementation

### Decision A: Background GitHub Credential Strategy
- Option 1: Project-level bot token stored and encrypted, scoped to repo operations.
- Option 2: User token delegation with refresh strategy and fallback policy.
- Option 3: GitHub App installation token flow.
- Recommendation: Use repository-scoped service identity (bot token or GitHub App) for automation jobs, while preserving user-driven flow for manual publish actions.

### Decision B: Internal Publish Contract
- Define one server-side publish service contract callable from:
- UI-initiated route handler.
- Scheduled publisher action.
- Future daily batch workflows.

### Decision C: Automation Safety Policy
- Maximum documents per scheduler run.
- Retry cap and dead-letter policy.
- Conflict handling policy (skip and alert vs retry).
- Required audit log fields.

### Decision D: Merge Policy for Automated Flow
- Whether automation creates PR only or also enables auto-merge for specific branches/repos.
- Explicit environment-level toggle and per-project override.

---

## 4) Data Model and State Contract Updates

### Task 1: Introduce Automation Metadata for Documents

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/documents.ts`
- Test: `convex` mutation/query tests (add under existing test strategy location)

**Step 1: Write schema-focused failing tests**
- Add tests for new optional fields on documents:
- `scheduledAt` validation behavior for scheduled transitions.
- `automationAttemptCount`.
- `lastAutomationError`.
- `lastAutomationRunAt`.

**Step 2: Run tests to verify failures**
- Run targeted tests and confirm missing-field/contract failures.

**Step 3: Implement minimal schema additions**
- Add optional automation fields in `documents` table definition.
- Keep backward compatibility for existing documents.

**Step 4: Implement transition guard updates**
- Ensure transition to `scheduled` requires valid future `scheduledAt`.
- Ensure transition away from `scheduled` clears or preserves metadata based on policy.

**Step 5: Re-run tests and typecheck**
- Verify new tests pass.
- Run `npx tsc --noEmit`.

**Step 6: Add verification notes to plan progress log**
- Capture command outputs in implementation notes.

### Task 2: Add Automation Run Log Table

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/automationRuns.ts`
- Test: automation run record tests

**Step 1: Write failing tests for automation run insert/query**
- Validate required fields:
- `jobType`, `projectId`, `documentId`, `status`, `message`, `startedAt`, `finishedAt`.

**Step 2: Add new table schema and indexes**
- Add indexes for:
- `by_projectId_startedAt`.
- `by_status_startedAt`.
- `by_documentId_startedAt`.

**Step 3: Add minimal queries/mutations**
- `createRun`.
- `completeRun`.
- `listRecentByProject`.

**Step 4: Re-run tests and typecheck**
- Verify API contract is stable and queryable.

---

## 5) Publish Service Extraction (Core Enabler)

### Task 3: Extract Shared Publish Service From Route Logic

**Files:**
- Create: `lib/publish/publish-service.ts`
- Create: `lib/publish/types.ts`
- Modify: `app/api/github/publish-ops/route.ts`
- Test: `lib/publish/__tests__/publish-service.test.ts`

**Step 1: Define service contract in tests first**
- Contract inputs:
- `projectId`, `actorType`, `actorId`, optional `title`, optional `description`, optional `executionMode`.
- Contract outputs:
- `ok`, `prUrl`, `prNumber`, `commitSha`, `summary`, `conflicts`.

**Step 2: Implement minimal service wrapper by moving existing route orchestration**
- Move conflict detection, branch creation/reuse, commit, PR create/update, and post-commit metadata updates into service.

**Step 3: Keep route behavior unchanged functionally**
- Route should validate request and call service.
- Route continues returning same response shape.

**Step 4: Re-run existing publish flow tests/manual smoke checks**
- Confirm no regression in manual publish.

**Step 5: Add idempotency key support in service contract**
- Use deterministic key per run to avoid duplicate publishes in concurrent triggers.

**Step 6: Add conflict reason normalization**
- Ensure background automation and UI receive consistent conflict payload format.

---

## 6) Background Identity and Credential Path

### Task 4: Implement Automation Credential Resolver

**Files:**
- Create: `lib/auth/automation-github-token.ts`
- Modify: `convex/projects.ts` (if project-level credential reference is needed)
- Modify: settings UI/backend files if credential source is project-configured
- Test: credential resolver unit tests

**Step 1: Define credential resolution policy tests**
- Test precedence and failure modes:
- project credential.
- environment credential.
- hard fail with actionable error when unavailable.

**Step 2: Implement resolver with explicit error types**
- Return structured errors for missing/invalid/scoping issues.

**Step 3: Add secure logging rules**
- Ensure token values are never logged.
- Log token source type only.

**Step 4: Add permission validation helper**
- Verify token can access repo branch before publish call.

**Step 5: Re-run tests and lint/typecheck**
- Validate no token leaks and stable failure diagnostics.

---

## 7) Scheduled Publisher Job

### Task 5: Add Convex Cron Entry Point and Scheduler Runner

**Files:**
- Create: `convex/crons.ts`
- Create: `convex/scheduledPublisher.ts`
- Modify: `convex/documents.ts`
- Modify: `convex/automationRuns.ts`
- Test: scheduler logic tests

**Step 1: Write failing tests for due-document selection**
- Query contract:
- `status === "scheduled"`.
- `scheduledAt <= now`.
- project/document ownership constraints.

**Step 2: Implement query to fetch due documents in bounded batches**
- Add deterministic ordering by `scheduledAt` then `_id`.

**Step 3: Add cron schedule registration**
- Register internal job that triggers scheduler action.

**Step 4: Add run-level lock strategy**
- Prevent overlapping scheduler runs from publishing same document twice.

**Step 5: Implement publish execution per due document**
- Resolve credential via automation resolver.
- Call shared publish service.
- Record automation run outcome.

**Step 6: Update document fields after execution attempt**
- Increment attempt count.
- Set `lastAutomationRunAt`.
- Store normalized error when failed.

**Step 7: Add retry and backoff policy checks**
- Skip/requeue documents based on attempt count and failure class.

**Step 8: Re-run tests and verify cron registration**
- Confirm due docs are processed and non-due docs are untouched.

---

## 8) Daily Draft Seeder (Optional but Prepared)

### Task 6: Add Project Automation Settings for Daily Draft

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/projects.ts`
- Modify: `app/dashboard/[owner]/[repo]/settings/page.tsx`
- Create/Modify: settings action handlers
- Test: project settings tests

**Step 1: Write failing tests for new settings contract**
- `dailyDraftEnabled`.
- `dailyDraftCollectionPath`.
- `dailyDraftTimezone`.
- `dailyDraftTemplate`.

**Step 2: Add schema + mutation support**
- Add update mutation with auth verification and strict validation.

**Step 3: Add settings UI controls**
- Add explicit toggle and required-field validation.

**Step 4: Add guardrails in UI and backend**
- Prevent enabling daily mode without valid collection path and template.

**Step 5: Re-run tests and smoke-check settings persistence**

### Task 7: Implement Daily Draft Creation Job

**Files:**
- Create: `convex/dailyDrafts.ts`
- Modify: `convex/crons.ts`
- Modify: `convex/documents.ts`
- Test: daily draft creation tests

**Step 1: Write failing tests for idempotent daily seed behavior**
- Ensure only one draft per project per day key.

**Step 2: Implement deterministic day-key logic**
- Use project timezone and configured schedule.

**Step 3: Implement content seeding path**
- Template-only baseline first.
- Optional generator integration behind feature flag.

**Step 4: Create document records in `draft` status**
- Populate file path, title, frontmatter defaults, and initial body.

**Step 5: Add duplicate prevention checks**
- Skip create when same day-key draft already exists.

**Step 6: Record automation run logs and emit notifications**

**Step 7: Re-run tests and verify non-destructive behavior**

---

## 9) Review Queue and Operator Visibility

### Task 8: Global Review Queue View

**Files:**
- Create: `app/dashboard/review/page.tsx` (or repo-scoped review route)
- Create/Modify: review list component under `components/`
- Modify: `convex/documents.ts` (query for in-review docs)
- Test: query tests + UI rendering tests

**Step 1: Write failing query tests for review queue data contract**
- Required fields:
- project identity.
- document title/path.
- reviewer info.
- review note.
- `updatedAt`.

**Step 2: Implement query with stable ordering and filters**
- Filters for repo/project/status.

**Step 3: Implement review queue UI**
- Add table/list with deep links to Studio document.

**Step 4: Add empty/error/loading states**
- Ensure operator can diagnose missing data quickly.

**Step 5: Re-run tests and manual validation**

### Task 9: Automation Failure Queue View

**Files:**
- Create: `app/dashboard/automation/page.tsx` (or settings sub-route)
- Modify: `convex/automationRuns.ts`
- Test: automation run list tests

**Step 1: Write failing tests for failed-run query shape**

**Step 2: Implement failed-run query and pagination**

**Step 3: Add UI for retry-eligible failures**
- Show reason, affected doc, last attempt.

**Step 4: Add manual retry action (guarded)**
- Trigger service call for one selected document.

**Step 5: Re-run tests and verify retry safety**

---

## 10) Safety, Idempotency, and Error Handling

### Task 10: Concurrency and Idempotency Hardening

**Files:**
- Modify: `convex/scheduledPublisher.ts`
- Modify: `lib/publish/publish-service.ts`
- Test: race-condition tests

**Step 1: Write failing tests for duplicate scheduler invocation**

**Step 2: Add per-document lock or compare-and-set transition guard**

**Step 3: Add idempotency key enforcement at publish service boundary**

**Step 4: Add retry classification utility**
- Transient errors.
- permanent errors.
- conflict errors.

**Step 5: Re-run tests and validate duplicate prevention**

### Task 11: Webhook and Scheduler Reconciliation Rules

**Files:**
- Modify: `convex/githubWebhook.ts`
- Modify: `convex/scheduledPublisher.ts`
- Test: reconciliation tests

**Step 1: Write failing tests for edge state combinations**
- scheduled doc already merged.
- publish branch closed without merge.
- repeated webhook delivery.

**Step 2: Implement reconciliation updates**
- Avoid regressing document status on duplicate events.

**Step 3: Add explicit no-op conditions with logs**

**Step 4: Re-run tests and verify idempotent webhook behavior**

---

## 11) Security and Compliance

### Task 12: Secret Handling and Access Controls

**Files:**
- Modify: token resolver and settings handlers
- Modify: any API route exposing automation controls
- Test: authorization tests

**Step 1: Write failing tests for unauthorized automation actions**

**Step 2: Enforce role/ownership checks on automation settings**

**Step 3: Add secure secret validation and masked display logic**

**Step 4: Add audit entries for credential updates and automation toggles**

**Step 5: Re-run tests and verify no secret leakage in logs/responses**

---

## 12) Verification Matrix

### Unit Verification
- Publish service orchestration behavior.
- Credential resolution precedence and failures.
- Due-document selection and idempotency.
- Daily draft duplicate-prevention logic.

### Integration Verification
- Scheduled document end-to-end: schedule -> cron run -> PR create/update -> merge webhook -> published.
- Conflict path: stale `githubSha` -> skip/record failure -> visible in automation queue.
- Credential failure path: token unavailable -> no publish -> actionable automation run log.

### Manual Verification Scenarios
- Manual publish from Studio remains unchanged.
- Scheduled publish works with mixed statuses in same project.
- Webhook duplicate events do not corrupt status.
- Review queue surfaces all `in_review` docs across selected scope.

### Required Command Verification for Each Task
- `npm run lint`
- `npx tsc --noEmit`
- `pnpm test`
- `npm run build`

---

## 13) Rollout Strategy

### Phase Gate A: Internal Service Extraction Complete
- Manual publish route behavior parity confirmed.
- No user-facing regressions.

### Phase Gate B: Scheduled Publisher Behind Feature Flag
- Enable for one internal project only.
- Observe automation run logs and webhook reconciliation outcomes.

### Phase Gate C: Expand to Collective Domain Production Path
- Enable schedule automation for target project(s).
- Keep daily draft seeding disabled until scheduled publisher is stable.

### Phase Gate D: Enable Daily Draft Seeding
- Enable template-based seeding first.
- Enable optional generated draft path only after baseline stability is proven.

---

## 14) Documentation Deliverables

### Update Existing Docs
- `docs/summary-and-next-phase.md`.
- `docs/plans/STARTER_PROMPT.md` (if execution workflow references change).
- Any publish flow docs that currently imply user-session-only execution.

### Create New Runbooks
- `docs/runbooks/automation-publisher.md`.
- `docs/runbooks/daily-draft-seeder.md`.
- `docs/runbooks/automation-failures.md`.

### Include in Runbooks
- Failure signatures.
- Recovery actions.
- Safe retry instructions.
- Rollback actions.
- Escalation path.

---

## 15) Immediate Next Task Recommendation

### Next Task to Start Now
- Finalize and implement **Decision A + Decision B** first:
- Background GitHub credential strategy.
- Shared internal publish service extraction.

### Why This Is First
- Scheduled cron execution is blocked until publish can run without browser/session token coupling.
- This unlocks both scheduled publishing and daily draft automation safely.

### Verifiable Exit Criteria for This Next Task
- Publish service callable from route and from non-route automation entry point.
- Background path can resolve a valid token without cookie dependency.
- Existing manual publish route still returns unchanged response contract.
- All verification commands pass.

---

## 16) Handoff Checklist

- Plan reviewed and approved by senior.
- Architecture decisions A-D recorded in writing.
- Feature flags defined for scheduled publisher and daily seeder.
- Execution owner assigned per task group.
- Verification evidence template agreed.
- Rollback owner and on-call escalation owner assigned.


# PR #44 Merge Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make PR #44 production-safe, locally verified, and ready to merge before handing the post-#44 design work to Tarun.

**Architecture:** Persist exact Git operation descriptors on every publish attempt, use immutable Git tree evidence for recovery, and run attempt-scoped cleanup through durable bounded jobs whose mode is never inferred from lane status. Complete the content/storage invariants and port only the four independently ratified PR #41 fixes.

**Tech Stack:** Next.js 16 route handlers, Convex mutations/scheduler/indexes, Octokit Git data APIs, React 19, TypeScript, Vitest, Biome.

---

### Task 1: Exact publish descriptors and Git-tree verification

**Files:**
- Modify: `lib/publish-plan.ts`
- Modify: `lib/github.ts`
- Modify: `convex/schema.ts`
- Modify: `convex/publishAttempts.ts`
- Modify: `app/api/github/publish-ops/route.ts`
- Test: `lib/__tests__/publish-plan.test.ts`
- Test: `lib/__tests__/github.batch-commit.test.ts`
- Test: `lib/__tests__/publish-attempts-begin.test.ts`
- Test: `app/api/github/publish-ops/__tests__/route.test.ts`

**Step 1: Write failing descriptor tests**

Add tests requiring:

```ts
type PublishOperationDescriptor =
  | { path: string; action: "delete" }
  | { path: string; action: "create" | "update"; expectedBlobSha: string }
```

Descriptors must use canonical unique paths; writes require a 40-hex Git blob SHA; deletes reject a blob SHA. The plan digest must include sorted descriptors.

**Step 2: Run the focused tests and verify RED**

Run:

```bash
npx vitest run lib/__tests__/publish-plan.test.ts lib/__tests__/publish-attempts-begin.test.ts
```

Expected: failures for missing descriptor construction/validation and the unchanged digest contract.

**Step 3: Implement descriptor construction and persistence**

Add a Git blob SHA helper that hashes `blob <byteLength>\0<bytes>` using decoded bytes for base64 operations and UTF-8 bytes otherwise. Persist descriptors in `publishAttempts.begin`, validate bounds/duplicates/SHA/action combinations, and derive `operationPaths` from descriptors only for compatibility.

**Step 4: Write failing tree-verification tests**

Require interrupted candidate adoption to verify exact parent and exact tree delta. Add final-authority inspection returning one result per descriptor:

```ts
type PublishPathOutcome = {
  path: string
  disposition: "finalize" | "restore"
  finalBlobSha?: string
}
```

Truncated/malformed trees and ambiguous reads must throw `GitHubReadError`.

**Step 5: Verify RED, implement, then verify GREEN**

Run:

```bash
npx vitest run lib/__tests__/github.batch-commit.test.ts app/api/github/publish-ops/__tests__/route.test.ts
```

Implement `verifyPublishAttemptCommitForPublish` and `inspectPublishEffectsAtCommit`; replace trailer-only adoption. Re-run all four Task 1 test files.

**Step 6: Commit**

```bash
git add lib/publish-plan.ts lib/github.ts convex/schema.ts convex/publishAttempts.ts app/api/github/publish-ops/route.ts lib/__tests__/publish-plan.test.ts lib/__tests__/github.batch-commit.test.ts lib/__tests__/publish-attempts-begin.test.ts app/api/github/publish-ops/__tests__/route.test.ts
git commit -m "fix(publish): verify durable attempts against exact Git trees"
```

### Task 2: Durable attempt-scoped cleanup jobs

**Files:**
- Create: `convex/publishAttemptCleanups.ts`
- Create: `convex/lib/publishAttemptCleanup.ts`
- Modify: `convex/schema.ts`
- Modify: `convex/publishAttempts.ts`
- Modify: `convex/lib/publishAttemptGuard.ts`
- Modify: `convex/explorerOps.ts`
- Modify: `convex/mediaOps.ts`
- Modify: `convex/documents.ts`
- Test: `lib/__tests__/publish-attempt-cleanup.test.ts`
- Test: `lib/__tests__/explorer-ops-reconciliation.test.ts`
- Test: `lib/__tests__/document-publish-provenance.test.ts`

**Step 1: Write failing cleanup-state tests**

Model `publishAttemptCleanups` with project/lane/attempt IDs, immutable path outcomes, authority SHA, phase (`explorer`, `media`, `documents`, `complete`), cursor, and status. Add exact `publishAttemptId` ownership to explorer/media rows and document provenance.

Test that `resolveAndEnqueueCleanup` atomically:

1. validates the attempt/lane/authority;
2. inserts or idempotently reuses one cleanup plan;
3. moves the attempt into cleanup-pending state;
4. schedules the internal continuation.

Conflicting replays must fail closed.

**Step 2: Run and verify RED**

```bash
npx vitest run lib/__tests__/publish-attempt-cleanup.test.ts
```

**Step 3: Implement the schema and atomic enqueue mutation**

Use indexes `by_publishAttemptId`, `by_publishBranchId_status`, and `by_status`. Keep legacy fields optional but stop using lane status to infer attempt cleanup.

**Step 4: Write failing bounded-continuation tests**

Cover 101 and 500 associations, duplicate scheduling, mixed restore/finalize outcomes, earlier/later attempts on the same lane, and a hard per-pass maximum of 25 target rows. No cleanup implementation may call `.collect()`.

**Step 5: Implement phase continuations**

The internal continuation loads exact association IDs from the attempt and processes one slice:

- Explorer finalize deletes only the owned row; restore returns only the owned row to pending unless a newer pending intent exists.
- Media finalize deletes storage or turns the row into a failed tombstone; restore retains staged bytes and returns only the owned row to pending.
- Document restore clears only provenance owned by this attempt; finalize publishes only an unchanged content version with matching verified outcome.

Persist the next phase/cursor before atomically scheduling the next invocation. Completion marks both cleanup and attempt terminal.

**Step 6: Run focused tests and commit**

```bash
npx vitest run lib/__tests__/publish-attempt-cleanup.test.ts lib/__tests__/explorer-ops-reconciliation.test.ts lib/__tests__/document-publish-provenance.test.ts
git add convex/publishAttemptCleanups.ts convex/lib/publishAttemptCleanup.ts convex/schema.ts convex/publishAttempts.ts convex/lib/publishAttemptGuard.ts convex/explorerOps.ts convex/mediaOps.ts convex/documents.ts lib/__tests__/publish-attempt-cleanup.test.ts lib/__tests__/explorer-ops-reconciliation.test.ts lib/__tests__/document-publish-provenance.test.ts
git commit -m "fix(publish): make reconciliation cleanup attempt scoped"
```

### Task 3: Merge authority and safe lane lifecycle orchestration

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/publishBranches.ts`
- Modify: `convex/githubWebhook.ts`
- Modify: `convex/lib/laneInvalidation.ts`
- Modify: `convex/lib/laneMerge.ts`
- Modify: `app/api/webhooks/github/route.ts`
- Modify: `app/api/github/pr-status/route.ts`
- Modify: `components/studio/hooks/use-pr-status-sync.ts`
- Modify: `app/api/github/publish-ops/route.ts`
- Test: `lib/__tests__/lane-close-invalidation.test.ts`
- Test: `lib/__tests__/github-webhook-hardening.test.ts`
- Test: `app/api/github/pr-status/__tests__/route.test.ts`
- Test: `app/api/github/publish-ops/__tests__/route.test.ts`

**Step 1: Write failing merge-authority tests**

Require webhook and authenticated fallback to persist the same 40-hex `mergeCommitSha`, accept idempotent replay, and reject a different authority. A merged event only records state and queues verification; it does not blanket-delete rows or publish documents.

**Step 2: Verify RED and implement authority propagation**

Return `mergeCommitSha` from PR status, pass it through the client fallback, and add a typed legacy backfill read for a merged PR with missing authority.

**Step 3: Write failing recovery tests**

Cover:

- squash/rebase-style recovery using only final tree state;
- no `pulls.listCommits` dependency and no 250-commit ambiguity;
- attempt A merged and attempt B excluded on one reused lane;
- later commit overwriting/deleting an earlier path;
- missing/different/truncated merge authority failing closed;
- queued continuation retaining its persisted action;
- edit-after-commit remaining draft/dirty.

**Step 4: Replace lane-wide merged cleanup**

Route every verified attempt into `resolveAndEnqueueCleanup`. Closed-lane invalidation remains an explicit durable `restore` dispatcher; merged-lane processing never uses `committedFilePaths` or status-dispatched cleanup. Remove or reduce old lane helpers to bounded legacy dispatch only.

**Step 5: Run focused tests and commit**

```bash
npx vitest run lib/__tests__/lane-close-invalidation.test.ts lib/__tests__/github-webhook-hardening.test.ts app/api/github/pr-status/__tests__/route.test.ts app/api/github/publish-ops/__tests__/route.test.ts
git add convex/schema.ts convex/publishBranches.ts convex/githubWebhook.ts convex/lib/laneInvalidation.ts convex/lib/laneMerge.ts app/api/webhooks/github/route.ts app/api/github/pr-status/route.ts components/studio/hooks/use-pr-status-sync.ts app/api/github/publish-ops/route.ts lib/__tests__/lane-close-invalidation.test.ts lib/__tests__/github-webhook-hardening.test.ts app/api/github/pr-status/__tests__/route.test.ts app/api/github/publish-ops/__tests__/route.test.ts
git commit -m "fix(publish): reconcile merged lanes from immutable authority"
```

### Task 4: Complete content cleanliness and storage ownership

**Files:**
- Modify: `convex/documentHistory_restore.ts`
- Modify: `convex/documentHistory.ts`
- Modify: `convex/documents.ts`
- Modify: `convex/explorerOps.ts`
- Modify: `convex/mediaOps.ts`
- Modify: `convex/lib/mediaTombstone.ts`
- Modify: `app/api/github/publish-ops/route.ts`
- Test: `lib/__tests__/document-history-restore.test.ts`
- Test: `lib/__tests__/document-publish-provenance.test.ts`
- Test: `lib/__tests__/discard-all-hardening.test.ts`
- Test: `lib/__tests__/lane-close-invalidation.test.ts`
- Test: `app/api/github/publish-ops/__tests__/route.test.ts`

**Step 1: Write failing content tests**

Require history restore to increment `contentVersion`; `discardAll` to preserve clean lane-synchronized documents; and legacy provenance to migrate only after a proven synchronization.

**Step 2: Verify RED and implement content fixes**

Share one cleanliness predicate between dirty listing and discard logic. Keep workflow-only changes out of the content version.

**Step 3: Write failing synchronized-only tests**

Cover no active lane, active lane, a head that advances after preflight, partial mutation failure, and concurrent document edit. Model provenance authority explicitly so a base-branch synchronization does not require a publish-branch ID.

**Step 4: Implement authority recheck and reconciliation**

Immediately before recording zero-commit provenance, reread the authority head. A moved head returns 409 and leaves the document dirty. Record base or lane authority without creating an empty branch.

**Step 5: Write failing storage ownership tests**

Force deletion failure in `undoByRepoPath`, `discardAll`, and stale cleanup. Assert each object retains a failed tombstone and the bounded retry removes it only after deletion succeeds.

**Step 6: Implement all-call-site tombstones, verify, and commit**

```bash
npx vitest run lib/__tests__/document-history-restore.test.ts lib/__tests__/document-publish-provenance.test.ts lib/__tests__/discard-all-hardening.test.ts lib/__tests__/lane-close-invalidation.test.ts app/api/github/publish-ops/__tests__/route.test.ts
git add convex/documentHistory_restore.ts convex/documentHistory.ts convex/documents.ts convex/explorerOps.ts convex/mediaOps.ts convex/lib/mediaTombstone.ts app/api/github/publish-ops/route.ts lib/__tests__/document-history-restore.test.ts lib/__tests__/document-publish-provenance.test.ts lib/__tests__/discard-all-hardening.test.ts lib/__tests__/lane-close-invalidation.test.ts app/api/github/publish-ops/__tests__/route.test.ts
git commit -m "fix(publish): preserve content and storage ownership invariants"
```

### Task 5: Port the four surviving PR #41 fixes

**Files:**
- Modify: `components/edit-project-dialog.tsx`
- Modify: `components/repo-project-hub.tsx`
- Modify: `components/folder-picker-dialog.tsx`
- Modify: `components/studio/studio-layout.tsx`
- Modify: `components/studio/hooks/use-studio-file.ts`
- Modify: `components/mdx-runtime/transformImports.ts`
- Modify: compatible preview binding files selected by the existing architecture
- Test: `components/__tests__/edit-project-dialog.test.tsx`
- Test: `components/__tests__/folder-picker-dialog.test.tsx`
- Test: `components/studio/hooks/__tests__/use-studio-file-read-authority.test.tsx`
- Test: `components/mdx-runtime/__tests__/CompatiblePreviewFrame.test.tsx`

**Step 1: Write/port one failing regression per fix**

The tests must prove project-access-token propagation, flex-column containment, cold-tree deep-link fetch, and namespace import binding. Do not port PR #41's native-runtime/config-removal work.

**Step 2: Run and verify RED**

```bash
npx vitest run components/__tests__/edit-project-dialog.test.tsx components/__tests__/folder-picker-dialog.test.tsx components/studio/hooks/__tests__/use-studio-file-read-authority.test.tsx components/mdx-runtime/__tests__/CompatiblePreviewFrame.test.tsx
```

**Step 3: Implement minimal ports and verify GREEN**

Use PR #41 only as a source reference. Adapt fixes to #44's compatible sandbox and current Studio structure.

**Step 4: Commit**

```bash
git add components/edit-project-dialog.tsx components/repo-project-hub.tsx components/folder-picker-dialog.tsx components/studio/studio-layout.tsx components/studio/hooks/use-studio-file.ts components/mdx-runtime/transformImports.ts components/mdx-runtime components/preview-sandbox components/__tests__/edit-project-dialog.test.tsx components/__tests__/folder-picker-dialog.test.tsx components/studio/hooks/__tests__/use-studio-file-read-authority.test.tsx
git commit -m "fix(studio): port surviving PR 41 integration fixes"
```

### Task 6: Generated types, full verification, local smoke, and handoff

**Files:**
- Regenerate: `convex/_generated/api.d.ts`
- Create: `docs/handoffs/2026-08-01-post-pr44-design-handoff.md`
- Update: relevant architecture/README notes only when behavior changed

**Step 1: Regenerate Convex types**

Run:

```bash
npx convex codegen
```

If deployment credentials are unavailable, stop and request the user's terminal-provided deployment context; never hand-edit the generated file for the final merge head.

**Step 2: Run static and automated verification**

```bash
npm run lint
npx tsc --noEmit
npm test -- --run
npm run build
git diff --check origin/main...HEAD
```

All commands must exit zero. Record exact test counts and any pre-existing warnings.

**Step 3: Run local browser smoke**

Start the local app and verify landing, login/auth redirect boundary, repository hub, Studio cold deep link, MDX/namespace preview, save/discard, media staging, and publish dialog. Do not perform an external GitHub commit during smoke testing without explicit credentials and confirmation.

**Step 4: Final review and correction loop**

Run an independent differential review of `33fe971..HEAD`. Fix all P1/P2 findings test-first and repeat the full verification suite.

**Step 5: Write Tarun's handoff**

The handoff must include:

- final #44 SHA and architecture invariants;
- local/CI verification evidence;
- PRs #34/#35/#37/#39/#40 to close as absorbed/superseded;
- confirmation that the four #41 fixes are already ported, then close #41;
- instructions to branch from post-merge `main`, transplant only PR #42's design increment, resolve its known overlapping files manually, run visual/a11y/performance checks, open a replacement design PR, then close #42.

**Step 6: Commit, push, and wait for CI**

```bash
git add convex/_generated/api.d.ts docs/handoffs/2026-08-01-post-pr44-design-handoff.md
git commit -m "docs: prepare post-PR44 design handoff"
git push origin docs/mdx-native-preview-architecture
gh pr checks 44 --watch
```

Do not mark the PR ready until every required check is green at the pushed head.

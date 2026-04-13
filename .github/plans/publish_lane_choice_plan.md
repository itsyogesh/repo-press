# Publish Lane Choice Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let Studio users choose whether to update the current RepoPress PR or create a new PR for a different subject of work, without silently mixing unrelated changes into one open PR.

**Architecture:** Keep exactly one RepoPress-managed **current** publish lane per project, but allow older GitHub PRs to remain open as inactive references. Extend `publishBranches` so RepoPress can distinguish the current lane from inactive open PRs, attach committed explorer/media ops to the publish branch that created them, and block overlapping files across multiple open PRs to avoid unsafe cross-PR publishing. Deliberately avoid full branch-local draft isolation or “switch back to any old PR and resume editing” in this iteration.

**Tech Stack:** Next.js App Router, Convex schema/queries/mutations, Octokit GitHub API helpers, React 19, Vitest, Biome.

---

## Summary

RepoPress currently assumes one active PR lane per project and always reuses it. That is why the Studio UI shows `View existing PR` and why later publishes append to the same PR. The approved product direction is to keep PR reuse as the default, but explicitly let the user create a new PR when the next set of changes is a different subject.

A safe implementation must go deeper than the dialog copy. Today, publish-branch tracking, merge cleanup, and media/explorer op cleanup all assume a single project-wide publish lane. This plan implements a **safe v1**: one current RepoPress lane plus inactive open PR references, lane-scoped committed-op cleanup, and overlap guards so the app does not silently corrupt open PRs.

## Context

- Reviewed on 2026-03-28 with the current implementation in:
  - `app/api/github/publish-ops/route.ts`
  - `convex/publishBranches.ts`
  - `components/studio/publish-dialog.tsx`
  - `components/studio/publish-ops-bar.tsx`
  - `components/studio/hooks/use-studio-queries.ts`
  - `components/studio/hooks/use-studio-publish.ts`
- Related issue: `#15` (`Document PR Workflow: How RepoPress Handles Pull Requests`)
- Recommendation for issue tracking:
  - **Create a new GitHub issue** for this feature, for example: `Support PR choice and safe current publish lane behavior`
  - **Update issue #15 with a scope-split comment** and link the new issue
  - Close `#15` if you want it to remain a documentation/history issue only
- Existing docs to update:
  - `docs/pr-workflow/README.md`

## Goals (Success-focused)

- Users can clearly see that Studio will update the current PR by default.
- Users can intentionally create a new PR for a different subject of work.
- RepoPress always knows which branch future publishes should target.
- Merge/close cleanup only touches records created by the matching publish branch.
- The system blocks unsafe overlapping files across multiple still-open PRs.

## Success Criteria / Acceptance

- When a current RepoPress publish branch exists, the publish dialog preselects `Update current PR`.
- The dialog always offers `Create new PR` as an explicit alternative.
- Choosing `Create new PR` creates a fresh `repopress/<base>/<timestamp>` branch, creates a fresh GitHub PR, and demotes the previous current lane to an inactive open reference.
- The publish bar shows the current PR and links to it.
- The dialog can list older still-open PRs as references, but they are not publish targets in this iteration.
- `explorerOps` and `mediaOps` committed during a publish are tagged with the publish branch that created them.
- Webhook merge/close cleanup only deletes committed explorer/media ops tied to the matching publish branch.
- Publish returns `409` with a clear message if the new PR attempt overlaps files already tracked by another still-open PR.
- Existing single-lane behavior still works when only one PR is open.
- `docs/pr-workflow/README.md` reflects the new behavior and its limitations.

## Scope

### In scope

- Publish dialog choice between “update current PR” and “create new PR”.
- Publish-branch status model for “current” vs “inactive open reference”.
- Lane-scoped explorer/media committed-op attribution and webhook cleanup.
- Overlap guard against publishing the same files into multiple open PRs.
- Studio current-PR indicator and old-PR reference links.
- Route/unit tests, docs update, lint/build verification.

### Out of scope

- Post-setup base-branch editing in project settings.
- Retargeting an already-open GitHub PR to a different base branch.
- Full branch-local draft isolation for documents.
- Reactivating an older inactive PR as the current editing lane.
- Draft PR support.
- Automatic PR title/body updates on later pushes.
- Rich merged/closed PR history UI inside Studio.

## Non-goals

- Do not redesign the entire Git model around multiple concurrent editable branches.
- Do not add new testing frameworks or browser-test tooling.
- Do not change Better Auth, project ownership, or GitHub permission logic.

## Assumptions

- Existing production data has at most one `publishBranches` record in the current “active” state per project.
- The repo currently uses Vitest only; there is no `@testing-library/react` setup, so UI logic should be extracted into pure helpers when it needs unit coverage.
- GitHub webhooks for PR merged/closed already reach `app/api/webhooks/github/route.ts`.
- Convex codegen will be run during implementation if generated API types need refresh.

## Dependencies

- New GitHub issue for this feature should exist before implementation starts.
- Local Convex workflow must be available to regenerate `_generated` types if schema/functions change.
- Existing docs issue `#15` should be cross-linked so the scope split is explicit.

## Proposed Approach

### Phase A - Make publish-branch state safe

Teach RepoPress the difference between the current publish lane and an older still-open PR that should no longer receive new publishes. Track which committed explorer/media ops belong to which publish branch so merge cleanup becomes branch-scoped instead of project-scoped.

### Phase B - Add explicit publish choice

Extend the publish route so the request can say “reuse current PR” or “create new PR”. Reuse remains the default. “Create new PR” demotes the current branch to inactive, creates a new current publish branch, and blocks overlaps with files already tracked by other still-open PRs.

### Phase C - Surface the behavior in Studio

Make the UI explain the current PR clearly, show the choice explicitly, and list older open PRs as references so the user understands what will happen before publishing.

### Phase D - Verify and document

Update the PR workflow docs, run targeted tests plus repo-wide lint/build, and manually verify the end-to-end flow with disjoint-file publishes.

## Milestones & Tasks

### Task 1: Model current vs inactive publish branches, and tag committed ops by branch

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/publishBranches.ts`
- Modify: `convex/explorerOps.ts`
- Modify: `convex/mediaOps.ts`
- Create: `lib/__tests__/publish-branch-lanes.test.ts`

**Step 1: Write the failing tests**

Add tests for:
- current lane lookup
- demoting the current lane to inactive
- listing current + inactive open lanes
- storing `publishBranchId` on committed explorer/media ops

Example target assertions:

```ts
it("returns the current publish branch for a project", async () => {
  const result = await (getCurrentForProject as any).handler(ctx, {
    projectId: "project_1",
    userId: "user_owner",
  })

  expect(result?._id).toBe("publish_branch_current")
})

it("demotes the current lane before a new one is created", async () => {
  await (deactivateCurrentForProject as any).handler(ctx, {
    projectId: "project_1",
    userId: "user_owner",
  })

  expect(ctx.db.patch).toHaveBeenCalledWith(
    "publish_branch_current",
    expect.objectContaining({ status: "inactive" }),
  )
})
```

**Step 2: Run the tests to verify they fail**

Run:

```bash
npx vitest run lib/__tests__/publish-branch-lanes.test.ts
```

Expected:
- FAIL because the new queries/mutations do not exist yet
- FAIL because the new schema fields/status values are missing

**Step 3: Write the minimal implementation**

Implement:
- `publishBranches.status` expands from `active | merged | closed` to `active | inactive | merged | closed`
- `publishBranches` gets a `listOpenForProject` query and a `deactivateCurrentForProject` mutation
- `explorerOps` gets `publishBranchId: v.optional(v.id("publishBranches"))`
- `mediaOps` gets `publishBranchId: v.optional(v.id("publishBranches"))`
- `markCommitted` in both op modules accepts and stores `publishBranchId`

Suggested signatures:

```ts
export const getCurrentForProject = query({ /* projectId + auth */ })
export const listOpenForProject = query({ /* projectId + auth */ })
export const deactivateCurrentForProject = mutation({ /* projectId + auth */ })
```

**Step 4: Run the tests to verify they pass**

Run:

```bash
npx vitest run lib/__tests__/publish-branch-lanes.test.ts
```

Expected:
- PASS

**Step 5: Commit**

```bash
git add convex/schema.ts convex/publishBranches.ts convex/explorerOps.ts convex/mediaOps.ts lib/__tests__/publish-branch-lanes.test.ts
git commit -m "feat: model current and inactive publish lanes"
```

### Task 2: Support explicit publish choice and overlap guards in the publish route

**Files:**
- Modify: `app/api/github/publish-ops/route.ts`
- Modify: `app/api/github/publish-ops/__tests__/route.test.ts`

**Step 1: Write the failing tests**

Add tests for:
- default publish mode reuses the current PR
- `publishMode: "create-new"` demotes the current lane, creates a new lane, and creates a new PR
- `publishMode: "create-new"` returns `409` if the new publish overlaps files already tracked by other open PRs
- committed explorer/media ops receive the new `publishBranchId`

Example target assertions:

```ts
it("creates a new PR when publishMode is create-new", async () => {
  const response = await POST(buildRequest({
    projectId: "project_123",
    publishMode: "create-new",
  }))

  expect(response.status).toBe(200)
  expect(createPullRequest).toHaveBeenCalledTimes(1)
  expect(convexMutationMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ projectId: "project_123" }),
  )
})
```

**Step 2: Run the tests to verify they fail**

Run:

```bash
npx vitest run app/api/github/publish-ops/__tests__/route.test.ts
```

Expected:
- FAIL because the request body does not support `publishMode`
- FAIL because the route always reuses the current PR

**Step 3: Write the minimal implementation**

Implement route behavior:
- Accept `publishMode?: "reuse-current" | "create-new"` in the request body
- Resolve the current lane with `api.publishBranches.getCurrentForProject`
- For `reuse-current` (or omitted), keep existing branch-reuse behavior
- For `create-new`:
  - gather current operation paths
  - compare them against `committedFilePaths` from other open lanes
  - return `409` if overlaps exist
  - demote the current lane to `inactive`
  - create a fresh publish branch record in `active` state
  - commit to the fresh branch and create a fresh PR
- Pass `publishBranchId` into `explorerOps.markCommitted` and `mediaOps.markCommitted`

Expected response semantics:

```ts
return NextResponse.json({
  ok: true,
  prNumber,
  prUrl,
  publishModeUsed,
})
```

**Step 4: Run the tests to verify they pass**

Run:

```bash
npx vitest run app/api/github/publish-ops/__tests__/route.test.ts
```

Expected:
- PASS

**Step 5: Commit**

```bash
git add app/api/github/publish-ops/route.ts app/api/github/publish-ops/__tests__/route.test.ts
git commit -m "feat: support explicit new-pr publishing mode"
```

### Task 3: Make webhook cleanup branch-scoped and preserve the current lane model

**Files:**
- Modify: `convex/githubWebhook.ts`
- Modify: `lib/__tests__/github-webhook-hardening.test.ts`
- Modify: `lib/__tests__/publish-branch-lanes.test.ts`

**Step 1: Write the failing tests**

Add tests for:
- merging an inactive PR only clears committed ops for that publish branch
- closing an inactive PR only updates that publish branch
- merging the current active PR marks it merged without deleting committed ops from unrelated open PRs

Example target assertions:

```ts
it("clears only committed ops tied to the merged publish branch", async () => {
  await (handlePRMerged as any).handler(ctx, {
    prNumber: 42,
    mergeCommitSha: "merge-sha-1",
    serverQueryToken,
  })

  expect(ctx.db.delete).toHaveBeenCalledWith("explorer_op_for_branch_42")
  expect(ctx.db.delete).not.toHaveBeenCalledWith("explorer_op_for_branch_84")
})
```

**Step 2: Run the tests to verify they fail**

Run:

```bash
npx vitest run lib/__tests__/github-webhook-hardening.test.ts lib/__tests__/publish-branch-lanes.test.ts
```

Expected:
- FAIL because webhook cleanup is still project-wide

**Step 3: Write the minimal implementation**

In `convex/githubWebhook.ts`:
- keep lookup by `prNumber`
- keep `merged` / `closed` status updates
- replace project-wide committed-op deletion with branch-scoped deletion using `publishBranchId`
- leave pending ops untouched
- keep `committedFilePaths` filtering for document publish transitions

Do **not** add branch-reactivation or lane switching in this iteration.

**Step 4: Run the tests to verify they pass**

Run:

```bash
npx vitest run lib/__tests__/github-webhook-hardening.test.ts lib/__tests__/publish-branch-lanes.test.ts
```

Expected:
- PASS

**Step 5: Commit**

```bash
git add convex/githubWebhook.ts lib/__tests__/github-webhook-hardening.test.ts lib/__tests__/publish-branch-lanes.test.ts
git commit -m "fix: scope webhook cleanup to the matching publish lane"
```

### Task 4: Add Studio publish choice UX and reference older open PRs

**Files:**
- Create: `lib/studio/publish-lane-view-model.ts`
- Create: `lib/studio/__tests__/publish-lane-view-model.test.ts`
- Modify: `components/studio/hooks/use-studio-queries.ts`
- Modify: `components/studio/hooks/use-studio-publish.ts`
- Modify: `components/studio/publish-dialog.tsx`
- Modify: `components/studio/publish-ops-bar.tsx`
- Modify: `components/studio/studio-layout.tsx`

**Step 1: Write the failing helper tests**

Because the repo does not currently include React Testing Library, extract the label/choice logic into a pure helper and test that.

Add tests for:
- default dialog mode is `reuse-current` when a current PR exists
- dialog mode is `create-new` when no current PR exists
- current PR summary text and CTA labels
- filtering older open PR reference links

Example target assertions:

```ts
it("defaults to reuse-current when a current PR exists", () => {
  expect(
    getPublishLaneViewModel({
      currentLane: { prNumber: 42, prUrl: "https://github.com/example/pull/42" },
      openLanes: [],
    }).defaultMode,
  ).toBe("reuse-current")
})
```

**Step 2: Run the tests to verify they fail**

Run:

```bash
npx vitest run lib/studio/__tests__/publish-lane-view-model.test.ts
```

Expected:
- FAIL because the helper does not exist yet

**Step 3: Write the minimal implementation**

Implement:
- `use-studio-queries.ts` fetches both the current lane and open-lane references
- `use-studio-publish.ts` stores `publishMode` and sends it in the request body
- `publish-dialog.tsx`:
  - shows the current PR card
  - preselects `Update current PR`
  - exposes `Create new PR`
  - shows older open PRs as links/reference only
  - only shows title/description inputs when creating a new PR
- `publish-ops-bar.tsx` shows the current PR number/link instead of a bare `PR` label
- `studio-layout.tsx` passes the new props through

Suggested request body shape:

```ts
body: JSON.stringify({
  projectId,
  title,
  description,
  publishMode,
})
```

**Step 4: Run the tests to verify they pass**

Run:

```bash
npx vitest run lib/studio/__tests__/publish-lane-view-model.test.ts app/api/github/publish-ops/__tests__/route.test.ts
```

Expected:
- PASS

**Step 5: Commit**

```bash
git add lib/studio/publish-lane-view-model.ts lib/studio/__tests__/publish-lane-view-model.test.ts components/studio/hooks/use-studio-queries.ts components/studio/hooks/use-studio-publish.ts components/studio/publish-dialog.tsx components/studio/publish-ops-bar.tsx components/studio/studio-layout.tsx
git commit -m "feat: add studio publish lane choice UX"
```

### Task 5: Document the behavior, verify it end-to-end, and prepare issue hygiene

**Files:**
- Modify: `docs/pr-workflow/README.md`
- Modify: `app/api/github/publish-ops/route.ts` (inline comments only if still needed after implementation)

**Step 1: Update the docs**

Document:
- current PR reuse remains the default
- Studio can create a new PR explicitly
- older still-open PRs remain references, not editable lanes in this iteration
- overlapping files across still-open PRs are blocked
- merge/close cleanup is publish-branch scoped

**Step 2: Run the targeted tests**

Run:

```bash
npx vitest run \
  lib/__tests__/publish-branch-lanes.test.ts \
  lib/__tests__/github-webhook-hardening.test.ts \
  lib/studio/__tests__/publish-lane-view-model.test.ts \
  app/api/github/publish-ops/__tests__/route.test.ts
```

Expected:
- PASS

**Step 3: Run repo-wide verification**

Run:

```bash
npm run lint
npm run build
```

Expected:
- `lint` exits 0
- `build` exits 0

**Step 4: Perform manual QA**

Manual QA checklist:
1. Create a new file and publish it → current PR is created.
2. Edit a different file and publish again with default option → same PR updates.
3. Edit another different file and choose `Create new PR` → fresh PR is created and shown as current.
4. Confirm the older PR still opens in GitHub, but Studio now targets the new PR.
5. Try to create a new PR with a file path already present in another still-open PR → publish is blocked with a clear overlap message.
6. Merge or close the older PR → the newer current PR remains usable.

**Step 5: Commit**

```bash
git add docs/pr-workflow/README.md app/api/github/publish-ops/route.ts
git commit -m "docs: describe explicit pr choice workflow"
```

## Risks & Mitigations

- **Risk:** True branch-local draft isolation does not exist.
  - **Mitigation:** Explicitly scope this iteration to one current RepoPress lane plus inactive open PR references, and block overlapping publishes across open PRs.

- **Risk:** Webhook merge cleanup currently assumes project-wide committed ops.
  - **Mitigation:** Add `publishBranchId` to committed explorer/media ops and delete only matching records.

- **Risk:** Users may assume they can reactivate an older open PR from Studio.
  - **Mitigation:** UI copy must say older PRs are references only in this iteration.

- **Risk:** Old docs/comments may still describe “one active PR forever”.
  - **Mitigation:** Update `docs/pr-workflow/README.md` and cross-link the new GitHub issue from `#15`.

- **Risk:** Adding a new UI test framework would create unnecessary setup churn.
  - **Mitigation:** Keep UI behavior testable through pure helper functions and route/function tests.

## Open Questions

- Should inactive open PRs be shown only in the publish dialog, or also in the publish bar footer?
- Do we want a follow-up issue for post-setup base-branch editing in project settings?
- Do we want a follow-up issue for true multi-lane reactivation and branch-local draft isolation?

## Acceptance & QA Checklist

- [ ] Default publish after an open PR updates the current PR.
- [ ] Choosing `Create new PR` creates a fresh PR and makes it the new current target.
- [ ] Overlapping file paths across still-open PRs are blocked.
- [ ] Webhook merge/close cleanup is lane-scoped.
- [ ] Older open PRs remain visible as references.
- [ ] Lint, targeted tests, and build all pass.

## Rollout Plan & Monitoring

- Land this behind normal feature development flow; no runtime feature flag required unless the diff grows significantly.
- Monitor:
  - `publish-ops` 409 overlap responses
  - webhook errors for merged/closed inactive PRs
  - user feedback around the current-PR copy and inactive-PR reference list

## Docs / Files to Update

- `docs/pr-workflow/README.md`
- `app/api/github/publish-ops/route.ts` comments
- GitHub issue `#15` comment / scope split
- New GitHub issue for this feature

## Reviewers and Approvers

- Reviewers: `@itsYogesh`
- Approver: `@itsYogesh`
- Assign PR to: `@itsTarun`

## Next Steps

1. Create the new GitHub issue for this feature and cross-link `#15`.
2. Approve this plan’s safe-v1 scope.
3. Implement Tasks 1-5 in order with frequent commits.
4. If safe-v1 lands cleanly, open a follow-up issue for true multi-lane reactivation / branch-local draft isolation.

---

Notes for contributors

- Keep this as a review artifact in `.github/plans/`; do not treat it as a committed product spec unless explicitly approved.
- Do not push directly to `main`; implement from a feature branch and reference this plan in the PR description.
- Keep each implementation PR small and verifiable.

# RepoPress Pull Request Workflow

RepoPress publishes content changes through GitHub pull requests instead of pushing directly to the base branch. This document describes the current behavior implemented in Studio and the publish route.

## Overview

RepoPress keeps one **current publish lane** per project.

- By default, Studio updates the current RepoPress PR.
- Users can explicitly choose **Create new PR** when the next set of changes should be reviewed separately.
- When a new PR is created, it becomes the new current publish lane.
- Older still-open RepoPress PRs remain visible as references, but Studio does not let you switch back to them as the active lane in this iteration.

## Current publish lane model

Publish lanes are tracked in Convex through the `publishBranches` table.

- `active`: the current publish lane for the project
- `inactive`: an older still-open RepoPress PR kept as a reference
- `merged`: a RepoPress PR that was merged
- `closed`: a RepoPress PR that was closed without merging

Studio reads:

- `publishBranches.getCurrentForProject` for the current lane
- `publishBranches.listOpenForProject` for the current lane plus older inactive references

## Publish behavior

When a publish is triggered from Studio:

1. RepoPress collects pending explorer ops, dirty documents, and pending media ops.
2. It saves the current draft first when a file is actively being edited.
3. It chooses a publish target:
   - **Default:** reuse the current publish lane
   - **Explicit choice:** create a new publish lane and new PR
4. If no current lane exists, RepoPress creates a branch named `repopress/<baseBranch>/<timestamp>`.
5. RepoPress batches the file changes into that branch and creates a commit.
6. If the lane does not have a PR yet, RepoPress creates one and stores the PR URL and PR number on the lane.
7. RepoPress marks committed explorer/media ops with the `publishBranchId` that created them.

## Reusing the current PR

Current PR reuse remains the default behavior.

- Publishing again without changing the mode adds another commit to the current RepoPress lane.
- If that lane already has a GitHub PR, the same PR is updated.
- Studio surfaces the current PR clearly in the publish dialog and ops bar so the user knows later publishes will keep targeting it.

This keeps related changes together and preserves the existing review conversation when the work is part of the same subject.

## Creating a new PR

Studio also offers **Create new PR** when the next changes should be reviewed separately.

When the user chooses that option:

1. RepoPress checks whether the new publish would overlap files already tracked by another still-open RepoPress PR.
2. If there is no overlap, the current active lane is demoted to `inactive`.
3. RepoPress creates a fresh `repopress/<baseBranch>/<timestamp>` branch.
4. RepoPress creates a fresh PR for that branch.
5. The new PR becomes the current publish lane for future publishes.

Older still-open RepoPress PRs remain visible in Studio as reference-only links.

## Overlap protection

RepoPress blocks unsafe multi-PR publishing across still-open lanes.

- When a user chooses **Create new PR**, RepoPress compares the new publish's file paths against file paths already committed in other still-open RepoPress lanes.
- If any file path overlaps, the publish route returns `409`.
- Studio shows the overlap details and prevents the publish until the conflict is resolved.

This protects against silently splitting the same file across multiple open RepoPress PRs.

## Webhook merge and close handling

GitHub webhooks update the matching publish lane by PR number.

- On merge:
  - the matched lane is marked `merged`
  - only committed explorer/media ops tagged with that lane's `publishBranchId` are deleted
  - document publish transitions still use the merged lane's `committedFilePaths`
- On close without merge:
  - the matched lane is marked `closed`
  - committed ops for unrelated lanes are left untouched

Cleanup is lane-scoped; it no longer assumes one project-wide committed-op bucket.

## Current limitations

This iteration intentionally does **not** support:

- reactivating an older inactive PR as the current Studio target
- full branch-local draft isolation
- editing the project's base branch from the publish dialog
- treating older open PRs as selectable publish targets

Older open PRs are references only until a future iteration adds explicit lane reactivation.

## Files involved

The workflow is primarily implemented in:

- `app/api/github/publish-ops/route.ts`
- `convex/publishBranches.ts`
- `convex/githubWebhook.ts`
- `convex/explorerOps.ts`
- `convex/mediaOps.ts`
- `components/studio/publish-dialog.tsx`
- `components/studio/publish-ops-bar.tsx`
- `components/studio/hooks/use-studio-publish.ts`
- `components/studio/hooks/use-studio-queries.ts`

## Verification checklist

To validate the workflow manually:

1. Create a file and publish it. A RepoPress PR should be created and shown as the current PR.
2. Edit a different file and publish again with the default option. The same PR should update.
3. Edit another different file and choose **Create new PR**. A fresh PR should be created and become current.
4. Confirm the older PR still exists in GitHub and is shown as a reference in Studio.
5. Try to create a new PR with a file path already tracked by another still-open RepoPress PR. The publish should be blocked with an overlap message.
6. Merge or close an older PR. The current PR should remain usable.

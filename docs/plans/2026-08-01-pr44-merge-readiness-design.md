# PR #44 Merge-Readiness Design

Date: 2026-08-01

## Goal

Make PR #44 safe to merge by replacing lane-wide recovery guesses with durable, attempt-scoped state; proving publish effects against immutable Git trees; completing content/storage invariants; porting the four surviving PR #41 fixes; and verifying the result locally and in CI.

## Chosen approach

Use the publish attempt as the unit of durable recovery. Each attempt records the exact canonical operation descriptors that its CAS commit was meant to produce. Cleanup is installed transactionally with an explicit immutable mode and processed in bounded phases. A publish lane records its immutable merge authority but never mutates document or staged state merely because a webhook says the PR merged.

The rejected alternatives were:

- extending the current lane-wide boolean flag, which cannot safely distinguish one attempt from a reused lane;
- failing closed for every finished-lane recovery, which is safe but leaves routine crash recovery to manual intervention.

## Core invariants

1. **One attempt, one immutable plan.** A publish attempt stores unique canonical paths with `create`, `update`, or `delete` and the expected Git blob SHA for every write.
2. **Git trees are the authority.** Trailer and parent checks identify a candidate interrupted commit, but adoption also verifies the candidate tree. A merged lane is evaluated only against its persisted `mergeCommitSha`, never a capped PR commit list or a later base head.
3. **Cleanup intent is durable before guards are released.** Recovery cannot mark an attempt terminal and then decide cleanup in a separate transaction. The attempt enters an explicit cleanup state first; scheduled continuations read that persisted state.
4. **Cleanup is attempt/path scoped.** An excluded attempt never restores or clears rows owned by earlier attempts on the same lane. For paths touched repeatedly on one lane, the latest lane intent determines the merged outcome.
5. **Content cleanliness is content-specific.** Every body/frontmatter mutation advances `contentVersion`. Merge finalization publishes only an unchanged document snapshot whose provenance belongs to the verified attempt. A newer draft remains draft and dirty.
6. **Every storage object has an owner until deletion succeeds.** Failed deletion always leaves a retryable tombstone, including undo, discard-all, stale cleanup, replacement, and lane cleanup.
7. **Every background pass has a hard bound.** A pass reads and writes a fixed number of indexed rows. Continuation state is stored, not inferred from lane status.

## Data model

### Publish attempts

Extend `publishAttempts` with:

- `operationDescriptors`: canonical `{ path, action, expectedBlobSha? }` entries;
- an optional recorded commit tree SHA;
- cleanup state containing an immutable mode, phase, and cursor/offset;
- terminal recovery outcome distinguishing reconciled, restored, and superseded attempts.

Attempt cleanup processes only IDs and provenance persisted on that attempt. Every mutation revalidates project, lane, attempt, row status, lane ID, and commit SHA before changing data.

### Publish branches

Replace the overloaded cleanup boolean with explicit lane lifecycle state:

- `mergeCommitSha` for merged lanes;
- a lane cleanup mode used only for uniform lane-wide work such as closing an unmerged lane or legacy residue;
- a durable phase/cursor for bounded continuation.

Merged webhook and client fallback calls record status and merge authority. They do not finalize content without authenticated Git verification.

### Document provenance

Add `publishAttemptId` to provenance. The tuple of lane, attempt, commit, content revision, and published content version identifies the exact snapshot. Finalization changes workflow status only when that provenance still owns the current content version.

## Git verification

### Interrupted commit adoption

Persist Git blob SHAs derived from the exact UTF-8 or base64 operation bytes. Candidate adoption requires:

- exact RepoPress trailer;
- one parent equal to the expected head;
- a non-truncated commit tree equal to the expected base tree plus the attempt descriptors.

### Merged lane

Persist the PR's immutable `mergeCommitSha` from the webhook or authenticated PR-status fallback. Inspect every affected path at that commit:

- create/update matches only when the final blob SHA equals the descriptor;
- delete matches only when the path is absent;
- missing, malformed, or truncated Git evidence fails closed.

This removes the pull-request commit endpoint's 250-commit limitation and works for merge, squash, and rebase merge methods.

## Content reconciliation

- History restore increments `contentVersion`.
- Merge finalization preserves any document edited after its published snapshot.
- Byte-identical synchronization supports both an active lane and the base branch. It rechecks that the pinned authority head is unchanged before recording provenance.
- Legacy timestamp provenance is migrated on a proven synchronization instead of being treated as permanently authoritative.
- `discardAll` clears only genuinely dirty local documents, not clean snapshots already held by an open lane.

## Media cleanup

All storage deletion callers use one helper contract:

- successful deletion removes or transitions the owning row;
- failed deletion retains or creates a `failed` tombstone;
- the bounded nightly retry deletes the tombstone only after storage deletion succeeds.

## Surviving PR #41 ports

Port only the four independently ratified fixes, with focused tests:

1. project-access-token wiring for the repo hub edit/folder picker;
2. `StudioPanelShell` flex-column containment;
3. cold-tree deep-link fetching when the selected file is absent from the client tree;
4. namespace import extraction and binding in the compatible MDX preview.

No obsolete native-runtime or configuration-removal behavior from PR #41 is included.

## Testing and release gates

Each behavior is implemented test-first. Required gates are:

- focused RED/GREEN tests for every audited failure sequence;
- full Vitest suite;
- Biome lint and formatting;
- TypeScript typecheck;
- Next.js production build;
- deployment-connected Convex codegen with generated output committed;
- local browser smoke of landing, authentication boundary, repository hub, Studio load/deep link, MDX preview, namespace component rendering, draft save/discard, and publish dialog;
- final differential review and green GitHub/Vercel checks at the pushed head.

## Handoff

After #44 is green and ready to merge, produce a Tarun handoff prompt that names the exact merged architecture, the PRs to close, the four ports already absorbed, and the safe sequence for rebuilding PR #42's design-only work from the new `main`.

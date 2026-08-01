# Post-PR #44 Design Handoff

Date: 2026-08-01

## Purpose

This handoff starts only after PR #44 is merged. PR #44 establishes the content, preview, publish, and recovery architecture that the next design pass must preserve. The next branch is a design-only reconstruction from the new `main`; it is not a continuation or merge of the old design branch.

## PR #44 authority

- Pull request: [#44 — safe MDX component ecosystem and preview contracts](https://github.com/itsyogesh/repo-press/pull/44)
- Architecture implementation head verified in this pass: `d28b381ab73568fd15e613e1c414b7c4f9e6d212`
- Merge-readiness design: `docs/plans/2026-08-01-pr44-merge-readiness-design.md`
- Merge-readiness implementation plan: `docs/plans/2026-08-01-pr44-merge-readiness.md`

Before beginning design work, replace the implementation SHA above with the actual merged `main` SHA in the new task notes and read the merge commit diff. Do not assume GitHub preserved individual commit IDs if #44 was squash-merged.

## Architecture that must survive the design pass

1. A publish attempt is the durable unit of recovery. Its canonical operation descriptors and associations are immutable evidence, not presentation state.
2. Git trees are the publishing authority. Interrupted commits require exact parent, trailer, descriptor, and tree proof. Merged work is judged against the persisted immutable merge commit, not a capped PR commit list or a moving branch head.
3. Reconciliation cleanup is attempt-scoped, bounded, resumable, and installed before attempt guards are released. Never restore or finalize a whole reused lane because one attempt finished.
4. Document cleanliness is content-version based. Workflow-only changes do not dirty content; a newer draft must remain dirty even when an older snapshot is finalized.
5. Document provenance distinguishes open-lane authority from merged base-branch authority and records the exact attempt, commit, content revision, and content version.
6. Every media storage object keeps a durable owner until deletion succeeds. Failed deletion becomes a retryable tombstone, and cleanup passes are indexed and bounded.
7. PR lifecycle changes flow through authenticated server routes and persist exact repository, base, head, PR, and merge authority. Webhook or client lifecycle signals alone never prove content.
8. Generic MDX preview stays safe and bounded. Compatible preview executes only approved signed artifacts in the isolated worker/opaque frame. Repository code is not executed in the host realm.
9. Namespace imports bind to a frozen, null-prototype copy of adapter-approved exports. Inherited or unapproved exports remain unavailable.
10. Cold Studio file reads use the pinned base commit and cannot overwrite a newer local draft or a newer request's loading state.
11. Document Git baselines explicitly distinguish unknown, absent, and blob states. A path proved absent must conflict if an external file appears before the next publish.
12. Lifecycle synchronization advances a server-authoritative fairness cursor before GitHub I/O; a failed or mismatched check cannot starve older pending lanes.

## Four PR #41 fixes already absorbed by #44

Do not re-port or merge PR #41. PR #44 already contains and tests the only four surviving integration fixes:

1. Per-project access-token wiring from the repository page through the project hub/edit flow.
2. Flex-column containment on the expanded Studio sidebar shell so the tree scrolls independently of its footer.
3. Cold-tree deep-link fetching at the immutable base commit, including `sha: null`/404 fallback and late-draft race protection.
4. Namespace import extraction and safe compatible-worker binding.

After #44 merges, close PR #41 as superseded by #44 and link the merged PR in the closing comment.

## Open PR disposition

The open-PR audit concluded:

- Close #34 as absorbed/superseded. Do not merge its old folder-picker branch.
- Close #35 as superseded. Its Remotion branch is stale and currently conflicts with `main`.
- Close #37 explicitly after #35; closing #35 does not automatically close the dependent PR.
- Close #39 as superseded by #44's ratified preview architecture. Do not revive its native-runtime assumptions.
- Close #40 as superseded. Do not remove RepoPress configuration/runtime boundaries using this stale branch.
- Close #41 after #44 merges; the four surviving fixes are already ported.
- Keep #42 only as a visual/source reference until the replacement design PR exists, then close it as superseded.

None of these stale PRs should be merged into post-#44 `main`.

## Required sequence for PR #42's design work

1. Wait until #44 is merged and all required checks are green on the merged `main`.
2. Fetch and fast-forward local `main`.
3. Create a new branch from that exact post-merge `main`, for example `feat/post-pr44-design-system`.
4. Inspect PR #42 commit-by-commit as a design reference. Recreate or selectively transplant only its visual design increment; do not merge the branch and do not wholesale cherry-pick commits that mix architecture, generated files, or stale behavior.
5. Resolve overlapping files manually against the post-#44 contracts, especially Studio layout/preview, shared UI primitives, landing sections, global theme CSS, and any repo/project surfaces touched by #44.
6. Preserve semantic Tailwind/shadcn tokens and the current Typeset/MDX preview boundaries. A design change must not select a preview provider, relax sandbox containment, alter publish authority, or mutate recovery/provenance state.
7. Add or update focused visual and interaction regressions for every reconstructed area.
8. Run the full local gate: Biome, TypeScript, all Vitest tests, production build, and `git diff --check`.
9. Run browser review at desktop and mobile breakpoints, keyboard-only navigation, focus visibility, contrast, reduced motion, overflow/scroll containment, and empty/loading/error states.
10. Measure performance on the landing page and Studio shell; do not regress initial rendering or eagerly load demo/media/runtime code.
11. Open a new replacement design PR against `main`, link #42 for provenance, and explain which #42 ideas were deliberately kept or dropped.
12. Close #42 only after the replacement PR exists.

## Verification evidence from the merge-readiness pass

At implementation head `d28b381`:

- `npm run lint`: exit 0, zero errors, eight pre-existing warnings.
- `npx tsc --noEmit`: exit 0.
- `npm test -- --run`: 139 files, 1,636 tests passed.
- production `npm run build`: exit 0; compile, TypeScript, page collection, and 36 static pages completed. Known dependency-version and deprecation warnings remain non-blocking.
- `git diff --check origin/main...HEAD`: exit 0.
- final independent differential review: approved with no actionable P0-P2 findings at `d28b381`.
- local browser smoke: landing, login, unauthenticated dashboard redirect, Studio documentation, and interactive repository scanner passed with no browser console errors.
- authenticated repository hub, Studio save/discard, media staging, and publish-dialog mutation smoke require a configured Convex deployment and signed-in GitHub session. Do not claim those paths manually verified until the final operator smoke is recorded.
- Convex codegen must be run at the final branch head using the deployment-connected environment. Generated output must be committed; hand-edited generated declarations are not an acceptable merge artifact.
- GitHub CI and Vercel must be green at the final pushed head, not merely at the older remote head.

## Tarun starter prompt

Use the following prompt verbatim after #44 is merged:

> Start from a fresh branch off the current post-PR-#44 `main`. Read `docs/handoffs/2026-08-01-post-pr44-design-handoff.md`, both `2026-08-01-pr44-merge-readiness` plan documents, and the final #44 diff before changing code. PR #44's publish-attempt, immutable-Git-authority, cleanup, provenance, storage-tombstone, preview-sandbox, namespace-import, and cold-file-read contracts are non-negotiable. Use PR #42 only as a visual reference: reconstruct the design increment manually on the new architecture, do not merge its branch, and do not wholesale cherry-pick mixed commits. First produce a file-overlap map and a short design plan. Then implement in reviewable slices with focused regressions. Run full lint, TypeScript, Vitest, production build, desktop/mobile browser checks, keyboard/a11y/contrast/reduced-motion checks, and landing/Studio performance checks. Open a replacement design PR against `main`, document which #42 ideas were retained or rejected, and only then close #42. Do not close or merge any other PR until you have verified its disposition against this handoff.

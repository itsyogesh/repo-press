# Remaining Native MDX Ecosystem Implementation Plan

> **For GPT-5.5 xhigh:** Continue this plan with a fresh context, high reasoning effort, strict TDD, and agent-driven implementation/review gates. Read every required source below before editing.

**Goal:** Finish RepoPress's first safe, reusable MDX component ecosystem slice and leave draft PR #44 ready for deliberate human review.

**Architecture:** RepoPress keeps authoring metadata serializable in the Studio realm, renders generic MDX through a safe Typeset fallback, and permits compatible execution only in an opaque-origin iframe on a separately configured origin. Registry installation is declarative, deterministic, integrity-pinned, and published through GitHub pull requests. Native repository execution remains outside this slice and must not be implied by the compatible sandbox.

**Tech Stack:** Next.js 16, React 19, TypeScript, Convex, Better Auth, Tailwind CSS v4, shadcn/ui Typeset, unified/remark MDX, Zod, Vitest, Biome, GitHub/Octokit.

---

## New-thread bootstrap message

Paste the following as the first message in a new Codex thread after selecting **GPT-5.5 xhigh** in the app:

```text
Continue RepoPress's ratified native MDX ecosystem implementation as the orchestrator.

Repository: /Users/yogesh/Projects/Repopress/repo-press
Dedicated worktree: /Users/yogesh/Projects/Repopress/repo-press/.worktrees/mdx-native-preview-architecture
Branch: docs/mdx-native-preview-architecture
Draft PR: https://github.com/itsyogesh/repo-press/pull/44

First read, completely and in this order:
1. AGENTS.md
2. .github/copilot-instructions.md
3. docs/plans/2026-07-12-native-mdx-preview-ecosystem-design.md
4. docs/plans/2026-07-12-native-mdx-preview-ecosystem.md
5. docs/plans/2026-07-16-remaining-mdx-ecosystem-orchestration-handoff.md

Tasks 1-7 are complete, reviewed, tested, committed, and pushed. Continue with Tasks 8-16 without redoing completed work. Note that Tasks 8 through 16 are nine numbered tasks; if you need exactly eight execution batches, combine Tasks 15 and 16 only—do not skip either task.

Use fresh implementer agents per task, strict RED/GREEN TDD, then separate specification and quality/security reviewers. Fix every Critical/Important finding and repeat both reviews before pushing each completed task. Keep the branch clean, push after every approved task, and update the draft PR. Do not merge or close older PRs until Task 16 passes and the user explicitly reviews the result.

Begin by verifying the worktree/branch/PR state and presenting a concise orchestration sequence for Tasks 8-16. Then execute Task 8. Do not ask me to restate repository context already contained in these files.
```

## Authoritative repository state

- Dedicated implementation worktree: `/Users/yogesh/Projects/Repopress/repo-press/.worktrees/mdx-native-preview-architecture`
- Implementation branch: `docs/mdx-native-preview-architecture`
- Remote branch: `origin/docs/mdx-native-preview-architecture`
- Draft PR: [#44](https://github.com/itsyogesh/repo-press/pull/44)
- Base branch: `main`
- State at handoff: local and remote implementation branches are synchronized and clean.
- Latest implementation commit at handoff: `ad84e87 fix(studio): preserve edits through MDX fragments`
- Latest verified exact-tree suite: 95 files, 908 tests passed with `--maxWorkers=2`.
- PR checks at handoff: lint, tests, typecheck, Vercel deployment, and Vercel Preview Comments all passed.

The primary checkout contains a separate, pushed preservation branch:

- Branch: `fix/login-auth-redirects`
- Commits: `8bf276e fix(auth): redirect authenticated users from login` and `681df36 chore: preserve local dependency lock state`
- It is not part of PR #44. Do not merge, cherry-pick, rewrite, or delete it as part of this plan.

## Required context and invariants

Read these files fully before editing:

- `AGENTS.md`
- `.github/copilot-instructions.md`
- `docs/plans/2026-07-12-native-mdx-preview-ecosystem-design.md`
- `docs/plans/2026-07-12-native-mdx-preview-ecosystem.md`

Preserve these ratified decisions:

1. Preview fidelity is explicit: `generic`, `compatible`, or `native`.
2. Generic preview is a safe, bounded, serializable Typeset render model. It never executes repository MDX.
3. Compatible preview is allowed only in an opaque-origin iframe on a separately configured origin.
4. The iframe sandbox is exactly `allow-scripts`; never add `allow-same-origin`, forms, popups, or navigation.
5. Opaque-origin messages authenticate through window identity, a single-use transferred capability/port, session ID, snapshot version, and monotonically increasing sequence—not `event.origin`.
6. `RenderBindings` are executable and sandbox-only. `AuthoringCatalog` is bounded, serializable, detached, deeply frozen metadata.
7. Repository adapters, React functions, `new Function`, `eval`, and browser transpilation never enter Studio state or execute in the Studio realm.
8. Document paths are content-relative in canonical state; legacy rows are selected explicitly through `pathRepresentation`, never prefix guessing.
9. Source edits are surgical and fail closed. Never serialize an entire MDX AST to change one component prop.
10. `meta.repopress` is the constrained, versioned extension namespace. Unrelated shadcn `meta` remains opaque inert data.
11. Registry locks use the single normalized authoring contract, immutable resolution identity, SHA-256 integrity, deterministic ordering, dependency/target collision validation, and local-modification digests.
12. Registry installation writes only to a dedicated GitHub branch and opens a PR. The base branch is never mutated directly.
13. Native runner work is a follow-on plan. Do not overclaim that the compatible sandbox is a complete arbitrary-code security boundary.

## Completed Tasks 1-7

Do not reimplement these tasks. Audit callers when a remaining task moves or deletes their compatibility surface.

### Task 1: Preview domain contracts

- Fidelity/result/session contracts are in `lib/preview/contracts.ts`.
- HTTPS-only sandbox URLs and positive safe-integer sequence/snapshot counters are enforced.

### Task 2: Ordered session state and provider selection

- Ordered update/replay/session validation lives in `lib/preview/session-state.ts`.
- Provider selection and explicit downgrade reasons live in `lib/preview/provider-selection.ts`.

### Task 3: Canonical paths and overlays

- Canonical content paths always prefix through an explicit conversion boundary.
- Untagged rows are explicit `legacy_repo_v0`; current writers emit `content_relative_v1`.
- Publish identity is normalized, collision-safe, Unicode-hardened, and concurrent-save safe.

### Task 4: Safe generic Typeset fallback

- Owned bounded MDX parsing/model: `lib/preview/generic-render-model.ts`.
- Safe renderer: `components/mdx-runtime/GenericPreview.tsx`.
- Pinned shadcn Typeset CSS with provenance: `app/typeset.css`.
- Source/parser/model budgets and pre-parse structural guards are mandatory and already tested.

### Task 5: Render bindings versus authoring catalog

- Executable names-only boundary: `lib/preview/render-bindings.ts`.
- Shared authoring model: `lib/studio/authoring-catalog.ts`.
- Executable adapters and the same-origin JSX bridge were removed from Studio.
- Component discovery uses the bounded owned MDX parser and child-preserving placeholders.

### Task 6: Registry and lock schemas

- Registry schema and shared normalized authoring contract: `lib/repopress/registry-schema.ts`.
- Deterministic lock schema: `lib/repopress/lock-schema.ts`.
- Config, catalog, and lock use the same normalized vocabulary.

### Task 7: Source-preserving component edits

- Surgical editor: `lib/studio/mdx-source-edit.ts`.
- Targets bind name, AST path, UTF-16 opening span, exact opening tag, and bounded full-source snapshot.
- Expressions, spreads, duplicate attributes, stale/forged targets, accessors, unsupported values, and unsafe names fail closed.
- Valid MDX fragments remain transparent structural containers.

## Remaining execution plan

The original plan has **nine remaining numbered tasks**: Tasks 8 through 16. The user's phrase “remaining eight tasks” is a counting mismatch. If eight execution batches are desired, combine Tasks 15 and 16 as the final closeout batch; preserve all requirements from both tasks.

The exact file lists, test commands, and step-by-step requirements are authoritative in `docs/plans/2026-07-12-native-mdx-preview-ecosystem.md`. The concise orchestration below does not replace them.

### Task 8: Opaque-origin sandbox protocol

- Implement pure, bounded protocol guards in `lib/preview/sandbox-protocol.ts`.
- Test strict message schemas, serialized size/rate caps, window identity, single-use bootstrap capability, session/snapshot/sequence binding, replay rejection, and teardown invalidation.
- Never use `event.origin` as authentication for an opaque-origin iframe.
- Commit: `feat(preview): define opaque sandbox protocol`.

### Task 9: Compatible preview frame and inert sandbox shell

- Add host frame, `/preview/sandbox`, sandbox runtime shell, isolation headers, and fail-closed origin configuration.
- The iframe must have exactly `sandbox="allow-scripts"`.
- The shell may handshake and render only a RepoPress-owned test element in this task; it must not execute repository code yet.
- Commit: `feat(preview): add isolated compatible preview frame`.

### Task 10: Remove repository execution from the Studio realm

- Add the import-boundary regression guard first.
- Move MDX evaluation, adapter evaluation, and browser transpilation behind `components/preview-sandbox/`.
- Studio exchanges serialized source/artifacts/status only; no React functions or executable bindings enter host state.
- Audit every old action/helper caller with `rg` before deleting anything.
- Preserve generic fallback when no trusted compatible artifact exists.
- Commit: `security(preview): remove repository execution from Studio`.

### Task 11: Official Callout registry fixture

- Add the smallest browser-safe, semantic, token-based Callout component and MDX fixture.
- Validate it through the current `registryItemSchema` and shared normalized authoring contract.
- Include title, variant enum, children slot, framework targets, version, provenance, and integrity inputs.
- Commit: `feat(registry): add official Callout component fixture`.

### Task 12: Deterministic install planner and Next/Fumadocs map adapter

- Implement pure registry resolution, immutable install plans, and surgical runtime-map edits.
- Cover dependency recursion/cycles, target conflicts, integrity, local modifications, CSS/packages, dry-run output, deterministic order, and fail-closed unsupported source.
- Perform no GitHub writes in this task.
- Commit: `feat(registry): plan component installs deterministically`.

### Task 13: Publish registry installations through a GitHub PR

- Add the authenticated install route and supporting GitHub/auth helpers.
- Resolve project/repository/base ref from authenticated server state; never trust forged owner/repo/ref request inputs.
- Support dry-run, dedicated branch creation, one exact batch commit, and PR creation.
- Enforce editor/owner policy, IDOR defenses, item allowlists, URL validation, and no base-branch writes.
- Commit: `feat(registry): install components through pull requests`.

### Task 14: Studio Callout ecosystem proof

- Exercise normalized metadata → palette → form → valid insertion → surgical edit → preview selection/downgrade.
- Remove the deprecated `buildComponentRegistry` wrapper.
- Studio consumes `AuthoringCatalog` and `PreviewResult`, never executable bindings.
- Commit: `feat(studio): author registry components through safe contracts`.

### Task 15: Remove generated preview-adapter authority and document fidelity

- New setup must not generate `.repopress/mdx-preview.tsx` or make generated component functions/catalogs authoritative config.
- Existing explicit adapters remain readable but untrusted until isolated.
- Update setup/config behavior and documentation to describe generic/compatible/native grades accurately.
- Commit: `refactor(config): make native discovery the default`.

### Task 16: Final verification and closeout

- Prove no host-realm repository execution outside `components/preview-sandbox/**`.
- Run full lint, typecheck, tests, production build, production dependency audit, status/stat/diff checks.
- Investigate unintended live GitHub requests instead of normalizing them as harmless test output.
- Record third-party warnings separately and never describe warning output as clean.
- Commit only real verification fixes: `fix(preview): address ecosystem verification findings`.

## Orchestration protocol

For each task:

1. Re-read that task's full section in the authoritative implementation plan.
2. Spawn one fresh implementer agent with exact scope and a no-push instruction.
3. Require failing tests first and capture RED evidence.
4. Implement only the task's smallest safe contract.
5. Require focused tests, relevant regressions, Biome, TypeScript, and `git diff --check`.
6. Require a clean, separate task commit.
7. Spawn a fresh specification reviewer and a fresh quality/security reviewer.
8. Address every Critical/Important finding with new failing tests and a follow-up commit.
9. Repeat both reviews until approved.
10. Push the approved task and update draft PR #44.
11. Update the working plan before starting the next task.

Do not run concurrent implementers against overlapping files. Research-only agents may run in parallel and must not edit. The root orchestrator must read skill instructions itself and must not delegate interpretation of repository instructions.

## Required checkpoints

- **After Task 10:** demonstrate that Studio has no repository-code execution path and compatible execution exists only behind the opaque-origin protocol.
- **After Task 14:** demonstrate the full Callout authoring flow, including generic downgrade behavior when no trusted compatible artifact is available.
- **After Task 16:** present exact verification evidence, remaining warnings/audit findings, PR scope, and a proposed old-PR cleanup/merge order. Do not merge or close PRs without explicit user approval.

## Definition of done

This first ecosystem slice is done only when:

- Tasks 8-16 are implemented and independently approved.
- The branch and remote are synchronized and clean.
- Full tests, lint, typecheck, and production build pass.
- Host-realm repository execution guard reports zero violations.
- Registry fixture, planner, PR installation route, and Studio proof all pass together.
- Documentation describes fidelity and trust boundaries honestly.
- Draft PR #44 is reviewable with CI green.
- Remaining dependency/security warnings and old PRs are explicitly triaged rather than silently ignored.

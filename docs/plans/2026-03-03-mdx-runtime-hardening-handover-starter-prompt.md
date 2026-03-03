# MDX Runtime Hardening — Handover Starter Prompt (2026-03-03)

Use this handover prompt to continue the **in-progress** hardening stream from:
`docs/plans/2026-03-02-mdx-runtime-hardening-plan.md`

Current repository baseline before starting:
- Branch includes hybrid media architecture + review fixes commit: `4da9b6b`
- Phase 2 component authoring is complete
- Hardening plan status is still pending for Tasks 1-6

---

## Recommended Next Slice

Start with **Task 1: Persistent Adapter Cache** (foundational), then continue to Task 2 only if Task 1 is fully complete and verified.

Reason:
- Task 1 is the dependency foundation for Task 2 and Task 5 in the plan.
- Current code in `lib/hooks/use-preview-context.ts` still reloads/transpiles adapters without persistent cache.

---

## Copy/Paste Prompt for Claude

```text
Execute the in-progress hardening plan from:
docs/plans/2026-03-02-mdx-runtime-hardening-plan.md

Workstream to execute now:
1) Task 1: Persistent Adapter Cache (required)
2) Task 2: GitHub API Rate Limiting & Debounce (only after Task 1 passes fully)

Repository context:
- Latest baseline commit with hybrid media + review fixes: 4da9b6b
- Do not regress Phase 2 hybrid media behavior:
  - repo-relative src persistence
  - media staging via mediaOps
  - /api/media/resolve proxy behavior
- Keep existing manual publish behavior unchanged.

Implementation requirements:
- Follow TDD for each meaningful behavior change.
- Keep changes minimal and scoped to these tasks.
- Update the source plan doc checklists/progress tables as each step completes.
- If any task detail in plan is outdated relative to current code, preserve intent and document the deviation in the plan notes section.

Primary files likely involved:
- Create: lib/repopress/adapter-cache.ts
- Modify: lib/repopress/adapter.ts
- Modify: lib/repopress/esbuild-browser.ts
- Modify: lib/hooks/use-preview-context.ts
- Modify: app/dashboard/[owner]/[repo]/adapter-actions.ts
- Modify: app/dashboard/[owner]/[repo]/plugin-actions.ts

Verification gates (must run and report):
1) npx biome check
2) npx tsc --noEmit
3) npm test
4) npm run build
5) Manual check in browser on localhost:3001:
   - Open Studio for a repo twice and verify adapter load improves/no duplicate reload behavior
   - Rapid file switching does not spam adapter/plugin fetches
   - No new console errors

Code review pass (required):
- Perform findings-first review of your own diff.
- Fix all discovered regressions.
- Re-run full verification commands.

Commit policy:
- Commit only after all verification gates pass.
- Do not push.
- Use clear commit message(s):
  - feat(mdx-runtime): add persistent adapter cache with invalidation
  - feat(mdx-runtime): add debounce and request dedup for preview context

Final output format:
1) Findings-first review summary
2) What was implemented (Task 1, Task 2)
3) Verification outputs summary
4) Plan file updates made
5) Any deviations and rationale
6) Commit SHA(s)
```

---

## Handover Notes

- If Task 1 reveals design constraints that block clean Task 2 completion, stop after Task 1, fully verify, and hand off with explicit blockers.
- Keep all changes backward-compatible for existing Studio flows.

# MDX Runtime Hardening — Starter Prompt

> Use this prompt to begin implementation of the MDX Runtime Hardening plan.

---

## Full Implementation Prompt

```
I want to implement the MDX Runtime Hardening plan located at:
docs/plan/2026-03-02-mdx-runtime-hardening-plan.md

Start with Task 1: Persistent Adapter Cache.

Follow this workflow for each task:

1. IMPLEMENT: Write the code according to the plan
2. LINT: Run `npm run lint` — fix all errors
3. TYPECHECK: Run `npx tsc --noEmit` — fix all type errors
4. TESTS: Run any existing tests if applicable
5. MANUAL TEST: Verify the feature works manually
6. BUILD: Run `npm run build` — must pass
7. COMMIT: Create commit with descriptive message (DO NOT PUSH)
8. UPDATE PLAN: Update docs/plan/2026-03-02-mdx-runtime-hardening-plan.md:
   - Mark completed steps with [x]
   - Update Status column in Progress tables
   - Add any implementation notes

After completing Task 1, proceed to Task 2, and so on.

Track progress in the plan document itself — use it as the source of truth.

DO NOT SKIP any workflow step.
DO NOT PUSH commits.
```

---

## Single Task Prompt (Alternative)

Use this if you want to implement one task at a time:

### Task 1 Only

```
Implement Task 1: Persistent Adapter Cache from docs/plan/2026-03-02-mdx-runtime-hardening-plan.md

Workflow:
1. Create lib/repopress/adapter-cache.ts with IndexedDB cache
2. Update lib/repopress/adapter.ts to use cache
3. Run npm run lint && npx tsc --noEmit
4. Manual test: refresh page, verify adapter loads from cache
5. Run npm run build
6. Commit (do not push)
7. Update plan document with completion status
```

### Task 2 Only

```
Implement Task 2: GitHub API Rate Limiting & Debounce from docs/plan/2026-03-02-mdx-runtime-hardening-plan.md

Workflow:
1. Add 500ms debounce to usePreviewContext
2. Implement request deduplication
3. Add rate limit handling
4. Run npm run lint && npx tsc --noEmit
5. Manual test: rapid file switches, verify no duplicate requests
6. Run npm run build
7. Commit (do not push)
8. Update plan document with completion status
```

### Task 3 Only

```
Implement Task 3: Private Asset URL Signing from docs/plan/2026-03-02-mdx-runtime-hardening-plan.md

Workflow:
1. Create app/api/github/sign-asset-url/route.ts
2. Update lib/hooks/use-preview-context.ts with resolveAssetUrl
3. Update components/studio/repo-jsx-bridge.tsx
4. Run npm run lint && npx tsc --noEmit
5. Manual test: private repo image rendering
6. Run npm run build
7. Commit (do not push)
8. Update plan document with completion status
```

### Task 4 Only

```
Implement Task 4: Expression Sandbox from docs/plan/2026-03-02-mdx-runtime-hardening-plan.md

Workflow:
1. Create lib/repopress/safe-eval.ts with allowlist parser
2. Update components/studio/repo-jsx-bridge.tsx to use safeEval
3. Run npm run lint && npx tsc --noEmit
4. Manual test: verify prop expressions work, unsafe code blocked
5. Run npm run build
6. Commit (do not push)
7. Update plan document with completion status
```

### Task 5 Only

```
Implement Task 5: Compile Cache with SHA from docs/plan/2026-03-02-mdx-runtime-hardening-plan.md

Workflow:
1. Extend lib/repopress/adapter-cache.ts for compile cache
2. Update components/mdx-runtime/PreviewRuntime.tsx
3. Run npm run lint && npx tsc --noEmit
4. Manual test: verify cached preview updates <50ms
5. Run npm run build
6. Commit (do not push)
7. Update plan document with completion status
```

### Task 6 Only

```
Implement Task 6: Plugin Merge Determinism from docs/plan/2026-03-02-mdx-runtime-hardening-plan.md

Workflow:
1. Update lib/hooks/use-preview-context.ts with deterministic merge
2. Add diagnostics for merge order
3. Run npm run lint && npx tsc --noEmit
4. Manual test: verify consistent component availability
5. Run npm run build
6. Commit (do not push)
7. Update plan document with completion status
```

---

## Quick Reference

| Task | Key File to Create                       | Key Concept         |
| ---- | ---------------------------------------- | ------------------- |
| 1    | `lib/repopress/adapter-cache.ts`         | IndexedDB cache     |
| 2    | Modify `use-preview-context.ts`          | Debounce + dedupe   |
| 3    | `app/api/github/sign-asset-url/route.ts` | Signed URLs         |
| 4    | `lib/repopress/safe-eval.ts`             | Allowlist parser    |
| 5    | Modify `PreviewRuntime.tsx`              | Compile memoization |
| 6    | Modify `use-preview-context.ts`          | Deterministic merge |

---

## Verification Commands

```bash
# Lint
npm run lint

# Type check
npx tsc --noEmit

# Build
npm run build

# Test (if exists)
npm run test

# Check plan progress
grep -E "^\| [0-9]" docs/plan/2026-03-02-mdx-runtime-hardening-plan.md
```

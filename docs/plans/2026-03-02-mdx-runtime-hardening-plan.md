# MDX Runtime Hardening Plan

> **Plan Version:** 1.0  
> **Created:** 2026-03-02  
> **Status:** IN PROGRESS
> **Done:** Plan structure complete; Task 1 code/test/build completed and committed.
> **Left:** Task 1 manual browser verification, then Tasks 2-6 execution and check-off.
> **Last Audited:** 2026-03-03 (Task 1 updated with commit `6cbd6ab`)
> **Execution Prompt:** `docs/plans/2026-03-03-mdx-runtime-hardening-handover-starter-prompt.md`
> **Baseline Commit Before Task Execution:** `4da9b6b`

---

## Overview

This plan addresses technical debt and hardening for the MDX Runtime feature. The implementation follows a dependency-ordered approach where each task builds on the previous one.

## Implementation Workflow

For each task:

1. Implement the feature
2. Run lint (`npm run lint`)
3. Run typecheck (`npx tsc --noEmit`)
4. Run tests (if exists)
5. Manual testing
6. Build (`npm run build`)
7. Commit (DO NOT PUSH)
8. Update this document with completion status

---

## Task 1: Persistent Adapter Cache

### Goal

Replace in-memory adapter cache with IndexedDB for persistence across sessions. Add SHA-based cache invalidation.

### Files to Modify/Create

- Create: `lib/repopress/adapter-cache.ts` (new)
- Create: `lib/repopress/__tests__/adapter-cache.test.ts` (new)
- Modify: `lib/hooks/use-preview-context.ts`
- Modify: `app/dashboard/[owner]/[repo]/adapter-actions.ts`

### Implementation Details

#### 1.1 Create IndexedDB Cache Module

```typescript
// lib/repopress/adapter-cache.ts
// - Open 'repopress-cache' database
// - Store transpiled adapters with key: `${owner}/${repo}@${branch}:${entryPath}:${fileSha}`
// - TTL: 24 hours default
// - Methods: get(key), set(key, value, sha), invalidate(prefix), clear()
```

#### 1.2 Update Adapter Loading

```typescript
// lib/repopress/adapter.ts
// - Check IndexedDB cache first before fetch
// - On fetch, compare SHA with cached version
// - Update cache on successful transpilation
```

#### 1.3 Cache Invalidation Strategy

- Invalidate when file SHA changes
- Manual invalidation endpoint for force-refresh
- Clear stale entries on app startup (older than 24h)

### Dependencies

- None (foundational)

### Completion Criteria

- [x] IndexedDB cache module created
- [x] Adapters load from cache on page refresh
- [x] Cache invalidates when file SHA changes
- [x] No duplicate adapter fetches on same session

### Progress

| Step                       | Status  | Notes |
| -------------------------- | ------- | ----- |
| 1.1 Create cache module    | DONE    | Added IndexedDB + memory fallback cache with TTL, invalidation, pruning, clear APIs |
| 1.2 Update adapter loading | DONE    | `use-preview-context` now keys adapter compile cache by owner/repo/branch/path+sha |
| 1.3 Invalidation strategy  | DONE    | SHA-keyed entries + startup prune + stale entry eviction on read |
| Lint pass                  | DONE    | `npx biome check` passes (repo has existing non-blocking warnings) |
| Typecheck pass             | DONE    | `npx tsc --noEmit` passed |
| Manual test                | PENDING | Browser verification for adapter reload/cache reuse still pending |
| Build pass                 | DONE    | `npm run build` passed |
| Commit                     | DONE    | `6cbd6ab` |

---

## Task 2: GitHub API Rate Limiting & Debounce

### Goal

Add debounce to adapter/plugin loading and implement rate limiting for GitHub API calls.

### Files to Modify

- Modify: `lib/hooks/use-preview-context.ts`
- Modify: `app/dashboard/[owner]/[repo]/adapter-actions.ts`
- Modify: `app/dashboard/[owner]/[repo]/plugin-actions.ts`

### Implementation Details

#### 2.1 Debounce Adapter Loading

```typescript
// Add 500ms debounce to usePreviewContext
// Cancel pending requests when props change
// Use AbortController for fetch cancellation
```

#### 2.2 Rate Limiting

```typescript
// - Implement token bucket or sliding window
// - Queue requests when limit approached
// - Retry with exponential backoff on 403/429
// - Show user-friendly rate limit indicator
```

#### 2.3 Request Deduplication

```typescript
// - Deduplicate identical adapter/plugin requests
// - Share in-flight request promises
// - Prevent thundering herd on rapid component switches
```

### Dependencies

- Task 1 (uses cache to reduce API calls)

### Completion Criteria

- [ ] 500ms debounce on adapter changes
- [ ] Rate limit detection and handling
- [ ] Request deduplication working
- [ ] No 403/429 errors in normal usage

### Progress

| Step                      | Status  | Notes |
| ------------------------- | ------- | ----- |
| 2.1 Debounce loading      | PENDING |       |
| 2.2 Rate limiting         | PENDING |       |
| 2.3 Request deduplication | PENDING |       |
| Lint pass                 | PENDING |       |
| Typecheck pass            | PENDING |       |
| Manual test               | PENDING |       |
| Build pass                | PENDING |       |
| Commit                    | PENDING |       |

---

## Task 3: Private Asset URL Signing

### Goal

Enable asset resolution for private repositories via signed GitHub blob URLs.

### Files to Modify/Create

- Create: `app/api/github/sign-asset-url/route.ts` (new)
- Modify: `lib/hooks/use-preview-context.ts`
- Modify: `components/studio/repo-jsx-bridge.tsx`

### Implementation Details

#### 3.1 Signed URL API Route

```typescript
// app/api/github/sign-asset-url/route.ts
// - Accept: owner, repo, path, ref (branch/tag)
// - Verify user has access to repo (via Convex)
// - Generate signed Vercel Blob URL or use GitHub raw URL with token
// - Return temporary URL (expires in 1 hour)
```

#### 3.2 Update Asset Resolution

```typescript
// lib/hooks/use-preview-context.ts
// - Add resolveAssetUrl that checks public vs private
// - For private: call signed URL API
// - For public: use raw.githubusercontent.com
// - Cache signed URLs for session
```

#### 3.3 Repository Access Check

```typescript
// Verify user token has repo access before generating signed URL
// Use GitHub API: GET /repos/{owner}/{repo}
```

### Dependencies

- Task 1 (uses cache for signed URLs)

### Completion Criteria

- [ ] Private repo images render in preview
- [ ] Signed URLs expire after 1 hour
- [ ] User without repo access cannot get signed URLs
- [ ] Public repos continue to work without changes

### Progress

| Step                        | Status  | Notes |
| --------------------------- | ------- | ----- |
| 3.1 Signed URL API          | PENDING |       |
| 3.2 Asset resolution update | PENDING |       |
| 3.3 Access check            | PENDING |       |
| Lint pass                   | PENDING |       |
| Typecheck pass              | PENDING |       |
| Manual test                 | PENDING |       |
| Build pass                  | PENDING |       |
| Commit                      | PENDING |       |

---

## Task 4: Expression Sandbox

### Goal

Replace unsafe `new Function()` with allowlist-based expression evaluation in the editor.

### Files to Modify/Create

- Create: `lib/repopress/safe-eval.ts` (new)
- Modify: `components/studio/repo-jsx-bridge.tsx`

### Implementation Details

#### 4.1 Safe Evaluator Module

```typescript
// lib/repopress/safe-eval.ts
// Supported patterns:
// - Literals: "string", 123, true, null, [1,2,3], {a:1}
// - Identifiers: CONSTANT_NAME
// - Member access: obj.prop.nested
// - Array spread: [...arr]
// - Ternary: condition ? a : b
// - Binary ops: a + b, a === b, a && b
// NOT supported:
// - Function calls: foo()
// - Assignment: a = 1
// - await, new, delete, etc.
```

#### 4.2 Scope Integration

```typescript
// - Inject adapter scope variables
// - Inject DOCS_SETUP_MEDIA, FIXIE_IPS, etc.
// - Fail gracefully with warning for unsupported expressions
```

#### 4.3 Editor Integration

```typescript
// components/studio/repo-jsx-bridge.tsx
// - Replace new Function() with safeEval()
// - Show warning badge for unevaluated expressions
// - Fallback to raw expression display
```

### Dependencies

- None (self-contained)

### Completion Criteria

- [ ] Safe evaluator handles all common prop patterns
- [ ] No code execution possible beyond allowlist
- [ ] Graceful fallback for unsupported expressions
- [ ] Editor preview matches compiled output

### Progress

| Step                      | Status  | Notes |
| ------------------------- | ------- | ----- |
| 4.1 Safe evaluator module | PENDING |       |
| 4.2 Scope integration     | PENDING |       |
| 4.3 Editor integration    | PENDING |       |
| Lint pass                 | PENDING |       |
| Typecheck pass            | PENDING |       |
| Manual test               | PENDING |       |
| Build pass                | PENDING |       |
| Commit                    | PENDING |       |

---

## Task 5: Compile Cache with SHA

### Goal

Memoize compiled MDX output keyed by source hash + adapter version to skip recompilation.

### Files to Modify

- Modify: `components/mdx-runtime/PreviewRuntime.tsx`
- Modify: `lib/repopress/adapter-cache.ts`

### Implementation Details

#### 5.1 Compile Cache Structure

```typescript
// Cache key: `${sourceHash}:${adapterVersion}:${pluginVersion}`
// adapterVersion: hash of loaded adapter + plugins
// Store: compiled code, imports array
// TTL: 1 hour
```

#### 5.2 Invalidation Triggers

- Source content changes (hash)
- Adapter changes (version hash)
- Plugin changes (version hash)

#### 5.3 Partial Cache Usage

```typescript
// If adapter changes but source same:
// - Re-run evaluateMdx with new scope
// - Skip compileMdx
// Significant speedup for typing in editor
```

### Dependencies

- Task 1 (extends adapter cache)

### Completion Criteria

- [ ] Compiled MDX cached by source+adapter hash
- [ ] Adapter change triggers re-evaluate but not re-compile
- [ ] Cache persists across preview tab switches
- [ ] Performance: <50ms for cached preview updates

### Progress

| Step                      | Status  | Notes |
| ------------------------- | ------- | ----- |
| 5.1 Cache structure       | PENDING |       |
| 5.2 Invalidation triggers | PENDING |       |
| 5.3 Partial cache usage   | PENDING |       |
| Lint pass                 | PENDING |       |
| Typecheck pass            | PENDING |       |
| Manual test               | PENDING |       |
| Build pass                | PENDING |       |
| Commit                    | PENDING |       |

---

## Task 6: Plugin Merge Determinism

### Goal

Make plugin context merging deterministic with defined precedence order.

### Files to Modify

- Modify: `lib/hooks/use-preview-context.ts`

### Implementation Details

#### 6.1 Define Merge Order

```typescript
// Priority (highest first):
// 1. Built-in standard components (lowest)
// 2. Plugins (in order enabled in config)
// 3. Main adapter (highest)
//
// Components: merge with adapter overriding plugins
// Scope: deep merge, adapter wins on conflict
// allowImports: union of all, adapter exports win
```

#### 6.2 Stable Plugin Ordering

```typescript
// - Sort plugins by ID before merge
// - Document merge order in config
// - Show merged result in diagnostics panel
```

### Dependencies

- Task 1 (optional - can use in-memory for now)

### Completion Criteria

- [ ] Same plugin config always produces same result
- [ ] Merge order visible in diagnostics
- [ ] Adapter always overrides plugins for same keys

### Progress

| Step                       | Status  | Notes |
| -------------------------- | ------- | ----- |
| 6.1 Define merge order     | PENDING |       |
| 6.2 Stable plugin ordering | PENDING |       |
| Lint pass                  | PENDING |       |
| Typecheck pass             | PENDING |       |
| Manual test                | PENDING |       |
| Build pass                 | PENDING |       |
| Commit                     | PENDING |       |

---

## Summary Progress

| Task                         | Status  | Commit | Notes |
| ---------------------------- | ------- | ------ | ----- |
| 1: Persistent Adapter Cache  | PARTIAL | `6cbd6ab` | Code + tests + typecheck + build complete; manual browser verification pending |
| 2: Rate Limiting & Debounce  | PENDING | -      |       |
| 3: Private Asset URL Signing | PENDING | -      |       |
| 4: Expression Sandbox        | PENDING | -      |       |
| 5: Compile Cache             | PENDING | -      |       |
| 6: Plugin Merge Determinism  | PENDING | -      |       |

---

## Notes

- Task 4 (Expression Sandbox) is highest security priority
- Task 3 (Private Assets) requires GitHub OAuth token access
- All tasks can be tested with existing repos
- Build must pass before each commit

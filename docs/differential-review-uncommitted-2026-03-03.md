# Differential Review Report (Uncommitted Changes)

## 1) Executive Summary

| Severity | Count |
|---|---:|
| 🔴 CRITICAL | 2 |
| 🟠 HIGH | 1 |
| 🟡 MEDIUM | 2 |
| 🟢 LOW | 2 |

**Overall Risk:** HIGH
**Recommendation:** REJECT (do not push current uncommitted state as-is)

**Key Metrics:**
- Files changed: 59 (18 modified, 33 deleted, 8 untracked)
- Changed lines (tracked diff): +1064 / -732 across 51 tracked files
- Typecheck status: **failing** (`npx tsc --noEmit`)
- Build status: **passing** (`npm run build`), but type validation is skipped by Next config
- Lint status: **failing** (`npm run lint` + targeted Biome check)

---

## 2) What Changed

**Branch:** `feat/mdx-runtime`
**Scope:** Studio editor/history UX, MDX runtime behavior, Convex document history model, package dependencies

| File | +Lines | -Lines | Risk | Blast Radius |
|---|---:|---:|---|---|
| `convex/schema.ts` | +5 | -2 | HIGH | HIGH (affects all document history writes) |
| `convex/documents.ts` | +21 | -16 | HIGH | HIGH (draft-save path used broadly) |
| `convex/documentHistory.ts` | +81 | -4 | HIGH | MEDIUM (history page + restore flow) |
| `components/studio/editor.tsx` | +120 | -? | HIGH | HIGH (primary editor path) |
| `app/dashboard/[owner]/[repo]/history/history-client.tsx` | +244 | -? | MEDIUM | MEDIUM |
| `skills/*` (33 entries) | -33 files |  | MEDIUM | MEDIUM (repo tooling/docs workflow) |

---

## 3) Critical Findings

### 🔴 CRITICAL: `documentHistory.editedBy` type is incompatible with actual auth user ID model

**Files:**
- `convex/schema.ts:206`
- `convex/documents.ts:231`
- `convex/documentHistory.ts:84`

**Description:**
`documentHistory.editedBy` was changed to `v.id("users")`, but writes now pass `authUser._id` from Better Auth component, which is typed as `Id<"user">`, not `Id<"users">`.

**Evidence:**
`npx tsc --noEmit` fails with:
- `Type 'Id<"user">' is not assignable to type 'Id<"users">'` in `convex/documents.ts`
- Same error in `convex/documentHistory.ts`

**Impact:**
- Push/deploy risk is high: compile-time failure in strict checks.
- Runtime risk is high: draft save / restore writes to `documentHistory` can fail due schema/table mismatch.

**Recommendation:**
Unify identity model before push (choose one consistently):
- Option A: `editedBy: v.string()` and store auth subject string
- Option B: `editedBy: v.id("user")` if using Better Auth component table IDs
- Option C: map auth user to app `users` table ID explicitly before insert

---

### 🔴 CRITICAL: Error boundary reset logic can cause repeated re-render/error loop

**File:** `components/studio/editor.tsx:56-60`

**Description:**
`componentDidUpdate` resets `hasError` on every update whenever `hasError` is true, regardless of prop changes:

```ts
if (this.state.hasError) {
  this.setState({ hasError: false })
}
```

This re-renders children immediately after a render crash; if content still crashes MDXEditor, boundary re-enters error state repeatedly.

**Impact:**
- Can cause UI thrash / repeated error boundary retries.
- Can make crash fallback unstable instead of safe.

**Recommendation:**
Only clear error state when a specific reset key changes (e.g., `filePath` or content hash), not on every update.

---

### 🟠 HIGH: 33 tracked `skills/*` files are deleted in working tree

**Files:** `skills/better-auth`, `skills/brainstorming`, ... `skills/writing-skills` (33 total)

**Description:**
All tracked `skills/*` pointer entries are currently deleted.

**Impact:**
- Likely accidental repo-wide tooling/docs regression.
- High chance of noisy/irrelevant commit if pushing all current changes.

**Recommendation:**
Do not include these deletions unless intentional and reviewed separately.

---

## 4) Test Coverage Analysis

- No targeted automated tests were added for:
  - `restoreVersion` mutation behavior
  - new history compare/restore UI flow
  - safe JSX prop evaluator behavior and edge cases

**Verification run:**
- `npm run build` ✅ (but Next reports type validation skipped)
- `npx tsc --noEmit` ❌
- `npm run lint` ❌

**Risk Assessment:**
High-risk backend/history edits without passing typecheck and without dedicated tests.

---

## 5) Blast Radius Analysis

| Change | Callers / Reach | Risk | Priority |
|---|---|---|---|
| `documents.saveDraft` contract change + schema write type | Used by studio save + publish pre-save flow | HIGH | P0 |
| `documentHistory.restoreVersion` new mutation | History page restore action | MEDIUM | P1 |
| Editor error boundary behavior | Core studio editor render path | HIGH | P0 |

---

## 6) Historical Context

Recent commits on these files are feature-focused (no clear evidence this reverted a prior security fix).
Top recent history includes: `feat: implement mirror architecture for high-fidelity editor`, `fix(schema): add missing indexes for project deletion`.

---

## 7) Recommendations

### Immediate (Blocking)
- [ ] Resolve `Id<"user">` vs `Id<"users">` mismatch for `documentHistory.editedBy`.
- [ ] Fix `EditorErrorBoundary` reset condition to avoid repeated retries on unchanged crashing content.
- [ ] Decide whether `skills/*` deletions are intentional; if not, exclude from commit.

### Before Push
- [ ] Run and pass `npx tsc --noEmit`.
- [ ] Run and pass lint for changed files (or explicitly document existing lint baseline + exceptions).
- [ ] Add at least one regression test for restore and one for editor-crash fallback behavior.

### Follow-up
- [ ] Add authorization checks to any newly exposed history queries if they will be consumed outside trusted UI flows.

---

## 8) Analysis Methodology

**Strategy:** FOCUSED (medium diff, high-risk files analyzed deeply)
**Files reviewed:** All changed tracked code files + new untracked code files (`safe-jsx-prop-eval.ts`, `history/diff-viewer.tsx`)
**Techniques:** diff inspection, callsite tracing (`rg`), typecheck, lint/build verification, blast-radius mapping

**Limitations:**
- No e2e/manual browser execution performed in this pass
- Lint baseline already noisy across repo, so strict “new-only” lint attribution is limited

**Confidence:** HIGH for identified blockers; MEDIUM for exhaustive non-blocking issues

---

## 9) Appendix: Verification Evidence

Commands run:
- `git status --short --branch`
- `git diff --stat`
- `npm run lint` (failed)
- `npm run build` (passed; type validation skipped)
- `npx tsc --noEmit` (failed with ID type mismatch)
- `npx biome check <changed files>` (failed)

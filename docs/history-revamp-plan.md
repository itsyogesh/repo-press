# History Revamp Implementation Plan

> **Plan Version:** 1.0  
> **Created:** March 2026  
> **Status:** Partially Complete (Core Delivered, Follow-ups Pending)  
> **Done:** Pagination, restore flow, diff UI, and GitHub link helpers are implemented.  
> **Left:** `editedBy` schema/user-link alignment and Phase 5 advanced features remain.  
> **Last Updated:** 2026-03-03

---

## Executive Summary

This document outlines a comprehensive plan to revamp the document history/versioning feature in RepoPress. The current implementation provides basic history tracking but lacks advanced features like visual diff comparison, version restoration, and deep GitHub integration.

---

## Current Implementation Review

> Note: This section captures the original gap analysis at planning time. Use "Sync Progress" below for current implementation state.

### What's Working ✅

| Aspect                 | Current State                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Architecture           | Separate `documentHistory` collection (follows MongoDB Document Versioning Pattern) |
| Indexing               | `by_documentId_createdAt` index for efficient queries                               |
| Snapshot Strategy      | Full body/frontmatter stored before overwrite                                       |
| Ownership Verification | Consistent auth pattern across mutations                                            |
| Deletion Cascade       | Properly deletes history when document is deleted                                   |

### Identified Gaps ❌

| Gap                                          | Severity | Impact                                                         |
| -------------------------------------------- | -------- | -------------------------------------------------------------- |
| Author is just a string (`editedBy: string`) | High     | Cannot link to author profiles, no avatar, no rich attribution |
| No version comparison/diff view              | High     | Users can't see what changed between versions                  |
| No restore/rollback capability               | High     | Cannot revert to previous versions                             |
| GitHub `commitSha` stored but unused         | Medium   | No deep link to GitHub commits                                 |
| Loads all history entries (`.collect()`)     | High     | Will fail at scale with many versions                          |
| No change metadata (change type)             | Medium   | Can't categorize minor/major changes                           |
| Basic list UI                                | Medium   | Poor user experience                                           |

---

## Best Practices Research Summary

Based on research from MongoDB Documentation, GitHub, Sanity.io, and modern CMS patterns:

1. **Separate History Collection** - Keep current data and history separate for query performance
2. **Rich Author Attribution** - Link to author/user records, not just strings
3. **Visual Diff Comparison** - Side-by-side or unified diff views (GitHub-style)
4. **Restore/Rollback** - Ability to restore any previous version as new version
5. **GitHub Commit Linking** - Deep link to actual GitHub commits
6. **Pagination** - Handle large history efficiently with cursor-based loading
7. **Change Summaries** - Auto-generated or manual change descriptions
8. **Immutable History** - Never delete history entries, only add new ones

---

## Implementation Phases

### Phase 1: Schema Enhancements

**Priority:** HIGH  
**Estimated Effort:** 2-3 hours

#### Tasks

- [ ] **1.1** Update `documentHistory` schema in `convex/schema.ts`
  - Change `editedBy` from `v.string()` to `v.id("users")`
  - Add `changeType`: `v.optional(v.union(v.literal("minor"), v.literal("major"), v.literal("patch")))`
  - Add `diffHash`: `v.optional(v.string())` for duplicate edit detection
  - Add `githubCommitUrl`: `v.optional(v.string())` for GitHub linking

- [ ] **1.2** Run Convex schema migration

  ```bash
  npx convex dev
  ```

- [ ] **1.3** Verify build passes

  ```bash
  npm run build
  ```

- [ ] **1.4** Run linting
  ```bash
  npm run lint
  ```

#### Definition of Done

- Schema updated and migrated
- Build passes without errors
- No lint warnings

---

### Phase 2: Backend API Enhancements

**Priority:** HIGH  
**Estimated Effort:** 4-5 hours

#### Tasks

- [ ] **2.1** Add pagination to `documentHistory.listByDocument`
  - Add `limit` and `cursor` args
  - Return `totalCount` for pagination UI
  - Update in `convex/documentHistory.ts`

- [ ] **2.2** Add new queries in `convex/documentHistory.ts`
  - `getByDocumentWithPagination` - paginated list
  - `getVersionCount` - total versions for a document

- [ ] **2.3** Add restore mutation
  - `restoreVersion` - creates new version from historical entry
  - Verifies ownership
  - Creates history entry for restore action

- [ ] **2.4** Update `documents.saveDraft` mutation
  - Use `ctx.auth.getUserIdentity()` for proper user ID
  - Store rich author attribution

- [ ] **2.5** Run linting

  ```bash
  npm run lint
  ```

- [ ] **2.6** Run typecheck

  ```bash
  npx tsc --noEmit
  ```

- [ ] **2.7** Run build
  ```bash
  npm run build
  ```

#### Definition of Done

- All new queries/mutations implemented
- TypeScript compiles without errors
- Build passes

---

### Phase 3: GitHub Integration

**Priority:** MEDIUM  
**Estimated Effort:** 2-3 hours

#### Tasks

- [ ] **3.1** Update `documents.saveDraft` to capture GitHub metadata
  - Store `commitMessage` from GitHub
  - Store `commitAuthor` (GitHub username)
  - Generate `githubCommitUrl`

- [ ] **3.2** Add GitHub deep link helper in `lib/github.ts`
  - `getCommitUrl(owner, repo, sha)` - generates GitHub URL

- [ ] **3.3** Run linting

  ```bash
  npm run lint
  ```

- [ ] **3.4** Run build
  ```bash
  npm run build
  ```

#### Definition of Done

- GitHub commit metadata captured on save
- Deep links generated correctly

---

### Phase 4: UI/UX Improvements

**Priority:** HIGH  
**Estimated Effort:** 6-8 hours

#### Tasks

- [ ] **4.1** Install diff viewing library

  ```bash
  npm install @monaco-editor/react
  ```

  Or:

  ```bash
  npm install react-diff-viewer-continued
  ```

- [ ] **4.2** Create diff viewer component
  - Create `components/studio/history/diff-viewer.tsx`
  - Support side-by-side and unified views
  - Support line-level highlighting

- [ ] **4.3** Enhance history list in `history-client.tsx`
  - Add pagination controls
  - Add version badges (v1, v2, etc.)
  - Show commit SHA with GitHub link
  - Add author avatar and name (from linked user)

- [ ] **4.4** Add version comparison UI
  - Create comparison view component
  - Select two versions to compare
  - Integrate diff viewer

- [ ] **4.5** Add restore flow
  - "Restore this version" button
  - Confirmation dialog
  - Success/error handling

- [ ] **4.6** Run linting

  ```bash
  npm run lint
  ```

- [ ] **4.7** Run typecheck

  ```bash
  npx tsc --noEmit
  ```

- [ ] **4.8** Run build

  ```bash
  npm run build
  ```

- [ ] **4.9** Test locally
  ```bash
  npm run dev
  ```

#### Definition of Done

- Diff viewer renders correctly
- History list shows pagination
- Restore flow works end-to-end
- Build passes

---

### Phase 5: Advanced Features

**Priority:** LOW (Future)  
**Estimated Effort:** 4-6 hours

#### Tasks

- [ ] **5.1** Auto-change detection
  - Use `diff` npm package to compute changes
  - Auto-categorize as minor/major based on % changed

- [ ] **5.2** Retention policies (optional)
  - Add configuration for max versions per document
  - Archive old versions (future consideration)

- [ ] **5.3** Branch-aware history (future)
  - Filter history by branch
  - Compare across branches

- [ ] **5.4** Run tests

  ```bash
  npm run test
  # or
  npx vitest run
  ```

- [ ] **5.5** Run linting

  ```bash
  npm run lint
  ```

- [ ] **5.6** Run build
  ```bash
  npm run build
  ```

#### Definition of Done

- All advanced features implemented (if opted in)
- Tests pass
- Build passes

---

## Tech Stack

| Feature         | Library/Technology                                      | Status     |
| --------------- | ------------------------------------------------------- | ---------- |
| Code Editor     | `@monaco-editor/react`                                  | Existing   |
| Diff Viewing    | `@monaco-editor/react` or `react-diff-viewer-continued` | To install |
| Text Diffing    | `diff` npm package                                      | To install |
| Date Formatting | `date-fns`                                              | Existing   |
| Versioning      | Custom semantic versioning                              | Custom     |

---

## Verification Commands

Run these after each phase before moving to the next:

```bash
# Linting
npm run lint

# TypeScript type checking
npx tsc --noEmit

# Build
npm run build

# Tests (if available)
npm run test
# or
npx vitest run

# Local development testing
npm run dev
```

---

## Sync Progress

| Phase                  | Status  | Started | Completed | Notes |
| ---------------------- | ------- | ------- | --------- | ----- |
| 1: Schema Enhancements | Partial | Mar 2026 | - | `changeType`, `diffHash`, `githubCommitUrl` are present; `editedBy` is still `string` and not `id("users")` |
| 2: Backend API         | Complete | Mar 2026 | Mar 2026 | Pagination query + version count + restore mutation implemented |
| 3: GitHub Integration  | Partial | Mar 2026 | - | Link helpers exist; full commit metadata capture path still incomplete |
| 4: UI/UX               | Mostly Complete | Mar 2026 | Mar 2026 | Diff UI, compare, restore present; richer author linkage depends on Phase 1 schema fix |
| 5: Advanced Features   | Pending | - | - | Auto-change detection, retention policy, branch-aware history not implemented |

---

## TODOs (Tracked per Phase)

### Phase 1: Schema Enhancements

- [ ] TODO: Update schema types in `convex/schema.ts`
- [ ] TODO: Run and verify Convex migration

### Phase 2: Backend API

- [ ] TODO: Implement pagination for history queries
- [ ] TODO: Add restore version mutation
- [ ] TODO: Link user identity properly in mutations

### Phase 3: GitHub Integration

- [ ] TODO: Capture GitHub commit metadata
- [ ] TODO: Generate GitHub deep links

### Phase 4: UI/UX

- [ ] TODO: Install diff viewer library
- [ ] TODO: Create diff viewer component
- [ ] TODO: Build version comparison UI
- [ ] TODO: Implement restore flow

### Phase 5: Advanced Features

- [ ] TODO: Add auto-change detection
- [ ] TODO: Consider retention policies

---

## Decision Points (Before Starting Implementation)

1. **Author Attribution**: Should `editedBy` reference the `users` table (app users) or `authors` table (document authors)?
   - Current recommendation: Use `users` table for accountability

2. **Restore Behavior**: Should restoring create a new version or replace current?
   - Recommendation: Create new version (immutable history principle)

3. **History Limit**: Cap history per document?
   - Recommendation: Start unlimited, add config later if needed

4. **Diff Library Preference**:
   - Monaco DiffEditor: Best for code/MDX, VS Code style
   - React Diff Viewer: Simpler, GitHub style, better for prose
   - Recommendation: Monaco (already in use, consistent experience)

---

## Dependencies to Add

```json
{
  "@monaco-editor/react": "^4.6.0",
  "diff": "^5.2.0"
}
```

---

## Related Files

- `convex/schema.ts` - Database schema (line 202-212)
- `convex/documentHistory.ts` - History queries and mutations
- `convex/documents.ts` - Document mutations (saveDraft)
- `app/dashboard/[owner]/[repo]/history/page.tsx` - History page
- `app/dashboard/[owner]/[repo]/history/history-client.tsx` - History UI
- `lib/github.ts` - GitHub API helpers

---

## References

- [MongoDB Document Versioning Pattern](https://www.mongodb.com/docs/manual/data-modeling/design-patterns/data-versioning/document-versioning/)
- [GitHub Compare Views](https://docs.github.com/en/pull-requests/committing-changes-to-your-project/viewing-and-comparing-commits/comparing-commits)
- [Sanity Document Comparison](https://sanity.io/docs/user-guides/compare-document-versions)
- [Building GitHub-Style Versioning](https://medium.com/@deepaksingh.dev.2002/building-github-style-versioning-in-your-database-9d559f7887bb)

---

_This plan follows the verification-before-completion principle: lint, typecheck, build, and test at each phase before proceeding._

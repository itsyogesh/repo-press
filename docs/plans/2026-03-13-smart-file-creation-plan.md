# Smart File Creation Dialog — Implementation Plan

**Date:** 2026-03-13  
**Branch:** feat/smart-file-creation  
**Issue:** https://github.com/itsyogesh/repo-press/issues/14

## Goal

Replace the generic filename input dialog in the Studio file tree with a framework-aware, user-friendly "Smart Creation Dialog" that:

1. Shows friendly folder labels in the `+` dropdown (derived from live tree, zero hardcoding)
2. Opens a dialog that asks for a human-readable title and shows only required frontmatter fields
3. Derives filenames/slugs silently from the title — the user never sees "slug", "filename", "index.mdx", or "draft"

## Design Decisions

- ✅ Skeleton-first: dialog opens immediately with 120ms skeleton
- ✅ No "Save as draft" toggle
- ✅ No "Is this a section landing page?" toggle — handled via `index-if-empty` naming strategy
- ✅ Approach A + C: slug-first UI + adapter-driven fields
- ✅ Filename conflict resolution is silent (auto-suffix -2, -3)
- ✅ Date fields pre-seeded with today's date

## Files to Create

- `lib/slug.ts`
- `lib/__tests__/slug.test.ts`
- `lib/framework-adapters/folder-context.ts`
- `lib/framework-adapters/__tests__/folder-context.test.ts`
- `lib/framework-adapters/derive-filename.ts`
- `lib/framework-adapters/__tests__/derive-filename.test.ts`
- `components/studio/smart-create-file-dialog.tsx`

## Files to Modify

- `lib/framework-adapters/types.ts` — add `namingStrategy?` and `fileExtension?` to `FrameworkAdapter`
- `lib/framework-adapters/adapters/fumadocs.ts` — add `namingStrategy: "index-if-empty"`, `fileExtension: ".mdx"`
- `lib/framework-adapters/adapters/hugo.ts` — add `namingStrategy: "index-if-empty"`, `fileExtension: ".md"`
- `lib/framework-adapters/adapters/jekyll.ts` — add `namingStrategy: "date-slug"`, `fileExtension: ".md"`
- `components/studio/file-tree.tsx` — smart dropdown with labels + icons
- `components/studio/studio-layout.tsx` — wire new dialog, adapter prop, folderChildren memo

## Files to Delete

- `components/studio/create-file-dialog.tsx`

## Task Breakdown

### Task 1: lib/slug.ts + tests

Pure `slugify(input: string): string` function.

- Lowercase, trim, Unicode normalize (NFD), strip diacritics
- Replace non-alphanumeric (except hyphens) with hyphen
- Collapse multiple hyphens, trim leading/trailing hyphens
- 7 unit tests

### Task 2: Extend types.ts

Add to `FrameworkAdapter`:

```ts
namingStrategy?: "slug" | "index-if-empty" | "date-slug"
fileExtension?: ".mdx" | ".md"
```

### Task 3: Update 3 adapters

- fumadocs: `namingStrategy: "index-if-empty"`, `fileExtension: ".mdx"`
- hugo: `namingStrategy: "index-if-empty"`, `fileExtension: ".md"`
- jekyll: `namingStrategy: "date-slug"`, `fileExtension: ".md"`

### Task 4: folder-context.ts + tests

`getFolderContext(folderPath: string, adapter: FrameworkAdapter): FolderContext`
Keyword heuristics on last path segment. Returns `contentLabel`, `primaryFieldLabel`, `requiredFields`, `namingStrategy`, `fileExtension`.

### Task 5: derive-filename.ts + tests

`deriveFilename({ title, strategy, extension, existingNames, date? }): string`
Handles all 3 strategies with conflict resolution.

### Task 6: smart-create-file-dialog.tsx

Props: `{ open, onOpenChange, parentPath, contentRoot, adapter, folderChildren, onConfirm }`
120ms skeleton → form with title + required fields.

### Task 7: file-tree.tsx

Smart dropdown labels + icons based on `getFolderContext`.

### Task 8: studio-layout.tsx

Wire SmartCreateFileDialog, pass adapter, add folderChildren memo.

### Task 9: Delete create-file-dialog.tsx

### Task 10: Test run + smoke test

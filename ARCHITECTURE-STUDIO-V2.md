# Studio V2 Architecture — End-to-End Redesign

## Problem Statement

The studio has several interconnected issues that share a root cause: the system assumes one framework per repo and uses schema-first rendering. In reality:

1. **One repo, many content types** — A repo can have `content/blog/` (Contentlayer), `docs/` (Fumadocs), and `content/marketing/` (custom) in the same repo. Each folder has different frontmatter schemas.

2. **Schema-file mismatch** — The editor shows framework schema fields as primary (often empty), while the file's actual fields are buried under "Additional fields from file". The file's real data should be primary.

3. **Framework detection is repo-level** — Detection reads root `package.json` + root config files. It can't distinguish between blog (Contentlayer) and docs (Fumadocs) in the same repo.

4. **No field-name resolution in editor** — Preview resolves `heading` → title via semantic fallbacks. Editor binds by exact name only, so schema field "title" is empty while file field "heading" has the value.

5. **File tree shows filenames, not titles** — Sidebar shows `complete-guide-to-top-level-domains.mdx` instead of the parsed document title "A Complete Guide to Top-Level Domain".

6. **Broken preview images** — Image paths in frontmatter are repo-relative (e.g. `/images/cover.jpg`). Preview renders them against the Next.js server, not GitHub.

7. **No project switching** — Users can create multiple projects from the same repo, but there's no way to switch between them in the studio.

---

## Design Decisions (confirmed)

| Decision | Choice | Rationale |
|---|---|---|
| Project model | One root folder per project, multiple projects per repo | Keeps each project focused. User creates separate projects for blog, docs, marketing. |
| Project switching | Studio header dropdown | Shows all projects from same repo. Switching reloads tree + schema. |
| File tree titles | Eager, stored in Convex | On first studio open, background action scans all files and creates document records. Future loads use stored titles. |
| Framework detection | Auto-detect with user override | Auto-detect per project's folder context. If ambiguous, user picks from dropdown. |
| Field rendering | File-first merged field list | Show fields that exist in the file as primary. Match to schema for type/label hints. Empty schema fields in collapsed section. |
| Image preview | GitHub raw URLs | Construct `raw.githubusercontent.com` URLs for repo-relative paths. |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Studio Page (Server)                       │
│  • Resolves project via URL params                           │
│  • Fetches file tree + initial file content                  │
│  • Passes project config to client                           │
└─────────────┬───────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│                  StudioLayout (Client)                        │
│                                                              │
│  ┌─────────────┐  ┌────────────────┐  ┌──────────────────┐ │
│  │  Project     │  │   File Tree    │  │  Editor Panel    │ │
│  │  Switcher    │  │  (with titles) │  │  (merged fields) │ │
│  │  (header)    │  │                │  │                  │ │
│  └──────┬──────┘  └───────┬────────┘  └────────┬─────────┘ │
│         │                 │                     │            │
│         │    ┌────────────┼─────────────────────┤            │
│         │    │            │                     │            │
│         ▼    ▼            ▼                     ▼            │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              Framework Adapter System                    ││
│  │  • Per-project framework config (fieldVariants, schema) ││
│  │  • buildMergedFieldList() for editor                    ││
│  │  • resolveFieldValue() for preview                      ││
│  │  • buildGitHubRawUrl() for images                       ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌────────────────────┐  ┌───────────────────────────────┐  │
│  │   Preview Panel    │  │  Convex (document records)    │  │
│  │  (semantic resolve │  │  • Titles for tree sidebar    │  │
│  │   + GitHub images) │  │  • Draft/publish state        │  │
│  └────────────────────┘  │  • Frontmatter cache          │  │
│                          └───────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Component: Merged Field List (Editor)

### Problem
Current approach: Schema fields first (empty) → Extra fields second (has data).
Correct approach: File fields first (has data, enhanced with schema info) → Empty schema fields collapsed.

### Algorithm: `buildMergedFieldList(frontmatter, schema, fieldVariants)`

```
Input:
  frontmatter = { heading: "...", excerpt: "...", keywords: [...], date: "..." }
  schema = [
    { name: "title", semanticRole: "title", type: "string", ... },
    { name: "description", semanticRole: "description", type: "string", ... },
    { name: "draft", semanticRole: "draft", type: "boolean", ... },
    { name: "icon", type: "string", ... },  // Fumadocs-specific
  ]
  fieldVariants = { date: "date", ... }

Phase 1: Match schema fields to frontmatter keys
  For each schema field:
    1. Exact name match? → "title" in frontmatter? No.
    2. Semantic role match? → findActualFieldName("title", frontmatter) → "heading" (via fallback)
    3. If matched → MergedFieldDef { actualFieldName: "heading", type: "string", description: "Page or post title", isInFile: true }
    Mark "heading" as consumed.

Phase 2: Add unmatched frontmatter keys
  For each frontmatter key not consumed in Phase 1:
    Infer type from value → MergedFieldDef { actualFieldName: key, type: inferred, isInFile: true }

Phase 3: Add unmatched schema fields (collapsed section)
  For each schema field not matched in Phase 1:
    MergedFieldDef { actualFieldName: schemaField.name, isInFile: false }

Output: [...Phase1+2 results (isInFile=true), ...Phase3 results (isInFile=false)]
```

### Editor UI for merged fields

```
┌─ Frontmatter ──────────────────────────────────────────┐
│                                                         │
│  heading                            [A Complete Guide...│]
│  ↳ Page or post title                                   │
│                                                         │
│  excerpt                                                │
│  ↳ SEO meta description              [Confused about...│]
│                                                         │
│  keywords                           [TLD, Domain, ...  │]
│                                                         │
│  date                               [2024-01-27       📅]
│                                                         │
│  coverImage                         [/images/tld-...   │]
│  ↳ Cover image                                          │
│                                                         │
│  ▸ Show 2 available schema fields                       │
│    (draft, icon — not in this file)                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Labels**: Show `actualFieldName` as the primary label (bold). If matched to a schema field with different name, show schema description as helper text below (small, muted).

**Write-back**: All onChange handlers use `field.actualFieldName` as the key. Editing "heading" writes to `frontmatter.heading`.

---

## Component: Preview Image Resolution

### Problem
Frontmatter image paths like `/images/cover.jpg` or `assets/hero.png` don't exist on the Next.js server.

### Solution
Construct GitHub raw URLs:
```
/images/cover.jpg → https://raw.githubusercontent.com/{owner}/{repo}/{branch}/images/cover.jpg
assets/hero.png   → https://raw.githubusercontent.com/{owner}/{repo}/{branch}/assets/hero.png
https://cdn.com/x → https://cdn.com/x  (absolute URLs pass through)
```

Preview component receives `owner`, `repo`, `branch` from StudioLayout (which already has them as props).

Add `onError` handler to gracefully hide broken images instead of showing broken image icon.

---

## Component: File Tree with Document Titles

### Problem
Sidebar shows `complete-guide-to-top-level-domains.mdx` instead of "A Complete Guide to Top-Level Domain".

### Strategy: Store in Convex on first open

**When studio loads for the first time for a project:**
1. Server component fetches file tree (existing: `getContentTree()`)
2. Client triggers a Convex action: `documents.syncTreeTitles({ projectId, files: [{ path, sha }] })`
3. The action:
   - Checks which files already have document records (via `by_projectId_filePath` index)
   - For files without records: fetches content from GitHub, parses frontmatter, creates document records via `getOrCreate`
   - Returns map of `{ filePath → title }`
4. File tree component queries `documents.listByProject({ projectId })` for titles
5. Renders: `document.title || filename` for each node

**Subsequent loads:**
- Document records already exist in Convex
- File tree immediately shows titles from Convex query
- If a file is new (not in Convex), shows filename until synced

**Implementation in Convex:**
```
convex/documents.ts — Add:
  syncTreeTitles: action({
    args: { projectId, files: [{ path, sha }] },
    handler: fetches missing files from GitHub, calls getOrCreate for each
  })

  listTitlesForProject: query({
    args: { projectId },
    returns: [{ filePath, title }]
  })
```

**File tree component change:**
```
components/studio/file-tree.tsx:
  Accept titleMap: Record<string, string> prop
  Render: titleMap[node.path] || node.name
```

---

## Component: Project Switcher (Header Dropdown)

### Problem
Users create multiple projects from the same repo (blog, docs, marketing) but can't switch between them in the studio.

### Design

```
┌──────────────────────────────────────────────────────────────────┐
│  droidsize/collective.domains  ▾   Studio   content/blog         │
│  ┌─────────────────────────────┐                                 │
│  │ ● content/blog (Contentlayer)│  ← current                     │
│  │   docs/ (Fumadocs)           │                                │
│  │   content/marketing (Custom) │                                │
│  │ ─────────────────────────── │                                │
│  │   + New project...           │                                │
│  └─────────────────────────────┘                                │
└──────────────────────────────────────────────────────────────────┘
```

**Data source:** Query `projects.getByRepo({ userId, repoOwner, repoName })` — returns all projects for this repo.

**Switching:** Navigate to `/dashboard/{owner}/{repo}/studio?projectId={selectedId}`. This reloads the studio page server-side with the new project's `contentRoot`, `detectedFramework`, etc.

**New project:** Link to `/dashboard/{owner}/{repo}/setup` to create another project with a different content root.

### Implementation

New component: `components/studio/project-switcher.tsx`
- Takes `currentProjectId`, `owner`, `repo` as props
- Uses `useQuery(api.projects.getByRepo, { userId, repoOwner, repoName })` to fetch siblings
- Renders Select/dropdown with project names + content roots
- On change: `router.push(...)` to switch

StudioLayout: render `<ProjectSwitcher>` in the header area (currently in the studio page, may need to pass it through).

---

## Component: Per-Folder Framework Detection

### Problem
Detection reads repo-root `package.json` and root config files. Can't distinguish blog (Contentlayer config at root) from docs (Fumadocs config at root) in same repo.

### Enhancement
Add folder-context signals to detection:

1. **Folder-specific config files**: Check if `contentRoot` folder contains framework markers:
   - `meta.json` in folder → likely Fumadocs
   - `_meta.json` in folder → likely Nextra
   - `_category_.json` in folder → likely Docusaurus
   - `_config.yml` in folder → likely Jekyll

2. **Content root path heuristics**:
   - Path contains `docs` → bump docs frameworks (Fumadocs, Docusaurus, Nextra)
   - Path contains `blog` or `posts` → bump blog frameworks (Contentlayer, Astro, Hugo)

3. **Per-adapter `detectInFolder(ctx, contentRoot)`**: Optional method on FrameworkAdapter that checks folder-level signals. Score adds to repo-level score.

### Implementation
Extend `DetectionContext` with:
```ts
type DetectionContext = {
  // ... existing fields
  contentRoot: string
  contentRootFileNames: string[]  // files in the content root folder
}
```

Extend `FrameworkAdapter` with optional:
```ts
type FrameworkAdapter = {
  // ... existing fields
  detectInFolder?: (ctx: DetectionContext) => DetectionResult | Promise<DetectionResult>
}
```

`buildDetectionContext` fetches root files + contentRoot files.
`detectFramework` runs both `detect()` and `detectInFolder()`, sums scores.

---

## Implementation Order

### Phase A: Core field rendering fix (resolve.ts + editor.tsx)
1. Add `findActualFieldName`, `MergedFieldDef`, `buildMergedFieldList`, `buildGitHubRawUrl` to resolve.ts
2. Export from index.ts
3. Refactor editor.tsx to use merged field list
4. Fix preview.tsx image URLs
5. Pass `fieldVariants` + `owner/repo/branch` through studio-layout.tsx

### Phase B: File tree titles
1. Add `syncTreeTitles` action and `listTitlesForProject` query to convex/documents.ts
2. Modify file-tree.tsx to accept and display title map
3. Wire up in studio-layout.tsx: trigger sync on mount, pass titles to tree

### Phase C: Project switcher
1. Create components/studio/project-switcher.tsx
2. Add to studio page header
3. Wire navigation on project change

### Phase D: Per-folder detection
1. Extend DetectionContext with contentRoot info
2. Add detectInFolder to adapters that benefit (Fumadocs, Nextra, Docusaurus)
3. Update buildDetectionContext + detectFramework in registry.ts

---

## Files Summary

### New files
| File | Phase | Purpose |
|---|---|---|
| `components/studio/project-switcher.tsx` | C | Header dropdown for switching projects |

### Modified files
| File | Phase | Change |
|---|---|---|
| `lib/framework-adapters/resolve.ts` | A | Add `findActualFieldName`, `MergedFieldDef`, `buildMergedFieldList`, `buildGitHubRawUrl` |
| `lib/framework-adapters/index.ts` | A | Export new symbols |
| `lib/framework-adapters/types.ts` | D | Extend `DetectionContext`, `FrameworkAdapter` |
| `lib/framework-adapters/registry.ts` | D | Extend detection with folder context |
| `components/studio/editor.tsx` | A | Merged field list, `fieldVariants` prop |
| `components/studio/preview.tsx` | A | GitHub raw image URLs, `owner/repo/branch` props |
| `components/studio/studio-layout.tsx` | A,B | Pass extra props, trigger title sync |
| `components/studio/file-tree.tsx` | B | Accept + render title map |
| `convex/documents.ts` | B | Add `syncTreeTitles` action, `listTitlesForProject` query |
| `app/dashboard/[owner]/[repo]/studio/[[...path]]/page.tsx` | C | Project switcher in header |

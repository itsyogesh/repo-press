# RepoPress v1 Implementation Plan

## Current State

The app has **working infrastructure** (auth, GitHub API, Convex schema, basic Studio UI) but the **Studio doesn't use Convex at all**. Everything saves directly to GitHub with no draft state, no document tracking, no taxonomy. The Convex backend has CRUD for all 11 tables but the frontend never calls it.

**The fundamental gap**: the Studio treats files as plain GitHub files, not as tracked CMS documents.

---

## Phase 0: Cleanup & Build Verification

### 0.1 Remove 19 unused dependencies
Remove from `package.json`:
- `@auth0/auth0-react`, `@clerk/clerk-react`, `@lynx-js/react`
- `@prisma/client`, `prisma`, `better-sqlite3`
- `@standard-schema/spec`
- `@tanstack/react-start`, `@tanstack/solid-start`, `solid-js`
- `drizzle-kit`, `drizzle-orm`
- `hono`, `mongodb`, `mysql2`, `pg`
- `tailwindcss-animate`, `convex-helpers`
- `vitest` (no test files exist)

### 0.2 Remove legacy editor components
Delete `components/editor/` directory (superseded by `components/studio/`).

### 0.3 Remove duplicate hook files
`hooks/use-mobile.ts` and `hooks/use-toast.ts` duplicate `components/ui/use-mobile.tsx` and `components/ui/use-toast.ts`. Keep one location, update imports.

### 0.4 Verify build
Run `next build` (will need stub env vars for Convex). Fix any TypeScript or build errors.

---

## Phase 1: Connect Studio to Convex (Foundation)

This is the **most critical phase** — without it, nothing else works.

### 1.1 Wire up project creation in Setup page
- `app/dashboard/[owner]/[repo]/setup/page.tsx` currently just navigates away
- Call `projects.create` mutation when user completes setup
- Run framework detection (`lib/framework-detector.ts`) during setup
- Store `detectedFramework`, `contentType`, `frontmatterSchema` in the project record
- After creation, scan the content root for existing MD/MDX files
- Create initial `documents` records for each file found (status: `published`, with `githubSha`)

### 1.2 Add project-aware dashboard
- `app/dashboard/page.tsx` currently shows raw GitHub repos
- Add a "My Projects" section that lists Convex `projects` records
- Clicking a project goes to the Studio (not the raw repo browser)
- Keep "Add Project" flow for repos without a project

### 1.3 Rewrite Studio to be document-aware
- When opening a file in Studio, load/create a `documents` record in Convex
- Studio state should sync with Convex (use `useQuery` for document, `useMutation` for saves)
- Replace direct GitHub save with:
  - **"Save Draft"** button → calls `documents.saveDraft()` (Convex only, no GitHub commit)
  - **"Publish"** button → calls GitHub save, then `documents.publish()` with the commit SHA
- Show document status badge in Studio header
- Load `frontmatterSchema` from the project record for dynamic form fields

### 1.4 Dynamic frontmatter form
- Replace hardcoded fields (title, date, description, tags, coverImage) in `editor.tsx`
- Read `project.frontmatterSchema` + framework-specific fields from `lib/framework-detector.ts`
- Render form fields dynamically based on schema
- Support field types: text, textarea, date, boolean, select, multi-select

---

## Phase 2: Full Draft/Publish Workflow

### 2.1 Status state machine
Add a `transitionStatus` mutation to `documents.ts` with these allowed transitions:
```
draft → in_review
in_review → approved | draft (reject back to draft)
approved → published | draft
published → draft (unpublish)
draft → scheduled
scheduled → published (automatic)
any → archived
```

### 2.2 Review workflow UI
- Add "Submit for Review" button (draft → in_review)
- Add "Approve" / "Request Changes" buttons for reviewers
- Show `reviewerId` and `reviewNote` in a review panel
- Add a "Documents Awaiting Review" query and dashboard section

### 2.3 Scheduled publishing
- Add a `scheduledAt` date picker in the publish dialog
- Add a Convex cron job (`convex/crons.ts`) that runs every minute
- The cron checks for `status === "scheduled" AND scheduledAt <= now()` and publishes them
- Trigger GitHub commit on scheduled publish (needs stored token — use the `accounts` table)

### 2.4 Status-filtered document list
- Add a document list sidebar/panel in Studio showing all project documents
- Filter by status (draft, in_review, approved, published, scheduled, archived)
- Search documents by title (uses existing `search` query)

---

## Phase 3: Collections UI

### 3.1 Collection management page
- New page: `app/dashboard/[owner]/[repo]/collections/page.tsx`
- List existing collections for the project
- Create/edit collection form: name, slug, description, folderPath, icon
- Field schema builder: define custom frontmatter fields per collection

### 3.2 Collection-aware Studio
- When opening a file, detect which collection it belongs to (by `folderPath` match)
- Load collection's `fieldSchema` and merge with project's `frontmatterSchema`
- Show collection name in Studio header
- Filter document list by collection

### 3.3 New document creation
- "New Document" button in Studio file tree
- Select target collection (determines folder and frontmatter template)
- Generate filename from title (slugified)
- Create `documents` record + empty file in GitHub

---

## Phase 4: Taxonomy Management

### 4.1 Authors management
- New page: `app/dashboard/[owner]/[repo]/authors/page.tsx`
- CRUD table for authors (name, slug, email, avatar, bio, GitHub username, Twitter)
- Author avatar upload (or GitHub avatar auto-fetch)

### 4.2 Tags management
- New page: `app/dashboard/[owner]/[repo]/tags/page.tsx`
- CRUD table for tags (name, slug, color)
- Add missing `tags.update` mutation
- Color picker for tag colors

### 4.3 Categories management
- New page: `app/dashboard/[owner]/[repo]/categories/page.tsx`
- Hierarchical tree view (nested via `parentId`)
- Add missing `categories.update` mutation
- Drag-to-reorder or parent reassignment

### 4.4 Taxonomy pickers in editor
- Replace hardcoded `tags` text input with a multi-select picker from Convex `tags` table
- Add author picker (multi-select from `authors` table)
- Add category picker (hierarchical select from `categories` table)
- Store selected IDs in document record (`authorIds`, `tagIds`, `categoryIds`)

---

## Phase 5: Document History & Revert

### 5.1 History panel in Studio
- Collapsible side panel showing document version history
- Each entry shows: timestamp, editor name, commit message
- Entries are already created by `saveDraft` and `publish` mutations

### 5.2 Diff view
- Click a history entry to see a diff against the current version
- Use a simple line-by-line diff (or integrate a lightweight diff library)
- Show frontmatter changes alongside body changes

### 5.3 Revert mutation
- Add `revertToVersion` mutation in `documents.ts`
- Copies `body` and `frontmatter` from the selected `documentHistory` entry back to the document
- Creates a new history entry recording the revert (so reverts are themselves tracked)
- "Revert to this version" button in the diff view

---

## Phase 6: Media Asset Library

### 6.1 Media browser panel
- New panel/dialog accessible from Studio
- Lists all `mediaAssets` for the project (thumbnails for images)
- Filter by MIME type, search by filename

### 6.2 Upload flow
- Upload image → commit to GitHub (e.g., `assets/` or configurable media folder)
- Create `mediaAssets` record with metadata (dimensions, size, SHA)
- Return markdown image syntax for insertion into editor

### 6.3 Editor integration
- "Insert Image" button in the editor toolbar
- Opens media browser to select existing or upload new
- Inserts `![alt](path)` at cursor position
- Track `usedInDocumentIds` when media is referenced

### 6.4 Missing mutations
- Add `mediaAssets.update` mutation (edit alt text, metadata)
- Add `mediaAssets.getByPath` query

---

## Phase 7: Webhooks

### 7.1 Webhook management UI
- New page: `app/dashboard/[owner]/[repo]/webhooks/page.tsx`
- CRUD table: name, URL, secret, events (checkboxes), active toggle
- Test webhook button (sends a test payload)

### 7.2 Webhook triggering logic
- Add `triggerWebhooks` action in `convex/webhooks.ts`
- On document status change, query matching webhooks by event type
- HTTP POST with JSON payload (document data, event type, timestamp)
- HMAC-SHA256 signature using webhook secret in `X-RepoPress-Signature` header

### 7.3 Integration with document lifecycle
- Call `triggerWebhooks` from `documents.publish()`, `documents.update()`, `documents.remove()`
- Events: `document.published`, `document.updated`, `document.deleted`, `document.status_changed`

---

## Phase 8: Folder Meta & Sidebar Ordering

### 8.1 Wire folderMeta into file tree
- Load `folderMeta` records for the project
- Apply `pageOrder` to sort files in the sidebar
- Show custom `title` and `icon` for folders
- Respect `defaultOpen` for folder collapse state

### 8.2 Sidebar ordering UI
- Drag-to-reorder files within a folder
- Save order to `folderMeta.upsert()` mutation
- Generate/update `meta.json` / `_meta.json` files in GitHub (for Fumadocs/Nextra compatibility)

---

## Phase Order & Dependencies

```
Phase 0 (Cleanup)           ← No dependencies, do first
    ↓
Phase 1 (Convex in Studio)  ← Foundation for everything else
    ↓
Phase 2 (Workflow)          ← Depends on Phase 1 (document records exist)
    ↓
Phase 3 (Collections)       ← Depends on Phase 1 (project context in Studio)
    ↓
Phase 4 (Taxonomy)          ← Depends on Phase 1 (document records store IDs)
    ↓
Phase 5 (History)           ← Depends on Phase 1 (saveDraft creates history entries)
    ↓
Phase 6 (Media)             ← Independent after Phase 1
Phase 7 (Webhooks)          ← Depends on Phase 2 (triggered by status changes)
Phase 8 (Folder Meta)       ← Independent after Phase 1
```

Phases 3-6 and 8 can be parallelized after Phase 2 is complete.

---

## Backend Gaps to Fix Along the Way

These should be addressed in the phase where they're needed:

| Gap | Fix In |
|-----|--------|
| `tags.update` mutation missing | Phase 4 |
| `categories.update` mutation missing | Phase 4 |
| `mediaAssets.update` mutation missing | Phase 6 |
| `triggerWebhooks` action missing | Phase 7 |
| Cascade deletes (project → documents, etc.) | Phase 1 |
| `documents.revertToVersion` mutation | Phase 5 |
| `documents.transitionStatus` mutation | Phase 2 |
| Scheduled publish cron job | Phase 2 |
| `mediaAssets.getByPath` query | Phase 6 |
| Review-filtered queries | Phase 2 |

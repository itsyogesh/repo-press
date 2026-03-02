# RepoPress - History Implementation Summary & Next Phase Context

## Part 1: History Implementation Summary (Completed)

### What Was Implemented

We just completed the **History Revamp** with the following changes:

#### 1. Schema Enhancements (`convex/schema.ts`)

```typescript
documentHistory: defineTable({
  documentId: v.id("documents"),
  body: v.string(),
  frontmatter: v.optional(v.any()),
  editedBy: v.id("users"), // Changed from string → user ID
  commitSha: v.optional(v.string()),
  message: v.optional(v.string()),
  changeType: v.optional(
    v.union(v.literal("minor"), v.literal("major"), v.literal("patch")),
  ), // NEW
  diffHash: v.optional(v.string()), // NEW
  githubCommitUrl: v.optional(v.string()), // NEW
  createdAt: v.number(),
});
```

#### 2. Backend Functions (`convex/documentHistory.ts`)

- `listByDocumentPaginated` - Cursor-based pagination
- `getVersionCount` - Total version count
- `restoreVersion` - Restore any previous version
- `saveDraft` - Now uses `authComponent.safeGetAuthUser(ctx)` for proper auth

#### 3. GitHub Integration (`lib/github.ts`)

- `getCommitUrl(owner, repo, sha)` - Generate GitHub commit URL
- `getFileAtCommitUrl(owner, repo, path, sha)` - Generate file at commit URL

#### 4. UI Enhancements (`history-client.tsx`)

- Version list with badges
- Compare mode with Monaco DiffViewer
- Restore functionality
- GitHub commit links
- Change type indicators

#### 5. Dependencies Added

- `@monaco-editor/react`
- `diff`

### Files Changed

- Modified: `convex/schema.ts`, `convex/documentHistory.ts`, `convex/documents.ts`, `lib/github.ts`, `components/studio/hooks/use-studio-save.ts`, `components/studio/hooks/use-studio-publish.ts`, `app/dashboard/[owner]/[repo]/history/history-client.tsx`, `package.json`
- New: `components/studio/history/diff-viewer.tsx`

### Test Results: ✅ 40/40 Passed

---

## Part 2: Current Architecture Overview

### How the System Works (One-Way Communication)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        REPOSITORY (GitHub)                           │
│   repopress.config.json                                              │
│   ├── framework: "fumadocs" | "nextra" | "astro" | etc.           │
│   ├── contentRoot: "content/docs"                                   │
│   ├── components: {                                                  │
│   │   ├── DocsImage: { props: [...], hasChildren: false },         │
│   │   ├── DocsVideo: { props: [...], hasChildren: false },          │
│   │   └── Callout: { props: [...], hasChildren: true }             │
│   │ }                                                               │
│   └── plugins: { ... }                                              │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FRAMEWORK DETECTION                               │
│   lib/framework-detector.ts                                          │
│   - Reads package.json                                               │
│   - Checks root config files                                          │
│   - Returns: { framework, contentType, frontmatterSchema }          │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       ADAPTER LAYER                                  │
│   lib/repopress/adapter.ts                                           │
│   - Generates MDX runtime from config                                │
│   - Maps components from repopress.config.json                       │
│   - Returns compiled component registry                               │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      RUNTIME LAYER                                   │
│   components/mdx-runtime/adapter.tsx                                 │
│   - Merges: standardComponents + adapter.components                  │
│   - Provides to MDX: { Callout, DocsImage, DocsVideo, ... }        │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         PREVIEW                                       │
│   - Renders MDX with components                                      │
│   - DocsImage: Shows images with caption                             │
│   - DocsVideo: Embeds YouTube/video                                  │
│   - Callout: Styled info boxes                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Current Component System

**Component Schema** (`lib/config-schema.ts`):

```typescript
const componentPropSchema = z.object({
  name: z.string(), // prop name (e.g., "src", "caption")
  type: z.enum(["string", "number", "boolean", "expression", "image"]),
  label: z.string().optional(),
  default: z.any().optional(),
});

const componentSchema = z.object({
  props: z.array(componentPropSchema).optional(),
  hasChildren: z.boolean().optional().default(true),
  kind: z.enum(["flow", "text"]).optional().default("flow"),
});
```

**Example Config** (`repopress.config.json`):

```json
{
  "components": {
    "DocsImage": {
      "props": [
        { "name": "src", "type": "image", "label": "Image URL" },
        { "name": "alt", "type": "string", "label": "Alt Text" },
        { "name": "caption", "type": "string", "label": "Caption" }
      ],
      "hasChildren": false,
      "kind": "flow"
    },
    "DocsVideo": {
      "props": [
        { "name": "src", "type": "string", "label": "Video URL" },
        { "name": "title", "type": "string", "label": "Title" }
      ],
      "hasChildren": false,
      "kind": "flow"
    },
    "Callout": {
      "props": [{ "name": "type", "type": "string", "default": "info" }],
      "hasChildren": true,
      "kind": "flow"
    }
  }
}
```

**Standard Components** (`lib/repopress/standard-library.tsx`):

- `Callout` - Info/warning boxes
- `DocsImage` - Images with caption, supports asset resolution
- `DocsVideo` - YouTube/video embeds with fallback
- `Steps` / `Step` - Step-by-step guides
- `Tabs` / `Tab` - Tabbed content
- `Card`, `Badge`, `Button`, `Image`, `Video`, `FileTree`, `CopyIpsButton`

---

## Part 3: Conversation Starter for Next Phase

### Two-Way Communication: Editor Component Insertion

> **Context for the brainstorming agent:**
>
> We're building a Git-native headless CMS called **RepoPress**. We've implemented:
>
> 1. ✅ One-way communication: Config → Detection → Adapter → Preview
> 2. ✅ Framework detection (fumadocs, nextra, astro, hugo, docusaurus, etc.)
> 3. ✅ Config-based component registry from `repopress.config.json`
> 4. ✅ Rich preview with Monaco editor
> 5. ✅ History/versioning system (just completed)
>
> **What we want to build next:**
> **Two-way communication in the MDX editor** - allowing users to INSERT components with customizable properties directly from the editor UI.
>
> **Problem Statement:**
> Currently, users must manually type MDX like `<DocsImage src="./image.png" caption="My image" />`. We want to provide a better UX where:
>
> 1. User clicks "Add Component" in the editor toolbar
> 2. A modal/picker shows all compatible components (from config)
> 3. User selects a component (e.g., DocsImage)
> 4. Form appears to fill in properties (src, caption, etc.)
> 5. User fills form → component is inserted into MDX
>
> **Key Requirements:**
>
> - Must work with ANY component defined in `repopress.config.json`
> - Support different prop types: string, number, boolean, expression, image
> - Support components with children (e.g., `<Callout>content</Callout>`)
> - Should integrate with Monaco editor for insertion
> - Must work alongside existing framework adapters
>
> **Examples to support:**
>
> ```mdx
> <!-- DocsImage with all props -->
>
> <DocsImage
>   src="./diagram.png"
>   alt="System architecture"
>   caption="Figure 1: Overview"
> />
>
> <!-- DocsVideo -->
>
> <DocsVideo src="https://youtu.be/xyz" title="Tutorial" />
>
> <!-- Callout with children -->
>
> <Callout type="warning">This is important!</Callout>
> ```
>
> **Questions to explore:**
>
> 1. How to structure the component picker UI?
> 2. How to generate the form based on component schema?
> 3. How to insert into Monaco editor at cursor position?
> 4. How to handle asset uploads (images/videos) vs URLs?
> 5. How to persist custom component definitions?
> 6. Should we support "collective domain" components (like vercel.com/customers)?

---

## Part 4: Minimax M2.5 Free Findings (March 2026)

### Deep Analysis Results

After thoroughly analyzing the entire codebase, here are the key findings:

### What Already Exists (Partial Two-Way Already Built)

**1. InsertRepoComponent Dropdown** (`components/studio/insert-repo-component.tsx`)

- Already shows all available components from adapter + schema
- Already integrates with MDXEditor via `insertJsx$` publisher
- **BUT:** Inserts component with EMPTY props only — no property editor

**2. JSX Component Descriptors** (`components/studio/jsx-component-descriptors.tsx`)

- Already maps config components to MDXEditor format
- Built-in descriptors for: DocsImage, DocsVideo, Callout, Card, Tabs, Badge, Button, etc.
- Dynamic descriptors loaded from adapter + schema
- **BUT:** Props are hardcoded in descriptors, not synced from config

**3. RepoJsxBridge** (`components/studio/repo-jsx-bridge.tsx`)

- Renders live components inside editor's WYSIWYG mode
- Evaluates prop expressions from MDX AST
- Shows "Live" badge on hover
- **BUT:** No property editing, just rendering

**4. Preview Runtime** (`components/mdx-runtime/PreviewRuntime.tsx`)

- Debounced updates (300ms) — works well
- Missing component placeholders render gracefully
- Asset URL resolution built-in

### Current Architecture (Verified Working)

```
User clicks "JSX" button
        │
        ▼
Dropdown shows component list (from adapter.components + schema)
        │
        ▼
User clicks component (e.g., DocsImage)
        │
        ▼
insertJsx$ fires → inserts <DocsImage /> with NO props
        │
        ▼
Preview re-renders (300ms debounce)
        │
        ▼
DocsImage renders (with empty/placeholder state)
```

### What's Missing for True Two-Way

| Missing Feature        | Current State      | Needed                                  |
| ---------------------- | ------------------ | --------------------------------------- |
| Property Editor Dialog | None exists        | Modal/popover after component selection |
| Schema-driven Form     | No form generation | Map componentSchema → React Hook Form   |
| Image Upload in Form   | No integration     | Add upload + autocomplete to form       |
| Expression Prop Editor | Raw input only     | Safe code editor for `{expression}`     |
| Live Preview in Form   | None               | Mini preview while editing props        |

### Technical Implementation Details

**Adapter Loading Pipeline:**

1. `fetchAdapterSourceAction` → fetches `mdx-preview.tsx` from repo
2. `transpileAdapter` (esbuild-wasm) → converts to browser JS
3. `evaluateAdapter` → runs in sandbox with React shims
4. Returns: `{ components, scope, allowImports }`

**Config System** (`lib/config-schema.ts`):

```typescript
// Supported prop types
type: "string" | "number" | "boolean" | "expression" | "image";
```

**Framework Detection:**

- 9 frameworks supported: fumadocs, nextra, astro, hugo, docusaurus, jekyll, contentlayer, next-mdx, custom
- Scoring system: deps (40pts), config files (30pts), folder markers (25pts)

### Files to Modify for Two-Way

1. **components/studio/insert-repo-component.tsx** — Add dialog after selection
2. **components/studio/jsx-component-descriptors.tsx** — Dynamic props from schema
3. **components/studio/repo-jsx-bridge.tsx** — Property editing mode
4. **NEW: components/studio/component-property-editor.tsx** — Form dialog
5. **NEW: components/studio/property-form-fields.tsx** — Schema-driven fields

### Recommended Implementation Order

1. Extend InsertRepoComponent to open dialog after component selection
2. Create ComponentPropertyForm that reads schema and renders fields
3. Wire form → generate MDX → insert via insertJsx$
4. Add image upload/autocomplete to form
5. Add live preview to property editor
6. Support expression type props

---

## Key Files for Reference

| File                                              | Purpose                           |
| ------------------------------------------------- | --------------------------------- |
| `lib/config-schema.ts`                            | Component prop/schema definitions |
| `lib/repopress/standard-library.tsx`              | Built-in components               |
| `lib/repopress/adapter.ts`                        | Runtime adapter generation        |
| `lib/framework-detector.ts`                       | Framework detection               |
| `components/studio/editor.tsx`                    | MDXEditor with plugins            |
| `components/studio/insert-repo-component.tsx`     | JSX insertion dropdown            |
| `components/studio/jsx-component-descriptors.tsx` | JSX descriptor mapping            |
| `components/studio/repo-jsx-bridge.tsx`           | Live component rendering          |
| `components/mdx-runtime/PreviewRuntime.tsx`       | MDX compilation + render          |
| `convex/schema.ts`                                | Project + component storage       |

---

## What Was Accomplished Today

1. **History Revamp** - Full implementation with tests passing
2. **Deep understanding** of the component system architecture
3. **Documentation** ready for next brainstorming session

---

_Generated: March 2026_

## GEMINI Findings: Phase 2 Architecture & Implementation State

During the deep architectural analysis, several critical insights were identified that will shape the Phase 2 implementation.

### 1. Critical Bug Identified: Editor Remounting
In `components/studio/editor.tsx`, the `ForwardRefEditor` is passed `key={sanitizedContent}`. This causes the entire MDXEditor component to unmount and re-mount on **every single keystroke**, resulting in severe performance degradation and occasional focus loss. This must be fixed by using a stable identifier like `selectedFile.path`.

### 2. Architectural Foundational: `RepoJsxBridge`
A powerful architectural bridge already exists in `components/studio/repo-jsx-bridge.tsx`. This component successfully bridges the `MDAST` node attributes to the "Live" evaluated components from the repository adapter. This means RepoPress is already capable of rendering repository-native UI *within* the editing surface, which is the primary requirement for a visual "Two-Way" system.

### 3. Resilient MDX Runtime
The runtime implementation in `components/mdx-runtime/compileMdx.ts` is more sophisticated than initially thought. It surgically modifies the compiled MDX function body to replace hard `_missingMdxReference` throw statements with a fallback mechanism. This ensures that the editor remains stable even when a user inserts a component that isn't fully defined in the adapter.

### 4. Phase 2 Technical Direction
*   **AST Synchronization:** To enable visual property editing, we must transition from string-based content updates to an AST-driven flow. This will allow the "Properties Panel" to update specific component attributes without re-compiling the entire document.
*   **Visual Schema Mapper:** A missing link is an automated way to map adapter exports to `JsxComponentDescriptor`. Automating this discovery will allow RepoPress to support any repository component without manual configuration.
*   **Expression Serialization:** We need a robust serializer for complex MDX expressions (e.g., `DOCS_SETUP_MEDIA.cloudflare`) to ensure that visual edits don't break valid JavaScript logic embedded in props.

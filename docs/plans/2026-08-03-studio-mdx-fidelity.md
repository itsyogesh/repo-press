# Studio MDX Fidelity Completion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Studio render Merry Magic Mail route-based MDX edge-to-edge with editable metadata exports, compact article navigation, real cover images, and recognizable product-owned components without weakening the compatible sandbox.

**Architecture:** RepoPress adds a shared non-evaluating metadata parser, a framework-aware explorer view, and a host-mediated image byte bridge whose sandbox endpoint can render only blob URLs. Merry extends the portable `@repopress/preview` primitives in its own adapter; RepoPress never imports Merry or executes the product's Next.js runtime.

**Tech Stack:** Next.js 16, React 19, TypeScript, Acorn, gray-matter, Convex actions, signed compatible artifacts, MessageChannel, locked Web Worker, strict iframe CSP, Vitest, Chrome browser E2E.

---

### Task 1: Parse static metadata exports without evaluation

**Files:**
- Create: `lib/content-metadata.ts`
- Create: `lib/__tests__/content-metadata.test.ts`
- Modify: `lib/publish-content.ts`
- Modify: `lib/__tests__/publish-content.test.ts`

**Step 1: Write the failing parser tests**

Cover:

```ts
const source = `export const metadata = {
  title: "Free Printable Santa Letter Templates",
  description: "Ready-to-print templates",
  keywords: ["Santa", "letters"],
  alternates: { canonical: "https://merrymagicmail.com/blog/templates" },
}

# Free Santa Letter Templates`

expect(parseContentFile(source, "blog/templates/page.mdx")).toEqual({
  body: "# Free Santa Letter Templates",
  metadata: {
    title: "Free Printable Santa Letter Templates",
    description: "Ready-to-print templates",
    keywords: ["Santa", "letters"],
    alternates: { canonical: "https://merrymagicmail.com/blog/templates" },
  },
  metadataSource: "metadata-export",
  editable: true,
})
```

Add YAML, BOM, CRLF, leading comments/imports, quoted keys, negative numbers, and no-metadata fixtures. Assert calls, identifiers, spreads, computed keys, methods, getters, regex, template expressions, `__proto__`, excessive depth, excessive keys, and oversized literals return the original body with `editable: false` and `UNSUPPORTED_METADATA_EXPORT`.

**Step 2: Run RED**

Run: `npx vitest run lib/__tests__/content-metadata.test.ts lib/__tests__/publish-content.test.ts`

Expected: FAIL because `parseContentFile` does not exist.

**Step 3: Implement the bounded parser**

Move the fence-aware leading-ESM scanner from `publish-content.ts` into `content-metadata.ts`. Parse only the extracted declaration with:

```ts
import { parse } from "acorn"

const program = parse(declaration, { ecmaVersion: "latest", sourceType: "module" })
```

Walk exactly one exported `const metadata` initializer. Convert only accepted static AST nodes with explicit node, depth, key, array, and string budgets. Return frozen plain records. Export scanner helpers needed by publish serialization rather than duplicating them.

**Step 4: Preserve publish behavior**

Refactor `detectMetadataSource`, `bodyEmbedsMetadataExport`, and export recovery in `publish-content.ts` to use the shared scanner. Keep the existing pinned-source format authority and fail-closed conflict behavior unchanged.

**Step 5: Run GREEN**

Run: `npx vitest run lib/__tests__/content-metadata.test.ts lib/__tests__/publish-content.test.ts`

Expected: PASS.

**Step 6: Commit**

```bash
git add lib/content-metadata.ts lib/__tests__/content-metadata.test.ts lib/publish-content.ts lib/__tests__/publish-content.test.ts
git commit -m "feat(content): parse static MDX metadata exports"
```

### Task 2: Use metadata exports throughout Studio and title sync

**Files:**
- Modify: `components/studio/hooks/use-studio-file.ts`
- Modify: `components/studio/hooks/__tests__/use-studio-file-read-authority.test.tsx`
- Modify: `convex/documents.ts`
- Modify: `lib/__tests__/convex-action-boundaries.test.ts`
- Modify: `components/studio/hooks/use-studio-queries.ts`
- Modify: `components/studio/hooks/__tests__/use-studio-queries-paths.test.tsx`

**Step 1: Write failing Studio-open tests**

Prime `useStudioFile` with the Merry metadata-export fixture and assert:

- `content` begins at the Markdown heading;
- `frontmatter` contains title, description, keywords, and nested alternates;
- save/reload retains the parsed values;
- unsupported exports remain in `content` and do not fabricate frontmatter.

**Step 2: Write failing title-sync tests**

Drive `syncTreeTitles` with `article/page.mdx` containing a metadata export. Expect the batch mutation title to be `Free Printable Santa Letter Templates`, not `page`.

Add the missed HTTP contract regression in `use-studio-queries.ts`: title sync reaches `done` only when `response.ok`; 500 becomes `error` and can retry.

**Step 3: Run RED**

Run: `npx vitest run components/studio/hooks/__tests__/use-studio-file-read-authority.test.tsx components/studio/hooks/__tests__/use-studio-queries-paths.test.tsx lib/__tests__/convex-action-boundaries.test.ts`

Expected: FAIL on empty metadata, `page` title, and false-success HTTP state.

**Step 4: Wire the shared parser**

Replace `matter(rawContent)` in `parseFileSnapshot` with `parseContentFile`. Replace `titleFromContent`'s YAML regex with `parseContentFile(content, filePath).metadata.title`, passed through the existing bounded title normalizer. Check `response.ok` before setting title sync to `done`.

**Step 5: Run GREEN**

Run the command from Step 3.

Expected: PASS.

**Step 6: Commit**

```bash
git add components/studio/hooks/use-studio-file.ts components/studio/hooks/__tests__/use-studio-file-read-authority.test.tsx components/studio/hooks/use-studio-queries.ts components/studio/hooks/__tests__/use-studio-queries-paths.test.tsx convex/documents.ts lib/__tests__/convex-action-boundaries.test.ts
git commit -m "fix(studio): surface metadata exports and synced titles"
```

### Task 3: Compact Next.js route documents in the explorer

**Files:**
- Create: `lib/studio/route-document-tree.ts`
- Create: `lib/studio/__tests__/route-document-tree.test.ts`
- Modify: `components/studio/file-tree.tsx`
- Modify: `components/studio/file-tree-item.tsx`
- Create: `components/studio/__tests__/route-document-tree-view.test.tsx`
- Modify: `components/studio/studio-layout.tsx`

**Step 1: Write failing view-model tests**

Assert that a `next-mdx` directory with exactly one `page.mdx` becomes:

```ts
{
  kind: "route-document",
  routePath: "santa-letter-template-free",
  source: { path: "santa-letter-template-free/page.mdx", ... },
  label: "Free Printable Santa Letter Templates",
  secondaryLabel: "santa-letter-template-free",
}
```

Do not compact another framework, a folder with multiple children, a folder containing nested routes, or a deleted route leaf.

**Step 2: Write failing component tests**

Render the explorer and assert one selectable article row, no visible `page.mdx`, real leaf selection, dirty/deleted badges on the leaf, accessible button semantics, and disabled rename for the route bundle.

**Step 3: Run RED**

Run: `npx vitest run lib/studio/__tests__/route-document-tree.test.ts components/studio/__tests__/route-document-tree-view.test.tsx`

Expected: FAIL because the route document view does not exist.

**Step 4: Implement view-only compaction**

Add a discriminated explorer view model. Thread `project.detectedFramework` into `FileTree`. Keep selection, deletion, and document path authority on `source.path`; do not mutate the Git tree or publish path. Render the title as primary and route segment as mono secondary text.

**Step 5: Run GREEN**

Run the command from Step 3 plus `npx vitest run components/studio/hooks/__tests__/use-studio-queries-paths.test.tsx`.

Expected: PASS.

**Step 6: Commit**

```bash
git add lib/studio/route-document-tree.ts lib/studio/__tests__/route-document-tree.test.ts components/studio/file-tree.tsx components/studio/file-tree-item.tsx components/studio/__tests__/route-document-tree-view.test.tsx components/studio/studio-layout.tsx
git commit -m "feat(studio): present route MDX as article rows"
```

### Task 4: Make the preview surface edge-to-edge

**Files:**
- Modify: `components/studio/preview.tsx`
- Modify: `components/mdx-runtime/CompatiblePreviewFrame.tsx`
- Modify: `components/preview-sandbox/SandboxRuntime.tsx`
- Create: `components/studio/__tests__/preview-edge-to-edge.test.tsx`
- Modify: `components/mdx-runtime/__tests__/CompatiblePreviewFrame.test.tsx`
- Modify: `components/preview-sandbox/__tests__/SandboxRuntime.test.tsx`

**Step 1: Write failing layout tests**

Assert desktop preview:

- has `data-studio-preview-surface="edge-to-edge"`;
- does not contain `Published view`;
- does not contain `max-w-[980px]` or the nested document card;
- mounts the compatible iframe with full width and height and no rounded inner border;
- keeps tablet/mobile `DeviceFrame` behavior.

Assert sandbox `<main>` has no default `p-6` and allows the adapter surface to own its spacing.

**Step 2: Run RED**

Run: `npx vitest run components/studio/__tests__/preview-edge-to-edge.test.tsx components/mdx-runtime/__tests__/CompatiblePreviewFrame.test.tsx components/preview-sandbox/__tests__/SandboxRuntime.test.tsx`

Expected: FAIL on the existing nested card and padding.

**Step 3: Implement the minimal layout change**

Keep the Studio toolbar. Replace the nested `previewContent` article/card with a full-size surface. Compatible mode mounts the iframe directly. Generic mode uses a full-width scroll surface with its own bounded reading measure inside `typeset-preview`, not an outer RepoPress card. Make fullscreen reuse the same content node.

**Step 4: Run GREEN**

Run the command from Step 2.

Expected: PASS.

**Step 5: Commit**

```bash
git add components/studio/preview.tsx components/studio/__tests__/preview-edge-to-edge.test.tsx components/mdx-runtime/CompatiblePreviewFrame.tsx components/mdx-runtime/__tests__/CompatiblePreviewFrame.test.tsx components/preview-sandbox/SandboxRuntime.tsx components/preview-sandbox/__tests__/SandboxRuntime.test.tsx
git commit -m "fix(studio): render previews edge to edge"
```

### Task 5: Add a bounded compatible image node

**Files:**
- Modify: `lib/preview/preview-capabilities.ts`
- Modify: `lib/preview/__tests__/preview-capabilities.test.ts`
- Modify: `components/preview-sandbox/compatible-worker.ts`
- Modify: `components/preview-sandbox/compatible-render-tree.tsx`
- Modify: `components/preview-sandbox/__tests__/compatible-worker-containment.test.ts`
- Modify: `components/preview-sandbox/__tests__/compatible-render-tree.test.tsx`

**Step 1: Write failing containment tests**

Expect `PreviewImage` to produce a dedicated inert node:

```ts
{
  kind: "image",
  source: "https://cdn.example/cover.png",
  alt: "Printable Santa letter templates",
  label: "Free Santa letter templates",
  aspect: "wide",
}
```

Reject non-string, credential-bearing, `data:`, `javascript:`, `file:`, `blob:`, overlong, and control-character sources. Assert the node contains no DOM `src`, event, style, class injection, or executable value.

**Step 2: Run RED**

Run: `npx vitest run lib/preview/__tests__/preview-capabilities.test.ts components/preview-sandbox/__tests__/compatible-worker-containment.test.ts components/preview-sandbox/__tests__/compatible-render-tree.test.tsx`

Expected: FAIL because images are still placeholders.

**Step 3: Implement the image node contract**

Extend `CompatibleRenderNode` with `kind: "image"`. Inside the stringified worker, have `PreviewImage` return a private sentinel recognized by `renderTree`; sanitize again on the iframe side. Continue producing the existing placeholder when no accepted source exists.

**Step 4: Run GREEN**

Run the command from Step 2.

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/preview/preview-capabilities.ts lib/preview/__tests__/preview-capabilities.test.ts components/preview-sandbox/compatible-worker.ts components/preview-sandbox/compatible-render-tree.tsx components/preview-sandbox/__tests__/compatible-worker-containment.test.ts components/preview-sandbox/__tests__/compatible-render-tree.test.tsx
git commit -m "feat(preview): carry bounded image references"
```

### Task 6: Resolve preview assets through an authenticated SSRF-safe route

**Files:**
- Create: `lib/server/external-image.ts`
- Create: `lib/server/__tests__/external-image.test.ts`
- Modify: `app/api/media/download-external/route.ts`
- Create: `app/api/preview/asset/route.ts`
- Create: `app/api/preview/asset/__tests__/route.test.ts`
- Modify: `lib/deployment-role.ts`
- Modify: `lib/__tests__/deployment-role.test.ts`

**Step 1: Extract failing shared-downloader tests**

Move current DNS/private-network/manual-redirect logic behind:

```ts
export async function fetchBoundedExternalImage(input: {
  url: string
  maxBytes: number
  timeoutMs: number
  allowedMimeTypes: ReadonlySet<string>
}): Promise<{ bytes: Uint8Array; mimeType: string }>
```

Test direct private IPs, public DNS resolving partly private, redirects to private ranges, redirect loops, credentialed URLs, timeout, content-length overflow, streamed overflow, MIME spoofing, SVG rejection, and successful PNG.

**Step 2: Write failing preview-asset route tests**

Require the same authenticated project/editor authority and exact base head as compatible artifact resolution. Cover external HTTPS and repository-relative sources. Return only image bytes, allowlisted MIME, `Content-Length`, `X-Content-Type-Options: nosniff`, and `Cache-Control: private, no-store`. Never return upstream errors or final URLs.

**Step 3: Run RED**

Run: `npx vitest run lib/server/__tests__/external-image.test.ts app/api/preview/asset/__tests__/route.test.ts app/api/media/download-external/__tests__/route.test.ts lib/__tests__/deployment-role.test.ts`

Expected: FAIL because the shared helper and route are missing.

**Step 4: Implement the route and shared helper**

Reuse `getFileForPublish` for repository media at the exact commit. For external media, call the shared downloader with four MiB, five redirects, and five seconds. Permit PNG, JPEG, WebP, GIF, and AVIF; reject SVG. The route is served by the app deployment, not the sandbox deployment.

**Step 5: Run GREEN**

Run the command from Step 3.

Expected: PASS.

**Step 6: Commit**

```bash
git add lib/server/external-image.ts lib/server/__tests__/external-image.test.ts app/api/media/download-external/route.ts app/api/preview/asset app/api/media/download-external/__tests__/route.test.ts lib/deployment-role.ts lib/__tests__/deployment-role.test.ts
git commit -m "feat(preview): resolve bounded image assets"
```

### Task 7: Transfer image bytes into the isolated iframe

**Files:**
- Modify: `lib/preview/sandbox-protocol.ts`
- Modify: `lib/preview/__tests__/sandbox-protocol.test.ts`
- Modify: `components/mdx-runtime/CompatiblePreviewFrame.tsx`
- Modify: `components/mdx-runtime/__tests__/CompatiblePreviewFrame.test.tsx`
- Modify: `components/preview-sandbox/SandboxRuntime.tsx`
- Modify: `components/preview-sandbox/__tests__/SandboxRuntime.test.tsx`
- Modify: `components/preview-sandbox/compatible-render-tree.tsx`
- Modify: `next.config.mjs`

**Step 1: Write failing protocol tests**

Add authority-bound `asset-request`, `asset-response`, and `asset-error` messages. Bound request IDs, source bytes, item count, per-image bytes, aggregate bytes, and MIME. Assert stale session/snapshot messages, duplicates, unsolicited responses, and malformed transferables are ignored.

**Step 2: Write failing host/frame tests**

Render a compatible tree with two image nodes. Assert the host deduplicates sources, calls `/api/preview/asset` with project/base/document authority, transfers accepted buffers, caps concurrency, and returns a placeholder for a failed image without downgrading the document.

**Step 3: Write failing sandbox tests**

Assert successful responses become temporary blob URLs on host-owned `<img>` elements; alt and aspect survive; URLs are revoked on replacement/unmount; no repository source becomes a DOM URL; and more than eight images or twelve MiB aggregate is refused.

**Step 4: Run RED**

Run: `npx vitest run lib/preview/__tests__/sandbox-protocol.test.ts components/mdx-runtime/__tests__/CompatiblePreviewFrame.test.tsx components/preview-sandbox/__tests__/SandboxRuntime.test.tsx`

Expected: FAIL because the asset protocol does not exist.

**Step 5: Implement the bridge**

Extend the existing MessageChannel instead of creating a second unauthenticated channel. Keep JSON control envelopes bounded and transfer bytes as `ArrayBuffer` transferables. Render images only after a matching response. Change sandbox CSP to `img-src blob:` while keeping `connect-src 'none'`, `media-src 'none'`, and `object-src 'none'`.

**Step 6: Run GREEN**

Run the command from Step 4 plus `npx vitest run components/preview-sandbox/__tests__/compatible-worker-containment.test.ts`.

Expected: PASS.

**Step 7: Commit**

```bash
git add lib/preview/sandbox-protocol.ts lib/preview/__tests__/sandbox-protocol.test.ts components/mdx-runtime/CompatiblePreviewFrame.tsx components/mdx-runtime/__tests__/CompatiblePreviewFrame.test.tsx components/preview-sandbox/SandboxRuntime.tsx components/preview-sandbox/__tests__/SandboxRuntime.test.tsx components/preview-sandbox/compatible-render-tree.tsx next.config.mjs
git commit -m "feat(preview): bridge inert image bytes to sandbox"
```

### Task 8: Add portable stationery presentation and update the Merry contract fixture

**Files:**
- Modify: `lib/preview/preview-capabilities.ts`
- Modify: `components/preview-sandbox/compatible-worker.ts`
- Modify: `app/typeset.css`
- Modify: `lib/preview/__tests__/preview-capabilities.test.ts`
- Modify: `lib/preview/__tests__/fixtures/merry-product-extension.ts`
- Modify: `lib/preview/__tests__/merry-product-extension.test.ts`

**Step 1: Write failing capability tests**

Define `PreviewPaper` with bounded `title`, `showStamp`, `actionLabel`, `children`, and a small semantic paper variant enum. Assert it emits only inert platform class names and semantic markup.

Update the Merry fixture expectation so `CoverImage` retains its real mapped URL and all five components render recognizable structure with no fidelity loss.

**Step 2: Run RED**

Run: `npx vitest run lib/preview/__tests__/preview-capabilities.test.ts lib/preview/__tests__/merry-product-extension.test.ts components/preview-sandbox/__tests__/compatible-worker-containment.test.ts`

Expected: FAIL because `PreviewPaper` is unavailable and `PreviewImage` previously discarded the URL.

**Step 3: Implement generic presentation**

Add `PreviewPaper` to compile-time types and the frozen worker module. Style only `repopress-preview-paper*` classes using RepoPress tokens and semantic ruled-paper decoration. Update the fixture adapter to compose the five Merry names from generic primitives and map `templates`/`perfectLetter` to Merry-owned CDN URLs inside the fixture.

**Step 4: Run GREEN**

Run the command from Step 2.

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/preview/preview-capabilities.ts lib/preview/__tests__/preview-capabilities.test.ts components/preview-sandbox/compatible-worker.ts app/typeset.css lib/preview/__tests__/fixtures/merry-product-extension.ts lib/preview/__tests__/merry-product-extension.test.ts
git commit -m "feat(preview): add portable product presentation primitives"
```

### Task 9: Install the real Merry product extension on an isolated branch

**Files in Merry Magic Mail repository:**
- Modify: `repopress.config.json`
- Modify: `.repopress/mdx-preview.tsx`
- Create: `.repopress/merry-preview.fixture.mdx`
- Add or modify adapter tests according to the Merry repository's existing test layout

**Step 1: Create a clean Merry worktree**

Fetch `origin/main` without touching the user's dirty Merry checkout. Create `fix/repopress-mdx-fidelity` in a separate worktree and run the repository's baseline test/typecheck commands.

**Step 2: Write failing adapter/config tests**

Assert all five complete schemas, safe import policy, both cover presets, required/optional props, import-free authored MDX, and a fixture containing the real metadata export.

**Step 3: Run RED**

Run the Merry repository's focused test command.

Expected: FAIL because its current adapter registers only `DocsImage`, `DocsVideo`, and `Callout`.

**Step 4: Implement the product adapter**

Copy the ratified adapter composition from the RepoPress fixture, keeping Merry URLs and copy in Merry. Do not alter `mdx-components.tsx` production behavior. Update the authoring config with the five complete contracts.

**Step 5: Run GREEN and repository verification**

Run focused tests, typecheck, lint, and production build as supported by Merry.

Expected: PASS.

**Step 6: Commit and push**

```bash
git add repopress.config.json .repopress/mdx-preview.tsx .repopress/merry-preview.fixture.mdx
git commit -m "feat(content): add RepoPress product preview adapter"
git push -u origin fix/repopress-mdx-fidelity
```

Open a ready PR targeting Merry `main`; do not merge it before the RepoPress capability PR is green.

### Task 10: Verify the complete system and prepare both PRs

**Files:**
- Modify documentation only if verification reveals an operational requirement

**Step 1: Run focused regression suites**

```bash
npx vitest run lib/__tests__/content-metadata.test.ts \
  components/studio/hooks/__tests__/use-studio-file-read-authority.test.tsx \
  lib/studio/__tests__/route-document-tree.test.ts \
  components/studio/__tests__/preview-edge-to-edge.test.tsx \
  app/api/preview/asset/__tests__/route.test.ts \
  components/mdx-runtime/__tests__/CompatiblePreviewFrame.test.tsx \
  components/preview-sandbox/__tests__/SandboxRuntime.test.tsx \
  lib/preview/__tests__/merry-product-extension.test.ts
```

Expected: PASS.

**Step 2: Run RepoPress quality gates**

```bash
npm test
npm run lint
./node_modules/.bin/tsc --noEmit
npm run build
git diff --check
```

Expected: all commands succeed. Regenerate Convex types against the configured deployment if `convex/_generated/api.d.ts` changes; otherwise verify it remains unchanged.

**Step 3: Run local browser E2E**

Use Chrome automation against local RepoPress + configured Convex with a clean Merry project snapshot. Capture screenshots for desktop split, Properties, route explorer, actual cover image, and all five components. Test save/reload and a disposable publish lane.

**Step 4: Run deployed E2E**

Deploy protected RepoPress and sandbox previews with the required existing secrets, point `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_PREVIEW_ORIGIN` at the custom domains, and repeat the browser flow. Delete temporary deployments and revoke bypasses after verification.

**Step 5: Request independent differential and security review**

Review the RepoPress diff with emphasis on AST parsing, SSRF/DNS rebinding, protocol authority, transferred byte bounds, blob URL lifetime, CSP, and Generic fallback. Address every P0/P1 before merge.

**Step 6: Push and open the RepoPress PR**

```bash
git push -u origin fix/studio-mdx-fidelity
gh pr create --base main --head fix/studio-mdx-fidelity --title "Fix Studio MDX product fidelity" --body-file /tmp/repopress-studio-mdx-fidelity-pr.md
```

Keep both PRs ready for review. Merge RepoPress first after CI and browser E2E, then update/retest/merge Merry.


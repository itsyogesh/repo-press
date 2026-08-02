# Studio MDX Fidelity Completion Design

Date: 2026-08-03
Status: Approved for implementation
Pilot: Merry Magic Mail
Amends: `2026-08-02-product-mdx-extension-design.md`

## Goal

Make the Studio preview read like the connected product instead of a nested RepoPress demo card. For the Merry pilot, Studio must fill the preview pane, understand `export const metadata`, display real cover media, render recognizable product-owned components, and present route-based Next.js content as articles rather than exposing every `page.mdx` implementation detail.

The result must preserve the approved platform boundary: RepoPress provides a safe, framework-neutral core; a repository-owned adapter composes that core into product-specific components; production rendering remains authoritative in the consuming application.

## Confirmed failure modes

The current behavior has four independent causes that combine into one low-fidelity experience:

1. `components/studio/preview.tsx` adds `max-w-[980px]`, outer padding, an internal bordered card, a second document header, and iframe padding inside an already-bounded preview pane.
2. Studio parses only YAML frontmatter with `gray-matter`. Merry stores metadata in a leading static `export const metadata = { ... }`, so Properties is empty, the title sync falls back to `page`, and the preview shell cannot see the article title or description.
3. Next.js route documents are represented literally as a folder containing `page.mdx`, even when that file is the folder's sole content document.
4. `static-inert-v1` intentionally turns `PreviewImage` into a placeholder and keeps `img-src 'none'`. Merry's repository preview entry also does not yet register its five product components, so the product adapter cannot supply the intended presentation.

## Architectural decision

Use a bounded product-extension model, not framework emulation and not product branches inside RepoPress core.

RepoPress core owns:

- content metadata detection, safe static-literal extraction, and source-format provenance;
- an edge-to-edge preview viewport and framework-aware content explorer view models;
- signed compatible artifacts and an isolated, networkless worker/iframe;
- semantic preview primitives, bounded media references, authenticated media resolution, and blob-byte transfer;
- generic fallback and fidelity diagnostics.

The product repository owns:

- component names and authoring schemas;
- composition of framework-neutral preview primitives;
- preset-to-asset mapping and product copy;
- production components and framework bindings.

RepoPress must not contain `CoverImage`, `LetterPaper`, Christmas-specific colors, Merry asset URLs, or `next/image` behavior. Merry's `.repopress/mdx-preview.tsx` owns those decisions and imports only `@repopress/preview` plus type-only React declarations.

## 1. Edge-to-edge desktop preview

The existing resizable editor/preview split remains. “Edge-to-edge” means the selected preview pane is the viewport:

- remove the `max-w-[980px]` wrapper and nested Published View card;
- remove the duplicate filename/title/description chrome from the document surface;
- make compatible iframe and generic fallback fill the pane's width and available height;
- remove default sandbox document padding;
- keep fidelity, viewport, fullscreen, and refresh controls in the existing Studio preview toolbar;
- let the product adapter or generic typeset renderer choose its own internal reading measure.

Tablet and mobile device frames remain bounded simulations. Fullscreen reuses the same document surface rather than a different composition.

## 2. One safe content-metadata model

Introduce a shared pure parser returning:

```ts
type ParsedContentFile = Readonly<{
  body: string
  metadata: Readonly<Record<string, unknown>>
  metadataSource: "frontmatter" | "metadata-export" | "none"
  editable: boolean
  diagnostic?: "UNSUPPORTED_METADATA_EXPORT"
}>
```

YAML continues through `gray-matter`. For MDX metadata exports, reuse the existing fence-aware and leading-ESM boundary scanner, parse only the isolated JavaScript initializer with Acorn, and convert only a JSON-compatible static subset:

- string, number, boolean, and null literals;
- arrays of accepted values;
- objects with non-computed identifier or string keys;
- finite unary numeric literals.

Reject calls, identifiers, spreads, getters, methods, templates with expressions, computed keys, regexes, bigint, duplicate dangerous keys, excessive depth, excessive keys, or oversized strings. Never evaluate repository JavaScript.

When the static export is accepted, Studio removes the declaration from the editor body and exposes its object in Properties. Publish continues to detect the pinned Git source and serialize back to `export const metadata`, so editing metadata cannot silently convert a Next.js file to YAML. Unsupported exports remain in the body, are non-editable in Properties, and surface a diagnostic rather than losing data.

The same parser supplies title synchronization. This prevents `page.mdx` from becoming the stored title and keeps tree labels, tabs, search, preview title, and Properties consistent.

## 3. Route-document explorer compaction

Add a view-only route bundle recognizer for `next-mdx` projects. A directory whose only visible content child is `page.md`, `page.mdx`, `index.md`, or `index.mdx` is rendered as one document row:

- selection opens the real leaf file path;
- the primary label is parsed metadata title, falling back to a humanized route segment;
- the secondary label is the route segment, never `page.mdx`;
- delete and dirty status still target the real leaf document;
- folders with additional content or nested routes retain normal expandable behavior;
- the underlying Git tree, publish paths, and URL authority are unchanged.

The first slice intentionally does not invent virtual files or rename route folders through a leaf rename. Route-bundle rename remains disabled until it can move the whole directory atomically.

## 4. Host-mediated compatible images

The sandbox remains unable to make network requests. Real preview images use an explicit inert node and authenticated byte bridge:

1. `PreviewImage` emits a bounded image render node containing `source`, `alt`, `label`, and `aspect`; it does not emit `<img>` or a URL-bearing DOM attribute in the worker.
2. `SandboxRuntime` collects image references and sends bounded asset requests to `CompatiblePreviewFrame` over the existing authority-bound channel.
3. The Studio host calls a new authenticated preview-asset route with the project, pinned base commit, document path, and requested source.
4. Repository-relative sources are read through the existing authenticated GitHub/media authority. External HTTPS sources use a shared SSRF-safe downloader extracted from the media-download route: public DNS only, manual bounded redirects, image MIME allowlist, byte limit, timeout, and no credentialed URLs.
5. The host transfers validated bytes and MIME type back to the iframe. The iframe creates a temporary blob URL and renders the host-owned image node.
6. Sandbox CSP changes from `img-src 'none'` to `img-src blob:` only. `connect-src` stays `none`; repository code still has no fetch, image, CSS URL, cookie, storage, navigation, or parent access.

Bounds for the first slice: at most eight images, four MiB per image, twelve MiB per preview snapshot, and image MIME types PNG, JPEG, WebP, GIF, and AVIF. SVG remains excluded because active-content and external-reference handling needs a separate review.

Failures are per-image and recoverable: render the labelled placeholder and report a media diagnostic without downgrading otherwise-compatible content.

## 5. Portable presentation primitives

Retain the semantic capability model and add only the missing generic surface needed by product adapters:

- `PreviewImage` gains real, host-mediated media while keeping placeholder fallback;
- `PreviewPaper` provides bounded stationery semantics (title, ruled surface, optional stamp/icon, body, optional inert action);
- the existing `PreviewBox`, `PreviewStack`, `PreviewInline`, `PreviewText`, `PreviewList`, `PreviewAction`, and `PreviewIcon` remain the composition vocabulary.

RepoPress CSS styles only these platform primitives with design tokens. Merry composes them into its five components. Arbitrary CSS, raw class injection, inline style, remote fonts, and executable events remain unsupported.

This gives recognizable product structure and actual imagery now without pretending to be pixel-identical to Merry's Next.js runtime. Exact production fidelity remains the future Native provider.

## 6. Merry product extension

A separate Merry feature branch updates:

- `repopress.config.json` with complete authoring contracts for `CoverImage`, `InfoBox`, `Checklist`, `CTABox`, and `LetterPaper`;
- `.repopress/mdx-preview.tsx` with import-free production names mapped to `@repopress/preview` primitives;
- cover presets resolved to Merry-owned public assets inside the product adapter;
- a preview fixture covering all components and metadata-export fields.

The production `mdx-components.tsx` remains authoritative and does not import RepoPress. RepoPress source contains no Merry implementation branch.

## Security and failure behavior

All prior compatible-preview guarantees remain:

- repository code executes only in the one-shot locked worker;
- the signed artifact binds tenant, project, exact commit, document path, source digest, session, snapshot, profile, and expiry;
- adapter imports remain allowlisted;
- render trees remain bounded and inert;
- actions remain non-interactive;
- generic preview remains available for every unsupported or failed compatible state.

New media-specific failures do not expose repository tokens, asset response bodies, resolved private URLs, DNS answers, or exception details. The asset route returns generic status codes and `Cache-Control: private, no-store`.

Metadata parsing fails closed. An unsupported export is never evaluated, rewritten, or partially merged.

## Test and acceptance strategy

### Unit and contract tests

- parse YAML, Merry static metadata exports, nested arrays/objects, CRLF, comments, and leading imports;
- reject executable or pathological metadata without changing source;
- preserve metadata-export serialization through save/publish helpers;
- compact only valid route-document bundles;
- sanitize image nodes and reject unsafe schemes, SVG, oversized payloads, too many images, redirects to private networks, and authority mismatches;
- verify blob URLs are revoked and CSP permits only `blob:` images;
- render all Merry components through the compatible worker.

### Integration tests

- Studio open/save/reload shows metadata-export values and a body without the export declaration;
- title sync stores the metadata title rather than `page`;
- the preview pane has no nested Published View card and the iframe occupies the pane;
- asset failures preserve the rest of the compatible render;
- generic fallback remains safe and usable.

### Browser E2E

Against RepoPress and Merry Magic Mail:

1. connect the Merry project at the exact repository head;
2. open `santa-letter-template-free/page.mdx` from the compact article row;
3. verify title, description, keywords, and canonical metadata in Properties;
4. verify edge-to-edge desktop rendering and responsive tablet/mobile frames;
5. verify the actual `templates` cover image and recognizable InfoBox, LetterPaper, Checklist, and CTABox;
6. edit a metadata value and component prop, save, reload, and confirm source fidelity;
7. publish to a lane, inspect the generated Merry PR, and confirm `export const metadata` plus component source remain correct;
8. close the test lane unmerged and verify recovery/discard behavior;
9. run RepoPress tests, lint, typecheck, production build, Convex codegen, GitHub CI, and Vercel smoke tests.

## Delivery and rollback

RepoPress and Merry ship as separate pull requests. RepoPress merges first because the Merry adapter depends on the new capability contract. The Merry PR then activates the pilot without changing production rendering.

Every new compatible capability is additive. If media transport causes a production problem, disable the asset bridge and `PreviewImage` falls back to its current labelled placeholder while metadata, tree compaction, and edge-to-edge layout remain functional. If metadata-export parsing rejects a document, the raw source stays intact and Generic editing remains available.


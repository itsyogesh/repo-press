# Product MDX Extension Pilot Design

Date: 2026-08-02
Status: Approved for implementation
Pilot: Merry Magic Mail

## Goal

Prove that a product can extend RepoPress with its own MDX components without coupling RepoPress core to the product or its web framework. Merry Magic Mail's `CoverImage`, `InfoBox`, `Checklist`, `CTABox`, and `LetterPaper` are the first extension.

Authors must be able to discover, insert, configure, save, reload, and publish those components in Studio. Compatible preview should render a useful product-owned visual implementation. The Merry application remains authoritative for production rendering.

## Architectural boundary

RepoPress core owns a framework-neutral extension contract:

- bounded declarative authoring metadata for props, slots, defaults, and assets;
- an immutable, repository-pinned compatible preview entry;
- a small capability module exposed only inside the compatible sandbox;
- artifact construction, signing, verification, transfer, execution, and downgrade behavior;
- generic placeholders when compatible preview is unavailable.

The consuming product owns:

- component names and authoring schemas;
- browser-safe preview JSX and product styling;
- preview fixtures and defaults;
- its production component map and framework bindings.

RepoPress must not contain Merry component names, Christmas styling, or product-specific runtime branches.

## Fidelity model

The compatible sandbox is a browser-static rendering environment, not a Next.js, Astro, Remix, or application server runtime.

Product preview code imports platform capabilities from `@repopress/preview` instead of framework modules. The first capability surface is deliberately small:

- `PreviewBox`, `PreviewStack`, `PreviewInline`, `PreviewText`, and `PreviewList`: compose a bounded structural view from semantic variants rather than arbitrary CSS.
- `PreviewAction`: renders an inert action label. It cannot navigate, submit, or target the parent frame.
- `PreviewImage`: renders a labelled media placeholder and records media fidelity loss. The pilot preserves the sandbox's `img-src 'none'` network boundary.
- `PreviewIcon`: renders one of a small allowlisted set of inert symbols.

Production code remains free to use `next/link`, `next/image`, Astro assets, Remix links, or another framework. A product may share view code between production and preview by injecting its platform bindings, but RepoPress does not require a particular source layout.

The pilot targets structural and authoring fidelity, not pixel equivalence. Product code chooses from frozen semantic options such as `tone`, `surface`, `spacing`, `align`, and `size`. RepoPress owns the rendering and CSS for those options; Merry owns how it composes them. Arbitrary product CSS, inline styles, remote images, and raw navigation remain outside this first capability version. This avoids a hidden framework or CSS-build dependency and leaves a clean path to a separately reviewed signed-style capability later.

Fidelity labels retain their existing meanings:

- `compatible`: the signed, pinned product preview entry rendered successfully with approved capabilities;
- `generic`: safe Markdown plus inert component placeholders;
- `native`: reserved for a future framework runner and not implemented by this pilot.

## Product extension declaration

Merry's `repopress.config.json` will declare the five component authoring contracts and a project-local preview entry:

```json
{
  "preview": {
    "entry": ".repopress/merry-preview.tsx"
  },
  "components": {
    "InfoBox": {
      "schemaStatus": "complete",
      "props": [],
      "slots": [{ "name": "children", "accepts": "mdx", "required": true }]
    }
  }
}
```

The actual manifest will fully describe all five components. The preview entry will export the existing adapter shape with `components`, optional `scope`, and optional `allowImports`. For the pilot it will be a single self-contained TSX file whose only external imports are `react`, React JSX runtimes, and `@repopress/preview`. Relative source graphs remain supported by the artifact schema but are not required for the initial Merry proof.

Configuration and preview source are untrusted repository inputs. They become compatible execution authority only after server-side project authorization, immutable Git reads, bounded validation, digesting, and approval signing.

## Data flow

1. Studio loads the project and base commit through the existing authenticated server boundary.
2. The server loads declarative component metadata from the exact `repopress.config.json` snapshot. That metadata drives the palette, typed forms, insertion, and source editing.
3. While an MDX document changes, Studio keeps the existing generic preview immediately available and debounces compatible preview requests.
4. The compatible-preview route authenticates the user for the project, validates the requested base commit and bounded document source, and reads the configured preview entry from that exact commit.
5. The route constructs a source artifact, computes its executable digest, binds it to project, commit, session, snapshot version, renderer profile, and expiry, then signs the approval with the server-only P-256 key.
6. Studio verifies the signature with the configured public key before mounting the opaque sandbox frame.
7. The sandbox transpiles and evaluates the adapter only inside its locked worker, supplies the approved capability module, compiles the MDX, sanitizes the inert render tree, and sends only that tree to the frame renderer.
8. Stale responses are ignored by session and snapshot version. Generic preview remains visible until a compatible result for the current snapshot is verified and rendered.

The signing private key is server-only (`PREVIEW_APPROVAL_PRIVATE_KEY_JWK`). The verification key is public (`NEXT_PUBLIC_PREVIEW_APPROVAL_PUBLIC_KEY_JWK`). The existing separate preview origin remains required in production.

## Failure behavior

Every unsafe or unsupported state fails closed to Generic preview while editing remains available:

- missing or invalid preview entry;
- unsupported imports or dynamic imports;
- source graph, document, message, time, or rate limits exceeded;
- base-commit or project mismatch;
- missing signing configuration;
- invalid, expired, mismatched, or stale signature;
- unavailable framework capability;
- transpile, execute, sanitize, or render failure.

Diagnostics identify the failing stage without returning repository source, credentials, signing material, or internal exception details. Link activation, forms, popups, top navigation, network APIs, storage, timers, portals, and dynamic code remain unavailable in compatible preview.

## Merry component contracts

- `CoverImage`: `src` image/string and required `alt`; preview uses the media placeholder capability and product-owned preset labels.
- `InfoBox`: `type` enum (`info`, `tip`, `warning`) plus required MDX children.
- `Checklist`: required bounded list expression for `items`; rendered as a static semantic list.
- `CTABox`: required `title`, `description`, `buttonText`, and `buttonHref`; preview action is inert and visibly marked as a preview action.
- `LetterPaper`: optional `title`, `showStamp`, and `templateText` plus required MDX children; query construction is displayed but navigation remains inert.

The existing source serialization remains import-free because Merry's production MDX map supplies these names.

## Test strategy

### Contract and security tests

- Config accepts the five complete declarative schemas and rejects executable metadata.
- The preview capability module exposes only frozen, null-prototype approved exports.
- `Link` rejects unsafe protocols and cannot navigate the parent.
- `Image` accepts approved HTTPS/repository/media URLs and rejects credential-bearing or executable URLs.
- Preview source imports are allowlisted; framework imports such as `next/link` fail closed.
- Artifact signatures bind the exact project, base commit, source digest, session, snapshot, profile, and expiry.
- Repository adapter code never executes in the Next.js/Studio host realm.

### Component tests

- Every Merry component renders from representative props and children in the compatible worker.
- Component forms serialize the expected import-free MDX.
- Namespace and named bindings remain bounded and immutable.
- Generic fallback retains all five placeholders when compatible preview is unavailable.

### Integration and browser E2E

Using Merry Magic Mail in the real browser:

1. connect/sync the project and confirm nine posts;
2. open the Santa letter fixture and obtain `Compatible` fidelity;
3. visually verify all five components;
4. insert and edit at least one component through the form;
5. save and reload the draft;
6. publish to a real Merry branch/PR and confirm metadata plus component source are preserved;
7. close the PR unmerged, confirm lane recovery, then discard;
8. verify Merry `main` remains unchanged unless a reviewed extension-install PR is explicitly merged.

The full RepoPress test, typecheck, lint, production-build, Convex-codegen, independent-review, GitHub CI, and Vercel-preview gates remain mandatory.

## Delivery sequence

1. Add the core preview capability contract and worker shims.
2. Add the authenticated, pinned, signed compatible-preview resolution route.
3. Add Studio compatible-preview orchestration with stale-response protection and Generic fallback.
4. Add Merry's product-owned component schemas and preview entry through a separate Merry PR.
5. Run local and browser E2E, address defects, then push both repositories for review.

## Out of scope

- Executing arbitrary production repository components in RepoPress.
- Emulating complete Next.js, Astro, Remix, or server-component runtimes.
- Network access, live application data, navigation, forms, or side effects in preview.
- Arbitrary product CSS or remote media loading inside the compatible sandbox.
- A public third-party marketplace or automatic approval of unknown component code.
- Native-fidelity infrastructure.

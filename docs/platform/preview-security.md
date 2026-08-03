# Preview fidelity and security

RepoPress previews content from repositories that it does not control. Fidelity therefore cannot be a single unsafe switch. The platform reports an explicit preview grade and keeps a safe Generic result available whenever a higher-fidelity provider cannot be proven safe for the exact document snapshot.

## Fidelity grades

| Grade | Current status | What it renders | What it does not promise |
|---|---|---|---|
| Generic | Available | A bounded Markdown/MDX model with shadcn Typeset typography and placeholders for custom components | Product component appearance or execution |
| Compatible | Available | An exact signed document-plus-adapter artifact in a separately hosted, opaque-origin sandbox | Full framework runtime, Server Components, loaders, arbitrary CSS, callbacks, or pixel identity |
| Native | Reserved | A future managed-native runner or external bridge selected by trusted server facts | Not included in the current implementation |

`Compatible` means the product's MDX vocabulary has a safe structural mapping. It does not mean that the production application is running inside Studio.

## Generic preview

Generic preview never executes repository imports. It parses a bounded subset into a render model and displays ordinary Markdown with Typeset rhythm. Unknown MDX components remain visible as named placeholders so an author can see where product-specific content occurs.

Generic is the initial and fallback state while Compatible approval is loading, unavailable, expired, malformed, or downgraded. A failed higher-fidelity attempt must not replace it with a blank or partially trusted surface.

## Compatible preview pipeline

The Compatible path has several independent checks:

1. The authenticated route resolves the Convex project and requires editor access.
2. GitHub must confirm that the requested base commit is still the project's current branch head.
3. The configured adapter entry is read from that exact commit.
4. The adapter must be one bounded file importing only React JSX runtimes and `@repopress/preview`.
5. The exact document and adapter bytes are hashed into an executable digest.
6. The server signs project, tenant, commit, path, session, snapshot, profile, expiry, and digest with ECDSA P-256.
7. Studio verifies the public-key signature and expected authority before mounting the artifact.
8. The sandbox independently reassembles, hashes, and checks the artifact before giving it to a short-lived worker.
9. The worker output is sanitized again into a bounded inert render tree before React creates DOM.

The adapter is never imported into the Studio/Next.js host realm. Approval applies to one exact project, commit, document path, session, and snapshot; it cannot be moved to a different draft.

## Sandbox containment

The Compatible frame is hosted on a separate configured HTTPS origin and mounted with:

```html
sandbox="allow-scripts"
```

Because `allow-same-origin` is absent, the child has an opaque origin. Communication uses a session/snapshot-bound `MessagePort` and a one-time random capability. The sandbox route's Content Security Policy starts from `default-src 'none'`, disables network connections and form actions, forbids nested frames, and permits only the self-contained script/worker path required by the renderer.

Repository code cannot receive the host DOM, cookies, auth token, project capability, GitHub token, filesystem, network, timers, portals, navigation, or application runtime. Unsupported imports and active behavior fail closed or record a bounded fidelity loss.

## The static-inert profile

`static-inert-v1` names the Compatible renderer's capability profile. It is a security property, not automatically an issue.

The profile accepts semantic layout primitives such as:

- `PreviewDocument`, `PreviewBox`, `PreviewStack`, and `PreviewInline`;
- `PreviewText`, `PreviewList`, and `PreviewIcon`;
- `PreviewImage` and `PreviewPaper`; and
- the controlled `PreviewAction` described below.

Raw event props, refs, styles, dangerous HTML, forms, anchors, media/frame/network elements, and active markup are removed or rejected. Actual fidelity losses appear as diagnostics. A clean static-inert render should be shown as a neutral `Safe preview`, not as an error count.

## Controlled action simulation

Studio provides one deliberately narrow interaction so authors can understand a call to action without letting repository behavior escape containment.

The adapter may declare:

```tsx
<PreviewAction label="Write a letter" href="/letters" tone="primary" />
```

The worker emits a dedicated inert action node—not an HTML anchor or a repository-provided button. The sanitizer accepts a bounded label, an approved tone, and an optional validated destination. Accepted destinations are:

- repository-relative or root-relative paths; and
- absolute HTTPS URLs with a valid bounded authority.

JavaScript/data URLs, protocol-relative URLs, credentials, control characters, unsafe authorities, and oversized values are rejected or omitted.

The sandbox renders its own local button. Clicking it shows an in-sandbox explanation such as `Published action: would open /letters`. It never:

- changes `window.location`;
- submits a form;
- performs a fetch;
- opens a tab or window;
- sends the action to the parent for execution; or
- calls repository code.

This preserves the important authoring feedback—“this button goes there”—without turning a preview into a second browsing context. The product's real component remains responsible for actual navigation after content is published.

### Updating an action

Declare the label and destination as ordinary string props in component metadata, for example `buttonText` and `buttonHref`. Map them to `PreviewAction` in the Compatible adapter. Studio then updates the exact literal MDX attributes through its source-preserving prop form.

Do not declare `onClick`, callback, function, target/window, or executable expression props for Compatible behavior. They are not supported and are never simulated.

## Images

The sandbox cannot fetch images. `PreviewImage` emits a repository-relative or HTTPS source reference. The authenticated Studio host:

1. validates the reference and project authority;
2. retrieves bytes outside the sandbox;
3. enforces MIME, byte, concurrency, rate-window, and decoded-pixel budgets; and
4. transfers approved bytes over the authenticated port.

The sandbox creates short-lived `blob:` URLs and revokes them when replaced or disposed. Its CSP does not permit HTTP(S) image fetches. Failed or over-budget images become explicit placeholders rather than relaxing the boundary.

## What adapters may import

The first Compatible profile allows exactly:

- `react`;
- `react/jsx-runtime`;
- `react/jsx-dev-runtime`; and
- `@repopress/preview`.

It rejects relative imports, dynamic imports, `require`, import metadata, framework packages, product components, and data clients. This is currently a single-file pilot even though the signed artifact schema is capable of describing a bounded source map.

## Diagnostics and downgrade

A fidelity badge tells the author whether the active result is Generic or Compatible. The static-inert profile is separate from diagnostic warnings. Diagnostics are reserved for concrete events such as:

- an unavailable or untrusted Compatible artifact;
- unsupported imports or browser capabilities;
- sanitized events, forms, navigation, frames, media, styles, or active content;
- worker/compile/render failure; or
- image delivery failure.

If verification, compilation, execution, or rendering fails, Studio tears down that attempt and keeps the Generic result. It must not retry by executing repository source in the host.

## Deployment requirements

Compatible production preview requires:

- a separate `NEXT_PUBLIC_PREVIEW_ORIGIN` serving only the sandbox deployment role;
- a server-only `PREVIEW_APPROVAL_PRIVATE_KEY_JWK` on the Studio deployment;
- the matching browser-readable `NEXT_PUBLIC_PREVIEW_APPROVAL_PUBLIC_KEY_JWK`;
- the same `REPOPRESS_CAPABILITY_SECRET` in Next.js and Convex; and
- strict sandbox response headers.

The private signing key and capability secret must never be exposed as public environment variables. The Studio and preview origins must not be the same in production.

## Security invariants for contributors

When extending preview behavior:

1. add a declarative node or primitive instead of exposing a raw DOM/API capability;
2. validate and bound it independently in the worker and render-tree sanitizer;
3. keep all resulting state local to the sandbox;
4. add negative tests for events, navigation, network, forms, malformed values, oversized values, and stale authority;
5. preserve Generic fallback; and
6. do not add host-realm imports of repository adapters or components.

See [Component authoring](./component-authoring.md) for the extension format and [Build a component extension](../tutorials/build-a-component-extension.md) for a complete example.

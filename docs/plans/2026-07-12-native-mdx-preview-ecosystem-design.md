# Native MDX Preview and Component Ecosystem Design

> Status: Ratified design
> Date: 2026-07-12

## Summary

RepoPress will treat faithful MDX rendering as a core product capability. The strategic preview path runs a connected repository's actual framework runtime in an isolated environment. Faster compatibility and generic previews remain available as explicit degraded modes so editing never depends on a successful native runtime.

The user repository owns executable component code. RepoPress discovers or installs that code, provides a schema-driven authoring experience, overlays unpublished drafts, and coordinates rendering without importing repository components into the RepoPress application runtime.

## Product Principles

1. Git is the source of truth for published content, component source, portable project declarations, and installed registry code.
2. Convex stores operational state: drafts, history, review state, pending file and media operations, preview sessions, trust decisions, and derived runtime profiles.
3. Native rendering is the product promise. Browser compatibility rendering and generic rendering are honest fallback grades.
4. A preview failure must never block editing, saving, reviewing, or publishing.
5. Repository code is hostile until isolated and explicitly trusted at an exact executable graph digest.
6. Rendering truth and authoring metadata are separate contracts. Metadata may describe a component but never replace its implementation.
7. Components are source-owned registry items. The term plugin is reserved for privileged editor, workflow, provider, or server extensions.

## Sources of Truth

| Concern | Source of truth |
| --- | --- |
| Published content and assets | Git |
| Component implementations and styles | User repository |
| Portable project declarations and explicit overrides | Optional `repopress.config.json` |
| Installed registry versions and integrity | `repopress.lock.json` |
| Draft content and workflow state | Convex |
| Pending file and media operations | Convex |
| Runtime detection results | Derived cache in Convex |
| Preview trust and session state | Convex |

`repopress.config.json` remains optional and lightweight. It may declare projects, content roots, registry namespaces, install aliases, CSS targets, and exceptional runtime overrides. It must not contain drafts, membership, credentials, generated component catalogs, or cached runtime output. Setup must not generate `.repopress/mdx-preview.tsx` by default.

## Preview Fidelity Ladder

RepoPress exposes three preview grades:

### Generic

- Parses safe Markdown and structural MDX.
- Uses RepoPress-owned components, shadcn/typeset, and localized placeholders.
- Executes no repository code.
- Always available.

### Compatible

- Bundles browser-safe React component graphs.
- Supports explicitly compatible npm dependencies, CSS, assets, hooks, and browser APIs.
- Runs only in a separate-origin sandboxed iframe.
- Cannot claim fidelity for Server Components, framework loaders, Astro compilation, or arbitrary provider context.

### Native

- Runs the repository's actual Next.js, Fumadocs, Astro, or future framework runtime.
- Uses the repository's pinned dependencies, CSS pipeline, layouts, providers, component maps, and framework transforms.
- Runs through either a managed isolated runner or a repository-owned preview bridge.

Studio always displays the active fidelity grade and structured reasons for any downgrade. A compatible or generic preview can appear immediately while a native preview cold-starts, then upgrade in place without replacing editor state.

## Preview Provider Architecture

Every preview strategy implements the same provider contract.

```ts
type PreviewFidelity = "generic" | "compatible" | "native"

type PreviewRequest = {
  filePath: string
  snapshotVersion: number
  base: {
    ref: string
    commitSha: string
  }
  document: {
    contentType: "md" | "mdx"
    body: string
    metadata: Record<string, unknown>
  }
  overlay: FileOverlayOperation[]
  viewport: {
    width: number
    height: number
  }
  theme?: "light" | "dark" | "system"
}

type PreviewResult = {
  fidelity: PreviewFidelity
  sessionId: string
  snapshotVersion: number
  status: "queued" | "building" | "ready" | "failed" | "expired"
  target:
    | { kind: "sandboxed-iframe"; url: string }
    | { kind: "safe-fallback"; renderModel: GenericRenderModel }
  diagnostics: PreviewDiagnostic[]
  downgradeReasons: string[]
  cache: { hit: boolean }
}

type PreviewSessionEvent = {
  sessionId: string
  snapshotVersion: number
  sequence: number
  type: "status" | "target" | "diagnostics" | "fidelity" | "expired"
  payload: unknown
}
```

`PreviewRequest` is an internal server-constructed value, not a client authority. The orchestrator derives repository coordinates, authorized base refs, and project identity from the authenticated project. It verifies membership and role when creating, updating, streaming, or terminating a session. Every session binds the tenant, user, project, base commit, snapshot version, and executable digest. Stale or out-of-order events are ignored by monotonically increasing snapshot versions and event sequences.

Initial providers:

- `ManagedNativeProvider`: materializes the repository and runs its framework in an ephemeral isolated environment.
- `ExternalBridgeProvider`: embeds a registered repository-owned preview endpoint after a signed handshake attests the requested commit, overlay digest, executable digest, runtime adapter version, and rendered route.
- `CompatibleBundleProvider`: builds a browser-compatible bundle and serves it from the sandbox origin.
- `GenericTypesetProvider`: renders the safe fallback model inside Studio.

Provider selection prefers an available, trusted native provider, falls back to compatible mode for browser-safe graphs, and finally uses generic mode. Selection and downgrade are observable rather than hidden.

## Runtime Profile

Detection produces data, not executable code.

```ts
type RuntimeProfile = {
  framework: "next" | "fumadocs" | "astro" | "generic"
  frameworkVersion?: string
  runtimeRoot: string
  contentRoots: string[]
  packageManager?: "npm" | "pnpm" | "yarn" | "bun"
  lockfilePath?: string
  componentEntrypoints: string[]
  styleEntrypoints: string[]
  capabilities: {
    clientComponents: boolean
    serverComponents: boolean
    css: boolean
    portals: boolean
    astroIslands: boolean
  }
  detection: {
    confidence: number
    evidence: string[]
  }
}
```

Framework adapters own detection, commands, readiness checks, content-path-to-preview-route mapping, and diagnostic parsing. Next.js and Fumadocs are the first native targets. Astro uses Astro itself and is not emulated through React component maps.

A provider earns the native grade only when content renders through the repository's real route, layout, provider, and framework compilation chain, or an explicitly declared equivalent whose differences are disclosed. Merely launching the framework or injecting a standalone MDX route is compatible, not native.

## Rendering and Authoring Contracts

### RenderBindings

`RenderBindings` is the framework-neutral name for the real executable bindings resolved by the repository's native runtime. It exists only inside the isolated preview environment.

Sources include:

- `mdx-components.tsx` and equivalent component maps.
- Fumadocs defaults and project component maps.
- Astro compiler imports, content collection renderers, integrations, `Content`/`components` bindings, and island directives.
- Explicit document imports.
- Registry-installed component source.
- An explicit runtime override when native detection is insufficient.

For Next.js and Fumadocs, the adapter implementation may expose React/MDX component maps. Astro bindings remain compiler inputs rather than pretending `.astro` files are React-style runtime functions. RepoPress Studio never serializes executable bindings or imports them into its own application runtime.

### AuthoringCatalog

Studio consumes a declarative catalog:

```ts
type AuthoringComponent = {
  logicalId: string
  mdxName: string
  displayName: string
  description?: string
  category?: string
  import?: {
    source: string
    exportName: string
  }
  runtime: "client" | "server" | "astro"
  props: AuthoringProp[]
  slots: AuthoringSlot[]
  previewFixtures: string[]
  provenance: {
    source: "native" | "registry" | "manual"
    registryItem?: string
    version?: string
    integrity?: string
  }
}
```

The prop model supports string, number, integer, boolean, enum, structured array/object values, and formats such as URL, asset, date, color, and code. JavaScript expressions remain opaque expert values. Slots declare whether they accept text, Markdown, arbitrary MDX, or constrained child components.

Catalog discovery precedence is:

1. Registry metadata.
2. Explicit colocated authoring manifest.
3. Framework-native metadata.
4. Static component analysis.
5. Conservative inferred fallback.

Inferred entries are labeled incomplete and cannot silently invent required props or normalize existing source.

## Registry Model

RepoPress uses standard shadcn registry items and extends them through `meta.repopress` rather than inventing a parallel distribution format.

```json
{
  "name": "callout",
  "type": "registry:component",
  "files": [],
  "dependencies": [],
  "registryDependencies": [],
  "meta": {
    "repopress": {
      "apiVersion": 1,
      "kind": "mdx-component",
      "logicalId": "repopress.callout",
      "mdxName": "Callout",
      "exportName": "Callout",
      "frameworks": ["next", "fumadocs"],
      "authoring": {},
      "preview": {}
    }
  }
}
```

Installation resolves dependencies, checks compatibility, produces a dry-run diff, creates a branch and pull request, updates the native component map, writes a lock snapshot, and validates fixtures. It never writes directly to the base branch.

`repopress.lock.json` records the resolved registry address and ref, integrity, dependency graph, installed targets, component metadata, and local modification state. Updates are reviewed diffs and never overwrite edited installed files silently.

Framework-specific variants can share a logical component identity. RepoPress promises a stable semantic authoring contract, not necessarily identical component source across every framework.

## Source Preservation

The content adapter owns parsing and serialization. Component insertion and editing operate on an MDX AST.

RepoPress may change only declared props and slots selected by the user. Unknown attributes, expressions, imports, exports, comments, whitespace-sensitive children, and unsupported syntax must remain unchanged. Edits are surgical and fail closed: when the content adapter cannot prove preservation, it refuses the form edit and leaves the source untouched. Existing documents are never round-tripped through the form model as a whole.

The decision to use explicit imports or a global component map belongs to the framework adapter. Asset props serialize stable repository-relative or content-relative references, not temporary Blob or signed preview URLs. Preview providers resolve those references for display.

## Preview Lifecycle

Common orchestration:

1. Authenticate the principal and authorize project access.
2. Derive repository coordinates, allowed base ref, base commit, and canonical content-relative file path on the server.
3. Detect or load the cached `RuntimeProfile`.
4. Calculate the resolved executable closure and evaluate trust.
5. Select a provider and create a tenant/user/project/commit/digest-bound session.
6. Stream ordered session state, diagnostics, and fidelity changes.
7. Apply later drafts only when their snapshot version is newer.
8. Terminate on expiry, membership loss, explicit teardown, or resource policy and discard writable state.

Provider branches:

- Managed native: safely materialize the commit and overlay, restore dependencies, start the framework adapter, and expose it through the authenticated preview gateway.
- External bridge: contact only the owner-registered origin, complete a nonce-bound signed handshake, and accept the result only when its commit, overlay, executable digest, adapter version, and route attestation match the request.
- Compatible bundle: resolve and compile the bounded browser-safe graph inside isolation, publish immutable assets to the sandbox origin, and start the iframe protocol.
- Generic: create a sanitized render model without executing repository code.

The canonical stored document path is relative to `contentRoot`. Conversion to a repository-relative path occurs only at the Git provider boundary.

## Trust and Isolation

MDX and repository components are executable code. Current same-origin `new Function` evaluation is not an acceptable security boundary and must be retired.

Compatible previews run on a separate origin in an iframe with `sandbox="allow-scripts"`. They do not receive same-origin access, forms, popups, top navigation, RepoPress credentials, or unrestricted networking. Because omitting `allow-same-origin` produces an opaque `"null"` origin, the host authenticates the exact iframe `WindowProxy`, then transfers a `MessageChannel` using an unguessable single-use session capability. The channel enforces versioned schemas, sequence and snapshot counters, replay rejection, message rate and size limits, rotation, and teardown invalidation. Reusable credentials never appear in iframe URLs.

All hostile execution—including package lifecycle scripts, Git dependencies, framework configuration, detection that loads code, bundling, code generation, fixture validation, readiness commands, and preview serving—occurs inside hardened isolation. The required boundary is a microVM or gVisor-class sandbox with user, mount, network, and PID isolation; dropped capabilities; seccomp; a read-only root; no host sockets, devices, credentials, or host mounts; bounded tmpfs; and hard cgroup, process, output, and wall-clock limits. Installation and serving use fresh isolated phases connected only by immutable verified artifacts.

Repository materialization rejects absolute paths, `..`, archive traversal, symlink/hardlink escapes, unapproved submodules, and paths outside the authorized repository snapshot before mounting an overlay. Serving egress is default-deny through a mandatory proxy that blocks loopback, private, link-local, metadata/control-plane, non-HTTP file/socket protocols, DNS rebinding, and redirects to denied destinations. Installation can access only approved pinned registries and artifacts with lockfile integrity enforcement and no ambient credentials. Repository configuration cannot widen egress; exceptions are owner-approved capabilities bound to the exact executable digest.

Trust binds to the resolved transitive executable closure, including imported JS/TS/MDX helpers, expressions, framework and MDX plugins, configuration, code-generation inputs, CSS/build inputs, package manifests, lockfiles, installed registry files, and preview overrides. A parsed non-executable Markdown-only edit may retain trust; MDX or any overlay capable of changing runtime behavior participates in the digest. Classification follows parsed syntax and dependency closure, never file extension alone. Every executable provider, including compatible mode, requires approval for its exact digest. Executable changes invalidate approval and show an owner/admin the relevant diff and capabilities. Pull-request branches are never automatically trusted.

Per-session preview origins are reachable only through an authenticated gateway using short-lived user/session-bound authorization. Runners are never directly reachable. Responses use `Cache-Control: no-store`, restrictive CSP, CORS, and referrer policies, and access terminates immediately on membership loss or teardown. Studio cookies and authorization headers are never forwarded to repository code.

External bridge origins require owner registration, HTTPS, and proof of control. Endpoints are not supplied per request. URL resolution and every redirect are canonicalized and checked against private/metadata destinations and DNS rebinding. Signed bridge requests bind audience, tenant, project, commit, overlay and executable digests, expiry, and a single-use nonce with replay storage. Browser ambient cookies are not used as preview authorization.

## Caching

Native preview caching has three immutable, authorization-checked layers:

1. Dependency layer: runner image, package manager, and lockfile digest.
2. Repository layer: base commit, runtime profile, framework config, and executable graph digest.
3. Draft layer: document snapshot and overlay digest.

Private repository and draft layers are tenant/repository scoped, encrypted, never client-addressable, and promoted only after a trusted successful job. Shared dependency caches contain verified public artifacts only, not installation output or repository-generated files. Keys include package-manager and runtime versions, platform, registry identity/configuration, patches, workspaces, artifact integrity, and the preview compiler/runner version. Failed or untrusted jobs cannot promote cache entries. Writable job state is never shared between sessions or repositories.

## Diagnostics and Failure Behavior

```ts
type PreviewDiagnostic = {
  stage:
    | "detect"
    | "resolve"
    | "install"
    | "compile"
    | "execute"
    | "render"
    | "asset"
  severity: "info" | "warning" | "error"
  code: string
  message: string
  file?: string
  line?: number
  column?: number
  importChain?: string[]
  recoverable: boolean
  fidelityImpact?: PreviewFidelity
}
```

- Missing components render localized placeholders.
- Missing dependencies produce installation guidance or a downgrade.
- Native runner timeouts retain the compatible or generic preview.
- Unsupported Server Components render placeholders in compatible mode.
- Asset failures preserve layout and display the unresolved reference.
- Untrusted executable changes keep the preview in generic mode until approved.
- No preview error prevents content editing, saving, review transitions, or publishing.

## Testing and Acceptance

### Contract tests

- All preview providers pass the same request/result contract suite.
- Stale and out-of-order draft/session events are ignored, and editor state survives target and fidelity swaps.
- Runtime profile detection fixtures cover monorepos, nested roots, aliases, and ambiguous evidence.
- External bridges must attest the requested commit, overlay digest, executable digest, adapter version, and real rendered route; stale or mismatched responses downgrade.
- Registry metadata validates independently of executable component loading.
- No-op AST serialization is byte-equivalent. Localized edits preserve untouched props, expressions, imports, exports, comments, whitespace, and child MDX; unsupported edits fail closed.
- Canonical path fixtures cover an empty root, nested content root, duplicate-prefix prevention, `..` rejection, archive traversal, symlink/hardlink escape, and unapproved submodules.

### Native framework fixtures

- Next.js: local imports, npm dependency, global CSS, CSS module, `next/image`, `next/link`, client hook, portal, nested real-route layouts/providers, and one Server Component.
- Fumadocs: default MDX components, project overrides, code highlighting/plugin transform, and collection-derived context.
- Astro: `.astro` component, React island with client directive, scoped CSS, and collection content.

### Security tests

- Preview code cannot read RepoPress cookies, DOM, storage, credentials, or parent window state.
- Preview code cannot navigate or submit through the parent application.
- Malformed, replayed, out-of-order, rate-exceeding, or oversized preview messages are rejected.
- Infinite loops, process spawning, excessive output, and oversized bundles are terminated or capped.
- Import graphs have bounded node, byte, and configurable depth limits with cycle handling, path-traversal rejection, and structured limit diagnostics.
- Indirectly imported component, plugin, config, CSS build input, and executable MDX changes invalidate trust. Parsed non-executable Markdown-only changes may retain it.
- Cross-project and cross-tenant session, cache, gateway URL, and overlay access is denied, including expired and replayed URLs.
- SSRF tests cover loopback, private/link-local/metadata addresses, DNS rebinding, redirect hops, and non-HTTP protocols for managed and bridge providers.

### Product acceptance

- The fidelity badge and downgrade reason are always visible.
- Generic preview remains available during native cold starts and failures.
- An official Callout or CTA installs through a PR, updates the native runtime map, appears in the palette, inserts and edits through its schema, renders its real implementation, preserves source, and publishes successfully.
- Preview session teardown leaves no repository or draft data in writable shared state.

## Delivery Sequence

1. Define preview provider, fidelity, runtime profile, diagnostic, and trust contracts.
2. Salvage runtime detection, metadata preservation, alias traversal, and graceful diagnostic work from the existing native-runtime branch. Label this path compatible rather than native.
3. Move browser compilation and rendering to the separate-origin sandbox.
4. Split the current component registry into framework-neutral `RenderBindings` and `AuthoringCatalog`.
5. Define `meta.repopress` v1 and the lockfile schema.
6. Prove one official component through install, discover, insert, edit, preview, preserve, and publish.
7. Add `PreviewProvider` orchestration and a managed native runner for Next.js and Fumadocs.
8. Add an Astro native runner.
9. Add the external preview bridge as an alternate native provider.

## Non-Goals for the First Ecosystem Slice

- Marketplace discovery, billing, ratings, or publisher profiles.
- Arbitrary backend, workflow, or AI plugins.
- Automatic component updates.
- Universal cross-framework source compatibility.
- Production secret injection into preview environments.
- Replacing Convex or extracting a provider-neutral state layer.
- Postgres/self-hosting work unrelated to preview contracts.

## Prerequisites and Known Debt

- Preserve and separately commit the uncommitted login/auth work in the primary checkout.
- Standardize on npm and one root lockfile before runner package-manager detection is generalized.
- Resolve current high and critical dependency audit findings as a dedicated compatibility/security effort.
- Fix tests that make unintended live GitHub requests.
- Add canonical content-relative path enforcement and fixtures before applying draft overlays.
- Do not merge the existing stacked runtime/design pull requests as a unit; salvage reviewed commits into focused branches.

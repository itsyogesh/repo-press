# Native MDX Preview Ecosystem Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship the first safe RepoPress component-ecosystem slice: explicit preview fidelity contracts, an always-safe Typeset fallback, isolated compatible rendering, a declarative authoring catalog, shadcn-compatible component metadata, and one Callout installed and authored end to end.

**Architecture:** RepoPress keeps executable repository code outside its application realm. Studio consumes serializable preview/session and authoring contracts; generic previews render a safe model, while compatible previews execute only inside an opaque-origin sandbox. Real component implementations remain repository-owned and registry-installed. A managed native Next.js/Fumadocs runner is the next infrastructure milestone after this slice proves the contracts and ecosystem loop.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, Convex, `@mdx-js/mdx`, mdast/unified utilities, shadcn registry schema conventions, Vitest, Tailwind CSS v4.

---

## Scope and sequencing constraints

- Work only in the dedicated `docs/mdx-native-preview-architecture` worktree/branch or a child implementation branch.
- Preserve the dirty primary checkout and its login/auth changes.
- Do not merge PRs #39, #40, #41, or #42 wholesale. Port reviewed runtime-resolution pieces task by task.
- Do not introduce a managed container/microVM runner in this plan. The provider contract must make that the next additive milestone.
- No repository-supplied code may execute in the Studio window after Task 10.
- Use test-driven development and commit after every task.

### Task 1: Add preview domain contracts

**Files:**
- Create: `lib/preview/contracts.ts`
- Create: `lib/preview/__tests__/contracts.test.ts`

**Step 1: Write the failing schema tests**

Cover:

- Fidelity accepts only `generic`, `compatible`, and `native`.
- Session status accepts only `queued`, `building`, `ready`, `failed`, and `expired`.
- A result exposes no raw cache key or credential.
- Diagnostics require stage, severity, code, message, and recoverability.
- Session events require positive snapshot and sequence numbers.

```ts
import { describe, expect, it } from "vitest"
import { previewResultSchema, previewSessionEventSchema } from "../contracts"

describe("preview contracts", () => {
  it("rejects invalid fidelity and raw cache keys", () => {
    const base = {
      fidelity: "generic",
      sessionId: "session-1",
      snapshotVersion: 1,
      status: "ready",
      target: { kind: "safe-fallback", renderModel: { blocks: [] } },
      diagnostics: [],
      downgradeReasons: [],
      cache: { hit: false },
    }

    expect(previewResultSchema.safeParse({ ...base, fidelity: "exact" }).success).toBe(false)
    expect(
      previewResultSchema.safeParse({
        ...base,
        cache: { hit: false, key: "must-not-be-client-visible" },
      }).success,
    ).toBe(false)
  })

  it("requires ordered session events", () => {
    expect(
      previewSessionEventSchema.safeParse({
        sessionId: "session-1",
        snapshotVersion: 0,
        sequence: 0,
        type: "status",
        payload: { status: "ready" },
      }).success,
    ).toBe(false)
  })
})
```

**Step 2: Run the test and verify failure**

Run: `npx vitest run lib/preview/__tests__/contracts.test.ts`

Expected: FAIL because `lib/preview/contracts.ts` does not exist.

**Step 3: Implement the minimal contracts**

Export Zod schemas and inferred TypeScript types for:

- `PreviewFidelity`
- `PreviewDiagnostic`
- `GenericRenderModel`
- `PreviewRequest`
- `PreviewResult`
- `PreviewSessionEvent`
- `RuntimeProfile`

Use strict object schemas so credential- or cache-like unknown fields are rejected rather than stripped. Keep `PreviewRequest` explicitly documented as an internal, server-constructed value. Do not include tenant, user, project, repository, or provider selection as client-authoritative fields.

**Step 4: Run focused tests**

Run: `npx vitest run lib/preview/__tests__/contracts.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/preview/contracts.ts lib/preview/__tests__/contracts.test.ts
git commit -m "feat(preview): define fidelity and session contracts"
```

### Task 2: Implement ordered preview session state and provider selection

**Files:**
- Create: `lib/preview/session-state.ts`
- Create: `lib/preview/provider-selection.ts`
- Create: `lib/preview/__tests__/session-state.test.ts`
- Create: `lib/preview/__tests__/provider-selection.test.ts`

**Step 1: Write failing reducer tests**

Test that:

- Lower snapshot versions are ignored.
- Duplicate or lower event sequences are ignored.
- A compatible target can upgrade to native without clearing editor-owned state.
- An expired session accepts no later events.

```ts
const initial = createPreviewSessionState({ editorRevision: "draft-local-7" })
const compatible = reducePreviewEvent(initial, event({ snapshotVersion: 2, sequence: 1, fidelity: "compatible" }))
const native = reducePreviewEvent(compatible, event({ snapshotVersion: 2, sequence: 2, fidelity: "native" }))

expect(native.fidelity).toBe("native")
expect(native.editorRevision).toBe("draft-local-7")
expect(reducePreviewEvent(native, event({ snapshotVersion: 1, sequence: 99 }))).toBe(native)
```

**Step 2: Run the tests and verify failure**

Run: `npx vitest run lib/preview/__tests__/session-state.test.ts lib/preview/__tests__/provider-selection.test.ts`

Expected: FAIL because the modules do not exist.

**Step 3: Implement pure state and selection functions**

Provider selection order:

1. Trusted and available native provider.
2. Trusted and compatible browser bundle.
3. Generic provider.

Return explicit downgrade reason codes such as `NATIVE_UNAVAILABLE`, `EXECUTABLE_DIGEST_UNTRUSTED`, and `BROWSER_CAPABILITY_UNSUPPORTED`.

**Step 4: Run focused tests**

Run the command from Step 2.

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/preview/session-state.ts lib/preview/provider-selection.ts lib/preview/__tests__
git commit -m "feat(preview): order session updates and select providers"
```

### Task 3: Enforce canonical content-relative paths and safe overlays

**Files:**
- Create: `lib/preview/path-policy.ts`
- Create: `lib/preview/overlay-policy.ts`
- Create: `lib/preview/__tests__/path-policy.test.ts`
- Create: `lib/preview/__tests__/overlay-policy.test.ts`
- Modify: `lib/explorer-tree-overlay.ts`
- Modify: `app/api/github/publish-ops/route.ts`

**Step 1: Write failing path-policy tests**

Cover empty and nested content roots, duplicate-prefix prevention, absolute paths, `..`, backslashes, NUL bytes, and symlink/hardlink/archive metadata represented by overlay entries.

```ts
expect(toRepoPath("content/docs", "guide/start.mdx")).toBe("content/docs/guide/start.mdx")
expect(toRepoPath("content/docs", "content/docs/guide/start.mdx")).toBe("content/docs/guide/start.mdx")
expect(() => assertContentPath("../secrets.mdx")).toThrow("escapes content root")
```

**Step 2: Run tests and verify failure**

Run: `npx vitest run lib/preview/__tests__/path-policy.test.ts lib/preview/__tests__/overlay-policy.test.ts`

Expected: FAIL because the policy modules do not exist.

**Step 3: Implement canonical helpers**

Provide one conversion boundary:

```ts
assertContentPath(contentRelativePath)
toRepoPath(contentRoot, contentRelativePath)
toContentPath(contentRoot, repositoryRelativePath)
validateOverlayOperations(operations)
```

Update publishing and explorer helpers to call these functions rather than conditionally prefixing paths.

**Step 4: Run path, publish, and explorer tests**

Run: `npx vitest run lib/preview/__tests__ app/api/github/publish-ops/__tests__/route.test.ts lib/__tests__/publish-hardening.test.ts lib/__tests__/media-ops-source-file-path.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/preview lib/explorer-tree-overlay.ts app/api/github/publish-ops/route.ts app/api/github/publish-ops/__tests__
git commit -m "fix(paths): enforce content-relative document paths"
```

### Task 4: Build the safe generic render model and adopt shadcn/typeset

**Files:**
- Create: `lib/preview/generic-render-model.ts`
- Create: `lib/preview/__tests__/generic-render-model.test.ts`
- Create: `components/mdx-runtime/GenericPreview.tsx`
- Create: `components/mdx-runtime/__tests__/GenericPreview.test.tsx`
- Create: `app/typeset.css`
- Modify: `app/globals.css`
- Modify: `components/studio/preview.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`

**Step 1: Write failing safe-model tests**

Verify that headings, paragraphs, lists, links, images, code, tables, and blockquotes become serializable blocks while JSX tags become placeholders. Imports, exports, expressions, event handlers, and raw HTML must not execute or become trusted HTML.

```ts
const model = buildGenericRenderModel('# Hello\n\n<Chart data={loadSecret()} />')
expect(model.blocks).toContainEqual(expect.objectContaining({ type: "heading", text: "Hello" }))
expect(model.blocks).toContainEqual(expect.objectContaining({ type: "component-placeholder", name: "Chart" }))
expect(JSON.stringify(model)).not.toContain("loadSecret()")
```

**Step 2: Run tests and verify failure**

Run: `npx vitest run lib/preview/__tests__/generic-render-model.test.ts components/mdx-runtime/__tests__/GenericPreview.test.tsx`

Expected: FAIL because the model and component do not exist.

**Step 3: Add direct parser dependencies if required**

Use explicit direct dependencies for the selected mdast parser utilities rather than relying on transitive packages. Run `npm install <exact-packages>` and confirm only `package.json` and `package-lock.json` change.

**Step 4: Implement the model and renderer**

- Parse using RepoPress-controlled plugins only.
- Produce React elements from the serializable model; never use `dangerouslySetInnerHTML`.
- Copy the owned shadcn/typeset CSS into `app/typeset.css` and add `typeset-preview` and `typeset-editor` presets using RepoPress tokens.
- Replace `prose` on the generic Studio preview with `typeset typeset-preview`.
- Preserve `not-typeset` escape behavior for RepoPress-owned placeholders.

**Step 5: Run tests and lint targeted files**

Run:

```bash
npx vitest run lib/preview/__tests__/generic-render-model.test.ts components/mdx-runtime/__tests__/GenericPreview.test.tsx
npx biome check app/typeset.css app/globals.css lib/preview/generic-render-model.ts components/mdx-runtime/GenericPreview.tsx
```

Expected: PASS with no errors.

**Step 6: Commit**

```bash
git add package.json package-lock.json app/typeset.css app/globals.css lib/preview components/mdx-runtime components/studio/preview.tsx
git commit -m "feat(preview): add safe Typeset fallback"
```

### Task 5: Split executable render bindings from the authoring catalog

**Files:**
- Create: `lib/preview/render-bindings.ts`
- Create: `lib/studio/authoring-catalog.ts`
- Create: `lib/studio/__tests__/authoring-catalog.test.ts`
- Modify: `lib/studio/component-registry.ts`
- Modify: `lib/studio/component-catalog.ts`
- Modify: `lib/studio/component-node.ts`
- Modify: `lib/studio/component-insert-operation.ts`
- Modify: `components/studio/component-insert-modal.tsx`
- Modify: `components/studio/component-prop-form.tsx`
- Modify: `components/studio/insert-jsx-button.tsx`
- Modify: relevant tests under `lib/studio/__tests__/`

**Step 1: Write failing catalog separation tests**

Require that:

- The catalog is built only from serializable metadata.
- A React function can be present in `RenderBindings` without entering Studio state.
- Native components without metadata appear as `schemaStatus: "incomplete"` rather than guessed framework schemas.
- Config metadata cannot supply executable implementation truth.
- Adding one configured component does not hide other discovered native names.

**Step 2: Run tests and verify failure**

Run: `npx vitest run lib/studio/__tests__/authoring-catalog.test.ts lib/studio/__tests__/component-registry.test.ts lib/studio/__tests__/component-catalog.test.ts`

Expected: FAIL against the current merged `ComponentRegistry` behavior.

**Step 3: Implement the split**

Move the serializable types to `authoring-catalog.ts` and define:

```ts
type AuthoringComponent = {
  logicalId: string
  mdxName: string
  runtime: "client" | "server" | "astro"
  schemaStatus: "complete" | "incomplete"
  props: AuthoringProp[]
  slots: AuthoringSlot[]
  provenance: AuthoringProvenance
}
```

Keep `render-bindings.ts` framework-neutral and sandbox-only. Remove function inspection and framework-name schema guessing from the authoring path. Retain a temporary deprecated `buildComponentRegistry` wrapper only if needed to keep commits reviewable, then remove it in Task 13.

**Step 4: Run the Studio unit suite**

Run: `npx vitest run lib/studio/__tests__ components/studio/__tests__/component-prop-form.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/preview/render-bindings.ts lib/studio components/studio
git commit -m "refactor(studio): separate rendering from authoring metadata"
```

### Task 6: Define `meta.repopress` and lockfile schemas

**Files:**
- Create: `lib/repopress/registry-schema.ts`
- Create: `lib/repopress/lock-schema.ts`
- Create: `lib/repopress/__tests__/registry-schema.test.ts`
- Create: `lib/repopress/__tests__/lock-schema.test.ts`
- Modify: `lib/config-schema.ts`
- Modify: `lib/repopress/__tests__/config-writer.test.ts`

**Step 1: Write failing schema tests**

Test the full authoring fields currently stripped by `lib/config-schema.ts`: required, description, options, placeholder, version, display name, assets, slots, runtime, fixtures, and provenance. Reject executable code strings in metadata fields and unknown API versions.

**Step 2: Run tests and verify failure**

Run: `npx vitest run lib/repopress/__tests__/registry-schema.test.ts lib/repopress/__tests__/lock-schema.test.ts lib/repopress/__tests__/config-writer.test.ts`

Expected: FAIL because registry and lock schemas do not exist and config strips fields.

**Step 3: Implement constrained schemas**

Use standard shadcn top-level fields and validate only `meta.repopress` additions. Keep `repopress.config.json` overrides declarative and optional. Define lock entries with resolved address/ref, integrity, dependency graph, targets, normalized authoring metadata, and local-modification digest.

**Step 4: Run focused tests**

Run the Step 2 command.

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/repopress lib/config-schema.ts
git commit -m "feat(registry): define RepoPress metadata and lock schemas"
```

### Task 7: Add fail-closed, source-preserving MDX edits

**Files:**
- Create: `lib/studio/mdx-source-edit.ts`
- Create: `lib/studio/__tests__/mdx-source-edit.test.ts`
- Modify: `lib/studio/component-insert-operation.ts`
- Modify: `lib/studio/component-serializer.ts`

**Step 1: Write failing byte-preservation fixtures**

Cover:

- No-op output is byte-identical.
- Editing one literal prop leaves imports, exports, comments, expressions, quoting, whitespace, children, and unrelated components untouched.
- Unknown syntax causes a refusal result and unchanged source.
- Expressions are not converted to strings.

```ts
const result = editComponentProp(source, target, { title: "Changed" })
expect(result.ok).toBe(true)
expect(result.source.replace('title="Changed"', 'title="Before"')).toBe(source)

const refused = editComponentProp(unsupportedSource, target, { title: "Changed" })
expect(refused).toEqual({ ok: false, source: unsupportedSource, code: "UNSAFE_TO_PRESERVE" })
```

**Step 2: Run and verify failure**

Run: `npx vitest run lib/studio/__tests__/mdx-source-edit.test.ts lib/studio/__tests__/component-serializer.test.ts`

Expected: FAIL because surgical edit support does not exist.

**Step 3: Implement position-based surgical edits**

Parse for node positions, replace only the selected opening-tag span, and fail closed when positions or unsupported syntax prevent proof of preservation. Do not serialize the full document AST for a localized edit.

**Step 4: Run Studio serialization tests**

Run: `npx vitest run lib/studio/__tests__/mdx-source-edit.test.ts lib/studio/__tests__/component-serializer.test.ts lib/studio/__tests__/integration-insert-pipeline.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/studio
git commit -m "feat(studio): preserve MDX source during component edits"
```

### Task 8: Define the opaque-origin sandbox protocol

**Files:**
- Create: `lib/preview/sandbox-protocol.ts`
- Create: `lib/preview/__tests__/sandbox-protocol.test.ts`

**Step 1: Write failing protocol tests**

Cover strict schemas, maximum serialized size, allowed message rate, session/snapshot/sequence binding, replay rejection, single-use bootstrap capability, and teardown invalidation. Explicitly model the iframe origin as opaque; do not authenticate with `event.origin`.

**Step 2: Run and verify failure**

Run: `npx vitest run lib/preview/__tests__/sandbox-protocol.test.ts`

Expected: FAIL because the protocol module does not exist.

**Step 3: Implement pure protocol guards**

Provide:

```ts
createBootstrapCapability()
acceptBootstrap({ expectedWindow, eventSource, capability })
validateSandboxMessage(message, sessionState)
advanceSandboxSequence(sessionState, message)
invalidateSandboxSession(sessionState)
```

The capability is single-use and exists only long enough to transfer a `MessagePort`.

**Step 4: Run focused tests**

Run the Step 2 command.

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/preview/sandbox-protocol.ts lib/preview/__tests__/sandbox-protocol.test.ts
git commit -m "feat(preview): define opaque sandbox protocol"
```

### Task 9: Add the compatible preview frame and sandbox shell

**Files:**
- Create: `components/mdx-runtime/CompatiblePreviewFrame.tsx`
- Create: `components/mdx-runtime/__tests__/CompatiblePreviewFrame.test.tsx`
- Create: `app/preview/sandbox/page.tsx`
- Create: `components/preview-sandbox/SandboxRuntime.tsx`
- Create: `components/preview-sandbox/__tests__/SandboxRuntime.test.tsx`
- Modify: `next.config.mjs`
- Modify: `components/studio/preview.tsx`

**Step 1: Write failing host-boundary tests**

Assert:

- The iframe has exactly `sandbox="allow-scripts"`.
- It has no `allow-same-origin`, forms, popups, or navigation.
- Production rejects a preview origin equal to the Studio origin.
- The host validates `event.source === iframe.contentWindow` and transfers a `MessageChannel`.
- Teardown closes the port and invalidates the session.
- Preview responses specify `Cache-Control: no-store`, restrictive CSP, CORS, and referrer policy.

**Step 2: Run and verify failure**

Run: `npx vitest run components/mdx-runtime/__tests__/CompatiblePreviewFrame.test.tsx components/preview-sandbox/__tests__/SandboxRuntime.test.tsx`

Expected: FAIL because the frame and sandbox shell do not exist.

**Step 3: Implement the frame and inert sandbox shell**

At this task the shell may only handshake and render a RepoPress-owned test element. It must not yet execute repository code. Configure `NEXT_PUBLIC_PREVIEW_ORIGIN` and fail closed when isolation requirements are not met.

**Step 4: Run tests and build**

Run:

```bash
npx vitest run components/mdx-runtime/__tests__/CompatiblePreviewFrame.test.tsx components/preview-sandbox/__tests__/SandboxRuntime.test.tsx
npx tsc --noEmit
```

Expected: PASS.

**Step 5: Commit**

```bash
git add app/preview components/mdx-runtime components/preview-sandbox next.config.mjs
git commit -m "feat(preview): add isolated compatible preview frame"
```

### Task 10: Remove repository execution from the Studio realm

**Files:**
- Move: `components/mdx-runtime/evaluateMdx.ts` to `components/preview-sandbox/evaluateMdx.ts`
- Move: compatible adapter evaluation from `lib/repopress/evaluate-adapter.ts` to `components/preview-sandbox/evaluate-adapter.ts`
- Move: browser transpilation from `lib/repopress/esbuild-browser.ts` to `components/preview-sandbox/esbuild-browser.ts`
- Modify: `components/mdx-runtime/PreviewRuntime.tsx`
- Modify: `lib/hooks/use-preview-context.ts`
- Modify: `lib/hooks/use-adapter.ts`
- Modify: `components/studio/repo-jsx-bridge.tsx`
- Modify: `components/studio/studio-adapter-context.tsx`
- Modify: `components/studio/jsx-component-descriptors.tsx`
- Modify: `components/studio/editor.tsx`
- Modify: `components/preview-sandbox/SandboxRuntime.tsx`
- Delete after caller audit: `app/dashboard/[owner]/[repo]/mdx-actions.ts`
- Delete after caller audit: `app/dashboard/[owner]/[repo]/adapter-actions.ts`
- Delete after caller audit: `app/dashboard/[owner]/[repo]/plugin-actions.ts`
- Delete after caller audit: `lib/repopress/function-constructor-guard.ts`
- Delete after caller audit: dead adapter/plugin cache and bundle helpers plus their tests
- Modify: `lib/__tests__/review-regression-guards.test.ts`
- Modify: evaluator tests to use sandbox paths

**Step 1: Write the failing import-boundary guard**

Add a regression test that scans host/runtime files and fails when `new Function`, `eval`, `evaluateMdx`, `evaluateAdapter`, `transpileAdapter`, or executable adapter React values are imported or invoked outside the sandbox directory. Include `repo-jsx-bridge.tsx` and Studio context files in the scan.

```ts
expect(findHostExecutionViolations()).toEqual([])
```

Run: `npx vitest run lib/__tests__/review-regression-guards.test.ts`

Expected: FAIL and list the current host evaluators.

**Step 2: Move execution behind the sandbox protocol**

- Studio sends serialized source, authoring metadata, and explicitly resolved compatible bundle artifacts through the port.
- The sandbox evaluates and renders them.
- Studio receives only status, size, diagnostics, and fidelity events.
- Adapter hooks return serializable resolution state, never React functions.
- Studio JSX bridges and descriptors render host-owned structural placeholders only; they never call adapter components.
- Generic fallback remains active whenever no trusted compatible artifact exists.

Before deleting any old action/helper, run `rg` for its exported names and remove it only when no production caller remains. Keep server-side source fetching only when it returns inert serialized source or bundle metadata and performs no evaluation.

Do not claim this is a complete security sandbox for arbitrary code; the design still requires a separate deployment origin and trusted digest approval.

**Step 3: Prove the guard passes**

Run:

```bash
npx vitest run lib/__tests__/review-regression-guards.test.ts components/mdx-runtime/__tests__ components/preview-sandbox/__tests__ lib/repopress/__tests__/evaluate-adapter.test.ts
npx tsc --noEmit
```

Expected: PASS and zero host execution violations.

**Step 4: Commit**

```bash
git add components/mdx-runtime components/preview-sandbox lib/hooks lib/repopress lib/__tests__
git commit -m "security(preview): remove repository execution from Studio"
```

### Task 11: Add an official Callout registry fixture

**Files:**
- Create: `registry.json`
- Create: `registry/repopress/callout/callout.tsx`
- Create: `registry/repopress/callout/fixture.mdx`
- Create: `registry/repopress/__tests__/callout-registry.test.ts`

**Step 1: Write failing registry fixture tests**

Validate the item through `registryItemSchema`, normalize its `AuthoringComponent`, compile the MDX fixture, and assert the declared export/file exists. Include title, variant enum, children slot, framework targets, version, and integrity inputs.

**Step 2: Run and verify failure**

Run: `npx vitest run registry/repopress/__tests__/callout-registry.test.ts`

Expected: FAIL because the registry fixture does not exist.

**Step 3: Implement the smallest useful component**

The component must be browser-safe, semantic, token-based, and independent of RepoPress application internals. Its fixture is a test input, not a separate renderer.

**Step 4: Run fixture and schema tests**

Run: `npx vitest run registry/repopress/__tests__/callout-registry.test.ts lib/repopress/__tests__/registry-schema.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add registry.json registry
git commit -m "feat(registry): add official Callout component fixture"
```

### Task 12: Build a deterministic install planner and Next/Fumadocs map adapter

**Files:**
- Create: `lib/repopress/registry-resolver.ts`
- Create: `lib/repopress/install-plan.ts`
- Create: `lib/repopress/runtime-map-adapter.ts`
- Create: `lib/repopress/__tests__/registry-resolver.test.ts`
- Create: `lib/repopress/__tests__/install-plan.test.ts`
- Create: `lib/repopress/__tests__/runtime-map-adapter.test.ts`

**Step 1: Write failing pure planner tests**

Test recursive dependencies, cycles, target collisions, local modification detection, integrity mismatch, CSS/package diffs, dry-run output, and deterministic ordering. Test surgical updates to existing `mdx-components.tsx` for both `useMDXComponents` and exported component-map forms. Unsupported source must fail closed.

**Step 2: Run and verify failure**

Run: `npx vitest run lib/repopress/__tests__/registry-resolver.test.ts lib/repopress/__tests__/install-plan.test.ts lib/repopress/__tests__/runtime-map-adapter.test.ts`

Expected: FAIL because the modules do not exist.

**Step 3: Implement pure resolution and planning**

Return an immutable plan containing files, package changes, CSS changes, runtime-map edit, lock snapshot, warnings, and conflicts. Do not perform GitHub writes in this task.

**Step 4: Run focused tests**

Run the Step 2 command.

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/repopress
git commit -m "feat(registry): plan component installs deterministically"
```

### Task 13: Publish registry installations through a GitHub PR

**Files:**
- Create: `app/api/github/install-registry-item/route.ts`
- Create: `app/api/github/install-registry-item/__tests__/route.test.ts`
- Modify: `lib/github.ts`
- Modify: `lib/route-auth.ts`

**Step 1: Write failing route tests**

Cover authentication, editor/owner policy, server-derived project coordinates, allowed base ref, item allowlist/URL validation, dry-run response, branch creation, batch commit, PR creation, conflict response, and no base-branch write. Include cross-project IDOR and forged repository/ref inputs.

**Step 2: Run and verify failure**

Run: `npx vitest run app/api/github/install-registry-item/__tests__/route.test.ts`

Expected: FAIL because the route does not exist.

**Step 3: Implement route using the pure install plan**

The server resolves the project from authenticated state, fetches and validates the registry item, computes the plan, and either returns the dry run or commits the exact plan to a dedicated branch and opens a PR. Never accept repository owner/name or an arbitrary target branch as authoritative request data.

**Step 4: Run route and GitHub helper tests**

Run: `npx vitest run app/api/github/install-registry-item/__tests__/route.test.ts lib/__tests__/github.batch-commit.test.ts lib/__tests__/project-access-role.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add app/api/github/install-registry-item lib/github.ts lib/route-auth.ts
git commit -m "feat(registry): install components through pull requests"
```

### Task 14: Integrate the authoring catalog and Callout proof into Studio

**Files:**
- Modify: `components/studio/component-insert-modal.tsx`
- Modify: `components/studio/component-prop-form.tsx`
- Modify: `components/studio/insert-jsx-button.tsx`
- Modify: `components/studio/preview.tsx`
- Modify: `components/studio/studio-layout.tsx`
- Create: `components/studio/__tests__/component-ecosystem-flow.test.tsx`
- Modify: `lib/studio/__tests__/integration-insert-pipeline.test.ts`

**Step 1: Write a failing end-to-end component-flow test**

Exercise:

1. Load normalized Callout metadata.
2. Show it in the palette without a React function in host state.
3. Build a form from title, variant, and children schema.
4. Insert valid MDX.
5. Edit one prop without changing unrelated source.
6. Show compatible preview only when a trusted sandbox artifact exists.
7. Otherwise show the generic placeholder and downgrade reason.

**Step 2: Run and verify failure**

Run: `npx vitest run components/studio/__tests__/component-ecosystem-flow.test.tsx lib/studio/__tests__/integration-insert-pipeline.test.ts`

Expected: FAIL against the current merged registry and same-origin preview flow.

**Step 3: Implement the Studio integration**

Remove the deprecated `buildComponentRegistry` wrapper. The modal and forms consume `AuthoringCatalog`; preview consumes `PreviewResult`; neither receives executable bindings.

**Step 4: Run Studio tests**

Run: `npx vitest run components/studio/__tests__ components/studio/hooks/__tests__ lib/studio/__tests__`

Expected: PASS.

**Step 5: Commit**

```bash
git add components/studio lib/studio
git commit -m "feat(studio): author registry components through safe contracts"
```

### Task 15: Remove generated preview-adapter authority and document fidelity

**Files:**
- Modify: `lib/sync-projects.ts`
- Modify: `lib/repopress/config-writer.ts`
- Modify: `components/repo-setup-form.tsx`
- Modify: `docs/multi_project_mdx_spec.md`
- Modify: `docs/mdx_runtime_master_plan.md`
- Modify: `README.md`
- Modify: relevant config/setup tests

**Step 1: Write failing setup regression tests**

Assert that new setup does not generate `.repopress/mdx-preview.tsx`, does not store generated component functions/catalogs in config, and treats explicit preview entries as optional overrides. Existing explicit adapters remain readable but untrusted until sandboxed.

**Step 2: Run and verify failure**

Run: `npx vitest run lib/repopress/__tests__/config-writer.test.ts lib/__tests__/sync-projects-from-config.test.ts components/__tests__/project-config-action-input.test.ts`

Expected: At least one assertion fails against current generated/config-authoritative behavior.

**Step 3: Implement the lightweight config behavior**

Keep projects, roots, registry aliases, CSS target, and explicit override fields. Remove default adapter generation and generated component-catalog ownership. Update docs to describe generic/compatible/native grades honestly.

**Step 4: Run focused tests**

Run the Step 2 command.

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/sync-projects.ts lib/repopress/config-writer.ts components/repo-setup-form.tsx docs README.md
git commit -m "refactor(config): make native discovery the default"
```

### Task 16: Verify the first ecosystem slice

**Files:**
- Modify only if verification exposes defects.

**Step 1: Verify no host-realm repository execution**

Run:

```bash
rg -n "new Function|\beval\(" app components lib \
  -g '!components/preview-sandbox/**' \
  -g '!**/__tests__/**'
```

Expected: no executable repository evaluation outside the sandbox directory.

**Step 2: Run full static checks**

Run:

```bash
npm run lint
npx tsc --noEmit
```

Expected: both exit 0.

**Step 3: Run the full test suite**

Run: `npm run test`

Expected: all tests pass with zero failures and no unintended live GitHub requests.

**Step 4: Run the production build**

Run: `npm run build`

Expected: exit 0. Record remaining third-party warnings separately; do not describe warnings as clean output.

**Step 5: Inspect dependency and file scope**

Run:

```bash
npm audit --omit=dev
git status --short
git diff main...HEAD --stat
git diff main...HEAD --check
```

Expected: audit findings are triaged, only intended files are changed, and diff check is clean.

**Step 6: Commit verification fixes, if any**

```bash
git add <only-files-fixed-during-verification>
git commit -m "fix(preview): address ecosystem verification findings"
```

Skip this commit when verification required no changes.

## Follow-on implementation plan

After this slice is integrated, write a separate managed-native-runner plan covering:

- Authenticated preview gateway and tenant/session binding.
- Executable closure hashing and approval UX.
- MicroVM or gVisor-class isolation.
- Safe repository materialization and overlay mounting.
- Dependency-install and serve-phase isolation.
- Egress proxy and SSRF controls.
- Next.js/Fumadocs framework adapters and real-route mapping.
- Immutable tenant-scoped caches and anti-poisoning.
- External bridge registration, proof of control, attestation, nonce, and replay storage.
- Astro-native adapter.

Do not implement native-grade claims until the real-route framework fixtures and hostile-code security acceptance suite pass.

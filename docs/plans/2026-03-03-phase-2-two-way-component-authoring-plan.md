# RepoPress Phase 2 — Two-Way Component Authoring Implementation Plan

> **Status:** COMPLETE  
> **Done:** Phases 1-5 were delivered (registry/catalog/node/serializer, schema-driven insert UX, Blob-primary upload with fallback, diagnostics alignment, tests/docs/guardrails).  
> **Left:** Follow-up hardening work only (outside this plan scope).  
> **Last Updated:** 2026-03-03

## Summary
Implement schema-driven component insertion with prop configuration, deterministic MDX serialization, preview synchronization, and Blob-primary media upload with GitHub fallback.

This plan is decision-complete for direct implementation.

## Locked Decisions
1. Build two-way component authoring before further history/runtime expansion.
2. Use Vercel Blob as primary media backend, with GitHub fallback.
3. Ship incrementally in phases.
4. Keep MDXEditor as the editor integration surface.
5. Preview updates must derive only from MDX source changes.

## Scope
### In Scope
1. Component picker + dynamic prop form.
2. Component registry as single source of runtime truth.
3. Intermediate `ComponentNode` model between form and serializer.
4. Deterministic serializer with normalized prop ordering.
5. Blob-primary upload route + GitHub fallback.
6. Diagnostics and regression coverage for insertion + preview + persistence flow.

### Out of Scope
1. Editing `repopress.config.json` component definitions in UI.
2. Marketplace/distributed plugin system changes.
3. Full `new Function` removal (tracked as follow-up hardening).

## Public Interfaces and Types
### 1) `lib/studio/component-registry.ts`
1. `RepoComponentPropType = "string" | "number" | "boolean" | "expression" | "image"`.
2. `RepoComponentPropDef = { name: string; type: RepoComponentPropType; label?: string; default?: unknown }`.
3. `RepoComponentCapabilityFlags = { inline?: boolean; media?: boolean; configurable?: boolean }`.
4. `RepoComponentDef = {`
   `name: string;`
   `version?: number;`
   `displayName?: string;`
   `description?: string;`
   `props: RepoComponentPropDef[];`
   `hasChildren: boolean;`
   `kind: "flow" | "text";`
   `source: "config" | "adapter" | "merged";`
   `capabilities?: RepoComponentCapabilityFlags;`
   `}`.
5. `buildComponentRegistry(adapterComponents, projectComponents): Record<string, RepoComponentDef>`.
6. Registry is the single runtime source of truth.

### 2) `lib/studio/component-catalog.ts`
1. UI projection from registry only.
2. `buildComponentCatalog(registry): RepoComponentDef[]`.
3. Label fallback: `displayName ?? name`.
4. Description fallback: optional `description`.

### 3) `lib/studio/component-node.ts`
1. `ComponentNode = {`
   `name: string;`
   `kind: "flow" | "text";`
   `props: Record<string, unknown>;`
   `hasChildren: boolean;`
   `children?: string;`
   `}`.
2. `buildComponentNode(def: RepoComponentDef, formState): ComponentNode`.
3. Serializer consumes only `ComponentNode`.

### 4) `lib/studio/component-serializer.ts`
1. `serializeComponentNode(node: ComponentNode): string`.
2. Deterministic output rules:
   - Normalize prop order lexicographically.
   - Omit undefined/empty optional props.
   - Stable escaping.
3. Value formatting:
   - `string` -> `prop="..."`.
   - `number` -> `prop={123}`.
   - `boolean` -> `prop={true|false}`.
   - `expression` -> `prop={expr}`.
   - `image` -> string path/URL.
4. Style rule:
   - Self-closing nodes must be single-line JSX.
   - Nodes with children use open/close tags.

### 5) `app/api/media/upload/route.ts`
1. Request: `{ owner, repo, branch, pathHint?, fileName, contentBase64, storagePreference }`.
2. `storagePreference`: `"auto" | "blob" | "github"`.
3. Response: `{ storage, url, repoPath?, sha?, commitSha? }`.
4. Behavior:
   - `auto`: Blob first, fallback GitHub.
   - `blob`: fail if Blob unavailable.
   - `github`: force GitHub path.

### 6) Editor/Preview Synchronization Contract
1. Preview must update only when MDX source state changes.
2. Form/modal/registry state must never directly trigger preview rendering.
3. Data flow:
   - form -> `ComponentNode` -> serializer -> MDX insert -> `content` change -> preview update.

## Phase 1 — Registry + Catalog + Node + Serializer Foundations
1. Add `component-registry.ts` with merge logic for config + adapter components.
2. Add computed capability flags (`media`, `configurable`, `inline`).
3. Add `component-catalog.ts` projection layer.
4. Add `component-node.ts` mapper.
5. Add deterministic `component-serializer.ts`.
6. Add unit tests:
   - `component-registry.test.ts`
   - `component-catalog.test.ts`
   - `component-node.test.ts`
   - `component-serializer.test.ts`

### Acceptance
1. Registry is authoritative and deterministic.
2. Serializer output is stable and ordered.
3. Self-closing output is single-line JSX.

## Phase 2 — Schema-Driven Insert UX
1. Add:
   - `components/studio/component-insert-modal.tsx`
   - `components/studio/component-prop-form.tsx`
2. Update `components/studio/insert-repo-component.tsx`:
   - Choose component from catalog.
   - Render dynamic typed prop form.
   - Optional children input for `hasChildren`.
   - Build `ComponentNode`, serialize, insert into editor.
3. Form control mapping:
   - string/number/boolean/expression/image.
4. Source-mode behavior:
   - Show “switch to Rich Text” message (no source-cursor insertion in this slice).

### Acceptance
1. Insert configured DocsImage/DocsVideo/Callout from UI.
2. Generated MDX persists through save/publish.
3. Preview changes only after source update.

## Phase 3 — Blob-Primary Media Upload Integration
1. Add `@vercel/blob` if missing.
2. Implement `/api/media/upload` Blob-first route.
3. Add `lib/studio/media-upload.ts` client helper.
4. Integrate upload helper in:
   - `components/studio/editor.tsx` image plugin handler.
   - `component-prop-form.tsx` `image` prop control.
5. Persist:
   - Blob URL on Blob success.
   - Repo-relative path on fallback GitHub success.

### Acceptance
1. Blob path works when configured.
2. GitHub fallback works when Blob unavailable.
3. Preview renders both formats.

## Phase 4 — Runtime/Diagnostics Alignment
1. Validate inserted node props in preview runtime path.
2. Improve warnings for bad expression props without crashes.
3. Enforce sync contract boundaries (no direct preview mutation outside MDX source changes).

### Acceptance
1. No crash/raw JSX regressions.
2. Warnings are actionable.
3. Preview contract preserved.

## Phase 5 — Verification, Docs, and Guardrails
1. Update `docs/summary-and-next-phase.md` with delivered Phase 2 behavior.
2. Document registry -> catalog -> node -> serializer architecture.
3. Add integration/regression coverage for insertion and save/publish round-trip.
4. Add feature flag `NEXT_PUBLIC_COMPONENT_AUTHORING_V2=true`.

### Acceptance
1. Safe staged rollout.
2. Immediate rollback by feature flag.

## Test Scenarios
1. Registry merge correctness (config-only, adapter-only, collisions).
2. Capability flag derivation.
3. Optional metadata propagation (`version`, `displayName`, `description`).
4. Serializer determinism and ordered props.
5. Single-line self-closing formatting.
6. Insert flow for DocsImage/DocsVideo/Callout.
7. Preview update only on MDX source mutation.
8. Blob success and GitHub fallback paths.
9. Failure handling for invalid expressions and upload errors.

## Assumptions
1. `repopress.config.json` remains source-of-truth for component schema.
2. Existing `project.components` sync pipeline remains unchanged.
3. Source-mode insertion is deferred in this phase.
4. Blob env configuration may vary by environment; fallback must keep authoring functional.
5. `new Function` hardening is a separate follow-up.

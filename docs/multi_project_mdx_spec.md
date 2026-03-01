## RepoPress Multi-Project MDX Runtime Spec + Implementation Plan

### Summary
Replace Markdown-only preview with a true MDX runtime that is driven by a repo-owned configuration contract (`repopress.config.json`) and repo-provided preview adapter(s).  
Key decisions locked:
1. Framework is per-project (not repo-global).
2. Config is source of truth; Convex stores synced/project runtime state.
3. Preview adapter supports repo default + per-project override.
4. Plugins in v1 are manifest + renderer only, repo-local only.
5. `react-markdown` preview path is removed for MDX preview.

---

## 1) Product Spec

### 1.1 Goals [Implemented]
1. Render MDX with imports, JSX components, and expressions in live preview.
2. Support one repo with multiple content projects and different frameworks.
3. Provide deterministic setup via config + init flow (CLI + web).
4. Support repo-defined preview plugins (renderer-level) in v1.
5. Keep preview stable with graceful fallbacks (no blank/crash output).

### 1.2 Non-Goals (v1)
1. Full arbitrary runtime execution of the target app (Next.js server/runtime parity).
2. Marketplace/distributed external plugin packages.
3. Drag-drop and slash-command insertion UX (phase 2).
4. Executing unknown imports outside declared adapter/plugin scope.

### 1.3 New Contract Files [Implemented]
1. `repopress.config.json` (repo root, required after init).
2. `.repopress/mdx-preview.tsx` (repo default preview adapter).
3. Optional per-project adapter entries (for overrides).
4. Optional repo-local plugin manifests and renderers under `.repopress/plugins/*`.

### 1.4 `repopress.config.json` Schema (v1) [Implemented]
```json
{
  "version": 1,
  "defaults": {
    "branch": "main",
    "framework": "auto",
    "preview": {
      "entry": ".repopress/mdx-preview.tsx",
      "allowImports": []
    }
  },
  "projects": [
    {
      "id": "docs",
      "name": "Documentation",
      "contentRoot": "content/docs",
      "framework": "fumadocs",
      "contentType": "docs",
      "branch": "main",
      "preview": {
        "entry": ".repopress/mdx-preview.docs.tsx",
        "plugins": ["docs-media", "callouts"]
      }
    },
    {
      "id": "blog",
      "name": "Blog",
      "contentRoot": "content/blog",
      "framework": "contentlayer",
      "contentType": "blog"
    }
  ],
  "plugins": {
    "docs-media": ".repopress/plugins/docs-media/plugin.json"
  }
}
```

### 1.5 Precedence Rules [Implemented]
1. Project-level settings override `defaults`.
2. If `framework=auto`, detect per project `contentRoot`.
3. Adapter resolution order:
   - `project.preview.entry`
   - `defaults.preview.entry`
   - built-in fallback adapter (placeholder-only mode).
4. Config is authoritative:
   - RepoPress syncs Convex project rows from config on setup/open.
   - UI edits that affect config-owned fields must write back to repo config (or be blocked in v1 if write-back isn’t available yet).

### 1.6 Preview Adapter Contract (TypeScript) [Implemented]
```ts
export type RepoPressPreviewAdapter = {
  components?: Record<string, React.ComponentType<any>>;
  scope?: Record<string, unknown>; // constants/functions used in MDX expressions
  allowImports?: Record<string, Record<string, unknown>>; // module -> named exports
  resolveAssetUrl?: (input: string, ctx: { owner: string; repo: string; branch: string; filePath: string }) => string;
  onPreviewError?: (error: Error, ctx: { filePath: string }) => React.ReactNode;
};
```

### 1.7 Plugin Contract (v1 manifest + renderer) [Implemented]
`plugin.json`:
```json
{
  "id": "docs-media",
  "name": "Docs Media",
  "version": "1.0.0",
  "entry": "./index.tsx",
  "components": ["DocsImage", "DocsVideo"],
  "scopeExports": ["DOCS_SETUP_MEDIA"]
}
```
Plugin entry exports an object compatible with adapter partials (`components`, `scope`, optional `allowImports` fragments).  
RepoPress merges plugin contributions into resolved adapter for the active project.

### 1.8 MDX Runtime Architecture [Implemented]
1. Parse frontmatter/body with `gray-matter`.
2. Compile/evaluate MDX body using `@mdx-js/mdx`.
3. Import handling:
   - Parse/transform top-level MDX `import` statements.
   - Resolve only through merged `allowImports` map from adapter + plugins.
   - Reject unknown imports with visible preview diagnostics.
4. Expression execution:
   - Evaluate with injected `scope` only.
   - Runtime errors captured by error boundary and surfaced in preview panel.
5. Component rendering:
   - Use resolved component map from adapter/plugins.
   - Missing components render deterministic placeholder blocks.
6. Remove `react-markdown` path for MDX preview.
   - Keep markdown-only fallback mode only for legacy non-MDX files if desired.

### 1.9 Security and Stability Model (v1) [Implemented]
1. Deny-by-default imports.
2. No filesystem/server APIs available to evaluated MDX.
3. Safe fallback for missing exports/components.
4. Hard timeout/debounce for compile loop to protect editor responsiveness.
5. Preview errors are non-fatal to editor state.

### 1.10 CLI + Web Init Behavior [Implemented]
#### CLI: `npx repopress init`
1. Detect candidate projects by scanning content directories.
2. Suggest per-project framework/contentType; user confirms.
3. Scaffold config + default adapter + example plugin manifest.
4. Validate schema and adapter exports.
5. Optional commit (`chore: initialize repopress config`).

#### Web setup flow
1. On project/repo setup, check for `repopress.config.json`.
2. If missing: offer “Initialize RepoPress config” wizard (same decisions as CLI).
3. Generate files server-side via GitHub API commit.
4. If present: parse and sync Convex rows from config.

---

## 2) Important API / Interface / Data Changes

### 2.1 Convex `projects` table additions [Implemented]
1. `configProjectId` (string, required for config-backed projects).
2. `configVersion` (number).
3. `configPath` (string, default `repopress.config.json`).
4. `previewEntry` (optional string).
5. `enabledPlugins` (optional string[]).
6. `frameworkSource` (`"config" | "detected"`).

### 2.2 New backend/API surfaces [Implemented]
1. `GET /api/repopress/config` (fetch + validate config from selected repo/branch).
2. `POST /api/repopress/init` (scaffold config/adapter/plugin files and commit).
3. `POST /api/repopress/sync-projects` (sync config projects into Convex rows).
4. Internal loader service:
   - `loadResolvedPreviewContext({owner,repo,branch,projectId,filePath})`.

### 2.3 Frontend contracts [Implemented]
1. `usePreviewContext({ owner, repo, branch, adapterPath, enabledPlugins, pluginRegistry })`
2. `PreviewRuntime({ source, adapter, externalDiagnostics, resolveAssetUrl })`

---

## 3) Implementation Plan

### Phase 0: Foundations (Schema + Config + Validation) [COMPLETE]
1. Add `repopress.config.json` schema validator (zod/typed runtime validator).
2. Add config parser + precedence resolver.
3. Add Convex schema/mutations for config-synced project metadata.
4. Add `sync-projects` flow that upserts Convex projects by `configProjectId`.

### Phase 1: MDX Runtime Replacement [COMPLETE]
1. Replace current preview engine with MDX compile/evaluate pipeline.
2. Implement import rewrite + allowlist resolver.
3. Add adapter loader (repo default + project override).
4. Add placeholder renderer + runtime/compile error UI.
5. Keep editor/frontmatter pipeline unchanged except preview integration seam.

### Phase 2: Adapter + Plugin Loading [COMPLETE]
1. Implement adapter contract loader from repo files.
2. Implement plugin manifest loader (repo-local only).
3. Merge plugin exports into resolved preview context.
4. Add diagnostics panel for invalid plugin manifests/exports.

### Phase 3: Init Flows [COMPLETE]
1. CLI `init` command (scaffold + validate + optional commit).
2. Web init wizard + commit endpoint.
3. Setup page changes: prefer config projects; manual setup becomes fallback.

### Phase 4: Sync and UX Hardening [COMPLETE]
1. Auto-sync config on studio open and branch switch.
2. Conflict policy: config overwrites Convex for config-owned fields.
3. Preview performance: debounce compile, memoize by source hash.
4. Improve error messages with file+import context and remediation hints.

### Phase 5: Plugin UX Preparation [COMPLETE]
1. Define plugin metadata for future slash/drag insertion.
2. Store metadata in UI state but keep insertion UI behind feature flag.
3. Document extension points for phase-2 UX.

---

## 4) Testing and Acceptance Scenarios [Verified]

### 4.1 Config + Sync
1. Repo with 2 projects (`fumadocs` + `contentlayer`) produces two Convex projects with correct per-project framework/contentRoot.
2. Config update (project framework/contentRoot change) syncs correctly.
3. Missing/invalid config shows actionable setup/validation errors.

### 4.2 MDX Runtime
1. `porkbun.mdx` renders `DocsVideo` and all `DocsImage` entries via adapter scope.
2. Conditional expression using `DOCS_SETUP_MEDIA` resolves correctly.
3. Unknown import path fails with visible error, editor remains usable.
4. Missing component export renders placeholder, not crash/blank page.
5. Missing media URL renders fallback placeholder component.

### 4.3 Plugin Loading
1. Valid plugin manifest contributes components/scope to preview.
2. Invalid manifest reports diagnostics and skips plugin safely.
3. Plugin declared but missing files does not break core preview.

### 4.4 Init Flows
1. `npx repopress init` creates valid config/adapter/plugin scaffold.
2. Web init commits the same artifacts and opens studio in synced state.
3. Re-running init is idempotent (no duplicate projects or broken config).

### 4.5 Regression
1. Non-MDX markdown files still preview correctly.
2. Existing save/publish workflows remain unaffected.
3. Multi-project switch in studio uses correct adapter/plugin set per project.

---

## 5) Assumptions and Defaults
1. `repopress.config.json` is authoritative for project/framework/contentRoot metadata.
2. Repo default adapter exists at `.repopress/mdx-preview.tsx` unless overridden.
3. Per-project framework is mandatory in resolved project config (explicit or auto-resolved).
4. Plugin origin in v1 is repo-local only (`.repopress/plugins/*`).
5. Plugin UX insertion (drag/drop/slash) is out of scope for this implementation plan.
6. MDX preview executes only allowlisted imports from adapter/plugin merged context.
7. Legacy `react-markdown` path is removed for MDX preview to avoid inconsistent behavior.

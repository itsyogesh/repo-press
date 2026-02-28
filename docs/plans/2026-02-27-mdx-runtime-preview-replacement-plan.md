# RepoPress Studio — MDX Runtime Preview First (Full Replacement Plan)

## Summary
This plan prioritizes and implements a full replacement of the current Markdown-only preview pipeline with a strict-allowlist MDX runtime preview. It is designed to fit the current studio redesign progress and unblock the highest remaining functional gap: rendering MDX imports, JSX components, and expressions in preview.

This plan assumes immediate implementation, no feature flag, and strict import allowlisting.

## Why First (Priority Decision)
1. Current preview in [preview.tsx](/Users/tarun/Downloads/projects/repo-press/components/studio/preview.tsx) is `react-markdown` + `rehype-raw`, which cannot evaluate MDX imports/expressions.
2. Existing redesign shell and layout are already mostly stabilized; preview correctness is now the primary quality blocker.
3. Deferring this causes downstream rework in loading UX, polish, and media behavior.

## Scope
1. Replace preview runtime in [preview.tsx](/Users/tarun/Downloads/projects/repo-press/components/studio/preview.tsx) from Markdown rendering to MDX evaluate runtime.
2. Add strict import rewriting and allowlisted module registry.
3. Add compile/runtime error UX for unsupported imports and expression failures.
4. Keep existing device frame, fullscreen preview, metadata header rendering, and split/editor behavior intact.
5. Keep existing file loading flow in [use-studio-file.ts](/Users/tarun/Downloads/projects/repo-press/components/studio/hooks/use-studio-file.ts).

## Out of Scope
1. Sandboxed iframe/worker isolation.
2. Arbitrary import execution.
3. Frontmatter schema redesign.
4. Media upload pipeline completion.
5. Refactor of MDXEditor authoring surface.

## Architecture (Decision-Complete)
1. Preview runtime compiles/evaluates MDX body client-side with `@mdx-js/mdx`.
2. Imports are rewritten before evaluation.
3. Only known modules and known named exports are allowed.
4. Unknown imports or unknown exported names fail with explicit preview errors.
5. Runtime scope is provided by a registry object, not by dynamic module resolution.
6. Compile/evaluate is debounced and race-safe.
7. Evaluation outputs a component that is rendered inside error boundary fallback UI.

## Dependency Changes
1. Add runtime deps:
`@mdx-js/mdx`, `remark-mdx`, `react-error-boundary` (if not using existing class boundary).
2. Keep existing `remark-gfm`.
3. Remove preview dependency on `react-markdown` and `rehype-raw` from preview path (do not remove package usage globally unless unused repo-wide).

## File-Level Implementation Plan
1. Create [lib/mdx-preview/import-registry.ts](/Users/tarun/Downloads/projects/repo-press/lib/mdx-preview/import-registry.ts)
- Export `PreviewImportRegistry` type.
- Export default registry with strict allowlist keys.
- Initial entries:
`"@/components/docs/doc-media"` mapped to preview-safe `DocsImage`, `DocsVideo`.
`"@/lib/constants/docs"` mapped to `DOCS_SETUP_MEDIA` (safe object default).
- Keep registry extendable by project-specific adapters later.

2. Create [lib/mdx-preview/rewrite-imports.ts](/Users/tarun/Downloads/projects/repo-press/lib/mdx-preview/rewrite-imports.ts)
- Parse top-level import lines.
- Support named imports and aliased named imports.
- Reject default imports, namespace imports, side-effect imports in v1.
- Rewrite to scope lookup, for example:
`const { DocsVideo } = __MDX_SCOPE__["@/components/docs/doc-media"];`
- Throw structured errors with source module and symbol names.

3. Create [lib/mdx-preview/evaluate-mdx.ts](/Users/tarun/Downloads/projects/repo-press/lib/mdx-preview/evaluate-mdx.ts)
- Input: `rawBody`, `registry`, optional compile options.
- Flow: rewrite imports -> evaluate via `@mdx-js/mdx` using `react/jsx-runtime`.
- Plugins: `remark-gfm`, `remark-mdx`.
- Output: `{ CompiledComponent, diagnostics }`.
- Throw typed errors for unsupported imports and evaluation failures.

4. Create [components/studio/mdx-runtime-preview.tsx](/Users/tarun/Downloads/projects/repo-press/components/studio/mdx-runtime-preview.tsx)
- Client component owning compile state.
- Debounced compile (`300ms`).
- Tracks compile version; ignores stale results.
- Renders:
loading indicator while compiling,
error panel with actionable message,
compiled output on success.
- Wrap compiled output in error boundary.

5. Update [components/studio/preview.tsx](/Users/tarun/Downloads/projects/repo-press/components/studio/preview.tsx)
- Remove `react-markdown` rendering path.
- Keep existing frontmatter meta display and image rendering behavior.
- Insert `MdxRuntimePreview` for body content region.
- Keep viewport and fullscreen controls unchanged.
- Keep existing `DocsImage/DocsVideo` visual placeholders only as fallback if needed by registry.

6. Optional helper for defaults:
Create [lib/mdx-preview/default-doc-constants.ts](/Users/tarun/Downloads/projects/repo-press/lib/mdx-preview/default-doc-constants.ts)
- Provide stable fallback `DOCS_SETUP_MEDIA` object to avoid hard crashes where project constants are absent.
- Keep explicit diagnostics when MDX expects keys missing from fallback.

7. Update [components/studio/error-boundary.tsx](/Users/tarun/Downloads/projects/repo-press/components/studio/error-boundary.tsx)
- Add MDX-specific fallback variant text:
unsupported import,
compile parse error,
runtime expression error.
- Keep generic fallback for unknown failures.

8. Update [STUDIO-REDESIGN-FINAL-PLAN.md](/Users/tarun/Downloads/projects/repo-press/STUDIO-REDESIGN-FINAL-PLAN.md)
- Move MDX runtime preview to priority #1.
- Mark current preview limitation as “active implementation track.”
- Add milestone and acceptance criteria from this plan.

## Public Interfaces and Types
1. `PreviewImportRegistry`
- Type: `Record<string, Record<string, unknown>>`.
- Purpose: strict allowlist mapping module specifier to exposed symbols.

2. `RewriteImportsResult`
- Fields: `code: string`, `usedModules: string[]`, `usedSymbols: Record<string, string[]>`.

3. `MdxPreviewResult`
- Fields:
`CompiledComponent: React.ComponentType | null`,
`isCompiling: boolean`,
`error: PreviewCompileError | PreviewRuntimeError | null`,
`diagnostics: string[]`.

4. `MdxRuntimePreviewProps`
- Fields:
`body: string`,
`registry?: PreviewImportRegistry`,
`className?: string`.

## Error Handling Rules
1. Unsupported module import:
- Message format: `Unsupported import in preview: "<specifier>"`.
2. Unsupported symbol import:
- Message format: `Unsupported import name "<name>" from "<specifier>"`.
3. Parse/evaluate failures:
- Show concise message + expandable details.
4. Runtime component failure:
- Catch with boundary and preserve studio shell responsiveness.

## Performance and UX Rules
1. Compile debounce: `300ms`.
2. Compilation is cancel-safe via version token.
3. Keep previous good render while recompiling if new compile not yet successful.
4. Do not block typing/editor interactions during preview compilation.
5. Maintain existing split scroll behavior; no regressions in editor/preview sync.

## Security Rules (Locked)
1. Strict allowlist only.
2. No dynamic `import()` from MDX.
3. No execution of non-allowlisted module paths.
4. No permissive dev bypass in this phase.

## Test Plan
1. Unit tests: import rewrite
- Named import rewrite success.
- Aliased named imports success.
- Unknown module rejection.
- Unknown symbol rejection.
- Default/namespace/side-effect import rejection.

2. Unit tests: evaluate-mdx
- Valid MDX with expression compiles.
- MDX with allowlisted import + expression compiles.
- Unsupported import throws typed error.
- Syntax error surfaces parse error.

3. Component tests: runtime preview rendering
- Shows loading state while compiling.
- Shows rendered component on success.
- Shows error panel on unsupported import.
- Keeps prior successful render while recompiling.

4. Integration tests in studio flow
- Open file with MDX import/JSX, preview renders runtime output.
- Switching files does not crash preview shell.
- Fullscreen preview behaves same as inline preview.
- Split mode and editor mode continue working.

5. Regression checks
- `npx tsc --noEmit` passes.
- Existing command palette and sidebar behavior unaffected.

## Acceptance Criteria
1. MDX files using allowlisted imports/components/expressions render correctly in preview.
2. Unsupported imports fail with clear error, not raw JSX noise or silent blank output.
3. Preview remains responsive while editing.
4. No regressions in split mode, fullscreen preview, or studio layout interactions.
5. All tests above pass and typecheck passes.

## Rollout and Verification Sequence
1. Implement core runtime and registry.
2. Wire into preview component.
3. Add error UX.
4. Add tests.
5. Run typecheck and targeted preview/manual validation.
6. Update redesign plan status and next steps.

## Assumptions and Defaults
1. Studio preview remains client-side runtime evaluation.
2. Full replacement is immediate; no feature flag.
3. Strict allowlist is enforced from day one.
4. `DOCS_SETUP_MEDIA` may be unavailable in repo-local source; fallback object is acceptable if diagnostics remain explicit.
5. Current frontmatter rendering behavior in preview is retained.

## Required Update to STUDIO-REDESIGN-FINAL-PLAN.md
1. Replace current next-priority order with:
- MDX runtime preview replacement.
- Loading/cache smoothing after runtime stability.
- Explorer polish and shortcut hardening.
- Frontmatter/media completion.

2. Add a new top-level implementation phase:
`Phase 12: MDX Runtime Preview Replacement (Allowlist + Evaluate)` with this plan’s architecture, tests, and acceptance criteria.

## Starter Prompt for New Chat
```text
Implement Phase 12 from STUDIO-REDESIGN-FINAL-PLAN: MDX Runtime Preview Replacement.

Context:
- Repo: /Users/tarun/Downloads/projects/repo-press
- Current preview is in components/studio/preview.tsx and uses react-markdown.
- We need full replacement with strict allowlist MDX runtime (no feature flag).

Requirements:
1) Add allowlist registry and import rewriting:
   - lib/mdx-preview/import-registry.ts
   - lib/mdx-preview/rewrite-imports.ts
   - lib/mdx-preview/evaluate-mdx.ts
2) Build runtime preview component:
   - components/studio/mdx-runtime-preview.tsx
3) Replace body rendering in components/studio/preview.tsx to use runtime preview.
4) Keep existing metadata/header/device-frame/fullscreen behavior unchanged.
5) Add clear error UX for unsupported imports/symbols and runtime failures.
6) Add tests for rewrite/evaluate/runtime rendering.
7) Run npx tsc --noEmit and report results.
8) Update STUDIO-REDESIGN-FINAL-PLAN.md status and priorities to reflect this phase as current top priority.

Constraints:
- Strict allowlist only.
- No dynamic module resolution.
- No changes that regress sidebar, command palette, or split/editor behavior.

Deliverables:
- File-by-file diff summary
- Test evidence
- Known follow-ups (if any)
```

# RepoPress MDX Runtime — Comprehensive Implementation Plan (Source of Truth)

> This document is the **single source of truth** for building the
> RepoPress Multi‑Project MDX Runtime. It consolidates architecture
> decisions, risks, prototype strategy, implementation phases, and
> pseudocode required to begin development safely.

---

# 1. Vision

Build a **config‑driven MDX runtime preview system** capable of:

- Rendering MDX with JSX, imports, and expressions
- Supporting multiple projects per repository
- Allowing repo-defined adapters and plugins
- Providing stable, safe, deterministic preview execution

Core Principle:

> Validate runtime first → then scale architecture.

---

# 2. Core Concepts

## 2.1 Config (Source of Truth)

`repopress.config.json` - defines projects - defines preview adapters -
declares plugins

Config always overrides database state.

---

## 2.2 Preview Adapter

Repo-provided runtime definition:

Provides: - components - scope variables - allowed imports - asset
resolution

Example:

```ts
export const adapter = {
  components: { DocsImage },
  scope: { DOCS_SETUP_MEDIA },
  allowImports: {
    "@/components": { DocsImage },
  },
};
```

---

## 2.3 Plugins

Repo-local extensions contributing:

- components
- scope
- allowImports fragments

Merged deterministically.

Merge precedence:

    Project Adapter
      > Plugins
      > Default Adapter

---

# 3. Architecture Overview

    MDX File
       ↓
    Import Transformer
       ↓
    MDX Compiler (@mdx-js/mdx)
       ↓
    Runtime Evaluation (Sandboxed)
       ↓
    React Renderer
       ↓
    Live Preview

---

# 4. Known Engineering Risks

## 4.1 Import Resolution (Highest Risk)

MDX expects bundlers; preview must simulate module loading.

Solution: - Parse AST imports - Remove import nodes - Inject bindings
manually

---

## 4.2 Adapter Execution

Adapters are TSX files.

Required pipeline: 1. Fetch repo file 2. Transpile (esbuild) 3. Execute
safely 4. Extract exports

---

## 4.3 Scope Injection

Expressions only access injected runtime scope.

All constants must be explicitly provided.

---

## 4.4 Performance

Must implement: - debounce (300--500ms) - hash memoization - cancel
stale builds

---

## 4.5 Error Isolation

Three layers:

Layer Handles

---

Compile MDX syntax
Evaluate JS execution
Render React failures

Editor must never crash.

---

# 5. Minimal Working Prototype (MANDATORY FIRST STEP)

## Purpose

Validate runtime before introducing config or plugins.

## Scope

[COMPLETE] Single MDX file  
[COMPLETE] Hardcoded adapter  
[COMPLETE] No backend  
[COMPLETE] No plugins  
[COMPLETE] No config parsing

---

## Prototype Flow

    Hardcoded Adapter
           +
    MDX Source
           ↓
    Import Rewrite
           ↓
    Compile
           ↓
    Evaluate
           ↓
    Render

---

## Exit Criteria

Prototype complete when:

1.  Custom component renders
2.  Scope variable works
3.  Invalid import shows diagnostic
4.  Runtime error doesn't crash editor
5.  Typing remains responsive

---

# 6. Implementation Phases

## Phase -1 — Minimal Prototype [COMPLETE]

Goal: Prove MDX runtime viability.

Deliverables: - import transformer - runtime evaluator - error
boundary - hardcoded adapter

**Note on Final Implementation:** Used `esbuild-wasm` for browser-side transpilation of adapters.

---

## Phase 0 — Config Foundations [COMPLETE]

- schema validator
- precedence resolver
- project sync model

---

## Phase 1 — Runtime Integration [COMPLETE]

- replace markdown preview
- integrate MDX compiler
- adapter loading

**Note on Final Implementation:** Implemented a robust `compileMdx` pipeline that uses `try/catch` and `let` for MDX fallback assignments. This allows the runtime to catch missing component references and render placeholders instead of throwing hard errors that crash the preview.

---

## Phase 2 — Plugin System [COMPLETE]

- plugin manifest loader
- context merging
- diagnostics UI

---

## Phase 3 — Init Flows [COMPLETE]

- CLI init
- web setup wizard

---

## Phase 4 — Hardening [COMPLETE]

- performance optimization
- auto sync
- improved error UX
- atomic repository initialization (batch commits)
- local esbuild.wasm hosting

---

## Phase 5 — Plugin UX Preparation [COMPLETE]

- metadata definitions
- extension points
- diagnostics panel refinement

---

# 7. Minimal Prototype — File Structure

    prototype/
     ├── PreviewRuntime.tsx
     ├── PreviewStatus.tsx
     ├── compileMdx.ts
     ├── transformImports.ts
     ├── evaluateMdx.ts
     ├── adapter.ts
     ├── ErrorBoundary.tsx
     └── index.tsx

---

# 8. Pseudocode Blueprint (≈300‑Line Mental Model)

## adapter.ts

```ts
export const adapter = {
  components: { DocsImage },
  scope: { DOCS_SETUP_MEDIA },
  allowImports: {
    "@/components": { DocsImage },
  },
};
```

---

## transformImports.ts

```ts
export function transformImports(ast, allowImports) {
  const imports = collectImports(ast);

  for (const imp of imports) {
    if (!allowImports[imp.source]) {
      throw new Error("Import not allowed");
    }
  }

  removeImportNodes(ast);

  return generateRuntimeBindings(imports);
}
```

---

## compileMdx.ts

```ts
import { compile } from "@mdx-js/mdx";

export async function compileMdx(source) {
  // Uses targeted regex to replace const { with let { for fallbacks
  return compile(source, {
    outputFormat: "function-body",
  });
}
```

---

## evaluateMdx.ts

```ts
export function evaluateMdx(code, context) {
  // Uses aligned key/value mapping to prevent misaligned scope
  const fn = new Function(...Object.keys(context), code);
  return fn(...Object.values(context));
}
```

---

## ErrorBoundary.tsx

```tsx
export class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <div>Preview Error</div>;
    }
    return this.props.children;
  }
}
```

---

## PreviewRuntime.tsx

```tsx
export function PreviewRuntime({ source }) {
  const [Component, setComponent] = useState(null);

  useEffect(() => {
    async function run() {
      const compiled = await compileMdx(source);
      const context = buildContext(adapter);
      // Clears preview on compilation error to prevent stale content
      const Comp = evaluateMdx(compiled, context);
      setComponent(() => Comp);
    }
    run();
  }, [hash(source)]);

  return <ErrorBoundary>{Component && <Component />}</ErrorBoundary>;
}
```

---

# 9. Progress Tracking

Each phase must define:

- [COMPLETE] Deliverables
- [COMPLETE] Acceptance tests
- [COMPLETE] Known risks
- [COMPLETE] Performance checks

This document is now finalized following full implementation and UI polish.

---

# 10. Development Rules

1.  Never add config before runtime stability.
2.  Never execute unknown imports.
3.  Preview must never crash editor.
4.  Prototype must pass exit criteria before Phase 0.
5.  This document remains the authoritative roadmap.

---

# 11. Final Principle

> Build the smallest working MDX runtime first. Everything else scales
> from proven execution.

---

# UI Polish & Issues [COMPLETE]

- **Smooth Transitions**: Implemented opacity-based fade-in when switching between file previews or when compilation finishes.
- **Skeleton Placeholders**: Replaced "Initializing runtime..." text with high-fidelity skeleton loaders that match MDX content structure.
- **Diagnostics UI**: Unified compilation status and warnings into a single "Status Pill" in the Preview header.
- **Placeholder Styling**: Refined "Missing Component" boxes to use a professional "Dev Placeholder" aesthetic.
- **Empty State Enhancement**: Added a polished "Ready to Render" state for the Studio preview when no file is selected.
- **Stable Previews**: Fixed infinite loops by stabilizing resolver props and using ref-based diagnostics synchronization.

---

# Mirror Architecture (High-Fidelity Editor) [COMPLETE]

- **Live Bridge**: Implemented `RepoJsxBridge` to render actual repository React components directly inside the MDXEditor WYSIWYG canvas.
- **Dynamic Discovery**: Added automatic component extraction from repository adapters, making them available in the editor's schema.
- **Config-Driven Descriptors**: Extended `repopress.config.json` with a `components` block to define component signatures and prop types.
- **Insert Menu**: Added a dynamic "JSX" insertion dropdown to the Studio toolbar that automatically lists all discovered and configured components.
- **Visual Parity**: Achieved 100% visual identity between the Editor and Preview by sharing the same transpiled component implementations and asset resolution logic.

---

END OF DOCUMENT

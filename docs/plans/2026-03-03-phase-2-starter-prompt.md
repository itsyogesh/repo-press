# Starter Prompt for Claude — RepoPress Phase 2

You are working in the RepoPress repository.

Implement Phase 2 from this plan file:
`docs/plans/2026-03-03-phase-2-two-way-component-authoring-plan.md`

Execution requirements:

1. Follow the plan exactly, phase-by-phase, without changing phase order.
2. Keep the registry architecture strict:
   - `component-registry.ts` is the single runtime source of truth.
   - Catalog is only a UI projection from registry.
3. Use an intermediate `ComponentNode` model between form state and serializer.
4. Serializer requirements:
   - Deterministic output.
   - Lexicographically normalized prop ordering.
   - Self-closing nodes must be single-line JSX.
5. Extend `RepoComponentDef` with:
   - `version?: number`
   - `displayName?: string`
   - `description?: string`
   - optional capability flags (`inline`, `media`, `configurable`).
6. Enforce editor-preview sync contract:
   - Preview updates must derive solely from MDX source state changes.
   - No direct preview mutation from form/modal/registry state.
7. Media upload behavior:
   - Blob primary.
   - GitHub fallback.
8. Preserve existing behavior unless explicitly changed by the plan.
9. Add/adjust tests per plan (unit + integration/regression).
10. After implementation:
   - Run lint, typecheck, and relevant tests.
   - Provide a concise change summary by phase.
   - Report any deviations and why.

Start with Phase 1 foundations and do not skip ahead.

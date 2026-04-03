# Improve Studio Editor & JSX+ Component Insertion UX

## Summary

The Studio editor's JSX+ component insertion flow has critical UX gaps: no form validation (broken components can be inserted), no error/success feedback, missing required-field indicators, and no way to edit components after insertion. The overall studio editor also lacks onboarding, connection status, and discoverability features. This plan addresses these issues in three prioritized phases.

## Context

A comprehensive UX audit was conducted covering the end-to-end JSX+ flow (trigger → pick → configure → insert → post-insert) and the overall studio editor layout. The audit identified 5 critical issues, 9 high-friction issues, and 10 medium polish items.

**Key files involved:**
- `components/studio/insert-jsx-button.tsx` — JSX+ trigger button
- `components/studio/component-insert-modal.tsx` — Two-step pick/configure modal
- `components/studio/component-prop-form.tsx` — Dynamic prop form
- `components/studio/component-preview.tsx` — Blueprint wireframe previews
- `components/studio/studio-layout.tsx` — Main layout (1,700+ lines)
- `components/studio/studio-header.tsx` — Header bar
- `components/studio/studio-toolbar.tsx` — Editor toolbar
- `components/studio/studio-footer.tsx` — Status footer
- `components/studio/repo-jsx-bridge.tsx` — Rendered component bridge
- `lib/studio/component-registry.ts` — Component definition types
- `lib/studio/component-catalog.ts` — Catalog projection

**Design decisions confirmed:**
- Primary users: Technical content writers (know MDX, basic JSX)
- JSX+ is occasional use (~20%); optimize for discoverability
- Keep centered modal pattern (current approach)
- Component count varies (5–60+); needs scalable filtering
- Strict validation — block insert until required fields filled
- JSX code preview: toggleable, collapsed by default
- Click-to-edit inserted components: yes (high priority)
- Add onboarding tips and feature discovery
- Mobile: basic viewing only, editing is desktop
- i18n: not needed, English only

## Goals (Success-focused)

- **Primary:** Eliminate broken component insertions by enforcing prop validation with clear required-field indicators and error messaging.
- **Secondary:** Reduce friction in the JSX+ flow with keyboard shortcuts, better visual hierarchy, category grouping, and JSX code preview.
- **Tertiary:** Improve studio editor discoverability with onboarding hints, connection status, and better feedback surfaces.

## Success Criteria / Acceptance

- [ ] Required props are visually marked with `*` and red accent; insert button is disabled until all required fields are filled.
- [ ] Toast notification appears after successful JSX insertion with component name and undo action.
- [ ] Error toast appears if insertion fails (currently errors are console-only).
- [ ] `⌘J` keyboard shortcut opens the component insertion modal.
- [ ] Component button in toolbar has accent styling distinguishing it from formatting tools.
- [ ] When no components are registered, button shows disabled state with explanatory tooltip.
- [ ] Enum/select prop type renders a `<Select>` dropdown when `options` array is present on a prop definition.
- [ ] Component picker supports category grouping with filter chips (All, Media, Layout, Content, Custom).
- [ ] Recently used components section appears at top of picker (persisted in localStorage).
- [ ] JSX code preview is available in configure step (toggleable, collapsed by default).
- [ ] Field descriptions render below inputs when `description` is present on prop definition.
- [ ] Clicking an inserted component in the editor reopens the prop configuration modal.
- [ ] First-run onboarding shows 3 dismissible hints (⌘K, panel resize, Component button).
- [ ] Connection status dot appears in footer (green=connected, red=disconnected).
- [ ] "Saved Xm ago" timestamp appears near the Save button in header.

## Scope

### In-scope
- JSX+ flow improvements (all 5 steps: trigger, pick, configure, insert, post-insert)
- Prop form validation, required indicators, error messaging
- Component picker grouping, filtering, recently-used
- JSX code preview in configure step
- Click-to-edit for inserted components
- Studio header/footer feedback improvements
- First-run onboarding hints
- `RepoComponentPropDef` type extensions (required, description, options, placeholder, validation)

### Out-of-scope
- Studio layout decomposition (1,700-line file refactor — separate effort)
- MDXEditor core modifications (undo/redo system, source mode improvements)
- Mobile editing experience (only basic viewing is supported)
- Internationalization (English only)
- New component types or adapter changes
- Publish flow or git commit workflow changes
- Real-time collaborative editing

## Non-goals
- Building a full design system overhaul
- Adding drag-and-drop component reordering
- Supporting custom themes for the studio editor
- Adding component marketplace or external registry

## Assumptions

- `RepoComponentPropDef` type in `component-registry.ts` can be extended with new optional fields without breaking existing configs.
- MDXEditor's `insertJsx$` publisher continues to work as the insertion mechanism.
- localStorage is available for persisting recently-used components and onboarding state.
- Sonner toast system is used for all notifications (already in place).
- shadcn/ui `Select`, `Badge`, `Tooltip`, `Collapsible` components are already installed.
- Convex connection status can be read via `useConvex()` hook.

## Dependencies

- No external dependencies. All required UI components (shadcn/ui) are already installed.
- MDXEditor's JSX plugin API must support the current `insertJsx$` / `JsxComponentDescriptor` pattern (no changes expected).

## Proposed Approach

### Phase 1: Quick Wins (P0) — Critical fixes with low effort

Focus on the 5 most impactful, lowest-effort improvements that fix broken behavior.

**1.1 — Required field indicators + validation**
- Extend `RepoComponentPropDef` type with `required?: boolean`, `description?: string`, `options?: string[]`, `placeholder?: string`
- Add red `*` next to required field labels
- Track missing required fields in form state
- Disable Insert button when required fields are empty; show inline message listing missing fields
- Add field-level error styling (red border + message)
- Update `KNOWN_ADAPTER_FALLBACKS` with appropriate `required` flags

**1.2 — Error/success feedback on insertion**
- In `InsertJsxButton.handleInsert`: add `toast.success()` on successful insert with component name
- In catch block: replace `console.error` with `toast.error()` showing user-friendly message
- Add undo action to success toast (triggers `document.execCommand('undo')` or editor undo)

**1.3 — ⌘J keyboard shortcut**
- Register `⌘J` / `Ctrl+J` in `studio-layout.tsx` keyboard handler
- Dispatch custom event or use ref to trigger modal open
- Add shortcut to keyboard shortcuts dialog
- Add "Insert component" action to command palette with `⌘J` shortcut hint

**1.4 — Accent-styled Component button**
- Rename label from "JSX" to "Component" with leading `Plus` icon
- Add accent background tint: `bg-studio-accent/10 text-studio-accent border-studio-accent/20`
- Add tooltip with keyboard shortcut: "Insert component (⌘J)"

**1.5 — Disabled state when no components**
- Replace `return null` with disabled button + tooltip: "No components configured — check project settings"
- Link tooltip to project settings or docs

### Phase 2: Core Experience (P1) — Feature improvements

**2.1 — Enum/Select prop type**
- When `propDef.options` array is present, render `<Select>` dropdown instead of `<Input>`
- Support both string options (`["info", "warning", "error"]`) and label-value pairs
- Pre-select default value if `propDef.default` matches an option

**2.2 — Category grouping + filter chips**
- Add category derivation logic to `component-catalog.ts`:
  - Media: components with `capabilities.media`
  - Layout: components like Card, Tabs, Steps, Accordion
  - Content: Callout, Badge, Button, etc.
  - Custom: components from project config (`source === "config"`)
- Render filter chip row below search: `[All] [Media] [Layout] [Content] [Custom]`
- When <10 components, show flat list (no categories)
- When ≥10, group under category headings

**2.3 — Recently used components**
- Track last 6 inserted components in `localStorage` key `studio:recentComponents`
- Show "Recently Used" section above the main gallery when items exist
- Single row of up to 4 cards with "Recently Used" label

**2.4 — Toggleable JSX code preview**
- In configure step's left panel, add a `<Collapsible>` below the visual preview
- Label: "Show JSX Code" / "Hide JSX Code" (collapsed by default)
- Content: `<pre>` block with monospace font showing `serializeComponentNode()` output
- Updates live as form values change

**2.5 — Field descriptions and hints**
- Render `propDef.description` as `text-[11px] text-muted-foreground` below each input
- Add `placeholder` support from `propDef.placeholder`
- Show helper text for expression fields: "JSX expression, e.g. {variable}"

### Phase 3: Structural Improvements (P2) — Higher effort

**3.1 — Click-to-edit inserted components**
- In `repo-jsx-bridge.tsx`, add an "Edit" button to the component hover overlay
- On click, open `ComponentInsertModal` in "configure" mode pre-populated with current prop values
- On "Update", re-serialize the component node and replace the existing JSX in the editor
- Handle the case where component definition is no longer in registry (show warning)
- This requires extracting props from the MDX AST node and mapping back to form state

**3.2 — First-run onboarding hints**
- Check `localStorage.getItem("studio:onboarded")` on mount
- Show 3 sequential, dismissible hint callouts:
  1. "Press ⌘K to search files and run actions" (near command palette area)
  2. "Drag the divider to resize panels" (near panel divider)
  3. "Use the Component button to insert JSX blocks" (near toolbar)
- Mark onboarded after all dismissed or after 3rd session
- Use `Popover` or custom `Tooltip` anchored to target elements

**3.3 — Studio header/footer feedback**
- Header: Add "Saved Xm ago" timestamp next to Save button (using `formatDistanceToNow`)
- Footer: Add Convex connection status dot (green/red) with "Connected"/"Disconnected" label
- Footer: Add file modified indicator
- Tab bar: Add unsaved dot indicator (● before filename) for modified files

## Milestones & Tasks

### Phase 1 — Quick Wins (P0)
- [ ] Extend `RepoComponentPropDef` type with `required`, `description`, `options`, `placeholder` fields — `lib/studio/component-registry.ts`
- [ ] Update `KNOWN_ADAPTER_FALLBACKS` with `required` flags for known components — `lib/studio/component-registry.ts`
- [ ] Add required indicator (`*`) and field-level error styling — `components/studio/component-prop-form.tsx`
- [ ] Add validation state tracking and disable Insert when missing required — `components/studio/component-insert-modal.tsx`
- [ ] Replace `console.error` with `toast.error()` + add `toast.success()` — `components/studio/insert-jsx-button.tsx`
- [ ] Register `⌘J` shortcut in keyboard handler — `components/studio/studio-layout.tsx`
- [ ] Add "Insert component" to command palette — `components/studio/command-palette.tsx`
- [ ] Restyle Component button with accent tint, rename label, add tooltip — `components/studio/insert-jsx-button.tsx`
- [ ] Add disabled state with tooltip when no components — `components/studio/insert-jsx-button.tsx`
- [ ] Add `⌘J` to keyboard shortcuts dialog — `components/studio/studio-layout.tsx`

### Phase 2 — Core Experience (P1)
- [ ] Implement enum/select prop rendering when `options` present — `components/studio/component-prop-form.tsx`
- [ ] Add category derivation logic — `lib/studio/component-catalog.ts`
- [ ] Add filter chip row to picker — `components/studio/component-insert-modal.tsx`
- [ ] Add category group headings (when ≥10 components) — `components/studio/component-insert-modal.tsx`
- [ ] Implement recently-used tracking (localStorage) — `components/studio/component-insert-modal.tsx`
- [ ] Add recently-used section to picker — `components/studio/component-insert-modal.tsx`
- [ ] Add collapsible JSX code preview to configure step — `components/studio/component-insert-modal.tsx`
- [ ] Add description/placeholder rendering to prop fields — `components/studio/component-prop-form.tsx`

### Phase 3 — Structural (P2)
- [ ] Add "Edit" button overlay to rendered components — `components/studio/repo-jsx-bridge.tsx`
- [ ] Implement edit mode for ComponentInsertModal (pre-populated props, "Update" action) — `components/studio/component-insert-modal.tsx`
- [ ] Implement prop extraction from MDX AST nodes — `lib/studio/component-node.ts`
- [ ] Build onboarding hint system with localStorage tracking — `components/studio/studio-onboarding.tsx` (new)
- [ ] Add "Saved Xm ago" to header — `components/studio/studio-header.tsx`
- [ ] Add connection status to footer — `components/studio/studio-footer.tsx`
- [ ] Add unsaved dot on file tabs — `components/studio/studio-layout.tsx`

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `RepoComponentPropDef` type change breaks existing configs | All new fields are optional; existing configs continue to work unchanged |
| Click-to-edit requires AST manipulation that MDXEditor doesn't expose | Use MDXEditor's `JsxComponentDescriptor.Editor` to access MDAST node props directly |
| Recently-used localStorage grows unbounded | Cap at 6 entries per project, rotate FIFO |
| Onboarding hints anchor to elements that may not exist (collapsed sidebar) | Only show hints for visible elements; skip if target not in DOM |
| ⌘J conflicts with existing shortcuts in some apps/browsers | Check for conflicts; use `e.preventDefault()` only when studio is focused |

## Open Questions

1. Should the `required` flag on props come from project config (`repopress.config.json`) or be inferred from adapter metadata?
2. Should click-to-edit use the same modal or a smaller inline popover for quick prop changes?
3. Should recently-used components be per-project or global across all projects?

## Acceptance & QA Checklist

### Phase 1 Verification
1. Open studio editor, click Component button → modal opens
2. Press ⌘J → modal opens (even when no button is visible)
3. Select a component with required props → required indicators visible
4. Try to insert without filling required fields → button disabled, message shown
5. Fill all required fields → button enabled, click Insert → success toast appears
6. Trigger an insert error (e.g., invalid state) → error toast appears
7. When no components registered → disabled button with tooltip explanation

### Phase 2 Verification
1. Open picker with 10+ components → category groups and filter chips visible
2. Click "Media" chip → only media components shown
3. Insert a component → appears in "Recently Used" on next open
4. Select a component with enum prop → dropdown renders with options
5. In configure step → expand "Show JSX Code" → live preview updates as props change
6. Prop description text visible below fields that have descriptions

### Phase 3 Verification
1. Click an inserted component in editor → edit modal opens with current props
2. Modify props and click "Update" → component in editor updates
3. First visit to studio → onboarding hints appear one by one
4. Dismiss all hints → they don't reappear on next visit
5. Footer shows green dot when connected, red when offline
6. Header shows "Saved Xm ago" after saving

## Docs / Files to Update

- `CLAUDE.md` / `AGENTS.md` — Document new `RepoComponentPropDef` fields
- `README.md` — Update "Supported component props" section if it exists
- Keyboard shortcuts dialog — Add ⌘J entry
- `repopress.config.json` — Document new prop definition fields in config schema

## Reviewers and Approvers

- Reviewers: @itsYogesh
- Approver: @itsYogesh (final approval required to merge)

## Next Steps

1. Review and approve this plan.
2. Create feature branch `feature/studio-jsx-ux-improvements`.
3. Implement Phase 1 (quick wins) as a single PR.
4. Implement Phase 2 as a follow-up PR.
5. Implement Phase 3 as a third PR (may be split further).

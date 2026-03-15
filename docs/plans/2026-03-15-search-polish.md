# Search Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance the search input in the Studio layout with a KBD shortcut indicator and a clear button.

**Architecture:** Use absolute positioning within a relative container for the KBD indicator and Clear button. Sync the visibility of the Clear button with the search query state.

**Tech Stack:** React, Tailwind CSS (v4), Lucide icons, shadcn/ui Input.

---

### Task 1: Add Search Input Ref and Focus Logic

**Files:**

- Modify: `components/studio/studio-layout.tsx`

**Step 1: Add a ref for the search input**

```typescript
// Inside StudioLayoutInner component
const searchInputRef = React.useRef<HTMLInputElement>(null);
```

**Step 2: Update the Input to use the ref**

```typescript
// Around line 1348
<Input
  ref={searchInputRef}
  value={emptySearch}
  // ...
/>
```

**Step 3: Commit**

```bash
git add components/studio/studio-layout.tsx
git commit -m "chore: add ref to search input for focus management"
```

---

### Task 2: Implement KBD Indicator and Clear Button UI

**Files:**

- Modify: `components/studio/studio-layout.tsx`

**Step 1: Wrap Input in a relative container and add KBD/Clear button**

```typescript
// Replace lines 1346-1361
<div className="relative group">
  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-studio-fg-muted" />
  <Input
    ref={searchInputRef}
    value={emptySearch}
    onChange={(e) => setEmptySearch(e.target.value)}
    onKeyDown={(e) => {
      if (e.key !== "Enter") return
      const firstResult = hasEmptySearchQuery ? emptySearchResults[0] : recentFileResults[0]
      if (firstResult) {
        navigateToFile(firstResult.path)
      }
    }}
    className="h-11 pl-10 pr-10" // Increased right padding for KBD/X
    placeholder="Search docs..."
  />
  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
    {hasEmptySearchQuery ? (
      <button
        type="button"
        onClick={() => {
          setEmptySearch("")
          searchInputRef.current?.focus()
        }}
        className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
        aria-label="Clear search"
      >
        <X className="h-4 w-4 text-studio-fg-muted" />
      </button>
    ) : (
      <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-studio-border bg-studio-canvas-inset px-1.5 font-mono text-[10px] font-medium text-studio-fg-muted opacity-60 sm:flex">
        <span className="text-xs">/</span>
      </kbd>
    )}
  </div>
</div>
```

**Step 2: Add global keyboard shortcut for '/'**

```typescript
// Inside handleKeyDown in useEffect (around line 1007)
if (e.key === "/" && !isEditableTarget) {
  e.preventDefault();
  searchInputRef.current?.focus();
  return;
}
```

**Step 3: Verify interaction**

- Typing in search shows 'X' button.
- Clicking 'X' button clears input and focuses it.
- Pressing '/' when not in input focuses input.

**Step 4: Commit**

```bash
git add components/studio/studio-layout.tsx
git commit -m "feat: add KBD indicator and clear button to search input"
```

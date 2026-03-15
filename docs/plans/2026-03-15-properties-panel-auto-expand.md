# Properties Panel Auto-Expand Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically expand the frontmatter panel if `title` or `date` are empty, unless the user manually collapsed it.

**Architecture:** Use `userInteracted` state to guard the auto-expand logic. Reset guard on `filePath` change. Use `useEffect` to trigger expansion.

**Tech Stack:** React, Next.js, shadcn/ui (Collapsible).

---

### Task 1: Add State and Guard Logic

**Files:**

- Modify: `components/studio/frontmatter-panel.tsx`

**Step 1: Add userInteracted state**
Add `const [userInteracted, setUserInteracted] = React.useState(false)` near other state hooks.

**Step 2: Add effect to reset guard on filePath change**

```typescript
React.useEffect(() => {
  setUserInteracted(false);
}, [filePath]);
```

**Step 3: Add effect for auto-expansion intelligence**

```typescript
React.useEffect(() => {
  if (userInteracted) return;

  const hasMissingFields = !frontmatter.title || !frontmatter.date;
  if (hasMissingFields && !isOpen) {
    setIsOpen(true);
  }
}, [frontmatter.title, frontmatter.date, userInteracted, isOpen]);
```

**Step 4: Update Collapsible onOpenChange**
Update the `Collapsible` component to set `userInteracted` to `true`.

```typescript
<Collapsible
  open={isOpen}
  onOpenChange={(open) => {
    setIsOpen(open)
    setUserInteracted(true)
  }}
  ...
>
```

**Step 5: Verify manually**
Since we don't have a visual test runner here, we'll verify via code inspection and build check.

**Step 6: Commit**

```bash
git add components/studio/frontmatter-panel.tsx
git commit -m "feat(studio): auto-expand properties panel for missing metadata"
```

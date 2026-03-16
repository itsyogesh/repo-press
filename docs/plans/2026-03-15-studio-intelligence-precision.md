# Studio Intelligence & Precision Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance RepoPress Studio with intelligent automation (auto-expanding properties), refined motion (staggered component reveals), and high-precision visual feedback in the Explorer.

**Architecture:** 
- State-driven "intelligent" components.
- CSS-utility driven skeleton textures.
- Variant-based Framer Motion animations.

**Tech Stack:** React 19, Framer Motion, Lucide, Tailwind v4.

---

### Task 1: Intelligence - Properties Panel

**Files:**
- Modify: `components/studio/frontmatter-panel.tsx`

**Step 1: Implement Intelligent Expansion**
Add logic to monitor `frontmatter`. If `title` or `date` are missing, and user hasn't manually collapsed, set `isOpen` to true.

**Step 2: Commit**
```bash
git add components/studio/frontmatter-panel.tsx
git commit -m "feat: add intelligent auto-expansion to properties panel"
```

### Task 2: Discovery - Component Grid Motion

**Files:**
- Modify: `components/studio/component-insert-modal.tsx`

**Step 1: Implement Staggered Reveal**
Update `CatalogGallery` with Framer Motion container/item variants for a cascading entrance effect.

**Step 2: Commit**
```bash
git add components/studio/component-insert-modal.tsx
git commit -m "style: add staggered reveal animation to component gallery"
```

### Task 3: Precision - Explorer Active Item

**Files:**
- Modify: `components/studio/file-tree-item.tsx`

**Step 1: Enhance Active Highlight**
Add a 2px vertical left accent line and increase border contrast for the `isSelected` state.

**Step 2: Commit**
```bash
git add components/studio/file-tree-item.tsx
git commit -m "style: improve active file visibility in explorer"
```

### Task 4: Interaction - Search Polish

**Files:**
- Modify: `components/studio/studio-layout.tsx`

**Step 1: Add Search UI Enhancements**
Add KBD shortcut indicator and a "Clear" button to the file search input.

**Step 2: Commit**
```bash
git add components/studio/studio-layout.tsx
git commit -m "feat: add keyboard shortcut and clear button to search"
```

### Task 5: Character - Creation Sheet Visuals

**Files:**
- Modify: `components/studio/smart-create-file-dialog.tsx`

**Step 1: Add Watermark Icon**
Inject a large technical icon (Lucide) with ultra-low opacity into the sheet background.

**Step 2: Commit**
```bash
git add components/studio/smart-create-file-dialog.tsx
git commit -m "style: add technical watermark to creation sheet"
```

### Task 6: Aesthetic - Grid Skeletons

**Files:**
- Modify: `components/studio/skeleton.tsx`

**Step 1: Add Architectural Texture**
Update the base `Skeleton` component to utilize the `bg-grid-small` utility.

**Step 2: Commit**
```bash
git add components/studio/skeleton.tsx
git commit -m "style: add grid texture to skeletons"
```

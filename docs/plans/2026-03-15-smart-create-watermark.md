# Smart Create Watermark Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Inject a large `DraftingCompass` icon as a background watermark in the `SmartCreateFileDialog` to provide a "blueprint" feel.

**Architecture:** Absolute positioning of the icon within the `SheetContent` with ultra-low opacity and disabled pointer events.

**Tech Stack:** Next.js, Tailwind CSS, Lucide React.

---

### Task 1: Add Watermark Icon

**Files:**

- Modify: `components/studio/smart-create-file-dialog.tsx`

**Step 1: Add import for DraftingCompass**

```tsx
import { DraftingCompass } from "lucide-react";
```

**Step 2: Update SheetContent with relative positioning and overflow control**
Update line 226:

```tsx
<SheetContent className="relative overflow-hidden flex flex-col w-full sm:max-w-lg p-0">
```

**Step 3: Insert the watermark icon**
Insert after `<SheetContent>`:

```tsx
<DraftingCompass
  className="absolute bottom-[-10%] right-[-10%] w-96 h-96 text-foreground opacity-[0.03] pointer-events-none transition-opacity duration-1000"
  aria-hidden="true"
/>
```

**Step 4: Verify classes and accessibility**
Ensure `pointer-events-none` is present.

**Step 5: Commit changes**

```bash
git add components/studio/smart-create-file-dialog.tsx
git commit -m "feat(studio): add architectural watermark to smart create file dialog"
```

# Project Deletion & Settings Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a comprehensive project deletion feature with cascading cleanup across 11 Convex tables and a verification-based UI.

**Architecture:**

- **Backend**: Single atomic mutation `projects:removeFull` in Convex to handle complex cascading deletions.
- **Frontend**: New settings route at `/settings` with a Danger Zone section and confirmation dialog.
- **Security**: Verifies project ownership and requires explicit name entry for destructive actions.

**Tech Stack:** Convex, Next.js (App Router), Tailwind CSS, shadcn/ui (Alert, Dialog, Button).

---

### Task 1: Backend Cascading Deletion Mutation [COMPLETE]

**Files:**

- Modify: `convex/projects.ts`

**Step 1: Implement removeFull mutation**

---

### Task 2: Settings Page UI Shell [COMPLETE]

**Files:**

- Create: `app/dashboard/[owner]/[repo]/settings/page.tsx`
- Modify: `components/studio/studio-sidebar.tsx` (or similar for navigation)

---

### Task 3: Danger Zone & Deletion Modal [COMPLETE]

**Files:**

- Create: `components/settings/delete-project-zone.tsx`

---

### Task 4: Final Integration & End-to-End Test [COMPLETE]

**Step 1: Wire up the settings page with real data**
**Step 2: Verify deletion cascades correctly in Convex dashboard**
**Step 3: Verify redirect and success states**
**Step 4: Commit final integration**

```bash
git commit -m "feat: complete project deletion feature"
```

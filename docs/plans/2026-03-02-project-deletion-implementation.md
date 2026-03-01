# Project Deletion & Settings Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a comprehensive project deletion feature with cascading cleanup across 11 Convex tables and a verification-based UI.

**Architecture:**
- **Backend**: Single atomic mutation `projects:removeFull` in Convex to handle complex cascading deletions.
- **Frontend**: New settings route at `/settings` with a Danger Zone section and confirmation dialog.
- **Security**: Verifies project ownership and requires explicit name entry for destructive actions.

**Tech Stack:** Convex, Next.js (App Router), Tailwind CSS, shadcn/ui (Alert, Dialog, Button).

---

### Task 1: Backend Cascading Deletion Mutation

**Files:**
- Modify: `convex/projects.ts`

**Step 1: Implement removeFull mutation**

```typescript
// Add to convex/projects.ts

export const removeFull = mutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Unauthorized");

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new ConvexError("Project not found");

    // Ownership check
    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
    if (!user || project.userId !== user._id) throw new ConvexError("Unauthorized");

    // 1. Delete Document History for all documents in project
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const doc of docs) {
      const history = await ctx.db
        .query("documentHistory")
        .withIndex("by_documentId", (q) => q.eq("documentId", doc._id))
        .collect();
      for (const entry of history) {
        await ctx.db.delete(entry._id);
      }
      await ctx.db.delete(doc._id);
    }

    // 2. Delete associated entities
    const tables = [
      "collections",
      "authors",
      "tags",
      "categories",
      "folderMeta",
      "mediaAssets",
      "webhooks",
      "explorerOps",
      "publishBranches"
    ] as const;

    for (const table of tables) {
      const records = await ctx.db
        .query(table as any)
        .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
        .collect();
      for (const record of records) {
        await ctx.db.delete(record._id);
      }
    }

    // 3. Delete the project itself
    await ctx.db.delete(args.projectId);
    return null;
  },
});
```

**Step 2: Commit backend changes**

```bash
git add convex/projects.ts
git commit -m "feat(backend): implement cascading project deletion mutation"
```

---

### Task 2: Settings Page UI Shell

**Files:**
- Create: `app/dashboard/[owner]/[repo]/settings/page.tsx`
- Modify: `components/studio/studio-sidebar.tsx` (or similar for navigation)

**Step 1: Create settings page basic structure**

```tsx
// app/dashboard/[owner]/[repo]/settings/page.tsx
import { getGitHubToken } from "@/lib/auth-server";
import { redirect } from "next/navigation";
// ... imports

export default async function SettingsPage({ params }) {
  const { owner, repo } = await params;
  const token = await getGitHubToken();
  if (!token) redirect("/login");

  return (
    <div className="container max-w-4xl py-10">
      <h1 className="text-3xl font-bold mb-8">Project Settings</h1>
      {/* Settings Sections */}
      <div className="space-y-6">
        {/* Placeholder for project selector and danger zone */}
      </div>
    </div>
  );
}
```

**Step 2: Add navigation link to Studio/Dashboard**

**Step 3: Commit UI shell**

```bash
git add app/dashboard/[owner]/[repo]/settings/page.tsx
git commit -m "feat(ui): add project settings page route"
```

---

### Task 3: Danger Zone & Deletion Modal

**Files:**
- Create: `components/settings/delete-project-zone.tsx`

**Step 1: Implement DeleteProjectZone with confirmation logic**

```tsx
"use client"
// ... imports (AlertDialog, Input, Button, toast)

export function DeleteProjectZone({ project }) {
  const [confirmName, setConfirmName] = useState("");
  const remove = useMutation(api.projects.removeFull);
  
  const handleDelete = async () => {
    if (confirmName !== project.name) return;
    await remove({ projectId: project._id });
    toast.success("Project deleted successfully");
    router.push(`/dashboard/${project.repoOwner}/${project.repoName}`);
  };

  return (
    <div className="border border-red-200 rounded-lg p-6 bg-red-50/50">
      <h2 className="text-red-800 font-bold mb-2">Danger Zone</h2>
      <p className="text-sm text-red-700 mb-4">Deleting this project will permanently remove all drafts, history, and metadata.</p>
      
      <AlertDialog>
        {/* Verification UI: Input must match project.name */}
      </AlertDialog>
    </div>
  );
}
```

**Step 2: Commit components**

```bash
git add components/settings/delete-project-zone.tsx
git commit -m "feat(ui): implement danger zone with name verification"
```

---

### Task 4: Final Integration & End-to-End Test

**Step 1: Wire up the settings page with real data**
**Step 2: Verify deletion cascades correctly in Convex dashboard**
**Step 3: Verify redirect and success states**
**Step 4: Commit final integration**

```bash
git commit -m "feat: complete project deletion feature"
```

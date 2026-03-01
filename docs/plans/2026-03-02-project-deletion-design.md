# Design: Project Deletion & Danger Zone

## Status: Approved
## Date: 2026-03-02

---

## 1. Overview
Implement a comprehensive "Delete Project" feature for RepoPress. This involves creating a dedicated Project Settings page with a "Danger Zone" that handles the cascading deletion of all associated data in Convex while respecting the `repopress.config.json` as the source of truth.

## 2. Architecture

### Backend (Convex)
A new mutation `projects:removeFull` will be created in `convex/projects.ts`. 

**Cascading Logic:**
1.  **Auth Check**: Verify the project exists and belongs to the authenticated user.
2.  **Document Cleanup**: 
    *   Find all `documents` for `projectId`.
    *   For each `document`, delete all `documentHistory` records.
    *   Delete the `documents`.
3.  **Entity Cleanup**: Delete all records referencing `projectId` in:
    *   `collections`
    *   `authors`
    *   `tags`
    *   `categories`
    *   `folderMeta`
    *   `mediaAssets`
    *   `webhooks`
    *   `explorerOps`
    *   `publishBranches`
4.  **Final Step**: Delete the `projects` record itself.

### Frontend (Next.js)
- **New Route**: `app/dashboard/[owner]/[repo]/settings/page.tsx`
- **Component**: `DangerZone`
    - Displays a red-bordered section at the bottom of the page.
    - Includes a "Delete Project" button.
- **Confirmation Flow**:
    - Uses shadcn/ui `AlertDialog`.
    - If `frameworkSource === "config"`, displays a specific warning about the project reappearing unless removed from `repopress.config.json` on GitHub.
    - Requires the user to type the **Project Name** to confirm deletion.

## 3. Implementation Plan

1. **[Backend]** Implement `projects:removeFull` mutation with full cascading logic.
2. **[UI]** Create the Settings page layout and add it to the dashboard navigation.
3. **[UI]** Implement the `DeleteProjectZone` with the confirmation modal and verification input.
4. **[Integration]** Wire the UI to the mutation and implement the redirect/success toast logic.

## 4. Starter Prompt for Execution
> "Implement the Project Deletion feature based on `docs/plans/2026-03-02-project-deletion-design.md`. Start by creating the `removeFull` mutation in `convex/projects.ts` that handles cascading deletes for all 11 associated tables, ensuring it follows Convex best practices (validators, return types, idempotent logic). Then, implement the Settings page at `app/dashboard/[owner]/[repo]/settings` with a Danger Zone and a verification-based deletion modal."

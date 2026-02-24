# CLAUDE.md - RepoPress Development Guide

This file contains all the context and conventions you need to work on RepoPress effectively.

## What is RepoPress?

A Git-native headless CMS that connects to GitHub repos and provides visual MDX editing with draft/publish workflows. Content stays in Git. State (drafts, history, projects, taxonomy) lives in Convex.

## Architecture Overview

```
Next.js 16 (App Router) <-> Convex (database + auth) <-> GitHub API (content read/write)
```

- **Next.js 16** -- Frontend pages, server components, route handlers. Turbopack bundler.
- **Convex** -- All persistent data: projects, documents, drafts, history, taxonomy, auth sessions.
- **Better Auth** -- Authentication via GitHub OAuth. Runs INSIDE Convex functions, NOT in Next.js.
- **GitHub API (Octokit)** -- Reading repo contents, committing published files back to GitHub.

### Critical: Auth Architecture

Better Auth with Convex follows a specific pattern. DO NOT try to create a `betterAuth()` instance in Next.js code. The auth instance lives in `convex/auth.ts` and runs within Convex's mutation context.

```
convex/convex.config.ts  -- Registers the betterAuth component
convex/auth.config.ts    -- Auth token configuration
convex/auth.ts           -- Better Auth instance (runs in Convex, NOT Next.js)
convex/http.ts           -- HTTP router that registers auth routes
lib/auth-client.ts       -- Browser-side auth client (uses convexClient plugin)
lib/auth-server.ts       -- Server-side helpers (proxies to Convex via convexBetterAuthNextJs)
app/api/auth/[...all]/   -- Next.js route that proxies auth requests to Convex
```

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js | 16 |
| React | React | 19.2 |
| Styling | Tailwind CSS | v4 (no tailwind.config.js, use globals.css @theme) |
| Components | shadcn/ui | Latest |
| Database | Convex | Latest |
| Auth | Better Auth + @convex-dev/better-auth | Latest |
| GitHub | Octokit (@octokit/rest) | Latest |
| Content | gray-matter, react-markdown, remark-gfm | Latest |

## Project Structure

```
app/                              # Next.js App Router
  api/auth/[...all]/route.ts      # Auth proxy (DO NOT put auth logic here)
  api/github/save/route.ts        # GitHub file save endpoint
  dashboard/                      # Protected pages (require auth)
    [owner]/[repo]/
      blob/[...path]/page.tsx     # File viewer
      setup/page.tsx              # Project setup wizard
      studio/[[...path]]/page.tsx # MDX Studio editor (main editing experience)
    page.tsx                      # Repo list dashboard
  login/page.tsx                  # Login (OAuth + PAT tabs)
  page.tsx                        # Landing page

convex/                           # Convex backend (all database logic)
  schema.ts                       # Full schema (11 tables)
  auth.ts                         # Better Auth instance
  auth.config.ts                  # Token config
  convex.config.ts                # App config (registers betterAuth component)
  http.ts                         # HTTP router
  projects.ts                     # CRUD + getOrCreate, findByRepo
  documents.ts                    # CRUD + getOrCreate, saveDraft, publish, transitionStatus, search
  documentHistory.ts              # Version history queries
  authors.ts                      # Author CRUD
  tags.ts                         # Tag CRUD
  categories.ts                   # Category CRUD (supports nesting via parentId)
  collections.ts                  # Content collection definitions
  mediaAssets.ts                  # Media/asset tracking
  webhooks.ts                     # Webhook CRUD + triggerWebhooks action
  folderMeta.ts                   # Folder meta (sidebar ordering)

components/
  providers.tsx                   # ConvexBetterAuthProvider wrapper
  repo-setup-form.tsx             # Project setup form (uses getOrCreate)
  project-card.tsx                # Project card for dashboard
  studio/                         # Studio components
    studio-layout.tsx             # Main layout (file tree + editor + preview)
    editor.tsx                    # MDX editor with save/publish controls
    preview.tsx                   # Live markdown preview
    file-tree.tsx                 # GitHub file browser
    document-list.tsx             # Convex document list sidebar
    status-actions.tsx            # Status transition dropdown (state machine)
  landing/                        # Landing page sections
  ui/                             # shadcn/ui components

lib/
  auth-client.ts                  # createAuthClient with convexClient plugin
  auth-server.ts                  # convexBetterAuthNextJs helpers + getGitHubToken()
  framework-detector.ts           # Auto-detect framework from repo
  github.ts                       # All GitHub API functions (Octokit)
  utils.ts                        # cn() utility
```

## Database Schema (Convex)

### Auth Tables (managed by Better Auth)
- `users` -- name, email, githubId, githubUsername, githubAccessToken
- `sessions` -- userId, token, expiresAt
- `accounts` -- userId, providerId, accessToken (GitHub OAuth tokens stored here)
- `verifications` -- identifier, value, expiresAt

### Core Tables
- `projects` -- userId, repoOwner, repoName, branch, contentRoot, detectedFramework, contentType, frontmatterSchema
- `collections` -- projectId, name, slug, folderPath, fieldSchema
- `documents` -- projectId, collectionId?, filePath, title, status (draft/in_review/approved/published/scheduled/archived), body, frontmatter, authorIds[], tagIds[], categoryIds[], githubSha, order
- `documentHistory` -- documentId, body, frontmatter, editedBy, commitSha, message

### Taxonomy Tables
- `authors` -- projectId, name, slug, email, avatar, bio, githubUsername
- `tags` -- projectId, name, slug, color
- `categories` -- projectId, name, slug, parentId? (self-referencing for nesting)

### Supporting Tables
- `folderMeta` -- projectId, folderPath, title, icon, defaultOpen, root, pageOrder[]
- `mediaAssets` -- projectId, fileName, filePath, mimeType, altText, dimensions, usedInDocumentIds[]
- `webhooks` -- projectId, name, url, secret, events[], isActive

## Convex Patterns

### Queries and Mutations

All Convex functions follow this pattern:

```typescript
import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const list = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tableName")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect()
  },
})

export const create = mutation({
  args: { /* validated args */ },
  handler: async (ctx, args) => {
    const now = Date.now()
    return await ctx.db.insert("tableName", { ...args, createdAt: now, updatedAt: now })
  },
})
```

### Key conventions:
- Always use `v.id("tableName")` for foreign keys, never raw strings
- Always include `createdAt` and `updatedAt` (as `v.number()`, using `Date.now()`)
- Use `.withIndex()` for filtered queries -- never scan entire tables
- Use `v.optional()` for nullable fields
- Use `v.union(v.literal(...))` for enum-like fields
- Use `v.any()` for flexible JSON (frontmatter, fieldSchema)
- Search indexes use `.withSearchIndex()` (see documents.ts `search_title`)

### Idempotent Creation (getOrCreate pattern)

For projects and documents, always use `getOrCreate` mutations from client code, not raw `create`. This prevents duplicates from race conditions and re-renders:

```typescript
// GOOD — idempotent, returns existing ID if duplicate
const projectId = await getOrCreateProject({ userId, repoOwner, repoName, branch, contentRoot, ... })
const docId = await getOrCreateDocument({ projectId, filePath, title, body, ... })

// BAD — can create duplicates on retry/re-render
const projectId = await createProject({ ... })
```

`documents.create` is reserved for internal/future use. All client paths go through `getOrCreate`.

### Ownership Checks

All mutations that modify a document (`saveDraft`, `publish`, `update`, `transitionStatus`) verify ownership:
1. Look up the document's project via `doc.projectId`
2. Verify `project.userId` matches the caller's `userId`/`editedBy` arg
3. Throw `"Unauthorized"` if they don't match

Do NOT skip this pattern when adding new mutations.

### Document Workflow & State Machine

The document lifecycle is:

```
draft -> in_review -> approved -\
  ^         |           |        \
  |         v           v         v (via `publish` mutation only)
  +--- (back to draft)      published
  |                              |
  v                              v
archived <----- (any state) ----+
```

**Key rules:**
- `saveDraft` -- Saves body + frontmatter to Convex, creates a history entry with previous content. Requires ownership.
- `publish` -- The ONLY path to "published" status. Requires a GitHub `commitSha`. Enforces source state is "draft" or "approved".
- `transitionStatus` -- Handles all other transitions (submit for review, approve, archive, restore). Does NOT accept "published" as a target.
- `documents.update` -- Generic metadata update. Does NOT accept `status` field — status changes must go through `publish` or `transitionStatus`.
- History is append-only -- every save creates a snapshot before overwriting

## Auth Patterns

### Getting auth state (client components):
```typescript
import { useSession } from "@/lib/auth-client"
const { data: session } = useSession()
```

### Getting auth state (server components):
```typescript
import { getGitHubToken } from "@/lib/auth-server"
const token = await getGitHubToken()
if (!token) redirect("/login")
```

### Login flow:
```typescript
// OAuth
import { signIn } from "@/lib/auth-client"
await signIn.social({ provider: "github", callbackURL: "/dashboard" })

// PAT (server action in app/login/actions.ts)
// Sets a "github_pat" cookie
```

### Protected routes:
- `middleware.ts` checks for `better-auth.session_token` or `github_pat` cookies
- Redirects unauthenticated users from `/dashboard/*` to `/login`

## GitHub API Patterns

All GitHub operations go through `lib/github.ts`:

```typescript
import { createGitHubClient, getUserRepos, getRepoContents, getFile, saveFileContent } from "@/lib/github"
```

- `createGitHubClient(token)` -- Creates an Octokit instance. Sanitizes token for non-ASCII.
- `getUserRepos(token)` -- Lists user repos sorted by updated.
- `getRepoContents(token, owner, repo, path?, ref?)` -- Lists directory contents.
- `getFile(token, owner, repo, path, ref?)` -- Gets file content + sha. Falls back to blob API for large files.
- `getFileContent(token, owner, repo, path, ref?)` -- Gets raw file content as string.
- `saveFileContent(token, owner, repo, path, content, sha?, message?, branch?)` -- Creates or updates a file via commit.

## Framework Detection

`lib/framework-detector.ts` scans a repo to detect the framework:

1. Reads `package.json` for dependency hints
2. Checks root files for config patterns (hugo.toml, _config.yml, etc.)
3. Returns: `{ framework, contentType, suggestedContentRoots, frontmatterFields, metaFilePattern }`

Supported: fumadocs, nextra, astro, hugo, docusaurus, jekyll, contentlayer, next-mdx, custom.

Each framework has specific frontmatter field definitions. Universal fields (title, description, draft) are always included.

## Environment Variables

### Required for Convex:
- `NEXT_PUBLIC_CONVEX_URL` -- e.g. `https://your-project.convex.cloud`
- `NEXT_PUBLIC_CONVEX_SITE_URL` -- e.g. `https://your-project.convex.site`
- `CONVEX_DEPLOYMENT` -- e.g. `dev:your-project|...`

### Required for auth (set in Convex dashboard, not .env.local):
- `GITHUB_CLIENT_ID` -- GitHub OAuth App client ID
- `GITHUB_CLIENT_SECRET` -- GitHub OAuth App client secret
- `BETTER_AUTH_SECRET` -- Random secret for session encryption
- `SITE_URL` -- Your Convex site URL (same as NEXT_PUBLIC_CONVEX_SITE_URL)

### Optional:
- `NEXT_PUBLIC_APP_URL` -- Your app's public URL

## Styling Conventions

- Tailwind CSS v4 -- no tailwind.config.js. All config in `app/globals.css` via `@theme inline {}`
- Fonts: Geist (sans) and Geist Mono (mono), loaded via `next/font/google` in layout.tsx
- Use `font-sans` and `font-mono` classes
- Use shadcn/ui design tokens: `bg-background`, `text-foreground`, `bg-muted`, `text-muted-foreground`, etc.
- Do NOT use raw colors like `bg-white`, `text-black` -- always use tokens
- Use `cn()` from `lib/utils.ts` for conditional classes

## Component Conventions

- Split pages into sub-components. Pages import and compose; they don't contain large JSX trees.
- Client components get `"use client"` directive at top.
- Server components (default) fetch data and pass down as props.
- Use SWR or Convex's `useQuery`/`useMutation` for client-side data, never `useEffect` for fetching.
- All protected server pages follow this pattern:
  ```typescript
  const token = await getGitHubToken()
  if (!token) redirect("/login")
  ```

## Common Pitfalls

1. **Auth lives in Convex, not Next.js** -- Never create a `betterAuth()` instance outside of `convex/auth.ts`. The "ctx is not a mutation ctx" error means you tried to use the Convex adapter outside Convex functions.

2. **Convex URL must exist** -- `ConvexReactClient` crashes if `NEXT_PUBLIC_CONVEX_URL` is undefined. The providers component guards against this with a null check.

3. **GitHub token sanitization** -- Tokens can have non-ASCII characters from certain auth flows. `createGitHubClient()` strips them. Always use this function, never create Octokit directly.

4. **Async params in Next.js 16** -- `params`, `searchParams`, `headers`, and `cookies` are all async. Always `await` them.

5. **Content root flexibility** -- A project's `contentRoot` can be `""` (repo root) or any nested path like `apps/docs/content`. All file paths in the `documents` table are relative to this root. The Studio page uses `contentRoot` to scope the initial file tree.

6. **One repo, many projects** -- Users can create multiple projects from the same repo with different content roots. The `by_userId_repo` index returns all projects for a repo.

7. **Never bypass the state machine** -- Do not set `status` via `documents.update`. Use `documents.publish` (for publishing with a GitHub commit) or `documents.transitionStatus` (for all other transitions). The `update` mutation intentionally excludes the `status` field.

8. **Use getOrCreate, not create** -- Client code must use `projects.getOrCreate` and `documents.getOrCreate` to avoid duplicates. Raw `create` mutations are for internal use only.

9. **Studio projectId is server-resolved** -- The Studio page looks up the project via `projects.findByRepo` server-side using URL params (owner/repo). It does NOT read `projectId` from the query string. This prevents spoofing.

10. **Mutations require ownership** -- All document-modifying mutations (`saveDraft`, `publish`, `update`, `transitionStatus`) verify `project.userId` matches the caller. New mutations that modify documents must follow this pattern.

## Commands

```bash
npm run dev           # Start Next.js dev server
npx convex dev        # Start Convex dev server (watches for schema changes)
npx convex deploy     # Deploy Convex to production
```

## Testing Changes

1. Always run `npx convex dev` alongside `npm run dev` during development
2. Schema changes in `convex/schema.ts` are automatically deployed by `convex dev`
3. New Convex functions are available immediately after save
4. Test auth flow: Login page -> GitHub OAuth -> redirect to /dashboard
5. Test PAT flow: Login page -> PAT tab -> paste token -> redirect to /dashboard

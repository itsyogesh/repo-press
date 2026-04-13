# Copilot Instructions for RepoPress

RepoPress is a Git-native headless CMS for GitHub repositories. It provides visual MDX editing with draft/publish workflows. Content stays in Git; operational state (drafts, projects, taxonomy) lives in Convex.

## 🎨 Design System

**Read `DESIGN.md` at the repo root before building any UI.** It is the authoritative design system specification for RepoPress, covering color tokens, typography, component patterns, spacing, elevation, and an agent prompt guide. Key rules:

- Font: Geist Sans (UI) + Geist Mono (code, paths, technical labels)
- Colors: Balanced monochrome tokens (`bg-background`, `bg-card`, `bg-muted`) + one Signal Slate accent (`oklch(0.52 0.13 255)` light / `oklch(0.72 0.11 255)` dark) for CTAs and active states only
- Weights: 400 (body) | 500 (UI labels, nav) | 600 (headings) - never raw `font-bold` in UI chrome
- Radius: 6px inputs/buttons | 8px cards | 10px modals
- Always use semantic tokens (`text-foreground`, `text-muted-foreground`, `border-border`); never raw hex or `bg-white`/`text-black`
- Reject "AI slop": no equal-weight icon-card grids, no default shadcn gray layouts, no safe corporate section templates

## ⚠️ Git Best Practices - CRITICAL

**NEVER work directly on the `main` branch. This is a hard rule.**

- **Before starting any task**: Create a feature branch with a descriptive name
  ```bash
  git checkout -b feature/your-feature-name
  git checkout -b fix/bug-description
  git checkout -b docs/documentation-topic
  ```

- **During development**: Commit frequently with clear messages
  ```bash
  git commit -m "Description of change"
  ```

- **When done**: Push to your feature branch (NOT main)
  ```bash
  git push origin feature/your-feature-name
  ```

- **To merge**: Create a pull request on GitHub for review, never `git push` directly to `main`

**This prevents accidental commits to the main branch and ensures all changes are reviewed before merging.**

## Build, Test, and Lint

### Development
```bash
npx next dev --port 3001       # Start Next.js dev server (port 3001)
npx convex dev                 # Start Convex dev server (watches schema changes)
```

Run both servers concurrently in separate terminals.

### Testing
```bash
npm run test            # Run all tests once
npm run test:watch     # Run tests in watch mode
vitest run <path>      # Run single test file
```

Tests located in `__tests__/` directories (e.g., `app/api/github/__tests__/route.test.ts`). Configured in `vitest.config.ts`.

### Linting & Formatting
```bash
npm run lint           # Check with Biome (TS, TSX, JS, JSON, CSS)
npm run lint:fix      # Auto-fix issues
npm run format        # Format code (Biome, 2-space indent, 120-char width)
```

Configured via `biome.json`. Special rules for `components/ui/` relax a11y constraints (shadcn/ui).

### Building
```bash
npm run build         # Next.js production build (.next/)
npm run start         # Run production-built app
```

## Architecture Overview

### Three-Layer Design
1. **Next.js 16 (App Router)** – Frontend, server components, async route handlers
2. **Convex** – Persistent state: projects, documents, drafts, history, taxonomy, auth sessions
3. **GitHub API (Octokit)** – Read/write/commit content to repos

### Critical: Auth Pattern
Better Auth runs **inside Convex** (`convex/auth.ts`), not in Next.js. Creating a `betterAuth()` instance outside Convex will fail with "ctx is not a mutation context."

```
convex/auth.ts ──────────── Better Auth instance (Convex only)
convex/http.ts ──────────── HTTP router (delegates to auth.ts)
convex/auth.config.ts ────── Token configuration
lib/auth-client.ts ────────── Browser client (convexClient plugin)
lib/auth-server.ts ────────── Server helpers (Convex proxies)
app/api/auth/[...all]/ ───── Next.js proxy (delegates to Convex)
```

If you see "ctx is not a mutation context," you tried using Better Auth outside Convex.

### Key Directories

**App Layer** (`app/`)
- `api/auth/[...all]/` – Better Auth endpoint proxy
- `api/github/save/` – GitHub commit endpoint
- `dashboard/[owner]/[repo]/` – Protected routes
  - `studio/[[...path]]/` – MDX editor (primary UX)
  - `setup/` – Project setup wizard
  - `blob/[...path]/` – File viewer
- `login/` – OAuth + Personal Access Token login

**Convex Backend** (`convex/`)
- `schema.ts` – 11 tables (auth + core + taxonomy)
- `projects.ts` – Project CRUD, `getOrCreate` (idempotent), `findByRepo`
- `documents.ts` – Document CRUD, `saveDraft`, `publish`, `transitionStatus`, `search`
- `documentHistory.ts` – Version snapshots
- `authors.ts`, `tags.ts`, `categories.ts` – Taxonomy (categories support nesting via `parentId`)
- `collections.ts` – Content collection schemas
- `mediaAssets.ts` – Image/file tracking
- `webhooks.ts` – Webhook management + triggering
- `folderMeta.ts` – Sidebar ordering (meta.json/_meta.json compatibility)

**Libraries** (`lib/`)
- `auth-client.ts` – `useSession()`, `signIn()`, `signOut()`
- `auth-server.ts` – Server-side auth helpers, `getGitHubToken()`
- `github.ts` – All GitHub operations: `createGitHubClient()`, `getRepoContents()`, `getFile()`, `saveFileContent()`, `getUserRepos()`
- `framework-detector.ts` – Auto-detect framework + frontmatter fields
- `utils.ts` – `cn()` utility

**Components** (`components/`)
- `studio/` – Editor layout, file tree, markdown editor, preview
- `landing/` – Public homepage sections
- `ui/` – shadcn/ui components

### Database Schema (Convex)

**Auth** (Better Auth)
- `users` – name, email, emailVerified, githubId, githubUsername, githubAccessToken
- `sessions` – userId, token, expiresAt
- `accounts` – userId, providerId, accessToken (GitHub OAuth tokens stored here)
- `verifications` – identifier, value, expiresAt

**Core**
- `projects` – userId, repoOwner, repoName, branch, contentRoot, detectedFramework, frontmatterSchema
- `documents` – projectId, collectionId (optional), filePath, title, status (draft/in_review/approved/published/scheduled/archived), body, frontmatter (JSON), githubSha, order
- `documentHistory` – documentId, body, frontmatter, editedBy, commitSha, message
- `collections` – projectId, name, slug, folderPath, fieldSchema

**Taxonomy**
- `authors` – projectId, name, slug, email, avatar, bio, githubUsername
- `tags` – projectId, name, slug, color
- `categories` – projectId, name, slug, parentId (self-referencing for nesting)

**Supporting**
- `folderMeta` – projectId, folderPath, title, icon, defaultOpen, root, pageOrder[]
- `mediaAssets` – projectId, fileName, filePath, mimeType, altText, usedInDocumentIds[]
- `webhooks` – projectId, name, url, secret, events[], isActive

## Key Conventions

### Convex Function Structure
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
```

**Rules:**
- Always use `v.id("tableName")` for foreign keys (never raw strings)
- Always include `createdAt` and `updatedAt` (as `v.number()`, using `Date.now()`)
- Use `.withIndex()` for filtered queries; never scan entire tables
- Use `v.optional()` for nullable fields
- Use `v.union(v.literal(...))` for enums
- Use `v.any()` for flexible JSON (frontmatter, fieldSchema)

### Idempotent Creation (Client-Side Only)
Always use `getOrCreate` mutations; never raw `create`:
```typescript
// GOOD – idempotent, returns existing ID if duplicate
const projectId = await getOrCreateProject({ userId, repoOwner, repoName, ... })

// BAD – can duplicate on retry/re-render
const projectId = await createProject({ ... })
```

Raw `create` is reserved for internal use.

### Ownership Verification
All mutations modifying documents (`saveDraft`, `publish`, `update`, `transitionStatus`) must verify:
1. Load document's project via `doc.projectId`
2. Verify `project.userId` matches caller's userId
3. Throw `"Unauthorized"` if no match

Do not skip this pattern when adding mutations.

### Document Workflow (State Machine)
```
draft ──→ in_review ──→ approved ──→ published
  ↑         ↓             ↓              ↓
  └─────────────────────────────────────┘
                                          
archived ←──────────────────────────────┘
```

- `saveDraft` – Saves body + frontmatter, creates history entry. Requires ownership.
- `publish` – ONLY path to "published". Requires `commitSha`. Source must be "draft" or "approved".
- `transitionStatus` – All other transitions (submit, approve, archive). Does NOT accept `"published"`.
- `documents.update` – Metadata only. Does NOT accept `status` field.

### Auth Patterns

**Client Component**
```typescript
import { useSession } from "@/lib/auth-client"
const { data: session } = useSession()
```

**Server Component**
```typescript
import { getGitHubToken } from "@/lib/auth-server"
const token = await getGitHubToken()
if (!token) redirect("/login")
```

All protected server pages follow the same pattern.

### GitHub API

```typescript
import { createGitHubClient, getUserRepos, getRepoContents, getFile, saveFileContent } from "@/lib/github"

const client = createGitHubClient(token)  // Sanitizes non-ASCII characters
const repos = await getUserRepos(token)
const files = await getRepoContents(token, owner, repo, path)
const { content, sha } = await getFile(token, owner, repo, path, ref)
await saveFileContent(token, owner, repo, path, content, sha, message, branch)
```

### Framework Detection

```typescript
const { framework, contentType, suggestedContentRoots, frontmatterFields, metaFilePattern } = 
  await detectFramework(token, owner, repo)
```

Detects: fumadocs, nextra, astro, hugo, docusaurus, jekyll, contentlayer, next-mdx, custom.

Each framework has specific frontmatter field definitions. Universal fields (title, description, draft) always included.

### Styling

- **Tailwind CSS v4** – No `tailwind.config.js`. All config in `app/globals.css` via `@theme inline {}`
- **Fonts** – Geist (sans) and Geist Mono via `next/font/google`
- **Design Tokens** – Always use `bg-background`, `text-foreground`, `bg-muted`, etc. Never `bg-white`, `text-black`
- **Components** – shadcn/ui (Radix UI + Tailwind)
- **Conditional Classes** – Use `cn()` from `lib/utils.ts`

### Component Architecture

- Split pages into sub-components (pages compose; don't contain large JSX trees)
- Client components: add `"use client"` directive
- Server components: default, fetch data, pass as props
- Data fetching: Use Convex's `useQuery`/`useMutation` or SWR; never `useEffect` for data

### Next.js 16 Details

- **Async Params** – `params`, `searchParams`, `headers`, `cookies` are all async. Always `await` them.
- **Route Handlers** – `route.ts` can be async with `await`
- **Bundler** – Turbopack (fast HMR)
- **Default** – Pages are server components

### Project-Specific Patterns

- **Content Root** – Can be `""` (repo root) or nested (e.g., `apps/docs/content`). All file paths in `documents` are relative to it.
- **Multi-Project** – Users can create multiple projects from same repo with different content roots. `findByRepo` returns all.
- **Studio Resolution** – Server-side lookup via `projects.findByRepo(owner, repo)` using URL params. Does NOT read `projectId` from query string (security).
- **History** – Append-only; every save creates snapshot. Never delete old entries.

## Environment Variables

### Setup Instructions
Before running the app locally, configure environment variables. **Do NOT commit `.env.local` to Git.**

### How Agents Should Handle Environment Variables
**CRITICAL:** Copilot agents must NEVER read `.env.local`, `.env`, or any secrets files directly. If a task requires environment variables:

1. The agent should ask you to provide the values
2. You paste the value into the terminal or the agent's prompt
3. The agent uses that value only in the current session (never writes to files)

Example: "I need `NEXT_PUBLIC_CONVEX_URL` to complete this task. Please provide it."

### Required (Convex)
- `NEXT_PUBLIC_CONVEX_URL` – e.g., `https://your-project.convex.cloud`
- `NEXT_PUBLIC_CONVEX_SITE_URL` – e.g., `https://your-project.convex.site`
- `CONVEX_DEPLOYMENT` – e.g., `dev:your-project|...`

### Auth (Convex Dashboard, not .env.local)
- `GITHUB_CLIENT_ID` – GitHub OAuth App client ID
- `GITHUB_CLIENT_SECRET` – GitHub OAuth App client secret
- `BETTER_AUTH_SECRET` – Random secret for session encryption
- `SITE_URL` – Your Convex site URL

### Optional
- `NEXT_PUBLIC_APP_URL` – Public app URL

### Local Development Setup
```bash
# 1. Initialize Convex (creates .env.local with CONVEX_* vars)
npx convex dev

# 2. Manually add GitHub OAuth vars to .env.local:
# GITHUB_CLIENT_ID=<your-id>
# GITHUB_CLIENT_SECRET=<your-secret>
# BETTER_AUTH_SECRET=<random-string>
# SITE_URL=https://your-project.convex.site

# 3. Start dev servers
npx next dev --port 3001
npx convex dev  # in another terminal
```

### Troubleshooting
- **"ConvexReactClient not initialized"** → `NEXT_PUBLIC_CONVEX_URL` is missing
- **"OAuth callback failed"** → GitHub OAuth App callback URL must be `https://your-convex-project.convex.site/api/auth/callback/github`
- **"ctx is not a mutation context"** → Auth.ts was edited incorrectly; reset from git

## Common Pitfalls

1. **Auth in Convex Only** – Never create `betterAuth()` outside `convex/auth.ts`. "ctx is not a mutation context" error means you tried this.
2. **Convex URL Required** – `ConvexReactClient` crashes if `NEXT_PUBLIC_CONVEX_URL` is undefined. Providers component guards against this.
3. **Token Sanitization** – Tokens can have non-ASCII characters. Always use `createGitHubClient()`; never create Octokit directly.
4. **Use getOrCreate** – Race conditions and re-renders cause duplicates with raw `create`.
5. **State Machine** – Don't set `status` via `documents.update`. Use `publish` or `transitionStatus`.
6. **Ownership Required** – Every document mutation must verify `project.userId` matches caller.
7. **Async Params** – Always `await` params, searchParams, headers, cookies in Next.js 16.
8. **Immutable Content Root** – A project's `contentRoot` cannot change. File paths in documents are always relative to it.
9. **Indexes Required** – Use `.withIndex()` in queries to avoid table scans.
10. **History Snapshots** – Every `saveDraft` creates a history entry. Never delete old history.

## Security & Validation

### Input Validation & Token Handling
- **GitHub Tokens** – Always sanitize with `createGitHubClient()` which removes non-ASCII: `replace(/[^\x20-\x7E]/g, "")`
- **Foreign Keys** – Use `v.id("tableName")` in Convex schemas (never raw strings). This enforces type safety.
- **Role-Based Access** – RBAC hierarchy: owner (3) > editor (2) > viewer (1). Always check `resolveProjectAccess()` in mutations.
- **Signed Tokens** – `projectAccessToken` is JWT-like with embedded role and expiration. Verify signature before use.

### Mutation Authorization
Every mutation modifying documents MUST verify:
```typescript
const project = await ctx.db.get(doc.projectId)
if (project.userId !== userId) throw new Error("Unauthorized")
```

Never skip this pattern even for "safe" operations.

## Performance & Optimization

### Query Optimization
- All queries use `.withIndex()` – composite indexes exist for common filters (e.g., `by_projectId_status`, `by_userId_repo`)
- Use `.first()` instead of `.collect()` when expecting a single result
- Use `.order("desc")` with time-based fields (createdAt, updatedAt)

### Batching & Rate Limits
- Batch GitHub API calls in groups of **50 items** to avoid rate limits
- Use `Promise.all()` for parallel GitHub calls (e.g., resolving trees, checking permissions)
- Cache expensive operations: `repoAccessCache` table caches GitHub permission checks for **1 hour TTL**
- Detect rate limit errors and surface to UI (set `rateLimited` flag, allow retry after delay)

### Resilience Patterns
- Use **optimistic locking** with SHA comparison for concurrent edits (GitHub commits require matching SHA)
- Implement **two-phase deletion** with rescheduled mutations for large datasets (avoids Convex transaction size limits)
- **Fail-fast strategy** – if GitHub API fails, surface error to user; don't retry silently

## Error Handling

### Convex Mutations
Throw semantic errors that clients can handle:
```typescript
throw new Error("Unauthorized")           // Auth failed
throw new Error("Document not found")     // 404
throw new Error("Concurrent edit")        // SHA mismatch on publish
```

### GitHub API
Handle HTTP status codes:
```typescript
if (err.status === 404) return null                    // Missing resource
if (err.status === 403) throw new Error("Access denied") // Permission denied
if (err.status === 429) setRateLimited(true)          // Rate limit hit
```

### Auth Fallback Chain
1. Check OAuth session (`authComponent.safeGetAuthUser()`)
2. Try `projectAccessToken` (signed token for shared access)
3. Fallback to GitHub permission check (`getRepoPermission()`)
4. Throw "Unauthorized" if all fail

## Testing & Code Review

### Test Coverage Expectations
- **Minimum coverage:** 80% for critical paths (publish, auth, access control)
- **Mock patterns:** Use `vi.hoisted()` for Convex clients, fake GitHub responses, mock auth-server
- **Error scenarios:** Test 404s, rate limits, auth failures, concurrent edits (SHA mismatches)

### PR Checklist
- ✅ Ownership verified in all document mutations (`project.userId` matches caller)
- ✅ All Convex queries use `.withIndex()` (no table scans)
- ✅ New tables include `createdAt` and `updatedAt` timestamps
- ✅ Foreign keys use `v.id("tableName")` types
- ✅ Status transitions follow state machine (draft → review → approved → published → archived)
- ✅ No raw `create()` calls from client code (use `getOrCreate`)
- ✅ GitHub tokens sanitized with `createGitHubClient()`
- ✅ Tests added for new endpoints (HTTP routes + mutations)

## Documentation

### Adding New Features
- **Convex functions** – Add JSDoc comments explaining params, return type, and error cases
- **GitHub utilities** – Document which API endpoint is used and any rate limit considerations
- **Architecture changes** – Update `ARCHITECTURE-*.md` files with high-level design decisions
- **Why comments** – Inline comments explain "why", not "what". Code should be self-explanatory.

### Where to Document
- `convex/README.md` – Convex-specific patterns and query reference
- `CLAUDE.md` / `AGENTS.md` – Comprehensive architecture and function reference
- `README.md` – Feature overview, setup instructions, supported frameworks
- `copilot-instructions.md` – This file; update with new patterns as they emerge
- `.github/plans/` – Draft plans for complex tasks. Save plans here only (do NOT commit); agents should ask for approval and create PRs from feature branches when ready. See the canonical plan template and guidance in `.github/plans/template_plan.md`.
  - Naming: Use simple descriptive names. Do NOT use dates in filenames (avoid formats like `2026-27-03`). Prefer one of:
    - `XYZ_task_plan.md`
    - `XYZ_feature_plan.md`
    - `XYZ_test_plan.md`
    Replace `XYZ` with a concise identifier (e.g., `editor_save_flow_task_plan.md`).
  - Important: Agents must not commit or push files in this folder; finalize plans in a branch and open a PR.

## Testing Patterns

Tests in `__tests__/` directories:
```
app/api/github/__tests__/
  route.test.ts
```

Run with `npm run test` or `npm run test:watch`. Uses Vitest.

Note: Playwright is not used; use the Google Chrome MCP tool (chrome-devtools) for browser automation/testing.
## Related Documentation

Full architecture and implementation details:
- `CLAUDE.md` – Complete Convex patterns, tables, and function reference
- `AGENTS.md` – Same as CLAUDE.md (alternate reference for agents)
- `README.md` – Feature overview, setup, supported frameworks
- `convex/README.md` – Convex-specific patterns

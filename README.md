# RepoPress

**Git-native Headless CMS for GitHub Repositories**

Transform any GitHub repository into a powerful content management system. Visual MDX editing, draft/publish workflows, framework auto-detection, and your content stays in Git where it belongs.

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/itsyogeshs-projects/v0-repo-press-cms)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.app-black?style=for-the-badge)](https://v0.app/chat/kall8NFEwor)
[![Open Source](https://img.shields.io/badge/Open%20Source-MIT-green?style=for-the-badge)](https://github.com/itsyogesh/repo-press)

---

## What is RepoPress?

RepoPress connects to your GitHub repositories and gives you a Notion-like editing experience for MDX/Markdown content. Unlike traditional headless CMSs that lock your data in proprietary databases, RepoPress keeps everything in Git -- your content, your history, your rules.

### Key Features

- **Visual MDX Editor** -- Rich text editing with live preview and frontmatter management
- **Git-native Workflow** -- Drafts saved to Convex, published content committed directly to GitHub
- **Multi-project Support** -- Create multiple projects from the same repo (e.g., blog + docs + legal pages, each in different folders)
- **Framework Auto-detection** -- Scans your repo to detect Fumadocs, Nextra, Astro, Hugo, Docusaurus, Jekyll, Contentlayer, or generic Next.js MDX setups
- **Content Collections** -- Define custom content types with different frontmatter schemas per collection
- **Authors, Tags, Categories** -- Full taxonomy management per project
- **Document History** -- Version snapshots of every edit with the ability to revert
- **Review Workflows** -- Draft, in review, approved, published, scheduled, archived states
- **Media Asset Library** -- Track images and files referenced in your content
- **Webhooks** -- Notify external services on publish, update, delete events
- **Folder Meta** -- Sidebar ordering via meta.json / _meta.json patterns (Fumadocs, Nextra compatible)

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router, Turbopack) |
| **UI** | React 19.2, Tailwind CSS v4, shadcn/ui |
| **Database** | Convex (real-time, serverless) |
| **Auth** | Better Auth + Convex integration (GitHub OAuth) |
| **GitHub API** | Octokit (file read/write/commit) |
| **Content Parsing** | gray-matter (frontmatter), react-markdown, remark-gfm |
| **Deployment** | Vercel |

---

## Project Structure

```
/
├── app/                          # Next.js App Router pages
│   ├── api/
│   │   ├── auth/[...all]/        # Better Auth API proxy
│   │   └── github/save/          # GitHub file save endpoint
│   ├── dashboard/                # Dashboard (repo list)
│   │   └── [owner]/[repo]/
│   │       ├── blob/[...path]/   # File viewer
│   │       ├── setup/            # Project setup wizard
│   │       └── studio/[[...path]]/ # MDX Studio editor
│   ├── login/                    # Login page (OAuth + PAT)
│   └── page.tsx                  # Landing page
├── components/
│   ├── editor/                   # Editor layout, frontmatter form, markdown editor, preview
│   ├── landing/                  # Landing page sections (hero, features, CTA, footer, navbar)
│   ├── studio/                   # Studio layout, file tree, editor, preview
│   ├── providers.tsx             # Convex + Better Auth provider wrapper
│   └── ui/                       # shadcn/ui components
├── convex/                       # Convex backend
│   ├── schema.ts                 # Full database schema (11 tables)
│   ├── auth.ts                   # Better Auth instance (runs inside Convex)
│   ├── auth.config.ts            # Convex auth config
│   ├── convex.config.ts          # Convex app config
│   ├── http.ts                   # HTTP router for auth endpoints
│   ├── projects.ts               # Project CRUD queries/mutations
│   ├── documents.ts              # Document CRUD + status management
│   ├── documentHistory.ts        # Version history queries
│   ├── authors.ts                # Author management
│   ├── tags.ts                   # Tag management
│   ├── categories.ts             # Category management (nested)
│   ├── collections.ts            # Content collection definitions
│   ├── mediaAssets.ts            # Media/asset tracking
│   ├── webhooks.ts               # Webhook management + triggering
│   └── folderMeta.ts             # Folder meta (sidebar ordering)
├── lib/
│   ├── auth-client.ts            # Better Auth client (browser-side)
│   ├── auth-server.ts            # Better Auth server helpers (Next.js)
│   ├── framework-detector.ts     # Auto-detect framework from repo contents
│   ├── github.ts                 # GitHub API utilities (Octokit)
│   └── utils.ts                  # General utilities (cn, etc.)
└── middleware.ts                  # Auth guard for /dashboard routes
```

---

## Database Schema

RepoPress uses Convex with 11 interconnected tables:

| Table | Purpose |
|---|---|
| `users` | User accounts (via Better Auth) |
| `sessions` | Auth sessions |
| `accounts` | OAuth account links (GitHub tokens stored here) |
| `verifications` | Email/token verifications |
| `projects` | Repo + content root + framework config |
| `collections` | Content types per project (blog, docs, changelog, etc.) |
| `documents` | Individual MDX/MD files with status tracking |
| `documentHistory` | Version snapshots of document edits |
| `authors` | Author profiles per project |
| `tags` | Tags per project |
| `categories` | Nested categories per project |
| `folderMeta` | Sidebar ordering (meta.json equivalents) |
| `mediaAssets` | Tracked images/files |
| `webhooks` | External notification configs |

---

## Supported Frameworks

RepoPress auto-detects these frameworks from your repo and adapts frontmatter fields accordingly:

| Framework | Detection Method | Content Root |
|---|---|---|
| **Fumadocs** | `fumadocs-core` in package.json | `content/docs/` |
| **Nextra** | `nextra` in package.json | `pages/` or `src/pages/` |
| **Astro** | `astro` in package.json | `src/content/` |
| **Hugo** | `config.toml` / `hugo.toml` | `content/` |
| **Docusaurus** | `@docusaurus/core` in package.json | `docs/` or `blog/` |
| **Jekyll** | `_config.yml` | `_posts/` |
| **Contentlayer** | `contentlayer` in package.json | from `contentlayer.config.*` |
| **Next.js MDX** | `@next/mdx` in package.json | auto-detected |

---

## Environment Variables

### Required

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Convex deployment URL (e.g. `https://your-project.convex.cloud`) |
| `CONVEX_DEPLOYMENT` | Convex deployment ID (e.g. `dev:your-project\|...`) |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Convex site URL (e.g. `https://your-project.convex.site`) |

### Auth (Better Auth + GitHub OAuth)

| Variable | Description |
|---|---|
| `GITHUB_CLIENT_ID` | From your [GitHub OAuth App](https://github.com/settings/developers) |
| `GITHUB_CLIENT_SECRET` | From your GitHub OAuth App |
| `BETTER_AUTH_SECRET` | Random secret string for session encryption |
| `NEXT_PUBLIC_APP_URL` | Your app's public URL (e.g. `https://repopress.app`) |

### Setting up GitHub OAuth

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Set **Homepage URL** to your app URL
4. Set **Authorization callback URL** to `https://your-convex-project.convex.site/api/auth/callback/github`
5. Copy the Client ID and generate a Client Secret

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/itsyogesh/repo-press.git
cd repo-press
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up Convex

```bash
npx convex dev
```

This will prompt you to create a Convex project and populate your `.env.local` with the required URLs.

### 4. Set up environment variables

Copy the env vars from the table above into your `.env.local` file.

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

---

## How It Works

1. **Sign in** with GitHub OAuth or a Personal Access Token
2. **Browse your repos** on the dashboard
3. **Create a project** by selecting a repo, branch, and content folder
4. **RepoPress auto-detects** your framework and configures frontmatter fields
5. **Open the Studio** to visually edit MDX files with live preview
6. **Save drafts** to Convex (no Git commit until you publish)
7. **Publish** commits the content directly to your GitHub branch
8. **Track history** of every edit with the ability to revert

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you would like to change.

---

## License

MIT

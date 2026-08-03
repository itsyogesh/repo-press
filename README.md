# RepoPress

**Git-native Headless CMS for GitHub Repositories**

Transform any GitHub repository into a powerful content management system. Visual MDX editing, draft/publish workflows, framework auto-detection, and your content stays in Git where it belongs.

[![Open Source](https://img.shields.io/badge/Open%20Source-MIT-green?style=for-the-badge)](https://github.com/itsyogesh/repo-press)

---

## What is RepoPress?

RepoPress connects to your GitHub repositories and gives you a Notion-like editing experience for MDX/Markdown content. Unlike traditional headless CMSs that lock your data in proprietary databases, RepoPress keeps everything in Git -- your content, your history, your rules.

### Key Features

- **Visual MDX Studio Editor** -- Rich text editing with explicit preview fidelity, frontmatter management, and a split-pane layout
- **Content Stays in Git** -- No vendor lock-in. Drafts are saved to Convex; published content is committed directly to your GitHub repo
- **Framework Auto-detection** -- Automatically detects Fumadocs, Nextra, Astro, Hugo, Docusaurus, Jekyll, Contentlayer, and Next.js MDX setups from your repo and configures frontmatter fields accordingly
- **Document Workflows** -- Full state machine: draft → in review → approved → published → archived, with publish requiring a GitHub commit
- **Version History** -- Append-only snapshots of every edit with the ability to view and revert to any previous version
- **Multi-project Dashboard** -- Create multiple projects from the same repo (e.g., blog + docs + legal pages, each scoped to a different content root)
- **Webhook Integrations** -- Notify external services on publish, update, and delete events
- **GitHub OAuth Authentication** -- Secure sign-in via GitHub OAuth (powered by Better Auth running inside Convex) or Personal Access Tokens
- **Content Collections** -- Define custom content types with different frontmatter schemas per collection
- **Taxonomy Management** -- Authors, tags, and nested categories per project
- **Media Asset Library** -- Track images and files referenced in your content
- **Folder Meta** -- Sidebar ordering via meta.json / _meta.json patterns (Fumadocs, Nextra compatible)
- **Reusable MDX Components** -- Install integrity-pinned registry components through a GitHub pull request, then insert and edit them through declarative Studio forms

---

## Documentation

- [Documentation](https://docs.repopress.org) -- guides, Studio workflows, architecture, and extension tutorials
- [Platform architecture](https://docs.repopress.org/platform/architecture) -- Git, Convex, Next.js, draft, publish, and extension authority
- [Component authoring](https://docs.repopress.org/components/authoring) -- schemas, slots, fixtures, registry metadata, and product adapters
- [Preview security](https://docs.repopress.org/platform/preview-security) -- Generic/Compatible fidelity, isolation, images, and controlled actions
- [Connect an MDX repository](https://docs.repopress.org/guides/connect-repository) -- setup through first pull-request publish
- [Build a component extension](https://docs.repopress.org/tutorials/component-extension) -- production binding, authoring props, fixture, Compatible mapping, and tests
- [Production deployment](docs/production-deployment-guide.md) -- environment and deployment configuration

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router, Turbopack) |
| **UI** | React 19.2, Tailwind CSS v4, shadcn/ui |
| **Database** | Convex (real-time, serverless) |
| **Auth** | Better Auth + @convex-dev/better-auth (GitHub OAuth) |
| **GitHub API** | Octokit (@octokit/rest) for file read/write/commit |
| **Content Parsing** | gray-matter, unified/remark MDX, bounded generic render models |
| **Deployment** | Vercel |

---

## Project Structure

```
/
├── apps/
│   ├── web/                      # Next.js + Convex product workspace
│   │   ├── app/                  # App Router pages and route handlers
│   │   ├── components/           # Landing, Studio, and shadcn UI
│   │   ├── convex/               # Backend, auth, and persistent state
│   │   ├── lib/                  # GitHub, preview, publish, and auth logic
│   │   └── proxy.ts              # Auth guard for dashboard routes
│   └── docs/                     # Standalone documentation workspace
├── packages/                     # Reserved for shared packages
├── docs/                         # Internal plans, reviews, and runbooks
├── package.json                  # npm workspace orchestration
└── package-lock.json             # Sole dependency lockfile
```

---

## Database Schema

RepoPress uses Convex for auth, drafts, project metadata, publishing operations, preview budgets, and recovery. Core tables include:

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

## MDX Preview Fidelity

RepoPress reports which preview it is showing instead of treating every approximation as native:

- **Generic** renders a safe, bounded shadcn Typeset model. It never executes repository code and remains available as the default fallback.
- **Compatible** renders only an exact signed browser-compatible artifact on a separately configured origin in an opaque iframe. It does not promise Server Component, framework-loader, or full application context parity.
- **Native** is reserved for a future managed runner that executes the repository's actual framework in isolation. That runner is not included in the current first slice.

New repository setup uses native discovery: RepoPress inspects the repository's existing framework, component aliases, MDX runtime map, and CSS target. Setup commits a lightweight `repopress.config.json`; it does not generate `.repopress/mdx-preview.tsx` or make a generated component catalog authoritative. Older explicit preview entries remain readable as untrusted compatibility overrides and never authorize execution in the Studio.

---

## Environment Variables

### Required (Convex)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Convex deployment URL (e.g. `https://your-project.convex.cloud`) |
| `CONVEX_DEPLOYMENT` | Convex deployment ID (e.g. `dev:your-project\|...`) |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Convex site URL (e.g. `https://your-project.convex.site`) |

### Auth (set in Convex dashboard)

| Variable | Description |
|---|---|
| `GITHUB_CLIENT_ID` | From your [GitHub OAuth App](https://github.com/settings/developers) |
| `GITHUB_CLIENT_SECRET` | From your GitHub OAuth App |
| `BETTER_AUTH_SECRET` | Random secret string for session encryption |
| `REPOPRESS_CAPABILITY_SECRET` | Random 32+ character capability-signing secret; use the same value in the Next.js runtime |
| `SITE_URL` | Public RepoPress application origin used by Better Auth (`https://repopress.org` in production) |

### Next.js runtime

| Variable | Description |
|---|---|
| `REPOPRESS_CAPABILITY_SECRET` | Same capability-signing value configured in Convex; never reuse `BETTER_AUTH_SECRET` |
| `PREVIEW_APPROVAL_PRIVATE_KEY_JWK` | Server-only EC P-256 private JWK used to sign Compatible preview artifacts; never expose or log it |
| `REPOPRESS_DEPLOYMENT_ROLE` | Set to `sandbox` only on the separately hosted Compatible preview project; omit on Studio |

### Compatible preview browser configuration

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_PREVIEW_ORIGIN` | Separately hosted preview sandbox origin (`https://preview.repopress.org` in production); production must not reuse the Studio origin |
| `NEXT_PUBLIC_PREVIEW_APPROVAL_PUBLIC_KEY_JWK` | Public EC P-256 verification JWK matching the server-only preview signing key |

The private and public preview JWKs must be generated as one P-256 key pair. Keep the private JWK only in the Next.js server environment. The public JWK is intentionally browser-readable and cannot sign artifacts.

### Optional

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Your app's public URL (`https://repopress.org` in production) |

### Setting up GitHub OAuth

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Set **Homepage URL** to your app URL
4. Set **Authorization callback URL** to `https://your-app.example/api/auth/callback/github`
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
npm exec --workspace @repopress/web -- convex dev
```

This will prompt you to create a Convex project and populate `apps/web/.env.local` with the required Convex URLs.

### 4. Set up environment variables

Configure the GitHub OAuth variables and `BETTER_AUTH_SECRET` in the Convex dashboard. Generate a separate capability secret, set it in Convex, and add only that shared capability value to `.env.local` for the Next.js server:

```bash
openssl rand -base64 32
npm exec --workspace @repopress/web -- convex env set REPOPRESS_CAPABILITY_SECRET <generated-value>
```

The command above configures the development deployment selected by Convex. For production, target the production
deployment explicitly:

```bash
npm exec --workspace @repopress/web -- convex env set --prod REPOPRESS_CAPABILITY_SECRET <generated-value>
```

```dotenv
REPOPRESS_CAPABILITY_SECRET=<same-generated-value>
```

### 5. Run the dev servers

You need to run both the Next.js and Convex dev servers concurrently in separate terminals:

**Terminal 1 - Convex:**
```bash
npm exec --workspace @repopress/web -- convex dev
```

**Terminal 2 - Next.js:**
```bash
npm run dev:web -- --port 3001
```

Open [http://localhost:3001](http://localhost:3001) to see the app.

---

## How It Works

1. **Sign in** with GitHub OAuth or a Personal Access Token
2. **Browse your repos** on the multi-project dashboard
3. **Create a project** by selecting a repo, branch, and content folder
4. **RepoPress auto-detects** your framework and configures frontmatter fields
5. **Open the Studio** to visually edit MDX files with live preview
6. **Save drafts** to Convex (no Git commit until you publish)
7. **Move through workflows** - draft → in review → approved → published
8. **Publish** commits the content to a dedicated GitHub publish branch and opens or updates a pull request
9. **Track history** of every edit with version snapshots and the ability to revert

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you would like to change.

---

## License

MIT

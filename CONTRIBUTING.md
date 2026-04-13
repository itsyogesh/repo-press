# Contributing to RepoPress

Welcome! RepoPress is a Git-native headless CMS for GitHub repositories. We're glad you're interested in contributing. Whether it's a bug fix, new feature, or documentation improvement - all contributions are welcome.

Before diving in, please read the [README](./README.md) for an overview of the project.

## Development Setup

### Prerequisites

- **Node.js 22+**
- **npm** or **pnpm**

### Getting Started

1. **Fork and clone** the repository:

   ```bash
   git clone https://github.com/<your-username>/repo-press.git
   cd repo-press
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Start the Convex dev server** (creates `.env.local` automatically):

   ```bash
   npx convex dev
   ```

4. **Start the Next.js dev server** (in a separate terminal):

   ```bash
   npx next dev --port 3001
   ```

> **Note:** You need both servers running concurrently for the app to work.

## Environment Variables

The Convex CLI sets up most variables automatically. You only need to add a few manually:

| Variable | How to set |
|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Auto-set by `npx convex dev` |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Auto-set by `npx convex dev` |
| `CONVEX_DEPLOYMENT` | Auto-set by `npx convex dev` |
| `GITHUB_CLIENT_ID` | Set in the Convex dashboard - needed for GitHub OAuth login |
| `GITHUB_CLIENT_SECRET` | Set in the Convex dashboard - needed for GitHub OAuth login |
| `BETTER_AUTH_SECRET` | A random string for session encryption - set in the Convex dashboard |

> **Never commit `.env.local` to Git.** It is already in `.gitignore`.

## Branch Strategy

- **Never push directly to `main`.**
- Create a feature branch from `main`:
  ```bash
  git checkout -b feature/your-feature
  git checkout -b fix/bug-description
  git checkout -b docs/topic
  ```
- Open a Pull Request for review.
- CI runs lint, typecheck, and tests on every PR.

## Code Quality

Run these commands before submitting a PR:

```bash
npm run lint        # Check code with Biome linter
npm run lint:fix    # Auto-fix lint issues
npm run format      # Format code (Biome - 2-space indent, 120-char width)
npm run test        # Run all tests (Vitest)
npm run build       # Production build
```

## Architecture Overview

RepoPress uses a three-layer architecture:

- **Next.js 16 (App Router)** - Frontend pages, server components, and route handlers.
- **Convex** - Backend database for all persistent state (projects, documents, drafts, history, taxonomy, auth sessions).
- **Better Auth** - GitHub OAuth authentication. Runs **inside Convex functions**, not in Next.js. Never create a `betterAuth()` instance outside of `convex/auth.ts`.
- **GitHub API (Octokit)** - Reads repo contents and commits published files back to GitHub.
- **Tailwind CSS v4 + shadcn/ui** - Styling and component library. Config lives in `app/globals.css` via `@theme inline {}` (no `tailwind.config.js`).

## Key Conventions

- **Idempotent creation** - Use `getOrCreate` mutations from client code, never raw `create`. This prevents duplicates from race conditions and re-renders.
- **Ownership verification** - All document mutations must verify that `project.userId` matches the caller. Never skip this check.
- **Indexed queries** - Use `.withIndex()` in Convex queries. Never scan entire tables.
- **Design tokens** - Use semantic tokens (`bg-background`, `text-foreground`, `bg-muted`, etc.). Never use hardcoded colors like `bg-white` or `text-black`.
- **Async params (Next.js 16)** - Always `await` params, searchParams, headers, and cookies. They are async in Next.js 16.
- **GitHub token safety** - Use `createGitHubClient()` from `lib/github.ts` for all GitHub API calls. It sanitizes tokens by stripping non-ASCII characters.

## Testing

- Tests live in `__tests__/` directories alongside the code they test.
- We use **Vitest** as the test runner.
- Run `npm run test` before submitting a PR.
- Aim for **80% coverage** on critical paths (publish, auth, access control).
- Test error scenarios: 404s, rate limits, auth failures, concurrent edits (SHA mismatches).

## PR Checklist

Before requesting a review, make sure:

- [ ] Changes are on a **feature branch** (not `main`)
- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] `npm run build` succeeds
- [ ] New Convex queries use `.withIndex()`
- [ ] Document mutations verify ownership
- [ ] No hardcoded colors (use design tokens)
- [ ] Responsive design tested

## License

RepoPress is licensed under the [MIT License](./LICENSE). By contributing, you agree that your contributions will be licensed under the same license.

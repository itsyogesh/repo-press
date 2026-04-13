# RepoPress - Production Launch & Website Redesign Plan

## Summary

RepoPress MVP is built. This plan covers two parallel workstreams to prepare for public launch: (1) production hardening - security fixes, infrastructure, SEO, legal compliance, and (2) a full website redesign - new design system, expanded landing page, new pages (blog, about, docs, pricing, legal), and programmatic Remotion demo videos. Both workstreams run on separate Git branches and merge to `main` before launch.

## Context

- **Repository**: [itsyogesh/repo-press](https://github.com/itsyogesh/repo-press)
- **MVP state**: Core Studio editor, GitHub OAuth, document workflows, multi-project all functional
- **Prior plans**: `STUDIO-REDESIGN-FINAL-PLAN.md` (Studio UI research), `.github/plans/dashboard_redesign_plan.md` (dashboard shell)
- **Design reference**: [pagescms.org](https://pagescms.org) - clean, minimal, confident
- **Security audit**: Completed with 2 CRITICAL + 6 HIGH + 8 MEDIUM findings
- **Competitor research**: Analyzed Decap (19K★), TinaCMS (13K★), Outstatic (3K★), Sveltia (2.3K★), Keystatic (2K★), Pages CMS, Contentlayer (dead)

## Goals

- **Primary**: Ship a production-ready, publicly accessible RepoPress with zero critical security issues, professional landing page, and enough surface area for organic discovery (SEO, docs, blog)
- **Secondary**: Establish visual identity (black/white + electric blue) that differentiates from cookie-cutter CMS tools; achieve Lighthouse 80+ Performance, 90+ Accessibility, 90+ SEO on all public pages

## Success Criteria

1. `npm run build` exits 0 with no suppression flags
2. `npx tsc --noEmit` exits 0
3. `npm run test` all pass
4. Unauthenticated call to `projects:list` returns 401 or empty
5. All API routes verify project access (not just GitHub token presence)
6. GitHub OAuth login works on production domain
7. `/sitemap.xml` and `/robots.txt` return valid content
8. OG image renders correctly in Twitter Card Validator and Slack
9. No fabricated social proof anywhere on the site
10. `/docs/getting-started`, `/blog`, `/about`, `/privacy`, `/terms` all return 200
11. Security headers present on production (`curl -I`)
12. Full manual flow completes: login → repo → project → Studio → save → publish
13. Mobile responsive on all public pages (including hamburger nav)
14. Cookie consent blocks analytics until accepted

## Scope

### In-scope
- Security hardening (Convex auth, API route auth, input validation, webhook security, security headers)
- Build system cleanup (remove `ignoreBuildErrors`, fix Tailwind v4 gradient warnings)
- Design system overhaul (OKLCH color tokens for black/white + electric blue)
- Landing page complete redesign (hero, features, how-it-works, comparison, FAQ, CTA, footer, navbar)
- New pages: blog (static MDX), about, docs (4 pages minimum), privacy, terms
- SEO: metadata, OG image, sitemap, robots.txt
- Programmatic Remotion demo videos
- CI pipeline (GitHub Actions)
- Error monitoring setup
- README + CONTRIBUTING.md updates
- Cookie consent banner

### Out-of-scope (post-launch)
- Rate limiting on API routes (mitigate with Upstash post-launch)
- MDX `new Function()` sandbox hardening (Studio preview is logged-in-only)
- Advanced docs search (Algolia/Orama - wait until >10 docs pages)
- Pricing page evolution (revisit after first 100 signups)
- Convex function bundle size audit
- Dashboard/Studio redesign (separate workstream per existing plans)
- i18n / localization
- Custom domain per project

## Assumptions

- Convex production deployment can be created independently of dev
- GitHub OAuth App supports multiple callback URLs (prod + dev)
- Vercel deployment is on Hobby or Pro plan
- `pagescms.org` style direction is approved (minimal, clean, confident)
- Remotion can render static MP4/WebM for embedding (no server-side rendering needed)
- `gray-matter` (already in deps) is sufficient for MDX blog frontmatter parsing

## Dependencies

- **Domain**: Canonical production domain must be confirmed before SEO phase (DNS propagation = 24-48hr). Start immediately.
- **Error monitoring decision**: Sentry free tier vs Vercel built-in (Pro plan only)
- **GitHub OAuth App**: Prod callback URL must be added before prod deployment
- **Convex production environment**: Must exist before Vercel env vars can be set

---

## Branch Strategy

Two parallel branches, both starting from `main`:

| Branch | Phases | Focus |
|---|---|---|
| `release/production-hardening` | 0, 4, 5, 7 | Security, infra, SEO, launch ops |
| `feature/website-redesign` | 1, 2, 3, 6 | Design system, landing, pages, videos |

Merge order: `release/production-hardening` first (security gates), then `feature/website-redesign`.

---

## Phase 0 - Security & Build Gate 🔴 BLOCKING

Everything else is blocked until this phase passes. All tasks on `release/production-hardening` branch.

### TODO 0.1 - Fix Convex auth vulnerabilities (CRITICAL)

**File**: `convex/projects.ts`

**Problem (verified)**:
- `export const list` (line 23): Public query that accepts arbitrary `userId` with ZERO session verification. Any client can enumerate any user's projects.
- `getByRepo` (line ~116): Has conditional auth that fails open - if no OAuth session found, the query proceeds without verification instead of rejecting.

**Fix**:
- Remove or convert `list` to `internalQuery`. UI already uses auth-gated `listMyProjects`, `listMyProjectsForRepo`, and `listAccessibleProjects`.
- Remove or convert `getByRepo` to `internalQuery`. UI uses `findByRepo` which has proper auth.
- Audit every `import` of these functions across the codebase to ensure nothing breaks.

**Acceptance**: Unauthenticated call to `projects:list` returns 401 or empty result set.

### TODO 0.2 - Standardize route-level auth (HIGH)

**Files**: All `app/api/github/*.ts` and `app/api/media/*.ts` routes

**Problem (verified)**:
API routes check GitHub token presence but NOT RepoPress project access. User A with a valid GitHub token can operate on User B's project context through these routes.

**Reference pattern**: `lib/route-auth.ts` → `resolveRouteAuth()` already exists and does proper auth chain verification.

**Routes to fix**:
| Route | Current Auth | Missing |
|---|---|---|
| `app/api/github/save/route.ts` | GitHub token ✓ | Project access check ✗ |
| `app/api/github/file/route.ts` | GitHub token ✓ | Project access check ✗ |
| `app/api/github/upload-image/route.ts` | GitHub token ✓ | Project access check ✗ |
| `app/api/github/sync-titles/route.ts` | GitHub token ✓ | Project access check ✗, rate limiting ✗ |

**Fix**: Standardize all sensitive routes to use `resolveRouteAuth()` before proceeding with GitHub operations.

**Acceptance**: Authenticated user cannot access another user's project data via API routes.

### TODO 0.3 - Add route input validation

**File**: `app/api/github/save/route.ts`

**Fix**:
- Validate `owner` and `repo` match `^[a-zA-Z0-9._-]+$`
- Validate `path` does not contain `..` or start with `/`
- Return 400 with specific error message for each violation

**Acceptance**: `path=../../etc/passwd` returns 400; valid path returns 200.

### TODO 0.4 - Fix webhook error disclosure (HIGH)

**File**: `app/api/webhooks/github/route.ts` (line 72)

**Problem (verified)**: Route returns raw error messages in the response body, leaking internal details.

**Fix**: Replace with generic "Webhook processing failed" message. Log actual error server-side.

**Acceptance**: Error responses contain no internal details (stack traces, function names, database info).

### TODO 0.5 - Webhook URL validation (MEDIUM)

**File**: `convex/webhooks.ts`

**Problem (verified)**: No validation on webhook URLs. Users can store URLs pointing to `localhost`, `127.0.0.1`, private IPs (`10.x`, `172.16-31.x`, `192.168.x`), creating SSRF risk via stored webhooks.

**Reference**: `app/api/media/download-external/route.ts` has SSRF protection - use as reference.

**Fix**:
- Block URLs pointing to localhost, 127.0.0.1, ::1, 10.x.x.x, 172.16-31.x.x, 192.168.x.x
- Reject non-HTTPS URLs in production environments
- Apply validation in both `create` and `update` mutations

**Acceptance**: `url=http://localhost:3000` returns validation error.

### TODO 0.6 - Remove build bypass

**File**: `next.config.mjs`

**Problem (verified)**:
- Line 4: `typescript: { ignoreBuildErrors: true }` - suppresses ALL type errors during build
- Line 7: `images: { unoptimized: true }` - disables Next.js Image optimization

**Fix**:
1. Delete both flags from `next.config.mjs`
2. Fix 3 Tailwind v4 gradient warnings (verified - only 3, not 9 as originally claimed):
   - `components/landing/hero.tsx:32` → `bg-gradient-to-r` → `bg-linear-to-r`
   - `components/landing/cta.tsx:27` → `bg-gradient-to-r` → `bg-linear-to-r`
   - `components/landing/feature-grid.tsx:128` → `bg-gradient-to-br` → `bg-linear-to-br`
3. Fix any TypeScript errors that surface
4. Run: `npm run lint:fix && npm run build`

**Note**: `studio-layout.tsx` and `chart.tsx` are clean - no gradient issues (original plan was wrong about these two files).

**Acceptance**: `npm run build` exits 0 with no suppression flags.

### TODO 0.7 - Add production security headers

**File**: `next.config.mjs`

**Fix**: Add `headers()` function returning security headers for all routes (`source: '/(.*)'`):
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=()
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.convex.cloud https://*.convex.site https://api.github.com;
```

CSP is permissive initially - tighten post-launch after monitoring for violations.

**Acceptance**: `curl -I` on production shows all headers present.

---

## Phase 1 - Design System Overhaul (Redesign Branch)

Foundation for the entire visual redesign. Must complete before any page work. All tasks on `feature/website-redesign` branch.

### TODO 1.1 - New color token system

**File**: `app/globals.css`

**Current state (verified)**: OKLCH color system with achromatic (zero-chroma) tokens - effectively already black/white, but accent is also achromatic.

**Fix**: Introduce electric blue accent while keeping black/white base:
```css
/* New accent color: electric blue */
--primary: oklch(0.623 0.214 259);         /* Electric blue */
--primary-foreground: oklch(0.985 0 0);    /* White on blue */
--accent: oklch(0.623 0.214 259 / 0.1);   /* Subtle blue tint */
--accent-foreground: oklch(0.623 0.214 259);
--ring: oklch(0.623 0.214 259);            /* Focus rings in blue */
```

Maintain all existing shadcn token names for compatibility. Remove orange/pink/purple gradient tokens from landing components. Add blue-tinted chart colors.

**Dark mode**: Same blue accent, near-black backgrounds, near-white foregrounds.

**Acceptance**: All existing components render correctly with new tokens; blue accent visible on CTAs, links, and focus states.

### TODO 1.2 - Normalize component radius

**Current state (verified)**: Inconsistent across the site:
- Landing: `rounded-full` buttons, `rounded-3xl` and `rounded-[2.5rem]` cards
- Dashboard: `rounded-md` buttons, `rounded-xl` cards

**Fix**: Standardize radius system:
- CTAs / pill buttons: `rounded-full`
- Cards / containers: `rounded-xl`
- Inputs / secondary buttons: `rounded-lg`
- Badges / chips: `rounded-full`

Update `--radius` CSS variable and button component defaults.

**Acceptance**: Consistent border radius across landing and dashboard.

### TODO 1.3 - Replace hardcoded colors with design tokens

**Files**: `components/landing/*.tsx`

**Problem (verified - 20+ instances)**:
```
cta.tsx: bg-zinc-50, bg-zinc-900, text-zinc-900, text-zinc-600, bg-zinc-100, border-zinc-200
feature-grid.tsx: bg-zinc-50, bg-zinc-900, text-zinc-400, bg-zinc-100, border-zinc-200, bg-zinc-800
hero.tsx: bg-orange-500/20, bg-pink-500/20, bg-purple-500/20 (gradient)
cta.tsx: bg-orange-200, bg-pink-200, bg-purple-200 (gradient)
feature-grid.tsx: bg-purple-500/10
```

**Fix**: Replace ALL hardcoded colors with semantic design tokens:
- `bg-zinc-50` → `bg-muted` or `bg-card`
- `bg-zinc-900` → `bg-foreground` or `bg-primary`
- `text-zinc-600` → `text-muted-foreground`
- `border-zinc-200` → `border`
- Orange/pink/purple gradients → electric blue gradient variants
- `bg-purple-500/10` → `bg-primary/10`

**Acceptance**: `grep -r "bg-zinc-\|text-zinc-\|bg-orange\|bg-pink\|bg-purple" components/landing/` returns empty.

### TODO 1.4 - Typography scale

**Current state**: Geist Sans + Geist Mono already configured. No explicit type scale system.

**Fix**: Define consistent type scale (utilities or Tailwind classes):
| Element | Classes |
|---|---|
| Hero headline | `text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight` |
| Section heading | `text-3xl md:text-4xl font-bold tracking-tight` |
| Sub-heading | `text-xl md:text-2xl font-semibold` |
| Body large | `text-lg text-muted-foreground leading-relaxed` |
| Body | `text-base text-muted-foreground` |
| Caption | `text-sm text-muted-foreground` |
| Code | `font-mono text-sm` |

**Acceptance**: Typography is consistent across all pages.

---

## Phase 2 - Landing Page Redesign (Redesign Branch)

Reference: pagescms.org - clean, minimal, confident. Lead with unique differentiators.

### TODO 2.1 - Remove fake social proof

**Files (verified)**:
- `components/landing/hero.tsx` line 77: `"Join 80,000+ developers"` + avatar stack placeholder
- `components/landing/cta.tsx` line 17: `"Join thousands of developers"`

**Fix**: Remove all fabricated numbers. Replace with honest signals:
- GitHub star badge via shields.io (live count)
- "Free & Open Source" badge
- "Early Access" framing
- Or simply remove and let the product speak

**Acceptance**: Zero fabricated numbers anywhere on `/`.

### TODO 2.2 - Hero section redesign

**File**: `components/landing/hero.tsx`

**Current state**: Mock editor UI with browser chrome (red/yellow/green dots), orange/pink/purple gradient background glow, fake developer count.

**New design**:
- Headline: "Your repo is your CMS" or "Git-Native Headless CMS for GitHub"
- Sub-headline: "Works with Next.js, Astro, Hugo, Docusaurus, and more - auto-detected"
- Framework logo grid (8+ icons) below headline
- Animated Studio demo (Remotion video or high-quality static screenshot) replacing mock editor
- Primary CTA: "Connect a repo → free" (`rounded-full`, electric blue)
- Secondary CTA: "View on GitHub" (outline style)
- Background: subtle electric blue glow replacing orange/pink/purple

**Acceptance**: Hero communicates value prop in under 5 seconds.

### TODO 2.3 - Feature section redesign

**File**: `components/landing/feature-grid.tsx`

**Current state**: Bento grid with generic placeholder illustrations and hardcoded zinc colors.

**New design**: Restructure around RepoPress's unique competitive advantages:
1. **Framework Auto-Detection** (UNIQUE - no competitor has this) - lead feature
2. **Visual MDX Editor** (Studio) - screenshot or demo clip
3. **Document Workflows** (draft → review → approved → published → archived)
4. **Document History & Revert** - timeline visualization
5. **Webhooks for CI/CD** - automation flow diagram
6. **Multi-Project per Repo** - dashboard preview

Each card: icon + heading + 1-2 sentence description + visual. Black/white cards with blue accent icons.

**Acceptance**: Features section highlights what competitors don't have.

### TODO 2.4 - Add "How It Works" section

**Create**: `components/landing/how-it-works.tsx`

4-step visual flow:
1. Sign in with GitHub (OAuth icon)
2. Select your repo (repo list preview)
3. Auto-detect your framework (framework detection animation)
4. Edit & publish from Studio (editor preview)

Minimal illustrations per step. Horizontal on desktop, vertical on mobile.

**Acceptance**: New visitor understands the workflow in one scroll.

### TODO 2.5 - Add comparison section

**Create**: `components/landing/comparison.tsx`

Table comparing RepoPress vs top competitors:

| Feature | RepoPress | Decap CMS | TinaCMS | Keystatic |
|---|---|---|---|---|
| Framework auto-detect | ✅ 8+ | ❌ Manual | ❌ Manual | ❌ Manual |
| Document history | ✅ Full | ❌ | ❌ | ❌ |
| Webhooks | ✅ Built-in | ❌ | ❌ | ❌ |
| Workflow states | ✅ 6 states | ❌ Draft only | ⚠️ 2 states | ❌ Draft only |
| Multi-project | ✅ | ❌ | ❌ | ❌ |
| Visual editor | ✅ | ✅ | ✅ | ✅ |
| Open source | ✅ | ✅ | ✅ | ✅ |

Clean table design with electric blue check marks.

**Acceptance**: Comparison clearly shows RepoPress advantages.

### TODO 2.6 - Add FAQ section

**Create**: `components/landing/faq.tsx`

Use shadcn Accordion component. Questions:
- "Is RepoPress free?" → "Free and open source. Always."
- "Do you only support GitHub?" → "Yes, GitHub-only for now. GitLab/Bitbucket on the roadmap."
- "How is this different from Decap/TinaCMS?" → Framework auto-detect, workflows, history
- "Does it work with private repos?" → "Yes, with appropriate GitHub permissions."
- "Where is my content stored?" → "In your Git repo, always. RepoPress never stores your content."
- "What frameworks are supported?" → List of 8+ with auto-detection

**Acceptance**: FAQ answers common first-visit questions.

### TODO 2.7 - CTA section redesign

**File**: `components/landing/cta.tsx`

**Current state**: "Join thousands of developers" (fabricated), orange/pink/purple gradient glow, zinc-colored mock UI.

**New design**:
- Clean black/white with subtle blue accent gradient
- Honest headline: "Start managing content from your repo"
- "Free & Open Source" badge
- Single CTA button matching hero style
- Remove mock UI or replace with real screenshot

**Acceptance**: No fabricated social proof; clean design consistent with hero.

### TODO 2.8 - Footer redesign

**File**: `components/landing/footer.tsx`

**Current state**: Minimal footer, missing standard SaaS links.

**New design** - 4-column layout:
| Product | Resources | Legal | Community |
|---|---|---|---|
| Features | Blog | Privacy | GitHub |
| Studio | Docs | Terms | Twitter/X |
| Pricing | Changelog | | Discord (future) |

Plus: GitHub star badge, "Built with ❤️ and Git" tagline.

**Acceptance**: Footer has all standard links including Privacy, Terms, Blog, Docs.

### TODO 2.9 - Navbar improvements

**File**: `components/landing/navbar.tsx`

**Current state**: No navigation links, no mobile hamburger menu.

**Fix**:
- Add nav links: Features (anchor), Docs, Blog, GitHub (external)
- Add mobile hamburger menu with Sheet/Drawer component
- Sticky with backdrop blur (`sticky top-0 backdrop-blur-md bg-background/80`)
- Login/Dashboard CTA button (right-aligned)

**Acceptance**: Navbar works on all screen sizes; hamburger menu on mobile.

### TODO 2.10 - Landing page composition update

**File**: `app/page.tsx`

Update page composition to include new sections:
```tsx
<Navbar />
<Hero />
<FeatureGrid />
<HowItWorks />
<Comparison />
<FAQ />
<CTA />
<Footer />
```

**Acceptance**: All new sections render in correct order.

---

## Phase 3 - New Pages (Redesign Branch)

### TODO 3.1 - Blog infrastructure + first posts

**Create**:
- `app/blog/page.tsx` - blog index with card grid
- `app/blog/[slug]/page.tsx` - individual post layout with prose styling
- `content/blog/` - MDX files with gray-matter frontmatter
- `lib/blog.ts` - blog utility functions (list posts, get post by slug, parse frontmatter)

**Frontmatter schema**:
```yaml
---
title: "Introducing RepoPress"
date: "2026-04-15"
excerpt: "A Git-native headless CMS for GitHub repositories"
author: "RepoPress Team"
tags: ["launch", "open-source"]
image: "/images/blog/introducing-repopress/cover.png"
---
```

**First 3 posts**:
1. "Introducing RepoPress" - launch announcement, what it is, why
2. "Why Git-Native CMS" - philosophy, comparison with database-backed CMS
3. "Getting Started with RepoPress" - tutorial walkthrough

Blog index: card grid with title, date, excerpt, reading time. Responsive (1 col mobile, 2 col tablet, 3 col desktop).

Blog post: clean prose layout using `@tailwindcss/typography` (already in deps via plugin). ToC optional.

**Acceptance**: `/blog` renders post list; `/blog/introducing-repopress` renders full post with proper styling.

### TODO 3.2 - About page

**Create**: `app/about/page.tsx`

Sections:
- Mission statement ("Making content management simple for developers who love Git")
- What is RepoPress (elevator pitch)
- Open source philosophy
- Team/creator info
- Contribution invitation with link to CONTRIBUTING.md

**Acceptance**: `/about` returns 200 with meaningful, non-placeholder content.

### TODO 3.3 - Docs pages (minimal)

**Create**:
- `app/docs/layout.tsx` - docs layout with sidebar navigation
- `app/docs/page.tsx` - docs index/overview
- `content/docs/getting-started.mdx`
- `content/docs/how-it-works.mdx`
- `content/docs/connecting-a-repo.mdx`
- `content/docs/studio-editor.mdx`
- `lib/docs.ts` - docs utility functions

**Sidebar**: Render navigation from a simple config array or `folderMeta` pattern already in the codebase.

4 pages minimum:
1. **Getting Started** - Prerequisites, login, connect first repo
2. **How It Works** - Architecture overview for technical users
3. **Connecting a Repo** - Step-by-step repo setup + project creation
4. **Studio Editor** - MDX editor features, save/publish flow

**Acceptance**: `/docs/getting-started` is indexable, renders in <2s, passes Lighthouse 90+.

### TODO 3.4 - Legal pages

**Create**:
- `app/privacy/page.tsx` - Privacy Policy
- `app/terms/page.tsx` - Terms of Service

Use a generated template (e.g., Termly, or a reasonable open-source template). Label "Last updated: [date]" and "This is a general policy template." at the top.

Add footer links from `components/landing/footer.tsx`.

**Acceptance**: `/privacy` and `/terms` return 200; both linked from footer.

### TODO 3.5 - Pricing / free tier statement

**Decision**: "Free during early access - always open-source" (lowest friction for first launch).

**Options** (decide before building):
- **Option A**: Prominent badge on hero section - "Free & Open Source" pill
- **Option B**: Dedicated `/pricing` page with free tier details and future plans
- **Recommendation**: Both - badge on hero + simple pricing page

**Acceptance**: First-time visitor can answer "what does this cost?" in under 10 seconds.

---

## Phase 4 - Production Infrastructure (Hardening Branch)

### TODO 4.1 - Production Convex deployment

- Create a separate Convex production deployment (independent of dev)
- Set all environment variables in Convex production dashboard:
  - `GITHUB_CLIENT_ID` - production GitHub OAuth App
  - `GITHUB_CLIENT_SECRET` - production secret
  - `BETTER_AUTH_SECRET` - generate NEW random secret for prod (do NOT reuse dev)
  - `SITE_URL` - production Convex site URL (e.g., `https://repopress.convex.site`)
- Update GitHub OAuth App: add production callback URL `https://<prod>.convex.site/api/auth/callback/github`
- Run `npx convex deploy --prod` to push schema and functions

**Acceptance**: OAuth login works on production domain without affecting dev environment.

### TODO 4.2 - Vercel production environment

- Set environment variables in Vercel dashboard:
  - `NEXT_PUBLIC_CONVEX_URL` - production Convex URL
  - `NEXT_PUBLIC_CONVEX_SITE_URL` - production Convex site URL
  - `CONVEX_DEPLOYMENT` - production deployment string
  - `NEXT_PUBLIC_APP_URL` - canonical production domain
- Confirm `NEXT_PUBLIC_APP_URL` is used in `metadataBase` (ties to TODO 5.1)
- Add startup env validation - fail fast if required vars missing:
  ```typescript
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) throw new Error("NEXT_PUBLIC_CONVEX_URL is required")
  ```

**Acceptance**: `/_next/static` assets and API routes all resolve on production domain.

### TODO 4.3 - GitHub Actions CI

**Create**: `.github/workflows/ci.yml`

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: npx tsc --noEmit

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
```

**Acceptance**: PR to main shows three green check marks (lint, typecheck, test).

### TODO 4.4 - Error monitoring

**Decision needed**: Sentry free tier vs Vercel built-in (Pro plan only).

**If Sentry** (recommended for Hobby plan):
- Install `@sentry/nextjs`
- Create `sentry.client.config.ts` and `sentry.server.config.ts`
- Set `SENTRY_DSN` in Vercel env vars
- Add to `next.config.mjs`: `withSentryConfig(nextConfig, { ... })`

**If Vercel built-in**: No code changes needed, just enable in Vercel dashboard.

**In either case**: Capture unhandled errors in route handlers and Convex actions.

**Acceptance**: A thrown error in a route handler appears in error dashboard within 60 seconds.

### TODO 4.5 - Rollback runbook

**Create**: `docs/runbook/rollback.md` (or internal doc)

Contents:
1. How to revert Vercel deployment (one-click rollback)
2. How to revert Convex deployment (`npx convex deploy --prod` with previous version)
3. How to disable webhook processing (toggle `isActive` flag)
4. How to disable publish path (temporary mutation guard)
5. "Stop the bleeding" checklist for incident response
6. Contact information and escalation path

**Acceptance**: Rollback runbook exists and has been reviewed.

---

## Phase 5 - SEO & Discovery (Hardening Branch)

### TODO 5.1 - Root metadata and OG

**File**: `app/layout.tsx`

**Current state (verified)**:
- Line 15: `generator: "v0.app"` - must remove (reveals build tool, no SEO value)
- Missing: `metadataBase`, `openGraph`, `twitter` card config, `robots`

**Fix**:
```typescript
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://repopress.dev"),
  title: {
    default: "RepoPress - Git-Native Headless CMS",
    template: "%s | RepoPress",
  },
  description: "Visual MDX editing with draft/publish workflows for GitHub repositories. Works with Next.js, Astro, Hugo, Docusaurus, and more.",
  openGraph: {
    title: "RepoPress - Git-Native Headless CMS",
    description: "Visual MDX editing with draft/publish workflows for GitHub repos.",
    url: "/",
    siteName: "RepoPress",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    creator: "@repopress",
  },
  robots: {
    index: true,
    follow: true,
  },
}
```

Remove `generator: "v0.app"`.

**Acceptance**: OG scraper shows image and title for root URL.

### TODO 5.2 - Sitemap and robots

**Create**: `app/sitemap.ts`
```typescript
export default function sitemap() {
  return [
    { url: '/', lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: '/blog', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: '/about', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: '/docs', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: '/docs/getting-started', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: '/docs/how-it-works', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: '/docs/connecting-a-repo', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: '/docs/studio-editor', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: '/privacy', lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: '/terms', lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: '/login', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ]
}
```

**Create**: `app/robots.ts`
```typescript
export default function robots() {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${process.env.NEXT_PUBLIC_APP_URL}/sitemap.xml`,
  }
}
```

**Acceptance**: `/sitemap.xml` and `/robots.txt` return valid content on production.

### TODO 5.3 - OG image

**Create**: `app/opengraph-image.tsx`

Using Next.js `ImageResponse` API:
- RepoPress wordmark (text-based, no external font needed)
- Tagline: "Git-Native Headless CMS"
- Dark background (near-black) with electric blue accent
- 1200×630 dimensions

**Acceptance**: Link preview on Twitter/Slack shows the OG image correctly.

### TODO 5.4 - Google Search Console

Manual step (not code):
- Add domain to Google Search Console
- Verify ownership via DNS TXT record or HTML file
- Request indexing for `/`, `/docs`, `/docs/getting-started`, `/blog`

**Acceptance**: Pages appear in Coverage report within 48 hours.

---

## Phase 6 - Remotion Videos & Polish (Redesign Branch)

### TODO 6.1 - Set up Remotion

**Install** (pnpm, as per project lockfile):
```bash
pnpm add remotion @remotion/cli @remotion/renderer @remotion/transitions zod
```

> `@remotion/transitions` is required for `TransitionSeries` (scene cuts between demo steps).
> `zod` is required for parametrizable compositions (schema-driven props in the Remotion Studio sidebar).

**Directory structure**:
```
remotion/
  Root.tsx                        # Composition registry - all compositions declared here
  remotion.config.ts              # Remotion configuration
  compositions/
    StudioDemo.tsx                # Full product walkthrough (main hero video)
    FrameworkDetection.tsx        # Feature highlight: framework scanning animation
    DocumentWorkflow.tsx          # Feature highlight: status state machine visualization
    LivePreview.tsx               # Feature highlight: side-by-side edit + preview
  scenes/
    LoginScene.tsx                # StudioDemo scene 1: GitHub OAuth
    RepoSelectScene.tsx           # StudioDemo scene 2: repository list
    DetectScene.tsx               # StudioDemo scene 3: framework detection
    StudioOpenScene.tsx           # StudioDemo scene 4: editor opening
    EditScene.tsx                 # StudioDemo scene 5: editing with live preview
    PublishScene.tsx              # StudioDemo scene 6: commit animation
  components/
    MacOSChrome.tsx               # Reusable browser/window chrome wrapper
    FrameworkLogo.tsx             # Individual framework logo with entrance animation
    StatusBadge.tsx               # Document status badge (draft, published, etc.)
```

**`remotion/Root.tsx` - Composition registry** (must use `<Folder>` for organization):
```tsx
import { Composition, Folder } from "remotion";
import { StudioDemo, StudioDemoSchema } from "./compositions/StudioDemo";
import { FrameworkDetection } from "./compositions/FrameworkDetection";
import { DocumentWorkflow } from "./compositions/DocumentWorkflow";
import { LivePreview } from "./compositions/LivePreview";

export const RemotionRoot = () => {
  return (
    <>
      <Folder name="Marketing">
        <Composition
          id="StudioDemo"
          component={StudioDemo}
          schema={StudioDemoSchema}
          durationInFrames={900}  // 30 seconds at 30fps
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{ showCaptions: true }}
        />
      </Folder>
      <Folder name="Features">
        <Composition id="FrameworkDetection" component={FrameworkDetection} durationInFrames={300} fps={30} width={1920} height={1080} />
        <Composition id="DocumentWorkflow"   component={DocumentWorkflow}   durationInFrames={300} fps={30} width={1920} height={1080} />
        <Composition id="LivePreview"        component={LivePreview}        durationInFrames={300} fps={30} width={1920} height={1080} />
      </Folder>
    </>
  );
};
```

**Key setup rules** (enforced by Remotion skill):
- `fps: 30` for all compositions (standard for desktop product demos)
- `width: 1920, height: 1080` (16:9 - embeds cleanly at all hero widths)
- Place all static assets (screenshots, logos) in `remotion/public/` and reference with `staticFile()` - NEVER use relative paths
- **CSS transitions and Tailwind animation classes (e.g. `animate-fadeIn`) are FORBIDDEN** - Remotion's renderer does not execute them correctly. All motion MUST be driven by `useCurrentFrame()`.

**Acceptance**: `npx remotion preview` opens the Studio and renders a test composition without errors.

### TODO 6.2 - Studio demo video

**Composition**: `remotion/compositions/StudioDemo.tsx`  
**Duration**: ~30 seconds at 30fps = 900 frames total  
**Resolution**: 1920×1080 (16:9)

**Scene flow** - use `<TransitionSeries>` from `@remotion/transitions` for all scene cuts:
1. **LoginScene** (~4s / 120 frames) - GitHub OAuth button + click → redirect
2. **RepoSelectScene** (~4s / 120 frames) - dashboard list, cursor selects a repo
3. **DetectScene** (~5s / 150 frames) - scanning animation with framework logos appearing one by one
4. **StudioOpenScene** (~4s / 120 frames) - editor sliding open with MDX content loading
5. **EditScene** (~8s / 240 frames) - typing in editor, live preview updating in sync
6. **PublishScene** (~5s / 150 frames) - publish button → commit animation → GitHub link

**Scene transitions** - use `fade()` with `linearTiming({ durationInFrames: 15 })` between scenes:
```tsx
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={120} premountFor={30}>
    <LoginScene />
  </TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
  <TransitionSeries.Sequence durationInFrames={120} premountFor={30}>
    <RepoSelectScene />
  </TransitionSeries.Sequence>
  {/* ...repeat for all 6 scenes */}
</TransitionSeries>
```

**Animation patterns per scene**:
- UI element entrances (cards, buttons sliding in): `spring({ frame, fps, config: { damping: 200 } })` - smooth, no bounce
- Cursor movement: `interpolate(frame, [0, 30], [startX, endX], { extrapolateRight: "clamp" })`
- Framework logos appearing sequentially: staggered `spring` with `delay` per logo index
- Typing effect (EditScene): string slice by frame `content.slice(0, Math.floor(frame / 1.5))`
- Opacity fade-ins: `interpolate(frame, [0, fps * 0.5], [0, 1], { extrapolateRight: "clamp" })`

**Spring config reference for this video**:
```tsx
const smooth   = { damping: 200 };           // Scene entrances, panel reveals
const snappy   = { damping: 20, stiffness: 200 }; // Button presses, badge updates
const bouncy   = { damping: 8 };             // Framework logo pop-in (DetectScene only)
```

**Parametrize with Zod** (so caption visibility is toggleable in Remotion Studio):
```tsx
import { z } from "zod";
export const StudioDemoSchema = z.object({ showCaptions: z.boolean() });
```

**Always premount sequences** to avoid pop-in artifacts - use `premountFor={fps}` on every `<Sequence>`.

**Assets**: Place all UI screenshots in `remotion/public/screenshots/`. Reference via:
```tsx
import { Img, staticFile } from "remotion";
<Img src={staticFile("screenshots/studio-editor.png")} />
```

**Rendering**: `npx remotion render remotion/Root.tsx StudioDemo --codec=h264 out/studio-demo.mp4`  
Also render WebM for Firefox: `--codec=vp8 out/studio-demo.webm`  
Embed in hero: `<video autoPlay muted loop playsInline>` (no Remotion client bundle in production)

**Acceptance**: Demo video plays in hero, communicates full product flow in under 30 seconds. No pop-in, no frame jitter.

### TODO 6.3 - Feature highlight videos

Short (8-10 second / 240-300 frame) compositions for the 3 feature cards. Each is self-contained, loops cleanly.

**1. FrameworkDetection** (`remotion/compositions/FrameworkDetection.tsx`)  
- Grid of 8 framework logos (Next.js, Astro, Hugo, Docusaurus, Jekyll, Fumadocs, Nextra, Contentlayer)
- Each logo enters with `spring({ frame: frame - i * 8, fps, config: { damping: 8 } })` (bouncy pop-in, staggered by 8 frames per logo)
- After all logos appear, a "Detected: fumadocs" badge fades in with `{ damping: 200 }`
- Use `<Series>` to sequence the "scanning" phase then the "result" phase

**2. DocumentWorkflow** (`remotion/compositions/DocumentWorkflow.tsx`)  
- Status badges (draft → in_review → approved → published) animate left-to-right
- Each transition: current badge fades + slides out (`interpolate` opacity + translateX `"clamp"`), next slides in
- Connector line between badges draws using SVG `strokeDashoffset` animated with `interpolate`
- Use `<Series>` with `durationInFrames={60}` per state

**3. LivePreview** (`remotion/compositions/LivePreview.tsx`)  
- Split-screen: editor (left) + preview (right)
- Typewriter effect on left: `content.slice(0, charCount)` where `charCount = Math.floor(frame * 2.5)`
- Preview panel re-renders with a subtle spring scale (`spring({ frame: frame - triggerFrame, fps, config: { damping: 200 } }) mapped to [0.98, 1]`) to show "update received"
- Use `<Sequence premountFor={fps}>` for the preview panel

**General rules for all 3**:
- All animations via `useCurrentFrame()` + `interpolate`/`spring` - **zero CSS animations**
- `useVideoConfig()` to get `fps` for all time calculations (never hardcode frame counts for timing)
- Use `extrapolateRight: "clamp"` and `extrapolateLeft: "clamp"` on all `interpolate` calls that should not overflow
- Assets loaded via `staticFile()` for screenshots, `<Img>` not `<img>`

**Render all 3**:
```bash
npx remotion render remotion/Root.tsx FrameworkDetection --codec=h264 out/feature-framework.mp4
npx remotion render remotion/Root.tsx DocumentWorkflow   --codec=h264 out/feature-workflow.mp4
npx remotion render remotion/Root.tsx LivePreview        --codec=h264 out/feature-preview.mp4
```

Place rendered files in `public/videos/` and embed in feature cards.

**Acceptance**: All 3 videos render without errors, loop cleanly, and are embedded in the correct feature cards.

### TODO 6.4 - Cookie consent banner

**Create**: `components/cookie-consent.tsx`

Minimal banner (GDPR compliance for EU visitors):
- "We use cookies for analytics" + Accept/Decline buttons
- Store consent in `localStorage` key `cookie-consent`
- Suppress Vercel `<Analytics />` component until consent given
- Wire into `components/providers.tsx`

**Acceptance**: Fresh incognito session shows zero analytics events until banner is accepted.

---

## Phase 7 - Launch Ops

### TODO 7.1 - README update

**File**: `README.md`

Fixes:
- Line 90: `middleware.ts` → `proxy.ts` (verified - middleware.ts was deleted, proxy.ts is the replacement)
- Update feature list to match new landing page
- Add screenshots (from Remotion renders or actual product)
- Update setup instructions to match current dev flow
- Add badges: GitHub stars, license, CI status

**Acceptance**: New contributor can run dev server without asking questions.

### TODO 7.2 - CONTRIBUTING.md

**Create**: `CONTRIBUTING.md`

Sections:
- Development setup (prerequisites, clone, install, dev servers)
- Branch strategy (never push to main, use feature branches)
- Code style (Biome, no ESLint)
- Test expectations (Vitest, `__tests__/` directories)
- PR checklist (ownership checks, indexes, state machine, getOrCreate)
- Convex patterns (reference CLAUDE.md)

**Acceptance**: Contributor guide is clear, accurate, and complete.

### TODO 7.3 - Launch smoke test

Full manual test checklist:
1. `npm run build` exits 0 (no suppressions)
2. `npx tsc --noEmit` exits 0
3. `npm run test` all pass
4. GitHub OAuth login on production domain
5. Dashboard → select repo → create project → open Studio
6. Save draft → edit → publish → webhook fires
7. Lighthouse on `/`: Performance ≥80, Accessibility ≥90, SEO ≥90
8. Lighthouse on `/dashboard`: Performance ≥80, Accessibility ≥90
9. OG preview: paste prod URL into Twitter Card Validator + Slack
10. Mobile responsive check on all public pages
11. Security headers present (`curl -I`)
12. Error monitoring receiving heartbeat
13. CI passes on test PR

**Acceptance**: All flows complete without console errors; all Lighthouse targets met.

### TODO 7.4 - Launch prep materials

- 60-word tagline for Product Hunt / Hacker News
- 300-word product description
- 3-5 product screenshots (Studio, dashboard, publish flow, framework detection)
- Demo repo URL (public GitHub repo that showcases Studio)
- Schedule launch post
- Notify personal network 24hr before

**Acceptance**: Product Hunt submission draft is ready to publish.

---

## Corrections to Original Plan

| Original Claim | Verified Finding |
|---|---|
| "~9 Biome Tailwind shorthand warnings" in 5 files | 3 warnings in 3 files only (hero, cta, feature-grid) |
| `studio-layout.tsx` has gradient issues | Clean - no gradient classes found |
| `chart.tsx` has gradient issues | Clean - no gradient classes found |
| Security scope: 2 Convex queries only | Actually 2 CRITICAL + 6 HIGH + 8 MEDIUM issues |
| "Hotjar >30% CTA click rate" as launch gate | Not a ship gate - post-launch measurement only |
| No mention of route-level auth gaps | 4 API routes missing project access checks |
| No rollback plan | Added as TODO 4.5 |
| No environment validation | Added to TODO 4.2 |
| No webhook SSRF protection | Added as TODO 0.5 |
| No webhook error disclosure fix | Added as TODO 0.4 |

## Competitive Positioning (Research Summary)

**RepoPress's unique advantages** (no single competitor has all of these):
1. **Framework auto-detection** - 8+ frameworks (Next.js, Astro, Hugo, Docusaurus, Jekyll, Fumadocs, Nextra, Contentlayer) - zero manual config
2. **Document history + revert** - full version timeline, one-click revert
3. **Webhooks for CI/CD** - built-in webhook management with event filtering
4. **Advanced workflow states** - 6 states (draft → in_review → approved → published → scheduled → archived) vs competitors' 1-2
5. **Multi-project per repo** - different content roots within the same repository

**Market positioning**: "The CMS for developers who use multiple frameworks"

**Key competitor vulnerabilities**:
- Decap CMS (19K★): Legacy codebase, complex config, no framework detection
- TinaCMS (13K★): Heavy, requires TinaCloud for collaboration features
- Contentlayer (3.5K★): Unmaintained/dead - cautionary tale for sustainability messaging
- Keystatic (2K★): Limited to React frameworks

## Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| TypeScript errors surface when removing `ignoreBuildErrors` | HIGH | Fix incrementally; may need to add type assertions for edge cases |
| DNS propagation delays block SEO work | MEDIUM | Start domain setup on Day 1; use placeholder `metadataBase` |
| Remotion videos add significant bundle size | MEDIUM | Render to static MP4/WebM, serve from CDN, not client-side Remotion |
| Blog MDX parsing breaks on edge cases | LOW | Use `gray-matter` + `react-markdown` (proven stack already in deps) |
| OAuth callback URL mismatch in prod | HIGH | Test OAuth flow before public launch announcement |
| GitHub API rate limits during heavy save operations | MEDIUM | Log as known limitation; add Upstash rate limiting post-launch |

## Open Questions

1. **Domain**: What is the canonical production domain? (DNS propagation = 24-48hr - resolve immediately)
2. **Error monitoring**: Sentry free tier or Vercel built-in? (Depends on Vercel plan - Hobby = Sentry, Pro = either)
3. **Remotion hosting**: Self-host rendered videos on Vercel or use external CDN?
4. **Pricing model long-term**: Free forever (open-source sustainability?) vs. eventual SaaS tier?
5. **Analytics provider**: Vercel Analytics only, or add Plausible/PostHog for more detail?

## Rollout Plan

1. Merge `release/production-hardening` to `main` first (security + infra)
2. Deploy to production, verify OAuth + core flows work
3. Merge `feature/website-redesign` to `main` (pages + design)
4. Deploy redesigned site to production
5. Run full smoke test (TODO 7.3)
6. Submit to Google Search Console
7. Launch on Product Hunt / Hacker News

## Files Summary

### Files to modify
| File | Phase | Change |
|---|---|---|
| `convex/projects.ts` | 0 | Remove/gate `list` + `getByRepo` public queries |
| `app/api/github/save/route.ts` | 0 | Add project access check + input validation |
| `app/api/github/file/route.ts` | 0 | Add project access check |
| `app/api/github/upload-image/route.ts` | 0 | Add project access check |
| `app/api/github/sync-titles/route.ts` | 0 | Add project access check |
| `app/api/webhooks/github/route.ts` | 0 | Fix error disclosure |
| `convex/webhooks.ts` | 0 | Add URL validation |
| `next.config.mjs` | 0 | Remove bypass flags, add security headers |
| `components/landing/hero.tsx` | 0+2 | Fix gradient, remove fake proof, redesign |
| `components/landing/cta.tsx` | 0+2 | Fix gradient, remove fake proof, redesign |
| `components/landing/feature-grid.tsx` | 0+2 | Fix gradient, redesign features |
| `app/globals.css` | 1 | New color tokens (electric blue accent) |
| `components/landing/footer.tsx` | 2 | Add link columns, legal links |
| `components/landing/navbar.tsx` | 2 | Add nav links, mobile hamburger |
| `app/page.tsx` | 2 | Add new sections to composition |
| `app/layout.tsx` | 5 | Add metadata, OG, remove generator |
| `README.md` | 7 | Fix middleware→proxy, update features |

### Files to create
| File | Phase | Purpose |
|---|---|---|
| `components/landing/how-it-works.tsx` | 2 | How it works section |
| `components/landing/comparison.tsx` | 2 | Competitor comparison table |
| `components/landing/faq.tsx` | 2 | FAQ accordion |
| `app/blog/page.tsx` | 3 | Blog index |
| `app/blog/[slug]/page.tsx` | 3 | Blog post layout |
| `content/blog/*.mdx` | 3 | Blog posts (3 minimum) |
| `lib/blog.ts` | 3 | Blog utilities |
| `app/about/page.tsx` | 3 | About page |
| `app/docs/layout.tsx` | 3 | Docs layout with sidebar |
| `app/docs/page.tsx` | 3 | Docs index |
| `content/docs/*.mdx` | 3 | Docs content (4 pages) |
| `lib/docs.ts` | 3 | Docs utilities |
| `app/privacy/page.tsx` | 3 | Privacy policy |
| `app/terms/page.tsx` | 3 | Terms of service |
| `.github/workflows/ci.yml` | 4 | CI pipeline |
| `sentry.client.config.ts` | 4 | Error monitoring (if Sentry) |
| `sentry.server.config.ts` | 4 | Error monitoring (if Sentry) |
| `docs/runbook/rollback.md` | 4 | Rollback runbook |
| `app/sitemap.ts` | 5 | Sitemap |
| `app/robots.ts` | 5 | Robots.txt |
| `app/opengraph-image.tsx` | 5 | OG image |
| `remotion/` | 6 | Remotion video compositions |
| `components/cookie-consent.tsx` | 6 | Cookie consent banner |
| `CONTRIBUTING.md` | 7 | Contributor guide |

### Reference files (do not modify)
| File | Reason |
|---|---|
| `convex/repoAccessCache.ts` | Server-token-gated cache reference pattern |
| `app/api/media/download-external/route.ts` | SSRF protection reference |
| `app/api/webhooks/github/route.ts` | HMAC verification reference (keep logic, just fix error disclosure) |
| `app/login/actions.ts` | PAT cookie pattern is correct |
| `lib/route-auth.ts` | `resolveRouteAuth()` is the auth pattern to standardize on |
| `STUDIO-REDESIGN-FINAL-PLAN.md` | Studio UI research (Sanity, Notion, Contentful patterns) |

## Reviewers and Approvers

- Reviewer & Approver: @itsyogesh
- Implementer: @itsTarun (with Copilot agents)

## Next Steps

1. Confirm open decisions (domain, error monitoring, Remotion hosting)
2. Create feature branches from `main`
3. Start Phase 0 (security) - all 7 tasks can begin in parallel
4. Start Phase 1 (design system) in parallel on redesign branch
5. DNS setup for production domain (start immediately - 24-48hr propagation)

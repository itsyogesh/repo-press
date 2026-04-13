# Dashboard Redesign: Navigation Shell, Sidebar, User Menu & Card Improvements

## Summary

The dashboard (`/dashboard`) has zero navigation chrome - no header, sidebar, user menu, logout, or theme toggle. The primary user (non-technical content editor) needs the fastest path to the Studio editor, but the current layout is a flat wall of developer-oriented repo cards with GitHub vanity metrics. This plan adds a reusable header, collapsible sidebar with recent projects, user menu with logout, and improves card content to show CMS-relevant data.

## Context

- **GitHub Issue**: [#20](https://github.com/itsyogesh/repo-press/issues/20)
- **Prior art**: `components/settings/settings-layout.tsx` - existing layout pattern with header + sidebar
- **Studio page**: Uses `h-screen` full-takeover layout - dashboard layout must not interfere
- **Existing components to reuse**: `Avatar`, `DropdownMenu`, `Sidebar`, `StudioPageThemeToggle`, `signOut` from auth-client

## Goals

- **Primary**: Content editor can open their most recent project in Studio within 2 seconds of landing on the dashboard.
- **Secondary**: Dashboard has standard SaaS chrome (header with logo, user menu, theme toggle, logout) - reusable across all dashboard pages.
- **Tertiary**: Project and repo cards show CMS-relevant information instead of GitHub vanity metrics.

## Success Criteria / Acceptance

- [ ] Dashboard has a persistent header with RepoPress logo, theme toggle, and user avatar dropdown
- [ ] User can log out from the dashboard via the user dropdown menu
- [ ] Collapsible left sidebar shows recent projects (1-click navigation to Studio)
- [ ] Sidebar has navigation links: Home, Repositories, Settings
- [ ] Project cards show draft/published document counts and relative "last edited" time
- [ ] Repo cards replace stars/forks/watchers with project count, last content edit, CMS metrics
- [ ] Repos section has a client-side search/filter bar
- [ ] Project list shows a loading skeleton instead of blank (`null`) while loading
- [ ] Dashboard layout does NOT break Studio (`h-screen` full-screen layout still works)
- [ ] All existing functionality preserved - no regressions on repo hub, setup, settings, studio pages
- [ ] Header component is reusable (can be dropped into other dashboard pages)

## Scope

### In-scope
- Reusable `DashboardHeader` component (logo, theme toggle, user dropdown)
- `UserMenu` component (avatar, profile link, settings link, logout)
- `DashboardSidebar` component (collapsible, recent projects, nav links)
- `app/dashboard/layout.tsx` (wraps dashboard routes with header + sidebar)
- New Convex query for document counts per project
- Updated `ProjectCard` (draft/published counts, relative time, compact CTA)
- Updated `RepoCard` (CMS metrics instead of GitHub vanity stats)
- Repo search/filter bar (client-side)
- Loading skeleton for project list

### Out-of-scope
- Profile/account management page (just the link in the dropdown)
- Global settings page (just the link - settings is already per-repo)
- Keyboard shortcuts / command palette on dashboard (Phase 3 polish)
- Pagination / infinite scroll for repos (Phase 3)
- Welcome banner / onboarding wizard for new users (Phase 3)

## Assumptions

- The sidebar uses shadcn's existing `Sidebar` primitive from `components/ui/sidebar.tsx`
- Theme toggle reuses the pattern from `StudioPageThemeToggle` (Sun/Moon icon, `useTheme()`)
- `signOut()` from `lib/auth-client.ts` handles OAuth session cleanup; PAT logout clears the `github_pat` cookie
- The Studio page's `h-screen` container will work inside a flex layout if the layout uses `flex-1 min-h-0` for the content area (verified from `SettingsLayout` pattern)
- Document counts can be fetched via a new Convex query without performance issues (indexed by `projectId`)

## Dependencies

- No external dependencies - all required UI primitives already exist in the project
- Convex `documents` table already has a `by_projectId_status` index (verify before implementing)

## Proposed Approach

### Phase 1: Dashboard Shell (Header + Sidebar + Layout)

The highest-impact change - adds navigation chrome and instant project access.

**1a. DashboardHeader component** (`components/dashboard/dashboard-header.tsx`)
- Reusable client component
- Left: RepoPress logo (Box icon + "Repo" bold + "press" light) linking to `/dashboard`
- Right: Theme toggle (reuse `useTheme()` pattern), UserMenu component
- Sticky top bar with backdrop blur (match landing navbar pattern)
- Props: none needed (reads user from `useSession()`)

**1b. UserMenu component** (`components/dashboard/user-menu.tsx`)
- Client component using `useSession()` for user data
- `Avatar` with GitHub profile image, fallback to initials
- `DropdownMenu` with items: user name/email (header), separator, Settings, separator, Log out
- Logout handler: calls `signOut()`, clears `github_pat` cookie, redirects to `/login`

**1c. DashboardSidebar component** (`components/dashboard/dashboard-sidebar.tsx`)
- Uses shadcn `Sidebar` primitive OR custom minimal sidebar (evaluate complexity)
- Sections:
  - **Recent Projects**: List of up to 5 most recent projects, each linking directly to Studio URL
  - **Navigation**: Home (`/dashboard`), Repositories (scroll to repos section or anchor), Settings (link to repo settings for current/first project)
- Collapsible: toggle button in header or sidebar rail
- On mobile: sheet/drawer overlay

**1d. Dashboard layout** (`app/dashboard/layout.tsx`)
- Server component that wraps `{children}` with header + sidebar
- **Critical constraint**: Must use `flex` layout with `min-h-screen` (NOT `h-screen`) so Studio's own `h-screen` container works
- Pattern: `<div class="flex min-h-screen"><Sidebar /><div class="flex-1 flex flex-col"><Header /><main>{children}</main></div></div>`
- The sidebar needs Convex data (recent projects) - use a client component wrapper

**1e. Loading skeleton for project list** (modify `components/project-list.tsx`)
- Replace `return null` (line 26) with a 3-card skeleton grid
- Reuse existing `Skeleton` component

### Phase 2: Card Improvements

**2a. Convex query for document counts** (`convex/documents.ts`)
- New query: `countByProject` - takes `projectId`, returns `{ draft: number, published: number, total: number, lastEditedAt: number | null }`
- Uses existing `by_projectId_status` index
- Consider: batch query for multiple projectIds to avoid N+1

**2b. Update ProjectCard** (modify `components/project-card.tsx`)
- Add document count stats: "3 drafts · 12 published"
- Show relative time: "edited 2h ago" using a simple `formatRelativeTime()` utility
- Compact the "Open Studio" CTA: smaller button, not full-width, or inline link style
- Fetch counts via `useQuery(api.documents.countByProject, { projectId })`

**2c. Update RepoCard** (modify `components/repo-card.tsx`)
- Remove: stars, forks, watchers icons and counts
- Add: project count (already exists), last content edit time, total documents across projects
- Keep: Private badge, Connected/Set up badge, description, date
- The "Set up" badge should look less like a button - reduce visual weight

**2d. Repo search/filter bar** (new component or inline in `components/repo-grid.tsx`)
- Text input for filtering by repo name (client-side, repos already in memory)
- Toggle: "All" / "Connected" (filter by `connectedProjectCount > 0`)
- Place between section header and grid

### Phase 3: Polish (Future - not in this PR)

- Welcome banner for new users
- Dashboard-level command palette (`⌘K`)
- Pagination / "Show more" for 20+ repos
- Keyboard navigation for project/repo cards

## Milestones & Tasks

### Phase 1 - Dashboard Shell
- [ ] `components/dashboard/dashboard-header.tsx` - reusable header with logo + theme toggle + user menu
- [ ] `components/dashboard/user-menu.tsx` - avatar dropdown with profile, settings, logout
- [ ] `components/dashboard/dashboard-sidebar.tsx` - collapsible sidebar with recent projects + nav
- [ ] `app/dashboard/layout.tsx` - layout wrapper (must not break Studio)
- [ ] Update `components/project-list.tsx` - loading skeleton instead of `null`
- [ ] Verify: Studio, settings, repo hub, setup pages all render correctly with new layout

### Phase 2 - Card Improvements
- [ ] `convex/documents.ts` - add `countByProject` query (or batch variant)
- [ ] Update `components/project-card.tsx` - draft/published counts, relative time, compact CTA
- [ ] Update `components/repo-card.tsx` - CMS metrics, remove vanity stats
- [ ] Add repo search/filter to `components/repo-grid.tsx` or new component
- [ ] Add `lib/format-relative-time.ts` utility (or inline)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Dashboard layout breaks Studio's `h-screen` | High - Studio becomes unusable | Use `flex-1 min-h-0` pattern; test Studio rendering after layout change |
| Sidebar Convex query on every page load | Medium - performance | Recent projects query is small (5 items), already indexed. Cache via `useQuery`. |
| PAT user logout doesn't clear cookies properly | Medium - session lingers | Test both OAuth and PAT logout paths explicitly |
| `countByProject` N+1 queries for many projects | Medium - slow dashboard | Implement batch variant or use a single aggregate query |
| Sidebar breaks mobile layout | Medium - mobile unusable | Use sheet/drawer overlay on mobile (shadcn Sidebar supports this) |

## Open Questions

1. **Sidebar on Studio pages?** Should the dashboard sidebar appear when inside the Studio, or should Studio keep its own full-screen layout with no outer chrome? (Recommendation: Studio stays full-screen, layout detects Studio route and hides sidebar.)
2. **Settings link destination?** Global settings or per-repo? Currently settings is per-repo at `/dashboard/[owner]/[repo]/settings`. The sidebar "Settings" link could go to the first/most-recent repo's settings, or we could create a global settings page later.
3. **Mobile sidebar behavior?** Sheet/drawer overlay, or hamburger menu in header? (Recommendation: hamburger in header, opens sheet overlay.)

## Docs / Files to Update

- `CLAUDE.md` / `AGENTS.md` - Add dashboard layout pattern, document the `DashboardHeader` reuse convention
- `.github/copilot-instructions.md` - Add dashboard shell pattern

## Reviewers and Approvers

- Reviewer: @itsyogesh
- Approver: @itsyogesh

## Next Steps

1. Review and approve this plan
2. Create feature branch `feature/dashboard-redesign` from current main
3. Implement Phase 1 (shell) as first PR
4. Implement Phase 2 (cards) as second PR
5. Visual QA in browser at each phase

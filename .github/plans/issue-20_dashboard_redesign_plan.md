# Issue #20 — Dashboard Redesign Plan

Source: https://github.com/itsyogesh/repo-press/issues/20

_Imported from Issue #20 body (2026-03-28T14:01:36Z)_

---

## Summary

The dashboard (`/dashboard`) currently renders as a flat container with zero navigation chrome — no header, no sidebar, no user menu, no logout, no theme toggle. The primary user persona is a **non-technical content editor** whose #1 goal is the **fastest path to the Studio editor**. The current layout is developer-oriented with GitHub vanity metrics (stars, forks, watchers) dominating the view.

## Current State Assessment

### What exists
- **Recent Projects** section: card grid with project name, repo, branch, content type, framework badge, "Open Studio" CTA
- **Your Repositories** section: card grid with repo name, Connected/Set up badges, description, GitHub stats, "View Projects" / "Set Up Repository" CTA
- Responsive grid (sm:2, lg:3 columns)
- Empty states for both sections (basic — no CTAs on repo empty state)

### Critical gaps
1. **No global header/navigation bar** — zero persistent chrome
2. **No user menu / profile / logout** — `signOut` is exported but never rendered on dashboard
3. **No theme toggle** — only available inside Studio (`StudioPageThemeToggle`)
4. **No search or filtering** for repositories
5. **No loading skeleton** for project list (returns `null` while loading → layout shift)
6. **No logo or home link** — user is stranded with no brand presence
7. **No sidebar or navigation structure**
8. **Repo card metrics are noise** — stars/forks/watchers irrelevant for CMS content editors

### Existing reusable code
- `components/ui/avatar.tsx` — Avatar/AvatarImage/AvatarFallback (unused on dashboard)
- `components/ui/sidebar.tsx` — Full shadcn Sidebar primitive (unused on dashboard)
- `components/studio/studio-page-theme-toggle.tsx` — Theme toggle (Studio-only)
- `lib/auth-client.ts` — `signOut` already exported
- `components/ui/dropdown-menu.tsx` — DropdownMenu primitives
- `components/ui/input.tsx` — Input for search

## Design Decisions (Confirmed)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary user | Non-technical content editor | Fastest path to editor |
| #1 dashboard action | Open Studio for a recent project | < 2 seconds to editing |
| Global header | Yes — reusable `DashboardHeader` component | Standard SaaS pattern, reusable across pages |
| Left sidebar | Collapsible with recent projects + nav links | 1-click Studio access like Notion/Linear |
| Sidebar content | Recent projects list (click → Studio) + nav links | Instant access without scrolling |
| Repo grid placement | Keep on main dashboard, improve cards | Remove vanity metrics, add CMS-relevant info |
| Project card data | Show draft count, published count, relative time | Requires new Convex query |
| User menu | Avatar + dropdown: Profile, Settings, Log out | Currently impossible to log out |
| Theme toggle | In header, globally available | Currently Studio-only |

## Proposed Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ HEADER (reusable DashboardHeader)                                    │
│ ☐ RepoPress                                    🌓  👤 User ▾       │
│                                                    Profile/Settings/ │
│                                                    Logout dropdown   │
├──────────┬───────────────────────────────────────────────────────────┤
│ SIDEBAR  │  MAIN CONTENT                                             │
│ (collaps)│                                                           │
│          │  RECENT PROJECTS (cards with draft/published counts)      │
│ RECENT   │  ┌──────────┐ ┌──────────┐ ┌──────────┐                 │
│ 📄 proj →│  │ Project  │ │ Project  │ │ Project  │                 │
│ 📄 proj →│  │ 3 drafts │ │ 1 draft  │ │ 12 pub'd │                 │
│          │  └──────────┘ └──────────┘ └──────────┘                 │
│ NAV      │                                                           │
│ 📁 All   │  YOUR REPOSITORIES                                       │
│ 📦 Repos │  [Search...] [Connected | All]                           │
│ ⚙ Settings│ ┌──────────┐ ┌──────────┐ ┌──────────┐                 │
│          │  │ repo     │ │ repo     │ │ repo     │                 │
│          │  │ 1 proj   │ │ + Set up │ │ + Set up │                 │
│          │  └──────────┘ └──────────┘ └──────────┘                 │
└──────────┴───────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Dashboard Shell (Header + Sidebar + Layout)
- [ ] Create reusable `DashboardHeader` component (logo, theme toggle, user dropdown with logout)
- [ ] Create `DashboardSidebar` component (collapsible, recent projects, nav links)
- [ ] Create `UserMenu` component (avatar, dropdown: Profile, Settings, Logout)
- [ ] Create `app/dashboard/layout.tsx` wrapping all dashboard routes
- [ ] Add loading skeleton for project list section

### Phase 2: Card Improvements
- [ ] New Convex query `documents.countByProject` for draft/published counts
- [ ] Update `ProjectCard` — show draft count, published count, relative time, compact CTA
- [ ] Update `RepoCard` — replace stars/forks/watchers with project count, last edit, CMS metrics
- [ ] Add repo search/filter bar (client-side text filter + Connected/All toggle)

### Phase 3: Polish
- [ ] Welcome banner for new users (zero projects state)
- [ ] Keyboard shortcuts / command palette on dashboard
- [ ] Pagination or "Show more" for 20+ repos

## Risk Assessment

| Component | Risk | Notes |
|-----------|------|-------|
| `DashboardHeader` | 🟢 | New additive component |
| `DashboardSidebar` | 🟡 | New additive, uses existing Sidebar primitive |
| `UserMenu` / logout | 🟡 | Touches auth (signOut, cookie clearing) |
| `app/dashboard/layout.tsx` | 🟡 | Wraps all dashboard routes — must not break Studio |
| `ProjectCard` updates | 🟡 | Modifying existing component |
| `RepoCard` updates | 🟡 | Modifying existing component |
| New Convex query | 🟡 | New database query |

## Acceptance Criteria

- [ ] Dashboard has persistent header with logo, theme toggle, user avatar dropdown
- [ ] User can log out from the dashboard
- [ ] Collapsible left sidebar shows recent projects (1-click to Studio)
- [ ] Sidebar has navigation: Home, All Projects, Repos, Settings
- [ ] Project cards show draft/published counts and relative "last edited" time
- [ ] Repo cards show CMS-relevant metrics instead of GitHub vanity stats
- [ ] Repos section has a search/filter bar
- [ ] Project list shows loading skeleton instead of blank space
- [ ] Dashboard layout does NOT break Studio (which uses its own full-screen layout)
- [ ] All existing functionality preserved (no regressions)
- [ ] All existing functionality preserved (no regressions)

## Labels
`enhancement`, `ui/ux`, `dashboard`

# RepoPress Design System

> A Git-native headless CMS for developer-content teams. The interface is a precision instrument - confident, calm, and structured. Every element earns its place.

---

## 1. Visual Theme & Atmosphere

RepoPress sits at the intersection of developer infrastructure and content creation. The visual language should feel like a HUD over source control - clean authority, not dashboard clutter. Editors and engineers should both feel at home.

The foundational aesthetic is **balanced monochrome** with a single chromatic signal. Light mode surfaces are near-white with a barely-warm undertone (not clinical pure white). Dark mode is a near-black canvas where content emerges through luminance hierarchy - this is not a "toggled" dark mode but a first-class visual register. Both modes receive equal design care.

The typography system uses **Geist** - precision-engineered, slightly geometric, clean without being cold. Display sizes use aggressive negative letter-spacing (following Vercel conventions) to create compressed, authoritative headlines. Body text breathes at relaxed line-heights. Geist Mono handles all code, paths, and technical labels.

The **Signal Slate** accent - a desaturated indigo-blue - appears only on CTAs, active states, focus rings, and key interactive elements. It reads as "action" against the neutral field without disrupting the monochrome register. Every other UI element lives in the achromatic scale.

**Key Characteristics:**
- Geist Sans as the primary typeface; Geist Mono for code and technical content
- Near-white light canvas (`oklch(0.99 0.003 75)`) with warm undertone; near-black dark canvas (`oklch(0.13 0 0)`)
- Signal Slate accent (`oklch(0.52 0.13 255)` light / `oklch(0.72 0.11 255)` dark) - the only chromatic color
- Whisper-weight borders throughout: semi-transparent in dark mode, near-invisible solid in light mode
- Shadow-as-border technique (single 1px ring shadow) for surface containment without outline artifacts
- Negative letter-spacing at display scales; tracking loosens toward normal at body sizes
- Layouts are information-first: generous whitespace, clear hierarchy, no decorative chrome

---

## 2. Color Palette & Roles

### Surfaces (Light Mode)
| Token | OKLCH | Approximate Hex | Role |
|-------|-------|-----------------|------|
| `--background` | `oklch(1 0 0)` | `#ffffff` | Page canvas |
| `--card` | `oklch(1 0 0)` | `#ffffff` | Card and panel surfaces |
| `--sidebar` | `oklch(0.985 0 0)` | `#f9f9f9` | Sidebar background |
| `--muted` | `oklch(0.97 0 0)` | `#f5f5f5` | Subtle section fills, hover states |
| `--secondary` | `oklch(0.97 0 0)` | `#f5f5f5` | Secondary button backgrounds |

### Surfaces (Dark Mode)
| Token | OKLCH | Approximate Hex | Role |
|-------|-------|-----------------|------|
| `--background` | `oklch(0.145 0 0)` | `#1c1c1c` | Page canvas |
| `--card` | `oklch(0.145 0 0)` | `#1c1c1c` | Card and panel surfaces |
| `--sidebar` | `oklch(0.205 0 0)` | `#2a2a2a` | Sidebar background |
| `--muted` | `oklch(0.269 0 0)` | `#363636` | Subtle fills, hover states |
| `--secondary` | `oklch(0.269 0 0)` | `#363636` | Secondary button backgrounds |

### Text & Content
| Role | Light | Dark | Notes |
|------|-------|------|-------|
| Primary (`--foreground`) | `oklch(0.145 0 0)` ≈ `#1c1c1c` | `oklch(0.985 0 0)` ≈ `#f9f9f9` | Default reading text |
| Secondary | `oklch(0.45 0 0)` ≈ `#5a5a5a` | `oklch(0.65 0 0)` ≈ `#959595` | Descriptions, subtext |
| Tertiary / `--muted-foreground` | `oklch(0.556 0 0)` ≈ `#787878` | `oklch(0.708 0 0)` ≈ `#a8a8a8` | Labels, metadata, timestamps |
| Disabled | `oklch(0.70 0 0)` ≈ `#aaaaaa` | `oklch(0.439 0 0)` ≈ `#5a5a5a` | Inactive elements |

### Signal Slate - The One Accent
The only chromatic color in the system. Use it exclusively for: primary CTAs, active/selected state indicators, focus rings, links in body copy, and the active item in navigation.

| Variant | Light Token | Dark Token | Notes |
|---------|-------------|------------|-------|
| Default | `oklch(0.52 0.13 255)` ≈ `#4872b8` | `oklch(0.72 0.11 255)` ≈ `#94aed8` | Buttons, links, active states |
| Hover | `oklch(0.44 0.15 255)` ≈ `#3860a8` | `oklch(0.78 0.09 255)` ≈ `#a8bee0` | Hover interaction |
| Subtle background | `oklch(0.95 0.02 255)` ≈ `#eef2f9` | `oklch(0.25 0.06 255)` ≈ `#2a3250` | Subtle accent fills, selected rows |
| Text on accent | `oklch(1 0 0)` = `#ffffff` | `oklch(0.145 0 0)` = `#1c1c1c` | Text placed on accent backgrounds |

> **Rule:** If you reach for a second color beyond Signal Slate, stop. Resolve the hierarchy problem through scale, weight, or spacing instead.

### Borders
| Variant | Light | Dark | Usage |
|---------|-------|------|-------|
| `--border` (default) | `oklch(0.922 0 0)` ≈ `#eaeaea` | `oklch(0.269 0 0)` ≈ `#363636` | Inputs, cards, dividers |
| Subtle | `oklch(0.945 0 0)` ≈ `#f0f0f0` | `rgba(255,255,255,0.06)` | De-emphasized separators |
| Emphasis | `oklch(0.85 0 0)` ≈ `#d4d4d4` | `rgba(255,255,255,0.12)` | Focus rings, prominent outlines |
| `--ring` (focus) | Signal Slate at 40% opacity | Signal Slate at 40% opacity | Focus indicators only |

### Semantic
| Role | Color | Notes |
|------|-------|-------|
| Success | `oklch(0.64 0.19 145)` ≈ `#2da84a` | Published status, successful save |
| Warning | `oklch(0.75 0.18 75)` ≈ `#d4860a` | In review, scheduled, attention needed |
| Destructive (`--destructive`) | `oklch(0.54 0.16 27.325)` | Delete actions, errors |
| Draft indicator | `oklch(0.556 0 0)` = muted gray | Draft documents, unpublished state |

---

## 3. Typography Rules

### Font Stack
```css
--font-sans: "Geist", "Geist Fallback", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono: "Geist Mono", "Geist Mono Fallback", "SF Mono", ui-monospace, monospace;
```

### Hierarchy

| Role | Size | Weight | Line Height | Letter Spacing | Use |
|------|------|--------|-------------|----------------|-----|
| Display | 48px / 3rem | 600 | 1.00 | −1.0px | Hero section headlines |
| Heading 1 | 36px / 2.25rem | 600 | 1.10 | −0.72px | Page titles, dialog headers |
| Heading 2 | 28px / 1.75rem | 600 | 1.15 | −0.48px | Section anchors |
| Heading 3 | 22px / 1.375rem | 600 | 1.25 | −0.22px | Card titles, feature headings |
| Heading 4 | 18px / 1.125rem | 500 | 1.30 | −0.18px | Subsection labels, panel headers |
| Body Large | 17px / 1.0625rem | 400 | 1.60 | −0.14px | Introduction paragraphs |
| Body | 15px / 0.9375rem | 400 | 1.60 | −0.10px | Standard reading text |
| Body Small | 13px / 0.8125rem | 400 | 1.55 | −0.08px | Compact descriptions, secondary copy |
| Label | 13px / 0.8125rem | 500 | 1.40 | −0.06px | Form labels, navigation items |
| Caption | 12px / 0.75rem | 400 | 1.40 | 0 | Timestamps, metadata, footnotes |
| Overline | 11px / 0.6875rem | 500 | 1.40 | +0.04px (uppercase) | Section overlines (uppercase only) |
| Code | 13px / 0.8125rem | 400 | 1.60 | 0 | Inline code, file paths, `<code>` |
| Code Block | 13px / 0.8125rem | 400 | 1.70 | 0 | Multi-line code editors, diffs |

### Principles
- **Three weights carry the system:** 400 (reading), 500 (UI emphasis / navigation), 600 (headings / strong emphasis). Weight 700 is reserved for the rare case of inline bold emphasis within body copy only.
- **Compression at scale:** Display and H1 sizes use progressively tighter letter-spacing. Below 18px, spacing relaxes toward 0 or slightly negative. Never add positive letter-spacing below 11px overline usage.
- **Mono for everything technical:** File paths, commit SHAs, branch names, frontmatter keys, API identifiers, and inline code always render in Geist Mono. This creates a clear developer/content register split.
- **No tracking on ALL-CAPS labels:** Overline labels use +0.04px tracking only when all-caps. Mixed-case labels at 12-13px use 0 or slightly negative tracking.

---

## 4. Component Stylings

### Buttons

**Primary (Signal Slate)**
```
Background:    Signal Slate default
Text:          #ffffff (light mode) | #1c1c1c (dark mode)
Padding:       8px 16px
Radius:        6px
Border:        none
Hover:         Signal Slate hover
Font:          13px, weight 500
```

**Secondary / Ghost**
```
Background:    transparent
Text:          foreground primary
Padding:       8px 16px
Radius:        6px
Border:        1px solid --border
Hover bg:      --muted
Font:          13px, weight 500
```

**Destructive**
```
Background:    transparent (resting) → --destructive (hover)
Text:          --destructive (resting) → white (hover)
Padding:       8px 16px
Radius:        6px
Border:        1px solid --destructive at 30% opacity
```

**Icon Button**
```
Background:    transparent (resting) → --muted (hover)
Padding:       6px
Radius:        6px
Border:        none
Size:          32×32px (standard), 28×28px (compact)
```

**Pill / Tag**
```
Background:    --muted
Text:          --muted-foreground
Padding:       2px 8px
Radius:        9999px
Font:          12px, weight 500
Border:        1px solid --border
```

**Toolbar Button (compact)**
```
Background:    transparent (resting) → --muted (hover)
Text:          --muted-foreground (resting) → --foreground (hover)
Padding:       4px 8px
Radius:        4px
Font:          12px, weight 500
```

### Cards & Containers

**Standard Card**
```
Background:    --card
Border:        1px solid --border
Radius:        8px
Shadow:        rgba(0,0,0,0.04) 0px 1px 3px 0px (light) | none (dark)
Padding:       16px (compact) | 24px (default) | 32px (spacious)
```

**Elevated Panel (modal, dropdown, popover)**
```
Background:    --popover
Border:        1px solid --border
Radius:        10px
Shadow:
  Light: rgba(0,0,0,0.08) 0px 4px 16px, rgba(0,0,0,0.04) 0px 0px 0px 1px
  Dark:  rgba(0,0,0,0.40) 0px 8px 32px, rgba(255,255,255,0.06) 0px 0px 0px 1px
```

**Subtle Container (inline, sidebar section)**
```
Background:    --muted
Border:        1px solid transparent
Radius:        6px
Shadow:        none
```

**Featured / Highlight Card**
```
Background:    Signal Slate subtle bg
Border:        1px solid Signal Slate at 25% opacity
Radius:        8px
```

### Inputs & Forms

**Text Input / Textarea**
```
Background:    --background (light) | --muted (dark)
Text:          --foreground
Border:        1px solid --border
Padding:       8px 12px
Radius:        6px
Font:          14px, weight 400
Placeholder:   --muted-foreground
Focus:         border-color Signal Slate; box-shadow: 0 0 0 3px Signal Slate at 20%
```

**Select**
```
Same as Text Input with trailing chevron icon
```

**Checkbox / Toggle**
```
Border:        1px solid --border
Radius:        3px (checkbox) | 9999px (toggle)
Checked bg:    Signal Slate
Check icon:    white
```

**Search Input**
```
Background:    --muted
Padding:       8px 12px 8px 36px (icon leading)
Radius:        6px
Font:          14px, weight 400
Border:        1px solid transparent
Focus border:  --border
```

### Navigation (Sidebar / Top Bar)

**Sidebar Item (resting)**
```
Text:          --muted-foreground
Font:          14px, weight 400
Padding:       6px 8px
Radius:        6px
Icon:          --muted-foreground at 60%
```

**Sidebar Item (active)**
```
Background:    --muted (light) | --secondary (dark)
Text:          --foreground
Font:          14px, weight 500
Icon:          --foreground
```

**Top Bar**
```
Background:    --background
Border-bottom: 1px solid --border
Height:        48px
Padding:       0 16px
```

### Status Badges (Document Workflow)

| Status | Background | Text | Border |
|--------|------------|------|--------|
| Draft | `--muted` | `--muted-foreground` | `--border` |
| In Review | `oklch(0.95 0.04 75)` / `oklch(0.28 0.05 75)` | warning tone | warning border |
| Approved | `oklch(0.96 0.03 145)` / `oklch(0.26 0.06 145)` | success tone | success border |
| Published | `oklch(0.64 0.19 145)` (green) | white | none |
| Archived | `--muted` | `--muted-foreground` at 60% | `--border` at 50% |
| Scheduled | `oklch(0.93 0.05 250)` / `oklch(0.25 0.07 250)` | signal accent tone | accent border |

All status badges: 11px font, weight 500, padding 2px 8px, radius 9999px.

### MDX Editor Specifics

**Editor Surface**
```
Background:    --background
Font:          Geist Mono 14px, line-height 1.70
Line numbers:  --muted-foreground at 40%
Active line:   --muted at 50% opacity
Selection:     Signal Slate at 20% opacity
Cursor:        Signal Slate
```

**Frontmatter Panel**
```
Background:    --muted
Border-bottom: 1px solid --border
Padding:       12px 16px
Label font:    Geist Mono 12px, --muted-foreground
Value font:    Geist 14px, --foreground
```

**Preview Surface**
```
Background:    --background
Prose text:    --foreground
Prose links:   Signal Slate
Code blocks:   --muted bg, Geist Mono
```

---

## 5. Layout Principles

### Spacing Scale
Base unit: **4px**

| Token | Value | Use |
|-------|-------|-----|
| `space-1` | 4px | Tight inline gaps |
| `space-2` | 8px | Button padding (vertical), icon gaps |
| `space-3` | 12px | Input padding, compact list gaps |
| `space-4` | 16px | Card padding (compact), standard gaps |
| `space-5` | 20px | Section spacing (tight) |
| `space-6` | 24px | Card padding (default), section gap |
| `space-8` | 32px | Card padding (spacious), panel gaps |
| `space-10` | 40px | Section vertical padding |
| `space-12` | 48px | Top bar height, major section dividers |
| `space-16` | 64px | Hero section padding |
| `space-24` | 96px | Major section vertical rhythm |

### Border Radius Scale
```
--radius-sm:  4px    Toolbar buttons, badges, small chips
--radius:     6px    Standard inputs, buttons, small cards
--radius-md:  8px    Cards, panels, containers
--radius-lg:  10px   Elevated panels, modals
--radius-xl:  16px   Large featured panels (use sparingly)
--radius-full: 9999px Pill badges, toggle, avatar
```

### Grid & Containers
- **Max content width:** 1280px (dashboard content area)
- **Max reading width:** 720px (document body, preview)
- **Sidebar:** 240px fixed (collapsible to 48px icon-only)
- **Right panel (preview / metadata):** 320-400px (resizable)
- **Responsive breakpoints:** sm: 640px | md: 768px | lg: 1024px | xl: 1280px

### Whitespace Principles
- Use asymmetric spacing intentionally: top-heavy padding in cards (more padding-top than padding-bottom) creates visual weight.
- Section breaks should be breath - use `space-12` to `space-16` vertical gaps between distinct sections.
- Never use padding to fix alignment problems. Fix the layout structure instead.
- Dense editor UIs (file tree, document list) use `space-1` to `space-2` vertical gaps with `space-3` to `space-4` horizontal padding.

---

## 6. Depth & Elevation

### Shadow System
Shadows define hierarchy, not decoration. All shadows are monochromatic.

**Light Mode**
```
Level 0 (flat):     no shadow - use border only
Level 1 (raised):   rgba(0,0,0,0.04) 0px 1px 3px  [cards in content area]
Level 2 (floating): rgba(0,0,0,0.08) 0px 4px 16px, rgba(0,0,0,0.04) 0px 0px 0px 1px  [dropdowns, popovers]
Level 3 (modal):    rgba(0,0,0,0.12) 0px 8px 32px, rgba(0,0,0,0.06) 0px 0px 0px 1px  [modals, dialogs]
```

**Dark Mode**
```
Level 0 (flat):     border only: rgba(255,255,255,0.06) 0px 0px 0px 1px
Level 1 (raised):   rgba(0,0,0,0.24) 0px 2px 8px, rgba(255,255,255,0.05) 0px 0px 0px 1px
Level 2 (floating): rgba(0,0,0,0.40) 0px 8px 24px, rgba(255,255,255,0.07) 0px 0px 0px 1px
Level 3 (modal):    rgba(0,0,0,0.56) 0px 16px 48px, rgba(255,255,255,0.08) 0px 0px 0px 1px
```

### Shadow-as-Border Technique
For cards and containers where a sharp border feels too harsh, use a 1px ring shadow instead:
```css
/* Light mode */
box-shadow: rgba(0,0,0,0.08) 0px 0px 0px 1px;

/* Dark mode */
box-shadow: rgba(255,255,255,0.06) 0px 0px 0px 1px;
```
This avoids the visual doubling that `border` + `box-shadow` can create and prevents layout shifts on focus.

### Glass / Backdrop Blur
Use backdrop blur **selectively** - only for top bar or sidebar on mobile overlay:
```css
backdrop-filter: blur(12px) saturate(1.4);
background: rgba(255,255,255,0.85); /* light */
background: rgba(20,20,20,0.85);    /* dark */
```
Never apply blur to card grids or the main content area.

---

## 7. Do's and Don'ts

### ✅ Do
- Use Geist Mono for **all** file paths, branch names, commit SHAs, frontmatter keys, and inline code
- Use Signal Slate **only** for the primary interactive action per context - one accent per view
- Use `--muted` backgrounds for secondary containers; avoid inventing new surface colors
- Keep borders at `1px solid --border` - never go to `2px` borders on UI chrome
- Write layouts that communicate hierarchy through **whitespace and scale**, not color
- Show document status with the defined badge system - draft = gray, published = green, etc.
- Prefer table layouts for structured metadata, card layouts for browsable content
- Use consistent 8px radius for inputs/buttons and 10px for floating panels
- Give dark mode equal care - test every new component in both modes

### ❌ Don't
- Add a second chromatic accent color (no "also use teal for X")
- Use `bg-white` or `text-black` directly - always use semantic tokens
- Use shadows for decoration - only for elevation hierarchy
- Create generic "card grid" layouts with equal-weight items - establish a clear visual hierarchy
- Apply backdrop blur to cards or non-overlay elements
- Use `font-weight: 700` in UI chrome - reserve it for inline prose bold only
- Make interactive states only color-dependent - always include a shape/position change
- Use rounded-full (9999px) on anything except pills, avatars, and toggles
- Add "AI slop" chrome: generic feature icon grids, default shadcn gray cards, safe corporate section layouts
- Use positive letter-spacing on body or UI text (exception: uppercase overlines at 11px)

---

## 8. Responsive Behavior

### Breakpoint Strategy
- **Mobile (< 640px):** Single-column layout; sidebar collapses to bottom sheet or drawer; top bar compresses to icon-only brand + menu
- **Tablet (640-1023px):** Two-column layout; sidebar collapses to icon-only rail (48px); editor takes full width; preview hidden by default (toggle to show)
- **Desktop (≥ 1024px):** Three-pane layout (sidebar | editor | preview); all panels visible; sidebar 240px
- **Wide (≥ 1280px):** Increase content container max-width; maintain sidebar size

### Component Adaptations
- **File Tree:** Full labels at desktop; icon-only with tooltip at rail width
- **MDX Editor:** Full toolbar at desktop; grouped toolbar at tablet; overflow menu at mobile
- **Document Status Bar:** Full badges at desktop; icon-only at tablet
- **Frontmatter Panel:** Inline at desktop; bottom drawer at mobile
- **Data Tables:** Horizontal scroll at tablet/mobile; never truncate key columns

### Touch Targets
All interactive elements must be a minimum **44×44px** on mobile. Use `min-h-11` (`44px`) for mobile button variants.

---

## 9. Agent Prompt Guide

Use this section when generating or modifying UI with AI tools.

### Quick Reference
```
Font:          Geist (sans) / Geist Mono (code, paths)
Accent:        Signal Slate oklch(0.52 0.13 255) light / oklch(0.72 0.11 255) dark
Weights:       400 (body) | 500 (UI/labels) | 600 (headings)
Radius:        6px (inputs/buttons) | 8px (cards) | 10px (modals)
Border:        1px solid var(--border)
Cards:         bg-card, border, rounded-lg (8px), shadow-sm in light / ring-1 ring-white/6 in dark
Spacing unit:  4px base
Status:        draft=gray | in_review=amber | approved=emerald | published=green | archived=muted
```

### Example Agent Prompts

**Building a new page or section:**
> "Build a [page/section] using RepoPress design system: Geist font, near-white/near-black backgrounds (bg-background), Signal Slate accent (oklch(0.52 0.13 255) in CSS), 8px card radius, 1px border tokens. No generic card grids - establish clear visual hierarchy through scale and whitespace. Match Vercel/Linear precision."

**Building a new component:**
> "Create a [component] following RepoPress tokens: use `bg-card border border-border rounded-lg` for containers, `text-foreground` and `text-muted-foreground` for text hierarchy, Signal Slate only for the primary CTA. Use Geist Mono for any file paths or code content. Three font weights max: 400/500/600."

**Fixing a dark mode issue:**
> "Fix dark mode for this component: ensure all backgrounds use semantic tokens (bg-background, bg-card, bg-muted), borders use border-border, text uses text-foreground/text-muted-foreground. Dark mode shadows should use rgba(0,0,0,0.4) + rgba(255,255,255,0.07) ring instead of box-shadow."

**Building the editor interface:**
> "Build the MDX editor using RepoPress conventions: three-pane layout (240px sidebar | flex editor | 360px preview), Geist Mono for editor content at 14px/1.7 line-height, Signal Slate cursor and selection, frontmatter panel with bg-muted bottom-border, document status badges in pill format."

### Iteration Checklist
Before finalizing any new UI:
- [ ] All backgrounds use semantic color tokens (no raw hex)
- [ ] Both light and dark modes verified (no white text on white bg, no black text on black bg)
- [ ] Signal Slate used only on the single primary CTA/active element per view
- [ ] Geist Mono applied to all file paths, branch names, commit SHAs, frontmatter keys
- [ ] Font weights limited to 400/500/600 in UI chrome
- [ ] Border radius: 6px buttons/inputs, 8px cards, 10px modals
- [ ] Interactive states include both color AND shape/position change (not color-only)
- [ ] Status badges match defined workflow colors (draft/in_review/approved/published/archived)
- [ ] No "AI slop" patterns: no equal-weight icon grids, no default shadcn gray cards, no template sections

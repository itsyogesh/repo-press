# Design Doc: Studio Intelligence & Precision

**Date**: 2026-03-15  
**Topic**: High-fidelity UI/UX enhancements to RepoPress Studio.

## 1. Intelligence: Properties Panel
- **Behavior**: Auto-expand `FrontmatterPanel` if critical fields (title, date) are empty.
- **Guard**: Respect user intent—if user manually collapses, disable auto-expand for the session.
- **Technical**: Add `userInteracted` Ref and a `useEffect` monitoring `frontmatter`.

## 2. Discovery: Component Motion
- **Behavior**: Staggered, cascading reveal for the "Insert Component" grid.
- **Technical**: `framer-motion` Variants:
  - Container: `staggerChildren: 0.03`, `delayChildren: 0.05`
  - Item: `initial: { opacity: 0, y: 5 }, animate: { opacity: 1, y: 0 }`

## 3. Precision: Explorer & Search
- **Active Item**: 
  - Add 2px vertical line (`bg-studio-accent`) on the far left.
  - Increase border intensity to `border-studio-accent/60`.
- **Search Polish**:
  - Add `/` or `⌘K` KBD shortcut badge to placeholder.
  - Add "Clear" icon button (visible only when query exists).

## 4. Aesthetic: Industrial Depth
- **Sheet Background**: Large, technical watermark icon (Pen/FileCode) at `opacity-[0.03]`.
- **Skeletons**: Integrate `bg-grid-small` utility into the global `Skeleton` component for architectural texture.

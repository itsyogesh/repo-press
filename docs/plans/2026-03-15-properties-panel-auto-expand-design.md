# Properties Panel Intelligence (Auto-Expand) Design

## Goal

Automatically expand the Properties (frontmatter) panel in RepoPress Studio when essential metadata (title or date) is missing, while respecting manual user collapses.

## Requirements

- Auto-expand if `title` or `date` fields in frontmatter are empty/null.
- Reset the "intelligence" logic when a new file is loaded (tracked via `filePath`).
- If the user manually interacts with the panel (opens or closes), disable auto-expansion for that specific file/session until the file changes.

## Architecture

We will use a state-based guard (`userInteracted`) to track manual overrides.

### State

- `userInteracted` (boolean): Default `false`. Set to `true` whenever the user clicks the toggle.
- `isOpen` (boolean): Existing state for the `Collapsible` component.

### Logic

1. **Reset on File Change**:

   ```typescript
   useEffect(() => {
     setUserInteracted(false);
   }, [filePath]);
   ```

2. **Auto-Expand Effect**:

   ```typescript
   useEffect(() => {
     if (userInteracted) return;

     const hasMissingRequiredFields = !frontmatter.title || !frontmatter.date;
     if (hasMissingRequiredFields && !isOpen) {
       setIsOpen(true);
     }
   }, [frontmatter.title, frontmatter.date, userInteracted, isOpen]);
   ```

3. **User Interaction Hook**:
   Intercept the `onOpenChange` handler of the `Collapsible` component to set `userInteracted` to `true`.

## Components

- `components/studio/frontmatter-panel.tsx`: Main file for implementation.

## Success Criteria

- Opening an empty file automatically opens the panel.
- Closing the panel manually on an empty file keeps it closed even if frontmatter updates (until file change).
- Opening a full file keeps the panel in its current state (usually open by default, but won't be forced open if closed).

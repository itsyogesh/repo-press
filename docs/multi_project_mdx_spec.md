# RepoPress Multi-Project MDX Specification

> **Status:** First safe component-ecosystem slice implemented; managed native execution is follow-on work.
> **Last updated:** 2026-07-17

RepoPress is a Git-native CMS for repositories that may contain several content projects. A project identifies a content root, branch, framework hint, and content type. RepoPress discovers the repository's existing MDX layout instead of generating a parallel runtime.

## Configuration contract

`repopress.config.json` coordinates projects. It is authoritative for project identity and content location, not for executable React components.

```json
{
  "version": 1,
  "defaults": {
    "branch": "main",
    "framework": "auto"
  },
  "projects": [
    {
      "id": "docs",
      "name": "Documentation",
      "contentRoot": "content/docs",
      "framework": "fumadocs",
      "contentType": "docs"
    },
    {
      "id": "legacy-blog",
      "name": "Legacy blog",
      "contentRoot": "content/blog",
      "framework": "next-mdx",
      "contentType": "blog",
      "preview": {
        "entry": ".repopress/custom-preview.tsx"
      }
    }
  ]
}
```

The lightweight default contains no preview entry and no generated component catalog. The web setup flow creates only this config file.

### Project fields

- `id`: stable identity within the repository config.
- `name`: display name.
- `contentRoot`: repository-relative content root; an empty string means repository root.
- `framework`: explicit framework hint or `auto`.
- `contentType`: `blog`, `docs`, `pages`, `changelog`, or `custom`.
- `branch`: optional content branch override.
- `preview`: optional compatibility override retained for existing repositories.
- `components`: optional bounded declarative authoring hints retained for compatibility. They contain metadata, never functions or runtime bindings.

Project settings override defaults. Sync copies project coordination data into Convex so the Studio can query it reactively. Drafts, history, taxonomy, and workflow state remain in Convex; published content remains in Git.

## Native discovery is the default

RepoPress inspects the selected immutable repository revision and content root. Depending on the framework, discovery uses existing repository files such as:

- `package.json` and framework configuration;
- `components.json` aliases and Tailwind CSS target;
- TypeScript/JavaScript path aliases;
- the repository's MDX component/runtime map;
- RepoPress's integrity-pinned registry lock.

Registry installation resolves these inputs to a deterministic plan and publishes changes on a dedicated branch through a GitHub pull request. RepoPress does not create `.repopress/mdx-preview.tsx` during setup and does not treat a generated adapter as repository truth.

The current config schema does not duplicate shadcn registry namespaces, install aliases, or CSS targets. Those values are discovered from the repository's canonical files. A future explicit override shape requires a separate versioned design so it cannot become a competing authority.

“Native discovery” describes how RepoPress finds the repository's real component and styling boundaries. It does **not** mean the current first slice runs the repository's framework inside the Studio.

## Preview fidelity

Every preview result has an explicit fidelity grade.

| Grade | Current behavior | Trust boundary |
|---|---|---|
| `generic` | Renders a bounded, serializable Typeset model for Markdown and safe MDX placeholders. | Runs in the RepoPress UI; repository code is never executed. |
| `compatible` | Renders a browser-compatible, RepoPress-produced artifact when an exact signed artifact/session/snapshot is available. | Runs on a separately configured origin in an opaque-origin iframe with exactly `sandbox="allow-scripts"`. |
| `native` | Reserved for a future managed runner that materializes the repository and runs its actual framework. | Not implemented in this slice and never inferred from an adapter path. |

The Studio shows downgrade reasons. Generic preview remains available whenever a trusted compatible artifact is missing, stale, invalid, or unsupported.

## Explicit preview overrides

Existing `defaults.preview` and `projects[].preview` values remain schema-readable so repositories do not break during migration. They are optional, untrusted compatibility inputs:

- an entry path is not native authority;
- it is never imported, transpiled, evaluated, or rendered in the Studio realm;
- compatible use requires the isolated sandbox path and signed authority for the exact repository snapshot;
- plugins and component metadata do not grant package, network, filesystem, or host credentials.

Declarative `components` metadata may help construct an authoring catalog. Installed registry metadata with verified integrity takes precedence. Neither source supplies executable `RenderBindings` to the Studio.

## Component ecosystem

Authoring and rendering have separate contracts:

- `AuthoringCatalog` is bounded, JSON-serializable, detached, and deeply frozen metadata used by insertion and prop forms.
- `RenderBindings` contains executable component bindings and is sandbox-only.
- Registry items carry normalized authoring metadata, provenance, immutable integrity, dependencies, install targets, fixtures, and framework support.
- Source edits are surgical and fail closed when the selected MDX node is stale or ambiguous.

The first official proof is a Callout component: normalized registry metadata feeds the Studio palette and form, insertion produces import-free MDX, prop edits preserve unrelated source, and preview selects compatible rendering only with trusted artifacts.

## Security invariants

1. Repository adapters and MDX never execute in the Studio/host realm.
2. Generic preview is bounded before and after parsing and contains no functions.
3. Compatible frames omit `allow-same-origin`, forms, popups, and navigation.
4. Opaque-frame authentication uses exact window identity, a transferred single-use capability, session ID, snapshot version, and monotonic sequence; it does not trust `event.origin`.
5. Registry resolution is allowlisted, integrity-pinned, deterministic, and collision-aware.
6. Installation writes one exact commit to a dedicated branch and opens a PR; it never writes the base branch directly.
7. OAuth and PAT requests use the existing server-side authorization and repository-role checks.

## Setup and migration

New setup:

1. Detect the repository framework and candidate content roots.
2. Let the user confirm branch, root, framework, and content type.
3. Commit only `repopress.config.json`.
4. Sync project coordination data to Convex.
5. Use generic preview while higher-fidelity providers are unavailable.

Existing repositories may keep explicit preview entries while migrating. Removing an old `.repopress/mdx-preview.tsx` is a repository-owner decision; RepoPress does not delete it automatically. Its presence alone does not change fidelity or trust.

## Current limitations

- There is no managed native framework runner yet.
- Compatible preview supports a deliberately bounded browser-safe graph, not arbitrary application code, Server Components, framework loaders, or unrestricted provider context.
- Registry installation currently proves the official Callout path and a narrow Next.js/Fumadocs runtime-map integration.
- Project-facing registry/alias/CSS discovery overrides do not yet have a ratified config shape.
- Component auto-discovery beyond verified registry metadata and explicit declarative hints remains incremental.

These limits are product state, not error fallbacks to hide. The fidelity badge and diagnostics must remain honest as coverage expands.

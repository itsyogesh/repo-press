# RepoPress Extensions and Compatibility Overrides

> **Status:** Registry components and signed product preview extensions are supported. Arbitrary repo-local plugins remain legacy inputs.
> **Last updated:** 2026-08-03

RepoPress extends MDX through integrity-pinned registry items and repository-native runtime maps. This keeps installed code in the repository, exposes reviewable changes through a GitHub pull request, and separates Studio authoring metadata from sandbox-only executable bindings.

## Recommended: registry components

A registry item describes:

- normalized declarative authoring metadata;
- source files and portable install targets;
- package and registry dependencies;
- framework/runtime compatibility;
- optional CSS and preview fixtures;
- provenance, version, and SHA-256 integrity.

The installer resolves the exact item and dependencies, discovers repository aliases/runtime map/CSS target, detects conflicts or local modifications, and creates one deterministic commit on a dedicated branch. The base branch is never written directly.

Installed metadata can populate the Studio palette and prop form. It never injects React functions into Studio state. The installed repository runtime map supplies the component binding when the repository itself builds the content.

The first official item is `@repopress/callout`.

## Product preview extensions

A product may opt into structural Compatible preview with a project-local entry:

```json
{
  "preview": { "entry": ".repopress/mdx-preview.tsx" },
  "components": {
    "InfoBox": {
      "schemaStatus": "complete",
      "props": [{ "name": "type", "type": "string", "options": ["info", "tip", "warning"] }],
      "slots": [{ "name": "children", "accepts": "mdx", "required": true }]
    }
  }
}
```

The `components` object is declarative authoring metadata. The entry is product-owned rendering code, but the current
pilot deliberately accepts only one bounded file importing `react`, the React JSX runtimes, and
`@repopress/preview`. It composes frozen semantic primitives such as `PreviewBox`, `PreviewText`, `PreviewList`, and
`PreviewAction`; production code remains free to use Next.js, Astro, Remix, or another framework.

RepoPress reads the entry from the authenticated project&rsquo;s exact current commit, validates imports without
executing it, binds it to the current document snapshot, and signs the artifact for the isolated sandbox. The private
JWK stays server-only in `PREVIEW_APPROVAL_PRIVATE_KEY_JWK`; the matching public JWK is exposed as
`NEXT_PUBLIC_PREVIEW_APPROVAL_PUBLIC_KEY_JWK`. Production also requires a separate HTTPS
`NEXT_PUBLIC_PREVIEW_ORIGIN`.

Compatible fidelity is structural, not pixel-identical. RepoPress always owns the semantic document root; an adapter
may select only the bounded portable layout and tone variants exposed by `PreviewDocument`. Actions remain visibly
inert. Approved repository and HTTPS image sources are resolved by the authenticated Studio host, checked against the
exact Git commit, MIME and decoded-work limits, and a durable per-user/project budget, then transferred as bytes to
short-lived `blob:` URLs. The opaque-origin sandbox keeps `connect-src 'none'` and cannot fetch those assets itself.
Arbitrary CSS, navigation, timers, portals, framework loaders, and relative source imports remain outside the first
profile. Any failure preserves the Generic Typeset preview.

## Legacy plugin entries

Older configs may contain plugin registrations and preview entries:

```json
{
  "version": 1,
  "projects": [
    {
      "id": "docs",
      "name": "Docs",
      "contentRoot": "content/docs",
      "framework": "fumadocs",
      "contentType": "docs",
      "preview": {
        "entry": ".repopress/custom-preview.tsx",
        "plugins": ["legacy-callouts"]
      }
    }
  ],
  "plugins": {
    "legacy-callouts": ".repopress/plugins/legacy-callouts/plugin.json"
  }
}
```

RepoPress keeps plugin values readable for migration, but they do not expand the signed product-extension boundary:

- they do not become native preview authority;
- they are never imported or evaluated in the Studio/host realm;
- they cannot provide functions, scope, import bindings, credentials, filesystem access, or host navigation to Studio;
- compatible rendering requires an exact signed artifact and the isolated opaque-origin sandbox;
- absent or invalid compatible authority downgrades to generic Typeset preview.

New setup does not generate a preview adapter or plugin scaffold. Product teams add an entry only when they want to
own the mapping from their MDX vocabulary to RepoPress&rsquo;s portable primitives.

## Authoring metadata overrides

`projects[].components` may retain bounded declarative metadata for older repositories. This is an authoring hint, not an implementation:

```json
{
  "components": {
    "Callout": {
      "displayName": "Callout",
      "props": [
        {
          "name": "variant",
          "type": "string",
          "options": ["info", "warning"]
        }
      ],
      "hasChildren": true
    }
  }
}
```

Metadata must remain JSON-serializable and contain no executable source. Verified installed registry metadata takes precedence for the same MDX component name.

## Preview grades

- `generic`: safe bounded Typeset model; no repository execution.
- `compatible`: signed bounded artifact in the separately hosted opaque-origin iframe.
- `native`: future managed framework runner; not available in the current slice.

See `docs/multi_project_mdx_spec.md` for the configuration contract and `docs/mdx_runtime_master_plan.md` for the current architecture and roadmap.

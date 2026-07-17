# RepoPress Extensions and Compatibility Overrides

> **Status:** Registry-based declarative components are current. Repo-local executable preview plugins are legacy compatibility inputs only.
> **Last updated:** 2026-07-17

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

## Legacy repo-local preview entries

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

RepoPress keeps these values readable for migration, but they are untrusted compatibility inputs:

- they do not become native preview authority;
- they are never imported or evaluated in the Studio/host realm;
- they cannot provide functions, scope, import bindings, credentials, filesystem access, or host navigation to Studio;
- compatible rendering requires an exact signed artifact and the isolated opaque-origin sandbox;
- absent or invalid compatible authority downgrades to generic Typeset preview.

New setup does not generate a preview adapter or plugin scaffold.

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

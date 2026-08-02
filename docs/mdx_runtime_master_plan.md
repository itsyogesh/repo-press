# RepoPress MDX Runtime Architecture and Roadmap

> **Status:** Generic and compatible first slice implemented; managed native runner planned.
> **Last updated:** 2026-07-17

This document replaces the earlier same-origin, config-executed adapter plan. The ratified design is in `docs/plans/2026-07-12-native-mdx-preview-ecosystem-design.md`; the task-level implementation record is in `docs/plans/2026-07-12-native-mdx-preview-ecosystem.md`.

## Product direction

RepoPress should author reusable MDX components while keeping content portable and Git-native. A repository should use its existing framework, component map, aliases, styles, and package layout. RepoPress coordinates editing and installation without becoming a second application runtime.

The architectural rule is simple: metadata may enter the Studio; repository execution may not.

## Runtime planes

### Studio plane

The Next.js application handles project navigation, editing, workflow, and a safe generic preview. It accepts only bounded serializable contracts:

- MDX source and document metadata;
- `AuthoringCatalog` entries;
- generic render models;
- preview status, diagnostics, size, and fidelity events.

It never receives React component functions, evaluated adapter exports, arbitrary scope values, or repository modules.

### Compatible sandbox plane

A separately configured sandbox origin hosts an iframe with exactly `sandbox="allow-scripts"`. The parent establishes an authenticated `MessageChannel` using exact window identity and a single-use capability. The protocol binds messages to a session, repository snapshot, sequence, and bounded payload.

Only immutable, signed, RepoPress-produced compatible artifacts may render there. This path supports a bounded browser-safe component graph; it is not a general arbitrary-code security boundary and does not claim framework-native behavior.

### Future native plane

A managed native provider will materialize an authorized immutable repository revision in an isolated environment, install dependencies under policy, run the actual framework, and return a short-lived preview target. It must preserve the existing preview session and downgrade contracts.

This provider is not part of the current slice. `native` is a contract value, not a claim that setup or an adapter path enables native execution today.

## Preview selection

1. Select `native` only when an authorized managed native target exists for the exact snapshot.
2. Otherwise select `compatible` only when the exact signed artifact and sandbox authority are valid.
3. Otherwise select `generic` and include a structured downgrade reason.

Provider changes must not replace editor state. Generic output stays available during higher-fidelity cold starts and failures.

## Repository configuration

`repopress.config.json` owns project coordination:

- project IDs, names, branches, and content roots;
- framework/content-type hints;
- optional explicit compatibility overrides for older repositories;
- optional declarative authoring metadata.

It does not own executable runtime bindings. New initialization writes only the lightweight config and does not generate `.repopress/mdx-preview.tsx` or a component catalog.

Existing explicit adapter paths remain readable. They are untrusted inputs and can affect compatible rendering only after isolated artifact production and signed snapshot binding. They never authorize host or native execution.

Registry namespaces, install aliases, runtime maps, and CSS targets currently come from repository-native evidence rather than duplicated RepoPress config fields. Project-facing overrides need a separately ratified, versioned contract before they are added.

## Discovery and installation

Native discovery starts from an immutable repository revision and detects the framework layout from owned files. The current Next.js/Fumadocs slice resolves:

- component aliases from `components.json` and path configuration;
- the MDX runtime-map path;
- the Tailwind CSS target;
- package and lock paths;
- existing files and RepoPress registry lock state.

Registry resolution normalizes and integrity-checks items before planning. The planner is pure and deterministic, fails on dependency cycles/collisions/local modifications, and produces surgical file/package/CSS/runtime-map edits. Publishing authenticates the caller, derives repository authority server-side, creates one exact commit on a dedicated branch, and opens a pull request.

## Authoring contract

The Studio consumes normalized declarative metadata, not runtime code. Metadata can describe:

- component and export names;
- string, boolean, number, enum, expression-as-data, and slot fields;
- framework/runtime compatibility;
- assets, fixtures, provenance, and integrity.

Registry metadata wins over optional project metadata for the same MDX name. Unknown native components may appear as incomplete placeholders rather than guessed schemas. Insertion and editing remain import-free where the installed runtime map already supplies the binding.

## Generic Typeset fallback

Generic rendering parses an owned, bounded subset into a serializable render model and renders it with pinned shadcn Typeset styles. It preserves useful Markdown structure and represents unsupported MDX as inert placeholders. It never evaluates expressions, imports, adapters, plugins, JSX implementations, or event handlers.

## Security and failure handling

- Fail closed when sandbox origin configuration, signatures, sequence, snapshot, or artifact identity is invalid.
- Reject repository execution in host source through the host-execution regression guard.
- Keep compatible networking and navigation unavailable by default.
- Bound source, AST/model, messages, files, manifests, dependency graphs, and outputs both before and after transformation.
- Keep installation dry-run and write plans byte-identical; refuse stale base revisions and local modifications.
- Preserve OAuth/PAT authentication boundaries and derive repository/project authority on the server.
- Surface diagnostics without exposing credentials, repository source, or executable bindings to the Studio.

## Delivered first slice

- explicit `generic` / `compatible` / `native` contracts and ordered preview sessions;
- safe Typeset generic renderer;
- opaque-origin compatible frame and bounded worker containment;
- serializable authoring catalog and surgical MDX edits;
- normalized registry and lock schemas;
- official Callout fixture;
- deterministic Next.js/Fumadocs install planner;
- authenticated GitHub branch/commit/PR installation route;
- Studio Callout palette → form → insertion → edit → preview proof;
- native-discovery-first lightweight setup.

## Follow-on work

1. Design and threat-model the managed native runner separately.
2. Expand framework discovery fixtures without weakening fail-closed layout detection.
3. Add more official components and third-party registry governance.
4. Improve compatible graph coverage while retaining immutable signed artifacts.
5. Add project-facing diagnostics for discovered aliases, runtime map, CSS target, and downgrade causes.

No follow-on item should reintroduce repository execution into the Studio or imply native fidelity from compatibility alone.

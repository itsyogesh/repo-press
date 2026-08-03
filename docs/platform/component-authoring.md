# Component authoring and extension contract

RepoPress separates a component's production implementation from the information Studio needs to author and preview it. This lets a product keep its own framework, routing, styling, data loading, and deployment while RepoPress stays a portable core.

## The three-part contract

| Part | Owned by | Purpose |
|---|---|---|
| Production implementation | Product repository | The real React/Astro/framework component used by the published site |
| Authoring metadata | Project config or integrity-bound registry lock | Labels, typed props, slots, examples, and provenance used by Studio |
| Compatible adapter mapping | Product repository | A safe structural preview built from `@repopress/preview` primitives |

These parts should share an MDX name, but they are not interchangeable. Authoring metadata cannot execute code. A Compatible mapping cannot import the production component. The production runtime never needs to use RepoPress's preview renderer.

## Project component metadata

Project-specific components can be declared in `projects[].components` in `repopress.config.json`:

```json
{
  "version": 1,
  "defaults": { "branch": "main", "framework": "auto" },
  "projects": [
    {
      "id": "blog",
      "name": "Company blog",
      "contentRoot": "content/blog",
      "framework": "next-mdx",
      "contentType": "blog",
      "branch": "main",
      "preview": { "entry": ".repopress/mdx-preview.tsx" },
      "components": {
        "CTABox": {
          "displayName": "Call to action",
          "description": "A promotional message with one destination.",
          "category": "Marketing",
          "schemaStatus": "complete",
          "props": [
            { "name": "title", "type": "string", "label": "Title", "required": true },
            { "name": "buttonText", "type": "string", "label": "Button text", "required": true },
            {
              "name": "buttonHref",
              "type": "string",
              "label": "Button destination",
              "required": true,
              "placeholder": "/letters"
            }
          ],
          "slots": [],
          "previewFixtures": [".repopress/fixtures/cta-box.mdx"],
          "defaultFixture": ".repopress/fixtures/cta-box.mdx",
          "hasChildren": false,
          "kind": "flow"
        }
      }
    }
  ]
}
```

The component-map key is the MDX tag name. It must be a safe identifier and may be dotted for namespace-style MDX names. Metadata is bounded JSON; functions, accessors, executable markup, and dangerous object keys are rejected.

### Component fields

| Field | Meaning |
|---|---|
| `displayName` | Human-readable Studio label |
| `description` | Short author-facing explanation |
| `category` | Palette grouping |
| `schemaStatus` | `complete` when props and slot behavior are intentionally declared; otherwise `incomplete` |
| `kind` | `flow` for block placement or `text` for inline placement |
| `runtime` | Production compatibility metadata: `client`, `server`, or `astro`; it does not change where Studio executes code |
| `props` | Typed authoring fields |
| `slots` | Declared content slots |
| `previewFixtures` | Repository-relative MDX examples for the component |
| `defaultFixture` | Preferred example; it must also appear in `previewFixtures` |
| `assets` | Repository-relative image/style/font/file dependencies used as declarative metadata |
| `import` / `exportName` | Optional production binding metadata used by installation/runtime-map tooling |
| `provenance` | `native`, `registry`, or `manual` origin information |

### Prop fields

Every prop has a safe field name and one of these types:

| Type | Studio control and serialization |
|---|---|
| `string` | Text/select control; quoted JSX literal |
| `image` | Media picker plus a quoted repository path or URL |
| `number` | Finite number control; `{123}` |
| `boolean` | Switch/select; `{true}` or `{false}` |
| `expression` | Expert text input for insertion; serialized as an MDX expression and not evaluated by Studio |

Props may also define `label`, JSON-literal `default`, `required`, `description`, `options`, and `placeholder`. Options are unique strings. Defaults are data, never callbacks.

Use an `expression` prop only when the production component genuinely needs structured MDX input. Prefer strings, enums, booleans, or numbers because they are easier to validate and edit safely.

### Slots

A slot declares a name, one of `text`, `markdown`, `mdx`, or `components`, and whether it is required. The current Studio insertion/editing surface materializes the conventional `children` slot. Other named slots are accepted as metadata for future authoring surfaces but are not currently emitted as JSX children or named props.

For a child-bearing component:

```json
{
  "slots": [{ "name": "children", "accepts": "mdx", "required": true }],
  "hasChildren": true
}
```

## How Studio builds its catalog

Studio combines authoring information from:

1. optional project metadata in `repopress.config.json`;
2. installed registry metadata in the closest valid `repopress.lock.json` at the exact base commit; and
3. component names discovered in the current MDX document.

An integrity-bound installed registry definition wins over project metadata for the same MDX name. A discovered name without metadata appears as an incomplete native component: Studio can preserve it, but it cannot safely invent a prop schema.

Catalog entries are validated, cloned, deeply frozen, bounded, and sorted before entering the editor. They contain data only—never component functions or imports that Studio could execute.

## Inserting components

Studio turns form values into an intermediate component node and then serializes deterministic MDX:

```mdx
<CTABox buttonHref="/letters" buttonText="Write a letter" title="Start here" />
```

Props are emitted in a stable order. Strings are escaped, numbers and booleans use literal braces, and child content is placed between matching tags.

The component picker uses author-facing field counts and a selected preview/details pane. Declarative metadata and safe literal/default values always produce the card fallback. At most one selected component may additionally render through the existing Compatible sandbox when project preview authority is available.

The picker does not fetch `previewFixtures` file contents. Fixtures remain canonical repository examples and registry/test inputs; declared prop defaults provide the immediate synthesized picker state.

## Source-preserving prop editing

Editing an existing component is intentionally narrower than inserting one. RepoPress:

1. captures a stable identity for the exact MDX node against the application-owned source;
2. reparses the current authoritative source when Edit is requested;
3. verifies the node, opening tag, source path, and prop names still match; and
4. replaces only the selected literal attribute bytes.

Supported edits are quoted string/image values and canonical finite number/boolean literals. Child bytes are preserved exactly. Expression props, spreads, duplicate attributes, computed values, calls, identifiers, or an ambiguous node identity are refused instead of reserializing the full document.

This fail-closed behavior is what prevents an edit to `buttonHref` from reformatting unrelated Markdown. If Studio reports that a position or prop is ambiguous, switch to source mode for that instance rather than weakening the identity check.

## Production actions versus preview actions

The published component decides what a button does. In the example above, the production `CTABox` can render its framework's normal link using `buttonHref`.

The Compatible adapter maps those data props to `PreviewAction`:

```tsx
function CTABox({ title, buttonText, buttonHref }) {
  return (
    <PreviewBox tone="accent">
      <PreviewStack gap="default">
        <PreviewText as="h3" size="title" weight="semibold">
          {title}
        </PreviewText>
        <PreviewAction label={buttonText || "Continue"} href={buttonHref} tone="primary" />
      </PreviewStack>
    </PreviewBox>
  )
}
```

A `PreviewAction` becomes a dedicated inert action node. A sandbox-local button explains the declared published destination when clicked, but it does not navigate or run a callback. Authors update the label and destination through the component's declared string props. `onClick`, functions, arbitrary expressions, target/window controls, and repository callbacks are not part of the preview contract.

See [Preview security](./preview-security.md) for accepted destinations and containment details.

## Compatible adapter contract

Set the project preview entry:

```json
{
  "preview": { "entry": ".repopress/mdx-preview.tsx" }
}
```

The current Compatible pilot fetches exactly that one file from the project's current 40-character Git commit. The file may import only:

- `react`;
- `react/jsx-runtime`;
- `react/jsx-dev-runtime`; and
- `@repopress/preview`.

It exports an adapter object with an optional `Document` wrapper and a component map:

```tsx
import type { ReactNode } from "react"
import { PreviewDocument, PreviewText } from "@repopress/preview"

function Document({ children }: { children?: ReactNode }) {
  return <PreviewDocument layout="article">{children}</PreviewDocument>
}

function ProductHeading({ children }: { children?: ReactNode }) {
  return <PreviewText as="h2" size="title">{children}</PreviewText>
}

export const adapter = {
  Document,
  components: { ProductHeading },
}
```

Do not import `next/link`, an Astro component, application CSS, data clients, the production component, or relative source files into this adapter. Those remain product-runtime concerns. The preview adapter describes recognizable structure with a fixed vocabulary; it is not a second application bundle.

## Fixtures

A fixture is import-free MDX using the public component name:

```mdx
<CTABox
  title="Start here"
  buttonText="Write a letter"
  buttonHref="/letters"
/>
```

Keep fixtures small, deterministic, and representative. Include required props, one meaningful variant, accessible image alt text, and realistic child content. Do not put secrets, network-dependent data, or application imports in a fixture.

For registry items, fixture paths are also part of the canonical registry integrity calculation. Changing fixture bytes therefore requires a new version and integrity value.

## Registry-backed components

Reusable ecosystem components use a shadcn-style `registry.json` item with `meta.repopress`. The normalized contract binds:

- semantic version and logical ID;
- MDX and export names;
- supported `next`, `fumadocs`, and/or `astro` frameworks;
- install files and portable targets such as `@components/...`;
- package and registry dependencies;
- authoring props, slots, assets, and fixtures; and
- SHA-256 SRI provenance.

RepoPress performs a dry-run plan, detects target/dependency conflicts, and installs through a dedicated Git branch and pull request. The resulting `repopress.lock.json` records immutable resolution, target digests, managed CSS, authoring metadata, and the local-modification digest.

See the repository's [`registry.json`](../../registry.json) and [`registry/repopress/callout/`](../../registry/repopress/callout/) for the complete working example.

## Testing an extension

At minimum, test all three contracts independently:

1. **Production**: render/build the real component in the product framework and verify its actual link, callback, or data behavior.
2. **Authoring**: validate required fields, options, defaults, insertion serialization, and byte-preserving edits.
3. **Compatible preview**: keep the adapter within the allowed import vocabulary, exercise every mapped component with an import-free fixture, and verify invalid destinations or active behavior do not become executable preview output.

The end-to-end tutorial provides a concrete sequence: [Build a component extension](../tutorials/build-a-component-extension.md).

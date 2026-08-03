---
title: Component authoring
description: Define reusable product MDX components with typed authoring metadata and safe previews without coupling RepoPress to one framework.
---

RepoPress separates a component's production implementation from the information Studio needs to author and preview it. A product keeps its framework, router, styling, data loading, and deployment while RepoPress remains a portable core.

## The three-part contract

| Part | Owned by | Purpose |
| --- | --- | --- |
| Production implementation | Product repository | Real React, Astro, or framework component used by the published site. |
| Authoring metadata | Project config or integrity-bound registry lock | Labels, typed props, slots, examples, and provenance used by Studio. |
| Compatible mapping | Product repository | Safe structural preview built from `@repopress/preview` primitives. |

These pieces share an MDX name but are not interchangeable. Metadata cannot execute code. A Compatible mapping cannot import the production component. The production runtime does not need RepoPress's preview renderer.

## Declare a project component

Project-local components live under `projects[].components` in `repopress.config.json`:

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

The map key is the MDX tag name. It must be a safe identifier and may be dotted for namespace-style names. Metadata is bounded JSON; functions, accessors, executable markup, and dangerous object keys are rejected.

## Component fields

| Field | Meaning |
| --- | --- |
| `displayName` | Human-readable Studio label. |
| `description` | Short author-facing explanation. |
| `category` | Palette grouping. |
| `schemaStatus` | `complete` when props and slots are deliberately declared; otherwise `incomplete`. |
| `kind` | `flow` for block placement or `text` for inline placement. |
| `runtime` | Production compatibility metadata (`client`, `server`, or `astro`), not an execution grant to Studio. |
| `props` | Typed authoring fields. |
| `slots` | Declared content slots. |
| `previewFixtures` | Repository-relative component examples. |
| `defaultFixture` | Preferred example, also present in `previewFixtures`. |
| `assets` | Declarative repository-relative image, style, font, or file dependencies. |
| `import` / `exportName` | Optional production binding metadata used by installation tooling. |
| `provenance` | `native`, `registry`, or `manual` origin information. |

## Prop types

| Type | Studio control and serialization |
| --- | --- |
| `string` | Text/select control and quoted JSX literal. |
| `image` | Media picker and quoted repository path or URL. |
| `number` | Finite number control serialized as `{123}`. |
| `boolean` | Switch/select serialized as `{true}` or `{false}`. |
| `expression` | Expert source input serialized as MDX expression and never evaluated by Studio. |

Props can also define a label, JSON-literal default, required flag, description, options, and placeholder. Prefer strings, enums, booleans, or numbers. Use an expression only when the production contract actually needs structured MDX input.

## Slots

A slot declares a name, an accepted content class (`text`, `markdown`, `mdx`, or `components`), and whether it is required.

```json
{
  "slots": [{ "name": "children", "accepts": "mdx", "required": true }],
  "hasChildren": true
}
```

The current insertion/editing surface materializes the conventional `children` slot. Other **named slots** are valid metadata for future authoring surfaces but are **not currently** emitted as JSX children or named props.

## How Studio builds the catalog

Studio combines:

1. project metadata from `repopress.config.json`;
2. installed registry metadata from the closest valid `repopress.lock.json` at the exact base commit; and
3. component names found in the current document.

An integrity-bound installed definition wins over project metadata for the same name. A discovered name without a schema remains preservable but incomplete; Studio does not invent its props. Valid catalog entries are cloned, deeply frozen, bounded, and contain data only.

## Insertion

Studio turns form data into a component node, then serializes stable MDX:

```mdx
<CTABox buttonHref="/letters" buttonText="Write a letter" title="Start here" />
```

Strings are escaped, number/boolean values use literal braces, and child content sits between matching tags. The picker shows author-facing field counts and a selected details/preview pane.

The picker **does not fetch** `previewFixtures` file contents. Fixtures remain canonical repository examples and registry/test inputs. Literal/default values create the immediate synthesized preview state; at most one selected component can additionally use the Compatible sandbox.

## Source-preserving prop editing

Editing is intentionally narrower than insertion. RepoPress captures one stable node identity, reparses current authoritative source, checks its path/tag/props, and replaces only selected literal attribute bytes.

Quoted string/image values and canonical finite number/boolean literals are supported. Child bytes remain exact. Expression props, spreads, duplicate attributes, computed values, calls, identifiers, or ambiguous node identity fail closed. Use source mode for that invocation rather than weakening the check.

## Production and preview actions

The product decides what its button does. Its Compatible mapping treats the label and destination as data:

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

`PreviewAction` explains the declared destination inside the sandbox. It does not navigate or invoke callbacks. Authors update its values through declared string props; `onClick`, functions, arbitrary expressions, and window controls are outside the preview contract.

## Compatible adapter

Set one project entry:

```json
{ "preview": { "entry": ".repopress/mdx-preview.tsx" } }
```

The current pilot fetches that one file at the project's exact Git commit. It may import only React, React JSX runtimes, and `@repopress/preview`:

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

Do not import `next/link`, Astro components, CSS, data clients, production components, or relative helpers. The mapping is a bounded semantic description, not a second application bundle.

## Fixtures

Fixtures are small import-free MDX examples:

```mdx
<CTABox
  title="Start here"
  buttonText="Write a letter"
  buttonHref="/letters"
/>
```

Include required props, a meaningful variant, accessible image alt text, and realistic child content. Avoid secrets, network data, and application imports. Registry fixture paths participate in integrity calculation, so changing fixture bytes requires new version/integrity metadata.

## Registry-backed components

Reusable ecosystem components use a shadcn-style registry item with `meta.repopress`. The normalized contract binds version/ID, MDX/export names, supported frameworks, install targets, dependencies, authoring fields, assets, fixtures, and SHA-256 SRI provenance.

RepoPress dry-runs an install, detects conflicts, then opens a dedicated Git branch and pull request. `repopress.lock.json` records the immutable resolution, target digests, managed styles, metadata, and local-modification digest.

## Test all three contracts

1. **Production:** build the real component and verify its actual action/data behavior.
2. **Authoring:** validate fields, defaults, insertion, and byte-preserving edits.
3. **Compatible preview:** test the allowlisted adapter and ensure active behavior or invalid destinations never become executable.

Follow the complete [component extension tutorial](/tutorials/component-extension).

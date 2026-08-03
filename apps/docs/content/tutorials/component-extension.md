---
title: Build a component extension
description: Build a product-owned MDX component with RepoPress authoring metadata, an import-free fixture, and an isolated Compatible preview.
---

This tutorial adds a product-specific `CTABox` to an MDX site while keeping RepoPress core framework-neutral. The published site owns the real component and navigation. RepoPress receives declarative metadata, one fixture, and a safe Compatible mapping.

## What you will add

```text
components/content/cta-box.tsx          # production component
mdx-components.tsx                      # product runtime binding (path varies)
repopress.config.json                   # authoring metadata
.repopress/mdx-preview.tsx              # Compatible-only mapping
.repopress/fixtures/cta-box.mdx         # import-free example
```

These files cross different trust boundaries. Never import the preview adapter into the product application, and never import the production component into the Compatible adapter.

## 1. Build the production component

Create the real component with your design system and router:

```tsx
import type { ReactNode } from "react"

type CTABoxProps = {
  title: string
  buttonText: string
  buttonHref: string
  children?: ReactNode
}

export function CTABox({ title, buttonText, buttonHref, children }: CTABoxProps) {
  return (
    <section className="cta-box">
      <h2>{title}</h2>
      <div>{children}</div>
      <a href={buttonHref}>{buttonText}</a>
    </section>
  )
}
```

In Next.js you can use `next/link`; Astro can bind an Astro/React component; another framework can use its own router. RepoPress does not constrain production behavior.

Keep the data contract explicit. `buttonHref` is a string both the product and safe preview can understand. Do not hide author-editable navigation in an opaque callback.

## 2. Bind the MDX name in the product

Expose `CTABox` through the product's normal MDX component map. A common Next/Fumadocs shape is:

```tsx
import { CTABox } from "./components/content/cta-box"

export function useMDXComponents(components: Record<string, unknown>) {
  return {
    ...components,
    CTABox,
  }
}
```

Use the location/export required by your framework. The essential contract is that published MDX containing `<CTABox />` resolves in the real product build.

## 3. Declare authoring metadata

Add the name and schema to the correct project:

```json
{
  "version": 1,
  "defaults": { "branch": "main", "framework": "auto" },
  "projects": [
    {
      "id": "blog",
      "name": "Blog",
      "contentRoot": "content/blog",
      "framework": "next-mdx",
      "contentType": "blog",
      "branch": "main",
      "preview": { "entry": ".repopress/mdx-preview.tsx" },
      "components": {
        "CTABox": {
          "displayName": "Call to action",
          "description": "A message with one published destination.",
          "category": "Marketing",
          "schemaStatus": "complete",
          "kind": "flow",
          "hasChildren": true,
          "props": [
            {
              "name": "title",
              "type": "string",
              "label": "Title",
              "required": true,
              "default": "Start here"
            },
            {
              "name": "buttonText",
              "type": "string",
              "label": "Button text",
              "required": true,
              "default": "Write a letter"
            },
            {
              "name": "buttonHref",
              "type": "string",
              "label": "Button destination",
              "required": true,
              "default": "/letters",
              "placeholder": "/letters"
            }
          ],
          "slots": [
            { "name": "children", "accepts": "mdx", "required": true }
          ],
          "previewFixtures": [".repopress/fixtures/cta-box.mdx"],
          "defaultFixture": ".repopress/fixtures/cta-box.mdx"
        }
      }
    }
  ]
}
```

Complete metadata makes insertion deterministic, labels the picker, and prevents a required prop from being omitted. Defaults supply the selected picker preview.

> **Note:** Only the conventional `children` slot is materialized today. Other named slots are accepted in metadata but are not currently emitted by Studio.

## 4. Write a fixture

Create `.repopress/fixtures/cta-box.mdx`:

```mdx
<CTABox
  title="Start here"
  buttonText="Write a letter"
  buttonHref="/letters"
>
  Share an idea with the team.
</CTABox>
```

The fixture is import-free because the product's MDX map supplies `CTABox`. Keep it small, deterministic, accessible, and independent of network data.

The current picker **does not fetch the fixture** to render its card. The path is still important for canonical examples, registry integrity, and tests; immediate picker state comes from declared literal defaults.

## 5. Add a Compatible mapping

Create `.repopress/mdx-preview.tsx`:

```tsx
import type { ReactNode } from "react"
import {
  PreviewAction,
  PreviewBox,
  PreviewDocument,
  PreviewStack,
  PreviewText,
} from "@repopress/preview"

function Document({ children }: { children?: ReactNode }) {
  return <PreviewDocument layout="article">{children}</PreviewDocument>
}

type CTABoxProps = {
  title?: string
  buttonText?: string
  buttonHref?: string
  children?: ReactNode
}

function CTABox({ title, buttonText, buttonHref, children }: CTABoxProps) {
  return (
    <PreviewBox tone="accent">
      <PreviewStack gap="default">
        <PreviewText as="h3" size="title" weight="semibold">
          {title || "Call to action"}
        </PreviewText>
        {children}
        <PreviewAction
          label={buttonText || "Continue"}
          href={buttonHref}
          tone="primary"
        />
      </PreviewStack>
    </PreviewBox>
  )
}

export const adapter = {
  Document,
  components: { CTABox },
}
```

This file may import only React, React JSX runtimes, and `@repopress/preview`. It cannot import the production `CTABox`, router, CSS, data client, or relative helper.

The mapping is semantic rather than pixel-identical. `PreviewBox` conveys hierarchy and `PreviewAction` conveys the declared destination without running product behavior.

## 6. Understand the inert action

Clicking the Compatible preview action opens a sandbox-local explanation of where the published component points. It does not navigate, submit, fetch, open a window, or call the product.

Accepted preview destinations are bounded root/repository-relative paths and HTTPS URLs. Dangerous schemes, credentials, protocol-relative URLs, control characters, and oversized strings are rejected or omitted. Apply a destination policy again in the production component because it runs with real application authority.

## 7. Test the production runtime

Render the component in the actual framework and assert:

- the title and child content appear;
- the production link has the expected destination;
- invalid production input follows the product's own policy; and
- the fixture compiles through the normal MDX component map.

For Next.js, a production build is a useful integration gate. For Astro/Blume, include the fixture in an MDX compilation or content build test.

## 8. Test the RepoPress contract

Validate at least:

- required prop names are present in production and metadata;
- every `defaultFixture` is listed in `previewFixtures`;
- options match values supported by the production component;
- the adapter imports only the Compatible allowlist;
- the fixture has no imports;
- insertion produces deterministic MDX; and
- editing one literal prop preserves unrelated source bytes.

Example allowlist check:

```ts
import { readFileSync } from "node:fs"

const source = readFileSync(".repopress/mdx-preview.tsx", "utf8")
const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1])

expect(imports).toEqual(expect.arrayContaining(["react", "@repopress/preview"]))
expect(imports.every((value) => ["react", "@repopress/preview"].includes(value))).toBe(true)
```

Use the repository's actual adapter compiler tests when available; a regex is only a small local guard.

## 9. Verify in Studio

1. Push the production component, runtime binding, config, fixture, and adapter to the project's base branch.
2. Synchronize the repository config.
3. Open a document in Studio.
4. Select **Call to action** in the component picker.
5. Confirm the details card uses the declared labels and defaults.
6. Insert it, save the draft, and inspect the exact MDX source.
7. When Compatible authority is available, click its preview action and confirm only the inert destination explanation appears.
8. Publish to a lane and review the pull-request diff.
9. Build/deploy the product and verify the real component and real navigation there.

If preview remains Generic, read the diagnostics. Do not make production code importable by Studio as a workaround.

## 10. Promote a reusable component

A product-local config is correct for product-specific vocabulary. To publish a reusable ecosystem component, create a shadcn-style registry item containing:

- package/version and supported frameworks;
- install files and production binding metadata;
- prop/slot authoring schema;
- fixture paths and a default fixture;
- Compatible preview metadata; and
- integrity-bound target hashes.

RepoPress installs the item through a reviewed branch/PR and records resolution in `repopress.lock.json`.

## Continue

- [Component authoring contract](/components/authoring)
- [Preview security](/platform/preview-security)
- [Connect an MDX repository](/tutorials/connect-an-mdx-repository)

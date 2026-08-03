# Build a component extension

This tutorial adds a product-specific `CTABox` to an MDX site while keeping RepoPress core framework-neutral. The published site owns the real component and navigation. RepoPress receives declarative authoring metadata, one fixture, and a safe Compatible mapping.

The example uses React/Next-style files for the production binding. Astro, Remix, and other MDX systems should perform the equivalent runtime-map step in their own framework; the RepoPress config and Compatible adapter remain declarative and framework-independent.

## What you will add

```text
components/content/cta-box.tsx          # production component
mdx-components.tsx                      # product runtime binding (path varies)
.repopress/mdx-preview.tsx              # Compatible-only mapping
.repopress/fixtures/cta-box.mdx         # import-free authoring example
repopress.config.json                   # project + prop contract
```

These files have different trust and execution boundaries. Never import `.repopress/mdx-preview.tsx` into the product application, and never import the production component into the Compatible adapter.

## 1. Build the production component

Create the real component using your design system and framework behavior:

```tsx
import type { ReactNode } from "react"

export type CTABoxProps = {
  title: string
  description?: string
  buttonText: string
  buttonHref: string
  children?: ReactNode
}

export function CTABox({ title, description, buttonText, buttonHref, children }: CTABoxProps) {
  return (
    <aside className="cta-box">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {children}
      <a href={buttonHref}>{buttonText}</a>
    </aside>
  )
}
```

In a Next.js product you may replace the anchor with `next/link`; an Astro product may bind an Astro component; another system may translate the destination into its own router. This is production code, so RepoPress does not constrain those choices.

Keep the data contract explicit. Here, `buttonHref` is a string prop that both the published component and safe preview mapping can understand. Do not model basic navigation as an opaque `onClick` callback if authors need to inspect or edit the destination.

## 2. Bind the MDX name in the product runtime

Expose `CTABox` through your application's existing MDX component map. A common Next/Fumadocs shape is:

```tsx
import { CTABox } from "./components/content/cta-box"

export function useMDXComponents(components: Record<string, unknown>) {
  return {
    ...components,
    CTABox,
  }
}
```

Use the runtime-map location and export shape required by your framework. The important contract is that published MDX containing `<CTABox />` resolves to the production component.

RepoPress's registry installer can update supported static runtime maps when installing a reusable registry item. For a project-local extension, keep this binding under normal product ownership.

## 3. Add authoring metadata

Add the component to the correct project in `repopress.config.json`:

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
          "description": "A promotional message with a visible destination.",
          "category": "Marketing",
          "schemaStatus": "complete",
          "props": [
            { "name": "title", "type": "string", "label": "Title", "required": true },
            {
              "name": "description",
              "type": "string",
              "label": "Description",
              "required": false
            },
            {
              "name": "buttonText",
              "type": "string",
              "label": "Button text",
              "required": true,
              "default": "Continue"
            },
            {
              "name": "buttonHref",
              "type": "string",
              "label": "Button destination",
              "required": true,
              "placeholder": "/letters"
            }
          ],
          "slots": [{ "name": "children", "accepts": "mdx", "required": false }],
          "previewFixtures": [".repopress/fixtures/cta-box.mdx"],
          "defaultFixture": ".repopress/fixtures/cta-box.mdx",
          "hasChildren": true,
          "kind": "flow"
        }
      }
    }
  ]
}
```

Why each part matters:

- `CTABox` is the exact public MDX name.
- `schemaStatus: "complete"` tells Studio the prop/slot declaration is intentional.
- required fields prevent insertion of an unusable component.
- `buttonHref` stays editable as a literal string.
- the `children` slot lets an author place Markdown inside the component.
- fixture paths give the catalog a canonical example.

Push the config and product binding together. Opening the repository hub synchronizes updated config metadata into Convex.

## 4. Write a fixture

Create `.repopress/fixtures/cta-box.mdx`:

```mdx
<CTABox
  title="Send a letter"
  description="Turn this idea into a personalized letter experience."
  buttonText="Start writing"
  buttonHref="/letters"
>
  You can review every detail before sending.
</CTABox>
```

The fixture is import-free because the MDX runtime map supplies `CTABox`. It should render successfully in the product's normal MDX build and should not depend on production data fetching.

## 5. Map it to Compatible primitives

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

type ChildrenProps = { children?: ReactNode }

function Document({ children }: ChildrenProps) {
  return <PreviewDocument layout="article">{children}</PreviewDocument>
}

function CTABox({
  title,
  description,
  buttonText,
  buttonHref,
  children,
}: ChildrenProps & {
  title?: string
  description?: string
  buttonText?: string
  buttonHref?: string
}) {
  return (
    <PreviewBox tone="accent">
      <PreviewStack gap="default">
        <PreviewText as="h3" size="title" weight="semibold">
          {title || "Call to action"}
        </PreviewText>
        {description ? <PreviewText tone="muted">{description}</PreviewText> : null}
        {children}
        <PreviewAction label={buttonText || "Continue"} href={buttonHref} tone="primary" />
      </PreviewStack>
    </PreviewBox>
  )
}

export const adapter = {
  Document,
  components: { CTABox },
}
```

This file may import only React, React JSX runtimes, and `@repopress/preview`. It cannot import your production `CTABox`, router, CSS, client, or relative helper module.

The mapping is intentionally semantic rather than pixel-identical. `PreviewBox` conveys the callout hierarchy. `PreviewAction` conveys that the published component has an action and what destination its string prop declares.

## 6. Understand the click behavior

The Compatible worker turns `PreviewAction` into a dedicated inert action node. The sandbox shows a real local button so an author can click it, but the result is only an explanation:

```text
Published action: would open /letters
```

It does not navigate, submit, fetch, open a window, or call the product component. This is why the mapping passes `buttonHref` as data rather than passing `onClick`.

Accepted preview destinations are bounded repository/root-relative paths and HTTPS URLs. A `javascript:` URL, `data:` URL, protocol-relative URL, credential-bearing URL, control character, or oversized value is rejected or omitted. The production component must still apply its own destination policy because it runs in the real application.

To change the action, choose **Edit CTABox** in Studio and update **Button text** or **Button destination**. RepoPress edits only those verified literal attributes in the authoritative MDX source and preserves unrelated bytes and children.

## 7. Test the product contract

Use the test framework already present in the product. A React Testing Library test can verify the real destination:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CTABox } from "./cta-box"

describe("CTABox", () => {
  it("renders the authored destination", () => {
    render(
      <CTABox title="Send a letter" buttonText="Start writing" buttonHref="/letters">
        Review first.
      </CTABox>,
    )

    expect(screen.getByRole("link", { name: "Start writing" })).toHaveAttribute("href", "/letters")
    expect(screen.getByText("Review first.")).toBeInTheDocument()
  })
})
```

Also compile the fixture through the product's real MDX pipeline. This catches a missing runtime-map binding earlier than RepoPress can:

```text
build product
  -> compile .repopress/fixtures/cta-box.mdx with the normal MDX component map
  -> assert no unknown-component/import error
```

The exact command depends on the product. For a Next.js site, the production build is a useful integration check; for Astro, include the fixture in the content-collection test/build.

## 8. Test the declarative/preview contract

Before pushing, verify:

- `repopress.config.json` is valid JSON;
- `defaultFixture` is also listed in `previewFixtures`;
- prop names in config exactly match production and adapter props;
- every `options` value is accepted by the production component;
- the adapter has no relative, framework, dynamic, or `require` imports;
- the fixture has no imports; and
- malformed action destinations do not appear as executable links in Studio.

A small product-side guard can prevent accidental adapter imports without depending on RepoPress internals:

```ts
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("RepoPress preview adapter", () => {
  it("stays product-runtime independent", () => {
    const source = readFileSync(".repopress/mdx-preview.tsx", "utf8")
    expect(source).not.toMatch(/from\s+["'](?:next\/|astro|\.\.?\/)/u)
    expect(source).not.toMatch(/\b(?:fetch|require)\s*\(|\bimport\s*\(/u)
  })
})
```

This is only a fast repository guard. RepoPress performs the authoritative parser-based import validation, exact-commit signing, worker containment, and render-tree sanitization.

## 9. Verify in Studio

1. Push the product component, runtime map, fixture, config, and adapter to the configured base branch.
2. Open the repository hub so the config synchronizes.
3. Open an MDX document in Studio.
4. Open the component inserter and select **Call to action**.
5. Confirm the metadata/literal card uses the declared default values and the form shows plain-language fields. When Compatible authority is available, the one selected component may additionally use the isolated sandbox; the picker does not fetch the fixture file itself.
6. Insert the component and save the draft.
7. Click its Compatible preview action and confirm only the in-sandbox destination explanation appears.
8. Edit `buttonHref`, then inspect source mode and confirm unrelated bytes and child Markdown did not change.
9. Publish to a lane, review the GitHub diff, and merge the pull request.
10. Verify the product site uses the real component and real navigation after deployment.

If the preview remains Generic, read the diagnostics. Do not make the production implementation importable by Studio as a workaround.

## 10. Promote a reusable component to the registry (optional)

A product-local config is appropriate for product-specific components. For a reusable ecosystem component, create a shadcn-style registry item with:

- `meta.repopress.apiVersion: 1`;
- semantic version, logical ID, MDX name, and export name;
- supported `next`, `fumadocs`, and/or `astro` frameworks;
- portable install files/targets;
- the complete authoring contract;
- fixture paths and a default fixture; and
- canonical SHA-256 SRI provenance.

RepoPress installs registry items through a dry-run-reviewed dedicated branch and pull request, then treats `repopress.lock.json` as the integrity-bound authoring authority. Use [`registry.json`](../../registry.json) and [`registry/repopress/callout/`](../../registry/repopress/callout/) as the working reference.

## Related documentation

- [Component authoring contract](../platform/component-authoring.md)
- [Preview security](../platform/preview-security.md)
- [Platform architecture](../platform/architecture.md)

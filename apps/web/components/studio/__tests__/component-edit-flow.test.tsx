import fs from "node:fs"
import path from "node:path"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { normalizeRegistryAuthoringMetadata, registryItemSchema } from "@/lib/repopress/registry-schema"
import { buildAuthoringCatalog } from "@/lib/studio/authoring-catalog"
import { ComponentEditProvider } from "../component-edit-context"
import { GenericJsxEditor } from "../jsx-component-descriptors"
import { createStudioAdapterState, StudioAdapterProvider } from "../studio-adapter-context"
import { StudioProvider } from "../studio-context"

function officialCatalog() {
  const registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), "registry.json"), "utf8")) as {
    items: unknown[]
  }
  const item = registryItemSchema.parse(registry.items[0])
  return buildAuthoringCatalog({ metadata: { Callout: normalizeRegistryAuthoringMetadata(item) } })
}

function nodeAt(source: string, occurrence = 0) {
  let start = -1
  for (let index = 0; index <= occurrence; index += 1) start = source.indexOf("<Callout", start + 1)
  return { name: "Callout", position: { start: { offset: start } } }
}

function renderEditor(source: string, occurrence = 0, mdastSource = source) {
  let currentSource = source
  const applySource = vi.fn((nextSource: string) => {
    currentSource = nextSource
  })
  const catalog = officialCatalog()
  const adapter = createStudioAdapterState({ authoringCatalog: catalog, nativeComponentNames: [] })
  render(
    <StudioAdapterProvider value={adapter}>
      <ComponentEditProvider authoringCatalog={catalog} getSource={() => currentSource} applySource={applySource}>
        <GenericJsxEditor
          mdastNode={nodeAt(mdastSource, occurrence) as never}
          descriptor={{ name: "Callout" } as never}
        />
      </ComponentEditProvider>
    </StudioAdapterProvider>,
  )
  return { applySource, setCurrentSource: (next: string) => (currentSource = next) }
}

afterEach(cleanup)

describe("position-bound Studio component editing", () => {
  it("renders a safe visual card from declared literal props without evaluating expressions", () => {
    const source =
      '<StoryCard cover="https://cdn.example.test/story.png" title="North Pole news" pages={3} featured={true} action={globalThis.__repopressExecuted = true} />'
    const catalog = buildAuthoringCatalog({
      metadata: {
        StoryCard: {
          displayName: "Story card",
          description: "A product-defined story presentation.",
          props: [
            { name: "cover", type: "image", label: "Cover" },
            { name: "title", type: "string", label: "Title" },
            { name: "subtitle", type: "string", label: "Subtitle" },
            { name: "pages", type: "number", label: "Pages" },
            { name: "featured", type: "boolean", label: "Featured" },
            { name: "action", type: "expression", label: "Action" },
          ],
          hasChildren: false,
        },
      },
    })
    const adapter = createStudioAdapterState({ authoringCatalog: catalog, nativeComponentNames: [] })
    const expressionExecuted = vi.fn()
    Object.defineProperty(globalThis, "__repopressExecuted", {
      configurable: true,
      set: expressionExecuted,
    })

    try {
      render(
        <StudioAdapterProvider value={adapter}>
          <ComponentEditProvider
            authoringCatalog={catalog}
            identitySource={source}
            getSource={() => source}
            applySource={vi.fn()}
          >
            <GenericJsxEditor
              mdastNode={
                {
                  type: "mdxJsxFlowElement",
                  name: "StoryCard",
                  position: { start: { offset: 0 } },
                  attributes: [
                    { type: "mdxJsxAttribute", name: "cover", value: "https://cdn.example.test/story.png" },
                    { type: "mdxJsxAttribute", name: "title", value: "North Pole news" },
                    {
                      type: "mdxJsxAttribute",
                      name: "subtitle",
                      value: { type: "mdxJsxAttributeValueExpression", value: "story.subtitle" },
                    },
                    {
                      type: "mdxJsxAttribute",
                      name: "pages",
                      value: { type: "mdxJsxAttributeValueExpression", value: "3" },
                    },
                    {
                      type: "mdxJsxAttribute",
                      name: "featured",
                      value: { type: "mdxJsxAttributeValueExpression", value: "true" },
                    },
                    {
                      type: "mdxJsxAttribute",
                      name: "action",
                      value: {
                        type: "mdxJsxAttributeValueExpression",
                        value: "globalThis.__repopressExecuted = true",
                      },
                    },
                  ],
                } as never
              }
              descriptor={{ name: "StoryCard" } as never}
            />
          </ComponentEditProvider>
        </StudioAdapterProvider>,
      )

      expect(screen.getByText("Story card")).toBeInTheDocument()
      expect(screen.queryByRole("img", { name: "Story card preview" })).not.toBeInTheDocument()
      expect(screen.getByText("Image preview unavailable")).toBeInTheDocument()
      const card = screen.getByRole("region", { name: "Story card component" })
      expect(card).toHaveTextContent(/Title:\s*North Pole news/u)
      expect(card).toHaveTextContent(/Subtitle:\s*Value unavailable in visual editor/u)
      expect(card).toHaveTextContent(/Pages:\s*3/u)
      expect(card).toHaveTextContent(/Featured:\s*Yes/u)
      expect(screen.queryByText(/__repopressExecuted/u)).not.toBeInTheDocument()
      expect(expressionExecuted).not.toHaveBeenCalled()
      expect(screen.getByRole("button", { name: "Edit Story card" })).toBeInTheDocument()
    } finally {
      Reflect.deleteProperty(globalThis, "__repopressExecuted")
    }
  })

  it("loads repository images only through the RepoPress media resolver", () => {
    const source = '<StoryCard cover="images/story.png" />'
    const catalog = buildAuthoringCatalog({
      metadata: {
        StoryCard: {
          displayName: "Story card",
          props: [{ name: "cover", type: "image", label: "Cover" }],
          hasChildren: false,
        },
      },
    })
    const adapter = createStudioAdapterState({ authoringCatalog: catalog, nativeComponentNames: [] })

    render(
      <StudioProvider
        value={{
          owner: "repo-owner",
          repo: "docs",
          branch: "main",
          baseCommitSha: "a".repeat(40),
          projectId: "project-1",
          userId: "user-1",
          selectedFilePath: "content/posts/story.mdx",
          contentRoot: "content",
          tree: [],
          role: "owner",
        }}
      >
        <StudioAdapterProvider value={adapter}>
          <ComponentEditProvider
            authoringCatalog={catalog}
            identitySource={source}
            getSource={() => source}
            applySource={vi.fn()}
          >
            <GenericJsxEditor
              mdastNode={
                {
                  type: "mdxJsxFlowElement",
                  name: "StoryCard",
                  position: { start: { offset: 0 } },
                  attributes: [{ type: "mdxJsxAttribute", name: "cover", value: "images/story.png" }],
                } as never
              }
              descriptor={{ name: "StoryCard" } as never}
            />
          </ComponentEditProvider>
        </StudioAdapterProvider>
      </StudioProvider>,
    )

    const image = screen.getByRole("img", { name: "Story card preview" })
    expect(image.getAttribute("src")).toMatch(/^\/api\/media\/resolve\?/u)
    expect(image.getAttribute("src")).toContain("projectId=project-1")
    expect(image.getAttribute("src")).not.toContain("cdn.example")
  })

  it("keeps a uniquely attributed component editable when MDXEditor drops source positions", async () => {
    const source = '<Callout title="First" variant="accent" />\n\n<Callout title="Second" variant="accent" />'
    const catalog = officialCatalog()
    const adapter = createStudioAdapterState({ authoringCatalog: catalog, nativeComponentNames: [] })

    render(
      <StudioAdapterProvider value={adapter}>
        <ComponentEditProvider
          authoringCatalog={catalog}
          identitySource={source}
          getSource={() => source}
          applySource={vi.fn()}
        >
          <GenericJsxEditor
            mdastNode={
              {
                type: "mdxJsxFlowElement",
                name: "Callout",
                attributes: [
                  { type: "mdxJsxAttribute", name: "title", value: "Second" },
                  { type: "mdxJsxAttribute", name: "variant", value: "accent" },
                ],
              } as never
            }
            descriptor={{ name: "Callout" } as never}
          />
        </ComponentEditProvider>
      </StudioAdapterProvider>,
    )

    fireEvent.click(screen.getByRole("button", { name: "Edit Callout" }))
    expect(await screen.findByLabelText("Title")).toHaveValue("Second")
  })

  it("refuses a positionless identity when the latest source makes it ambiguous", () => {
    const loadedSource = '<Callout title="Same" variant="accent">One</Callout>'
    const latestSource = `${loadedSource}\n\n<Callout title="Same" variant="accent">Two</Callout>`
    const catalog = officialCatalog()
    const adapter = createStudioAdapterState({ authoringCatalog: catalog, nativeComponentNames: [] })

    render(
      <StudioAdapterProvider value={adapter}>
        <ComponentEditProvider
          authoringCatalog={catalog}
          identitySource={loadedSource}
          getSource={() => latestSource}
          applySource={vi.fn()}
        >
          <GenericJsxEditor
            mdastNode={
              {
                type: "mdxJsxTextElement",
                name: "Callout",
                attributes: [
                  { type: "mdxJsxAttribute", name: "title", value: "Same" },
                  { type: "mdxJsxAttribute", name: "variant", value: "accent" },
                ],
              } as never
            }
            descriptor={{ name: "Callout" } as never}
          />
        </ComponentEditProvider>
      </StudioAdapterProvider>,
    )

    expect(screen.getByRole("button", { name: "Edit Callout" })).toBeDisabled()
  })

  it("captures identities from the loaded source snapshot before the editor ref hydrates", () => {
    const source = '<Callout title="Loaded" variant="accent">Body</Callout>'
    const catalog = officialCatalog()
    const adapter = createStudioAdapterState({ authoringCatalog: catalog, nativeComponentNames: [] })

    render(
      <StudioAdapterProvider value={adapter}>
        <ComponentEditProvider
          authoringCatalog={catalog}
          identitySource={source}
          getSource={() => ""}
          applySource={vi.fn()}
        >
          <GenericJsxEditor mdastNode={nodeAt(source) as never} descriptor={{ name: "Callout" } as never} />
        </ComponentEditProvider>
      </StudioAdapterProvider>,
    )

    expect(screen.getByRole("button", { name: "Edit Callout" })).toBeEnabled()
  })

  it("retries identity capture after the editor source finishes hydrating", () => {
    const source = '<Callout title="Hydrated" variant="accent">Body</Callout>'
    let currentSource = ""
    const catalog = officialCatalog()
    const adapter = createStudioAdapterState({ authoringCatalog: catalog, nativeComponentNames: [] })
    const renderTree = () => (
      <StudioAdapterProvider value={adapter}>
        <ComponentEditProvider authoringCatalog={catalog} getSource={() => currentSource} applySource={vi.fn()}>
          <GenericJsxEditor mdastNode={nodeAt(source) as never} descriptor={{ name: "Callout" } as never} />
        </ComponentEditProvider>
      </StudioAdapterProvider>
    )

    const view = render(renderTree())
    expect(screen.getByRole("button", { name: "Edit Callout" })).toBeDisabled()

    currentSource = source
    view.rerender(renderTree())

    expect(screen.getByRole("button", { name: "Edit Callout" })).toBeEnabled()
  })

  it("edits one clicked Callout prop while preserving all unrelated source bytes", async () => {
    const source = [
      "import { Callout } from './callout'",
      "",
      "// keep this comment",
      '<Callout title="First" variant="default">First body</Callout>',
      '<Callout  title="Second" titleId="second-title" variant="accent" data-extra="keep">',
      "  Keep **children** and spacing.",
      "</Callout>",
      "",
      "export const answer = value",
    ].join("\r\n")
    const { applySource } = renderEditor(source, 1)

    fireEvent.click(screen.getByRole("button", { name: "Edit Callout" }))
    expect(await screen.findByLabelText("Title")).toHaveValue("Second")
    expect(screen.getByLabelText("Title ID")).toHaveValue("second-title")
    expect(screen.getByRole("combobox", { name: "Variant" })).toHaveTextContent("accent")
    expect(screen.getByText("Children are preserved exactly.")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Changed" } })
    fireEvent.click(screen.getByRole("button", { name: "Update Component" }))

    expect(applySource).toHaveBeenCalledOnce()
    const edited = applySource.mock.calls[0][0]
    expect(edited.replace('title="Changed"', 'title="Second"')).toBe(source)
  })

  it("visibly refuses spreads, expressions, and stale edits without mutating editor state", async () => {
    for (const unsafeSource of [
      '<Callout title={computeTitle()} variant="accent">Body</Callout>',
      '<Callout {...props} variant="accent">Body</Callout>',
      '<Callout title="one" title="two" variant="accent">Body</Callout>',
    ]) {
      const unsafe = renderEditor(unsafeSource)
      fireEvent.click(screen.getByRole("button", { name: "Edit Callout" }))
      expect(await screen.findByRole("alert")).toHaveTextContent("cannot be edited safely")
      expect(unsafe.applySource).not.toHaveBeenCalled()
      cleanup()
    }

    const safeSource = '<Callout title="Before" variant="accent">Body</Callout>'
    const stale = renderEditor(safeSource)
    fireEvent.click(screen.getByRole("button", { name: "Edit Callout" }))
    expect(await screen.findByLabelText("Title")).toHaveValue("Before")
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "After" } })
    stale.setCurrentSource(`${safeSource}\nConcurrent change`)
    fireEvent.click(screen.getByRole("button", { name: "Update Component" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("source changed")
    expect(stale.applySource).not.toHaveBeenCalled()
  })

  it("refuses to rebind a retained opening tag to a duplicate with different children", async () => {
    const source =
      '<Callout title="Alpha" variant="accent">One</Callout>\n<Callout title="Bravo" variant="accent">Two</Callout>'
    const swapped =
      '<Callout title="Bravo" variant="accent">One</Callout>\n<Callout title="Alpha" variant="accent">Two</Callout>'
    const editor = renderEditor(source, 1)
    editor.setCurrentSource(swapped)

    fireEvent.click(screen.getByRole("button", { name: "Edit Callout" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("ambiguous")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(editor.applySource).not.toHaveBeenCalled()
  })

  it("reacquires the intended unique Callout after an unrelated preceding edit", async () => {
    const source =
      '<Callout title="First" variant="accent">One</Callout>\n<Callout title="Second" variant="accent">Two</Callout>'
    const editor = renderEditor(source, 1)
    const latest = `A newly inserted introduction.\n\n${source}`
    editor.setCurrentSource(latest)

    fireEvent.click(screen.getByRole("button", { name: "Edit Callout" }))

    expect(await screen.findByLabelText("Title")).toHaveValue("Second")
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Changed" } })
    fireEvent.click(screen.getByRole("button", { name: "Update Component" }))
    expect(editor.applySource).toHaveBeenCalledWith(latest.replace('title="Second"', 'title="Changed"'))
  })

  it("distinguishes identical opening tags by their retained full-node source", async () => {
    const source =
      '<Callout title="Same" variant="accent">One</Callout>\n<Callout title="Same" variant="accent">Two</Callout>'
    const editor = renderEditor(source, 1)
    const latest = `Unrelated preface\n\n${source}`
    editor.setCurrentSource(latest)

    fireEvent.click(screen.getByRole("button", { name: "Edit Callout" }))

    expect(await screen.findByLabelText("Title")).toHaveValue("Same")
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Changed" } })
    fireEvent.click(screen.getByRole("button", { name: "Update Component" }))
    const secondStart = latest.lastIndexOf('<Callout title="Same"')
    const expected = `${latest.slice(0, secondStart)}${latest
      .slice(secondStart)
      .replace('title="Same"', 'title="Changed"')}`
    expect(editor.applySource).toHaveBeenCalledWith(expected)
  })

  it("refuses fresh reacquisition when duplicate full-node identities are identical", async () => {
    const source =
      '<Callout title="Same" variant="accent">Same body</Callout>\n<Callout title="Same" variant="accent">Same body</Callout>'
    const editor = renderEditor(source, 1)
    editor.setCurrentSource(`Unrelated preface\n\n${source}`)

    fireEvent.click(screen.getByRole("button", { name: "Edit Callout" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("ambiguous")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(editor.applySource).not.toHaveBeenCalled()
  })

  it("edits the intended duplicate when the initial Editor node offset came from trimmed Markdown", async () => {
    const source =
      '\n\n<Callout title="First" variant="accent">One</Callout>\n<Callout title="Second" variant="accent">Two</Callout>\n'
    const editor = renderEditor(source, 1, source.trim())

    fireEvent.click(screen.getByRole("button", { name: "Edit Callout" }))

    expect(await screen.findByLabelText("Title")).toHaveValue("Second")
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Changed" } })
    fireEvent.click(screen.getByRole("button", { name: "Update Component" }))
    expect(editor.applySource).toHaveBeenCalledWith(source.replace('title="Second"', 'title="Changed"'))
  })
})

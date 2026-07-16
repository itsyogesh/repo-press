import fs from "node:fs"
import path from "node:path"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { normalizeRegistryAuthoringMetadata, registryItemSchema } from "@/lib/repopress/registry-schema"
import { buildAuthoringCatalog } from "@/lib/studio/authoring-catalog"
import { ComponentEditProvider } from "../component-edit-context"
import { GenericJsxEditor } from "../jsx-component-descriptors"
import { createStudioAdapterState, StudioAdapterProvider } from "../studio-adapter-context"

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

  it("refuses a retained JSX node position when duplicate components changed underneath it", async () => {
    const source =
      '<Callout title="Alpha" variant="accent">One</Callout>\n<Callout title="Bravo" variant="accent">Two</Callout>'
    const swapped =
      '<Callout title="Bravo" variant="accent">One</Callout>\n<Callout title="Alpha" variant="accent">Two</Callout>'
    const editor = renderEditor(source, 1)
    editor.setCurrentSource(swapped)

    fireEvent.click(screen.getByRole("button", { name: "Edit Callout" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("source changed")
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

import fs from "node:fs"
import path from "node:path"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createSignedCompatibleFixture } from "@/lib/preview/__tests__/compatible-test-fixture"
import type { CompatiblePreviewAuthorityContext } from "@/lib/preview/compatible-artifact"
import type { PreviewResult } from "@/lib/preview/contracts"
import { buildGenericRenderModel } from "@/lib/preview/generic-render-model"
import { normalizeRegistryAuthoringMetadata, registryItemSchema } from "@/lib/repopress/registry-schema"
import { type AuthoringCatalog, buildAuthoringCatalog } from "@/lib/studio/authoring-catalog"
import { ComponentInsertModal } from "../component-insert-modal"
import { Preview } from "../preview"
import { createStudioAdapterState, StudioAdapterProvider } from "../studio-adapter-context"
import { StudioProvider } from "../studio-context"

type RegistryRoot = { items: unknown[] }

function loadOfficialCatalog(): AuthoringCatalog {
  const registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), "registry.json"), "utf8")) as RegistryRoot
  const item = registryItemSchema.parse(registry.items[0])
  return buildAuthoringCatalog({ metadata: { Callout: normalizeRegistryAuthoringMetadata(item) } })
}

function expectDeclarative(value: unknown, seen = new WeakSet<object>()): void {
  expect(typeof value).not.toBe("function")
  if (value === null || typeof value !== "object" || seen.has(value)) return
  seen.add(value)
  for (const key of Object.keys(value)) expectDeclarative(Object.getOwnPropertyDescriptor(value, key)?.value, seen)
}

function genericResult(reason = "COMPATIBLE_UNAVAILABLE"): PreviewResult {
  return {
    fidelity: "generic",
    sessionId: "generic-session",
    snapshotVersion: 1,
    status: "ready",
    target: { kind: "safe-fallback", renderModel: buildGenericRenderModel("# Generic fallback\n\n<Callout />") },
    diagnostics: [],
    downgradeReasons: [reason],
    cache: { hit: false },
  }
}

function compatibleResult(authority: CompatiblePreviewAuthorityContext): PreviewResult {
  return {
    fidelity: "compatible",
    sessionId: authority.sessionId,
    snapshotVersion: authority.snapshotVersion,
    status: "ready",
    target: { kind: "sandboxed-iframe", url: "https://preview.repopress.test/preview/sandbox" },
    diagnostics: [],
    downgradeReasons: ["NATIVE_UNAVAILABLE"],
    cache: { hit: false },
  }
}

function renderModal(
  catalog: AuthoringCatalog,
  onInsert = vi.fn(),
  contextOverrides: Partial<React.ComponentProps<typeof StudioProvider>["value"]> = {},
) {
  const adapterState = createStudioAdapterState({ authoringCatalog: catalog, nativeComponentNames: [] })
  const onOpenChange = vi.fn()
  return {
    onInsert,
    onOpenChange,
    ...render(
      <StudioProvider
        value={{
          owner: "repo-owner",
          repo: "docs",
          branch: "main",
          baseCommitSha: "a".repeat(40),
          contentRoot: "",
          tree: [],
          role: "owner",
          ...contextOverrides,
        }}
      >
        <StudioAdapterProvider value={adapterState}>
          <ComponentInsertModal open onOpenChange={onOpenChange} authoringCatalog={catalog} onInsert={onInsert} />
        </StudioAdapterProvider>
      </StudioProvider>,
    ),
  }
}

let compatibleWire: string
let compatibleAuthority: CompatiblePreviewAuthorityContext
let publicKey: JsonWebKey

beforeAll(async () => {
  const fixture = await createSignedCompatibleFixture({ documentSource: '<Callout variant="accent">Safe</Callout>' })
  compatibleWire = fixture.wire
  compatibleAuthority = fixture.expectedAuthority
  publicKey = fixture.publicKey
})

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PREVIEW_ORIGIN", "https://preview.repopress.test")
  vi.stubEnv("NEXT_PUBLIC_PREVIEW_APPROVAL_PUBLIC_KEY_JWK", JSON.stringify(publicKey))
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("official Callout Studio ecosystem", () => {
  it("selects a zero-field component for inspection before an explicit insert", () => {
    const catalog = buildAuthoringCatalog({
      metadata: {
        Divider: {
          displayName: "Divider",
          description: "Separates two sections.",
          props: [],
          hasChildren: false,
        },
      },
    })
    const { onInsert, onOpenChange } = renderModal(catalog)

    fireEvent.click(screen.getByRole("button", { name: /Divider Separates two sections/iu }))

    expect(onInsert).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole("complementary", { name: "Selected component details" })).toHaveTextContent(
      "Separates two sections.",
    )

    fireEvent.click(screen.getByRole("button", { name: "Insert component" }))
    expect(onInsert).toHaveBeenCalledOnce()
    expect(onInsert.mock.calls[0]?.[0]).toBe("<Divider />")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("uses plain-language field counts and keyboard selection to update persistent picker details", () => {
    const catalog = buildAuthoringCatalog({
      metadata: {
        ArticleCard: {
          displayName: "Article card",
          description: "Presents an article summary.",
          props: [
            { name: "title", type: "string", label: "Title" },
            { name: "description", type: "string", label: "Description" },
            { name: "href", type: "string", label: "Destination" },
            { name: "featured", type: "boolean", label: "Featured" },
          ],
          hasChildren: false,
        },
        CoverArtwork: {
          displayName: "Cover artwork",
          description: "Displays a repository cover image.",
          props: [{ name: "source", type: "image", label: "Image" }],
          hasChildren: false,
        },
      },
    })

    renderModal(catalog)

    const article = screen.getByRole("button", { name: /Article card.*4 fields/iu })
    const cover = screen.getByRole("button", { name: /Cover artwork.*1 field/iu })
    expect(screen.queryByText("4p")).not.toBeInTheDocument()
    expect(screen.getByRole("complementary", { name: "Selected component details" })).toHaveTextContent("Article card")
    expect(article).toHaveAttribute("aria-pressed", "true")

    article.focus()
    fireEvent.keyDown(article, { key: "ArrowDown" })

    expect(cover).toHaveFocus()
    expect(cover).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("complementary", { name: "Selected component details" })).toHaveTextContent(
      "Displays a repository cover image.",
    )
  })

  it("drives the normalized catalog through palette, schema form, and import-free insertion", async () => {
    const catalog = loadOfficialCatalog()
    expectDeclarative(catalog)
    expect(Object.isFrozen(catalog)).toBe(true)

    const { onInsert } = renderModal(catalog)
    fireEvent.click(screen.getByRole("button", { name: /Callout/i }))
    fireEvent.click(screen.getByRole("button", { name: "Configure selected component" }))

    expect(await screen.findByLabelText("Title")).toBeInTheDocument()
    expect(screen.getByLabelText("Title ID")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Variant" })).toHaveTextContent("default")
    expect(screen.getByRole("textbox", { name: "Children" })).toBeRequired()
    expect(screen.getByRole("button", { name: "Insert Component" })).toBeDisabled()

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Migration note" } })
    fireEvent.change(screen.getByLabelText("Title ID"), { target: { value: "migration-note" } })
    fireEvent.change(screen.getByRole("textbox", { name: "Children" }), {
      target: { value: "Keep the **lockfile** together." },
    })
    fireEvent.click(screen.getByRole("button", { name: "Insert Component" }))

    expect(onInsert).toHaveBeenCalledOnce()
    const [source, component, node] = onInsert.mock.calls[0]
    expect(source).toBe(
      '<Callout title="Migration note" titleId="migration-note" variant="default">\nKeep the **lockfile** together.\n</Callout>',
    )
    expect(source).not.toMatch(/^import\s/mu)
    expectDeclarative(component)
    expectDeclarative(node)
  })

  it("uses one signed Compatible sandbox for the selected component and sends its serialized defaults", async () => {
    const signer = await createSignedCompatibleFixture()
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_APPROVAL_PUBLIC_KEY_JWK", JSON.stringify(signer.publicKey))
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        projectId: string
        filePath: string
        baseCommitSha: string
        snapshotVersion: number
        documentSource: string
      }
      const fixture = await createSignedCompatibleFixture({
        keyPair: signer.keyPair,
        projectId: request.projectId,
        baseCommit: request.baseCommitSha,
        documentPath: request.filePath,
        snapshotVersion: request.snapshotVersion,
        documentSource: request.documentSource,
      })
      return new Response(
        JSON.stringify({
          previewResult: compatibleResult(fixture.expectedAuthority),
          resolution: fixture.wire,
          authority: fixture.expectedAuthority,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    })
    vi.stubGlobal("fetch", fetchMock)
    const catalog = buildAuthoringCatalog({
      metadata: {
        ActionPanel: {
          displayName: "Action panel",
          props: [
            { name: "label", type: "string", default: "Open writer" },
            { name: "href", type: "string", default: "/letters/new" },
          ],
          hasChildren: false,
        },
      },
    })

    renderModal(catalog, vi.fn(), {
      projectId: "project-modal",
      selectedFilePath: "content/example.mdx",
      previewEntry: ".repopress/mdx-preview.tsx",
    })

    expect(await screen.findByTitle("Compatible component preview")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      projectId: "project-modal",
      filePath: "content/example.mdx",
      baseCommitSha: "a".repeat(40),
      documentSource: '<ActionPanel href="/letters/new" label="Open writer" />',
    })
  })

  it("requires one explicit true-or-false choice for required boolean props", async () => {
    const catalog = buildAuthoringCatalog({
      metadata: {
        Toggle: {
          props: [{ name: "enabled", type: "boolean", label: "Enabled", required: true }],
          hasChildren: false,
        },
      },
    })
    expect(catalog[0].props[0]).toMatchObject({ name: "enabled", type: "boolean", required: true })
    const { onInsert } = renderModal(catalog)

    fireEvent.click(screen.getByRole("button", { name: /Toggle/i }))
    fireEvent.click(screen.getByRole("button", { name: "Configure selected component" }))

    const booleanChoice = await screen.findByRole("combobox", { name: "Enabled" })
    expect(booleanChoice).toHaveTextContent("Select...")
    expect(screen.getByRole("button", { name: "Insert Component" })).toBeDisabled()
    fireEvent.keyDown(booleanChoice, { key: "f" })
    expect(screen.getByRole("button", { name: "Insert Component" })).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "Insert Component" }))
    expect(onInsert).toHaveBeenCalledWith("<Toggle enabled={false} />", expect.any(Object), expect.any(Object))
  })

  it("shows only an exact trusted compatible artifact and otherwise gives a normalized generic downgrade", async () => {
    const trustedResult = compatibleResult(compatibleAuthority)
    expectDeclarative(trustedResult)
    expectDeclarative(JSON.parse(compatibleWire))

    const view = render(
      <Preview
        previewResult={trustedResult}
        fallbackResult={genericResult()}
        frontmatter={{ title: "Document" }}
        compatibleResolution={compatibleWire}
        compatibleAuthority={compatibleAuthority}
      />,
    )
    expect(await screen.findByTitle("Compatible component preview")).toBeInTheDocument()
    expect(screen.getByText("Compatible fidelity")).toBeInTheDocument()

    view.rerender(
      <Preview
        previewResult={compatibleResult(compatibleAuthority)}
        fallbackResult={genericResult()}
        frontmatter={{ title: "Document" }}
      />,
    )
    expect(await screen.findByRole("heading", { name: "Generic fallback" })).toBeInTheDocument()
    expect(screen.getByText("Compatible preview is unavailable for this snapshot.")).toBeInTheDocument()
    expect(screen.getByText("Generic fidelity")).toBeInTheDocument()
    expect(screen.queryByTitle("Compatible component preview")).not.toBeInTheDocument()

    view.rerender(
      <Preview
        previewResult={compatibleResult({ ...compatibleAuthority, snapshotVersion: 2 })}
        fallbackResult={genericResult()}
        frontmatter={{ title: "Document" }}
        compatibleResolution={compatibleWire}
        compatibleAuthority={compatibleAuthority}
      />,
    )
    await waitFor(() => expect(screen.queryByTitle("Compatible component preview")).not.toBeInTheDocument())
    expect(screen.getByText("Generic fidelity")).toBeInTheDocument()

    view.rerender(<Preview previewResult={compatibleResult(compatibleAuthority)} frontmatter={{ title: "Document" }} />)
    expect(await screen.findByText("<CompatiblePreview />")).toBeInTheDocument()
    expect(screen.getByText("Generic fidelity")).toBeInTheDocument()
  })
})

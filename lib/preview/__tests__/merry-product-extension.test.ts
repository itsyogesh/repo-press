// @vitest-environment node
import vm from "node:vm"
import { describe, expect, it } from "vitest"
import {
  createCompatibleWorkerSource,
  prepareCompatibleWorkerJob,
} from "@/components/preview-sandbox/compatible-worker"
import { repoPressConfigSchema } from "@/lib/config-schema"
import { buildGenericRenderModel } from "@/lib/preview/generic-render-model"
import { assertCompatibleAdapterImports } from "../adapter-import-policy"
import { verifySignedCompatiblePreviewResolution } from "../compatible-artifact"
import { createSignedCompatibleFixture } from "./compatible-test-fixture"
import { MERRY_ADAPTER_SOURCE, MERRY_CONFIG, MERRY_DOCUMENT_SOURCE } from "./fixtures/merry-product-extension"

async function renderMerryWorker() {
  const job = await prepareCompatibleWorkerJob({
    artifactId: "merry-product-extension",
    documentSource: MERRY_DOCUMENT_SOURCE,
    adapter: {
      entryPath: ".repopress/mdx-preview.tsx",
      sources: { ".repopress/mdx-preview.tsx": MERRY_ADAPTER_SOURCE },
    },
  })
  const sent: unknown[] = []
  const listeners: Array<(event: { data?: unknown; ports?: unknown[] }) => void | Promise<void>> = []
  const port = {
    onmessage: null as ((event: { data: unknown }) => void | Promise<void>) | null,
    close() {},
    postMessage(message: unknown) {
      sent.push(message)
    },
    start() {},
  }
  const context = vm.createContext({
    addEventListener: (
      _type: string,
      listener: (event: { data?: unknown; ports?: unknown[] }) => void | Promise<void>,
    ) => listeners.push(listener),
    removeEventListener() {},
  })
  vm.runInContext(createCompatibleWorkerSource(), context, { timeout: 1_000 })
  await listeners[0]({ ports: [port] })
  await port.onmessage?.({ data: { type: "repopress:render-compatible", requestId: "M".repeat(43), job } })
  return sent
}

describe("Merry product extension pilot", () => {
  it("normalizes all five complete authoring contracts", () => {
    const config = repoPressConfigSchema.parse(MERRY_CONFIG)
    const project = config.projects[0]
    expect(project.preview?.entry).toBe(".repopress/mdx-preview.tsx")
    expect(Object.keys(project.components ?? {}).sort()).toEqual([
      "CTABox",
      "Checklist",
      "CoverImage",
      "InfoBox",
      "LetterPaper",
    ])
    for (const component of Object.values(project.components ?? {})) expect(component.schemaStatus).toBe("complete")
  })

  it("accepts the framework-neutral adapter and rejects a Next.js substitution", () => {
    expect(() => assertCompatibleAdapterImports(MERRY_ADAPTER_SOURCE, ".repopress/mdx-preview.tsx")).not.toThrow()
    expect(() =>
      assertCompatibleAdapterImports(MERRY_ADAPTER_SOURCE.replace('from "@repopress/preview"', 'from "next/link"')),
    ).toThrow("next/link")
  })

  it("signs and verifies the exact Merry document and adapter", async () => {
    const signed = await createSignedCompatibleFixture({
      documentSource: MERRY_DOCUMENT_SOURCE,
      adapter: {
        entryPath: ".repopress/mdx-preview.tsx",
        sources: { ".repopress/mdx-preview.tsx": MERRY_ADAPTER_SOURCE },
      },
    })
    await expect(
      verifySignedCompatiblePreviewResolution(signed.wire, {
        publicKey: signed.publicKey,
        expectedAuthority: signed.expectedAuthority,
      }),
    ).resolves.not.toBeNull()
  })

  it("renders recognizable inert structure for every Merry component", async () => {
    const sent = await renderMerryWorker()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ type: "repopress:rendered-compatible", fidelityLosses: [] })
    const output = JSON.stringify(sent[0])
    for (const text of [
      "Free Santa letter templates",
      "Pro Tip",
      "Write a warm greeting",
      "Classic Letter",
      "Postage stamp",
      "Want Santa to reply? Write your letter now!",
      "Send your letter to Santa",
      "Start writing",
    ]) {
      expect(output).toContain(text)
    }
    for (const className of [
      "repopress-preview-box--tip",
      "repopress-preview-list--check",
      "repopress-preview-paper--letter",
    ]) {
      expect(output).toContain(className)
    }
    expect(output).toContain('"kind":"action"')
    expect(output).toContain('"tone":"primary"')
    const tree = (
      sent[0] as { tree: Array<{ kind: string; tag?: string; props?: { className?: string }; children?: unknown[] }> }
    ).tree
    expect(tree).toHaveLength(1)
    expect(tree[0]).toMatchObject({
      kind: "element",
      tag: "article",
      props: {
        className:
          "typeset typeset-preview repopress-preview-document repopress-preview-document--article repopress-preview-document--warm",
      },
      children: expect.arrayContaining([expect.objectContaining({ kind: "element", tag: "h1" })]),
    })
    const documentChildren = tree[0].children as Array<{
      kind: string
      tag?: string
      props?: { className?: string }
      children?: unknown[]
    }>
    expect(documentChildren).toEqual(
      expect.arrayContaining([
        {
          kind: "image",
          source:
            "https://soxgiykgxzadvzcy.public.blob.vercel-storage.com/blog/templates-cover-Pduq3obFhtWzBzwmfWzVwloNZurTBC.png",
          alt: "A collection of printable Santa letter templates",
          label: "Free Santa letter templates",
          aspect: "wide",
        },
      ]),
    )
    const paper = documentChildren.find((node) => node.props?.className?.includes("repopress-preview-paper--letter"))
    expect(paper).toMatchObject({
      kind: "element",
      tag: "article",
      children: [
        {
          kind: "element",
          tag: "div",
          children: [
            expect.objectContaining({
              kind: "element",
              tag: "p",
              props: { className: "repopress-preview-paper-title" },
            }),
            expect.anything(),
          ],
        },
        expect.anything(),
        expect.anything(),
      ],
    })
    expect(MERRY_ADAPTER_SOURCE).toContain('headingLevel="none"')
    expect(MERRY_ADAPTER_SOURCE).not.toContain("templateText ?")
    expect(output).not.toContain('"href"')
    expect(output).toContain('"kind":"action"')
    expect(output).toContain('"destination":"/letters-to-santa?utm_source=repopress_preview"')
  })

  it("retains all five Generic placeholders when compatible execution is unavailable", () => {
    const model = buildGenericRenderModel(MERRY_DOCUMENT_SOURCE)
    const output = JSON.stringify(model)
    for (const component of ["CoverImage", "InfoBox", "Checklist", "LetterPaper", "CTABox"]) {
      expect(output).toContain(component)
    }
  })
})

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
      "North Pole Express stamp",
      "Send your letter to Santa",
      "Start writing",
    ]) {
      expect(output).toContain(text)
    }
    expect(output).not.toMatch(/href|src|utm_source|template=preview/u)
  })

  it("retains all five Generic placeholders when compatible execution is unavailable", () => {
    const model = buildGenericRenderModel(MERRY_DOCUMENT_SOURCE)
    const output = JSON.stringify(model)
    for (const component of ["CoverImage", "InfoBox", "Checklist", "LetterPaper", "CTABox"]) {
      expect(output).toContain(component)
    }
  })
})

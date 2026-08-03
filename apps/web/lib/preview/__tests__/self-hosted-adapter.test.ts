// @vitest-environment node
import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { prepareCompatibleWorkerJob } from "@/components/preview-sandbox/compatible-worker"
import { assertCompatibleAdapterImports } from "../adapter-import-policy"

describe("RepoPress self-hosted preview adapter", () => {
  it("uses only the portable preview capability surface", async () => {
    const source = await readFile(path.resolve(process.cwd(), "../../.repopress/mdx-preview.tsx"), "utf8")

    expect(() => assertCompatibleAdapterImports(source, ".repopress/mdx-preview.tsx")).not.toThrow()
    expect(source).toContain('from "@repopress/preview"')
    expect(source).not.toContain('from "@/')
    expect(source).not.toContain("allowImports")
  })

  it("compiles the self-hosted image, callout, and video bindings for compatible execution", async () => {
    const source = await readFile(path.resolve(process.cwd(), "../../.repopress/mdx-preview.tsx"), "utf8")

    const job = await prepareCompatibleWorkerJob({
      artifactId: "repopress-self-hosted",
      documentSource: `
        <DocsImage src="/architecture.png" alt="Architecture" caption="System overview" />
        <Callout type="warning">Check the deployment settings.</Callout>
        <DocsVideo src="https://video.example/demo" title="Studio demo" />
      `,
      adapter: {
        entryPath: ".repopress/mdx-preview.tsx",
        sources: { ".repopress/mdx-preview.tsx": source },
      },
    })

    expect(job.adapterCode).toContain("PreviewImage")
    expect(job.mdxCode).toContain("DocsVideo")
  })
})

import { describe, expect, it } from "vitest"
import { buildMergedContext } from "@/lib/repopress/preview-context"
import { compileMdx } from "../compileMdx"

describe("compileMdx", () => {
  it("rewrites missing component checks to assign placeholder components", async () => {
    const source = `
<DynamicImage imageName="url-structure-tld.png" alt="Domain URL Structure TLD" />

<TickPoint>
Hello
</TickPoint>
`

    const result = await compileMdx(source, {})

    expect(result.error).toBeUndefined()
    expect(result.code).toBeDefined()

    const code = result.code as string
    expect(code).toContain("let _components =")
    expect(code).toContain('if (!DynamicImage) DynamicImage = _mdxConfig._missingMdxReference("DynamicImage", true);')
    expect(code).toContain('if (!TickPoint) TickPoint = _mdxConfig._missingMdxReference("TickPoint", true);')
    expect(code).not.toContain('if (!DynamicImage) _missingMdxReference("DynamicImage", true);')
  })

  it("supports common native runtime imports when they are provided by the preview context", async () => {
    const source = `
import Link from "next/link"
import Image from "next/image"
import { Callout } from "fumadocs-ui/mdx"

<Link href="/docs">Docs</Link>
<Image src="/cover.png" alt="Cover" />
<Callout>Heads up</Callout>
`

    const merged = buildMergedContext(null, {})
    const allowedImports = Object.fromEntries(
      Object.entries(merged.allowImports || {}).map(([moduleName, exports]) => [moduleName, Object.keys(exports)]),
    )

    const result = await compileMdx(source, allowedImports)

    expect(result.error).toBeUndefined()
    expect(result.imports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "next/link", imported: "default", local: "Link" }),
        expect.objectContaining({ source: "next/image", imported: "default", local: "Image" }),
        expect.objectContaining({ source: "fumadocs-ui/mdx", imported: "Callout", local: "Callout" }),
      ]),
    )
  })

  it("strips unsupported imports and reports diagnostics instead of failing compilation", async () => {
    const source = `
import FancyCard from "@repo/ui/fancy-card"

<FancyCard>Still visible</FancyCard>
`

    const result = await compileMdx(source, {})

    expect(result.error).toBeUndefined()
    expect(result.code).toBeDefined()
    expect(result.imports).toEqual([])
    expect(result.diagnostics).toEqual([
      "Import from '@repo/ui/fancy-card' is not available in the preview sandbox and was skipped.",
    ])
    expect(result.code).toContain('FancyCard = _mdxConfig._missingMdxReference("FancyCard", true)')
  })
})

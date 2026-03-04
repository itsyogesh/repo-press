import { describe, expect, it } from "vitest"
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
})

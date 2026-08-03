import { describe, expect, it } from "vitest"
import { nextConfig } from "../../next.config.mjs"

describe("canonical documentation redirects", () => {
  it("permanently redirects the docs root and preserves nested paths", async () => {
    const redirects = await nextConfig.redirects?.()

    expect(redirects).toEqual(
      expect.arrayContaining([
        {
          source: "/docs",
          destination: "https://docs.repopress.org",
          permanent: true,
        },
        {
          source: "/docs/:path*",
          destination: "https://docs.repopress.org/:path*",
          permanent: true,
        },
      ]),
    )
  })
})

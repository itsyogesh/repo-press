import { describe, expect, it } from "vitest"
import sitemap from "../../app/sitemap"
import { nextConfig } from "../../next.config.mjs"

describe("canonical documentation redirects", () => {
  it("maps legacy documentation slugs before the path-preserving fallback", async () => {
    const redirects = await nextConfig.redirects?.()

    expect(redirects).toEqual([
      {
        source: "/docs",
        destination: "https://docs.repopress.org",
        permanent: true,
      },
      {
        source: "/docs/getting-started",
        destination: "https://docs.repopress.org/guides/getting-started",
        permanent: true,
      },
      {
        source: "/docs/how-it-works",
        destination: "https://docs.repopress.org/guides/how-it-works",
        permanent: true,
      },
      {
        source: "/docs/connecting-a-repo",
        destination: "https://docs.repopress.org/guides/connect-repository",
        permanent: true,
      },
      {
        source: "/docs/studio-editor",
        destination: "https://docs.repopress.org/studio/editor",
        permanent: true,
      },
      {
        source: "/docs/:path*",
        destination: "https://docs.repopress.org/:path*",
        permanent: true,
      },
    ])
  })

  it("leaves documentation URLs to the Blume-owned sitemap", () => {
    expect(sitemap().map(({ url }) => url)).not.toContainEqual(expect.stringMatching(/\/docs(?:\/|$)/))
  })
})

import type * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
}))

vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <div data-theme-provider="true">{children}</div>,
}))

vi.mock("@convex-dev/better-auth/react", () => ({
  ConvexBetterAuthProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-auth-provider="true">{children}</div>
  ),
}))

vi.mock("convex/react", () => ({
  ConvexReactClient: class FakeConvexReactClient {},
}))

vi.mock("@/lib/auth-client", () => ({
  authClient: {},
}))

const originalConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL

async function renderProviders(pathname: string) {
  vi.resetModules()
  process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud"
  usePathnameMock.mockReturnValue(pathname)
  const { Providers } = await import("@/components/providers")

  return renderToStaticMarkup(
    <Providers>
      <div>child</div>
    </Providers>,
  )
}

describe("Providers", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud"
    usePathnameMock.mockReset()
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_CONVEX_URL = originalConvexUrl
  })

  it("does not mount the auth provider on public marketing routes", async () => {
    const html = await renderProviders("/")

    expect(html).not.toContain("data-auth-provider")
    expect(html).toContain("data-theme-provider")
  })

  it("mounts the auth provider on dashboard routes", async () => {
    const html = await renderProviders("/dashboard/acme/docs")

    expect(html).toContain("data-auth-provider")
  })
})

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

  it("creates a client only when dashboard routes need one", async () => {
    const { getOrCreateConvexClient } = await import("@/components/providers")
    const existingClient = { close: vi.fn() }
    const createClient = vi.fn(() => ({ close: vi.fn() }))

    expect(getOrCreateConvexClient(existingClient, false, "https://example.convex.cloud", createClient)).toBe(
      existingClient,
    )
    expect(getOrCreateConvexClient(null, true, "https://example.convex.cloud", createClient)).not.toBeNull()
    expect(createClient).toHaveBeenCalledTimes(1)
  })

  it("closes an existing client when releasing it", async () => {
    const { closeConvexClient } = await import("@/components/providers")
    const client = { close: vi.fn() }

    expect(closeConvexClient(client)).toBeNull()
    expect(client.close).toHaveBeenCalledTimes(1)
  })
})

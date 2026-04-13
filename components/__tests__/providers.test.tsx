import type * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

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

async function renderRootProviders() {
  vi.resetModules()
  const { Providers } = await import("@/components/providers")

  return renderToStaticMarkup(
    <Providers>
      <div>child</div>
    </Providers>,
  )
}

async function renderDashboardProviders(url = "https://example.convex.cloud") {
  vi.resetModules()
  process.env.NEXT_PUBLIC_CONVEX_URL = url
  const { DashboardProviders } = await import("@/components/dashboard/dashboard-providers")

  return renderToStaticMarkup(
    <DashboardProviders>
      <div>child</div>
    </DashboardProviders>,
  )
}

describe("Providers", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud"
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_CONVEX_URL = originalConvexUrl
  })

  it("root providers always render the theme wrapper", async () => {
    const html = await renderRootProviders()

    expect(html).toContain("data-theme-provider")
    expect(html).not.toContain("data-auth-provider")
  })

  it("dashboard providers mount the auth provider when Convex is configured", async () => {
    const html = await renderDashboardProviders()

    expect(html).toContain("data-auth-provider")
  })

  it("dashboard providers fall back to children when Convex is unavailable", async () => {
    const html = await renderDashboardProviders("")

    expect(html).toContain("child")
    expect(html).not.toContain("data-auth-provider")
  })

  it("creates a dashboard client only when a Convex URL exists", async () => {
    const { createDashboardConvexClient } = await import("@/components/dashboard/dashboard-providers")
    const createClient = vi.fn(() => ({ close: vi.fn() }))

    expect(createDashboardConvexClient(undefined, createClient)).toBeNull()
    expect(createDashboardConvexClient("https://example.convex.cloud", createClient)).not.toBeNull()
    expect(createClient).toHaveBeenCalledTimes(1)
  })

  it("closes a dashboard client when releasing it", async () => {
    const { closeDashboardConvexClient } = await import("@/components/dashboard/dashboard-providers")
    const client = { close: vi.fn() }

    expect(closeDashboardConvexClient(client)).toBeNull()
    expect(client.close).toHaveBeenCalledTimes(1)
  })
})

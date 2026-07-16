import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

let pathname = "/"

vi.mock("next/navigation", () => ({ usePathname: () => pathname }))
vi.mock("next/font/google", () => ({ Geist: () => ({}), Geist_Mono: () => ({}) }))
vi.mock("@/components/providers", () => ({
  Providers: ({ children }: { children: ReactNode }) => <div data-testid="theme-provider">{children}</div>,
}))
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => <div data-testid="toaster" /> }))
vi.mock("@/components/cookie-consent", () => ({
  CookieConsent: () => {
    window.localStorage.getItem("cookie-consent")
    return <div data-testid="cookie-consent" />
  },
}))
vi.mock("@/components/analytics-wrapper", () => ({
  AnalyticsWrapper: () => {
    window.localStorage.getItem("cookie-consent")
    return <div data-testid="analytics" />
  },
}))

import RootLayout from "@/app/layout"

afterEach(() => {
  pathname = "/"
  vi.restoreAllMocks()
})

describe("RootChrome route boundary", () => {
  it("renders the exact sandbox route as plain children without app chrome or storage access", () => {
    pathname = "/preview/sandbox"
    const storage = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Opaque origins cannot access storage", "SecurityError")
    })

    let html = ""
    expect(() => {
      html = renderToStaticMarkup(<RootLayout>isolated shell</RootLayout>)
    }).not.toThrow()
    expect(html).toContain("isolated shell")
    expect(html).not.toContain('data-testid="theme-provider"')
    expect(html).not.toContain('data-testid="toaster"')
    expect(html).not.toContain('data-testid="cookie-consent"')
    expect(html).not.toContain('data-testid="analytics"')
    expect(storage).not.toHaveBeenCalled()
  })

  it("keeps normal app chrome for a path that merely shares the sandbox prefix", () => {
    pathname = "/preview/sandboxx"

    const html = renderToStaticMarkup(<RootLayout>normal page</RootLayout>)

    expect(html).toContain('data-testid="theme-provider"')
    expect(html).toContain('data-testid="toaster"')
    expect(html).toContain('data-testid="cookie-consent"')
    expect(html).toContain('data-testid="analytics"')
  })
})

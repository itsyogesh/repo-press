import type * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children: React.ReactNode }) => <button {...props}>{children}</button>,
}))

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div data-slot="sheet">{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div data-slot="sheet-content">{children}</div>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => <div data-slot="sheet-trigger">{children}</div>,
}))

import Footer from "../footer"
import Navbar from "../navbar"

describe("landing navigation links", () => {
  it("routes shared Features links back to the homepage section", () => {
    const navbarHtml = renderToStaticMarkup(<Navbar />)
    const footerHtml = renderToStaticMarkup(<Footer />)

    expect(navbarHtml).toContain('href="/#features"')
    expect(footerHtml).toContain('href="/#features"')
    expect(navbarHtml).not.toContain('href="#features"')
    expect(footerHtml).not.toContain('href="#features"')
  })
})

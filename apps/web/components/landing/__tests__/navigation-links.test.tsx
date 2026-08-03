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
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div data-slot="sheet-header">{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
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

  it("keeps the landing demo discoverable from the navbar", () => {
    const navbarHtml = renderToStaticMarkup(<Navbar />)

    expect(navbarHtml).toContain('href="/#demo"')
    expect(navbarHtml).not.toContain('href="#demo"')
  })

  it("includes an accessible title and description for the mobile navigation sheet", () => {
    const navbarHtml = renderToStaticMarkup(<Navbar />)

    expect(navbarHtml).toContain("Navigation menu")
    expect(navbarHtml).toContain("Browse RepoPress pages and sign in options.")
  })
})

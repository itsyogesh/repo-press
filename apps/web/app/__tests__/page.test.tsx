import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/landing/navbar", () => ({
  default: () => <div data-slot="navbar" />,
}))

vi.mock("@/components/landing/hero", () => ({
  default: () => <section data-slot="hero" />,
}))

vi.mock("@/components/landing/video-preview", () => ({
  VideoPreview: () => <section data-slot="video-preview" />,
}))

vi.mock("@/components/landing/how-it-works", () => ({
  default: () => <section data-slot="how-it-works" />,
}))

vi.mock("@/components/landing/feature-grid", () => ({
  default: () => <section data-slot="feature-grid" />,
}))

vi.mock("@/components/landing/comparison", () => ({
  default: () => <section data-slot="comparison" />,
}))

vi.mock("@/components/landing/faq", () => ({
  default: () => <section data-slot="faq" />,
}))

vi.mock("@/components/landing/pricing", () => ({
  default: () => <section data-slot="pricing" />,
}))

vi.mock("@/components/landing/cta", () => ({
  default: () => <section data-slot="cta" />,
}))

vi.mock("@/components/landing/footer", () => ({
  default: () => <div data-slot="footer" />,
}))

import LandingPage from "../page"

describe("LandingPage", () => {
  it("renders the video preview between the hero and how-it-works sections", () => {
    const html = renderToStaticMarkup(<LandingPage />)

    expect(html).toContain('data-slot="video-preview"')
    expect(html.indexOf('data-slot="hero"')).toBeLessThan(html.indexOf('data-slot="video-preview"'))
    expect(html.indexOf('data-slot="video-preview"')).toBeLessThan(html.indexOf('data-slot="how-it-works"'))
  })
})

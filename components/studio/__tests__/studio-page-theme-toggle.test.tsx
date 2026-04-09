import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "dark",
    setTheme: vi.fn(),
  }),
}))

import { StudioPageThemeToggle } from "@/components/studio/studio-page-theme-toggle"

describe("StudioPageThemeToggle", () => {
  it("renders a hydration-safe placeholder before the theme is mounted", () => {
    const html = renderToStaticMarkup(<StudioPageThemeToggle />)

    expect(html).toContain('disabled=""')
    expect(html).not.toContain("lucide-sun")
    expect(html).not.toContain("lucide-moon")
  })
})

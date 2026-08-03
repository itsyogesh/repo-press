import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { PreviewResult } from "@/lib/preview/contracts"
import { buildGenericRenderModel } from "@/lib/preview/generic-render-model"
import { Preview } from "../preview"

function genericPreviewResult(): PreviewResult {
  return {
    fidelity: "generic",
    sessionId: "generic-session",
    snapshotVersion: 1,
    status: "ready",
    target: {
      kind: "safe-fallback",
      renderModel: buildGenericRenderModel("# Article heading\n\nArticle body."),
    },
    diagnostics: [],
    downgradeReasons: [],
    cache: { hit: false },
  }
}

afterEach(cleanup)

describe("Studio edge-to-edge preview", () => {
  it("uses the whole desktop panel without a duplicate document card", () => {
    const { container } = render(
      <Preview
        previewResult={genericPreviewResult()}
        frontmatter={{ title: "Metadata title", description: "Metadata description" }}
        filePath="articles/example/page.mdx"
      />,
    )

    const surface = container.querySelector('[data-studio-preview-surface="edge-to-edge"]')
    expect(surface).not.toBeNull()
    expect(surface).toHaveClass("h-full", "w-full")
    expect(surface).not.toHaveClass("max-w-[980px]")
    expect(surface?.closest("article")).toBeNull()
    expect(container.innerHTML).not.toContain("max-w-[980px]")
    expect(screen.queryByText("Published view")).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Metadata title" })).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Article heading" })).toBeInTheDocument()
  })

  it("keeps tablet and mobile device frames around the same edge-to-edge surface", () => {
    const { container } = render(<Preview previewResult={genericPreviewResult()} frontmatter={{}} />)

    fireEvent.click(screen.getByTitle("Tablet (768px)"))
    expect(container.querySelector('[style*="width: 768px"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-studio-preview-surface="edge-to-edge"]')).toHaveLength(1)

    fireEvent.click(screen.getByTitle("Mobile (375px)"))
    expect(container.querySelector('[style*="width: 375px"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-studio-preview-surface="edge-to-edge"]')).toHaveLength(1)
  })

  it("reuses the edge-to-edge surface in full-screen preview", () => {
    const { container } = render(<Preview previewResult={genericPreviewResult()} frontmatter={{}} />)

    fireEvent.click(screen.getByTitle("Full-screen preview"))

    expect(container.querySelectorAll('[data-studio-preview-surface="edge-to-edge"]')).toHaveLength(1)
    expect(screen.getByTitle("Exit full-screen (Esc)")).toBeInTheDocument()
    expect(screen.queryByText("Published view")).not.toBeInTheDocument()
  })
})

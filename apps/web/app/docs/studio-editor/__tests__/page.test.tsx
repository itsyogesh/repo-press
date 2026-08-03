import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import StudioEditorPage from "../page"

describe("Studio editor preview documentation", () => {
  it("documents explicit fidelity and downgrade behavior without promising exact output", () => {
    const markup = renderToStaticMarkup(<StudioEditorPage />)

    expect(markup).toContain("Generic")
    expect(markup).toContain("Compatible")
    expect(markup).toContain("Native")
    expect(markup).toMatch(/downgrade/i)
    expect(markup).not.toMatch(/exactly how your content will look/i)
  })
})

import { describe, expect, it } from "vitest"
import { buildHistoryHref } from "../history-link"

describe("buildHistoryHref", () => {
  it("includes branch and projectId when both are present", () => {
    expect(
      buildHistoryHref({
        owner: "acme",
        repo: "docs-site",
        branch: "main",
        projectId: "project_123",
      }),
    ).toBe("/dashboard/acme/docs-site/history?branch=main&projectId=project_123")
  })

  it("omits empty query params", () => {
    expect(
      buildHistoryHref({
        owner: "acme",
        repo: "docs-site",
      }),
    ).toBe("/dashboard/acme/docs-site/history")
  })
})

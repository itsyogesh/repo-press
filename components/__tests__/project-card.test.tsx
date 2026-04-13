import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { formatDashboardDate } from "@/lib/dashboard-date"

vi.mock("next/link", () => ({
  default: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

import {
  getProjectContentRootLabel,
  getProjectFrameworkLabel,
  getProjectSourceLabel,
  ProjectCard,
} from "@/components/project-card"

describe("ProjectCard", () => {
  it("derives readable labels for stacked card rows", () => {
    expect(getProjectContentRootLabel("content/docs")).toBe("docs")
    expect(getProjectContentRootLabel("")).toBe("Repo root")

    expect(getProjectFrameworkLabel({ detectedFramework: "detected", contentType: "docs" })).toBe("docs")
    expect(getProjectFrameworkLabel({ detectedFramework: "contentlayer", contentType: "blog" })).toBe("contentlayer")

    expect(getProjectSourceLabel({ frameworkSource: "config", detectedFramework: "contentlayer" })).toBe("Config")
    expect(getProjectSourceLabel({ frameworkSource: undefined, detectedFramework: "contentlayer" })).toBe("Detected")
    expect(getProjectSourceLabel({ frameworkSource: undefined, detectedFramework: "detected" })).toBe("Manual")

    expect(formatDashboardDate(Date.parse("2026-04-08T10:20:30.000Z"))).toBe("Apr 8, 2026")
    expect(formatDashboardDate(0)).toBe("N/A")
  })

  it("renders stacked project details without the overflowing badge", () => {
    const html = renderToStaticMarkup(
      <ProjectCard
        project={{
          _id: "project_1",
          name: "repo-press-docs",
          repoOwner: "droidsize",
          repoName: "collective.domains",
          branch: "main",
          contentRoot: "content/docs",
          detectedFramework: "detected",
          contentType: "docs",
          frameworkSource: undefined,
          createdAt: Date.parse("2026-04-01T00:00:00.000Z"),
          updatedAt: Date.parse("2026-04-08T10:20:30.000Z"),
        }}
      />,
    )

    expect(html).toContain("repo-press-docs")
    expect(html).toContain("droidsize/collective.domains")
    expect(html).toContain('title="content/docs"')
    expect(html).toContain(">main<")
    expect(html).toContain(">docs<")
    expect(html).toContain(">Manual<")
    expect(html).toContain("Updated")
    expect(html).toContain("Apr 8, 2026")
    expect(html).not.toContain('data-slot="badge"')
  })
})

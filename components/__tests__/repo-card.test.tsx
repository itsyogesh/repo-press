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

import { getRepoConnectionLabel, RepoCard } from "@/components/repo-card"

describe("RepoCard", () => {
  it("derives readable labels for the stacked repo card", () => {
    expect(getRepoConnectionLabel(3)).toBe("Connected")
    expect(getRepoConnectionLabel(0)).toBe("Set up")

    expect(formatDashboardDate("2026-04-09T10:20:30.000Z")).toBe("Apr 9, 2026")
    expect(formatDashboardDate(undefined)).toBe("N/A")
  })

  it("renders repo identity and metadata in wrap-safe rows", () => {
    const html = renderToStaticMarkup(
      <RepoCard
        repo={{
          id: 1,
          name: "collective.domains",
          full_name: "droidsize/collective.domains",
          owner: { login: "droidsize", avatar_url: "", html_url: "" },
          private: true,
          description: "The web client for collective.domains",
          html_url: "https://github.com/droidsize/collective.domains",
          default_branch: "main",
          updated_at: "2026-04-09T10:20:30.000Z",
          stargazers_count: 303,
          forks_count: 3,
          watchers_count: 303,
        }}
        connectedProjectCount={3}
      />,
    )

    expect(html).toContain("collective.domains")
    expect(html).toContain("droidsize/collective.domains")
    expect(html).toContain(">Private<")
    expect(html).toContain(">Connected<")
    expect(html).toContain(">3 projects<")
    expect(html).toContain("Updated")
    expect(html).toContain("Apr 9, 2026")
    expect(html).toContain("flex-wrap")
    expect(html).not.toContain("truncate")
    expect(html).not.toContain("line-clamp-1")
  })
})

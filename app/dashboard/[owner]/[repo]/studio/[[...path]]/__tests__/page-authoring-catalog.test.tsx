import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { StudioLayout } from "@/components/studio/studio-layout"
import { getGitHubToken } from "@/lib/auth-server"
import { createGitHubClient } from "@/lib/github"
import { resolveRepoRole } from "@/lib/github-permissions"
import { resolveProjectAccessRole } from "@/lib/project-access-role"
import { mintProjectAccessToken } from "@/lib/project-access-token"
import { loadProjectLockAuthoringMetadata } from "@/lib/repopress/project-lock-snapshot"
import { createServerQueryContext, resolveActingUserId } from "@/lib/server-context"
import StudioPage from "../page"

vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("@/components/studio/studio-layout", () => ({ StudioLayout: vi.fn(() => <div data-testid="studio" />) }))
vi.mock("@/components/studio/studio-page-theme-toggle", () => ({ StudioPageThemeToggle: () => null }))
vi.mock("@/lib/auth-server", () => ({ getGitHubToken: vi.fn() }))
vi.mock("@/lib/github", () => ({ createGitHubClient: vi.fn(), getFile: vi.fn() }))
vi.mock("@/lib/github-permissions", () => ({ resolveRepoRole: vi.fn() }))
vi.mock("@/lib/project-access-role", () => ({ resolveProjectAccessRole: vi.fn() }))
vi.mock("@/lib/project-access-token", () => ({ mintProjectAccessToken: vi.fn() }))
vi.mock("@/lib/repopress/project-lock-snapshot", () => ({ loadProjectLockAuthoringMetadata: vi.fn() }))
vi.mock("@/lib/server-context", () => ({ createServerQueryContext: vi.fn(), resolveActingUserId: vi.fn() }))

const project = {
  _id: "project-1",
  userId: "user-1",
  repoOwner: "acme",
  repoName: "docs",
  branch: "release",
  contentRoot: "apps/docs/content",
  detectedFramework: "next",
}

describe("authenticated Studio registry authoring", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getGitHubToken).mockResolvedValue("github-token")
    vi.mocked(resolveActingUserId).mockResolvedValue("user-1" as never)
    vi.mocked(resolveRepoRole).mockResolvedValue({
      role: "owner",
      defaultBranch: "release",
      defaultBranchInferred: false,
    })
    vi.mocked(resolveProjectAccessRole).mockReturnValue("owner")
    vi.mocked(mintProjectAccessToken).mockResolvedValue("project-access-token")
    vi.mocked(createGitHubClient).mockReturnValue({
      users: { getAuthenticated: vi.fn().mockResolvedValue({ data: { login: "octocat" } }) },
    } as never)
  })

  it("passes only exact-project lock authoring metadata into Studio", async () => {
    const convex = {
      query: vi.fn().mockResolvedValueOnce(project).mockResolvedValueOnce([project]),
      mutation: vi.fn().mockResolvedValue(null),
    }
    vi.mocked(createServerQueryContext).mockResolvedValue({ convex, serverQueryToken: "server-token" } as never)
    const registryAuthoringMetadata = Object.freeze({
      Callout: Object.freeze({
        logicalId: "@repopress/callout",
        mdxName: "Callout",
        displayName: "Callout",
        exportName: "Callout",
        runtime: "client",
        schemaStatus: "complete",
        props: Object.freeze([]),
        slots: Object.freeze([]),
        assets: Object.freeze([]),
        frameworks: Object.freeze(["next"]),
        previewFixtures: Object.freeze([]),
        provenance: Object.freeze({ source: "registry" }),
        kind: "flow",
      }),
    })
    vi.mocked(loadProjectLockAuthoringMetadata).mockResolvedValue({
      baseSha: "a".repeat(40),
      lockPath: "apps/docs/repopress.lock.json",
      metadata: registryAuthoringMetadata as never,
      diagnostics: Object.freeze([]),
    })

    const page = await StudioPage({
      params: Promise.resolve({ owner: "acme", repo: "docs" }),
      searchParams: Promise.resolve({ branch: "release", projectId: "project-1" }),
    })
    render(page)

    expect(loadProjectLockAuthoringMetadata).toHaveBeenCalledWith({ accessToken: "github-token", project })
    expect(StudioLayout).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "acme",
        repo: "docs",
        branch: "release",
        registryAuthoringMetadata,
        registryAuthoringDiagnostics: [],
      }),
      undefined,
    )
  })
})

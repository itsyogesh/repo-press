import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { StudioLayout } from "@/components/studio/studio-layout"
import { getGitHubToken } from "@/lib/auth-server"
import { createGitHubClient, getBranchHeadSha, getFile } from "@/lib/github"
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
vi.mock("@/lib/github", () => ({ createGitHubClient: vi.fn(), getBranchHeadSha: vi.fn(), getFile: vi.fn() }))
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
const BASE_SHA = "a".repeat(40)

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
    vi.mocked(getBranchHeadSha).mockResolvedValue(BASE_SHA)
    vi.mocked(getFile).mockResolvedValue({
      path: "apps/docs/content/guide.mdx",
      name: "guide.mdx",
      content: "# Captured base",
      sha: "f".repeat(40),
    })
    const convex = {
      query: vi.fn().mockResolvedValueOnce(project).mockResolvedValueOnce([project]),
      mutation: vi.fn().mockResolvedValue(null),
    }
    vi.mocked(createServerQueryContext).mockResolvedValue({ convex, serverQueryToken: "server-token" } as never)
    vi.mocked(createGitHubClient).mockReturnValue({
      users: { getAuthenticated: vi.fn().mockResolvedValue({ data: { login: "octocat" } }) },
    } as never)
  })

  it("passes only exact-project lock authoring metadata into Studio", async () => {
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
      baseSha: BASE_SHA,
      lockPath: "apps/docs/repopress.lock.json",
      metadata: registryAuthoringMetadata as never,
      diagnostics: Object.freeze([]),
    })

    const page = await StudioPage({
      params: Promise.resolve({ owner: "acme", repo: "docs" }),
      searchParams: Promise.resolve({
        branch: "release",
        projectId: "project-1",
        file: "apps/docs/content/guide.mdx",
      }),
    })
    render(page)

    expect(getBranchHeadSha).toHaveBeenCalledOnce()
    expect(getBranchHeadSha).toHaveBeenCalledWith("github-token", "acme", "docs", "release")
    expect(loadProjectLockAuthoringMetadata).toHaveBeenCalledWith({
      accessToken: "github-token",
      project,
      baseSha: BASE_SHA,
    })
    expect(getFile).toHaveBeenCalledWith("github-token", "acme", "docs", "apps/docs/content/guide.mdx", BASE_SHA)
    expect(StudioLayout).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "acme",
        repo: "docs",
        branch: "release",
        baseCommitSha: BASE_SHA,
        registryAuthoringMetadata,
        registryAuthoringDiagnostics: [],
      }),
      undefined,
    )
  })

  it("keeps the captured base SHA when the optional lock snapshot cannot be loaded", async () => {
    vi.mocked(loadProjectLockAuthoringMetadata).mockRejectedValue(new Error("lock unavailable"))

    const page = await StudioPage({
      params: Promise.resolve({ owner: "acme", repo: "docs" }),
      searchParams: Promise.resolve({
        branch: "release",
        projectId: "project-1",
        file: "apps/docs/content/guide.mdx",
      }),
    })
    render(page)

    expect(getBranchHeadSha).toHaveBeenCalledOnce()
    expect(getFile).toHaveBeenCalledWith("github-token", "acme", "docs", "apps/docs/content/guide.mdx", BASE_SHA)
    expect(StudioLayout).toHaveBeenCalledWith(
      expect.objectContaining({
        baseCommitSha: BASE_SHA,
        registryAuthoringDiagnostics: ["Installed registry metadata could not be loaded."],
      }),
      undefined,
    )
  })

  it("fails closed before content reads when the branch head cannot be resolved", async () => {
    vi.mocked(getBranchHeadSha).mockRejectedValue(new Error("head unavailable"))

    await expect(
      StudioPage({
        params: Promise.resolve({ owner: "acme", repo: "docs" }),
        searchParams: Promise.resolve({
          branch: "release",
          projectId: "project-1",
          file: "apps/docs/content/guide.mdx",
        }),
      }),
    ).rejects.toThrow("head unavailable")

    expect(loadProjectLockAuthoringMetadata).not.toHaveBeenCalled()
    expect(getFile).not.toHaveBeenCalled()
    expect(StudioLayout).not.toHaveBeenCalled()
  })
})

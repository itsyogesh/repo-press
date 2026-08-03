import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RepoProjectHub } from "@/components/repo-project-hub"
import { getGitHubToken } from "@/lib/auth-server"
import { resolveRepoRole } from "@/lib/github-permissions"
import { mintProjectAccessToken } from "@/lib/project-access-token"
import { fetchRepoConfig } from "@/lib/repopress/config"
import { createServerQueryContext, resolveActingUserId } from "@/lib/server-context"
import RepoPage from "../page"

vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("@/components/repo-breadcrumb", () => ({ RepoBreadcrumb: () => null }))
vi.mock("@/components/repo-project-hub", () => ({ RepoProjectHub: vi.fn(() => null) }))
vi.mock("@/lib/auth-server", () => ({ getGitHubToken: vi.fn() }))
vi.mock("@/lib/github-permissions", () => ({ resolveRepoRole: vi.fn() }))
vi.mock("@/lib/project-access-token", () => ({ mintProjectAccessToken: vi.fn() }))
vi.mock("@/lib/repopress/config", () => ({ fetchRepoConfig: vi.fn() }))
vi.mock("@/lib/server-context", () => ({ createServerQueryContext: vi.fn(), resolveActingUserId: vi.fn() }))
vi.mock("@/lib/sync-projects", () => ({ syncProjectsServerSide: vi.fn() }))

const projects = [
  {
    _id: "project-1",
    userId: "user-1",
    name: "Docs",
    repoOwner: "acme",
    repoName: "docs",
    branch: "main",
    contentRoot: "content/docs",
    detectedFramework: "next-mdx",
    contentType: "docs",
    createdAt: 1,
    updatedAt: 2,
  },
  {
    _id: "project-2",
    userId: "user-1",
    name: "Blog",
    repoOwner: "acme",
    repoName: "docs",
    branch: "release",
    contentRoot: "content/blog",
    detectedFramework: "next-mdx",
    contentType: "blog",
    createdAt: 3,
    updatedAt: 4,
  },
]

describe("repository hub project access", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getGitHubToken).mockResolvedValue("github-token")
    vi.mocked(resolveActingUserId).mockResolvedValue("user-1" as never)
    vi.mocked(resolveRepoRole).mockResolvedValue({
      role: "owner",
      defaultBranch: "main",
      defaultBranchInferred: false,
    })
    vi.mocked(fetchRepoConfig).mockResolvedValue({ config: null, sha: null, error: null, errorType: null })
    vi.mocked(createServerQueryContext).mockResolvedValue({
      convex: { query: vi.fn().mockResolvedValue(projects) },
      serverQueryToken: "server-token",
    } as never)
    vi.mocked(mintProjectAccessToken).mockImplementation(async ({ projectId }) => `access-${projectId}`)
  })

  it("mints and maps an access token for every listed project", async () => {
    render(await RepoPage({ params: Promise.resolve({ owner: "acme", repo: "docs" }) }))

    expect(mintProjectAccessToken).toHaveBeenCalledTimes(2)
    expect(mintProjectAccessToken).toHaveBeenNthCalledWith(1, {
      projectId: "project-1",
      userId: "user-1",
      repoOwner: "acme",
      repoName: "docs",
      branch: "main",
      role: "owner",
    })
    expect(mintProjectAccessToken).toHaveBeenNthCalledWith(2, {
      projectId: "project-2",
      userId: "user-1",
      repoOwner: "acme",
      repoName: "docs",
      branch: "release",
      role: "owner",
    })
    expect(RepoProjectHub).toHaveBeenCalledWith(
      expect.objectContaining({
        projectAccessTokens: {
          "project-1": "access-project-1",
          "project-2": "access-project-2",
        },
      }),
      undefined,
    )
  })
})

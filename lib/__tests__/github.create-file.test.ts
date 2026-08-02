import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockOctokit } = vi.hoisted(() => ({
  mockOctokit: {
    repos: {
      createOrUpdateFileContents: vi.fn(),
      getContent: vi.fn(),
    },
    git: {
      getRef: vi.fn(),
      createRef: vi.fn(),
      updateRef: vi.fn(),
    },
  },
}))

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn(function OctokitMock() {
    return mockOctokit
  }),
}))

import { createFileContentIfAbsent } from "../github"

describe("createFileContentIfAbsent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOctokit.repos.createOrUpdateFileContents.mockResolvedValue({
      data: { content: { sha: "file-sha" }, commit: { sha: "commit-sha" } },
    })
  })

  it("uses one Contents create request without a SHA, preflight read, or ref mutation", async () => {
    await createFileContentIfAbsent(
      "token",
      "acme",
      "docs",
      "repopress.config.json",
      '{"version":1}',
      "chore: initialize RepoPress configuration",
      "main",
    )

    expect(mockOctokit.repos.createOrUpdateFileContents).toHaveBeenCalledTimes(1)
    const request = mockOctokit.repos.createOrUpdateFileContents.mock.calls[0][0]
    expect(request).toEqual({
      owner: "acme",
      repo: "docs",
      path: "repopress.config.json",
      message: "chore: initialize RepoPress configuration",
      content: Buffer.from('{"version":1}').toString("base64"),
      branch: "main",
    })
    expect(Object.hasOwn(request, "sha")).toBe(false)
    expect(mockOctokit.repos.getContent).not.toHaveBeenCalled()
    expect(mockOctokit.git.getRef).not.toHaveBeenCalled()
    expect(mockOctokit.git.createRef).not.toHaveBeenCalled()
    expect(mockOctokit.git.updateRef).not.toHaveBeenCalled()
  })

  it("propagates an existing-path conflict without retrying as an update", async () => {
    const conflict = Object.assign(new Error("already exists"), { status: 422 })
    mockOctokit.repos.createOrUpdateFileContents.mockRejectedValueOnce(conflict)

    await expect(
      createFileContentIfAbsent(
        "token",
        "acme",
        "docs",
        "repopress.config.json",
        '{"version":1}',
        "chore: initialize RepoPress configuration",
        "main",
      ),
    ).rejects.toBe(conflict)

    expect(mockOctokit.repos.createOrUpdateFileContents).toHaveBeenCalledTimes(1)
    expect(mockOctokit.repos.getContent).not.toHaveBeenCalled()
    expect(mockOctokit.git.getRef).not.toHaveBeenCalled()
    expect(mockOctokit.git.createRef).not.toHaveBeenCalled()
    expect(mockOctokit.git.updateRef).not.toHaveBeenCalled()
  })

  it("propagates a stale or missing branch error without creating or updating a ref", async () => {
    const staleBranch = Object.assign(new Error("branch does not exist"), { status: 409 })
    mockOctokit.repos.createOrUpdateFileContents.mockRejectedValueOnce(staleBranch)

    await expect(
      createFileContentIfAbsent(
        "token",
        "acme",
        "docs",
        "repopress.config.json",
        '{"version":1}',
        "chore: initialize RepoPress configuration",
        "stale-branch",
      ),
    ).rejects.toBe(staleBranch)

    expect(mockOctokit.repos.createOrUpdateFileContents).toHaveBeenCalledTimes(1)
    expect(mockOctokit.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({ branch: "stale-branch" }),
    )
    expect(mockOctokit.git.getRef).not.toHaveBeenCalled()
    expect(mockOctokit.git.createRef).not.toHaveBeenCalled()
    expect(mockOctokit.git.updateRef).not.toHaveBeenCalled()
  })

  it("lets the Contents API arbitrate concurrent creates and never rewrites the loser", async () => {
    const conflict = Object.assign(new Error("already exists"), { status: 422 })
    mockOctokit.repos.createOrUpdateFileContents
      .mockResolvedValueOnce({ data: { commit: { sha: "winner" } } })
      .mockRejectedValueOnce(conflict)

    const results = await Promise.allSettled([
      createFileContentIfAbsent(
        "token",
        "acme",
        "docs",
        "repopress.config.json",
        '{"version":1}',
        "chore: initialize RepoPress configuration",
        "main",
      ),
      createFileContentIfAbsent(
        "token",
        "acme",
        "docs",
        "repopress.config.json",
        '{"version":1}',
        "chore: initialize RepoPress configuration",
        "main",
      ),
    ])

    expect(results[0]).toMatchObject({ status: "fulfilled" })
    expect(results[1]).toMatchObject({ status: "rejected", reason: conflict })
    expect(mockOctokit.repos.createOrUpdateFileContents).toHaveBeenCalledTimes(2)
    for (const [request] of mockOctokit.repos.createOrUpdateFileContents.mock.calls) {
      expect(Object.hasOwn(request, "sha")).toBe(false)
    }
    expect(mockOctokit.repos.getContent).not.toHaveBeenCalled()
    expect(mockOctokit.git.getRef).not.toHaveBeenCalled()
    expect(mockOctokit.git.createRef).not.toHaveBeenCalled()
    expect(mockOctokit.git.updateRef).not.toHaveBeenCalled()
  })
})

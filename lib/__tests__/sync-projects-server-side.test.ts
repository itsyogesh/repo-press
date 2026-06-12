import { beforeEach, describe, expect, it, vi } from "vitest"

const { fetchRepoConfigMock, buildDetectionContextMock, detectFrameworkFromContextMock, mutationMock } = vi.hoisted(
  () => ({
    fetchRepoConfigMock: vi.fn(),
    buildDetectionContextMock: vi.fn(),
    detectFrameworkFromContextMock: vi.fn(),
    mutationMock: vi.fn(),
  }),
)

vi.mock("@/convex/_generated/api", () => ({
  api: {
    projects: {
      syncProjectsFromConfig: "projects.syncProjectsFromConfig",
    },
  },
}))

vi.mock("@/lib/repopress/config", () => ({
  fetchRepoConfig: fetchRepoConfigMock,
}))

vi.mock("@/lib/framework-adapters/registry", () => ({
  buildDetectionContext: buildDetectionContextMock,
  detectFrameworkFromContext: detectFrameworkFromContextMock,
}))

vi.mock("@/lib/server-context", () => ({
  createServerQueryContext: vi.fn(async () => ({
    convex: { mutation: mutationMock },
    serverQueryToken: "server-token",
  })),
  resolveActingUserId: vi.fn(),
}))

import { syncProjectsServerSide } from "../sync-projects"

describe("syncProjectsServerSide", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mutationMock.mockResolvedValue({ synced: [], created: ["project_1"], unchanged: [] })
  })

  it("resolves auto framework before deriving native runtime metadata defaults", async () => {
    fetchRepoConfigMock.mockResolvedValue({
      config: {
        version: 1,
        defaults: { branch: "main", framework: "auto" },
        projects: [
          {
            id: "blog",
            name: "Blog",
            contentRoot: "app/(main)/blog",
            framework: "auto",
            contentType: "blog",
          },
        ],
      },
    })
    buildDetectionContextMock.mockResolvedValue({
      readFile: async (filePath: string) => (filePath === "mdx-components.tsx" ? "// runtime" : null),
    })
    detectFrameworkFromContextMock.mockResolvedValue({ framework: "next-mdx" })

    await syncProjectsServerSide("token", "itsyogesh", "merry-magic-mail", "main", "user_1")

    expect(mutationMock).toHaveBeenCalledWith(
      "projects.syncProjectsFromConfig",
      expect.objectContaining({
        projects: [
          expect.objectContaining({
            framework: "next-mdx",
            resolvedRuntime: expect.objectContaining({
              strategy: "native",
              entryPath: "mdx-components.tsx",
              rootPath: "",
              metadataDefault: "metadata-export",
              extensions: [".md", ".mdx", ".markdown"],
            }),
          }),
        ],
      }),
    )
  })

  it("still syncs healthy projects when one project's detection throws", async () => {
    fetchRepoConfigMock.mockResolvedValue({
      config: {
        version: 1,
        defaults: { branch: "main", framework: "auto" },
        projects: [
          { id: "broken", name: "Broken", contentRoot: "broken/root", framework: "auto", contentType: "docs" },
          { id: "healthy", name: "Healthy", contentRoot: "healthy/root", framework: "hugo", contentType: "blog" },
        ],
      },
    })
    buildDetectionContextMock.mockImplementation(async (_t: string, _o: string, _r: string, _b: string, root: string) => {
      if (root === "broken/root") throw new Error("GitHub rate limit exceeded")
      return { readFile: async () => null }
    })
    detectFrameworkFromContextMock.mockResolvedValue({ framework: "next-mdx" })

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    await syncProjectsServerSide("token", "itsyogesh", "merry-magic-mail", "main", "user_1")

    expect(mutationMock).toHaveBeenCalledTimes(1)
    const payload = mutationMock.mock.calls[0][1]
    const broken = payload.projects.find((p: { configProjectId: string }) => p.configProjectId === "broken")
    const healthy = payload.projects.find((p: { configProjectId: string }) => p.configProjectId === "healthy")

    expect(broken).toBeDefined()
    expect(broken.resolvedRuntime).toBeUndefined()
    expect(broken.framework).toBe("custom")
    expect(healthy).toBeDefined()
    expect(healthy.framework).toBe("hugo")

    consoleSpy.mockRestore()
  })
})

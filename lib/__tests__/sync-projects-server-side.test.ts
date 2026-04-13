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
})

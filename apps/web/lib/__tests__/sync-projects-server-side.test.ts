import { beforeEach, describe, expect, it, vi } from "vitest"

const { fetchRepoConfigMock, mutationMock, createServerQueryContextMock } = vi.hoisted(() => ({
  fetchRepoConfigMock: vi.fn(),
  mutationMock: vi.fn(),
  createServerQueryContextMock: vi.fn(),
}))

vi.mock("@/convex/_generated/api", () => ({
  api: { projects: { syncProjectsFromConfig: "projects.syncProjectsFromConfig" } },
}))
vi.mock("@/lib/auth-server", () => ({ getGitHubToken: vi.fn() }))
vi.mock("@/lib/repopress/config", () => ({ fetchRepoConfig: fetchRepoConfigMock }))
vi.mock("@/lib/server-context", () => ({
  createServerQueryContext: createServerQueryContextMock,
  resolveActingUserId: vi.fn(),
}))

import { syncProjectsServerSide } from "@/lib/sync-projects"

describe("syncProjectsServerSide compatibility metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mutationMock.mockResolvedValue({ synced: [], created: [], unchanged: ["project-1", "project-2"] })
    createServerQueryContextMock.mockResolvedValue({
      convex: { mutation: mutationMock },
      serverQueryToken: "server-query-token",
    })
  })

  it("forwards declarative legacy overrides without turning them into runtime authority", async () => {
    const components = {
      Callout: {
        displayName: "Callout",
        props: [{ name: "variant", type: "string", options: ["info", "warning"] }],
        hasChildren: true,
      },
    }
    fetchRepoConfigMock.mockResolvedValue({
      config: {
        version: 1,
        defaults: {
          branch: "main",
          preview: { entry: ".repopress/default-preview.tsx", plugins: ["default-plugin"] },
        },
        projects: [
          {
            id: "docs",
            name: "Docs",
            contentRoot: "content/docs",
            framework: "fumadocs",
            contentType: "docs",
            preview: { entry: ".repopress/docs-preview.tsx", plugins: [] },
            components,
          },
          {
            id: "blog",
            name: "Blog",
            contentRoot: "content/blog",
            framework: "auto",
            contentType: "blog",
          },
        ],
        plugins: { "default-plugin": ".repopress/plugins/default/plugin.json" },
      },
    })

    await syncProjectsServerSide("token", "acme", "site", "release", "user-1")

    expect(mutationMock).toHaveBeenCalledWith(
      "projects.syncProjectsFromConfig",
      expect.objectContaining({
        pluginRegistry: { "default-plugin": ".repopress/plugins/default/plugin.json" },
        projects: [
          expect.objectContaining({
            configProjectId: "docs",
            previewEntry: ".repopress/docs-preview.tsx",
            enabledPlugins: [],
            components,
          }),
          expect.objectContaining({
            configProjectId: "blog",
            framework: "detected",
            previewEntry: ".repopress/default-preview.tsx",
            enabledPlugins: ["default-plugin"],
            components: undefined,
          }),
        ],
      }),
    )
  })
})

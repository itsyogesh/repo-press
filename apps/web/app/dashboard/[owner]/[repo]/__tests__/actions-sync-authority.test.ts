import { beforeEach, describe, expect, it, vi } from "vitest"
import { getGitHubToken } from "@/lib/auth-server"
import { resolveActingUserId } from "@/lib/server-context"
import { syncProjectsServerSide } from "@/lib/sync-projects"
import { syncProjectsFromConfigAction } from "../actions"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth-server", () => ({ getGitHubToken: vi.fn() }))
vi.mock("@/lib/server-context", () => ({ resolveActingUserId: vi.fn() }))
vi.mock("@/lib/sync-projects", () => ({ syncProjectsServerSide: vi.fn() }))

describe("Studio config sync immutable read authority", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getGitHubToken).mockResolvedValue("github-token")
    vi.mocked(resolveActingUserId).mockResolvedValue("user-1" as never)
    vi.mocked(syncProjectsServerSide).mockResolvedValue({ synced: [], created: [], unchanged: [] })
  })

  it("reads config from the captured base SHA while retaining branch as project authority", async () => {
    const baseCommitSha = "a".repeat(40)

    await syncProjectsFromConfigAction("acme", "docs", "release", baseCommitSha)

    expect(syncProjectsServerSide).toHaveBeenCalledWith("github-token", "acme", "docs", "release", "user-1", {
      runOrphanDetection: false,
      configRef: baseCommitSha,
    })
  })
})

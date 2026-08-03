import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { StudioHeader } from "@/components/studio/studio-header"

const push = vi.fn()
const setTheme = vi.fn()

vi.mock("convex/react", () => ({
  useQuery: () => [
    { _id: "project-1", contentRoot: "content", detectedFramework: "next-mdx" },
    { _id: "project-2", contentRoot: "docs", detectedFramework: "fumadocs" },
  ],
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/app/dashboard/[owner]/[repo]/actions", () => ({ syncProjectsFromConfigAction: vi.fn() }))
vi.mock("@/components/studio/studio-context", () => ({
  useStudio: () => ({
    owner: "acme",
    repo: "docs",
    branch: "main",
    baseCommitSha: "a".repeat(40),
    projectId: "project-1",
    projectAccessToken: "project-token",
  }),
}))
vi.mock("@/components/studio/view-mode-context", () => ({
  useViewMode: () => ({
    viewMode: "editor",
    setViewMode: vi.fn(),
    sidebarState: "expanded",
    setSidebarState: vi.fn(),
  }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("StudioHeader mobile actions", () => {
  it("keeps Save and More reachable at 375px and exposes compact project and theme actions", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 })

    render(
      <StudioHeader
        selectedFile={{ name: "hello.mdx", path: "content/hello.mdx", type: "file", sha: "b".repeat(40) }}
        currentStatus="draft"
        onSave={vi.fn()}
        isSaving={false}
      />,
    )

    const save = screen.getByRole("button", { name: "Save draft" })
    const more = screen.getByRole("button", { name: "More options" })
    expect(save).not.toBeDisabled()
    expect(save).not.toHaveAttribute("tabindex", "-1")
    expect(more).not.toHaveAttribute("tabindex", "-1")

    fireEvent.pointerDown(more)

    expect(await screen.findByRole("menuitem", { name: "Switch project" })).toHaveClass("md:hidden")
    expect(screen.getByRole("menuitem", { name: "Toggle theme" })).toHaveClass("sm:hidden")
  })

  it("disables saving for a read-only source while keeping the file selected", () => {
    render(
      <StudioHeader
        selectedFile={{ name: "unsupported.mdx", path: "content/unsupported.mdx", type: "file", sha: "b".repeat(40) }}
        currentStatus="draft"
        onSave={vi.fn()}
        isSaving={false}
        canSave={false}
      />,
    )

    expect(screen.getByRole("button", { name: "Save unavailable for read-only source" })).toBeDisabled()
  })
})

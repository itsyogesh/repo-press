import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { studioContextValue } = vi.hoisted(() => ({
  studioContextValue: {
    owner: "droidsize",
    repo: "collective.domains",
    branch: "main",
    projectId: "project_123",
    tree: [] as {
      name: string
      path: string
      sha: string
      type: "file" | "dir"
      children?: any[]
    }[],
  },
}))

vi.mock("../../studio-context", () => ({
  useStudio: () => studioContextValue,
}))

import { useStudioFile } from "../use-studio-file"

function createLocalStorageMock() {
  const store = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => (store.has(key) ? store.get(key)! : null)),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
    clear: vi.fn(() => {
      store.clear()
    }),
  }
}

function Harness({ currentPath }: { currentPath: string }) {
  const { selectedFile, content, isFileLoading } = useStudioFile(null, currentPath)

  return (
    <div>
      <div data-testid="selected-path">{selectedFile?.path ?? ""}</div>
      <div data-testid="content">{content}</div>
      <div data-testid="loading">{isFileLoading ? "true" : "false"}</div>
    </div>
  )
}

describe("useStudioFile", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    const localStorageMock = createLocalStorageMock()
    Object.defineProperty(globalThis, "localStorage", {
      value: localStorageMock,
      configurable: true,
      writable: true,
    })
  })

  it("fetches deep-linked file content even when the tree has not hydrated yet", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        path: "content/docs/integrations/cloudflare.mdx",
        name: "cloudflare.mdx",
        sha: "sha_123",
        content: "---\ntitle: Cloudflare\n---\n# Cloudflare",
      }),
    } as never)

    render(<Harness currentPath="content/docs/integrations/cloudflare.mdx" />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.getByTestId("selected-path").textContent).toBe("content/docs/integrations/cloudflare.mdx")
      expect(screen.getByTestId("content").textContent).toContain("# Cloudflare")
      expect(screen.getByTestId("loading").textContent).toBe("false")
    })
  })
})

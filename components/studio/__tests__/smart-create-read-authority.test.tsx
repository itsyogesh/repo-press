import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SmartCreateFileDialog } from "../smart-create-file-dialog"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("Smart Create immutable sibling inference", () => {
  it("reads sibling frontmatter from the captured base SHA instead of the mutable branch", async () => {
    const baseCommitSha = "a".repeat(40)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ content: "---\ntitle: Existing\n---\n", sha: "f".repeat(40) }),
      }),
    )

    render(
      <SmartCreateFileDialog
        open
        onOpenChange={vi.fn()}
        parentPath="content/guides"
        contentRoot="content"
        adapter={null}
        folderChildren={["existing.mdx"]}
        folderChildNodes={[
          {
            name: "existing.mdx",
            path: "content/guides/existing.mdx",
            sha: "f".repeat(40),
            type: "file",
          },
        ]}
        owner="acme"
        repo="docs"
        branch="release"
        baseCommitSha={baseCommitSha}
        onConfirm={vi.fn()}
      />,
    )

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    const requestUrl = String(vi.mocked(fetch).mock.calls[0][0])
    expect(requestUrl).toContain(`ref=${baseCommitSha}`)
    expect(requestUrl).not.toContain("branch=release")
  })
})

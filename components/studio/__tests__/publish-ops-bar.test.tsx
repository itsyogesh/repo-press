import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { PublishOpsBar } from "../publish-ops-bar"

describe("PublishOpsBar", () => {
  it("renders for media-only pending changes", () => {
    const html = renderToStaticMarkup(
      <PublishOpsBar
        {...({
          creates: 0,
          deletes: 0,
          edits: 0,
          media: 1,
          pendingMediaOps: [
            {
              _id: "media-1",
              repoPath: "/public/images/blog/post/hero.png",
              fileName: "hero.png",
              status: "pending",
              sourceFilePath: "content/blog/post.mdx",
            },
          ],
          onPublish: vi.fn(),
          onDiscard: vi.fn(),
        } as any)}
      />,
    )

    expect(html).toContain("1 pending change")
    expect(html.toLowerCase()).toContain("media")
  })
})

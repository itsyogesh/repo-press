import type * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div data-slot="dialog">{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div data-slot="dialog-content">{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

import { PublishDialog } from "../publish-dialog"

describe("PublishDialog", () => {
  it("shows pending media in the publish summary", () => {
    const html = renderToStaticMarkup(
      <PublishDialog
        open
        onOpenChange={vi.fn()}
        pendingCounts={
          {
            creates: 0,
            deletes: 0,
            edits: 0,
            media: 2,
          } as any
        }
        publishLaneViewModel={
          {
            currentLane: null,
            modeOptions: {
              "create-new": {
                label: "Create a new pull request",
                description: "Create a new publish lane and PR.",
                submitLabel: "Create PR",
              },
              "reuse-current": {
                label: "Update current pull request",
                description: "Add changes to the current lane.",
                submitLabel: "Update PR",
              },
            },
          } as any
        }
        publishMode="create-new"
        onPublishModeChange={vi.fn()}
        isPublishing={false}
        onConfirm={vi.fn()}
      />,
    )

    expect(html.toLowerCase()).toContain("media")
    expect(html).toContain("2 media")
  })
})

import { describe, expect, it } from "vitest"
import { getPublishLaneViewModel } from "../publish-lane-view-model"

describe("getPublishLaneViewModel", () => {
  it("defaults to reuse-current when a current PR exists", () => {
    expect(
      getPublishLaneViewModel({
        currentLane: {
          _id: "lane_current",
          prNumber: 42,
          prUrl: "https://github.com/acme/docs-site/pull/42",
        },
      }).defaultMode,
    ).toBe("reuse-current")
  })

  it("defaults to create-new when no current PR exists", () => {
    expect(
      getPublishLaneViewModel({
        currentLane: null,
      }).defaultMode,
    ).toBe("create-new")
  })

  it("derives the current PR summary and CTA labels", () => {
    const viewModel = getPublishLaneViewModel({
      currentLane: {
        _id: "lane_current",
        prNumber: 42,
        prUrl: "https://github.com/acme/docs-site/pull/42",
      },
    })

    expect(viewModel.currentLane).toMatchObject({
      title: "Current PR #42",
      summary: "New publishes will update PR #42.",
      linkLabel: "PR #42",
      prNumber: 42,
      prUrl: "https://github.com/acme/docs-site/pull/42",
    })
    expect(viewModel.modeOptions["reuse-current"]).toMatchObject({
      label: "Update current PR",
      submitLabel: "Update PR #42 →",
    })
    expect(viewModel.modeOptions["create-new"]).toMatchObject({
      label: "Create new PR",
      submitLabel: "Create new PR →",
    })
  })

  it("keeps reuse-current mode when a current lane exists without PR metadata", () => {
    const viewModel = getPublishLaneViewModel({
      currentLane: {
        _id: "lane_current",
      },
    })

    expect(viewModel.defaultMode).toBe("reuse-current")
    expect(viewModel.currentLane).toMatchObject({
      title: "Current publish lane",
      summary: "New publishes will continue in the current RepoPress lane.",
    })
    expect(viewModel.modeOptions["reuse-current"]).toMatchObject({
      submitLabel: "Continue current lane →",
    })
  })
})

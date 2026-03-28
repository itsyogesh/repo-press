export type PublishMode = "reuse-current" | "create-new"

export type PublishLaneLike = {
  _id?: string
  prNumber?: number | null
  prUrl?: string | null
  status?: string | null
}

export type PublishLaneViewModel = {
  defaultMode: PublishMode
  currentLane: {
    prNumber: number
    prUrl: string
    title: string
    summary: string
    linkLabel: string
  } | null
  modeOptions: Record<
    PublishMode,
    {
      label: string
      description: string
      submitLabel: string
    }
  >
  olderOpenPrReferences: Array<{
    _id?: string
    prNumber: number
    prUrl: string
    label: string
  }>
}

export function getPublishLaneViewModel({
  currentLane,
  openLanes,
}: {
  currentLane?: PublishLaneLike | null
  openLanes?: PublishLaneLike[] | null
}): PublishLaneViewModel {
  const currentLaneSummary =
    currentLane?.prNumber != null && currentLane.prUrl
      ? {
          prNumber: currentLane.prNumber,
          prUrl: currentLane.prUrl,
          title: `Current PR #${currentLane.prNumber}`,
          summary: `New publishes will update PR #${currentLane.prNumber}.`,
          linkLabel: `PR #${currentLane.prNumber}`,
        }
      : null

  const currentLaneLabel = currentLaneSummary ? `PR #${currentLaneSummary.prNumber}` : "the current PR"

  return {
    defaultMode: currentLane ? "reuse-current" : "create-new",
    currentLane: currentLaneSummary,
    modeOptions: {
      "reuse-current": {
        label: "Update current PR",
        description: `Keep publishing into ${currentLaneLabel}.`,
        submitLabel: currentLaneSummary ? `Update PR #${currentLaneSummary.prNumber} →` : "Update current PR →",
      },
      "create-new": {
        label: "Create new PR",
        description: "Start a fresh pull request for this publish.",
        submitLabel: "Create new PR →",
      },
    },
    olderOpenPrReferences: (openLanes ?? [])
      .filter(
        (lane) =>
          lane.status === "inactive" &&
          lane.prNumber != null &&
          Boolean(lane.prUrl) &&
          lane._id !== currentLane?._id,
      )
      .map((lane) => ({
        _id: lane._id,
        prNumber: lane.prNumber as number,
        prUrl: lane.prUrl as string,
        label: `PR #${lane.prNumber as number}`,
      })),
  }
}

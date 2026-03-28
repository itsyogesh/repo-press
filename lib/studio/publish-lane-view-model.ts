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
    prNumber?: number | null
    prUrl?: string | null
    title: string
    summary: string
    linkLabel?: string
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
    currentLane == null
      ? null
      : currentLane.prNumber != null && currentLane.prUrl
        ? {
            prNumber: currentLane.prNumber,
            prUrl: currentLane.prUrl,
            title: `Current PR #${currentLane.prNumber}`,
            summary: `New publishes will update PR #${currentLane.prNumber}.`,
            linkLabel: `PR #${currentLane.prNumber}`,
          }
        : {
            prNumber: currentLane.prNumber ?? null,
            prUrl: currentLane.prUrl ?? null,
            title: "Current publish lane",
            summary: "New publishes will continue in the current RepoPress lane.",
            linkLabel: currentLane.prUrl ? "View lane" : undefined,
          }

  const currentLaneLabel =
    currentLaneSummary?.prNumber != null ? `PR #${currentLaneSummary.prNumber}` : "the current publish lane"

  return {
    defaultMode: currentLane ? "reuse-current" : "create-new",
    currentLane: currentLaneSummary,
    modeOptions: {
      "reuse-current": {
        label: "Update current PR",
        description: `Keep publishing into ${currentLaneLabel}.`,
        submitLabel:
          currentLaneSummary?.prNumber != null
            ? `Update PR #${currentLaneSummary.prNumber} →`
            : "Continue current lane →",
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
          lane.status === "inactive" && lane.prNumber != null && Boolean(lane.prUrl) && lane._id !== currentLane?._id,
      )
      .map((lane) => ({
        _id: lane._id,
        prNumber: lane.prNumber as number,
        prUrl: lane.prUrl as string,
        label: `PR #${lane.prNumber as number}`,
      })),
  }
}

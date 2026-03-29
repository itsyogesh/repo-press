"use client"

import { useMutation } from "convex/react"
import * as React from "react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"

/**
 * Verifies that the active publish branch's PR is still open on GitHub.
 * If GitHub reports the PR as closed or merged, updates the local Convex
 * record immediately so the UI stops showing "Update current PR" for a
 * stale lane (e.g. when the closed/merged webhook was never delivered).
 *
 * Lives in its own file because use-studio-queries.ts is a pure
 * data-subscription hook that must stay free of useEffect side-effects.
 */
export function usePrStatusSync({
  laneId,
  prNumber,
  laneStatus,
  owner,
  repo,
  userId,
  projectAccessToken,
}: {
  laneId: Id<"publishBranches"> | undefined
  prNumber: number | null | undefined
  laneStatus: string | undefined
  owner: string
  repo: string
  userId: string | undefined
  projectAccessToken: string | undefined
}) {
  const markClosed = useMutation(api.publishBranches.markClosed)
  const markMerged = useMutation(api.publishBranches.markMerged)

  React.useEffect(() => {
    // Only verify when we have an active lane with a PR number assigned.
    if (!laneId || prNumber == null || laneStatus !== "active" || !owner || !repo) return

    const controller = new AbortController()

    fetch(
      `/api/github/pr-status?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&prNumber=${prNumber}`,
      { signal: controller.signal },
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { state: string; merged: boolean } | null) => {
        if (!data || data.state === "open") return
        // PR is closed on GitHub but local record still says "active" — sync it.
        if (data.merged) {
          void markMerged({ id: laneId, userId, projectAccessToken })
        } else {
          void markClosed({ id: laneId, userId, projectAccessToken })
        }
      })
      .catch(() => {
        // Silently ignore — network errors should not break the editor.
      })

    return () => controller.abort()
  }, [laneId, prNumber, laneStatus, owner, repo, userId, projectAccessToken, markClosed, markMerged])
}

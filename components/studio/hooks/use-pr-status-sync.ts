"use client"

import * as React from "react"
import type { Id } from "@/convex/_generated/dataModel"

type SyncedPullRequest = {
  state: string
  merged: boolean
  mergeCommitSha?: string
  baseRef?: string
  baseRepoFullName?: string | null
  headRef?: string
  headRepoFullName?: string | null
  verificationPending?: boolean
}

/**
 * Run the authenticated server-side lifecycle command. The browser supplies
 * only the expected lane identity; the server reads GitHub, binds the proof
 * to the project/lane, and retries pending merge cleanup until complete.
 */
export function usePrStatusSync({
  projectId,
  laneId,
  prNumber,
  laneStatus,
  owner,
  repo,
  headBranch,
  baseBranch,
}: {
  projectId: string | undefined
  laneId: Id<"publishBranches"> | undefined
  prNumber: number | null | undefined
  laneStatus: string | undefined
  owner: string
  repo: string
  headBranch: string | undefined
  baseBranch: string | undefined
}) {
  React.useEffect(() => {
    if (
      !projectId ||
      !laneId ||
      prNumber == null ||
      !["active", "inactive", "merged"].includes(laneStatus ?? "") ||
      !owner ||
      !repo ||
      !headBranch ||
      !baseBranch
    )
      return

    const controller = new AbortController()
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const expectedRepo = `${owner}/${repo}`.toLowerCase()

    const synchronize = async () => {
      const response = await fetch("/api/github/pr-status/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ projectId, laneId, prNumber, headBranch, baseBranch }),
      })
      const data = (await response.json().catch(() => null)) as (SyncedPullRequest & { error?: string }) | null
      if (!response.ok) {
        throw new Error(data?.error ?? `PR lifecycle sync failed with HTTP ${response.status}`)
      }
      if (
        !data ||
        data.baseRef !== baseBranch ||
        data.baseRepoFullName?.toLowerCase() !== expectedRepo ||
        data.headRef !== headBranch ||
        data.headRepoFullName?.toLowerCase() !== expectedRepo
      ) {
        throw new Error("Pull request lifecycle sync returned mismatched base or head identity")
      }
      if (data.verificationPending && !controller.signal.aborted) {
        retryTimer = setTimeout(() => void synchronize().catch(reportFailure), 1500)
      }
    }
    const reportFailure = (error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return
      console.warn("[usePrStatusSync] failed to verify PR status:", error)
    }

    void synchronize().catch(reportFailure)
    return () => {
      controller.abort()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [projectId, laneId, prNumber, laneStatus, owner, repo, headBranch, baseBranch])
}

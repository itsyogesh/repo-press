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

type StatusSyncTarget = {
  projectId: string | undefined
  laneId: Id<"publishBranches"> | undefined
  prNumber: number | null | undefined
  laneStatus: string | undefined
  owner: string
  repo: string
  headBranch: string | undefined
  baseBranch: string | undefined
}

const TRANSIENT_RETRY_BASE_MS = 1000
const TRANSIENT_RETRY_MAX_MS = 30_000
const TRANSIENT_RETRY_JITTER_MS = 250
const PENDING_VERIFICATION_DELAY_MS = 1500
const OPEN_LANE_ROTATION_DELAY_MS = 5000

class StatusSyncHttpError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
  }
}

function isUsableTarget(target: StatusSyncTarget) {
  return Boolean(
    target.projectId &&
      target.laneId &&
      target.prNumber != null &&
      ["active", "inactive", "merged", "closed"].includes(target.laneStatus ?? "") &&
      target.owner &&
      target.repo &&
      target.headBranch &&
      target.baseBranch,
  )
}

/**
 * Run the authenticated server-side lifecycle command. Candidate updates are
 * read through a ref so a successful status check can rotate the durable
 * server-side cursor without cancelling the in-flight request. Transient
 * failures retry with bounded exponential backoff while this view is mounted.
 */
export function usePrStatusSync(target: StatusSyncTarget) {
  const targetRef = React.useRef(target)
  targetRef.current = target
  const hasTarget = isUsableTarget(target)
  const syncScope = hasTarget
    ? `${target.projectId}\0${target.owner.toLowerCase()}\0${target.repo.toLowerCase()}`
    : null

  React.useEffect(() => {
    if (!syncScope) return

    let controller: AbortController | undefined
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let transientFailures = 0
    let stopped = false

    const schedule = (delayMs: number) => {
      if (stopped) return
      if (retryTimer) clearTimeout(retryTimer)
      retryTimer = setTimeout(() => void synchronize(), delayMs)
    }

    const reportFailure = (error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return
      console.warn("[usePrStatusSync] failed to verify PR status:", error)
    }

    const synchronize = async () => {
      const current = targetRef.current
      if (stopped || !isUsableTarget(current)) return
      const { projectId, laneId, prNumber, owner, repo, headBranch, baseBranch } = current
      controller = new AbortController()

      try {
        const response = await fetch("/api/github/pr-status/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ projectId, laneId, prNumber, headBranch, baseBranch }),
        })
        const data = (await response.json().catch(() => null)) as (SyncedPullRequest & { error?: string }) | null
        if (!response.ok) {
          throw new StatusSyncHttpError(
            data?.error ?? `PR lifecycle sync failed with HTTP ${response.status}`,
            response.status === 429 || response.status >= 500,
          )
        }
        const expectedRepo = `${owner}/${repo}`.toLowerCase()
        if (
          !data ||
          data.baseRef !== baseBranch ||
          data.baseRepoFullName?.toLowerCase() !== expectedRepo ||
          data.headRef !== headBranch ||
          data.headRepoFullName?.toLowerCase() !== expectedRepo
        ) {
          throw new Error("Pull request lifecycle sync returned mismatched base or head identity")
        }

        transientFailures = 0
        schedule(data.verificationPending ? PENDING_VERIFICATION_DELAY_MS : OPEN_LANE_ROTATION_DELAY_MS)
      } catch (error) {
        if (stopped || (error instanceof DOMException && error.name === "AbortError")) return
        reportFailure(error)
        const retryable = error instanceof StatusSyncHttpError ? error.retryable : error instanceof TypeError
        if (!retryable) return
        const exponentialDelay = Math.min(TRANSIENT_RETRY_MAX_MS, TRANSIENT_RETRY_BASE_MS * 2 ** transientFailures)
        transientFailures += 1
        schedule(exponentialDelay + Math.floor(Math.random() * TRANSIENT_RETRY_JITTER_MS))
      }
    }

    void synchronize()
    return () => {
      stopped = true
      controller?.abort()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [syncScope])
}

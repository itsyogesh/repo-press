"use client"

import * as React from "react"
import {
  type CompatiblePreviewAuthorityContext,
  parseConfiguredPreviewApprovalKey,
} from "@/lib/preview/compatible-artifact"
import type { PreviewResult } from "@/lib/preview/contracts"
import { compatiblePreviewRouteResponseSchema } from "@/lib/preview/product-extension"

const DEFAULT_DEBOUNCE_MS = 300
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/u

type CompatiblePreviewState = Readonly<{
  identity: readonly [string, string, string, string, string]
  previewResult: PreviewResult
  compatibleResolution: string
  compatibleAuthority: CompatiblePreviewAuthorityContext
}>

export type UseCompatiblePreviewInput = Readonly<{
  projectId?: string
  filePath?: string
  baseCommitSha?: string
  previewEntry?: string
  documentSource: string
  genericPreviewResult: PreviewResult
  debounceMs?: number
}>

function identityMatches(
  identity: CompatiblePreviewState["identity"],
  current: CompatiblePreviewState["identity"],
): boolean {
  return identity.every((value, index) => value === current[index])
}

export function useCompatiblePreview(input: UseCompatiblePreviewInput) {
  const approvalPublicKey = React.useMemo(
    () => parseConfiguredPreviewApprovalKey(process.env.NEXT_PUBLIC_PREVIEW_APPROVAL_PUBLIC_KEY_JWK),
    [],
  )
  const snapshotVersion = React.useRef(0)
  const generation = React.useRef(0)
  const [state, setState] = React.useState<CompatiblePreviewState | null>(null)
  const projectId = input.projectId ?? ""
  const filePath = input.filePath ?? ""
  const baseCommitSha = input.baseCommitSha ?? ""
  const previewEntry = input.previewEntry ?? ""
  const currentIdentity = React.useMemo(
    () => [projectId, filePath, baseCommitSha, previewEntry, input.documentSource] as const,
    [baseCommitSha, filePath, input.documentSource, previewEntry, projectId],
  )
  const eligible =
    Boolean(approvalPublicKey) &&
    projectId.length > 0 &&
    filePath.toLowerCase().endsWith(".mdx") &&
    COMMIT_SHA_PATTERN.test(baseCommitSha) &&
    previewEntry.length > 0

  React.useEffect(() => {
    generation.current += 1
    const requestGeneration = generation.current
    setState(null)
    if (!eligible) return

    snapshotVersion.current += 1
    const requestedSnapshot = snapshotVersion.current
    const controller = new AbortController()
    const delay = Math.max(0, Math.min(input.debounceMs ?? DEFAULT_DEBOUNCE_MS, 2_000))
    const timer = window.setTimeout(() => {
      void fetch("/api/preview/compatible", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          filePath,
          baseCommitSha,
          snapshotVersion: requestedSnapshot,
          documentSource: input.documentSource,
        }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) return null
          const parsed = compatiblePreviewRouteResponseSchema.safeParse(await response.json())
          if (!parsed.success) return null
          if (
            parsed.data.authority.projectId !== projectId ||
            parsed.data.authority.baseCommit !== baseCommitSha ||
            parsed.data.authority.documentPath !== filePath ||
            parsed.data.authority.snapshotVersion !== requestedSnapshot
          ) {
            return null
          }
          return parsed.data
        })
        .then((resolved) => {
          if (!resolved || controller.signal.aborted || generation.current !== requestGeneration) return
          setState({
            identity: currentIdentity,
            previewResult: resolved.previewResult,
            compatibleResolution: resolved.resolution,
            compatibleAuthority: resolved.authority,
          })
        })
        .catch(() => {
          // Generic preview remains authoritative on every compatible failure.
        })
    }, delay)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [baseCommitSha, currentIdentity, eligible, filePath, input.debounceMs, input.documentSource, projectId])

  if (!state || !identityMatches(state.identity, currentIdentity)) {
    return {
      previewResult: input.genericPreviewResult,
      compatibleResolution: null,
      compatibleAuthority: null,
    } as const
  }
  return {
    previewResult: state.previewResult,
    compatibleResolution: state.compatibleResolution,
    compatibleAuthority: state.compatibleAuthority,
  } as const
}

"use client"

import { Eye, Maximize2, Minimize2 } from "lucide-react"
import * as React from "react"
import { CompatiblePreviewFrame } from "@/components/mdx-runtime/CompatiblePreviewFrame"
import { GenericPreview } from "@/components/mdx-runtime/GenericPreview"
import { PreviewStatus } from "@/components/mdx-runtime/PreviewStatus"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { FieldVariantMap } from "@/lib/framework-adapters"
import { resolveFieldValue } from "@/lib/framework-adapters"
import {
  COMPATIBLE_RENDERER_PROFILE,
  type CompatiblePreviewAuthorityContext,
  type CompatiblePreviewVerificationFailureReason,
  parseConfiguredPreviewApprovalKey,
  type VerifiedCompatiblePreviewResolution,
  verifySignedCompatiblePreviewResolutionDetailed,
} from "@/lib/preview/compatible-artifact"
import {
  COMPATIBLE_FAILURE_MESSAGES,
  COMPATIBLE_FIDELITY_LOSS_MESSAGES,
  isCompatibleFailureCode,
  isCompatibleFidelityLossCode,
} from "@/lib/preview/compatible-diagnostics"
import { type PreviewResult, previewResultSchema } from "@/lib/preview/contracts"
import { ensureRendererSafeGenericRenderModel, type GenericRenderModel } from "@/lib/preview/generic-render-model"
import type { SandboxMessage } from "@/lib/preview/sandbox-protocol"
import { resolveStudioAssetUrl } from "@/lib/studio/media-resolve"
import { cn } from "@/lib/utils"

import { DeviceFrame } from "./device-frame"
import { type Viewport, ViewportToggle } from "./viewport-toggle"

type TimerApi = Pick<typeof globalThis, "setTimeout" | "clearTimeout">

export function createCompileStatusForwarder(
  onCompilingChange?: (isCompiling: boolean) => void,
  settleDelayMs = 300,
  timers: TimerApi = globalThis,
) {
  let settleTimer: ReturnType<typeof setTimeout> | null = null
  let hasSeenCompilingState = false
  let lastEmitted: boolean | null = null

  const emit = (isCompiling: boolean) => {
    if (!onCompilingChange || lastEmitted === isCompiling) return
    lastEmitted = isCompiling
    onCompilingChange(isCompiling)
  }

  return {
    update(isCompiling: boolean) {
      if (!onCompilingChange) return

      if (settleTimer !== null) {
        timers.clearTimeout(settleTimer)
        settleTimer = null
      }

      if (isCompiling) {
        hasSeenCompilingState = true
        emit(true)
        return
      }

      if (!hasSeenCompilingState) return

      settleTimer = timers.setTimeout(() => {
        settleTimer = null
        emit(false)
      }, settleDelayMs)
    },
    cancel() {
      if (settleTimer !== null) {
        timers.clearTimeout(settleTimer)
        settleTimer = null
      }
    },
  }
}

interface PreviewBaseProps {
  /** Server/provider-selected declarative preview state. Never executable bindings. */
  previewResult: PreviewResult
  /** Safe fallback retained while compatible preview verifies, builds, or downgrades. */
  fallbackResult?: PreviewResult
  frontmatter: Record<string, any>
  fieldVariants?: FieldVariantMap
  projectId?: string
  userId?: string
  filePath?: string
  contentRoot?: string
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>
  onScroll?: () => void
  onCompilingChange?: (isCompiling: boolean) => void
}

type PreviewProps = PreviewBaseProps &
  (
    | { compatibleResolution?: null | undefined; compatibleAuthority?: null | undefined }
    | { compatibleResolution: string; compatibleAuthority: CompatiblePreviewAuthorityContext }
  )

function compatibleAttemptKey(resolution: VerifiedCompatiblePreviewResolution): string {
  const authority = resolution.authority
  return JSON.stringify([
    authority.tenantId,
    authority.projectId,
    authority.baseCommit,
    authority.documentPath,
    authority.sessionId,
    authority.snapshotVersion,
    authority.rendererProfile,
    authority.executableDigest,
  ])
}

function compatibleAuthorityKey(authority: CompatiblePreviewAuthorityContext): string {
  return JSON.stringify([
    authority.tenantId,
    authority.projectId,
    authority.baseCommit,
    authority.documentPath,
    authority.sessionId,
    authority.snapshotVersion,
  ])
}

function freezePreviewValue<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value
  for (const key of Object.keys(value)) freezePreviewValue(Object.getOwnPropertyDescriptor(value, key)?.value)
  return Object.freeze(value)
}

const DOWNGRADE_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  NATIVE_UNAVAILABLE: "Native preview is unavailable for this snapshot.",
  EXECUTABLE_DIGEST_UNTRUSTED: "Executable preview changes are not approved for this snapshot.",
  COMPATIBLE_UNAVAILABLE: "Compatible preview is unavailable for this snapshot.",
  BROWSER_CAPABILITY_UNSUPPORTED: "This component uses capabilities unavailable in compatible preview.",
})

const COMPATIBLE_VERIFICATION_MESSAGES: Readonly<Record<CompatiblePreviewVerificationFailureReason, string>> =
  Object.freeze({
    RESOLUTION_INVALID: "The compatible preview approval response was invalid.",
    APPROVAL_EXPIRED: "The compatible preview approval expired; reload the document to retry.",
    CRYPTO_UNAVAILABLE: "This browser cannot verify compatible preview approvals.",
    SIGNATURE_INVALID: "The compatible preview approval failed its authenticity check.",
    DIGEST_MISMATCH: "The compatible preview artifact did not match its approved content digest.",
  })

const MISSING_COMPATIBLE_FALLBACK_MODEL = freezePreviewValue<GenericRenderModel>({
  blocks: [{ type: "component-placeholder", name: "CompatiblePreview" }],
})

export function normalizePreviewDowngradeReason(reason: string): string {
  return DOWNGRADE_MESSAGES[reason] ?? "Preview fidelity was reduced by the server."
}

function isExactConfiguredSandboxTarget(url: string): boolean {
  const configuredOrigin = process.env.NEXT_PUBLIC_PREVIEW_ORIGIN?.trim()
  if (!configuredOrigin) return process.env.NODE_ENV !== "production"
  try {
    const origin = new URL(configuredOrigin)
    if (origin.origin !== configuredOrigin.replace(/\/$/u, "")) return false
    return new URL("/preview/sandbox", origin).toString() === url
  } catch {
    return false
  }
}

export function Preview({
  previewResult,
  fallbackResult,
  frontmatter,
  fieldVariants,
  projectId,
  userId,
  filePath,
  contentRoot = "",
  scrollContainerRef,
  onScroll,
  onCompilingChange,
  compatibleResolution,
  compatibleAuthority,
}: PreviewProps) {
  const [viewport, setViewport] = React.useState<Viewport>("desktop")
  const [isFullScreen, setIsFullScreen] = React.useState(false)
  const parsedPreviewResult = React.useMemo(() => {
    const parsed = previewResultSchema.safeParse(previewResult)
    if (parsed.success) freezePreviewValue(parsed.data)
    return parsed
  }, [previewResult])
  const parsedFallbackResult = React.useMemo(() => {
    if (!fallbackResult) return null
    const parsed = previewResultSchema.safeParse(fallbackResult)
    if (parsed.success) freezePreviewValue(parsed.data)
    return parsed
  }, [fallbackResult])
  const activePreviewResult = parsedPreviewResult.success ? parsedPreviewResult.data : null
  const safeFallbackResult = parsedFallbackResult?.success ? parsedFallbackResult.data : null
  const fallbackTarget =
    activePreviewResult?.target.kind === "safe-fallback"
      ? activePreviewResult.target
      : safeFallbackResult?.fidelity === "generic" && safeFallbackResult.target.kind === "safe-fallback"
        ? safeFallbackResult.target
        : null
  const compatibleFallbackMissing =
    activePreviewResult?.fidelity === "compatible" &&
    activePreviewResult.target.kind === "sandboxed-iframe" &&
    fallbackTarget === null
  const genericRenderModel = React.useMemo(
    () =>
      ensureRendererSafeGenericRenderModel(
        fallbackTarget?.renderModel ?? (compatibleFallbackMissing ? MISSING_COMPATIBLE_FALLBACK_MODEL : { blocks: [] }),
      ),
    [compatibleFallbackMissing, fallbackTarget],
  )
  const isCompiling = activePreviewResult?.status === "queued" || activePreviewResult?.status === "building"
  const compatibleContractMatches =
    activePreviewResult?.fidelity === "compatible" &&
    activePreviewResult.status === "ready" &&
    activePreviewResult.target.kind === "sandboxed-iframe" &&
    isExactConfiguredSandboxTarget(activePreviewResult.target.url) &&
    compatibleAuthority !== null &&
    compatibleAuthority !== undefined &&
    activePreviewResult.sessionId === compatibleAuthority.sessionId &&
    activePreviewResult.snapshotVersion === compatibleAuthority.snapshotVersion
  const [verifiedCompatibleState, setVerifiedCompatibleState] = React.useState<{
    wire: string
    authorityKey: string
    resolution: VerifiedCompatiblePreviewResolution
  } | null>(null)
  const [compatibleVerificationFailure, setCompatibleVerificationFailure] =
    React.useState<CompatiblePreviewVerificationFailureReason | null>(null)
  const [downgradedAttempt, setDowngradedAttempt] = React.useState<{
    key: string
    diagnostics: readonly string[]
  } | null>(null)
  const approvalPublicKey = React.useMemo(
    () => parseConfiguredPreviewApprovalKey(process.env.NEXT_PUBLIC_PREVIEW_APPROVAL_PUBLIC_KEY_JWK),
    [],
  )
  React.useEffect(() => {
    let active = true
    setVerifiedCompatibleState(null)
    setCompatibleVerificationFailure(null)
    if (compatibleContractMatches && compatibleResolution && compatibleAuthority && approvalPublicKey) {
      const authorityKey = compatibleAuthorityKey(compatibleAuthority)
      void verifySignedCompatiblePreviewResolutionDetailed(compatibleResolution, {
        publicKey: approvalPublicKey,
        expectedAuthority: compatibleAuthority,
      }).then((result) => {
        if (!active) return
        if (result.ok) {
          setVerifiedCompatibleState({ wire: compatibleResolution, authorityKey, resolution: result.resolution })
          return
        }
        setCompatibleVerificationFailure(result.reason)
      })
    }
    return () => {
      active = false
    }
  }, [approvalPublicKey, compatibleAuthority, compatibleContractMatches, compatibleResolution])
  const verifiedCompatibleResolution =
    compatibleResolution &&
    compatibleAuthority &&
    verifiedCompatibleState?.wire === compatibleResolution &&
    verifiedCompatibleState.authorityKey === compatibleAuthorityKey(compatibleAuthority)
      ? verifiedCompatibleState.resolution
      : null
  const activeCompatibleAttemptKey = React.useMemo(
    () => (verifiedCompatibleResolution ? compatibleAttemptKey(verifiedCompatibleResolution) : null),
    [verifiedCompatibleResolution],
  )
  const compatibleDowngraded =
    activeCompatibleAttemptKey !== null && downgradedAttempt?.key === activeCompatibleAttemptKey
  const displayedFidelity =
    activePreviewResult?.fidelity === "compatible" &&
    compatibleContractMatches &&
    activeCompatibleAttemptKey &&
    !compatibleDowngraded
      ? "Compatible"
      : "Generic"
  const compatibleDiagnostics = compatibleDowngraded ? downgradedAttempt.diagnostics : []
  const downgradeDiagnostics = React.useMemo(() => {
    if (!activePreviewResult) return ["Preview state could not be validated; using the safe Generic renderer."]
    const reasonCodes = activePreviewResult?.downgradeReasons ?? []
    const reasons = reasonCodes.map(normalizePreviewDowngradeReason)
    if (
      activePreviewResult?.fidelity === "compatible" &&
      (!compatibleContractMatches || !compatibleResolution || !approvalPublicKey)
    ) {
      reasons.push(normalizePreviewDowngradeReason("COMPATIBLE_UNAVAILABLE"))
    }
    if (activePreviewResult?.fidelity === "compatible" && compatibleVerificationFailure) {
      reasons.push(COMPATIBLE_VERIFICATION_MESSAGES[compatibleVerificationFailure])
    }
    return [...new Set(reasons)]
  }, [
    activePreviewResult,
    approvalPublicKey,
    compatibleContractMatches,
    compatibleResolution,
    compatibleVerificationFailure,
  ])
  const visibleDowngradeDiagnostics = compatibleDowngraded ? compatibleDiagnostics : downgradeDiagnostics
  const warnings = React.useMemo(() => {
    if (compatibleDowngraded) return [...compatibleDiagnostics]
    if (displayedFidelity === "Compatible") {
      return [`${COMPATIBLE_RENDERER_PROFILE} renders only supported static, inert content.`, ...downgradeDiagnostics]
    }
    return downgradeDiagnostics
  }, [compatibleDiagnostics, compatibleDowngraded, displayedFidelity, downgradeDiagnostics])
  const handleCompatibleMessage = React.useCallback(
    (message: SandboxMessage) => {
      if (!activeCompatibleAttemptKey) return
      if (message.type === "diagnostics") {
        const diagnostics = message.payload.diagnostics.flatMap((diagnostic) =>
          isCompatibleFidelityLossCode(diagnostic.code) ? [COMPATIBLE_FIDELITY_LOSS_MESSAGES[diagnostic.code]] : [],
        )
        if (diagnostics.length > 0) {
          setDowngradedAttempt({
            key: activeCompatibleAttemptKey,
            diagnostics: Object.freeze([...new Set(diagnostics)]),
          })
        }
        return
      }
      if (message.type === "error" && isCompatibleFailureCode(message.payload.code)) {
        setDowngradedAttempt({
          key: activeCompatibleAttemptKey,
          diagnostics: Object.freeze([COMPATIBLE_FAILURE_MESSAGES[message.payload.code]]),
        })
      }
    },
    [activeCompatibleAttemptKey],
  )
  const handleCompatibleUnavailable = React.useCallback(() => {
    if (!activeCompatibleAttemptKey) return
    setDowngradedAttempt({
      key: activeCompatibleAttemptKey,
      diagnostics: Object.freeze([COMPATIBLE_FAILURE_MESSAGES.COMPATIBLE_FRAME_RELOADED]),
    })
  }, [activeCompatibleAttemptKey])
  const onCompilingChangeRef = React.useRef(onCompilingChange)
  onCompilingChangeRef.current = onCompilingChange
  const [compileStatusForwarder] = React.useState(() =>
    createCompileStatusForwarder((isCompiling) => onCompilingChangeRef.current?.(isCompiling)),
  )
  React.useEffect(() => compileStatusForwarder.update(isCompiling), [compileStatusForwarder, isCompiling])

  React.useEffect(() => () => compileStatusForwarder.cancel(), [compileStatusForwarder])

  const title = resolveFieldValue(frontmatter, "title", fieldVariants) as string | undefined
  const date = resolveFieldValue(frontmatter, "date", fieldVariants) as string | undefined
  const rawImage = resolveFieldValue(frontmatter, "image", fieldVariants) as string | undefined
  const description = resolveFieldValue(frontmatter, "description", fieldVariants) as string | undefined
  const tags = resolveFieldValue(frontmatter, "tags", fieldVariants) as string[] | undefined
  const author = resolveFieldValue(frontmatter, "author", fieldVariants) as string | undefined

  const image = rawImage
    ? resolveStudioAssetUrl(rawImage, projectId, userId, filePath, undefined, contentRoot)
    : undefined
  const [imageError, setImageError] = React.useState(false)
  const fileName = filePath?.split("/").pop() || "Untitled"
  const formattedDate = React.useMemo(() => {
    if (!date) return null
    const value = new Date(date)
    if (Number.isNaN(value.getTime())) return null
    return value.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }, [date])

  // Reset image error when image URL changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset-on-change pattern
  React.useEffect(() => {
    setImageError(false)
  }, [image])

  // Resolve repository-relative media without changing the serializable model.
  const resolveAssetUrl = React.useMemo(() => {
    return (path: string) => resolveStudioAssetUrl(path, projectId, userId, filePath, undefined, contentRoot)
  }, [projectId, userId, filePath, contentRoot])

  // Escape exits full-screen
  React.useEffect(() => {
    if (!isFullScreen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        setIsFullScreen(false)
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [isFullScreen])

  const previewContent = (
    <article className="mx-auto flex w-full max-w-[980px] flex-col gap-6 px-4 py-5 md:px-6 md:py-6">
      <div className="overflow-hidden rounded-lg border border-studio-border/80 bg-studio-canvas">
        <div className="border-b border-studio-border/70 px-5 py-5 md:px-7">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-studio-fg-muted">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-studio-border/60 bg-studio-canvas-inset/45 px-2.5 py-1">
              <Eye className="h-3 w-3" />
              Published view
            </span>
            <span className="rounded-full border border-studio-border/60 bg-studio-canvas-inset/45 px-2.5 py-1 normal-case tracking-normal">
              {fileName}
            </span>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-studio-fg md:text-3xl">
                {title || inferPreviewTitle(fileName)}
              </h1>
              {description ? <p className="max-w-2xl text-sm leading-6 text-studio-fg-muted">{description}</p> : null}
            </div>

            {(formattedDate || author || (tags && tags.length > 0)) && (
              <div className="flex flex-wrap items-center gap-2">
                {formattedDate ? (
                  <Badge variant="outline" className="rounded-full border-studio-border/70 px-2.5 py-1 text-[11px]">
                    {formattedDate}
                  </Badge>
                ) : null}
                {author ? (
                  <Badge variant="outline" className="rounded-full border-studio-border/70 px-2.5 py-1 text-[11px]">
                    by {author}
                  </Badge>
                ) : null}
                {tags?.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="rounded-full bg-studio-accent-muted px-2.5 py-1 text-[11px] text-studio-accent"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {image && !imageError && (
          <div className="border-b border-studio-border/70 px-4 py-4 md:px-7">
            <img
              src={image}
              alt={title || fileName}
              className="aspect-video w-full rounded-md border border-studio-border/60 object-cover"
              loading="lazy"
              onError={() => setImageError(true)}
            />
          </div>
        )}

        {activePreviewResult?.fidelity === "compatible" &&
        compatibleContractMatches &&
        verifiedCompatibleResolution &&
        compatibleAuthority &&
        activeCompatibleAttemptKey &&
        !compatibleDowngraded ? (
          <div className="min-h-96 p-4 md:p-6">
            <p className="mb-3 font-mono text-xs text-studio-fg-muted">
              {COMPATIBLE_RENDERER_PROFILE} · static, inert rendering
            </p>
            <CompatiblePreviewFrame
              key={activeCompatibleAttemptKey}
              resolution={verifiedCompatibleResolution}
              authorityContext={compatibleAuthority}
              onMessage={handleCompatibleMessage}
              onUnavailable={handleCompatibleUnavailable}
            />
          </div>
        ) : (
          <div className="px-5 py-6 md:px-7 md:py-8">
            {visibleDowngradeDiagnostics.length > 0 ? (
              <output className="mb-4 rounded-lg border border-studio-attention/25 bg-studio-attention-muted/70 p-3 text-sm text-studio-attention">
                <p className="font-medium">Previewing with safe Generic fidelity.</p>
                {visibleDowngradeDiagnostics.map((diagnostic) => (
                  <p key={diagnostic} className="mt-1 text-xs">
                    {diagnostic}
                  </p>
                ))}
              </output>
            ) : null}
            <div
              data-scroll-sync-root="preview"
              className={cn("typeset typeset-preview max-w-none", "[&_h1]:scroll-mt-4 [&_h2]:scroll-mt-4")}
            >
              <GenericPreview model={genericRenderModel} resolveAssetUrl={resolveAssetUrl} />
            </div>
          </div>
        )}
      </div>
    </article>
  )

  if (isFullScreen) {
    return (
      <div className="fixed inset-0 z-50 bg-studio-canvas flex flex-col font-sans">
        <div className="flex items-center justify-between border-b border-studio-border px-4 py-3 shrink-0 bg-studio-canvas">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-studio-fg-muted">Preview</span>
              <span className="truncate rounded-full border border-studio-border/60 bg-studio-canvas-inset/45 px-2 py-0.5 text-[11px] text-studio-fg">
                {fileName}
              </span>
              <Badge variant="outline" className="rounded-full border-studio-border/70 px-2 py-0.5 text-[10px]">
                {displayedFidelity} fidelity
              </Badge>
            </div>
            <p className="text-sm text-studio-fg-muted">See the polished reading experience while you edit.</p>
          </div>
          <div className="flex items-center gap-3">
            <PreviewStatus isCompiling={isCompiling} warnings={warnings} />
            <ViewportToggle value={viewport} onChange={setViewport} />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-md border border-studio-border/70 bg-studio-canvas-inset/45"
              onClick={() => setIsFullScreen(false)}
              title="Exit full-screen (Esc)"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-studio-canvas-inset/30">
          <DeviceFrame viewport={viewport}>{previewContent}</DeviceFrame>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-studio-canvas">
      <div className="flex items-center justify-between border-b border-studio-border px-4 py-3 shrink-0">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-studio-fg-muted">Preview</span>
            <span className="truncate rounded-full border border-studio-border/60 bg-studio-canvas-inset/45 px-2 py-0.5 text-[11px] text-studio-fg">
              {fileName}
            </span>
            <Badge variant="outline" className="rounded-full border-studio-border/70 px-2 py-0.5 text-[10px]">
              {displayedFidelity} fidelity
            </Badge>
          </div>
          <p className="text-sm text-studio-fg-muted">Live rendering with device-aware framing.</p>
        </div>
        <div className="flex items-center gap-3">
          <PreviewStatus isCompiling={isCompiling} warnings={warnings} />
          <ViewportToggle value={viewport} onChange={setViewport} />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-md border border-studio-border/70 bg-studio-canvas-inset/45"
            onClick={() => setIsFullScreen(true)}
            title="Full-screen preview"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div ref={scrollContainerRef} onScroll={onScroll} className="flex-1 overflow-y-auto bg-studio-canvas-inset/30">
        <DeviceFrame viewport={viewport}>{previewContent}</DeviceFrame>
      </div>
    </div>
  )
}

function inferPreviewTitle(fileName: string) {
  return fileName.replace(/\.(mdx?|markdown)$/i, "") || "Untitled draft"
}

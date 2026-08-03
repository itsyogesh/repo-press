"use client"

import * as React from "react"
import { buildGenericRenderModel } from "@/lib/preview/generic-render-model"
import { GenericPreview } from "./GenericPreview"

/**
 * Backward-compatible safe preview surface. Repository MDX is parsed into the
 * inert generic model; executable compatible rendering belongs exclusively to
 * `components/preview-sandbox/**`.
 */
export function PreviewRuntime({
  source,
  externalDiagnostics = [],
  resolveAssetUrl,
  onStatusChange,
  onWarningsChange,
}: {
  source: string
  frontmatter?: Record<string, unknown>
  externalDiagnostics?: string[]
  resolveAssetUrl?: (path: string) => string
  onStatusChange?: (isCompiling: boolean) => void
  onWarningsChange?: (warnings: string[]) => void
}) {
  const model = React.useMemo(() => buildGenericRenderModel(source), [source])
  const diagnosticsKey = React.useMemo(() => JSON.stringify(externalDiagnostics), [externalDiagnostics])

  React.useEffect(() => {
    onStatusChange?.(false)
  }, [onStatusChange])

  React.useEffect(() => {
    onWarningsChange?.(JSON.parse(diagnosticsKey) as string[])
  }, [diagnosticsKey, onWarningsChange])

  return <GenericPreview model={model} resolveAssetUrl={resolveAssetUrl} />
}

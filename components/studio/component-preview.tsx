"use client"

import type { AuthoringComponent } from "@/lib/studio/authoring-catalog"
import { cn } from "@/lib/utils"
import { AuthoringComponentCard } from "./authoring-component-card"

interface PreviewProps {
  component: AuthoringComponent
  values?: Readonly<Record<string, unknown>>
  resolveImageSource?: (source: string) => string
  className?: string
}

/**
 * Metadata-driven authoring preview. Product integrations extend this surface
 * through component metadata and literal values, never executable bindings.
 */
export function ComponentPreview({ component, values, resolveImageSource, className }: PreviewProps) {
  return (
    <div className={cn("relative flex h-full w-full items-center justify-center overflow-hidden p-4", className)}>
      <div className="relative z-10 w-full max-w-sm">
        <AuthoringComponentCard component={component} values={values} resolveImageSource={resolveImageSource} />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,currentColor_1px,transparent_0)] bg-[size:12px_12px] text-studio-fg opacity-[0.02] mix-blend-overlay" />
    </div>
  )
}

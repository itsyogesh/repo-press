"use client"

import { Box, Image, Play } from "lucide-react"
import { cn } from "@/lib/utils"

interface PreviewProps {
  name: string
  className?: string
}

/**
 * Blueprint-style component previews.
 * High-fidelity wireframes for the RepoPress Studio.
 */
export function ComponentPreview({ name, className }: PreviewProps) {
  const normalizedName = name.replace(/Adapter$/i, "").toLowerCase()

  return (
    <div className={cn("relative w-full h-full flex items-center justify-center overflow-hidden", className)}>
      {/* The Abstract Preview */}
      <div className="relative z-10 w-full h-full flex items-center justify-center p-4">
        <PreviewSwitch name={normalizedName} />
      </div>

      {/* Subtle Grain Overlay */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
    </div>
  )
}

function PreviewSwitch({ name }: { name: string }) {
  switch (name) {
    case "button":
      return <ButtonPreview />
    case "badge":
      return <BadgePreview />
    case "callout":
      return <CalloutPreview />
    case "card":
      return <CardPreview />
    case "docsimage":
    case "image":
      return <ImagePreview />
    case "docsvideo":
    case "video":
      return <VideoPreview />
    case "tabs":
    case "tab":
      return <TabsPreview />
    case "steps":
    case "step":
      return <StepsPreview />
    default:
      return <GenericPreview />
  }
}

// -- Abstract Variants (Surgical / Blueprint Style) --

function ButtonPreview() {
  return (
    <div className="w-20 h-7 rounded border border-studio-accent/30 bg-studio-accent/5 flex items-center justify-center relative">
      <div className="w-8 h-0.5 bg-studio-accent/40 rounded-full" />
      {/* Corner markers for "architectural" feel */}
      <div className="absolute -top-0.5 -left-0.5 w-1 h-1 border-t border-l border-studio-accent/60" />
      <div className="absolute -bottom-0.5 -right-0.5 w-1 h-1 border-b border-r border-studio-accent/60" />
    </div>
  )
}

function BadgePreview() {
  return (
    <div className="w-14 h-5 rounded-full border border-studio-success/30 bg-studio-success/5 flex items-center justify-center">
      <div className="w-6 h-0.5 bg-studio-success/40 rounded-full" />
    </div>
  )
}

function CalloutPreview() {
  return (
    <div className="w-28 space-y-2 p-2 rounded border border-studio-attention/30 bg-studio-attention/5">
      <div className="flex items-center gap-1.5">
        <div className="w-1 h-1 rounded-full bg-studio-attention/40" />
        <div className="w-12 h-0.5 bg-studio-attention/30 rounded-full" />
      </div>
      <div className="space-y-1">
        <div className="w-full h-px bg-studio-attention/10" />
        <div className="w-4/5 h-px bg-studio-attention/10" />
      </div>
    </div>
  )
}

function CardPreview() {
  return (
    <div className="relative w-24 h-32 rounded border border-studio-border bg-studio-canvas p-2.5 space-y-3 shadow-sm overflow-hidden">
      <div className="w-full h-10 rounded-sm bg-studio-canvas-inset border border-studio-border-muted relative">
        <div className="absolute inset-1 border border-dashed border-studio-fg/5 rounded-[1px]" />
      </div>
      <div className="space-y-1.5">
        <div className="w-full h-0.5 bg-studio-fg/10 rounded-full" />
        <div className="w-2/3 h-0.5 bg-studio-fg/10 rounded-full" />
      </div>
    </div>
  )
}

function ImagePreview() {
  return (
    <div className="relative w-36 h-28 rounded border border-studio-border-muted bg-studio-canvas-inset flex items-center justify-center overflow-hidden">
      <Image className="w-8 h-8 text-studio-fg/5" />
      <div className="absolute inset-2 border border-dashed border-studio-fg/5 rounded-sm" />
    </div>
  )
}

function VideoPreview() {
  return (
    <div className="relative w-32 h-24 rounded border border-studio-border-muted bg-studio-canvas-inset flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border border-studio-accent/30 flex items-center justify-center pl-0.5">
        <Play className="w-3 h-3 text-studio-accent/40 fill-studio-accent/10" />
      </div>
    </div>
  )
}

function TabsPreview() {
  return (
    <div className="w-32 space-y-2">
      <div className="flex gap-1 border-b border-studio-border-muted pb-0.5">
        <div className="w-6 h-1 rounded-t bg-studio-accent/30" />
        <div className="w-6 h-1 rounded-t bg-studio-fg/5" />
        <div className="w-6 h-1 rounded-t bg-studio-fg/5" />
      </div>
      <div className="w-full h-10 rounded-sm border border-studio-border-muted bg-studio-canvas-inset" />
    </div>
  )
}

function StepsPreview() {
  return (
    <div className="space-y-2.5 w-24">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border border-studio-accent/30 flex items-center justify-center shrink-0">
            <div className="w-1 h-1 rounded-full bg-studio-accent/40" />
          </div>
          <div className="w-full h-px bg-studio-fg/10" />
        </div>
      ))}
    </div>
  )
}

function GenericPreview() {
  return (
    <div className="flex flex-col items-center gap-2 opacity-10">
      <Box className="w-6 h-6 text-studio-fg" />
      <div className="w-10 h-0.5 bg-studio-fg rounded-full" />
    </div>
  )
}

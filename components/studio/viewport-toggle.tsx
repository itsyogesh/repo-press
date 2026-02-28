"use client"

import { Monitor, Tablet, Smartphone } from "lucide-react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export type Viewport = "desktop" | "tablet" | "mobile"

interface ViewportToggleProps {
  value: Viewport
  onChange: (viewport: Viewport) => void
}

export function ViewportToggle({ value, onChange }: ViewportToggleProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(val) => {
        if (val) onChange(val as Viewport)
      }}
      className="bg-muted/50 p-0.5 rounded-md border border-studio-border/50"
    >
      <ToggleGroupItem
        value="desktop"
        className="h-6 w-7 p-0 data-[state=on]:bg-studio-canvas data-[state=on]:shadow-sm"
        title="Desktop"
      >
        <Monitor className="h-3.5 w-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="tablet"
        className="h-6 w-7 p-0 data-[state=on]:bg-studio-canvas data-[state=on]:shadow-sm"
        title="Tablet (768px)"
      >
        <Tablet className="h-3.5 w-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="mobile"
        className="h-6 w-7 p-0 data-[state=on]:bg-studio-canvas data-[state=on]:shadow-sm"
        title="Mobile (375px)"
      >
        <Smartphone className="h-3.5 w-3.5" />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

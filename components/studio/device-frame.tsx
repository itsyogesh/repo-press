"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

type Viewport = "desktop" | "tablet" | "mobile"

const VIEWPORT_WIDTHS: Record<Viewport, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
}

interface DeviceFrameProps {
  viewport: Viewport
  children: React.ReactNode
  className?: string
}

export function DeviceFrame({ viewport, children, className }: DeviceFrameProps) {
  if (viewport === "desktop") {
    return <div className={cn("w-full h-full", className)}>{children}</div>
  }

  return (
    <div className={cn("flex justify-center h-full py-4", className)}>
      <div
        className={cn(
          "relative overflow-hidden transition-all duration-300 ease-in-out h-full",
          viewport === "mobile" && "rounded-[32px] border-[6px] border-studio-fg/20 shadow-xl",
          viewport === "tablet" && "rounded-[16px] border-[4px] border-studio-fg/15 shadow-lg",
        )}
        style={{ width: VIEWPORT_WIDTHS[viewport], maxWidth: VIEWPORT_WIDTHS[viewport] }}
      >
        {/* Mobile notch */}
        {viewport === "mobile" && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[24px] bg-studio-fg/20 rounded-b-xl z-10" />
        )}
        <div className={cn("h-full overflow-y-auto bg-studio-canvas", viewport === "mobile" && "pt-6")}>
          {children}
        </div>
      </div>
    </div>
  )
}

import type React from "react"
import { COLORS } from "../colors"

interface AppWindowProps {
  url?: string
  width?: number
  height?: number
  children: React.ReactNode
}

/** Mac-style browser chrome shell for screen recordings / mockups */
export const AppWindow: React.FC<AppWindowProps> = ({
  url = "localhost:3001",
  width = 900,
  height = 520,
  children,
}) => {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 12,
        border: `1px solid ${COLORS.border}`,
        overflow: "hidden",
        backgroundColor: COLORS.surface,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          borderBottom: `1px solid ${COLORS.borderSubtle}`,
          flexShrink: 0,
          backgroundColor: COLORS.surfaceHigh,
        }}
      >
        {/* Traffic lights */}
        <div style={{ display: "flex", gap: 6, marginRight: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#ef4444" }} />
          <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#eab308" }} />
          <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#22c55e" }} />
        </div>
        {/* URL bar */}
        <div
          style={{
            flex: 1,
            backgroundColor: COLORS.surface,
            borderRadius: 6,
            padding: "4px 12px",
            fontSize: 12,
            color: COLORS.muted,
            textAlign: "center",
            border: `1px solid ${COLORS.borderSubtle}`,
          }}
        >
          {url}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden" }}>{children}</div>
    </div>
  )
}

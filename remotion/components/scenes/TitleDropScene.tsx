import type React from "react"
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"
import { COLORS } from "../../colors"
import { geistFamily, geistMonoFamily } from "../../fonts"

interface TitleDropSceneProps {
  step: number
  title: string
  accent?: string
}

/** Large chapter title that drops in — used between feature sections in TutorialVideo */
export const TitleDropScene: React.FC<TitleDropSceneProps> = ({ step, title, accent }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const numScale = spring({ frame, fps, config: { damping: 14, stiffness: 100 } })
  const numOpacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  const titleDelay = Math.round(0.3 * fps)
  const titleOpacity = interpolate(frame, [titleDelay, titleDelay + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const titleY = spring({ frame, fps, config: { damping: 18 }, delay: titleDelay })

  const accentDelay = Math.round(0.55 * fps)
  const accentOpacity = interpolate(frame, [accentDelay, accentDelay + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        fontFamily: geistFamily,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
      }}
    >
      {/* Step number badge */}
      <div
        style={{
          opacity: numOpacity,
          transform: `scale(${numScale})`,
          fontFamily: geistMonoFamily,
          fontSize: 14,
          color: COLORS.accent,
          backgroundColor: "#0a1628",
          border: `1px solid ${COLORS.accent}33`,
          borderRadius: 6,
          padding: "5px 16px",
          letterSpacing: 1,
          textTransform: "uppercase" as const,
        }}
      >
        Step {step}
      </div>

      {/* Main title */}
      <div
        style={{
          opacity: titleOpacity,
          transform: `translateY(${(1 - titleY) * 32}px)`,
          fontSize: 62,
          fontWeight: 800,
          color: COLORS.fg,
          letterSpacing: -2,
          textAlign: "center",
          lineHeight: 1.1,
        }}
      >
        {title}
      </div>

      {/* Accent line */}
      {accent && (
        <div
          style={{
            opacity: accentOpacity,
            fontSize: 20,
            color: COLORS.muted,
            textAlign: "center",
            maxWidth: 580,
            lineHeight: 1.5,
          }}
        >
          {accent}
        </div>
      )}
    </AbsoluteFill>
  )
}

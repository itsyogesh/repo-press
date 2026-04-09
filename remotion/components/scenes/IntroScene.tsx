import type React from "react"
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion"
import { COLORS } from "../../colors"
import { geistFamily, geistMonoFamily } from "../../fonts"

interface IntroSceneProps {
  title: string
  subtitle: string
  /** e.g. "Tutorial" | "Launch" */
  badge?: string
}

export const IntroScene: React.FC<IntroSceneProps> = ({ title, subtitle, badge }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const logoScale = spring({ frame, fps, config: { damping: 14, stiffness: 80 } })
  const logoOpacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  const titleDelay = Math.round(0.4 * fps)
  const titleOpacity = interpolate(frame, [titleDelay, titleDelay + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const titleSlide = spring({ frame, fps, config: { damping: 18 }, delay: titleDelay })

  const subtitleDelay = Math.round(0.65 * fps)
  const subtitleOpacity = interpolate(frame, [subtitleDelay, subtitleDelay + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const subtitleSlide = spring({ frame, fps, config: { damping: 18 }, delay: subtitleDelay })

  const badgeDelay = Math.round(0.9 * fps)
  const badgeOpacity = interpolate(frame, [badgeDelay, badgeDelay + 10], [0, 1], {
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
        gap: 28,
      }}
    >
      {/* Logo */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
        }}
      >
        <Img src={staticFile("remotion/icon.svg")} width={72} height={72} alt="RepoPress logo" />
      </div>

      {/* Title */}
      <div
        style={{
          opacity: titleOpacity,
          transform: `translateY(${(1 - titleSlide) * 24}px)`,
          fontSize: 56,
          fontWeight: 800,
          color: COLORS.fg,
          letterSpacing: -1.5,
          textAlign: "center",
          lineHeight: 1.1,
        }}
      >
        {title}
      </div>

      {/* Subtitle */}
      <div
        style={{
          opacity: subtitleOpacity,
          transform: `translateY(${(1 - subtitleSlide) * 20}px)`,
          fontSize: 22,
          color: COLORS.muted,
          textAlign: "center",
          maxWidth: 640,
          lineHeight: 1.5,
        }}
      >
        {subtitle}
      </div>

      {/* Badge */}
      {badge && (
        <div
          style={{
            opacity: badgeOpacity,
            fontFamily: geistMonoFamily,
            fontSize: 12,
            color: COLORS.accent,
            backgroundColor: "#0a1628",
            border: `1px solid ${COLORS.accent}33`,
            borderRadius: 6,
            padding: "5px 14px",
            letterSpacing: 1,
            textTransform: "uppercase" as const,
          }}
        >
          {badge}
        </div>
      )}
    </AbsoluteFill>
  )
}

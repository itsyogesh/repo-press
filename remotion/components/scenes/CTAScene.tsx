import type React from "react"
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion"
import { COLORS } from "../../colors"
import { geistFamily, geistMonoFamily } from "../../fonts"

interface CTASceneProps {
  headline: string
  url: string
}

export const CTAScene: React.FC<CTASceneProps> = ({ headline, url }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const logoScale = spring({ frame, fps, config: { damping: 14, stiffness: 80 } })
  const logoOpacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  const headlineDelay = Math.round(0.35 * fps)
  const headlineOpacity = interpolate(frame, [headlineDelay, headlineDelay + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const headlineSlide = spring({ frame, fps, config: { damping: 18 }, delay: headlineDelay })

  const urlDelay = Math.round(0.7 * fps)
  const urlOpacity = interpolate(frame, [urlDelay, urlDelay + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const urlSlide = spring({ frame, fps, config: { damping: 18 }, delay: urlDelay })

  const btnDelay = Math.round(1.0 * fps)
  const btnScale = spring({ frame, fps, config: { damping: 14, stiffness: 80 }, delay: btnDelay })
  const btnOpacity = interpolate(frame, [btnDelay, btnDelay + 12], [0, 1], {
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
        gap: 32,
      }}
    >
      {/* Logo */}
      <div style={{ opacity: logoOpacity, transform: `scale(${logoScale})` }}>
        <Img src={staticFile("remotion/icon.svg")} width={60} height={60} alt="RepoPress logo" />
      </div>

      {/* Headline */}
      <div
        style={{
          opacity: headlineOpacity,
          transform: `translateY(${(1 - headlineSlide) * 24}px)`,
          fontSize: 48,
          fontWeight: 800,
          color: COLORS.fg,
          textAlign: "center",
          letterSpacing: -1,
          lineHeight: 1.15,
          maxWidth: 700,
        }}
      >
        {headline}
      </div>

      {/* URL pill */}
      <div
        style={{
          opacity: urlOpacity,
          transform: `translateY(${(1 - urlSlide) * 16}px)`,
          fontFamily: geistMonoFamily,
          fontSize: 18,
          color: COLORS.accent,
          backgroundColor: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          padding: "10px 28px",
          letterSpacing: 0.5,
        }}
      >
        {url}
      </div>

      {/* CTA button */}
      <div
        style={{
          opacity: btnOpacity,
          transform: `scale(${btnScale})`,
          backgroundColor: COLORS.accent,
          borderRadius: 10,
          padding: "14px 44px",
          fontSize: 18,
          fontWeight: 700,
          color: COLORS.fg,
          letterSpacing: 0.3,
        }}
      >
        Get Started Free →
      </div>
    </AbsoluteFill>
  )
}

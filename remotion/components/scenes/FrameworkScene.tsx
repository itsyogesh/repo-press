import type React from "react"
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion"
import { COLORS } from "../../colors"
import { geistFamily } from "../../fonts"

interface Framework {
  name: string
  logo: string
  color: string
}

const FRAMEWORKS: Framework[] = [
  { name: "Fumadocs", logo: "remotion/logos/fumadocs.svg", color: "#3b82f6" },
  { name: "Nextra", logo: "remotion/logos/nextra.svg", color: "#ffffff" },
  { name: "Astro", logo: "remotion/logos/astro.svg", color: "#f97316" },
  { name: "Docusaurus", logo: "remotion/logos/docusaurus.svg", color: "#25c2a0" },
  { name: "Hugo", logo: "remotion/logos/hugo.svg", color: "#ff4088" },
]

interface FrameworkSceneProps {
  title?: string
}

export const FrameworkScene: React.FC<FrameworkSceneProps> = ({ title = "Works With Your Stack" }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const titleDelay = Math.round(0.2 * fps)
  const titleOpacity = interpolate(frame, [titleDelay, titleDelay + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const titleSlide = spring({ frame, fps, config: { damping: 18 }, delay: titleDelay })

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        fontFamily: geistFamily,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 52,
        padding: "60px 80px",
      }}
    >
      {/* Title */}
      <div
        style={{
          opacity: titleOpacity,
          transform: `translateY(${(1 - titleSlide) * 24}px)`,
          fontSize: 42,
          fontWeight: 800,
          color: COLORS.fg,
          letterSpacing: -1,
          textAlign: "center",
        }}
      >
        {title}
      </div>

      {/* Logo grid - 5 logos, staggered entrance */}
      <div
        style={{
          display: "flex",
          gap: 36,
          alignItems: "center",
          justifyContent: "center",
          flexWrap: "wrap" as const,
        }}
      >
        {FRAMEWORKS.map((fw, i) => {
          const delay = Math.round(0.5 * fps) + i * 4
          const itemOpacity = interpolate(frame, [delay, delay + 12], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
          const itemScale = spring({ frame, fps, config: { damping: 14, stiffness: 80 }, delay })

          return (
            <div
              key={fw.name}
              style={{
                opacity: itemOpacity,
                transform: `scale(${itemScale})`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 20,
                  backgroundColor: COLORS.surface,
                  border: `1.5px solid ${COLORS.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 16,
                }}
              >
                <Img
                  src={staticFile(fw.logo)}
                  width={48}
                  height={48}
                  alt={`${fw.name} logo`}
                  style={{ objectFit: "contain" }}
                />
              </div>
              <div style={{ fontSize: 13, color: fw.color, fontWeight: 600 }}>{fw.name}</div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

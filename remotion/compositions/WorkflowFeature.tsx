import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"

const ACCENT = "#3b82f6"
const BG = "#000000"
const FG = "#ffffff"
const MUTED = "#6b7280"

const stages = [
  {
    label: "Draft",
    color: "#fbbf24",
    bgColor: "#1c1917",
    borderColor: "#854d0e",
    enterFrame: 10,
    exitFrame: 40,
  },
  {
    label: "In Review",
    color: "#60a5fa",
    bgColor: "#0c1d36",
    borderColor: "#1e40af",
    enterFrame: 40,
    exitFrame: 70,
  },
  {
    label: "Approved",
    color: "#22c55e",
    bgColor: "#052e16",
    borderColor: "#166534",
    enterFrame: 70,
    exitFrame: 100,
  },
  {
    label: "Published",
    color: ACCENT,
    bgColor: "#0a1628",
    borderColor: ACCENT,
    enterFrame: 100,
    exitFrame: 150,
  },
]

const sparkles = [
  { x: -60, y: -30, size: 4, delay: 0 },
  { x: 70, y: -25, size: 3, delay: 3 },
  { x: -45, y: 25, size: 5, delay: 6 },
  { x: 55, y: 30, size: 3, delay: 2 },
  { x: -20, y: -40, size: 4, delay: 5 },
  { x: 30, y: -35, size: 3, delay: 8 },
  { x: -70, y: 5, size: 4, delay: 4 },
  { x: 65, y: 10, size: 5, delay: 7 },
  { x: 0, y: 40, size: 3, delay: 1 },
  { x: -35, y: -10, size: 4, delay: 9 },
  { x: 40, y: -15, size: 3, delay: 6 },
  { x: -10, y: 35, size: 5, delay: 3 },
]

const SparkleIcon: React.FC<{ size: number; color: string; opacity: number }> = ({ size, color, opacity }) => (
  <svg
    width={size * 4}
    height={size * 4}
    viewBox="0 0 16 16"
    fill="none"
    role="img"
    aria-label="Sparkle"
    style={{ opacity }}
  >
    <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5Z" fill={color} />
  </svg>
)

const CheckIcon: React.FC<{ color: string; scale: number }> = ({ color, scale }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="none"
    role="img"
    aria-label="Check icon"
    style={{ transform: `scale(${Math.min(scale, 1)})` }}
  >
    <path d="M4 9l3.5 3.5L14 5" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ArrowConnector: React.FC<{ opacity: number; color: string }> = ({ opacity, color }) => (
  <svg
    width="32"
    height="24"
    viewBox="0 0 32 24"
    fill="none"
    role="img"
    aria-label="Arrow connector"
    style={{ opacity }}
  >
    <path d="M4 12h20M20 6l6 6-6 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const StatusTimeline: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const activeIndex = stages.findIndex((stage) => frame >= stage.enterFrame && frame < stage.exitFrame)
  const currentStage = activeIndex >= 0 ? stages[activeIndex] : stages[stages.length - 1]
  const isPublished = currentStage.label === "Published"

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {stages.map((stage, i) => {
          const isActive = i === activeIndex
          const isPast = i < activeIndex || (activeIndex === -1 && frame >= stages[stages.length - 1].enterFrame)
          const isCurrentPublished = isActive && isPublished

          const badgeScale = spring({
            frame,
            fps,
            config: { damping: 12, stiffness: 100 },
            delay: stage.enterFrame,
          })

          const activeGlow = isActive ? interpolate(frame % 30, [0, 15, 30], [0.5, 1, 0.5]) : 0

          return (
            <div key={`stage-${stage.label}`} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ position: "relative" }}>
                {isCurrentPublished &&
                  sparkles.map((sparkle) => {
                    const sparkleFrame = frame - stage.enterFrame - sparkle.delay
                    const sparkleOpacity = interpolate(sparkleFrame, [0, 8, 16, 24], [0, 1, 1, 0], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    })
                    const sparkleScale = interpolate(sparkleFrame, [0, 10, 24], [0.3, 1, 0.5], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    })
                    const sparkleY = interpolate(sparkleFrame, [0, 24], [0, sparkle.y * 0.5], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    })

                    return (
                      <div
                        key={`sparkle-${sparkle.x}-${sparkle.y}`}
                        style={{
                          position: "absolute",
                          left: `calc(50% + ${sparkle.x}px)`,
                          top: `calc(50% + ${sparkleY}px)`,
                          transform: `scale(${sparkleScale})`,
                          pointerEvents: "none",
                        }}
                      >
                        <SparkleIcon size={sparkle.size} color={ACCENT} opacity={sparkleOpacity} />
                      </div>
                    )
                  })}
                <div
                  style={{
                    transform: `scale(${badgeScale})`,
                    padding: isActive ? "12px 28px" : "10px 20px",
                    borderRadius: 10,
                    fontSize: isActive ? 17 : 14,
                    fontWeight: isActive ? 700 : 500,
                    backgroundColor: isActive || isPast ? stage.bgColor : "#111",
                    color: isActive || isPast ? stage.color : "#555",
                    border: `1.5px solid ${isActive ? stage.borderColor : isPast ? stage.borderColor : "#333"}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    boxShadow: isActive ? `0 0 ${activeGlow * 20}px ${stage.color}33` : "none",
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  {isPast && !isActive && <CheckIcon color={stage.color} scale={1} />}
                  {stage.label}
                </div>
              </div>
              {i < stages.length - 1 && (
                <ArrowConnector
                  opacity={isPast || isActive ? 0.8 : 0.2}
                  color={isPast ? stages[i + 1].color : "#333"}
                />
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, color: MUTED, fontSize: 14 }}>
        {isPublished ? (
          <>
            <svg width="16" height="16" viewBox="0 0 16 16" fill={ACCENT} role="img" aria-label="Published icon">
              <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zM6.354 11.354l-3.708-3.708 1.415-1.415L6.354 8.52l5.585-5.585 1.415 1.415-7 7z" />
            </svg>
            <span style={{ color: ACCENT, fontWeight: 500 }}>Published to GitHub</span>
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" role="img" aria-label="Progress icon">
              <circle cx="8" cy="8" r="7" stroke={MUTED} strokeWidth="1.5" />
              <path d="M8 4v4l3 1.5" stroke={MUTED} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>{currentStage.label} · Workflow in progress</span>
          </>
        )}
      </div>
    </div>
  )
}

export const WorkflowFeature: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const titleOpacity = spring({ frame, fps, config: { damping: 20 } })
  const taglineDelay = 110
  const taglineOpacity = interpolate(frame, [taglineDelay, taglineDelay + 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const taglineSlide = spring({ frame, fps, config: { damping: 15 }, delay: taglineDelay })

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        fontFamily: "system-ui, -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 60,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 40,
          left: 60,
          display: "flex",
          alignItems: "center",
          gap: 12,
          opacity: titleOpacity,
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" role="img" aria-label="Workflow icon">
          <path
            d="M4 6h4v4H4zM10 6h4v4h-4zM16 6h4v4h-4zM8 8h2M14 8h2"
            stroke={ACCENT}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path d="M12 14v4" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
          <rect x="8" y="18" width="8" height="3" rx="1.5" stroke={ACCENT} strokeWidth="2" />
        </svg>
        <span style={{ color: MUTED, fontSize: 16, fontWeight: 500, letterSpacing: 2, textTransform: "uppercase" }}>
          Editorial Workflow
        </span>
      </div>

      <div style={{ marginBottom: 40 }}>
        <StatusTimeline />
      </div>

      <div
        style={{
          opacity: taglineOpacity,
          transform: `translateY(${(1 - taglineSlide) * 20}px)`,
          textAlign: "center",
        }}
      >
        <div style={{ color: FG, fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          Built-in <span style={{ color: ACCENT }}>editorial workflow</span>
        </div>
        <div style={{ color: MUTED, fontSize: 16 }}>Draft → Review → Publish, with full control</div>
      </div>
    </AbsoluteFill>
  )
}

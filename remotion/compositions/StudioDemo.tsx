import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion"
import { geistFamily, geistMonoFamily } from "../fonts"

const ACCENT = "#3b82f6"
const BG = "#000000"
const FG = "#ffffff"
const MUTED = "#6b7280"

const Scene: React.FC<{ children: React.ReactNode; label: string; step: number }> = ({ children, label, step }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const labelOpacity = spring({ frame, fps, config: { damping: 20 } })
  const contentOpacity = interpolate(frame, [8, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        fontFamily: geistFamily,
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
          opacity: labelOpacity,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: ACCENT,
            color: BG,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {step}
        </div>
        <span style={{ color: MUTED, fontSize: 16, fontWeight: 500, letterSpacing: 2, textTransform: "uppercase" }}>
          {label}
        </span>
      </div>
      <div style={{ opacity: contentOpacity, width: "100%" }}>{children}</div>
    </AbsoluteFill>
  )
}

const ConnectScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const cardScale = spring({ frame, fps, config: { damping: 12, stiffness: 80 }, delay: 10 })
  const buttonProgress = spring({ frame, fps, config: { damping: 15 }, delay: 40 })
  const checkOpacity = interpolate(frame, [55, 65], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  return (
    <Scene label="Connect" step={1}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div
          style={{
            transform: `scale(${cardScale})`,
            border: "1px solid #333",
            borderRadius: 16,
            padding: "32px 40px",
            width: 480,
            backgroundColor: "#111",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
            <GithubIcon />
            <div>
              <div style={{ color: FG, fontSize: 20, fontWeight: 600 }}>my-docs-site</div>
              <div style={{ color: MUTED, fontSize: 14 }}>tarun/my-docs-site · main</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <Tag text="MDX" />
            <Tag text="fumadocs" />
            <Tag text="12 files" />
          </div>
          <div
            style={{
              backgroundColor: buttonProgress > 0.5 ? ACCENT : "#222",
              borderRadius: 8,
              padding: "10px 0",
              textAlign: "center" as const,
              color: FG,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              transform: `scaleX(${buttonProgress})`,
              transformOrigin: "left",
            }}
          >
            {checkOpacity > 0.5 ? "✓ Connected" : "Connect Repository"}
          </div>
        </div>
      </div>
    </Scene>
  )
}

const Tag: React.FC<{ text: string }> = ({ text }) => (
  <span
    style={{
      backgroundColor: "#1e293b",
      color: ACCENT,
      fontSize: 12,
      fontWeight: 500,
      padding: "4px 10px",
      borderRadius: 6,
    }}
  >
    {text}
  </span>
)

const GithubIcon: React.FC = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill={FG} role="img" aria-label="GitHub">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
  </svg>
)

const EditScene: React.FC = () => {
  const frame = useCurrentFrame()

  const lines = [
    { text: "---", color: MUTED },
    { text: 'title: "Getting Started"', color: ACCENT },
    { text: 'description: "Quick setup guide"', color: ACCENT },
    { text: "---", color: MUTED },
    { text: "", color: FG },
    { text: "# Getting Started", color: FG },
    { text: "", color: FG },
    { text: "Install the package using npm:", color: MUTED },
    { text: "```bash", color: "#22c55e" },
    { text: "npm install repopress", color: "#22c55e" },
    { text: "```", color: "#22c55e" },
  ]

  return (
    <Scene label="Edit" step={2}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div
          style={{
            backgroundColor: "#111",
            borderRadius: 12,
            border: "1px solid #333",
            width: 640,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 16px",
              borderBottom: "1px solid #222",
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#ef4444" }} />
            <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#eab308" }} />
            <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#22c55e" }} />
            <span style={{ color: MUTED, fontSize: 13, marginLeft: 8 }}>getting-started.mdx</span>
          </div>
          <div style={{ padding: "16px 20px", fontFamily: geistMonoFamily, fontSize: 14, lineHeight: 1.7 }}>
            {lines.map((line, i) => {
              const charCount = interpolate(frame, [i * 5 + 5, i * 5 + 15], [0, line.text.length], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })
              return (
                <div key={`line-${i}-${line.text.slice(0, 10)}`} style={{ color: line.color, minHeight: 20 }}>
                  {line.text.slice(0, Math.floor(charCount))}
                  {charCount > 0 && charCount < line.text.length && (
                    <span style={{ opacity: frame % 15 < 8 ? 1 : 0, color: ACCENT }}>▎</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Scene>
  )
}

const ReviewScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const badgeSlide = spring({ frame, fps, config: { damping: 15 }, delay: 5 })
  const transitionFrame = 35
  const showApproved = frame > transitionFrame
  const checkScale = spring({ frame: frame - transitionFrame, fps, config: { damping: 10, stiffness: 100 } })
  const approvedOpacity = interpolate(frame, [transitionFrame, transitionFrame + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  return (
    <Scene label="Review" step={3}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 32 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            transform: `translateY(${(1 - badgeSlide) * 30}px)`,
          }}
        >
          <div
            style={{
              padding: "12px 28px",
              borderRadius: 10,
              fontSize: 18,
              fontWeight: 600,
              backgroundColor: showApproved ? "#052e16" : "#1c1917",
              color: showApproved ? "#22c55e" : "#fbbf24",
              border: `1px solid ${showApproved ? "#166534" : "#854d0e"}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            {showApproved && (
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                role="img"
                aria-label="Checkmark"
                style={{ transform: `scale(${Math.min(checkScale, 1)})` }}
              >
                <path
                  d="M4 10l4 4 8-8"
                  stroke="#22c55e"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {showApproved ? "Approved" : "Draft"}
          </div>
        </div>
        <div
          style={{
            opacity: approvedOpacity,
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: MUTED,
            fontSize: 14,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill={MUTED} role="img" aria-label="Clock">
            <circle cx="8" cy="8" r="7" fill="none" stroke={MUTED} strokeWidth="1.5" />
            <path d="M8 4v4l3 1.5" fill="none" stroke={MUTED} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Reviewed by 2 editors · Ready to publish
        </div>
      </div>
    </Scene>
  )
}

const PublishScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const buttonScale = spring({ frame, fps, config: { damping: 12 }, delay: 5 })
  const clickFrame = 25
  const clicked = frame > clickFrame
  const ripple = interpolate(frame, [clickFrame, clickFrame + 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const shaReveal = interpolate(frame, [clickFrame + 15, clickFrame + 35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const commitSha = "a3f7b2c"

  const shaChars = Math.floor(shaReveal * commitSha.length)

  return (
    <Scene label="Publish" step={4}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 32 }}>
        <div
          style={{
            transform: `scale(${buttonScale * (clicked ? 0.95 : 1)})`,
            backgroundColor: clicked ? "#1d4ed8" : ACCENT,
            borderRadius: 12,
            padding: "14px 48px",
            color: FG,
            fontSize: 18,
            fontWeight: 700,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {clicked && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: ripple * 200,
                height: ripple * 200,
                borderRadius: "50%",
                backgroundColor: "rgba(255,255,255,0.2)",
                transform: "translate(-50%, -50%)",
              }}
            />
          )}
          {clicked ? "Publishing..." : "Publish to GitHub"}
        </div>
        {shaReveal > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, opacity: shaReveal }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill={ACCENT} role="img" aria-label="Success">
              <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zM6.354 11.354l-3.708-3.708 1.415-1.415L6.354 8.52l5.585-5.585 1.415 1.415-7 7z" />
            </svg>
            <span style={{ color: FG, fontSize: 16, fontWeight: 500 }}>Committed to</span>
            <code
              style={{
                backgroundColor: "#1e293b",
                color: ACCENT,
                padding: "4px 12px",
                borderRadius: 6,
                fontSize: 15,
                fontFamily: geistMonoFamily,
                fontWeight: 600,
              }}
            >
              {commitSha.slice(0, shaChars)}
              {shaChars < commitSha.length && <span style={{ opacity: frame % 10 < 5 ? 1 : 0 }}>_</span>}
            </code>
          </div>
        )}
      </div>
    </Scene>
  )
}

export const StudioDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Sequence from={0} durationInFrames={75} premountFor={30}>
        <ConnectScene />
      </Sequence>
      <Sequence from={75} durationInFrames={75} premountFor={30}>
        <EditScene />
      </Sequence>
      <Sequence from={150} durationInFrames={75} premountFor={30}>
        <ReviewScene />
      </Sequence>
      <Sequence from={225} durationInFrames={75} premountFor={30}>
        <PublishScene />
      </Sequence>
    </AbsoluteFill>
  )
}

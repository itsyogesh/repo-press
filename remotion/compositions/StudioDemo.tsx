import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion"
import { COLORS } from "../colors"
import { geistFamily, geistMonoFamily } from "../fonts"

export { studioDemoComposition } from "./studio-demo-composition"

// ── Shared primitives ────────────────────────────────────────────────────────

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
        backgroundColor: COLORS.bg,
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
            backgroundColor: COLORS.accent,
            color: COLORS.bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {step}
        </div>
        <span
          style={{ color: COLORS.muted, fontSize: 16, fontWeight: 500, letterSpacing: 2, textTransform: "uppercase" }}
        >
          {label}
        </span>
      </div>
      <div style={{ opacity: contentOpacity, width: "100%" }}>{children}</div>
    </AbsoluteFill>
  )
}

// Pill caption strip that appears at the bottom of every scene.
const CaptionBar: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const opacity = spring({ frame, fps, config: { damping: 25 }, delay: 20 })

  return (
    <div
      style={{
        position: "absolute",
        bottom: 40,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        opacity,
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.13)",
          borderRadius: 24,
          padding: "8px 22px",
          color: COLORS.fg,
          fontSize: 15,
          fontWeight: 500,
          fontFamily: geistFamily,
          letterSpacing: 0.2,
        }}
      >
        {text}
      </div>
    </div>
  )
}

// ── Scene 1: Config ──────────────────────────────────────────────────────────

const CONFIG_LINES: Array<{ text: string; color: string; callout?: string }> = [
  { text: "{", color: COLORS.fg },
  { text: '  "version": 1,', color: COLORS.fg },
  { text: '  "projects": [', color: COLORS.fg },
  { text: "    {", color: COLORS.fg },
  { text: '      "name": "My Docs",', color: COLORS.muted },
  { text: '      "contentRoot": "docs",', color: COLORS.accent, callout: "Your content folder" },
  { text: '      "framework": "auto"', color: COLORS.accent, callout: "Auto-detected" },
  { text: "    }", color: COLORS.fg },
  { text: "  ]", color: COLORS.fg },
  { text: "}", color: COLORS.fg },
]

const FRAMES_PER_LINE = 14

const ConfigScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const windowScale = spring({ frame, fps, config: { damping: 14, stiffness: 80 }, delay: 5 })

  return (
    <Scene label="Config" step={1}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div
          style={{
            transform: `scale(${windowScale})`,
            transformOrigin: "center",
            backgroundColor: COLORS.surface,
            borderRadius: 12,
            border: `1px solid ${COLORS.border}`,
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
              borderBottom: `1px solid ${COLORS.borderSubtle}`,
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#ef4444" }} />
            <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#eab308" }} />
            <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.green }} />
            <span style={{ color: COLORS.muted, fontSize: 13, marginLeft: 8, fontFamily: geistMonoFamily }}>
              repopress.config.json
            </span>
          </div>
          <div style={{ padding: "16px 20px", fontFamily: geistMonoFamily, fontSize: 14, lineHeight: 1.8 }}>
            {CONFIG_LINES.map((line, i) => {
              const lineStart = i * FRAMES_PER_LINE + 10
              const charCount = interpolate(frame, [lineStart, lineStart + 12], [0, line.text.length], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })
              const calloutOpacity = line.callout
                ? spring({ frame: Math.max(0, frame - (lineStart + 12)), fps, config: { damping: 18 } })
                : 0
              const calloutX = line.callout
                ? interpolate(frame, [lineStart + 12, lineStart + 22], [20, 0], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })
                : 0

              return (
                <div
                  key={line.text}
                  style={{ color: line.color, minHeight: 24, display: "flex", alignItems: "center" }}
                >
                  <span>
                    {line.text.slice(0, Math.floor(charCount))}
                    {charCount > 0 && charCount < line.text.length && (
                      <span style={{ opacity: frame % 15 < 8 ? 1 : 0, color: COLORS.accent }}>▎</span>
                    )}
                  </span>
                  {line.callout && (
                    <span
                      style={{
                        marginLeft: 12,
                        opacity: calloutOpacity,
                        transform: `translateX(${calloutX}px)`,
                        backgroundColor: "rgba(59,130,246,0.12)",
                        border: "1px solid rgba(59,130,246,0.3)",
                        borderRadius: 6,
                        padding: "2px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                        color: COLORS.accent,
                        letterSpacing: 0.3,
                        fontFamily: geistFamily,
                      }}
                    >
                      {line.callout}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <CaptionBar text="Drop one file in your repo root" />
    </Scene>
  )
}

// ── Scene 2: Connect ─────────────────────────────────────────────────────────

const GithubIcon: React.FC = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill={COLORS.fg} role="img" aria-label="GitHub">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
  </svg>
)

const Tag: React.FC<{ text: string }> = ({ text }) => (
  <span
    style={{
      backgroundColor: "#1e293b",
      color: COLORS.accent,
      fontSize: 12,
      fontWeight: 500,
      padding: "4px 10px",
      borderRadius: 6,
    }}
  >
    {text}
  </span>
)

const ConnectScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const cardScale = spring({ frame, fps, config: { damping: 12, stiffness: 80 }, delay: 10 })
  const detectBadgeOpacity = spring({ frame, fps, config: { damping: 18 }, delay: 10 })
  const buttonProgress = spring({ frame, fps, config: { damping: 15 }, delay: 40 })
  const checkOpacity = interpolate(frame, [55, 65], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  return (
    <Scene label="Connect" step={2}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div
          style={{
            transform: `scale(${cardScale})`,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            padding: "32px 40px",
            width: 480,
            backgroundColor: COLORS.surface,
          }}
        >
          {/* Config-detected indicator — shows the link between the config file and this step */}
          <div
            style={{
              opacity: detectBadgeOpacity,
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 20,
              backgroundColor: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.3)",
              borderRadius: 8,
              padding: "6px 12px",
              width: "fit-content",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" role="img" aria-label="Config detected">
              <circle cx="6" cy="6" r="5" fill="none" stroke={COLORS.green} strokeWidth="1.5" />
              <path
                d="M3.5 6l1.5 1.5 3-3"
                stroke={COLORS.green}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span style={{ color: COLORS.green, fontSize: 12, fontWeight: 600, fontFamily: geistMonoFamily }}>
              repopress.config.json detected
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
            <GithubIcon />
            <div>
              <div style={{ color: COLORS.fg, fontSize: 20, fontWeight: 600 }}>my-docs-site</div>
              <div style={{ color: COLORS.muted, fontSize: 14 }}>tarun/my-docs-site · main</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <Tag text="MDX" />
            <Tag text="fumadocs" />
            <Tag text="12 files" />
          </div>
          <div
            style={{
              backgroundColor: buttonProgress > 0.5 ? COLORS.accent : COLORS.surfaceHigh,
              borderRadius: 8,
              padding: "10px 0",
              textAlign: "center" as const,
              color: COLORS.fg,
              fontSize: 15,
              fontWeight: 600,
              transform: `scaleX(${buttonProgress})`,
              transformOrigin: "left",
            }}
          >
            {checkOpacity > 0.5 ? "✓ Connected" : "Connect Repository"}
          </div>
        </div>
      </div>
      <CaptionBar text="RepoPress finds your project automatically" />
    </Scene>
  )
}

// ── Scene 3: Edit ─────────────────────────────────────────────────────────────

const EditScene: React.FC = () => {
  const frame = useCurrentFrame()

  const lines = [
    { text: "---", color: COLORS.muted },
    { text: 'title: "Getting Started"', color: COLORS.accent },
    { text: 'description: "Deploy your first docs"', color: COLORS.accent },
    { text: "---", color: COLORS.muted },
    { text: "", color: COLORS.fg },
    { text: "# Getting Started", color: COLORS.fg },
    { text: "", color: COLORS.fg },
    { text: "RepoPress reads your `repopress.config.json`", color: COLORS.muted },
    { text: "to detect your content and framework.", color: COLORS.muted },
    { text: "", color: COLORS.fg },
    { text: "> Your docs stay in Git. Always.", color: COLORS.green },
  ]

  return (
    <Scene label="Edit" step={3}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 12,
            border: `1px solid ${COLORS.border}`,
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
              borderBottom: `1px solid ${COLORS.borderSubtle}`,
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#ef4444" }} />
            <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#eab308" }} />
            <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.green }} />
            <span style={{ color: COLORS.muted, fontSize: 13, marginLeft: 8 }}>getting-started.mdx</span>
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
                    <span style={{ opacity: frame % 15 < 8 ? 1 : 0, color: COLORS.accent }}>▎</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <CaptionBar text="Edit in the browser — content stays in Git" />
    </Scene>
  )
}

// ── Scene 4: Publish ──────────────────────────────────────────────────────────

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
            backgroundColor: clicked ? "#1d4ed8" : COLORS.accent,
            borderRadius: 12,
            padding: "14px 48px",
            color: COLORS.fg,
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
            <svg width="20" height="20" viewBox="0 0 16 16" fill={COLORS.accent} role="img" aria-label="Success">
              <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zM6.354 11.354l-3.708-3.708 1.415-1.415L6.354 8.52l5.585-5.585 1.415 1.415-7 7z" />
            </svg>
            <span style={{ color: COLORS.fg, fontSize: 16, fontWeight: 500 }}>Committed to</span>
            <code
              style={{
                backgroundColor: "#1e293b",
                color: COLORS.accent,
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
      <CaptionBar text="One click commits directly to your branch" />
    </Scene>
  )
}

// ── Main composition ──────────────────────────────────────────────────────────
// Total: 160 + 120 + 180 + 140 = 600 frames (20 s at 30 fps)

export const StudioDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      <Sequence from={0} durationInFrames={160} premountFor={30}>
        <ConfigScene />
      </Sequence>
      <Sequence from={160} durationInFrames={120} premountFor={30}>
        <ConnectScene />
      </Sequence>
      <Sequence from={280} durationInFrames={180} premountFor={30}>
        <EditScene />
      </Sequence>
      <Sequence from={460} durationInFrames={140} premountFor={30}>
        <PublishScene />
      </Sequence>
    </AbsoluteFill>
  )
}

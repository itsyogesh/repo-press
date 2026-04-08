import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"

const ACCENT = "#3b82f6"
const BG = "#000000"
const FG = "#ffffff"
const MUTED = "#6b7280"

const COMMIT_COLORS = ["#22c55e", ACCENT, "#a855f7", "#f59e0b", "#ef4444"]

const commits = [
  { sha: "a3f7b2c", message: "Add getting-started.mdx", branch: "main" },
  { sha: "e1d9f4a", message: "Update intro section", branch: "main" },
  { sha: "b8c2e5d", message: "New blog post: v2 launch", branch: "feat/blog" },
  { sha: "f4a1c7e", message: "Fix typo in docs", branch: "main" },
  { sha: "d9e3b6f", message: "Add API reference page", branch: "main" },
]

const GitTree: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 340 }}>
      {commits.map((commit, i) => {
        const delay = i * 12
        const nodeScale = spring({ frame, fps, config: { damping: 12, stiffness: 100 }, delay })
        const lineOpacity = interpolate(frame, [delay + 5, delay + 15], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
        const isBranch = commit.branch !== "main"

        return (
          <div
            key={`commit-${commit.sha}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              opacity: nodeScale,
              transform: `translateX(${(1 - nodeScale) * 20}px)`,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20 }}>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: COMMIT_COLORS[i % COMMIT_COLORS.length],
                  transform: `scale(${nodeScale})`,
                  marginLeft: isBranch ? 16 : 0,
                }}
              />
              {i < commits.length - 1 && (
                <div
                  style={{
                    width: 2,
                    height: 12,
                    backgroundColor: "#333",
                    opacity: lineOpacity,
                    marginLeft: isBranch ? 16 : 0,
                  }}
                />
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code
                  style={{
                    color: ACCENT,
                    fontSize: 11,
                    fontFamily: "ui-monospace, monospace",
                    fontWeight: 600,
                  }}
                >
                  {commit.sha}
                </code>
                {isBranch && (
                  <span
                    style={{
                      fontSize: 10,
                      color: "#a855f7",
                      backgroundColor: "#1a0a2e",
                      padding: "1px 6px",
                      borderRadius: 4,
                      fontWeight: 500,
                    }}
                  >
                    {commit.branch}
                  </span>
                )}
              </div>
              <div style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>{commit.message}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const RenderedPage: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const pageDelay = 70
  const pageScale = spring({ frame, fps, config: { damping: 14, stiffness: 80 }, delay: pageDelay })
  const pageOpacity = interpolate(frame, [pageDelay, pageDelay + 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  return (
    <div
      style={{
        opacity: pageOpacity,
        transform: `scale(${pageScale})`,
        backgroundColor: "#111",
        borderRadius: 12,
        border: "1px solid #333",
        width: 320,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid #222",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444" }} />
        <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#eab308" }} />
        <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e" }} />
        <span style={{ color: MUTED, fontSize: 11, marginLeft: 6 }}>localhost:3001/docs/getting-started</span>
      </div>
      <div style={{ padding: "18px 20px" }}>
        <div style={{ color: FG, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Getting Started</div>
        <div
          style={{
            width: "100%",
            height: 6,
            backgroundColor: "#222",
            borderRadius: 3,
            marginBottom: 6,
          }}
        >
          <div
            style={{
              width: "85%",
              height: "100%",
              backgroundColor: MUTED,
              borderRadius: 3,
              opacity: 0.5,
            }}
          />
        </div>
        <div
          style={{
            width: "100%",
            height: 6,
            backgroundColor: "#222",
            borderRadius: 3,
            marginBottom: 6,
          }}
        >
          <div
            style={{
              width: "65%",
              height: "100%",
              backgroundColor: MUTED,
              borderRadius: 3,
              opacity: 0.5,
            }}
          />
        </div>
        <div
          style={{
            marginTop: 12,
            backgroundColor: "#0a1628",
            borderRadius: 8,
            border: "1px solid #1e3a5f",
            padding: "10px 14px",
            fontFamily: "ui-monospace, monospace",
            fontSize: 12,
            color: "#22c55e",
          }}
        >
          $ npm install repopress
        </div>
      </div>
    </div>
  )
}

const ArrowIcon: React.FC<{ opacity: number }> = ({ opacity }) => (
  <svg
    width="40"
    height="40"
    viewBox="0 0 40 40"
    fill="none"
    role="img"
    aria-label="Transform arrow"
    style={{ opacity }}
  >
    <path d="M8 20h24M24 12l8 8-8 8" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const GitNativeFeature: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const titleOpacity = spring({ frame, fps, config: { damping: 20 } })
  const arrowOpacity = interpolate(frame, [55, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const taglineDelay = 100
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
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" role="img" aria-label="Git branch icon">
          <circle cx="6" cy="6" r="2.5" stroke={ACCENT} strokeWidth="2" />
          <circle cx="18" cy="6" r="2.5" stroke={ACCENT} strokeWidth="2" />
          <circle cx="6" cy="18" r="2.5" stroke={ACCENT} strokeWidth="2" />
          <path d="M6 8.5v7M18 8.5v2c0 2-2 3.5-4 4l-5.5 1.5" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span style={{ color: MUTED, fontSize: 16, fontWeight: 500, letterSpacing: 2, textTransform: "uppercase" }}>
          Git-Native CMS
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 32, marginBottom: 40 }}>
        <GitTree />
        <ArrowIcon opacity={arrowOpacity} />
        <RenderedPage />
      </div>

      <div
        style={{
          opacity: taglineOpacity,
          transform: `translateY(${(1 - taglineSlide) * 20}px)`,
          textAlign: "center",
        }}
      >
        <div style={{ color: FG, fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          Content stays in Git. <span style={{ color: ACCENT }}>Always.</span>
        </div>
        <div style={{ color: MUTED, fontSize: 16 }}>Your repo IS your CMS</div>
      </div>
    </AbsoluteFill>
  )
}

import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"

const ACCENT = "#3b82f6"
const BG = "#000000"
const FG = "#ffffff"
const MUTED = "#6b7280"

const mdxLines = [
  { text: "---", color: MUTED },
  { text: 'title: "Quick Start Guide"', color: ACCENT },
  { text: "draft: false", color: "#f59e0b" },
  { text: "---", color: MUTED },
  { text: "", color: FG },
  { text: "# Quick Start Guide", color: FG },
  { text: "", color: FG },
  { text: "Welcome to **RepoPress**.", color: FG },
  { text: "", color: FG },
  { text: "## Installation", color: FG },
  { text: "", color: FG },
  { text: "```bash", color: "#22c55e" },
  { text: "npx create-repopress", color: "#22c55e" },
  { text: "```", color: "#22c55e" },
  { text: "", color: FG },
  { text: "<Callout type='info'>", color: "#a855f7" },
  { text: "  MDX components work!", color: "#a855f7" },
  { text: "</Callout>", color: "#a855f7" },
]

const EditorPane: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const paneScale = spring({ frame, fps, config: { damping: 14 }, delay: 5 })

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: "#111",
        borderRadius: "12px 0 0 12px",
        borderRight: "1px solid #222",
        overflow: "hidden",
        transform: `scale(${paneScale})`,
        transformOrigin: "right center",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          borderBottom: "1px solid #222",
        }}
      >
        <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444" }} />
        <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#eab308" }} />
        <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e" }} />
        <span style={{ color: MUTED, fontSize: 11, marginLeft: 6 }}>quick-start.mdx</span>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 10,
            color: ACCENT,
            backgroundColor: "#0a1628",
            padding: "2px 8px",
            borderRadius: 4,
            fontWeight: 500,
          }}
        >
          MDX
        </span>
      </div>
      <div
        style={{
          padding: "12px 16px",
          fontFamily: "ui-monospace, monospace",
          fontSize: 11,
          lineHeight: 1.6,
          overflow: "hidden",
          height: 280,
        }}
      >
        {mdxLines.map((line, i) => {
          const charDelay = i * 6 + 10
          const charCount = interpolate(frame, [charDelay, charDelay + 12], [0, line.text.length], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
          const visibleChars = Math.floor(charCount)

          return (
            <div key={`mdx-${line.text.slice(0, 12) || "blank"}-${i}`} style={{ color: line.color, minHeight: 16 }}>
              {line.text.slice(0, visibleChars)}
              {visibleChars > 0 && visibleChars < line.text.length && (
                <span style={{ opacity: frame % 14 < 7 ? 1 : 0, color: ACCENT }}>▎</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const previewSections = [
  { type: "title", text: "Quick Start Guide", delay: 40 },
  { type: "paragraph", text: "Welcome to RepoPress.", delay: 65 },
  { type: "heading", text: "Installation", delay: 80 },
  { type: "codeblock", text: "npx create-repopress", delay: 95 },
  { type: "callout", text: "MDX components work!", delay: 120 },
]

const PreviewPane: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const paneScale = spring({ frame, fps, config: { damping: 14 }, delay: 10 })

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: "#0a0a0a",
        borderRadius: "0 12px 12px 0",
        overflow: "hidden",
        transform: `scale(${paneScale})`,
        transformOrigin: "left center",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 14px",
          borderBottom: "1px solid #222",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" role="img" aria-label="Preview icon">
          <rect x="1" y="1" width="14" height="14" rx="2" stroke={MUTED} strokeWidth="1.5" />
          <circle cx="8" cy="8" r="3" stroke={ACCENT} strokeWidth="1.5" />
        </svg>
        <span style={{ color: MUTED, fontSize: 11, marginLeft: 8, fontWeight: 500 }}>Preview</span>
      </div>
      <div style={{ padding: "16px 20px", overflow: "hidden", height: 280 }}>
        {previewSections.map((section) => {
          const sectionOpacity = interpolate(frame, [section.delay, section.delay + 12], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
          const sectionSlide = spring({
            frame,
            fps,
            config: { damping: 15 },
            delay: section.delay,
          })

          if (section.type === "title") {
            return (
              <div
                key={`preview-${section.type}-${section.text.slice(0, 10)}`}
                style={{
                  opacity: sectionOpacity,
                  transform: `translateY(${(1 - sectionSlide) * 10}px)`,
                  color: FG,
                  fontSize: 20,
                  fontWeight: 700,
                  marginBottom: 10,
                }}
              >
                {section.text}
              </div>
            )
          }

          if (section.type === "paragraph") {
            return (
              <div
                key={`preview-${section.type}-${section.text.slice(0, 10)}`}
                style={{
                  opacity: sectionOpacity,
                  transform: `translateY(${(1 - sectionSlide) * 10}px)`,
                  color: MUTED,
                  fontSize: 13,
                  marginBottom: 12,
                  lineHeight: 1.5,
                }}
              >
                {section.text}
              </div>
            )
          }

          if (section.type === "heading") {
            return (
              <div
                key={`preview-${section.type}-${section.text.slice(0, 10)}`}
                style={{
                  opacity: sectionOpacity,
                  transform: `translateY(${(1 - sectionSlide) * 10}px)`,
                  color: FG,
                  fontSize: 16,
                  fontWeight: 600,
                  marginBottom: 8,
                  borderBottom: "1px solid #222",
                  paddingBottom: 6,
                }}
              >
                {section.text}
              </div>
            )
          }

          if (section.type === "codeblock") {
            return (
              <div
                key={`preview-${section.type}-${section.text.slice(0, 10)}`}
                style={{
                  opacity: sectionOpacity,
                  transform: `translateY(${(1 - sectionSlide) * 10}px)`,
                  backgroundColor: "#0a1628",
                  borderRadius: 8,
                  border: "1px solid #1e3a5f",
                  padding: "8px 12px",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 12,
                  color: "#22c55e",
                  marginBottom: 12,
                }}
              >
                {section.text}
              </div>
            )
          }

          return (
            <div
              key={`preview-${section.type}-${section.text.slice(0, 10)}`}
              style={{
                opacity: sectionOpacity,
                transform: `translateY(${(1 - sectionSlide) * 10}px)`,
                backgroundColor: "#0c1d36",
                borderLeft: `3px solid ${ACCENT}`,
                borderRadius: "0 8px 8px 0",
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" role="img" aria-label="Info icon">
                <circle cx="8" cy="8" r="7" stroke={ACCENT} strokeWidth="1.5" />
                <path d="M8 7v4M8 5v0.5" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span style={{ color: ACCENT, fontSize: 12, fontWeight: 500 }}>{section.text}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const MDXEditorFeature: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const titleOpacity = spring({ frame, fps, config: { damping: 20 } })
  const taglineDelay = 160
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
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" role="img" aria-label="Editor icon">
          <rect x="3" y="3" width="18" height="18" rx="3" stroke={ACCENT} strokeWidth="2" />
          <path d="M7 8h10M7 12h6M7 16h8" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span style={{ color: MUTED, fontSize: 16, fontWeight: 500, letterSpacing: 2, textTransform: "uppercase" }}>
          Visual MDX Editing
        </span>
      </div>

      <div
        style={{
          display: "flex",
          width: 800,
          height: 320,
          borderRadius: 12,
          border: "1px solid #333",
          overflow: "hidden",
          marginBottom: 32,
        }}
      >
        <EditorPane />
        <PreviewPane />
      </div>

      <div
        style={{
          opacity: taglineOpacity,
          transform: `translateY(${(1 - taglineSlide) * 20}px)`,
          textAlign: "center",
        }}
      >
        <div style={{ color: FG, fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          Edit visually. <span style={{ color: ACCENT }}>Commit to Git.</span>
        </div>
        <div style={{ color: MUTED, fontSize: 16 }}>Side-by-side MDX editing with live preview</div>
      </div>
    </AbsoluteFill>
  )
}

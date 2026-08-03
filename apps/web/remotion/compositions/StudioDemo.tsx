import { linearTiming, TransitionSeries } from "@remotion/transitions"
import { fade } from "@remotion/transitions/fade"
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"
import { COLORS } from "../colors"
import { geistFamily, geistMonoFamily } from "../fonts"

export { studioDemoComposition } from "./studio-demo-composition"

// ── Spring configs ─────────────────────────────────────────────────────────────
const SPRING_SMOOTH = { damping: 200 } as const
const SPRING_SNAPPY = { damping: 20, stiffness: 200 } as const

// ── Layout constants ──────────────────────────────────────────────────────────

const BROWSER_W = 1040
const BROWSER_TOOLBAR_H = 44
const BROWSER_CONTENT_H = 400

// ── Shared primitives ─────────────────────────────────────────────────────────

const TrafficLights: React.FC = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
    <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#ef4444" }} />
    <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#eab308" }} />
    <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.green }} />
  </div>
)

const GithubIcon: React.FC = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill={COLORS.fg} role="img" aria-label="GitHub">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
  </svg>
)

// Browser chrome wrapper - gives every scene the same desktop + window + caption frame
const BrowserScene: React.FC<{
  children: React.ReactNode
  label: string
  step: number
  url: string
  caption: string
}> = ({ children, label, step, url, caption }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const labelOpacity = spring({ frame, fps, config: SPRING_SMOOTH })
  const browserEnter = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const captionOpacity = spring({ frame, fps, config: SPRING_SMOOTH, delay: 18 })

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.desktopBg,
        fontFamily: geistFamily,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Step label row */}
      <div
        style={{
          width: BROWSER_W,
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
          opacity: labelOpacity,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: COLORS.accent,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {step}
        </div>
        <span
          style={{
            color: COLORS.muted,
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: 2,
            textTransform: "uppercase" as const,
          }}
        >
          {label}
        </span>
      </div>

      {/* Browser window */}
      <div
        style={{
          width: BROWSER_W,
          opacity: browserEnter,
          borderRadius: 10,
          overflow: "hidden",
          border: `1px solid ${COLORS.browserBorder}`,
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
        }}
      >
        {/* Toolbar */}
        <div
          style={{
            height: BROWSER_TOOLBAR_H,
            backgroundColor: COLORS.browserChrome,
            borderBottom: `1px solid ${COLORS.browserBorder}`,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 16px",
          }}
        >
          <TrafficLights />
          <div
            style={{
              flex: 1,
              maxWidth: 520,
              height: 26,
              backgroundColor: COLORS.browserBar,
              borderRadius: 6,
              border: `1px solid ${COLORS.browserBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto",
            }}
          >
            <span style={{ color: COLORS.muted, fontSize: 12, fontFamily: geistMonoFamily }}>{url}</span>
          </div>
          <div style={{ width: 72, flexShrink: 0 }} />
        </div>

        {/* Content area */}
        <div
          style={{
            height: BROWSER_CONTENT_H,
            backgroundColor: COLORS.bg,
            overflow: "hidden",
            position: "relative",
          }}
        >
          {children}
        </div>
      </div>

      {/* Caption pill */}
      <div style={{ marginTop: 14, opacity: captionOpacity }}>
        <div
          style={{
            backgroundColor: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.11)",
            borderRadius: 20,
            padding: "7px 20px",
            color: COLORS.fg,
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: 0.2,
          }}
        >
          {caption}
        </div>
      </div>
    </AbsoluteFill>
  )
}

// ── Scene 1: Setup (0–120 frames = 4s) ───────────────────────────────────────

const SetupScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const cardEnter = spring({ frame, fps, config: SPRING_SMOOTH, delay: 5 })
  const badgeOpacity = spring({ frame, fps, config: SPRING_SMOOTH, delay: 48 })
  const btnEnter = spring({ frame, fps, config: SPRING_SNAPPY, delay: 78 })
  const btnActive = frame >= 92

  return (
    <BrowserScene
      label="Setup"
      step={1}
      url="repopress.app/setup"
      caption="One config file. RepoPress handles the rest."
    >
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
        <div
          style={{
            transform: `scale(${cardEnter})`,
            transformOrigin: "center",
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 10,
            padding: "28px 36px",
            width: 440,
          }}
        >
          <div style={{ color: COLORS.fg, fontSize: 17, fontWeight: 600, marginBottom: 20 }}>Connect a Repository</div>

          {/* Repo row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 16,
              padding: "12px 16px",
              backgroundColor: COLORS.surfaceHigh,
              borderRadius: 8,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <GithubIcon />
            <div>
              <div style={{ color: COLORS.fg, fontSize: 15, fontWeight: 600, fontFamily: geistMonoFamily }}>
                acme/docs
              </div>
              <div style={{ color: COLORS.muted, fontSize: 12 }}>main · last updated 2 days ago</div>
            </div>
          </div>

          {/* Config detected badge */}
          <div
            style={{
              opacity: badgeOpacity,
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 20,
              backgroundColor: "rgba(34,197,94,0.09)",
              border: "1px solid rgba(34,197,94,0.28)",
              borderRadius: 8,
              padding: "8px 14px",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" role="img" aria-label="Config detected">
              <circle cx="7" cy="7" r="6" fill="none" stroke={COLORS.green} strokeWidth="1.5" />
              <path
                d="M4.5 7l2 2 3-3.5"
                stroke={COLORS.green}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span style={{ color: COLORS.green, fontSize: 12, fontWeight: 600, fontFamily: geistMonoFamily }}>
              repopress.config.json detected · 12 files · fumadocs
            </span>
          </div>

          {/* Open Dashboard button */}
          <div
            style={{
              opacity: btnEnter,
              backgroundColor: btnActive ? COLORS.accent : COLORS.surfaceHigh,
              borderRadius: 8,
              padding: "10px 0",
              textAlign: "center" as const,
              color: COLORS.fg,
              fontSize: 14,
              fontWeight: 600,
              border: btnActive ? "none" : `1px solid ${COLORS.border}`,
            }}
          >
            Open Dashboard →
          </div>
        </div>
      </div>
    </BrowserScene>
  )
}

// ── Scene 2: Dashboard (120–240 frames = 4s) ──────────────────────────────────

const SIDEBAR_NAV = [
  { id: "nav-dashboard", label: "Dashboard", active: true },
  { id: "nav-projects", label: "Projects", active: false },
  { id: "nav-settings", label: "Settings", active: false },
]

const DashboardScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const cardHighlight = spring({ frame, fps, config: SPRING_SMOOTH, delay: 50 })
  const btnClicked = frame >= 75
  const loadProgress = interpolate(frame, [75, 115], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })

  return (
    <BrowserScene
      label="Dashboard"
      step={2}
      url="repopress.app/dashboard"
      caption="Your repositories, one click from the studio"
    >
      {/* Loading progress bar - fills after "Open Studio" click */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: 3,
          width: `${loadProgress * 100}%`,
          backgroundColor: COLORS.accent,
        }}
      />
      <div style={{ display: "flex", height: "100%" }}>
        {/* Left sidebar */}
        <div
          style={{
            width: 196,
            borderRight: `1px solid ${COLORS.borderSubtle}`,
            backgroundColor: COLORS.surface,
            padding: "16px 0",
            flexShrink: 0,
          }}
        >
          {SIDEBAR_NAV.map((item) => (
            <div
              key={item.id}
              style={{
                padding: "8px 20px",
                color: item.active ? COLORS.fg : COLORS.muted,
                fontSize: 13,
                fontWeight: item.active ? 600 : 400,
                backgroundColor: item.active ? "rgba(255,255,255,0.05)" : "transparent",
              }}
            >
              {item.label}
            </div>
          ))}
        </div>

        {/* Main area */}
        <div style={{ flex: 1, padding: "24px 28px" }}>
          <div style={{ color: COLORS.fg, fontSize: 16, fontWeight: 600, marginBottom: 5 }}>Your Projects</div>
          <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 20 }}>1 repository connected</div>

          {/* Project card */}
          <div
            style={{
              border: `1px solid ${cardHighlight > 0.5 ? COLORS.accent : COLORS.border}`,
              borderRadius: 10,
              padding: "20px 24px",
              backgroundColor: COLORS.surfaceHigh,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: cardHighlight > 0.5 ? "0 0 0 3px rgba(59,130,246,0.15)" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <GithubIcon />
              <div>
                <div style={{ color: COLORS.fg, fontSize: 15, fontWeight: 600, fontFamily: geistMonoFamily }}>
                  acme/docs
                </div>
                <div style={{ color: COLORS.muted, fontSize: 12 }}>fumadocs · 12 files · main</div>
              </div>
            </div>
            <div
              style={{
                backgroundColor: btnClicked ? "#1d4ed8" : COLORS.accent,
                borderRadius: 7,
                padding: "8px 18px",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {btnClicked ? "Opening..." : "Open Studio →"}
            </div>
          </div>
        </div>
      </div>
    </BrowserScene>
  )
}

// ── Scene 3: Edit (in TransitionSeries, 180 frames = 6s) ─────────────────────

type EditorLine = {
  id: string
  text: string
  color: string
  snapAt?: number // frame at which line fully appears (non-typed lines)
  slowFrom?: number // frame at which slow character-by-character typing starts
}

// Three key lines type slowly (1 char / 2 frames); all others snap in after them.
// fm-title: [4, 52]  h1: [60, 94]  cta: [100, 164]
const EDITOR_LINES: EditorLine[] = [
  { id: "fm1", text: "---", color: COLORS.muted },
  { id: "fm-title", text: 'title: "Getting Started"', color: COLORS.accent, slowFrom: 4 },
  { id: "fm-desc", text: 'description: "Deploy your first docs"', color: COLORS.accent, snapAt: 52 },
  { id: "fm2", text: "---", color: COLORS.muted, snapAt: 52 },
  { id: "blank1", text: "", color: COLORS.fg, snapAt: 52 },
  { id: "h1", text: "# Getting Started", color: COLORS.fg, slowFrom: 60 },
  { id: "blank2", text: "", color: COLORS.fg, snapAt: 94 },
  { id: "body1", text: "Connect your repo and edit MDX files", color: COLORS.muted, snapAt: 94 },
  { id: "body2", text: "directly in the browser.", color: COLORS.muted, snapAt: 94 },
  { id: "blank3", text: "", color: COLORS.fg, snapAt: 94 },
  { id: "cta", text: "Changes are saved automatically.", color: COLORS.green, slowFrom: 100 },
]

const FILE_TREE_ITEMS = [
  { id: "ft-docs", label: "docs/", indent: 0, isFolder: true, isActive: false },
  { id: "ft-index", label: "index.mdx", indent: 1, isFolder: false, isActive: false },
  { id: "ft-gs", label: "getting-started.mdx", indent: 1, isFolder: false, isActive: true },
  { id: "ft-adv", label: "advanced.mdx", indent: 1, isFolder: false, isActive: false },
  { id: "ft-api", label: "api-reference.mdx", indent: 1, isFolder: false, isActive: false },
]

const EditScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const autosaveOpacity = spring({ frame, fps, config: SPRING_SMOOTH, delay: 160 })

  // Only the currently-typing line gets a cursor - no multi-cursor glitch
  const activeSlowId =
    frame >= 4 && frame < 52
      ? "fm-title"
      : frame >= 60 && frame < 94
        ? "h1"
        : frame >= 100 && frame < 164
          ? "cta"
          : null

  const getCharCount = (line: EditorLine): number => {
    if (line.slowFrom !== undefined) {
      return Math.floor(
        interpolate(frame, [line.slowFrom, line.slowFrom + line.text.length * 2], [0, line.text.length], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      )
    }
    if (line.snapAt !== undefined) {
      return frame >= line.snapAt ? line.text.length : 0
    }
    return line.text.length
  }

  return (
    <BrowserScene
      label="Edit"
      step={3}
      url="repopress.app/dashboard/acme/docs/studio"
      caption="Write in the studio - drafts save automatically"
    >
      <div style={{ display: "flex", height: "100%" }}>
        {/* File tree sidebar */}
        <div
          style={{
            width: 172,
            borderRight: `1px solid ${COLORS.borderSubtle}`,
            backgroundColor: COLORS.surface,
            padding: "10px 0",
            flexShrink: 0,
          }}
        >
          {FILE_TREE_ITEMS.map((item) => (
            <div
              key={item.id}
              style={{
                padding: `5px ${6 + item.indent * 14}px`,
                color: item.isActive ? COLORS.fg : COLORS.muted,
                fontSize: 12,
                fontFamily: geistMonoFamily,
                backgroundColor: item.isActive ? "rgba(59,130,246,0.12)" : "transparent",
                borderLeft: item.isActive ? `2px solid ${COLORS.accent}` : "2px solid transparent",
                fontWeight: item.isFolder ? 600 : 400,
              }}
            >
              {item.isFolder ? "▸ " : ""}
              {item.label}
            </div>
          ))}
        </div>

        {/* Editor panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Tab bar */}
          <div
            style={{
              height: 34,
              borderBottom: `1px solid ${COLORS.borderSubtle}`,
              display: "flex",
              alignItems: "center",
              padding: "0 14px",
            }}
          >
            <div
              style={{
                backgroundColor: COLORS.surfaceHigh,
                borderRadius: "4px 4px 0 0",
                padding: "5px 12px",
                color: COLORS.fg,
                fontSize: 12,
                fontFamily: geistMonoFamily,
                border: `1px solid ${COLORS.border}`,
                borderBottom: `1px solid ${COLORS.bg}`,
              }}
            >
              getting-started.mdx
            </div>
          </div>

          {/* Code content */}
          <div
            style={{
              flex: 1,
              padding: "14px 18px",
              fontFamily: geistMonoFamily,
              fontSize: 13,
              lineHeight: 1.7,
              overflow: "hidden",
            }}
          >
            {EDITOR_LINES.map((line) => {
              const charCount = getCharCount(line)
              const isActive = line.id === activeSlowId
              return (
                <div key={line.id} style={{ color: line.color, minHeight: 22 }}>
                  {line.text.slice(0, charCount)}
                  {isActive && charCount < line.text.length && (
                    <span style={{ opacity: frame % 16 < 8 ? 1 : 0, color: COLORS.accent }}>▎</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Status bar */}
          <div
            style={{
              height: 30,
              borderTop: `1px solid ${COLORS.borderSubtle}`,
              backgroundColor: COLORS.surface,
              display: "flex",
              alignItems: "center",
              padding: "0 16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: autosaveOpacity }}>
              <div style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.green }} />
              <span style={{ color: COLORS.muted, fontSize: 11, fontFamily: geistMonoFamily }}>
                Draft · Auto-saved 2s ago
              </span>
            </div>
          </div>
        </div>
      </div>
    </BrowserScene>
  )
}

// ── Scene 4: Publish (420–600 frames = 6s) ────────────────────────────────────

const BG_HINT_FILES = [
  { id: "bg-docs", text: "docs/" },
  { id: "bg-gs", text: "getting-started.mdx" },
  { id: "bg-idx", text: "index.mdx" },
]

const BG_HINT_LINES = [
  { id: "bg-fm1", text: "---" },
  { id: "bg-title", text: 'title: "Getting Started"' },
  { id: "bg-fm2", text: "---" },
  { id: "bg-blank", text: "" },
  { id: "bg-h1", text: "# Getting Started" },
]

const CLICK_FRAME = 75

const PublishScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const modalEnter = spring({ frame, fps, config: SPRING_SNAPPY })
  const btnClicked = frame >= CLICK_FRAME
  const modalExitOpacity = btnClicked
    ? interpolate(frame, [CLICK_FRAME, CLICK_FRAME + 14], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1
  const successOpacity = spring({ frame, fps, config: SPRING_SMOOTH, delay: CLICK_FRAME + 18 })

  return (
    <BrowserScene
      label="Publish"
      step={4}
      url="repopress.app/dashboard/acme/docs/studio"
      caption="Publish creates a PR. Merge = live."
    >
      <div
        style={{
          height: "100%",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Dimmed editor background hint */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 32,
          }}
        >
          <div style={{ color: "rgba(125,133,144,0.25)", fontSize: 11, fontFamily: geistMonoFamily }}>
            {BG_HINT_FILES.map((f) => (
              <div key={f.id} style={{ padding: "3px 0" }}>
                {f.text}
              </div>
            ))}
          </div>
          <div style={{ color: "rgba(125,133,144,0.18)", fontSize: 11, fontFamily: geistMonoFamily }}>
            {BG_HINT_LINES.map((l) => (
              <div key={l.id} style={{ minHeight: 17 }}>
                {l.text}
              </div>
            ))}
          </div>
        </div>

        {/* PR Modal */}
        <div
          style={{
            position: "relative",
            zIndex: 10,
            transform: `scale(${modalEnter})`,
            transformOrigin: "center",
            opacity: modalExitOpacity,
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 10,
            padding: "24px 28px",
            width: 420,
            boxShadow: "0 20px 56px rgba(0,0,0,0.65)",
          }}
        >
          <div style={{ color: COLORS.fg, fontSize: 16, fontWeight: 700, marginBottom: 18 }}>
            Publish via Pull Request
          </div>

          {/* Branch field */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Branch</div>
            <div
              style={{
                backgroundColor: COLORS.surfaceHigh,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 6,
                padding: "8px 12px",
                color: COLORS.fg,
                fontSize: 13,
                fontFamily: geistMonoFamily,
              }}
            >
              repopress/update-getting-started
            </div>
          </div>

          {/* PR Title field */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 500, marginBottom: 6 }}>
              Pull Request title
            </div>
            <div
              style={{
                backgroundColor: COLORS.surfaceHigh,
                border: `1px solid ${COLORS.accent}`,
                borderRadius: 6,
                padding: "8px 12px",
                color: COLORS.fg,
                fontSize: 13,
              }}
            >
              Update getting started guide
            </div>
          </div>

          {/* Create PR button */}
          <div
            style={{
              backgroundColor: btnClicked ? "#1d4ed8" : COLORS.accent,
              borderRadius: 7,
              padding: "10px 0",
              textAlign: "center" as const,
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {btnClicked ? "Creating..." : "Create Pull Request →"}
          </div>
        </div>

        {/* Success card - always rendered; opacity drives visibility */}
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            opacity: successOpacity,
            transform: `scale(${0.92 + successOpacity * 0.08})`,
            transformOrigin: "center",
            backgroundColor: COLORS.surface,
            border: "1px solid rgba(34,197,94,0.4)",
            borderRadius: 10,
            padding: "22px 28px",
            width: 380,
            boxShadow: "0 20px 56px rgba(0,0,0,0.65)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill={COLORS.green} role="img" aria-label="PR opened">
              <path d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z" />
            </svg>
            <span style={{ color: COLORS.green, fontSize: 14, fontWeight: 700 }}>Pull Request #42 opened</span>
          </div>
          <div style={{ color: COLORS.muted, fontSize: 13, fontFamily: geistMonoFamily, marginBottom: 4 }}>
            repopress/update-getting-started → main
          </div>
          <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 8 }}>Merge to publish your changes live.</div>
        </div>
      </div>
    </BrowserScene>
  )
}

// ── Main composition ──────────────────────────────────────────────────────────
// Option B: Setup(0–120) · Dashboard(120–240) · Edit(240–420) · Publish(420–600)
// 555 frames = 18.5 s at 30 fps (600 – 3 transitions × 15 frames each)

export const StudioDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.desktopBg }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={120}>
          <SetupScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
        <TransitionSeries.Sequence durationInFrames={120}>
          <DashboardScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
        <TransitionSeries.Sequence durationInFrames={180}>
          <EditScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
        <TransitionSeries.Sequence durationInFrames={180}>
          <PublishScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  )
}

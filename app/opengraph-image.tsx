import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "RepoPress - Your repo is your CMS"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function OGImage() {
  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#09090b",
        padding: "60px",
      }}
    >
      {/* Top accent line */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "4px",
          background: "linear-gradient(to right, #4e67d4, #3b82f6, #4e67d4)",
        }}
      />

      {/* Logo mark */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "40px",
        }}
      >
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "16px",
            backgroundColor: "#4e67d4",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            role="img"
            aria-label="RepoPress logo"
          >
            <title>RepoPress</title>
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
            <path d="m3.3 7 8.7 5 8.7-5" />
            <path d="M12 22V12" />
          </svg>
        </div>
        <span
          style={{
            fontSize: "48px",
            fontWeight: "700",
            color: "#fafafa",
            letterSpacing: "-0.02em",
          }}
        >
          RepoPress
        </span>
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: "32px",
          color: "#a1a1aa",
          textAlign: "center",
          maxWidth: "800px",
          lineHeight: "1.4",
        }}
      >
        Your repo is your CMS
      </div>

      {/* Sub-tagline */}
      <div
        style={{
          fontSize: "20px",
          color: "#71717a",
          textAlign: "center",
          maxWidth: "700px",
          marginTop: "16px",
        }}
      >
        Git-native headless CMS for GitHub repositories
      </div>

      {/* Bottom pills */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginTop: "48px",
        }}
      >
        {["Next.js", "Astro", "Hugo", "Docusaurus", "Jekyll"].map((fw) => (
          <div
            key={fw}
            style={{
              padding: "8px 20px",
              borderRadius: "9999px",
              border: "1px solid #27272a",
              color: "#a1a1aa",
              fontSize: "16px",
            }}
          >
            {fw}
          </div>
        ))}
      </div>
    </div>,
    { ...size },
  )
}

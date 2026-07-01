import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "RepoPress - Your repo is your CMS"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function OGImage() {
  // Load Instrument Serif from the bundled TTF alongside this file.
  // Using import.meta.url is the Next.js-recommended approach for edge OG images —
  // the bundler includes the asset so it's available at runtime without an external fetch.
  const fontData = await fetch(new URL("./InstrumentSerif-Regular.ttf", import.meta.url)).then((r) => r.arrayBuffer())

  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        // Warm near-black — oklch(0.12 0.012 75), deep end of the editorial ramp
        backgroundColor: "#1b1916",
        padding: "72px 80px",
      }}
    >
      {/* Wordmark — spaced mono-register label */}
      <div
        style={{
          display: "flex",
          fontSize: "13px",
          fontFamily: "sans-serif",
          fontWeight: 500,
          letterSpacing: "0.15em",
          color: "#78726c",
        }}
      >
        REPOPRESS
      </div>

      {/* Hero headline — Instrument Serif, two deliberate lines */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Instrument Serif",
            fontSize: "98px",
            fontWeight: 400,
            lineHeight: 1.05,
            // paper-0 pushed warm: oklch(0.95 0.014 75)
            color: "#f1ece1",
            letterSpacing: "-0.01em",
          }}
        >
          Your repo
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Instrument Serif",
            fontSize: "98px",
            fontWeight: 400,
            lineHeight: 1.05,
            color: "#f1ece1",
            letterSpacing: "-0.01em",
          }}
        >
          is your CMS.
        </div>
      </div>

      {/* Footer — Signal Slate rule + tagline */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Single Signal Slate accent rule — deliberate mark, not a stripe */}
        <div
          style={{
            display: "flex",
            width: "48px",
            height: "2px",
            // --slate: oklch(0.52 0.13 255)
            backgroundColor: "#4e67d4",
            marginBottom: "16px",
          }}
        />
        {/* Tagline — muted warm gray, 5.2:1 contrast on #1b1916 */}
        <div
          style={{
            display: "flex",
            fontSize: "20px",
            fontFamily: "sans-serif",
            color: "#8a8480",
            letterSpacing: "0.01em",
          }}
        >
          Git-native MDX editing — draft to published.
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: "Instrument Serif",
          data: fontData,
          style: "normal",
          weight: 400,
        },
      ],
    },
  )
}

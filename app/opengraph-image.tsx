import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "RepoPress - Your repo is your CMS"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function OGImage() {
  const fontData = await fetch(new URL("./InstrumentSerif-Regular.ttf", import.meta.url)).then((r) =>
    r.arrayBuffer(),
  )

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#1b1916",
          padding: "72px 80px",
        }}
      >
        {/* Hero headline — fills the canvas at 148px, cascade is intentional */}
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
              fontSize: "148px",
              fontWeight: 400,
              lineHeight: 1.0,
              color: "#f1ece1",
              letterSpacing: "-0.02em",
            }}
          >
            Your repo
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Instrument Serif",
              fontSize: "148px",
              fontWeight: 400,
              lineHeight: 1.0,
              color: "#f1ece1",
              letterSpacing: "-0.02em",
            }}
          >
            is your CMS.
          </div>
        </div>

        {/* Footer bar — rule + tagline left, wordmark right */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* Signal Slate accent rule */}
            <div
              style={{
                display: "flex",
                width: "48px",
                height: "2px",
                backgroundColor: "#4e67d4",
                marginBottom: "14px",
              }}
            />
            <div
              style={{
                display: "flex",
                fontSize: "19px",
                fontFamily: "sans-serif",
                color: "#8a8480",
                letterSpacing: "0.01em",
              }}
            >
              Git-native MDX editing — draft to published.
            </div>
          </div>

          {/* Wordmark — anchors bottom-right, balances headline */}
          <div
            style={{
              display: "flex",
              fontSize: "13px",
              fontFamily: "sans-serif",
              fontWeight: 500,
              letterSpacing: "0.15em",
              color: "#4e4743",
            }}
          >
            REPOPRESS
          </div>
        </div>
      </div>
    ),
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

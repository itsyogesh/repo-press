import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import * as StudioDemoModule from "@/remotion/compositions/StudioDemo"
import { VideoPreview } from "../video-preview"

describe("landing video preview", () => {
  it("renders a sized placeholder shell before the player is activated", () => {
    const html = renderToStaticMarkup(<VideoPreview />)

    expect(html).toContain("Watch the whole flow, start to published.")
    expect(html).toContain('data-video-preview-placeholder="idle"')
  })

  it("exports shared StudioDemo composition metadata for preview consumers", () => {
    expect(StudioDemoModule).toHaveProperty("studioDemoComposition")
    expect(StudioDemoModule.studioDemoComposition).toMatchObject({
      durationInFrames: 555,
      fps: 30,
      width: 1280,
      height: 720,
    })
  })
})

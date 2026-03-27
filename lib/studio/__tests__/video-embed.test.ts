import { describe, expect, it } from "vitest"

import { getVideoInfo } from "../video-embed"

describe("getVideoInfo", () => {
  it("normalizes standard YouTube watch URLs", () => {
    expect(getVideoInfo("https://www.youtube.com/watch?v=WwCFLfigqpg&feature=shared")).toMatchObject({
      provider: "youtube",
      id: "WwCFLfigqpg",
      embedUrl: "https://www.youtube.com/embed/WwCFLfigqpg",
      isValid: true,
    })
  })

  it("normalizes canonical YouTube short links with tracking params", () => {
    expect(getVideoInfo("https://youtu.be/WwCFLfigqpg?si=T90pqRb-zkW4fMuz")).toMatchObject({
      provider: "youtube",
      id: "WwCFLfigqpg",
      embedUrl: "https://www.youtube.com/embed/WwCFLfigqpg",
      isValid: true,
    })
  })

  it("accepts already-embedded YouTube URLs without double embedding", () => {
    expect(getVideoInfo("https://www.youtube.com/embed/WwCFLfigqpg")).toMatchObject({
      provider: "youtube",
      id: "WwCFLfigqpg",
      embedUrl: "https://www.youtube.com/embed/WwCFLfigqpg",
      isValid: true,
    })
  })

  it("rejects malformed YouTube short links with extra path segments", () => {
    expect(getVideoInfo("https://youtu.be/WwCFLfigqpg/extra")).toEqual({
      provider: null,
      isValid: false,
    })
  })

  it("normalizes Vimeo URLs to player embeds", () => {
    expect(getVideoInfo("https://vimeo.com/123456789")).toMatchObject({
      provider: "vimeo",
      id: "123456789",
      embedUrl: "https://player.vimeo.com/video/123456789",
      isValid: true,
    })
  })

  it("treats resolved studio media URLs pointing at video files as direct video", () => {
    expect(getVideoInfo("/api/media/resolve?projectId=project_123&path=%2Fcontent%2Fclips%2Fdemo.mp4")).toMatchObject({
      provider: "direct",
      embedUrl: "/api/media/resolve?projectId=project_123&path=%2Fcontent%2Fclips%2Fdemo.mp4",
      isValid: true,
    })
  })

  it("treats resolved studio media URLs with additional query params as direct video", () => {
    expect(
      getVideoInfo("/api/media/resolve?projectId=project_123&path=%2Fcontent%2Fclips%2Fdemo.mp4&userId=user_1"),
    ).toMatchObject({
      provider: "direct",
      embedUrl: "/api/media/resolve?projectId=project_123&path=%2Fcontent%2Fclips%2Fdemo.mp4&userId=user_1",
      isValid: true,
    })
  })

  it("treats signed direct video URLs as direct video", () => {
    expect(getVideoInfo("https://cdn.example.com/clips/demo.mp4?token=secret")).toMatchObject({
      provider: "direct",
      embedUrl: "https://cdn.example.com/clips/demo.mp4?token=secret",
      isValid: true,
    })
  })

  it("rejects dangerous direct-video protocols even when the path ends with a video extension", () => {
    expect(getVideoInfo("javascript:alert('xss').mp4")).toEqual({
      provider: null,
      isValid: false,
    })
  })
})

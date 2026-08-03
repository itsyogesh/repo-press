import { afterEach, describe, expect, it, vi } from "vitest"

import { downloadExternalImage } from "../download-external-image"

describe("downloadExternalImage", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("posts the external URL and returns the staged media response", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          storage: "blob",
          repoPath: "/public/images/blog/creative-domain-ideas/creative-domain-ideas.png",
          previewUrl:
            "/api/media/resolve?projectId=project_123&path=%2Fpublic%2Fimages%2Fblog%2Fcreative-domain-ideas%2Fcreative-domain-ideas.png",
          staged: true,
          mediaOpId: "media-op-1",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )

    const result = await downloadExternalImage({
      url: "https://images.example.com/creative-domain-ideas.png",
      projectId: "project_123",
      owner: "droidsize",
      repo: "collective.domains",
      branch: "main",
      pathHint: "public/images/blog/creative-domain-ideas",
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/media/download-external",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    )
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toMatchObject({
      url: "https://images.example.com/creative-domain-ideas.png",
      projectId: "project_123",
      owner: "droidsize",
      repo: "collective.domains",
      branch: "main",
      pathHint: "public/images/blog/creative-domain-ideas",
    })
    expect(result.repoPath).toBe("/public/images/blog/creative-domain-ideas/creative-domain-ideas.png")
  })

  it("throws the route error message on failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "External image must resolve to an image content type" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    )

    await expect(
      downloadExternalImage({
        url: "https://example.com/not-an-image",
        projectId: "project_123",
        owner: "droidsize",
        repo: "collective.domains",
        branch: "main",
      }),
    ).rejects.toThrow("External image must resolve to an image content type")
  })
})

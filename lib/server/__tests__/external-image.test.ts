import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { dnsLookupMock } = vi.hoisted(() => ({ dnsLookupMock: vi.fn() }))

vi.mock("node:dns/promises", () => ({ default: { lookup: dnsLookupMock }, lookup: dnsLookupMock }))

import { ExternalImageError, fetchBoundedExternalImage } from "../external-image"

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"])
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

function imageResponse(bytes: Uint8Array = PNG, headers: Record<string, string> = {}) {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new Response(body, { status: 200, headers: { "content-type": "image/png", ...headers } })
}

function download(
  url = "https://images.example.test/cover.png",
  overrides: Partial<Parameters<typeof fetchBoundedExternalImage>[0]> = {},
) {
  return fetchBoundedExternalImage({ url, maxBytes: 64, timeoutMs: 1_000, allowedMimeTypes: ALLOWED, ...overrides })
}

describe("fetchBoundedExternalImage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dnsLookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it.each([
    "http://127.0.0.1/image.png",
    "http://127.1/image.png",
    "http://2130706433/image.png",
    "http://0177.0.0.1/image.png",
    "http://0x7f000001/image.png",
    "http://10.0.0.1/image.png",
    "http://100.64.0.1/image.png",
    "http://169.254.169.254/image.png",
    "http://192.0.2.1/image.png",
    "http://224.0.0.1/image.png",
    "http://[::1]/image.png",
    "http://[::ffff:127.0.0.1]/image.png",
    "http://[64:ff9b::7f00:1]/image.png",
    "http://[2001:db8::1]/image.png",
    "http://[fc00::1]/image.png",
  ])("rejects direct private, non-canonical, and reserved IP target %s", async (url) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    await expect(download(url)).rejects.toMatchObject({ code: "unsafe-url" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("rejects credentialed URLs before DNS or fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    await expect(download("https://user:secret@images.example.test/cover.png")).rejects.toMatchObject({
      code: "unsafe-url",
    })
    expect(dnsLookupMock).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("rejects a hostname when any DNS answer is private", async () => {
    dnsLookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.4", family: 4 },
    ])
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    await expect(download()).rejects.toMatchObject({ code: "unsafe-url" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("pins a validated DNS answer into the fetch dispatcher for each hop", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "https://cdn.example.test/final.png" } }),
      )
      .mockResolvedValueOnce(imageResponse())
    await download()
    expect(dnsLookupMock).toHaveBeenNthCalledWith(1, "images.example.test", { all: true, verbatim: true })
    expect(dnsLookupMock).toHaveBeenNthCalledWith(2, "cdn.example.test", { all: true, verbatim: true })
    const calls = vi.mocked(globalThis.fetch).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0]?.[1]).toMatchObject({ redirect: "manual", dispatcher: expect.anything() })
    expect(calls[1]?.[1]).toMatchObject({ redirect: "manual", dispatcher: expect.anything() })
  })

  it("rejects a redirect to a private target without following it", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }),
      )
    await expect(download()).rejects.toMatchObject({ code: "unsafe-url" })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("rejects an HTTPS redirect that downgrades transport to HTTP", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "http://cdn.example.test/cover.png" } }),
      )
    await expect(download()).rejects.toMatchObject({ code: "unsafe-url" })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("rejects redirect loops after five redirects", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 302, headers: { location: "/cover.png" } }))
    await expect(download()).rejects.toMatchObject({ code: "redirect-limit" })
    expect(fetchSpy).toHaveBeenCalledTimes(6)
  })

  it("times out the entire download", async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
        }),
    )
    const pending = download(undefined, { timeoutMs: 25 })
    const rejection = expect(pending).rejects.toMatchObject({ code: "timeout" })
    await vi.advanceTimersByTimeAsync(26)
    await rejection
  })

  it("returns at the deadline even when DNS lookup never settles", async () => {
    vi.useFakeTimers()
    dnsLookupMock.mockReturnValue(new Promise(() => undefined))
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const pending = download(undefined, { timeoutMs: 25 })
    const rejection = expect(pending).rejects.toMatchObject({ code: "timeout" })
    await vi.advanceTimersByTimeAsync(26)
    await rejection
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("maps a timeout while streaming the response body to the typed timeout error", async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")))
        },
      })
      return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "image/png" } }))
    })
    const pending = download(undefined, { timeoutMs: 25 })
    const rejection = expect(pending).rejects.toMatchObject({ code: "timeout" })
    await vi.advanceTimersByTimeAsync(26)
    await rejection
  })

  it("rejects a declared Content-Length above the byte budget", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array(), {
        status: 200,
        headers: { "content-type": "image/png", "content-length": "65" },
      }),
    )
    await expect(download()).rejects.toMatchObject({ code: "too-large" })
  })

  it("cancels and rejects a streamed body that crosses the byte budget", async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(PNG)
        controller.enqueue(new Uint8Array(60))
      },
      cancel,
    })
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(body, { status: 200, headers: { "content-type": "image/png" } }),
    )
    await expect(download()).rejects.toMatchObject({ code: "too-large" })
    expect(cancel).toHaveBeenCalled()
  })

  it("rejects MIME spoofing when the bytes do not match the declared image type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html>not an image</html>", { status: 200, headers: { "content-type": "image/png" } }),
    )
    await expect(download()).rejects.toMatchObject({ code: "unsupported-media" })
  })

  it("does not accept an AVIF brand forged into the ftyp minor-version field", async () => {
    const spoofed = Uint8Array.from([
      0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31, 0x61, 0x76, 0x69, 0x66, 0x6d, 0x69, 0x66,
      0x31,
    ])
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(spoofed.buffer, { status: 200, headers: { "content-type": "image/avif" } }),
    )
    await expect(download()).rejects.toMatchObject({ code: "unsupported-media" })
  })

  it("rejects SVG even when the upstream labels it as an image", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<svg xmlns='http://www.w3.org/2000/svg'/>", {
        status: 200,
        headers: { "content-type": "image/svg+xml" },
      }),
    )
    await expect(download()).rejects.toMatchObject({ code: "unsupported-media" })
  })

  it("returns bounded PNG bytes and a canonical MIME type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(imageResponse(PNG, { "content-type": "image/png; charset=binary" }))
    await expect(download()).resolves.toEqual({ bytes: PNG, mimeType: "image/png" })
  })

  it.each([
    ["image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])],
    ["image/gif", new TextEncoder().encode("GIF89a")],
    ["image/webp", new TextEncoder().encode("RIFF\u0004\u0000\u0000\u0000WEBP")],
    [
      "image/avif",
      Uint8Array.from([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0x00, 0x00, 0x00, 0x00, 0x6d, 0x69,
        0x66, 0x31, 0x61, 0x76, 0x69, 0x66,
      ]),
    ],
  ])("accepts allowlisted %s bytes only when the signature agrees", async (mimeType, bytes) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, {
        status: 200,
        headers: { "content-type": mimeType },
      }),
    )
    const result = await download()
    expect(result.mimeType).toBe(mimeType)
    expect(Array.from(result.bytes)).toEqual(Array.from(bytes))
  })

  it("uses a typed error for non-success upstream responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("private upstream details", { status: 503 }))
    const error = await download().catch((caught) => caught)
    expect(error).toBeInstanceOf(ExternalImageError)
    expect(error).toMatchObject({ code: "upstream" })
  })
})

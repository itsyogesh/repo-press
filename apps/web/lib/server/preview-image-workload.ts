import sharp from "sharp"
import { MAX_PREVIEW_ASSET_DECODED_PIXELS } from "@/lib/preview/asset-budget-policy"

export const MAX_PREVIEW_IMAGE_WIDTH = 8_192
export const MAX_PREVIEW_IMAGE_HEIGHT = 8_192
export const MAX_PREVIEW_IMAGE_FRAME_PIXELS = 12_000_000
export const MAX_PREVIEW_IMAGE_PAGES = 16
export const MAX_PREVIEW_IMAGE_AGGREGATE_PIXELS = MAX_PREVIEW_ASSET_DECODED_PIXELS

const FORMAT_MIME_TYPES = {
  avif: "image/avif",
  gif: "image/gif",
  heif: "image/avif",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const

export class PreviewImageWorkloadError extends Error {
  constructor(readonly code: "too-large" | "unsupported-media") {
    super("Preview image workload is unsafe")
  }
}

function positiveInteger(value: number | undefined) {
  return Number.isSafeInteger(value) && (value ?? 0) > 0
}

export async function assertSafePreviewImageWorkload(bytes: Uint8Array, expectedMimeType: string): Promise<number> {
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>
  try {
    metadata = await sharp(bytes, {
      animated: true,
      failOn: "warning",
      limitInputPixels: MAX_PREVIEW_IMAGE_AGGREGATE_PIXELS,
      unlimited: false,
    }).metadata()
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    throw new PreviewImageWorkloadError(/pixel limit/iu.test(message) ? "too-large" : "unsupported-media")
  }

  const mimeType = metadata.format ? FORMAT_MIME_TYPES[metadata.format as keyof typeof FORMAT_MIME_TYPES] : undefined
  if (!mimeType || mimeType !== expectedMimeType || (metadata.format === "heif" && metadata.compression !== "av1")) {
    throw new PreviewImageWorkloadError("unsupported-media")
  }

  const pages = metadata.pages ?? 1
  const frameHeight = metadata.pageHeight ?? metadata.height
  if (!positiveInteger(metadata.width) || !positiveInteger(frameHeight) || !positiveInteger(pages)) {
    throw new PreviewImageWorkloadError("unsupported-media")
  }

  const width = metadata.width as number
  const height = frameHeight as number
  if (width > MAX_PREVIEW_IMAGE_WIDTH || height > MAX_PREVIEW_IMAGE_HEIGHT || pages > MAX_PREVIEW_IMAGE_PAGES) {
    throw new PreviewImageWorkloadError("too-large")
  }

  const framePixels = width * height
  const aggregatePixels = framePixels * pages
  if (
    !Number.isSafeInteger(framePixels) ||
    !Number.isSafeInteger(aggregatePixels) ||
    framePixels > MAX_PREVIEW_IMAGE_FRAME_PIXELS ||
    aggregatePixels > MAX_PREVIEW_IMAGE_AGGREGATE_PIXELS
  ) {
    throw new PreviewImageWorkloadError("too-large")
  }
  return aggregatePixels
}

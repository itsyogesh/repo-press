import { PreviewBox, PreviewIcon, PreviewImage, PreviewInline, PreviewStack, PreviewText } from "@repopress/preview"
import type { ReactNode } from "react"

function DocsImage({ src, alt, caption }: { src?: string; alt?: string; caption?: string }) {
  const description = alt || caption || "Documentation image"
  return (
    <PreviewStack gap="compact">
      <PreviewImage src={src} alt={description} label={caption || description} aspect="wide" />
      {caption ? (
        <PreviewText as="small" tone="muted">
          {caption}
        </PreviewText>
      ) : null}
    </PreviewStack>
  )
}

function DocsVideo({ src, title }: { src?: string; title?: string }) {
  return (
    <PreviewBox tone="neutral">
      <PreviewInline align="start" gap="compact">
        <PreviewIcon name="arrow" label="Video" />
        <PreviewStack gap="compact">
          <PreviewText weight="semibold">{title || "Documentation video"}</PreviewText>
          <PreviewText as="small" tone="muted">
            {src
              ? "Video playback is available on the published page."
              : "Add a video source to preview this component."}
          </PreviewText>
        </PreviewStack>
      </PreviewInline>
    </PreviewBox>
  )
}

function Callout({
  children,
  type = "info",
}: {
  children?: ReactNode
  type?: "info" | "warning" | "success" | "error"
}) {
  const tone = type === "warning" || type === "error" ? "warning" : type === "success" ? "tip" : "info"
  return <PreviewBox tone={tone}>{children}</PreviewBox>
}

export const adapter = {
  components: {
    DocsImage,
    Callout,
    DocsVideo,
  },
  scope: {
    // Shared constants for expressions
    DOCS_SETUP_MEDIA: {},
  },
}

import type { ReactElement, ReactNode } from "react"

export const PREVIEW_CAPABILITY_NAMES = Object.freeze([
  "PreviewBox",
  "PreviewStack",
  "PreviewInline",
  "PreviewText",
  "PreviewList",
  "PreviewAction",
  "PreviewImage",
  "PreviewPaper",
  "PreviewDocument",
  "PreviewIcon",
] as const)
export const PREVIEW_BOX_TONES = Object.freeze(["neutral", "info", "tip", "warning", "accent"] as const)
export const PREVIEW_GAPS = Object.freeze(["compact", "default", "spacious"] as const)
export const PREVIEW_TEXT_SIZES = Object.freeze(["caption", "body", "lead", "title"] as const)
export const PREVIEW_TEXT_WEIGHTS = Object.freeze(["regular", "medium", "semibold"] as const)
export const PREVIEW_TEXT_TONES = Object.freeze(["default", "muted", "accent"] as const)
export const PREVIEW_LIST_STYLES = Object.freeze(["bullet", "check", "ordered", "plain"] as const)
export const PREVIEW_ACTION_TONES = Object.freeze(["primary", "secondary"] as const)
export const PREVIEW_IMAGE_ASPECTS = Object.freeze(["wide", "square", "portrait"] as const)
export const PREVIEW_IMAGE_SOURCE_MAX_BYTES = 2_048
export const PREVIEW_IMAGE_TEXT_MAX_BYTES = 512
export const PREVIEW_PAPER_VARIANTS = Object.freeze(["letter", "note", "worksheet"] as const)
export const PREVIEW_PAPER_HEADING_LEVELS = Object.freeze([2, 3, "none"] as const)
export const PREVIEW_DOCUMENT_LAYOUTS = Object.freeze(["article", "wide"] as const)
export const PREVIEW_DOCUMENT_TONES = Object.freeze(["default", "warm"] as const)
/** Title and action labels are trimmed before this UTF-8 byte budget is applied. */
export const PREVIEW_PAPER_TEXT_MAX_BYTES = 512
export const PREVIEW_IMAGE_HTTPS_AUTHORITY_POLICY = Object.freeze({
  host: "ascii-dns-or-canonical-ipv4",
  port: "canonical-decimal-1-65535",
  userinfo: "forbidden",
  ipv6: "forbidden",
  encodedAuthority: "forbidden",
} as const)
export const PREVIEW_ICON_NAMES = Object.freeze([
  "info",
  "tip",
  "warning",
  "check",
  "mail",
  "stamp",
  "image",
  "arrow",
] as const)

export type PreviewBoxTone = (typeof PREVIEW_BOX_TONES)[number]
export type PreviewGap = (typeof PREVIEW_GAPS)[number]
export type PreviewTextSize = (typeof PREVIEW_TEXT_SIZES)[number]
export type PreviewTextWeight = (typeof PREVIEW_TEXT_WEIGHTS)[number]
export type PreviewTextTone = (typeof PREVIEW_TEXT_TONES)[number]
export type PreviewListStyle = (typeof PREVIEW_LIST_STYLES)[number]
export type PreviewActionTone = (typeof PREVIEW_ACTION_TONES)[number]
export type PreviewImageAspect = (typeof PREVIEW_IMAGE_ASPECTS)[number]
export type PreviewPaperVariant = (typeof PREVIEW_PAPER_VARIANTS)[number]
export type PreviewPaperHeadingLevel = (typeof PREVIEW_PAPER_HEADING_LEVELS)[number]
export type PreviewDocumentLayout = (typeof PREVIEW_DOCUMENT_LAYOUTS)[number]
export type PreviewDocumentTone = (typeof PREVIEW_DOCUMENT_TONES)[number]
export type PreviewIconName = (typeof PREVIEW_ICON_NAMES)[number]

export type PreviewBoxProps = Readonly<{ children?: ReactNode; tone?: PreviewBoxTone }>
export type PreviewStackProps = Readonly<{ children?: ReactNode; gap?: PreviewGap }>
export type PreviewInlineProps = Readonly<{
  align?: "start" | "center" | "end"
  children?: ReactNode
  gap?: PreviewGap
  wrap?: boolean
}>
export type PreviewTextProps = Readonly<{
  as?: "span" | "p" | "strong" | "small" | "h2" | "h3"
  children?: ReactNode
  size?: PreviewTextSize
  tone?: PreviewTextTone
  weight?: PreviewTextWeight
}>
export type PreviewListProps = Readonly<{
  children?: ReactNode
  items?: readonly (number | string)[]
  style?: PreviewListStyle
}>
export type PreviewActionProps = Readonly<{
  href?: string
  label: string
  tone?: PreviewActionTone
}>
export type PreviewImageProps = Readonly<{
  alt: string
  aspect?: PreviewImageAspect
  label?: string
  /** HTTPS or repository-relative reference. RepoPress resolves bytes outside the compatible worker. */
  src?: string
}>
export type PreviewPaperProps = Readonly<{
  actionLabel?: string
  children?: ReactNode
  headingLevel?: PreviewPaperHeadingLevel
  showStamp?: boolean
  title?: string
  variant?: PreviewPaperVariant
}>
export type PreviewDocumentProps = Readonly<{
  children?: ReactNode
  layout?: PreviewDocumentLayout
  tone?: PreviewDocumentTone
}>
export type PreviewIconProps = Readonly<{ label?: string; name: PreviewIconName }>

function isCanonicalIpv4(labels: readonly string[]): boolean {
  if (labels.length !== 4) return false
  return labels.every((label) => {
    if (!/^[0-9]+$/.test(label) || (label.length > 1 && label.startsWith("0"))) return false
    const value = Number(label)
    return value >= 0 && value <= 255 && String(value) === label
  })
}

function isIpv4LikeLabel(label: string): boolean {
  return /^[0-9]+$/.test(label) || /^0x[0-9a-f]+$/i.test(label)
}

function isAsciiDnsOrCanonicalIpv4(hostname: string): boolean {
  if (hostname.length === 0 || hostname.length > 253) return false
  const labels = hostname.split(".")
  if (labels.every(isIpv4LikeLabel)) return isCanonicalIpv4(labels)
  return labels.every(
    (label) => label.length > 0 && label.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label),
  )
}

function isCanonicalPreviewPort(port: string): boolean {
  if (!/^[1-9][0-9]{0,4}$/.test(port)) return false
  const value = Number(port)
  return value <= 65_535 && String(value) === port
}

/**
 * Validates the raw HTTPS authority before WHATWG URL normalization.
 * Keep the stringified worker mirror and its shared corpus in lockstep with this function.
 */
export function hasAcceptedPreviewImageHttpsAuthority(value: string): boolean {
  if (!/^https:\/\//i.test(value) || /\s/.test(value)) return false
  const authorityStart = 8
  let authorityEnd = value.length
  for (const separator of ["/", "?", "#"]) {
    const found = value.indexOf(separator, authorityStart)
    if (found >= 0 && found < authorityEnd) authorityEnd = found
  }
  const authority = value.slice(authorityStart, authorityEnd)
  if (authority.length === 0 || authority.includes("@") || authority.includes("%")) return false
  for (let index = 0; index < authority.length; index += 1) {
    const unit = authority.charCodeAt(index)
    if (unit < 0x21 || unit > 0x7e) return false
  }
  const colon = authority.lastIndexOf(":")
  if (colon >= 0 && authority.indexOf(":") !== colon) return false
  const hostname = colon >= 0 ? authority.slice(0, colon) : authority
  const port = colon >= 0 ? authority.slice(colon + 1) : null
  return isAsciiDnsOrCanonicalIpv4(hostname) && (port === null || isCanonicalPreviewPort(port))
}

/** Runtime values are supplied only inside RepoPress's locked compatible worker. */
export declare const PREVIEW_OPTIONS: Readonly<Record<string, Readonly<Record<string, true>>>>
export declare function PreviewBox(props: PreviewBoxProps): ReactElement
export declare function PreviewStack(props: PreviewStackProps): ReactElement
export declare function PreviewInline(props: PreviewInlineProps): ReactElement
export declare function PreviewText(props: PreviewTextProps): ReactElement
export declare function PreviewList(props: PreviewListProps): ReactElement
export declare function PreviewAction(props: PreviewActionProps): ReactElement
export declare function PreviewImage(props: PreviewImageProps): ReactElement
export declare function PreviewPaper(props: PreviewPaperProps): ReactElement
export declare function PreviewDocument(props: PreviewDocumentProps): ReactElement
export declare function PreviewIcon(props: PreviewIconProps): ReactElement

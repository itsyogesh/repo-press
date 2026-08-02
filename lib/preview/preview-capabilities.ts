import type { ReactElement, ReactNode } from "react"

export const PREVIEW_CAPABILITY_NAMES = Object.freeze([
  "PreviewBox",
  "PreviewStack",
  "PreviewInline",
  "PreviewText",
  "PreviewList",
  "PreviewAction",
  "PreviewImage",
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
  src?: string
}>
export type PreviewIconProps = Readonly<{ label?: string; name: PreviewIconName }>

/** Runtime values are supplied only inside RepoPress's locked compatible worker. */
export declare const PREVIEW_OPTIONS: Readonly<Record<string, Readonly<Record<string, true>>>>
export declare function PreviewBox(props: PreviewBoxProps): ReactElement
export declare function PreviewStack(props: PreviewStackProps): ReactElement
export declare function PreviewInline(props: PreviewInlineProps): ReactElement
export declare function PreviewText(props: PreviewTextProps): ReactElement
export declare function PreviewList(props: PreviewListProps): ReactElement
export declare function PreviewAction(props: PreviewActionProps): ReactElement
export declare function PreviewImage(props: PreviewImageProps): ReactElement
export declare function PreviewIcon(props: PreviewIconProps): ReactElement

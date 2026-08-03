import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  PREVIEW_ACTION_TONES,
  PREVIEW_BOX_TONES,
  PREVIEW_CAPABILITY_NAMES,
  PREVIEW_GAPS,
  PREVIEW_ICON_NAMES,
  PREVIEW_IMAGE_ASPECTS,
  PREVIEW_IMAGE_SOURCE_MAX_BYTES,
  PREVIEW_IMAGE_TEXT_MAX_BYTES,
  PREVIEW_LIST_STYLES,
  PREVIEW_TEXT_SIZES,
  PREVIEW_TEXT_TONES,
  PREVIEW_TEXT_WEIGHTS,
} from "../preview-capabilities"

describe("portable preview capability contract", () => {
  it("exports a small immutable framework-neutral component surface", () => {
    expect(PREVIEW_CAPABILITY_NAMES).toEqual([
      "PreviewBox",
      "PreviewStack",
      "PreviewInline",
      "PreviewText",
      "PreviewList",
      "PreviewAction",
      "PreviewImage",
      "PreviewIcon",
    ])
    for (const options of [
      PREVIEW_CAPABILITY_NAMES,
      PREVIEW_ACTION_TONES,
      PREVIEW_BOX_TONES,
      PREVIEW_GAPS,
      PREVIEW_ICON_NAMES,
      PREVIEW_IMAGE_ASPECTS,
      PREVIEW_LIST_STYLES,
      PREVIEW_TEXT_SIZES,
      PREVIEW_TEXT_TONES,
      PREVIEW_TEXT_WEIGHTS,
    ]) {
      expect(Object.isFrozen(options)).toBe(true)
    }
  })

  it("keeps every visual primitive on RepoPress-owned static classes", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "app/typeset.css"), "utf8")
    expect(css).toContain("[data-compatible-preview]")
    for (const className of [
      "repopress-preview-box",
      "repopress-preview-stack",
      "repopress-preview-inline",
      "repopress-preview-text",
      "repopress-preview-list",
      "repopress-preview-action",
      "repopress-preview-image",
      "repopress-preview-icon",
    ]) {
      expect(css).toContain(`.${className}`)
    }
    expect(css).not.toMatch(/\.repopress-preview-[^{]+\{[\s\S]*?url\(/)
  })

  it("publishes the bounded inert image reference budgets", () => {
    expect(PREVIEW_IMAGE_SOURCE_MAX_BYTES).toBe(2_048)
    expect(PREVIEW_IMAGE_TEXT_MAX_BYTES).toBe(512)
  })
})

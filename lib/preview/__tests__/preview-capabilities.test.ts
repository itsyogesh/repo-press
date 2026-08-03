import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  hasAcceptedPreviewImageHttpsAuthority,
  PREVIEW_ACTION_TONES,
  PREVIEW_BOX_TONES,
  PREVIEW_CAPABILITY_NAMES,
  PREVIEW_DOCUMENT_LAYOUTS,
  PREVIEW_DOCUMENT_TONES,
  PREVIEW_GAPS,
  PREVIEW_ICON_NAMES,
  PREVIEW_IMAGE_ASPECTS,
  PREVIEW_IMAGE_HTTPS_AUTHORITY_POLICY,
  PREVIEW_IMAGE_SOURCE_MAX_BYTES,
  PREVIEW_IMAGE_TEXT_MAX_BYTES,
  PREVIEW_LIST_STYLES,
  PREVIEW_PAPER_HEADING_LEVELS,
  PREVIEW_PAPER_TEXT_MAX_BYTES,
  PREVIEW_PAPER_VARIANTS,
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
      "PreviewPaper",
      "PreviewDocument",
      "PreviewIcon",
    ])
    for (const options of [
      PREVIEW_CAPABILITY_NAMES,
      PREVIEW_DOCUMENT_LAYOUTS,
      PREVIEW_DOCUMENT_TONES,
      PREVIEW_ACTION_TONES,
      PREVIEW_BOX_TONES,
      PREVIEW_GAPS,
      PREVIEW_ICON_NAMES,
      PREVIEW_IMAGE_ASPECTS,
      PREVIEW_LIST_STYLES,
      PREVIEW_PAPER_HEADING_LEVELS,
      PREVIEW_PAPER_VARIANTS,
      PREVIEW_TEXT_SIZES,
      PREVIEW_TEXT_TONES,
      PREVIEW_TEXT_WEIGHTS,
    ]) {
      expect(Object.isFrozen(options)).toBe(true)
    }
  })

  it("publishes a small immutable document presentation vocabulary", () => {
    expect(PREVIEW_DOCUMENT_LAYOUTS).toEqual(["article", "wide"])
    expect(PREVIEW_DOCUMENT_TONES).toEqual(["default", "warm"])
    expect(Object.isFrozen(PREVIEW_DOCUMENT_LAYOUTS)).toBe(true)
    expect(Object.isFrozen(PREVIEW_DOCUMENT_TONES)).toBe(true)
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
      "repopress-preview-paper",
      "repopress-preview-document",
      "repopress-preview-icon",
    ]) {
      expect(css).toContain(`.${className}`)
    }
    expect(css).not.toMatch(/\.repopress-preview-[^{]+\{[\s\S]*?url\(/)
  })

  it("gives compatible documents a bounded reading surface and reset-resistant flow", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "app/typeset.css"), "utf8")
    const rule = (selector: string) => {
      const start = css.indexOf(`${selector} {`)
      expect(start).toBeGreaterThanOrEqual(0)
      return css.slice(start, css.indexOf("}", start) + 1)
    }

    expect(rule("[data-compatible-preview] .repopress-preview-document")).toMatch(/padding:/)
    expect(rule("[data-compatible-preview] .repopress-preview-document--article")).toContain("max-width: 48rem;")
    expect(rule("[data-compatible-preview] .repopress-preview-document--wide")).toContain("max-width: 80rem;")
    expect(rule("[data-compatible-preview] .repopress-preview-document > :where(* + *)")).toContain(
      "margin-block-start:",
    )
    expect(rule("[data-compatible-preview] .repopress-preview-document :where(h1, h2, h3, h4, h5, h6)")).toMatch(
      /font-weight: 600;/,
    )
    expect(rule("[data-compatible-preview] .repopress-preview-document :where(p, li)")).toContain("line-height:")
    expect(rule("[data-compatible-preview] .repopress-preview-document :where(ul, ol)")).toContain(
      "padding-inline-start:",
    )
    expect(rule("[data-compatible-preview] .repopress-preview-document :where(table)")).toContain("overflow-x: auto;")
    expect(rule("[data-compatible-preview] .repopress-preview-document :where(pre)")).toContain("white-space: pre;")
  })

  it("publishes the bounded inert image reference budgets", () => {
    expect(PREVIEW_IMAGE_SOURCE_MAX_BYTES).toBe(2_048)
    expect(PREVIEW_IMAGE_TEXT_MAX_BYTES).toBe(512)
  })

  it("publishes a small immutable paper vocabulary and text budget", () => {
    expect(PREVIEW_PAPER_VARIANTS).toEqual(["letter", "note", "worksheet"])
    expect(PREVIEW_PAPER_HEADING_LEVELS).toEqual([2, 3, "none"])
    expect(Object.isFrozen(PREVIEW_PAPER_VARIANTS)).toBe(true)
    expect(Object.isFrozen(PREVIEW_PAPER_HEADING_LEVELS)).toBe(true)
    expect(PREVIEW_PAPER_TEXT_MAX_BYTES).toBe(512)
  })

  it("keeps long paper copy inside narrow preview surfaces", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "app/typeset.css"), "utf8")
    const rule = (selector: string) => {
      const start = css.indexOf(`${selector} {`)
      expect(start).toBeGreaterThanOrEqual(0)
      return css.slice(start, css.indexOf("}", start) + 1)
    }
    expect(rule("[data-compatible-preview] .repopress-preview-paper")).toContain("min-width: 0;")
    expect(rule("[data-compatible-preview] .repopress-preview-paper-title")).toContain("min-width: 0;")
    expect(rule("[data-compatible-preview] .repopress-preview-paper-title")).toContain("overflow-wrap: anywhere;")
    expect(rule("[data-compatible-preview] .repopress-preview-action")).toContain("max-width: 100%;")
    expect(rule("[data-compatible-preview] .repopress-preview-action")).toContain("overflow-wrap: anywhere;")
    expect(css).toContain("@media (max-width: 30rem)")
  })

  it("publishes the raw fail-closed HTTPS authority policy", () => {
    expect(PREVIEW_IMAGE_HTTPS_AUTHORITY_POLICY).toEqual({
      host: "ascii-dns-or-canonical-ipv4",
      port: "canonical-decimal-1-65535",
      userinfo: "forbidden",
      ipv6: "forbidden",
      encodedAuthority: "forbidden",
    })
    expect(Object.isFrozen(PREVIEW_IMAGE_HTTPS_AUTHORITY_POLICY)).toBe(true)
    expect(hasAcceptedPreviewImageHttpsAuthority("https://cdn.example:8443/cover.png?width=1200")).toBe(true)
    expect(hasAcceptedPreviewImageHttpsAuthority("https://999.999.999.999/cover.png")).toBe(false)
  })
})

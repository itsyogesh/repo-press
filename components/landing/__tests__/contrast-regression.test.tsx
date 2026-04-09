import { readFileSync } from "node:fs"
import path from "node:path"
import type * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

import FeatureGrid from "../feature-grid"

function extractBlockVar(css: string, selector: RegExp, variableName: string) {
  const block = css.match(selector)?.[1]
  if (!block) {
    throw new Error(`Could not find block for ${selector}`)
  }

  const match = block.match(new RegExp(`${variableName}:\\s*([^;]+);`))
  if (!match) {
    throw new Error(`Could not find ${variableName} in matched block`)
  }

  return match[1].trim()
}

function extractRootVar(css: string, variableName: string) {
  return extractBlockVar(css, /:root\s*{([\s\S]*?)}/, variableName)
}

function extractDarkVar(css: string, variableName: string) {
  return extractBlockVar(css, /\.dark\s*{([\s\S]*?)}/, variableName)
}

function parseOklch(color: string) {
  const match = color.match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/)
  if (!match) {
    throw new Error(`Unsupported color format: ${color}`)
  }

  return {
    l: Number(match[1]),
    c: Number(match[2]),
    h: Number(match[3]),
  }
}

function oklchToRelativeLuminance(color: { l: number; c: number; h: number }) {
  const hueRadians = (color.h * Math.PI) / 180
  const a = color.c * Math.cos(hueRadians)
  const b = color.c * Math.sin(hueRadians)

  const l = color.l + 0.3963377774 * a + 0.2158037573 * b
  const m = color.l - 0.1055613458 * a - 0.0638541728 * b
  const s = color.l - 0.0894841775 * a - 1.291485548 * b

  const lCube = l ** 3
  const mCube = m ** 3
  const sCube = s ** 3

  const red = Math.max(0, Math.min(1, 4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube))
  const green = Math.max(0, Math.min(1, -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube))
  const blue = Math.max(0, Math.min(1, -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube))

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrastRatio(
  foreground: { l: number; c: number; h: number },
  background: { l: number; c: number; h: number },
) {
  const foregroundLuminance = oklchToRelativeLuminance(foreground)
  const backgroundLuminance = oklchToRelativeLuminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)

  return (lighter + 0.05) / (darker + 0.05)
}

describe("landing contrast regressions", () => {
  it("keeps critical light and dark theme tokens above WCAG AA contrast", () => {
    const css = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8")

    const primary = parseOklch(extractRootVar(css, "--primary"))
    const primaryForeground = parseOklch(extractRootVar(css, "--primary-foreground"))
    const muted = parseOklch(extractRootVar(css, "--muted"))
    const mutedForeground = parseOklch(extractRootVar(css, "--muted-foreground"))
    const destructive = parseOklch(extractRootVar(css, "--destructive"))
    const destructiveForeground = parseOklch(extractRootVar(css, "--destructive-foreground"))
    const darkPrimary = parseOklch(extractDarkVar(css, "--primary"))
    const darkPrimaryForeground = parseOklch(extractDarkVar(css, "--primary-foreground"))

    expect(extractRootVar(css, "--primary-foreground")).toBe("oklch(0.985 0 0)")
    expect(contrastRatio(primaryForeground, primary)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(mutedForeground, muted)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(destructiveForeground, destructive)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(darkPrimaryForeground, darkPrimary)).toBeGreaterThanOrEqual(4.5)
  })

  it("avoids low-contrast blue-on-blue accent copy in landing highlights", () => {
    const featureGridHtml = renderToStaticMarkup(<FeatureGrid />)

    expect(featureGridHtml).not.toContain("text-[10px] text-primary font-mono")
    expect(featureGridHtml).not.toContain("text-xs font-medium text-primary")
  })
})

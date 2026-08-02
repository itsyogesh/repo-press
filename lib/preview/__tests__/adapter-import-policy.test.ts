import { describe, expect, it } from "vitest"
import { assertCompatibleAdapterImports, CompatibleAdapterImportError } from "../adapter-import-policy"

describe("compatible adapter import policy", () => {
  it("accepts the portable single-file adapter surface", () => {
    expect(() =>
      assertCompatibleAdapterImports(`
        import React, { Fragment } from "react"
        import { jsx } from "react/jsx-runtime"
        import { jsxDEV } from "react/jsx-dev-runtime"
        import * as Preview from "@repopress/preview"
        export const adapter = { components: { Fragment, Box: Preview.PreviewBox } }
      `),
    ).not.toThrow()
  })

  it.each([
    ['import Link from "next/link"', "next/link"],
    ['import { Card } from "@/components/card"', "@/components/card"],
    ['import { thing } from "./thing"', "./thing"],
    ['export { thing } from "../thing"', "../thing"],
    ['import value = require("react")', "require"],
  ])("rejects unsupported static dependency %s", (source, expected) => {
    expect(() => assertCompatibleAdapterImports(source)).toThrowError(CompatibleAdapterImportError)
    expect(() => assertCompatibleAdapterImports(source)).toThrow(expected)
  })

  it.each([
    'const module = import("react")',
    "const url = import.meta.url",
    'const module = require("react")',
    "const module = require(name)",
    "const loader = require",
  ])("rejects runtime module loading: %s", (source) => {
    expect(() => assertCompatibleAdapterImports(source)).toThrowError(CompatibleAdapterImportError)
  })

  it("rejects malformed adapter source", () => {
    expect(() => assertCompatibleAdapterImports("export const adapter = {")).toThrowError(CompatibleAdapterImportError)
  })
})

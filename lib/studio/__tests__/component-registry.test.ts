import { describe, expect, it } from "vitest"
import { deriveCapabilities } from "../component-registry"

describe("deriveCapabilities compatibility helper", () => {
  it("derives declarative capabilities without executable values", () => {
    expect(deriveCapabilities([{ name: "src", type: "image" }], "text")).toEqual({
      inline: true,
      media: true,
      configurable: true,
    })
  })

  it("does not mark flow components inline", () => {
    expect(deriveCapabilities([], "flow").inline).toBe(false)
  })

  it("does not mark components without image props as media", () => {
    expect(deriveCapabilities([{ name: "title", type: "string" }], "flow").media).toBe(false)
  })

  it("does not mark components without props configurable", () => {
    expect(deriveCapabilities([], "flow").configurable).toBe(false)
  })

  it("marks non-image props configurable", () => {
    expect(deriveCapabilities([{ name: "count", type: "number" }], "flow").configurable).toBe(true)
  })

  it("derives all flags deterministically", () => {
    const props = [{ name: "src", type: "image" as const }]
    expect(deriveCapabilities(props, "text")).toStrictEqual(deriveCapabilities(props, "text"))
  })
})

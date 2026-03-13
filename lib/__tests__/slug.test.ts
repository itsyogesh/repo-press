import { describe, it, expect } from "vitest"
import { slugify } from "../slug"

describe("slugify", () => {
  it("lowercases and trims a simple title", () => {
    expect(slugify("Hello World")).toBe("hello-world")
  })

  it("strips diacritics (é, ü, ñ, etc.)", () => {
    expect(slugify("Café Résumé")).toBe("cafe-resume")
    expect(slugify("über cool")).toBe("uber-cool")
    expect(slugify("El niño")).toBe("el-nino")
  })

  it("replaces spaces and special characters with hyphens", () => {
    expect(slugify("Hello, World!")).toBe("hello-world")
    expect(slugify("React & Next.js Tutorial")).toBe("react-next-js-tutorial")
  })

  it("collapses multiple consecutive hyphens", () => {
    expect(slugify("foo   bar")).toBe("foo-bar")
    expect(slugify("foo -- bar")).toBe("foo-bar")
  })

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  --hello--  ")).toBe("hello")
    expect(slugify("!leading")).toBe("leading")
  })

  it("returns 'untitled' for empty or whitespace-only input", () => {
    expect(slugify("")).toBe("untitled")
    expect(slugify("   ")).toBe("untitled")
    expect(slugify("!!!")).toBe("untitled")
  })

  it("handles already-slug-shaped input unchanged", () => {
    expect(slugify("my-post-title")).toBe("my-post-title")
    expect(slugify("123-numbers")).toBe("123-numbers")
  })
})

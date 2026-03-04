import { describe, expect, it } from "vitest"
import { evaluateMdx } from "../evaluateMdx"

describe("evaluateMdx", () => {
  it("evaluates strict-mode MDX output without SyntaxError", () => {
    const code = '"use strict"; return { default: function MdxContent() { return null } };'

    const component = evaluateMdx(code, {})

    expect(typeof component).toBe("function")
  })

  it("shadows Function in the sandbox scope", () => {
    const code = '"use strict"; return { default: typeof Function };'

    const result = evaluateMdx(code, {})

    expect(result).toBe("undefined")
  })

  it("blocks global aliases that can bypass blocked globals", () => {
    const code = '"use strict"; return { default: [typeof window, typeof self, typeof globalThis] };'

    const result = evaluateMdx(code, {})

    expect(result).toEqual(["undefined", "undefined", "undefined"])
  })
})

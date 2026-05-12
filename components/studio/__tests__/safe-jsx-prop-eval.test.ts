import { describe, expect, it } from "vitest"
import { safeEvalJsExpression } from "../safe-jsx-prop-eval"

describe("safeEvalJsExpression", () => {
  it("evaluates optional chaining member access", () => {
    const scope = {
      MEDIA_REGISTRY: {
        cloudflare: {
          images: {
            test: "https://example.com/test.png",
          },
        },
      },
    }

    const result = safeEvalJsExpression('MEDIA_REGISTRY.cloudflare?.images?.["test"]', scope)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe("https://example.com/test.png")
    }
  })

  it("returns undefined when optional chain hits nullish object", () => {
    const scope = {
      MEDIA_REGISTRY: {
        cloudflare: null,
      },
    }

    const result = safeEvalJsExpression("MEDIA_REGISTRY.cloudflare?.images", scope)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBeUndefined()
    }
  })

  it("keeps non-optional null access as an error", () => {
    const scope = {
      MEDIA_REGISTRY: {
        cloudflare: null,
      },
    }

    const result = safeEvalJsExpression("MEDIA_REGISTRY.cloudflare.images", scope)
    expect(result.ok).toBe(false)
  })
})

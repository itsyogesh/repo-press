import { UNIVERSAL_FIELDS } from "../fields"
import type { FrameworkAdapter } from "../types"

export const customAdapter: FrameworkAdapter = {
  id: "custom",
  displayName: "Custom / Unknown",
  defaultContentRoots: ["content", "docs", "posts", "pages", ""],
  metaFilePattern: null,
  fieldVariants: {},
  fields: [...UNIVERSAL_FIELDS],
  detect() {
    // Always matches as fallback with minimal score
    return { score: 1, contentType: "custom" }
  },
}

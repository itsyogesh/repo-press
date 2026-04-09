import { describe, expect, it } from "vitest"
import { buildPublishBranchName } from "../publish-branch-name"

describe("buildPublishBranchName", () => {
  it("builds a readable publish branch suffix with a stable UTC timestamp token", () => {
    expect(buildPublishBranchName("main", 1_700_000_000_000)).toBe("repopress/publish/main/2023-11-14-221320-loyw3v28")
  })
})

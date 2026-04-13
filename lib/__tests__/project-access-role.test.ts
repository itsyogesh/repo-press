import { describe, expect, it } from "vitest"
import { resolveProjectAccessRole } from "../project-access-role"

describe("resolveProjectAccessRole", () => {
  it("upgrades the matching project owner to owner for Convex-scoped project actions", () => {
    expect(
      resolveProjectAccessRole({
        actingUserId: "user-1",
        projectOwnerId: "user-1",
        resolvedRepoRole: "viewer",
      }),
    ).toBe("owner")
  })

  it("keeps the resolved repo role for projects owned by someone else", () => {
    expect(
      resolveProjectAccessRole({
        actingUserId: "user-1",
        projectOwnerId: "user-2",
        resolvedRepoRole: "editor",
      }),
    ).toBe("editor")
  })

  it("returns null when the caller has no repo role and does not own the project", () => {
    expect(
      resolveProjectAccessRole({
        actingUserId: "user-1",
        projectOwnerId: "user-2",
        resolvedRepoRole: null,
      }),
    ).toBeNull()
  })
})

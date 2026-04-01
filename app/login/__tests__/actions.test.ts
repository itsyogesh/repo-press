import { beforeEach, describe, expect, it, vi } from "vitest"

// ── Hoisted mocks ────────────────────────────────────────────────

const { cookieSetMock, cookieDeleteMock } = vi.hoisted(() => ({
  cookieSetMock: vi.fn(),
  cookieDeleteMock: vi.fn(),
}))

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    set: cookieSetMock,
    delete: cookieDeleteMock,
  }),
}))

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => {
    throw new Error("NEXT_REDIRECT")
  }),
}))

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}))

// ── Import after mocks ──────────────────────────────────────────

import { clearGitHubPAT, loginWithPAT } from "../actions"

// ── Tests ────────────────────────────────────────────────────────

describe("login actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("clearGitHubPAT", () => {
    it("deletes the github_pat cookie", async () => {
      await clearGitHubPAT()

      expect(cookieDeleteMock).toHaveBeenCalledWith("github_pat")
    })

    it("does not set any new cookies", async () => {
      await clearGitHubPAT()

      expect(cookieSetMock).not.toHaveBeenCalled()
    })
  })

  describe("loginWithPAT", () => {
    it("sets httpOnly cookie with the provided token", async () => {
      const formData = new FormData()
      formData.set("token", "ghp_test_123")

      await expect(loginWithPAT(formData)).rejects.toThrow("NEXT_REDIRECT")

      expect(cookieSetMock).toHaveBeenCalledWith(
        "github_pat",
        "ghp_test_123",
        expect.objectContaining({
          httpOnly: true,
          path: "/",
        }),
      )
    })

    it("throws when token is missing", async () => {
      const formData = new FormData()

      await expect(loginWithPAT(formData)).rejects.toThrow("Token is required")
    })

    it("redirects to /dashboard after setting cookie", async () => {
      const formData = new FormData()
      formData.set("token", "ghp_test_123")

      await expect(loginWithPAT(formData)).rejects.toThrow("NEXT_REDIRECT")

      expect(redirectMock).toHaveBeenCalledWith("/dashboard")
    })
  })
})

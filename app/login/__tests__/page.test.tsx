import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getGitHubTokenMock } = vi.hoisted(() => ({
  getGitHubTokenMock: vi.fn(),
}))

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => {
    throw new Error("NEXT_REDIRECT")
  }),
}))

vi.mock("@/lib/auth-server", () => ({
  getGitHubToken: getGitHubTokenMock,
}))

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>()
  return {
    ...actual,
    redirect: redirectMock,
  }
})

vi.mock("../login-page-client", () => ({
  default: () => <div>Login client</div>,
}))

import LoginPage from "../page"

describe("login page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("redirects authenticated users to /dashboard", async () => {
    getGitHubTokenMock.mockResolvedValue("gho_test")

    await expect(LoginPage()).rejects.toThrow("NEXT_REDIRECT")
    expect(redirectMock).toHaveBeenCalledWith("/dashboard")
  })

  it("renders the login client for unauthenticated users", async () => {
    getGitHubTokenMock.mockResolvedValue(null)

    render(await LoginPage())

    expect(screen.getByText("Login client")).toBeInTheDocument()
  })
})

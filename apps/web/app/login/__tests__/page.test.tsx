import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { socialMock } = vi.hoisted(() => ({
  socialMock: vi.fn(),
}))

vi.mock("@/lib/auth-client", () => ({
  signIn: {
    social: socialMock,
  },
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("../actions", () => ({
  loginWithPAT: vi.fn(),
}))

import LoginPage from "../page"

describe("GitHub OAuth login", () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("keeps the dashboard callback and surfaces a returned Better Auth error", async () => {
    socialMock.mockResolvedValue({
      data: null,
      error: { message: "GitHub sign-in is not configured for this site." },
    })

    render(<LoginPage />)
    fireEvent.click(screen.getByRole("button", { name: "Sign in with GitHub" }))

    expect(await screen.findByText("GitHub sign-in is not configured for this site.")).toBeInTheDocument()
    expect(socialMock).toHaveBeenCalledWith({
      provider: "github",
      callbackURL: "/dashboard",
    })
  })

  it("surfaces a safe retry message when the auth request throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    socialMock.mockRejectedValue(new Error("network details must not be shown"))

    render(<LoginPage />)
    fireEvent.click(screen.getByRole("button", { name: "Sign in with GitHub" }))

    expect(await screen.findByText("GitHub sign-in could not start. Please try again.")).toBeInTheDocument()
    expect(screen.queryByText(/network details/i)).not.toBeInTheDocument()
  })

  it("prevents duplicate submissions while GitHub sign-in is pending", async () => {
    socialMock.mockImplementation(() => new Promise(() => {}))

    render(<LoginPage />)
    fireEvent.click(screen.getByRole("button", { name: "Sign in with GitHub" }))

    await waitFor(() => expect(screen.getByRole("button", { name: "Connecting..." })).toBeDisabled())
    fireEvent.click(screen.getByRole("button", { name: "Connecting..." }))
    expect(socialMock).toHaveBeenCalledTimes(1)
  })
})

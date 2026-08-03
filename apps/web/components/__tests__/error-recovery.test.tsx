import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}))

import DashboardError from "@/app/dashboard/error"
import GlobalError from "@/app/global-error"
import { ErrorRecovery } from "@/components/error-recovery"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("ErrorRecovery", () => {
  it("explains that content is safe and offers retry and dashboard actions", () => {
    const onRetry = vi.fn()

    render(<ErrorRecovery onRetry={onRetry} digest="support-123" />)

    expect(screen.getByRole("heading", { name: "We couldn't open this workspace" })).toBeInTheDocument()
    expect(screen.getByText(/saved content and files in GitHub are safe/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute("href", "/dashboard")
    expect(screen.getByText("Reference support-123")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("keeps the dashboard boundary inside a section with recovery actions", () => {
    const reset = vi.fn()

    render(<DashboardError error={Object.assign(new Error("boom"), { digest: "dash-456" })} reset={reset} />)

    expect(screen.getByRole("region", { name: "Workspace recovery" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it("renders the branded recovery experience as the global fallback", () => {
    const html = renderToStaticMarkup(<GlobalError error={new Error("boom")} reset={() => {}} />)

    expect(html).toContain("RepoPress")
    expect(html).toContain("We couldn&#x27;t open RepoPress")
    expect(html).toContain("Try again")
  })
})

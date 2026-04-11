import type { InputHTMLAttributes, ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => <button {...props}>{children}</button>,
}))

vi.mock("@/components/ui/input", () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

describe("RepoScanner", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock("@/lib/repo-scanner-demo")
  })

  it("uses real sample repositories in the demo chips", async () => {
    const { default: RepoScanner } = await import("../repo-scanner")

    const html = renderToStaticMarkup(<RepoScanner />)

    expect(html).toContain("vercel/next.js")
    expect(html).not.toContain("vercel/nextjs.org")
  })

  it("associates the error message with the input when validation fails", async () => {
    vi.doMock("@/lib/repo-scanner-demo", () => ({
      buildRepoScannerDemo: () => ({ error: "Enter a valid GitHub repository URL." }),
    }))

    const { default: RepoScanner } = await import("../repo-scanner")

    const html = renderToStaticMarkup(<RepoScanner />)

    expect(html).toContain('aria-describedby="repo-scanner-error"')
    expect(html).toContain('id="repo-scanner-error"')
  })
})

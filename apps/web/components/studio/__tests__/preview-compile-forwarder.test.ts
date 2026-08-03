import fs from "node:fs"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"

describe("createCompileStatusForwarder", () => {
  it("keeps Generic preview wired as fallback while forwarding the compatible state", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "components/studio/studio-layout.tsx"), "utf8")
    expect(source).toContain("const compatiblePreview = useCompatiblePreview({")
    expect(source).toContain("{...compatiblePreview}")
    expect(source).toContain("fallbackResult={genericPreviewResult}")
  })

  it("emits true immediately and debounces the settled false signal", async () => {
    vi.useFakeTimers()

    const mod = await import("../preview")
    expect(typeof mod.createCompileStatusForwarder).toBe("function")
    if (typeof mod.createCompileStatusForwarder !== "function") return

    const calls: boolean[] = []
    const forwarder = mod.createCompileStatusForwarder((isCompiling) => {
      calls.push(isCompiling)
    }, 300)

    forwarder.update(true)
    forwarder.update(false)
    forwarder.update(false)

    expect(calls).toEqual([true])

    vi.advanceTimersByTime(299)
    expect(calls).toEqual([true])

    vi.advanceTimersByTime(1)
    expect(calls).toEqual([true, false])

    vi.useRealTimers()
  })

  it("cancels a pending settled notification", async () => {
    vi.useFakeTimers()

    const mod = await import("../preview")
    expect(typeof mod.createCompileStatusForwarder).toBe("function")
    if (typeof mod.createCompileStatusForwarder !== "function") return

    const calls: boolean[] = []
    const forwarder = mod.createCompileStatusForwarder((isCompiling) => {
      calls.push(isCompiling)
    }, 300)

    forwarder.update(true)
    forwarder.update(false)
    forwarder.cancel()
    vi.runAllTimers()

    expect(calls).toEqual([true])

    vi.useRealTimers()
  })
})

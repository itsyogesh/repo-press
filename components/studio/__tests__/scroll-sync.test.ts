import { afterEach, describe, expect, it, vi } from "vitest"

import { buildScrollAnchors, calculateSyncedScrollTop, createScrollSyncCoordinator } from "../scroll-sync"

function createFakeRect(top: number) {
  return { top } as DOMRect
}

function createFakeAnchorElement(tagName: string, innerText: string, top: number) {
  return {
    tagName,
    innerText,
    getBoundingClientRect: () => createFakeRect(top),
  } as unknown as HTMLElement
}

function createFakeAnimationFrame() {
  let nextId = 1
  const callbacks = new Map<number, FrameRequestCallback>()

  return {
    request: vi.fn((callback: FrameRequestCallback) => {
      const id = nextId++
      callbacks.set(id, callback)
      return id
    }),
    cancel: vi.fn((id: number) => {
      callbacks.delete(id)
    }),
    flush: (time = 16) => {
      const pending = [...callbacks.values()]
      callbacks.clear()
      for (const callback of pending) {
        callback(time)
      }
    },
    pendingCount: () => callbacks.size,
  }
}

describe("calculateSyncedScrollTop", () => {
  it("uses the nearest matched anchors instead of coarse section progress", () => {
    const sourceMetrics = {
      start: 600,
      scrollable: 3000,
      maxScroll: 3600,
      anchors: [
        { text: "what are the most popular top-level domains?", fromRoot: 0 },
        { text: "7 .au 1.7%", fromRoot: 1000 },
        { text: "13 .ir 1.1%", fromRoot: 1600 },
        { text: "14 .pl 1.1%", fromRoot: 1680 },
        { text: "15 .ca 1.0%", fromRoot: 1760 },
        { text: "18 .vn 0.7%", fromRoot: 2000 },
      ],
    }

    const targetMetrics = {
      start: 820,
      scrollable: 2500,
      maxScroll: 3320,
      anchors: [
        { text: "what are the most popular top-level domains?", fromRoot: 0 },
        { text: "7 .au 1.7%", fromRoot: 620 },
        { text: "13 .ir 1.1%", fromRoot: 1080 },
        { text: "14 .pl 1.1%", fromRoot: 1150 },
        { text: "15 .ca 1.0%", fromRoot: 1220 },
        { text: "18 .vn 0.7%", fromRoot: 1430 },
      ],
    }

    const sourceScrollTop = sourceMetrics.start + 1710

    expect(calculateSyncedScrollTop(sourceScrollTop, sourceMetrics, targetMetrics)).toBe(1996.25)
  })

  it("falls back to proportional pre-body syncing before the content root", () => {
    const sourceMetrics = {
      start: 500,
      scrollable: 1500,
      maxScroll: 2000,
      anchors: [],
    }

    const targetMetrics = {
      start: 300,
      scrollable: 900,
      maxScroll: 1200,
      anchors: [],
    }

    expect(calculateSyncedScrollTop(250, sourceMetrics, targetMetrics)).toBe(150)
  })
})

describe("buildScrollAnchors", () => {
  it("keeps heading anchors and ignores ambiguous paragraph or list anchors", () => {
    const elements = [
      createFakeAnchorElement("H2", "Intro section", 120),
      createFakeAnchorElement("P", "This paragraph is long enough to qualify today", 180),
      createFakeAnchorElement("LI", "List item that should not become an anchor", 220),
      createFakeAnchorElement("TR", "Row text that should not become an anchor", 260),
      createFakeAnchorElement("H3", "Deep dive", 320),
    ] satisfies HTMLElement[]

    const root = {
      querySelectorAll: (selector: string) =>
        selector === "h1,h2,h3,h4,h5,h6" ? elements.filter((element) => /^H[1-6]$/.test(element.tagName)) : [],
    } as unknown as HTMLElement

    const container = {
      scrollTop: 0,
      getBoundingClientRect: () => createFakeRect(20),
    } as unknown as HTMLDivElement

    expect(buildScrollAnchors(root, container, 100)).toEqual([
      { text: "intro section", fromRoot: 0 },
      { text: "deep dive", fromRoot: 200 },
    ])
  })
})

describe("createScrollSyncCoordinator", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("creates a coordinator when requestAnimationFrame is unavailable during SSR", () => {
    const globalScope = globalThis as typeof globalThis & {
      requestAnimationFrame?: typeof requestAnimationFrame
      cancelAnimationFrame?: typeof cancelAnimationFrame
    }
    const originalRequestFrame = globalScope.requestAnimationFrame
    const originalCancelFrame = globalScope.cancelAnimationFrame

    delete globalScope.requestAnimationFrame
    delete globalScope.cancelAnimationFrame

    try {
      expect(() => createScrollSyncCoordinator(() => {})).not.toThrow()
    } finally {
      if (originalRequestFrame) {
        globalScope.requestAnimationFrame = originalRequestFrame
      }
      if (originalCancelFrame) {
        globalScope.cancelAnimationFrame = originalCancelFrame
      }
    }
  })

  it("coalesces repeated same-source scroll events into one frame", () => {
    vi.useFakeTimers()

    const animationFrame = createFakeAnimationFrame()
    const calls: Array<"editor" | "preview"> = []
    const coordinator = createScrollSyncCoordinator(
      (source) => {
        calls.push(source)
      },
      {
        requestFrame: animationFrame.request,
        cancelFrame: animationFrame.cancel,
        setTimer: setTimeout,
        clearTimer: clearTimeout,
      },
    )

    expect(coordinator.schedule("editor")).toBe(true)
    expect(coordinator.schedule("editor")).toBe(true)
    expect(animationFrame.pendingCount()).toBe(1)

    animationFrame.flush()

    expect(calls).toEqual(["editor"])
  })

  it("ignores opposite-source scroll events until the direction lock expires", () => {
    vi.useFakeTimers()

    const animationFrame = createFakeAnimationFrame()
    const calls: Array<"editor" | "preview"> = []
    const coordinator = createScrollSyncCoordinator(
      (source) => {
        calls.push(source)
      },
      {
        lockMs: 150,
        requestFrame: animationFrame.request,
        cancelFrame: animationFrame.cancel,
        setTimer: setTimeout,
        clearTimer: clearTimeout,
      },
    )

    expect(coordinator.schedule("editor")).toBe(true)
    animationFrame.flush()

    expect(calls).toEqual(["editor"])
    expect(coordinator.schedule("preview")).toBe(false)

    vi.advanceTimersByTime(149)
    expect(coordinator.schedule("preview")).toBe(false)

    vi.advanceTimersByTime(1)
    expect(coordinator.schedule("preview")).toBe(true)

    animationFrame.flush()

    expect(calls).toEqual(["editor", "preview"])
  })
})

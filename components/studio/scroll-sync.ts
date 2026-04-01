export type ScrollSyncAnchor = {
  text: string
  fromRoot: number
}

export type ScrollSyncSource = "editor" | "preview"

export type ScrollSyncMetrics = {
  start: number
  scrollable: number
  maxScroll: number
  anchors: ScrollSyncAnchor[]
}

const ANCHOR_KEY_LENGTH = 40
const HEADING_SELECTOR = "h1,h2,h3,h4,h5,h6"
const DEFAULT_SCROLL_SOURCE_LOCK_MS = 150

function normalizeAnchorText(text: string) {
  return text.replace(/\s+/g, " ").trim().toLowerCase()
}

function getAnchorKey(text: string) {
  return normalizeAnchorText(text).slice(0, ANCHOR_KEY_LENGTH)
}

export function buildScrollAnchors(root: HTMLElement, container: HTMLDivElement, start: number): ScrollSyncAnchor[] {
  const containerRect = container.getBoundingClientRect()
  const anchors: ScrollSyncAnchor[] = []
  let lastKey: string | null = null

  for (const element of root.querySelectorAll<HTMLElement>(HEADING_SELECTOR)) {
    const text = normalizeAnchorText(element.innerText ?? "")
    if (!text) continue

    const key = getAnchorKey(text)
    if (!key || key === lastKey) continue

    const absPos = container.scrollTop + element.getBoundingClientRect().top - containerRect.top
    anchors.push({
      text,
      fromRoot: Math.round(absPos - start),
    })
    lastKey = key
  }

  return anchors
}

type ScrollSyncCoordinatorOptions = {
  lockMs?: number
  requestFrame?: (callback: FrameRequestCallback) => number
  cancelFrame?: (id: number) => void
  setTimer?: typeof setTimeout
  clearTimer?: typeof clearTimeout
}

export function createScrollSyncCoordinator(
  sync: (source: ScrollSyncSource) => void,
  options: ScrollSyncCoordinatorOptions = {},
) {
  const lockMs = options.lockMs ?? DEFAULT_SCROLL_SOURCE_LOCK_MS
  const requestFrame = options.requestFrame ?? requestAnimationFrame
  const cancelFrame = options.cancelFrame ?? cancelAnimationFrame
  const setTimer = options.setTimer ?? setTimeout
  const clearTimer = options.clearTimer ?? clearTimeout

  let activeSource: ScrollSyncSource | null = null
  let queuedSource: ScrollSyncSource | null = null
  let releaseTimer: ReturnType<typeof setTimeout> | null = null
  let frameId: number | null = null

  const releaseLock = () => {
    activeSource = null
    releaseTimer = null
  }

  const queueRelease = () => {
    if (releaseTimer !== null) {
      clearTimer(releaseTimer)
    }
    releaseTimer = setTimer(() => {
      releaseLock()
    }, lockMs)
  }

  return {
    schedule(source: ScrollSyncSource) {
      if (activeSource !== null && activeSource !== source) {
        return false
      }

      activeSource = source
      queuedSource = source
      queueRelease()

      if (frameId === null) {
        frameId = requestFrame(() => {
          frameId = null
          const nextSource = queuedSource
          queuedSource = null
          if (!nextSource) return
          sync(nextSource)
        })
      }

      return true
    },
    clear() {
      queuedSource = null

      if (frameId !== null) {
        cancelFrame(frameId)
        frameId = null
      }

      if (releaseTimer !== null) {
        clearTimer(releaseTimer)
        releaseTimer = null
      }

      activeSource = null
    },
  }
}

export function calculateSyncedScrollTop(
  sourceScrollTop: number,
  sourceMetrics: ScrollSyncMetrics,
  targetMetrics: ScrollSyncMetrics,
) {
  if (sourceScrollTop < sourceMetrics.start) {
    const preProgress = sourceMetrics.start > 0 ? sourceScrollTop / sourceMetrics.start : 0
    return preProgress * targetMetrics.start
  }

  const sourceBodyPos = sourceScrollTop - sourceMetrics.start
  const targetByText = new Map<string, number>()

  for (const anchor of targetMetrics.anchors) {
    targetByText.set(getAnchorKey(anchor.text), anchor.fromRoot)
  }

  const matchedAnchors = sourceMetrics.anchors
    .map((anchor) => {
      const targetFromRoot = targetByText.get(getAnchorKey(anchor.text))
      return targetFromRoot === undefined
        ? null
        : {
            sourceFromRoot: anchor.fromRoot,
            targetFromRoot,
          }
    })
    .filter((anchor): anchor is { sourceFromRoot: number; targetFromRoot: number } => anchor !== null)

  if (matchedAnchors.length > 0) {
    let previous = { sourceFromRoot: 0, targetFromRoot: 0 }
    let next = {
      sourceFromRoot: sourceMetrics.scrollable,
      targetFromRoot: targetMetrics.scrollable,
    }

    for (const anchor of matchedAnchors) {
      if (anchor.sourceFromRoot <= sourceBodyPos) {
        previous = anchor
      } else {
        next = anchor
        break
      }
    }

    const sourceSpan = Math.max(1, next.sourceFromRoot - previous.sourceFromRoot)
    const sectionProgress = Math.min(1, Math.max(0, (sourceBodyPos - previous.sourceFromRoot) / sourceSpan))
    const targetBodyPos = previous.targetFromRoot + sectionProgress * (next.targetFromRoot - previous.targetFromRoot)
    return targetMetrics.start + targetBodyPos
  }

  const rawProgress =
    sourceMetrics.scrollable > 0
      ? sourceBodyPos / sourceMetrics.scrollable
      : sourceMetrics.maxScroll > 0
        ? sourceScrollTop / sourceMetrics.maxScroll
        : 0

  const progress = Math.min(1, Math.max(0, rawProgress))
  return targetMetrics.scrollable > 0
    ? targetMetrics.start + progress * targetMetrics.scrollable
    : progress * targetMetrics.maxScroll
}

import { describe, expect, it } from "vitest"
import { createPreviewSessionState, reducePreviewEvent } from "../session-state"

const event = (overrides: Record<string, unknown> = {}) => ({
  sessionId: "session-1",
  snapshotVersion: 2,
  sequence: 1,
  type: "fidelity",
  payload: "compatible",
  ...overrides,
})

describe("preview session state", () => {
  it("upgrades fidelity without clearing editor-owned state", () => {
    const initial = createPreviewSessionState({ editorRevision: "draft-local-7" })
    const compatible = reducePreviewEvent(initial, event())
    const native = reducePreviewEvent(compatible, event({ sequence: 2, payload: "native" }))

    expect(native.fidelity).toBe("native")
    expect(native.editorRevision).toBe("draft-local-7")
  })

  it("ignores lower snapshot versions by identity", () => {
    const state = reducePreviewEvent(createPreviewSessionState({ editorRevision: "local" }), event())

    expect(reducePreviewEvent(state, event({ snapshotVersion: 1, sequence: 99 }))).toBe(state)
  })

  it("ignores duplicate and lower sequences for the current snapshot by identity", () => {
    const state = reducePreviewEvent(createPreviewSessionState({ editorRevision: "local" }), event({ sequence: 4 }))

    expect(reducePreviewEvent(state, event({ sequence: 4 }))).toBe(state)
    expect(reducePreviewEvent(state, event({ sequence: 3 }))).toBe(state)
  })

  it("accepts a higher snapshot with a reset sequence and preserves editor state", () => {
    const initial = createPreviewSessionState({ editorRevision: "draft-local-8" })
    const oldSnapshot = reducePreviewEvent(initial, event({ snapshotVersion: 2, sequence: 9 }))
    const nextSnapshot = reducePreviewEvent(oldSnapshot, event({ snapshotVersion: 3, sequence: 1, payload: "native" }))

    expect(nextSnapshot).not.toBe(oldSnapshot)
    expect(nextSnapshot.snapshotVersion).toBe(3)
    expect(nextSnapshot.sequence).toBe(1)
    expect(nextSnapshot.fidelity).toBe("native")
    expect(nextSnapshot.editorRevision).toBe("draft-local-8")
  })

  it("preserves typed payloads in accepted event order", () => {
    let state = createPreviewSessionState({ editorRevision: "local" })
    state = reducePreviewEvent(state, event({ type: "status", payload: "building" }))
    state = reducePreviewEvent(
      state,
      event({
        sequence: 2,
        type: "target",
        payload: { kind: "sandboxed-iframe", url: "https://preview.example.test" },
      }),
    )
    state = reducePreviewEvent(
      state,
      event({
        sequence: 3,
        type: "diagnostics",
        payload: [
          {
            stage: "compile",
            severity: "warning",
            code: "MISSING_EXPORT",
            message: "Using a fallback export",
            recoverable: true,
          },
        ],
      }),
    )

    expect(state.status).toBe("building")
    expect(state.target).toEqual({
      kind: "sandboxed-iframe",
      url: "https://preview.example.test",
    })
    expect(state.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["MISSING_EXPORT"])
    expect(state.events.map((acceptedEvent) => acceptedEvent.type)).toEqual(["status", "target", "diagnostics"])
  })

  it("ignores all later events after expiration", () => {
    const initial = createPreviewSessionState({ editorRevision: "local" })
    const expired = reducePreviewEvent(initial, event({ type: "expired", payload: null }))

    expect(expired.status).toBe("expired")
    expect(reducePreviewEvent(expired, event({ snapshotVersion: 3, sequence: 1, payload: "native" }))).toBe(expired)
  })

  it("ignores structurally or semantically invalid events before mutation", () => {
    const state = createPreviewSessionState({ editorRevision: "local" })

    expect(reducePreviewEvent(state, { ...event(), unexpected: true })).toBe(state)
    expect(reducePreviewEvent(state, event({ type: "status", payload: "unknown" }))).toBe(state)
    expect(reducePreviewEvent(state, event({ type: "target", payload: { kind: "unsafe" } }))).toBe(state)
  })

  it("rejects a malformed iframe URL without throwing", () => {
    const state = createPreviewSessionState({ editorRevision: "local" })
    const malformedTarget = event({
      type: "target",
      payload: { kind: "sandboxed-iframe", url: "not a url" },
    })

    expect(() => reducePreviewEvent(state, malformedTarget)).not.toThrow()
    expect(reducePreviewEvent(state, malformedTarget)).toBe(state)
  })

  it("rejects a foreign session even at a higher snapshot version", () => {
    const bound = reducePreviewEvent(
      createPreviewSessionState({ editorRevision: "local" }),
      event({ sessionId: "session-a" }),
    )

    expect(reducePreviewEvent(bound, event({ sessionId: "session-b", snapshotVersion: 3, sequence: 1 }))).toBe(bound)
  })

  it("rejects foreign higher-snapshot expiration", () => {
    const bound = reducePreviewEvent(
      createPreviewSessionState({ editorRevision: "local" }),
      event({ sessionId: "session-a" }),
    )

    expect(
      reducePreviewEvent(
        bound,
        event({
          sessionId: "session-b",
          snapshotVersion: 3,
          sequence: 1,
          type: "expired",
          payload: null,
        }),
      ),
    ).toBe(bound)
  })
})

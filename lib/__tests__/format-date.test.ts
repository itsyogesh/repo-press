import { describe, expect, it } from "vitest"

import { formatUtcDate } from "../format-date"

describe("formatUtcDate", () => {
  it("returns a UTC-stable yyyy-mm-dd string for timestamps", () => {
    expect(formatUtcDate(Date.UTC(2026, 3, 9, 18, 30, 0))).toBe("2026-04-09")
  })

  it("normalizes offset timestamps into their UTC calendar date", () => {
    expect(formatUtcDate("2026-04-09T23:30:00-07:00")).toBe("2026-04-10")
  })

  it("returns N/A for missing or invalid values", () => {
    expect(formatUtcDate(0)).toBe("1970-01-01")
    expect(formatUtcDate(undefined)).toBe("N/A")
    expect(formatUtcDate(null)).toBe("N/A")
    expect(formatUtcDate("not-a-date")).toBe("N/A")
  })
})

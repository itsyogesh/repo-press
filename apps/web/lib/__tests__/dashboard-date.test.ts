import { describe, expect, it } from "vitest"
import { formatDashboardDate, getDashboardDateParts } from "@/lib/dashboard-date"

describe("dashboard-date", () => {
  it("formats dashboard dates in a UTC-stable human-readable format", () => {
    expect(formatDashboardDate("2026-04-09T00:30:00.000Z")).toBe("Apr 9, 2026")
    expect(formatDashboardDate(Date.parse("2026-04-08T10:20:30.000Z"))).toBe("Apr 8, 2026")
  })

  it("returns ISO dateTime metadata when the date is valid", () => {
    expect(getDashboardDateParts("2026-04-09T00:30:00.000Z")).toEqual({
      label: "Apr 9, 2026",
      dateTime: "2026-04-09T00:30:00.000Z",
    })
    expect(getDashboardDateParts(undefined)).toEqual({ label: "N/A" })
  })
})

const DASHBOARD_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export type DashboardDateInput = number | string | null | undefined

function parseDashboardDate(value: DashboardDateInput) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date
}

export function getDashboardDateParts(value: DashboardDateInput) {
  const date = parseDashboardDate(value)
  if (!date) {
    return { label: "N/A" }
  }

  return {
    label: `${DASHBOARD_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`,
    dateTime: date.toISOString(),
  }
}

export function formatDashboardDate(value: DashboardDateInput) {
  return getDashboardDateParts(value).label
}

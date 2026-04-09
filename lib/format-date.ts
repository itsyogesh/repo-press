export function formatUtcDate(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return "N/A"
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "N/A"
  }

  return date.toISOString().slice(0, 10)
}

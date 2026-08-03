export function buildHistoryHref({
  owner,
  repo,
  branch,
  projectId,
}: {
  owner: string
  repo: string
  branch?: string
  projectId?: string
}) {
  const searchParams = new URLSearchParams()
  if (branch) {
    searchParams.set("branch", branch)
  }
  if (projectId) {
    searchParams.set("projectId", projectId)
  }

  const query = searchParams.toString()
  return `/dashboard/${owner}/${repo}/history${query ? `?${query}` : ""}`
}

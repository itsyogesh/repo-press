type RouteProject = {
  _id?: string
  repoOwner: string
  repoName: string
  branch?: string
}

export function projectMatchesRoute(
  project: RouteProject | null | undefined,
  owner: string,
  repo: string,
  branch?: string,
) {
  if (!project) return false
  if (project.repoOwner !== owner || project.repoName !== repo) return false
  if (branch && project.branch && project.branch !== branch) return false
  return true
}

export function selectRequestedStudioProject<T extends RouteProject>(
  project: T | null | undefined,
  owner: string,
  repo: string,
  branch?: string,
): T | null {
  return projectMatchesRoute(project, owner, repo, branch) ? project ?? null : null
}

export function selectStudioFallbackProject<T extends RouteProject>(projects: T[], branch?: string): T | null {
  if (projects.length === 0) return null
  const matchingBranch = branch ? projects.filter((project) => project.branch === branch) : projects
  if (matchingBranch.length !== 1) return null
  return matchingBranch[0]
}

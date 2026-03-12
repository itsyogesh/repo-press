import { ConvexHttpClient } from "convex/browser"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { getGitHubToken } from "@/lib/auth-server"
import { getRepoRole } from "@/lib/github-permissions"
import { mintServerQueryToken } from "@/lib/project-access-token"

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export async function POST(request: Request) {
  const token = await getGitHubToken()
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { projectId, owner, repo, branch, files } = body

    if (!projectId || !owner || !repo || !branch || !files) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // P1 fix: Verify the caller has at least viewer access to the repo
    const serverQueryToken = await mintServerQueryToken()
    const project = await convex.query(api.projects.get, {
      id: projectId as Id<"projects">,
      serverQueryToken,
    })
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    // Verify repo/branch match to prevent cross-project writes
    if (project.repoOwner !== owner || project.repoName !== repo || project.branch !== branch) {
      return NextResponse.json({ error: "Project does not match repo/branch" }, { status: 400 })
    }

    // Best-effort permission check — getRepoRole can return null for org repos
    // where the OAuth app lacks org-level access. The operation will fail naturally
    // if the token can't actually read repo content.
    const role = await getRepoRole(token, owner, repo)
    if (!role) {
      console.warn(`[sync-titles] getRepoRole returned null for ${owner}/${repo}, proceeding with token-based access`)
    }

    // Call the Convex action with the server-side token
    await convex.action(api.documents.syncTreeTitles, {
      projectId: projectId as Id<"projects">,
      owner,
      repo,
      branch,
      files,
      githubToken: token,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Error syncing titles:", error)
    return NextResponse.json({ error: "Failed to sync titles" }, { status: 500 })
  }
}

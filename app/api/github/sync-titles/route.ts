import { ConvexHttpClient } from "convex/browser"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { fetchAuthAction, getGitHubToken } from "@/lib/auth-server"
import { mintServerQueryToken } from "@/lib/project-access-token"
import { RouteAuthError, resolveRouteAuth } from "@/lib/route-auth"
import { prepareTitleSyncFiles } from "@/lib/studio/path-adapters"

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export async function POST(request: Request) {
  const token = await getGitHubToken()
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { projectId, owner, repo, branch, readRef, files } = body

    if (!projectId || !owner || !repo || !branch || !readRef || !files) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    if (typeof readRef !== "string" || !/^[0-9a-f]{40}$/i.test(readRef)) {
      return NextResponse.json({ error: "Invalid read ref" }, { status: 400 })
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

    let auth: Awaited<ReturnType<typeof resolveRouteAuth>>
    try {
      auth = await resolveRouteAuth(project, "editor")
    } catch (error) {
      if (error instanceof RouteAuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
      throw error
    }

    if (!fetchAuthAction) throw new Error("Authenticated Convex actions are unavailable")
    const preparedFiles = prepareTitleSyncFiles(project.contentRoot, files).map(({ path, sha }) => ({ path, sha }))
    await fetchAuthAction(api.documents.syncTreeTitles, {
      projectId: projectId as Id<"projects">,
      readRef,
      files: preparedFiles,
      githubToken: auth.githubToken,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Error syncing titles:", error)
    return NextResponse.json({ error: "Failed to sync titles" }, { status: 500 })
  }
}

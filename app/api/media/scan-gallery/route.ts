import { ConvexHttpClient } from "convex/browser"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { mintServerQueryToken } from "@/lib/project-access-token"
import { RouteAuthError, resolveRouteAuth } from "@/lib/route-auth"

export const runtime = "nodejs"

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { projectId, owner, repo, branch } = body

    if (!projectId || !owner || !repo || !branch) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Verify project exists and the request context matches
    const serverQueryToken = await mintServerQueryToken()
    const project = await convex.query(api.projects.get, {
      id: projectId as Id<"projects">,
      serverQueryToken,
    })
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    if (project.repoOwner !== owner || project.repoName !== repo || project.branch !== branch) {
      return NextResponse.json({ error: "Project does not match repo/branch" }, { status: 400 })
    }

    let auth: Awaited<ReturnType<typeof resolveRouteAuth>>
    try {
      auth = await resolveRouteAuth(project, "editor")
    } catch (e) {
      if (e instanceof RouteAuthError) {
        return NextResponse.json({ error: e.message }, { status: e.status })
      }
      throw e
    }

    const { actingUserId, projectAccessToken, githubToken } = auth

    const result = await convex.action(api.mediaGallery.scanImagesFromGitHub, {
      projectId: projectId as Id<"projects">,
      owner,
      repo,
      branch,
      githubToken,
      userId: actingUserId,
      projectAccessToken,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error scanning gallery:", error)
    return NextResponse.json({ error: "Failed to scan repository images" }, { status: 500 })
  }
}

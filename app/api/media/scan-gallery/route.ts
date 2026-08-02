import { ConvexHttpClient } from "convex/browser"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { fetchAuthAction } from "@/lib/auth-server"
import { mintServerQueryToken } from "@/lib/project-access-token"
import { RouteAuthError, resolveRouteGitHubCredential } from "@/lib/route-auth"

export const runtime = "nodejs"

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export async function POST(request: Request) {
  let githubToken: string
  try {
    const credential = await resolveRouteGitHubCredential()
    githubToken = credential.githubToken
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    throw error
  }

  try {
    const body = await request.json()
    const { projectId, owner, repo, branch, readRef } = body

    if (!projectId || !owner || !repo || !branch || !readRef) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    if (typeof readRef !== "string" || !/^[0-9a-f]{40}$/i.test(readRef)) {
      return NextResponse.json({ error: "Invalid read ref" }, { status: 400 })
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

    if (!fetchAuthAction) throw new Error("Authenticated Convex actions are unavailable")

    const result = await fetchAuthAction(api.mediaGallery.scanImagesFromGitHub, {
      projectId: projectId as Id<"projects">,
      readRef,
      githubToken,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error scanning gallery:", error)
    return NextResponse.json({ error: "Failed to scan repository images" }, { status: 500 })
  }
}

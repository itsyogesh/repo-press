import { NextResponse } from "next/server"
import { getGitHubToken } from "@/lib/auth-server"
import { createGitHubClient } from "@/lib/github"
import { isValidGitHubName } from "@/lib/route-validation"

export async function GET(request: Request) {
  const token = await getGitHubToken()
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const owner = searchParams.get("owner")
  const repo = searchParams.get("repo")
  const prNumberStr = searchParams.get("prNumber")

  if (!owner || !repo || !prNumberStr) {
    return NextResponse.json({ error: "Missing required query params: owner, repo, prNumber" }, { status: 400 })
  }

  if (!isValidGitHubName(owner)) {
    return NextResponse.json({ error: "Invalid owner format" }, { status: 400 })
  }
  if (!isValidGitHubName(repo)) {
    return NextResponse.json({ error: "Invalid repo format" }, { status: 400 })
  }

  const prNumber = parseInt(prNumberStr, 10)
  if (Number.isNaN(prNumber) || prNumber <= 0 || prNumber > Number.MAX_SAFE_INTEGER) {
    return NextResponse.json({ error: "prNumber must be a positive integer" }, { status: 400 })
  }

  try {
    const octokit = createGitHubClient(token)
    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber })
    return NextResponse.json({ state: pr.state, merged: pr.merged })
  } catch (error: unknown) {
    const status = (error as any)?.status
    if (status === 404) {
      return NextResponse.json({ error: "PR not found" }, { status: 404 })
    }
    console.error("Error fetching PR status:", error)
    return NextResponse.json({ error: "Failed to fetch PR status" }, { status: 500 })
  }
}

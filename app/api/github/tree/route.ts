import type { NextRequest } from "next/server"
import { getGitHubToken } from "@/lib/auth-server"
import { getContentTree } from "@/lib/github"

export async function GET(request: NextRequest) {
  const token = await getGitHubToken()
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const owner = searchParams.get("owner")
  const repo = searchParams.get("repo")
  const branch = searchParams.get("branch") ?? "main"
  const contentRoot = searchParams.get("contentRoot") ?? ""

  if (!owner || !repo) {
    return Response.json({ error: "Missing required params: owner and repo" }, { status: 400 })
  }

  const tree = await getContentTree(token, owner, repo, branch, contentRoot)
  return Response.json(tree)
}

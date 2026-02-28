import { NextResponse } from "next/server"
import { getGitHubToken } from "@/lib/auth-server"
import { createGitHubClient } from "@/lib/github"

export async function POST(request: Request) {
  const token = await getGitHubToken()

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { owner, repo, path, content, sha, message, branch } = body

    if (!owner || !repo || !path || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // content is already base64 encoded from the client.
    // Use Octokit directly to avoid double-encoding through saveFileContent.
    const octokit = createGitHubClient(token)
    const { data: result } = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: message || `Upload image via RepoPress`,
      content,
      sha,
      branch,
    })

    if (!result.content || !result.commit) {
      return NextResponse.json({ error: "Failed to upload image" }, { status: 500 })
    }

    return NextResponse.json({
      path,
      sha: result.content.sha,
      commitSha: result.commit.sha,
      url: result.content.html_url,
    })
  } catch (error) {
    console.error("Error uploading image:", error)
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 })
  }
}

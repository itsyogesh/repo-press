import type { Role } from "../../lib/roles"
import { roleAtLeast } from "../../lib/roles"
import { components, internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import type { ActionCtx } from "../_generated/server"
import { authComponent } from "../auth"

type AuthorizedGitHubActionProject = {
  actorUserId: string
  project: Doc<"projects">
  role: Role
}

export function assertGitHubCommitSha(value: string, fieldName = "read ref"): void {
  if (!/^[0-9a-f]{40}$/i.test(value)) throw new Error(`Invalid ${fieldName}`)
}

function githubHeaders(githubToken: string) {
  const token = githubToken.replace(/[^\x20-\x7e]/g, "").trim()
  if (!token) throw new Error("Unauthorized")
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  }
}

async function resolveTokenUserId(ctx: ActionCtx, githubToken: string): Promise<string> {
  const response = await fetch("https://api.github.com/user", { headers: githubHeaders(githubToken) })
  if (!response.ok) throw new Error("Unauthorized")

  const githubUser = (await response.json()) as { id?: number | string }
  if (githubUser.id === undefined || githubUser.id === null) throw new Error("Unauthorized")

  const account = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "account",
    where: [
      { field: "providerId", value: "github" },
      { field: "accountId", value: String(githubUser.id) },
    ],
  })) as { userId?: string | null } | null

  if (!account?.userId) throw new Error("Unauthorized")
  return account.userId
}

export async function authorizeGitHubProjectActor(
  ctx: ActionCtx,
  args: { projectId: Id<"projects">; githubToken: string; readRef: string },
): Promise<AuthorizedGitHubActionProject> {
  assertGitHubCommitSha(args.readRef)
  const tokenUserId = await resolveTokenUserId(ctx, args.githubToken)
  const authUser = await authComponent.safeGetAuthUser(ctx)
  if (authUser?._id && (authUser._id as string) !== tokenUserId) {
    throw new Error("Unauthorized")
  }

  const actorUserId = (authUser?._id as string | undefined) ?? tokenUserId
  const access = await ctx.runQuery(internal.projects.getGitHubActionProjectAccess, {
    projectId: args.projectId,
    userId: actorUserId,
  })
  if (!access || !roleAtLeast(access.role as Role, "editor")) throw new Error("Unauthorized")

  return {
    actorUserId,
    project: access.project,
    role: access.role as Role,
  }
}

export async function verifyGitHubProjectReadAccess(
  project: Doc<"projects">,
  githubToken: string,
  readRef: string,
): Promise<void> {
  const repoResponse = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(project.repoOwner)}/${encodeURIComponent(project.repoName)}`,
    { headers: githubHeaders(githubToken) },
  )
  if (!repoResponse.ok) throw new Error("Unauthorized")

  const repo = (await repoResponse.json()) as { permissions?: { admin?: boolean; push?: boolean } }
  if (!repo.permissions?.admin && !repo.permissions?.push) throw new Error("Unauthorized")

  const compareResponse = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(project.repoOwner)}/${encodeURIComponent(project.repoName)}/compare/${encodeURIComponent(readRef)}...${encodeURIComponent(project.branch)}`,
    { headers: githubHeaders(githubToken) },
  )
  if (!compareResponse.ok) throw new Error("Unauthorized read ref")
  const comparison = (await compareResponse.json()) as { status?: string }
  if (comparison.status !== "ahead" && comparison.status !== "identical") {
    throw new Error("Unauthorized read ref")
  }
}

import { ConvexHttpClient } from "convex/browser"
import { api } from "@/convex/_generated/api"
import { fetchAuthQuery, getPatAuthUserId } from "@/lib/auth-server"
import { mintServerQueryToken } from "@/lib/project-access-token"

export async function resolveActingUserId(githubToken: string): Promise<string | null> {
  const authUser = fetchAuthQuery ? await fetchAuthQuery(api.auth.getCurrentUser).catch(() => null) : null
  if (authUser?._id) {
    return authUser._id as string
  }

  return getPatAuthUserId(githubToken)
}

export async function createServerQueryContext() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? ""

  return {
    convex: new ConvexHttpClient(convexUrl),
    serverQueryToken: await mintServerQueryToken(),
  }
}

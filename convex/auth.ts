import { createClient, type GenericCtx } from "@convex-dev/better-auth"
import { convex } from "@convex-dev/better-auth/plugins"
import { betterAuth } from "better-auth/minimal"
import { components } from "./_generated/api"
import type { DataModel } from "./_generated/dataModel"
import { query } from "./_generated/server"
import authConfig from "./auth.config"

// SITE_URL must be the app URL (not Convex site URL) so that OAuth
// callbacks route through the Next.js proxy at /api/auth/[...all].
// This ensures cookies are set on the app domain.
const siteUrl = process.env.SITE_URL!

// The component client has methods needed for integrating Convex with Better Auth
export const authComponent = createClient<DataModel>(components.betterAuth)

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        scope: ["repo", "user"],
      },
    },
    plugins: [convex({ authConfig })],
  })
}

// Query for getting the current authenticated user (returns null when unauthenticated)
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.safeGetAuthUser(ctx)
  },
})

// Query for getting the GitHub access token from the auth component's accounts table
export const getGitHubAccessToken = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx)
    if (!user) return null

    const account = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "account",
      where: [
        { field: "userId", value: user._id },
        { field: "providerId", value: "github" },
      ],
    })) as { accessToken?: string | null } | null

    return account?.accessToken ?? null
  },
})

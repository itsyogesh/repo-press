import { createClient, type GenericCtx } from "@convex-dev/better-auth"
import { convex } from "@convex-dev/better-auth/plugins"
import { betterAuth } from "better-auth/minimal"
import { v } from "convex/values"
import { resolveAuthOrigin } from "../lib/auth-origin"
import { verifyGitHubAccountLookupToken, verifyGitHubIdentityBootstrapToken } from "../lib/project-access-token"
import { components } from "./_generated/api"
import type { DataModel } from "./_generated/dataModel"
import { mutation, query } from "./_generated/server"
import authConfig from "./auth.config"

const STATIC_REGISTRATION_ORIGIN = "https://static-auth.repopress.invalid"

function resolveAuthOriginForContext(ctx: GenericCtx<DataModel>) {
  // @convex-dev/better-auth calls createAuth({}) once while registering route
  // metadata. Convex does the same during deploy analysis without exposing
  // deployment environment variables. That static instance only contributes
  // basePath; every request creates auth again with a real Convex context.
  const isStaticRouteRegistration = Reflect.ownKeys(ctx as object).length === 0
  const configuredOrigin =
    isStaticRouteRegistration && !process.env.SITE_URL ? STATIC_REGISTRATION_ORIGIN : process.env.SITE_URL
  return resolveAuthOrigin(configuredOrigin)
}

// The component client has methods needed for integrating Convex with Better Auth
export const authComponent = createClient<DataModel>(components.betterAuth)

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  // SITE_URL must be the app URL (not the Convex site URL) so callbacks
  // traverse the Next.js proxy and cookies remain on the application origin.
  const { githubCallbackURL, siteUrl, trustedOrigins } = resolveAuthOriginForContext(ctx)

  return betterAuth({
    baseURL: siteUrl,
    trustedOrigins,
    database: authComponent.adapter(ctx),
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        redirectURI: githubCallbackURL,
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

export const resolveUserIdByGitHubAccount = query({
  args: {
    githubAccountId: v.string(),
    lookupToken: v.string(),
  },
  handler: async (ctx, args) => {
    const isValidLookup = await verifyGitHubAccountLookupToken(args.lookupToken, args.githubAccountId)
    if (!isValidLookup) {
      return null
    }

    const account = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "account",
      where: [
        { field: "providerId", value: "github" },
        { field: "accountId", value: args.githubAccountId },
      ],
    })) as { userId?: string | null } | null

    return account?.userId ?? null
  },
})

/**
 * Creates the Better Auth identity needed by PAT-only users on a fresh
 * deployment. The signed token proves that the Next.js server verified the
 * GitHub profile. No GitHub access token crosses this boundary or is persisted.
 */
export const resolveOrCreatePatUser = mutation({
  args: {
    bootstrapToken: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyGitHubIdentityBootstrapToken(args.bootstrapToken)
    if (!identity) return null

    const existingAccount = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "account",
      where: [
        { field: "providerId", value: "github" },
        { field: "accountId", value: identity.githubAccountId },
      ],
    })) as { userId?: string | null } | null
    if (existingAccount?.userId) return existingAccount.userId

    const now = Date.now()
    const user = (await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "user",
        data: {
          name: identity.name ?? identity.githubUsername,
          email: `github-${identity.githubAccountId}@pat.repopress.invalid`,
          emailVerified: false,
          image: identity.image,
          username: identity.githubUsername,
          displayUsername: identity.githubUsername,
          createdAt: now,
          updatedAt: now,
        },
      },
    })) as { _id: string }

    await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "account",
        data: {
          accountId: identity.githubAccountId,
          providerId: "github",
          userId: user._id,
          createdAt: now,
          updatedAt: now,
        },
      },
    })

    return user._id
  },
})

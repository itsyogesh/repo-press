import { beforeEach, describe, expect, it } from "vitest"
import { resolveOrCreatePatUser } from "@/convex/auth"
import { mintGitHubIdentityBootstrapToken } from "../project-access-token"

const identity = {
  githubAccountId: "12345",
  githubUsername: "octocat",
  name: "The Octocat",
  image: "https://avatars.githubusercontent.com/u/12345",
}

describe("PAT identity bootstrap", () => {
  beforeEach(() => {
    process.env.REPOPRESS_CAPABILITY_SECRET = "test-capability-secret-at-least-32"
  })

  it("returns the existing Better Auth user without writing", async () => {
    const runQuery = async () => ({ userId: "user_existing" })
    const runMutation = async () => {
      throw new Error("unexpected write")
    }

    const result = await (resolveOrCreatePatUser as any)._handler(
      { runQuery, runMutation },
      { bootstrapToken: await mintGitHubIdentityBootstrapToken(identity) },
    )

    expect(result).toBe("user_existing")
  })

  it("atomically creates a Better Auth user and GitHub account without persisting the PAT", async () => {
    const queries: unknown[] = []
    const mutations: any[] = []
    const runQuery = async (_reference: unknown, args: unknown) => {
      queries.push(args)
      return null
    }
    const runMutation = async (_reference: unknown, args: any) => {
      mutations.push(args)
      if (args.input.model === "user") {
        return { _id: "user_created", ...args.input.data }
      }
      return { _id: "account_created", ...args.input.data }
    }

    const result = await (resolveOrCreatePatUser as any)._handler(
      { runQuery, runMutation },
      { bootstrapToken: await mintGitHubIdentityBootstrapToken(identity) },
    )

    expect(result).toBe("user_created")
    expect(queries).toHaveLength(1)
    expect(mutations).toHaveLength(2)
    expect(mutations[0]).toMatchObject({
      input: {
        model: "user",
        data: {
          name: "The Octocat",
          emailVerified: false,
          image: identity.image,
          username: "octocat",
        },
      },
    })
    expect(mutations[1]).toMatchObject({
      input: {
        model: "account",
        data: {
          accountId: "12345",
          providerId: "github",
          userId: "user_created",
        },
      },
    })
    expect(JSON.stringify(mutations)).not.toContain("accessToken")
  })

  it("rejects an invalid bootstrap token before reading or writing", async () => {
    let called = false
    const ctx = {
      runQuery: async () => {
        called = true
      },
      runMutation: async () => {
        called = true
      },
    }

    const result = await (resolveOrCreatePatUser as any)._handler(ctx, { bootstrapToken: "invalid" })

    expect(result).toBeNull()
    expect(called).toBe(false)
  })
})

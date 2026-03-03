import { describe, expect, it } from "vitest"
import {
  buildRequestScopeId,
  createGitHubRequestController,
  isGitHubRateLimitError,
} from "@/lib/repopress/github-request-control"

describe("github request control", () => {
  it("deduplicates concurrent requests for the same key", async () => {
    const controller = createGitHubRequestController({
      maxRequestsPerWindow: 10,
      windowMs: 100,
      maxRetries: 0,
      baseDelayMs: 1,
    })

    let callCount = 0
    const request = async () => {
      callCount += 1
      await new Promise((resolve) => setTimeout(resolve, 5))
      return "ok"
    }

    const [a, b] = await Promise.all([
      controller.execute({ key: "same", request }),
      controller.execute({ key: "same", request }),
    ])

    expect(callCount).toBe(1)
    expect(a.value).toBe("ok")
    expect(b.value).toBe("ok")
  })

  it("retries 429 responses with exponential backoff", async () => {
    const controller = createGitHubRequestController({
      maxRequestsPerWindow: 10,
      windowMs: 20,
      maxRetries: 3,
      baseDelayMs: 1,
    })

    let attempts = 0
    const result = await controller.execute({
      key: "retry-success",
      request: async () => {
        attempts += 1
        if (attempts < 3) {
          throw { status: 429 }
        }
        return "success"
      },
    })

    expect(result.value).toBe("success")
    expect(result.rateLimited).toBe(true)
    expect(result.retryCount).toBe(2)
  })

  it("queues requests when window limit is reached", async () => {
    const controller = createGitHubRequestController({
      maxRequestsPerWindow: 1,
      windowMs: 30,
      maxRetries: 0,
      baseDelayMs: 1,
    })

    const timestamps: number[] = []
    const request = async () => {
      timestamps.push(Date.now())
      return "queued"
    }

    await Promise.all([controller.execute({ key: "a", request }), controller.execute({ key: "b", request })])

    expect(timestamps.length).toBe(2)
    expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(20)
  })

  it("throws after max retries are exhausted", async () => {
    const controller = createGitHubRequestController({
      maxRequestsPerWindow: 10,
      windowMs: 20,
      maxRetries: 1,
      baseDelayMs: 1,
    })

    let attempts = 0
    await expect(
      controller.execute({
        key: "retry-fail",
        request: async () => {
          attempts += 1
          throw { status: 429, message: "rate limited" }
        },
      }),
    ).rejects.toMatchObject({ status: 429 })

    expect(attempts).toBe(2)
  })

  it("detects GitHub 403/429 as rate-limit errors", () => {
    expect(isGitHubRateLimitError({ status: 403 })).toBe(true)
    expect(isGitHubRateLimitError({ response: { status: 429 } })).toBe(true)
    expect(isGitHubRateLimitError({ status: 500 })).toBe(false)
    expect(isGitHubRateLimitError(new Error("no status"))).toBe(false)
  })

  it("builds stable request scope IDs", () => {
    expect(buildRequestScopeId("token-a")).toBe(buildRequestScopeId("token-a"))
    expect(buildRequestScopeId("token-a")).not.toBe(buildRequestScopeId("token-b"))
  })
})

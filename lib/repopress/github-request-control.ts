type ExecuteRequestInput<T> = {
  key: string
  request: () => Promise<T>
}

type ExecuteRequestResult<T> = {
  value: T
  rateLimited: boolean
  retryCount: number
}

type RequestControlOptions = {
  maxRequestsPerWindow?: number
  windowMs?: number
  maxRetries?: number
  baseDelayMs?: number
}

const DEFAULT_MAX_REQUESTS_PER_WINDOW = 8
const DEFAULT_WINDOW_MS = 1000
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_BASE_DELAY_MS = 250

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Fix #6: Only treat HTTP 429 and actual rate-limit 403s as rate-limit errors.
 * GitHub returns 403 for many non-rate-limit reasons (access denied, SAML enforcement,
 * abuse detection, etc.). We now check for rate-limit-specific signals before retrying.
 */
export function isGitHubRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false

  const status = (error as { status?: number }).status ?? (error as { response?: { status?: number } }).response?.status

  // 429 is unambiguously a rate limit
  if (status === 429) return true

  // For 403, check for rate-limit-specific signals
  if (status === 403) {
    // Check response headers for rate limit exhaustion
    const headers =
      (error as { response?: { headers?: Record<string, string> } }).response?.headers ??
      (error as { headers?: Record<string, string> }).headers
    if (headers) {
      const remaining = headers["x-ratelimit-remaining"]
      if (remaining === "0") return true
      const retryAfter = headers["retry-after"]
      if (retryAfter) return true
    }

    // Check error message for rate limit keywords
    const message =
      (error as { message?: string }).message ??
      (error as { response?: { data?: { message?: string } } }).response?.data?.message
    if (typeof message === "string") {
      const lower = message.toLowerCase()
      if (lower.includes("rate limit") || lower.includes("abuse detection")) return true
    }
  }

  return false
}

export function buildRequestScopeId(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  return (hash >>> 0).toString(36)
}

export function createGitHubRequestController(options: RequestControlOptions = {}) {
  const maxRequestsPerWindow = options.maxRequestsPerWindow ?? DEFAULT_MAX_REQUESTS_PER_WINDOW
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS

  const inflight = new Map<string, Promise<ExecuteRequestResult<unknown>>>()
  const requestTimestamps: number[] = []

  async function waitForWindowSlot() {
    while (true) {
      const now = Date.now()
      while (requestTimestamps.length > 0 && now - requestTimestamps[0] >= windowMs) {
        requestTimestamps.shift()
      }

      if (requestTimestamps.length < maxRequestsPerWindow) {
        requestTimestamps.push(now)
        return
      }

      const waitMs = Math.max(1, windowMs - (now - requestTimestamps[0]))
      await sleep(waitMs)
    }
  }

  async function runWithRetry<T>(request: () => Promise<T>): Promise<ExecuteRequestResult<T>> {
    let rateLimited = false

    for (let attempt = 0; ; attempt += 1) {
      try {
        const value = await request()
        return {
          value,
          rateLimited,
          retryCount: attempt,
        }
      } catch (error) {
        if (!isGitHubRateLimitError(error) || attempt >= maxRetries) {
          throw error
        }

        rateLimited = true
        const delayMs = baseDelayMs * 2 ** attempt
        await sleep(delayMs)
        await waitForWindowSlot()
      }
    }
  }

  async function execute<T>(input: ExecuteRequestInput<T>): Promise<ExecuteRequestResult<T>> {
    const existing = inflight.get(input.key)
    if (existing) {
      return existing as Promise<ExecuteRequestResult<T>>
    }

    const promise = (async () => {
      await waitForWindowSlot()
      return runWithRetry(input.request)
    })().finally(() => {
      inflight.delete(input.key)
    })

    inflight.set(input.key, promise as Promise<ExecuteRequestResult<unknown>>)
    return promise
  }

  return {
    execute,
  }
}

const defaultGitHubRequestController = createGitHubRequestController()

export async function executeGitHubRequest<T>(input: ExecuteRequestInput<T>): Promise<ExecuteRequestResult<T>> {
  return defaultGitHubRequestController.execute(input)
}

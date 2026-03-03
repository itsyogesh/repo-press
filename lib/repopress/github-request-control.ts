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

export function isGitHubRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const status = (error as { status?: number }).status ?? (error as { response?: { status?: number } }).response?.status
  return status === 403 || status === 429
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

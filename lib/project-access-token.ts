const encoder = new TextEncoder()

type Role = "owner" | "editor" | "viewer"

type ProjectAccessTokenPayload = {
  projectId: string
  userId: string
  repoOwner: string
  repoName: string
  branch: string
  role?: Role // Added for collaborative access; defaults to "owner" for backward compat
  exp: number
}

type GitHubAccountLookupTokenPayload = {
  githubAccountId: string
  exp: number
}

function getSecret() {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required for project access tokens")
  }
  return secret
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

async function signValue(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value))
  return bytesToHex(new Uint8Array(signature))
}

/**
 * Timing-safe HMAC verification using the double-HMAC pattern.
 *
 * We re-sign both the expected and provided HMACs with a fresh random key,
 * then compare the results. Even if `===` on the final hex strings leaks
 * timing information, an attacker cannot exploit it because the HMAC output
 * changes completely with each verification (different random key every time).
 *
 * This avoids node:crypto (unavailable in Convex's default V8 runtime) and
 * doesn't rely on crypto.subtle.verify() being constant-time (the W3C spec
 * doesn't explicitly mandate it, though implementations typically are).
 *
 * Reference: https://paragonie.com/blog/2015/11/preventing-timing-attacks-on-string-comparison-with-double-hmac-strategy
 */
async function verifyValue(value: string, signatureHex: string) {
  const expected = await signValue(value)
  if (expected.length !== signatureHex.length) return false

  // Re-HMAC both values with a random ephemeral key
  const ephemeralKey = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const [a, b] = await Promise.all([
    crypto.subtle.sign("HMAC", ephemeralKey, encoder.encode(expected)),
    crypto.subtle.sign("HMAC", ephemeralKey, encoder.encode(signatureHex)),
  ])

  // Compare the re-HMACed bytes — timing leaks here are unexploitable
  const viewA = new Uint8Array(a)
  const viewB = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < viewA.length; i++) {
    diff |= viewA[i] ^ viewB[i]
  }
  return diff === 0
}

export async function mintProjectAccessToken(payload: Omit<ProjectAccessTokenPayload, "exp">, ttlSeconds = 60 * 30) {
  const body: ProjectAccessTokenPayload = {
    ...payload,
    exp: Date.now() + ttlSeconds * 1000,
  }
  const serialized = JSON.stringify(body)
  const signature = await signValue(serialized)
  return `${encodeURIComponent(serialized)}.${signature}`
}

export async function verifyProjectAccessToken(token: string | undefined | null) {
  if (!token) return null

  const separatorIndex = token.lastIndexOf(".")
  if (separatorIndex <= 0) return null

  const serialized = decodeURIComponent(token.slice(0, separatorIndex))
  const signature = token.slice(separatorIndex + 1)
  if (!(await verifyValue(serialized, signature))) {
    return null
  }

  let payload: ProjectAccessTokenPayload
  try {
    payload = JSON.parse(serialized) as ProjectAccessTokenPayload
  } catch {
    return null
  }
  if (!payload?.projectId || !payload?.userId || payload.exp <= Date.now()) {
    return null
  }

  // Backward compat: old tokens without role default to "owner"
  return { ...payload, role: payload.role ?? ("owner" as Role) }
}

/**
 * Lightweight server-to-Convex query token. Proves the caller is the Next.js
 * server (has access to BETTER_AUTH_SECRET) without requiring a project or user.
 * Used by route handlers and server components that need to read project data
 * before minting a full projectAccessToken.
 */
type ServerQueryTokenPayload = {
  type: "server-query"
  ts: number
}

const SERVER_QUERY_TOKEN_TTL_MS = 60_000 // 60 seconds

export async function mintServerQueryToken() {
  const payload: ServerQueryTokenPayload = {
    type: "server-query",
    ts: Date.now(),
  }
  const serialized = JSON.stringify(payload)
  const signature = await signValue(serialized)
  return `${encodeURIComponent(serialized)}.${signature}`
}

export async function verifyServerQueryToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false

  const separatorIndex = token.lastIndexOf(".")
  if (separatorIndex <= 0) return false

  const serialized = decodeURIComponent(token.slice(0, separatorIndex))
  const signature = token.slice(separatorIndex + 1)
  if (!(await verifyValue(serialized, signature))) return false

  let payload: ServerQueryTokenPayload
  try {
    payload = JSON.parse(serialized)
  } catch {
    return false
  }

  return payload.type === "server-query" && Date.now() - payload.ts < SERVER_QUERY_TOKEN_TTL_MS
}

export async function mintGitHubAccountLookupToken(githubAccountId: string, ttlSeconds = 60) {
  const body: GitHubAccountLookupTokenPayload = {
    githubAccountId,
    exp: Date.now() + ttlSeconds * 1000,
  }
  const serialized = JSON.stringify(body)
  const signature = await signValue(serialized)
  return `${encodeURIComponent(serialized)}.${signature}`
}

export async function verifyGitHubAccountLookupToken(token: string | undefined | null, githubAccountId: string) {
  if (!token) return false

  const separatorIndex = token.lastIndexOf(".")
  if (separatorIndex <= 0) return false

  const serialized = decodeURIComponent(token.slice(0, separatorIndex))
  const signature = token.slice(separatorIndex + 1)
  if (!(await verifyValue(serialized, signature))) {
    return false
  }

  let payload: GitHubAccountLookupTokenPayload
  try {
    payload = JSON.parse(serialized) as GitHubAccountLookupTokenPayload
  } catch {
    return false
  }
  return payload.githubAccountId === githubAccountId && payload.exp > Date.now()
}

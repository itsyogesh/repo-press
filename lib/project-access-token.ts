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
 * Constant-time HMAC verification.
 *
 * Recomputes the expected HMAC and compares it against the provided signature
 * using XOR-based constant-time comparison. This is safe because we're
 * comparing two hex-encoded HMAC outputs — even a timing leak would only
 * reveal the HMAC, not the secret key needed to forge tokens.
 *
 * Avoids crypto.subtle.generateKey() (requires randomness, forbidden in
 * Convex queries) and node:crypto (unavailable in Convex's V8 runtime).
 */
async function verifyValue(value: string, signatureHex: string) {
  const expected = await signValue(value)
  if (expected.length !== signatureHex.length) return false

  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signatureHex.charCodeAt(i)
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

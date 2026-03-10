const encoder = new TextEncoder()

type ProjectAccessTokenPayload = {
  projectId: string
  userId: string
  repoOwner: string
  repoName: string
  branch: string
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

  return payload
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

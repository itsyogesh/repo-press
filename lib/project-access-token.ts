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

async function verifyValue(value: string, signature: string) {
  const expected = await signValue(value)
  return expected === signature
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

  const payload = JSON.parse(serialized) as ProjectAccessTokenPayload
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

  const payload = JSON.parse(serialized) as GitHubAccountLookupTokenPayload
  return payload.githubAccountId === githubAccountId && payload.exp > Date.now()
}

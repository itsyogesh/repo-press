import { createHash } from "node:crypto"

/**
 * Deterministic digest of a publish attempt's full intent: the lane, the
 * exact Git head it was planned against, and every operation's identity and
 * content hash. Two publish requests produce the same digest if and only if
 * they would commit the same changes onto the same head of the same branch.
 *
 * The digest is embedded in the publish commit message
 * (`RepoPress-Publish-Attempt: <digest>`), so a retry can prove whether a
 * previous attempt's commit landed without re-committing.
 */

export const PUBLISH_ATTEMPT_TRAILER = "RepoPress-Publish-Attempt"

export type PublishOperationDescriptor =
  | { path: string; action: "delete" }
  | { path: string; action: "create" | "update"; expectedBlobSha: string }

export type PublishOperationInput = {
  path: string
  action: "create" | "update" | "delete"
  content?: string
  contentEncoding?: "utf-8" | "base64"
  blobSha?: string
}

export type PublishPlan = {
  branchName: string
  expectedHeadSha: string
  operationDescriptors: PublishOperationDescriptor[]
  opIds: string[]
  mediaOpIds: string[]
  deleteAssociations: Array<{ opId: string; documentId: string; expectedUpdatedAt: number }>
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

const GIT_BLOB_SHA = /^[0-9a-f]{40}$/u

function assertCanonicalRepoPath(path: string): void {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    Buffer.byteLength(path, "utf8") > 4_096 ||
    path !== path.normalize("NFC") ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new TypeError("Publish operation path must be a canonical repository path")
  }
}

function decodeOperationBytes(operation: PublishOperationInput): Buffer {
  if (typeof operation.content !== "string") {
    throw new TypeError("Publish write operation requires content or a blob SHA")
  }
  if (operation.contentEncoding !== "base64") return Buffer.from(operation.content, "utf8")
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(operation.content)) {
    throw new TypeError("Publish operation contains malformed base64")
  }
  const bytes = Buffer.from(operation.content, "base64")
  if (bytes.toString("base64") !== operation.content) {
    throw new TypeError("Publish operation contains non-canonical base64")
  }
  return bytes
}

export function gitBlobSha(bytes: Uint8Array): string {
  const body = Buffer.from(bytes)
  return createHash("sha1")
    .update(Buffer.from(`blob ${body.byteLength}\0`, "utf8"))
    .update(body)
    .digest("hex")
}

export function validatePublishOperationDescriptors(
  descriptors: readonly PublishOperationDescriptor[],
): PublishOperationDescriptor[] {
  if (!Array.isArray(descriptors) || descriptors.length === 0) {
    throw new TypeError("Publish operation descriptors must be a non-empty array")
  }
  const paths = new Set<string>()
  return descriptors.map((descriptor) => {
    if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) {
      throw new TypeError("Publish operation descriptor must be an object")
    }
    assertCanonicalRepoPath(descriptor.path)
    if (paths.has(descriptor.path)) throw new TypeError(`Duplicate publish operation path ${descriptor.path}`)
    paths.add(descriptor.path)
    if (descriptor.action === "delete") {
      if (Object.hasOwn(descriptor, "expectedBlobSha")) {
        throw new TypeError("Delete publish descriptor must not contain a blob SHA")
      }
      return { path: descriptor.path, action: "delete" }
    }
    if (descriptor.action !== "create" && descriptor.action !== "update") {
      throw new TypeError("Invalid publish descriptor action")
    }
    if (!GIT_BLOB_SHA.test(descriptor.expectedBlobSha)) {
      throw new TypeError("Publish descriptor blob SHA must be a 40-hex Git blob SHA")
    }
    return { path: descriptor.path, action: descriptor.action, expectedBlobSha: descriptor.expectedBlobSha }
  })
}

/** Build immutable recovery descriptors from the exact bytes sent to Git. */
export function buildPublishOperationDescriptors(
  operations: readonly PublishOperationInput[],
): PublishOperationDescriptor[] {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new TypeError("Publish operations must be a non-empty array")
  }
  const paths = new Set<string>()
  const descriptors: PublishOperationDescriptor[] = operations.map((operation): PublishOperationDescriptor => {
    assertCanonicalRepoPath(operation.path)
    if (paths.has(operation.path)) throw new TypeError(`Duplicate publish operation path ${operation.path}`)
    paths.add(operation.path)
    if (operation.action === "delete") {
      if (operation.content !== undefined || operation.blobSha !== undefined) {
        throw new TypeError("Delete publish operation must not carry bytes or a blob SHA")
      }
      return { path: operation.path, action: "delete" }
    }
    if (operation.action !== "create" && operation.action !== "update") {
      throw new TypeError("Invalid publish operation action")
    }
    if (operation.blobSha !== undefined) {
      if (!GIT_BLOB_SHA.test(operation.blobSha)) {
        throw new TypeError("Publish operation blob SHA must be a 40-hex Git blob SHA")
      }
      return { path: operation.path, action: operation.action, expectedBlobSha: operation.blobSha }
    }
    return {
      path: operation.path,
      action: operation.action,
      expectedBlobSha: gitBlobSha(decodeOperationBytes(operation)),
    }
  })
  return validatePublishOperationDescriptors(descriptors)
}

export function computePublishPlanDigest(plan: PublishPlan): string {
  const operationDescriptors = validatePublishOperationDescriptors(plan.operationDescriptors)
  const canonical = {
    branchName: plan.branchName,
    expectedHeadSha: plan.expectedHeadSha,
    operationDescriptors: operationDescriptors
      .map((operation) => ({ ...operation }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.action.localeCompare(b.action))),
    opIds: [...plan.opIds].sort(),
    mediaOpIds: [...plan.mediaOpIds].sort(),
    deleteAssociations: [...plan.deleteAssociations]
      .map((association) => ({
        opId: association.opId,
        documentId: association.documentId,
        expectedUpdatedAt: association.expectedUpdatedAt,
      }))
      .sort((a, b) => (a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0)),
  }
  return sha256Hex(JSON.stringify(canonical))
}

export function formatPublishAttemptTrailer(planDigest: string): string {
  return `${PUBLISH_ATTEMPT_TRAILER}: ${planDigest}`
}

/**
 * True only when the message carries the attempt trailer as an EXACT line
 * (`RepoPress-Publish-Attempt: <digest>` with nothing else on the line). A
 * digest substring embedded in prose or another trailer does not count -
 * recovery must not adopt commits that merely mention the digest.
 */
export function commitMessageCarriesAttempt(message: string, planDigest: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(planDigest)) return false
  const expected = formatPublishAttemptTrailer(planDigest)
  return message.split(/\r?\n/).some((line) => line === expected)
}

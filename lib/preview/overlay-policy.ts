import { type FileOverlayOperation, fileOverlayOperationSchema } from "./contracts"
import { assertContentPath } from "./path-policy"

export const MAX_OVERLAY_OPERATIONS = 256
export const MAX_OVERLAY_CONTENT_BYTES = 4 * 1024 * 1024

export class OverlayPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OverlayPolicyError"
  }
}

export type ValidatedOverlayOperation = Readonly<FileOverlayOperation>

/**
 * Validate the serializable overlay contract before it reaches a filesystem.
 * The contract cannot represent symlinks, hardlinks, or archive entries;
 * filesystem materialization must reject those escape mechanisms separately.
 */
export function validateOverlayOperations(
  operations: readonly FileOverlayOperation[],
): readonly ValidatedOverlayOperation[] {
  if (!Array.isArray(operations)) {
    throw new OverlayPolicyError("invalid overlay operation list")
  }
  if (operations.length > MAX_OVERLAY_OPERATIONS) {
    throw new OverlayPolicyError(`too many overlay operations (maximum ${MAX_OVERLAY_OPERATIONS})`)
  }

  const paths = new Set<string>()
  let contentBytes = 0
  const validated = operations.map((candidate) => {
    const parsed = fileOverlayOperationSchema.safeParse(candidate)
    if (!parsed.success) {
      throw new OverlayPolicyError("invalid overlay operation")
    }

    const path = assertContentPath(parsed.data.path)
    if (paths.has(path)) {
      throw new OverlayPolicyError(`duplicate overlay path: ${path}`)
    }
    paths.add(path)

    if (parsed.data.operation === "write") {
      contentBytes += new TextEncoder().encode(parsed.data.content).byteLength
      if (contentBytes > MAX_OVERLAY_CONTENT_BYTES) {
        throw new OverlayPolicyError(`overlay content exceeds ${MAX_OVERLAY_CONTENT_BYTES} bytes`)
      }
      return Object.freeze({ ...parsed.data, path })
    }

    return Object.freeze({ ...parsed.data, path })
  })

  return Object.freeze(validated)
}

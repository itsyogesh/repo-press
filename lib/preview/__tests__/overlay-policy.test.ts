import { describe, expect, it } from "vitest"
import { overlayOpsOnTree } from "../../explorer-tree-overlay"
import type { FileOverlayOperation } from "../contracts"
import { MAX_OVERLAY_CONTENT_BYTES, MAX_OVERLAY_OPERATIONS, validateOverlayOperations } from "../overlay-policy"

describe("overlay operation policy", () => {
  it("returns normalized immutable copies", () => {
    const operations: FileOverlayOperation[] = [
      { operation: "write", path: "guides/start.mdx", content: "# Start" },
      { operation: "delete", path: "guides/old.mdx" },
    ]

    const validated = validateOverlayOperations(operations)

    expect(validated).toEqual(operations)
    expect(validated).not.toBe(operations)
    expect(validated[0]).not.toBe(operations[0])
    expect(Object.isFrozen(validated)).toBe(true)
    expect(Object.isFrozen(validated[0])).toBe(true)
  })

  it("rejects duplicate operations for the same canonical path", () => {
    expect(() =>
      validateOverlayOperations([
        { operation: "write", path: "guides/start.mdx", content: "one" },
        { operation: "delete", path: "guides/start.mdx" },
      ]),
    ).toThrow("duplicate overlay path")
  })

  it.each([
    { operation: "write", path: "../secret.mdx", content: "secret" },
    { operation: "delete", path: "/etc/passwd" },
    { operation: "delete", path: "guides\\old.mdx" },
  ])("rejects unsafe operation paths", (operation) => {
    expect(() => validateOverlayOperations([operation] as FileOverlayOperation[])).toThrowError(
      expect.objectContaining({ name: "PathPolicyError" }),
    )
  })

  it.each([
    { operation: "write", path: "guide.mdx" },
    { operation: "delete", path: "guide.mdx", content: "shape confusion" },
    { operation: "move", path: "guide.mdx", content: "shape confusion" },
    { operation: "write", path: "guide.mdx", content: "x", symlink: "../../secret" },
    { operation: "write", path: "guide.mdx", content: "x", hardlink: "../../secret" },
    { operation: "write", path: "guide.mdx", content: "x", archivePath: "../../secret" },
  ])("rejects operation-shape confusion and unsupported filesystem metadata", (operation) => {
    expect(() => validateOverlayOperations([operation] as unknown as FileOverlayOperation[])).toThrow(
      "invalid overlay operation",
    )
  })

  it("enforces the operation-count limit", () => {
    const operations = Array.from({ length: MAX_OVERLAY_OPERATIONS + 1 }, (_, index) => ({
      operation: "delete" as const,
      path: `guides/${index}.mdx`,
    }))

    expect(() => validateOverlayOperations(operations)).toThrow("too many overlay operations")
  })

  it("enforces the total UTF-8 content-byte limit", () => {
    const content = "x".repeat(MAX_OVERLAY_CONTENT_BYTES + 1)
    expect(() => validateOverlayOperations([{ operation: "write", path: "guide.mdx", content }])).toThrow(
      "overlay content exceeds",
    )
  })
})

describe("explorer tree overlay path boundary", () => {
  it("converts a content-relative operation exactly once for a nested root", () => {
    const result = overlayOpsOnTree(
      [],
      [{ opType: "create", filePath: "guides/start.mdx", status: "pending" }],
      "content/docs",
    )

    expect(result).toEqual([
      {
        name: "guides",
        path: "content/docs/guides",
        sha: "",
        type: "dir",
        isNew: true,
        children: [
          {
            name: "start.mdx",
            path: "content/docs/guides/start.mdx",
            sha: "",
            type: "file",
            isNew: true,
          },
        ],
      },
    ])
  })

  it("rejects unsafe explorer operations before modifying the tree", () => {
    expect(() =>
      overlayOpsOnTree([], [{ opType: "create", filePath: "../outside.mdx", status: "pending" }], "content"),
    ).toThrowError(expect.objectContaining({ name: "PathPolicyError" }))
  })
})

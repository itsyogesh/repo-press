import { describe, expect, it } from "vitest"
import { overlayOpsOnTree } from "../../explorer-tree-overlay"
import type { FileOverlayOperation } from "../contracts"
import {
  MAX_OVERLAY_CONTENT_BYTES,
  MAX_OVERLAY_OPERATIONS,
  MAX_OVERLAY_PATH_BYTES,
  MAX_OVERLAY_TOTAL_PATH_BYTES,
  validateOverlayOperations,
} from "../overlay-policy"

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

  it.each(["write", "delete"] as const)("enforces the per-path UTF-8 byte limit for %s operations", (operation) => {
    const path = `${"é".repeat(Math.ceil(MAX_OVERLAY_PATH_BYTES / 2))}.mdx`
    const candidate = operation === "write" ? { operation, path, content: "x" } : { operation, path }

    expect(() => validateOverlayOperations([candidate])).toThrow("overlay path exceeds")
  })

  it("enforces the cumulative path-byte limit across write and delete operations", () => {
    const bytesPerPath = MAX_OVERLAY_PATH_BYTES
    const operationCount = Math.floor(MAX_OVERLAY_TOTAL_PATH_BYTES / bytesPerPath) + 1
    const operations = Array.from({ length: operationCount }, (_, index): FileOverlayOperation => {
      const prefix = `${index}/`
      const path = `${prefix}${"x".repeat(bytesPerPath - prefix.length)}`
      return index % 2 === 0 ? { operation: "write", path, content: "" } : { operation: "delete", path }
    })

    expect(() => validateOverlayOperations(operations)).toThrow("overlay paths exceed")
  })
})

describe("explorer tree overlay path boundary", () => {
  it("converts a content-relative operation exactly once for a nested root", () => {
    const result = overlayOpsOnTree(
      [],
      [
        {
          opType: "create",
          filePath: "guides/start.mdx",
          status: "pending",
          pathRepresentation: "content_relative_v1",
        },
      ],
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
      overlayOpsOnTree(
        [],
        [
          {
            opType: "create",
            filePath: "../outside.mdx",
            status: "pending",
            pathRepresentation: "content_relative_v1",
          },
        ],
        "content",
      ),
    ).toThrowError(expect.objectContaining({ name: "PathPolicyError" }))
  })

  it("adapts an untagged legacy explorer operation exactly once", () => {
    const result = overlayOpsOnTree(
      [],
      [{ opType: "create", filePath: "content/docs/guides/legacy.mdx", status: "pending" }],
      "content/docs",
    )

    expect(result[0]?.children?.[0]).toEqual(
      expect.objectContaining({ path: "content/docs/guides/legacy.mdx", isNew: true }),
    )
  })
})

import { describe, expect, it } from "vitest"
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_VARIANTS,
  DOCUMENT_STATUSES,
  isPublishableDocumentStatus,
} from "../document-status"
import { getContentType } from "../media/content-type"
import { ROLE_VALUES, roleAtLeast } from "../roles"

describe("foundation contracts", () => {
  it("shares the expected role hierarchy", () => {
    expect(ROLE_VALUES).toEqual(["owner", "editor", "viewer"])
    expect(roleAtLeast("owner", "editor")).toBe(true)
    expect(roleAtLeast("editor", "viewer")).toBe(true)
    expect(roleAtLeast("viewer", "editor")).toBe(false)
  })

  it("resolves media content types from one shared mapping", () => {
    expect(getContentType("hero.png")).toBe("image/png")
    expect(getContentType("clip.webm")).toBe("video/webm")
    expect(getContentType("unknown.bin")).toBe("application/octet-stream")
  })

  it("shares document status labels, variants, and publishability rules", () => {
    expect(DOCUMENT_STATUSES).toEqual(["draft", "in_review", "approved", "published", "scheduled", "archived"])
    expect(DOCUMENT_STATUS_LABELS.approved).toBe("Approved")
    expect(DOCUMENT_STATUS_VARIANTS.archived).toBe("destructive")
    expect(isPublishableDocumentStatus("draft")).toBe(true)
    expect(isPublishableDocumentStatus("approved")).toBe(true)
    expect(isPublishableDocumentStatus("archived")).toBe(false)
  })
})

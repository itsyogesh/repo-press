export const DOCUMENT_STATUSES = ["draft", "in_review", "approved", "published", "scheduled", "archived"] as const

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]

export const TRANSITIONABLE_DOCUMENT_STATUSES = ["draft", "in_review", "approved", "scheduled", "archived"] as const

export type TransitionableDocumentStatus = (typeof TRANSITIONABLE_DOCUMENT_STATUSES)[number]

export type DocumentStatusBadgeVariant = "default" | "secondary" | "outline" | "destructive"

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: "Draft",
  in_review: "In Review",
  approved: "Approved",
  published: "Published",
  scheduled: "Scheduled",
  archived: "Archived",
}

export const DOCUMENT_STATUS_VARIANTS: Record<DocumentStatus, DocumentStatusBadgeVariant> = {
  draft: "secondary",
  in_review: "outline",
  approved: "outline",
  published: "default",
  scheduled: "secondary",
  archived: "destructive",
}

export const DOCUMENT_STATUS_CONFIG: Record<DocumentStatus, { label: string; variant: DocumentStatusBadgeVariant }> =
  Object.fromEntries(
    DOCUMENT_STATUSES.map((status) => [
      status,
      {
        label: DOCUMENT_STATUS_LABELS[status],
        variant: DOCUMENT_STATUS_VARIANTS[status],
      },
    ]),
  ) as Record<DocumentStatus, { label: string; variant: DocumentStatusBadgeVariant }>

export const PUBLISHABLE_DOCUMENT_STATUSES = ["draft", "approved"] as const

export const DOCUMENT_ALLOWED_TRANSITIONS: Record<DocumentStatus, TransitionableDocumentStatus[]> = {
  draft: ["in_review", "scheduled", "archived"],
  in_review: ["approved", "draft", "archived"],
  approved: ["draft", "archived"],
  published: ["draft", "archived"],
  scheduled: ["draft", "archived"],
  archived: ["draft"],
}

export function isPublishableDocumentStatus(status: string): status is (typeof PUBLISHABLE_DOCUMENT_STATUSES)[number] {
  return PUBLISHABLE_DOCUMENT_STATUSES.includes(status as (typeof PUBLISHABLE_DOCUMENT_STATUSES)[number])
}

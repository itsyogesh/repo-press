/**
 * Content-specific publish cleanliness.
 *
 * Only versioned provenance is authoritative. Timestamp-only provenance is
 * intentionally treated as a migration candidate: updatedAt also changes for
 * workflow transitions, so it cannot prove which bytes Git contains.
 */
export function isDocumentContentClean(document: {
  contentVersion?: number
  publishedProvenance?: { publishedContentVersion?: number; [key: string]: unknown }
  updatedAt?: number
  lastPublishedUpdatedAt?: number
}): boolean {
  const publishedContentVersion = document.publishedProvenance?.publishedContentVersion
  return publishedContentVersion !== undefined && publishedContentVersion === (document.contentVersion ?? 0)
}

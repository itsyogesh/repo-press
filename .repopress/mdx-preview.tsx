"use client"

import { DocsImage, Callout, DocsVideo } from "@/components/docs/doc-media"

export const adapter = {
  components: {
    DocsImage,
    Callout,
    DocsVideo,
  },
  scope: {
    // Shared constants for expressions
    DOCS_SETUP_MEDIA: {},
  },
  allowImports: {
    "@/components/docs/doc-media": { DocsImage, Callout, DocsVideo },
  }
}

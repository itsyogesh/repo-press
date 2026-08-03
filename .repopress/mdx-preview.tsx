"use client"

import { Callout, DocsImage, DocsVideo } from "@/apps/web/components/docs/doc-media"

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
    "@/apps/web/components/docs/doc-media": { DocsImage, Callout, DocsVideo },
  },
}

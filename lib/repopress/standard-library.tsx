"use client"

import { Info } from "lucide-react"
import React from "react"
import { cn } from "@/lib/utils"

export const DOCS_BLOB_BASE = "https://7azoq5njibf6vkft.public.blob.vercel-storage.com"

export const REAL_DOCS_SETUP_MEDIA: any = {
  cloudflare: {
    videoUrl: "https://youtu.be/WwCFLfigqpg?si=T90pqRb-zkW4fMuz",
    images: {
      "step-2-api-tokens-nav": `${DOCS_BLOB_BASE}/docs/setup/cloudflare/step-2-api-tokens-nav.webp`,
      "step-2-create-custom-token": `${DOCS_BLOB_BASE}/docs/setup/cloudflare/step-2-create-custom-token.webp`,
      "step-2-create-test-custom-token": `${DOCS_BLOB_BASE}/docs/setup/cloudflare/step-2-create-test-custom-token.webp`,
      "step-2-token-display": `${DOCS_BLOB_BASE}/docs/setup/cloudflare/step-2-token-display.webp`,
      "step-2-token-permissions": `${DOCS_BLOB_BASE}/docs/setup/cloudflare/step-2-token-permissions.webp`,
      "step-3-integration-form": `${DOCS_BLOB_BASE}/docs/setup/cloudflare/step-3-integration-form.webp`,
    },
  },
  gandi: {
    images: {
      "step-1-create-token": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-1-create-token.webp`,
      "step-1-pat-section": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-1-pat-section.webp`,
      "step-1-user-settings": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-1-user-settings.webp`,
      "step-2-token-form": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-2-token-form.webp`,
      "step-3-permissions": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-3-permissions.webp`,
      "step-4-create-token": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-4-create-token.webp`,
      "step-4-token-display": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-4-token-display.webp`,
      "step-5-integration-form": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-5-integration-form.webp`,
    },
  },
  godaddy: {
    videoUrl: "https://youtu.be/3WCzfVL-bRk?si=ncMNDQSc7RiedP1d",
    images: {
      "step-2-create-api-key": `${DOCS_BLOB_BASE}/docs/setup/godaddy/step-2-create-api-key.webp`,
      "step-3-environment-selection": `${DOCS_BLOB_BASE}/docs/setup/godaddy/step-3-environment-selection.webp`,
      "step-4-api-key-secret": `${DOCS_BLOB_BASE}/docs/setup/godaddy/step-4-api-key-secret.webp`,
      "step-6-integration-form": `${DOCS_BLOB_BASE}/docs/setup/godaddy/step-6-integration-form.webp`,
    },
  },
  namecheap: {
    videoUrl: "https://youtu.be/snbECrsUdp4?si=pAxyo0mEzTYBxmQR",
    images: {
      "step-1-api-access-nav": `${DOCS_BLOB_BASE}/docs/setup/namecheap/step-1-api-access-nav.webp`,
      "step-3-whitelist-ips": `${DOCS_BLOB_BASE}/docs/setup/namecheap/step-3-whitelist-ips.webp`,
      "step-5-integration-form": `${DOCS_BLOB_BASE}/docs/setup/namecheap/step-5-integration-form.webp`,
    },
  },
  namecom: {
    images: {
      "step-1-generate-token": `${DOCS_BLOB_BASE}/docs/setup/namecom/step-1-generate-token.webp`,
      "step-2-username-token": `${DOCS_BLOB_BASE}/docs/setup/namecom/step-2-username-token.webp`,
      "step-3-integration-form": `${DOCS_BLOB_BASE}/docs/setup/namecom/step-3-integration-form.webp`,
    },
  },
  porkbun: {
    videoUrl: "https://youtu.be/jLVBwxk4V6w?si=eZPfJwhKTiqwyTQI",
    images: {
      "step-1-api-access-nav": `${DOCS_BLOB_BASE}/docs/setup/porkbun/step-1-api-access-nav.webp`,
      "step-1-create-api-key": `${DOCS_BLOB_BASE}/docs/setup/porkbun/step-1-create-api-key.webp`,
      "step-1-api-credentials": `${DOCS_BLOB_BASE}/docs/setup/porkbun/step-1-api-credentials.webp`,
      "step-2-integration-form": `${DOCS_BLOB_BASE}/docs/setup/porkbun/step-2-integration-form.webp`,
    },
  },
  hostinger: {
    images: {
      "step-1-profile-nav": `${DOCS_BLOB_BASE}/docs/setup/hostinger/step-1-profile-nav.webp`,
      "step-2-api-access": `${DOCS_BLOB_BASE}/docs/setup/hostinger/step-2-api-access.webp`,
      "step-3-create-token": `${DOCS_BLOB_BASE}/docs/setup/hostinger/step-3-create-token.webp`,
    },
  },
}

/**
 * Standard built-in components for RepoPress.
 * These provide high-quality fallbacks for common documentation patterns.
 */
export const standardComponents: Record<string, React.ComponentType<any>> = {
  Callout: (props) => (
    <div className="my-4 flex gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4 text-sm text-blue-900 shadow-sm text-left font-sans">
      <div className="mt-0.5">
        <Info className="h-4 w-4 text-blue-600" />
      </div>
      <div className="flex-1">{props.children}</div>
    </div>
  ),
  Steps: (props) => (
    <div className="space-y-4 my-6 border-l-2 border-muted pl-6 text-left font-sans">{props.children}</div>
  ),
  Step: (props) => (
    <div className="relative text-left font-sans">
      <div className="absolute -left-[33px] top-0 size-4 rounded-full bg-background border-2 border-muted flex items-center justify-center text-[10px] font-bold" />
      {props.children}
    </div>
  ),
  Tabs: (props) => <div className="my-4 border rounded-md p-1 bg-muted/30 text-left font-sans">{props.children}</div>,
  Tab: (props) => (
    <div className="p-4 bg-background rounded border shadow-sm text-left font-sans">{props.children}</div>
  ),
  Badge: (props) => (
    <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 mx-1 font-sans">
      {props.children}
    </div>
  ),
  Button: (props) => (
    <button
      type="button"
      className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 px-3 mx-1 font-sans"
    >
      {props.children}
    </button>
  ),
  Card: (props) => (
    <div className="my-4 p-6 border rounded-xl bg-card shadow-sm text-left font-sans">{props.children}</div>
  ),
  FileTree: (props) => (
    <div className="my-4 p-4 border rounded-md bg-muted/20 font-mono text-xs text-left">{props.children}</div>
  ),
  Image: (props) => <img {...props} className="rounded-lg border shadow-sm max-w-full" alt={props.alt || ""} />,
  Video: (props) => <video {...props} className="rounded-lg border shadow-sm max-w-full" controls />,
  CopyIpsButton: (props) => (
    <button
      type="button"
      className="my-2 inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 gap-2 font-sans"
    >
      <Info className="h-3.5 w-3.5" />
      Copy IP Addresses
    </button>
  ),
  DocsImage: (props: any) => {
    const [isLoading, setIsLoading] = React.useState(true)
    // resolveAssetUrl is injected by the bridge/runtime
    const resolve = (props as any).resolveAssetUrl
    const src = props.src && resolve ? resolve(props.src) : props.src

    return (
      <div className="my-6 overflow-hidden rounded-xl border bg-muted/30 flex flex-col group relative text-left font-sans shadow-sm">
        {src ? (
          <div className="relative">
            <img
              src={src}
              alt={props.alt || ""}
              className={cn(
                "w-full h-auto block transition-opacity duration-300",
                isLoading ? "opacity-0" : "opacity-100",
              )}
              onLoad={() => setIsLoading(false)}
            />
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/20 animate-pulse">
                <Info className="h-6 w-6 text-muted-foreground/30" />
              </div>
            )}
          </div>
        ) : (
          <div className="aspect-video flex items-center justify-center">
            <div className="text-muted-foreground flex flex-col items-center gap-2">
              <Info className="h-8 w-8 opacity-20" />
              <span className="text-[10px] uppercase font-bold tracking-widest opacity-50">No Source</span>
            </div>
          </div>
        )}
        {props.caption && (
          <div className="p-3 bg-muted/20 border-t text-[11px] text-muted-foreground text-center italic">
            {props.caption}
          </div>
        )}
      </div>
    )
  },
  DocsVideo: (props: any) => {
    const resolve = (props as any).resolveAssetUrl
    let src = props.src && resolve ? resolve(props.src) : props.src

    if (src?.includes("youtu.be/")) {
      const id = src.split("youtu.be/")[1]?.split("?")[0]
      if (id) src = `https://www.youtube.com/embed/${id}`
    }

    return (
      <div className="my-6 overflow-hidden rounded-xl border bg-slate-950 aspect-video flex items-center justify-center relative text-left font-sans shadow-lg">
        {src ? (
          <iframe
            src={src}
            title={props.title || "Documentation Video"}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <div className="text-white/50 flex flex-col items-center gap-2">
            <div className="size-12 rounded-full border-2 border-white/20 flex items-center justify-center bg-white/5">
              <div className="size-0 border-t-[8px] border-t-transparent border-l-[12px] border-l-white/60 border-b-[8px] border-b-transparent ml-1" />
            </div>
            <span className="text-[10px] uppercase font-bold tracking-widest opacity-50">
              Video: {props.title || "No Source"}
            </span>
          </div>
        )}
      </div>
    )
  },
}

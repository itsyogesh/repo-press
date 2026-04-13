"use client"

import { LoaderCircle, PlayCircle } from "lucide-react"
import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import { studioDemoComposition } from "@/remotion/compositions/studio-demo-composition"

const VideoPreviewPlayer = dynamic(() => import("./video-preview-player").then((mod) => mod.VideoPreviewPlayer), {
  ssr: false,
  loading: () => <VideoPreviewPlaceholder state="loading" />,
})

export function VideoPreview() {
  const sectionRef = useRef<HTMLElement | null>(null)
  const [shouldRenderPlayer, setShouldRenderPlayer] = useState(false)

  useEffect(() => {
    if (shouldRenderPlayer) {
      return
    }

    if (typeof IntersectionObserver === "undefined") {
      setShouldRenderPlayer(true)
      return
    }

    const node = sectionRef.current
    if (!node) {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldRenderPlayer(true)
          observer.disconnect()
        }
      },
      { rootMargin: "240px 0px" },
    )

    observer.observe(node)

    return () => observer.disconnect()
  }, [shouldRenderPlayer])

  return (
    <section
      ref={sectionRef}
      id="product-video"
      data-slot="landing-video-preview"
      className="container mx-auto px-4 py-24"
    >
      <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
          Product demo
        </p>
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">See RepoPress in action</h2>
        <p className="max-w-[48rem] text-balance text-muted-foreground sm:text-lg sm:leading-7">
          See how one config file connects your repo, opens the browser studio, and creates a pull request - the
          complete flow in 20 seconds.
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-5xl overflow-hidden rounded-[10px] border border-border bg-card">
        {shouldRenderPlayer ? <VideoPreviewPlayer /> : <VideoPreviewPlaceholder state="idle" />}
      </div>
    </section>
  )
}

function VideoPreviewPlaceholder({ state }: { state: "idle" | "loading" }) {
  const Icon = state === "loading" ? LoaderCircle : PlayCircle
  const label = state === "loading" ? "Loading studio demo..." : "Studio demo loads when this section enters view."

  return (
    <div
      data-video-preview-placeholder={state}
      className="flex w-full items-center justify-center bg-muted/40"
      style={{ aspectRatio: `${studioDemoComposition.width} / ${studioDemoComposition.height}` }}
    >
      <div className="flex max-w-md flex-col items-center gap-4 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background">
          <Icon className={state === "loading" ? "h-5 w-5 animate-spin text-foreground" : "h-5 w-5 text-foreground"} />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-sm text-muted-foreground">
            The placeholder keeps the 16:9 frame stable so the landing page does not jump as the preview mounts.
          </p>
        </div>
      </div>
    </div>
  )
}

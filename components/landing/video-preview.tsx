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
    // Dark "theater" — the one drenched moment on the page. Warm near-black
    // surface + a committed Signal-Slate glow, so the product demo reads as the
    // centerpiece and the scroll gets a real change of world.
    <section
      ref={sectionRef}
      id="product-video"
      data-slot="landing-video-preview"
      className="relative overflow-hidden bg-foreground px-6 py-28 text-background"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[38%] -z-0 h-[32rem] w-[50rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[140px]"
      />

      <div className="relative mx-auto flex max-w-[48ch] flex-col items-center gap-5 text-center">
        <span className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.22em] text-background/45">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          Live in twenty seconds
        </span>
        <h2 className="font-serif text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.04] tracking-[-0.022em] text-background">
          Watch the whole flow, start to published.
        </h2>
        <p className="text-balance text-background/60 sm:text-base sm:leading-7">
          One config file connects your repo, opens the browser studio, and ships a pull request — the complete
          RepoPress loop, in a single take.
        </p>
      </div>

      <div className="relative mx-auto mt-12 max-w-5xl overflow-hidden rounded-xl border border-background/10 bg-background/[0.04] shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)] ring-1 ring-inset ring-background/5">
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
      className="flex w-full items-center justify-center bg-background/[0.03]"
      style={{ aspectRatio: `${studioDemoComposition.width} / ${studioDemoComposition.height}` }}
    >
      <div className="flex max-w-md flex-col items-center gap-4 px-6 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-background/15 bg-background/5">
          <Icon className={state === "loading" ? "h-5 w-5 animate-spin text-background" : "h-5 w-5 text-background"} />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-background">{label}</p>
          <p className="text-sm text-background/55">
            The placeholder keeps the 16:9 frame stable so the landing page does not jump as the preview mounts.
          </p>
        </div>
      </div>
    </div>
  )
}

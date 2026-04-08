"use client"

import { Player } from "@remotion/player"
import { StudioDemo } from "@/remotion/compositions/StudioDemo"

export function VideoPreview() {
  return (
    <div className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-border shadow-2xl">
      <Player
        component={StudioDemo}
        durationInFrames={300}
        compositionWidth={1280}
        compositionHeight={720}
        fps={30}
        autoPlay
        loop
        style={{ width: "100%" }}
        controls={false}
      />
    </div>
  )
}

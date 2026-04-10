"use client"

import { Player } from "@remotion/player"
import { StudioDemo } from "@/remotion/compositions/StudioDemo"
import { studioDemoComposition } from "@/remotion/compositions/studio-demo-composition"

export function VideoPreviewPlayer() {
  return (
    <Player
      acknowledgeRemotionLicense
      autoPlay
      component={StudioDemo}
      compositionHeight={studioDemoComposition.height}
      compositionWidth={studioDemoComposition.width}
      controls={false}
      durationInFrames={studioDemoComposition.durationInFrames}
      fps={studioDemoComposition.fps}
      loop
      style={{ display: "block", width: "100%" }}
    />
  )
}

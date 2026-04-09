import { springTiming, TransitionSeries } from "@remotion/transitions"
import { fade } from "@remotion/transitions/fade"
import { slide } from "@remotion/transitions/slide"
import { wipe } from "@remotion/transitions/wipe"
import type React from "react"
import { AbsoluteFill, Audio, staticFile, useVideoConfig } from "remotion"
import { z } from "zod"
import { CTAScene } from "../components/scenes/CTAScene"
import { FrameworkScene } from "../components/scenes/FrameworkScene"
import { IntroScene } from "../components/scenes/IntroScene"
import { GitNativeFeature } from "./GitNativeFeature"
import { StudioDemo } from "./StudioDemo"
import { WorkflowFeature } from "./WorkflowFeature"

// ─── Zod schema ──────────────────────────────────────────────────────────────
export const launchVideoSchema = z.object({
  musicVolume: z.number().min(0).max(1).default(0.3),
  sfxVolume: z.number().min(0).max(1).default(0.7),
})

export type LaunchVideoProps = z.infer<typeof launchVideoSchema>

// ─── Scene durations ─────────────────────────────────────────────────────────
const SCENE_DURATIONS_S = {
  intro: 4,
  frameworks: 5,
  gitNative: 6,
  studio: 7,
  workflow: 6,
  cta: 5,
}
// 6 scenes, 5 transitions at ~0.83s each
// ~33s raw - 4.17s overlap = ~29s total. Placeholder — verify in Studio.

// ─── Component ───────────────────────────────────────────────────────────────
export const LaunchVideo: React.FC<LaunchVideoProps> = ({ musicVolume = 0.3, sfxVolume: _sfxVolume = 0.7 }) => {
  const { fps } = useVideoConfig()

  const s = (seconds: number) => Math.round(seconds * fps)
  const TRANSITION_FRAMES = Math.round(0.83 * fps) // 25f at 30fps

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {/* Background music — looped, fades out in last 2s */}
      <Audio
        src={staticFile("remotion/music-launch.mp3")}
        loop
        loopVolumeCurveBehavior="extend"
        volume={(f) => {
          const totalFrames = s(29)
          const fadeOutStart = totalFrames - s(2)
          if (f >= fadeOutStart) {
            return musicVolume * (1 - (f - fadeOutStart) / s(2))
          }
          return musicVolume
        }}
      />

      <TransitionSeries>
        {/* 1 — Intro */}
        <TransitionSeries.Sequence durationInFrames={s(SCENE_DURATIONS_S.intro)} premountFor={30}>
          <IntroScene
            title="RepoPress is Live"
            subtitle="Git-native headless CMS — now in early access"
            badge="Launch"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 20 }, durationInFrames: TRANSITION_FRAMES })}
          presentation={fade()}
        />

        {/* 2 — Frameworks */}
        <TransitionSeries.Sequence durationInFrames={s(SCENE_DURATIONS_S.frameworks)} premountFor={30}>
          <FrameworkScene title="Every Framework. One CMS." />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 20 }, durationInFrames: TRANSITION_FRAMES })}
          presentation={slide({ direction: "from-right" })}
        />

        {/* 3 — Git Native */}
        <TransitionSeries.Sequence durationInFrames={s(SCENE_DURATIONS_S.gitNative)} premountFor={30}>
          <AbsoluteFill
            style={{ display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#000000" }}
          >
            <GitNativeFeature />
          </AbsoluteFill>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 20 }, durationInFrames: TRANSITION_FRAMES })}
          presentation={wipe({ direction: "from-left" })}
        />

        {/* 4 — Studio Demo */}
        <TransitionSeries.Sequence durationInFrames={s(SCENE_DURATIONS_S.studio)} premountFor={30}>
          <AbsoluteFill
            style={{ display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#000000" }}
          >
            <StudioDemo />
          </AbsoluteFill>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 20 }, durationInFrames: TRANSITION_FRAMES })}
          presentation={fade()}
        />

        {/* 5 — Workflow */}
        <TransitionSeries.Sequence durationInFrames={s(SCENE_DURATIONS_S.workflow)} premountFor={30}>
          <AbsoluteFill
            style={{ display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#000000" }}
          >
            <WorkflowFeature />
          </AbsoluteFill>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 20 }, durationInFrames: TRANSITION_FRAMES })}
          presentation={slide({ direction: "from-right" })}
        />

        {/* 6 — CTA */}
        <TransitionSeries.Sequence durationInFrames={s(SCENE_DURATIONS_S.cta)} premountFor={30}>
          <CTAScene headline="RepoPress — Now in Early Access" url="repopress.app" />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  )
}

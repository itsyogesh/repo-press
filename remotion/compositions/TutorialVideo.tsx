import { springTiming, TransitionSeries } from "@remotion/transitions"
import { fade } from "@remotion/transitions/fade"
import { slide } from "@remotion/transitions/slide"
import { wipe } from "@remotion/transitions/wipe"
import type React from "react"
import { AbsoluteFill, Audio, staticFile, useVideoConfig } from "remotion"
import { CTAScene } from "../components/scenes/CTAScene"
import { FrameworkScene } from "../components/scenes/FrameworkScene"
import { IntroScene } from "../components/scenes/IntroScene"
import { TitleDropScene } from "../components/scenes/TitleDropScene"
import { GitNativeFeature } from "./GitNativeFeature"
import { MDXEditorFeature } from "./MDXEditorFeature"
import { StudioDemo } from "./StudioDemo"
import { WorkflowFeature } from "./WorkflowFeature"

// ─── Props ───────────────────────────────────────────────────────────────────
export type TutorialVideoProps = {
  musicVolume: number
  sfxVolume: number
}

export const tutorialVideoDefaultProps: TutorialVideoProps = {
  musicVolume: 0.25,
  sfxVolume: 0.7,
}

// ─── Scene durations ─────────────────────────────────────────────────────────
const SCENE_DURATIONS_S = {
  intro: 4,
  titleConnect: 3,
  frameworks: 5,
  gitNative: 8,
  titleEditor: 3,
  mdxEditor: 8,
  titleWorkflow: 3,
  workflow: 8,
  titleStudio: 3,
  studio: 10,
  cta: 6,
}
// 11 scenes, 10 transitions at ~0.83s (25f @ 30fps) each
// ~61s raw - 8.33s overlap = ~53s total. Placeholder — verify in Studio.

// ─── Component ───────────────────────────────────────────────────────────────
export const TutorialVideo: React.FC<TutorialVideoProps> = ({ musicVolume = 0.25, sfxVolume: _sfxVolume = 0.7 }) => {
  const { fps } = useVideoConfig()

  const s = (seconds: number) => Math.round(seconds * fps)
  const TRANSITION_FRAMES = Math.round(0.83 * fps) // 25f at 30fps

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {/* Background music — looped, fades out in last 2s */}
      <Audio
        src={staticFile("remotion/music-tutorial.mp3")}
        loop
        loopVolumeCurveBehavior="extend"
        volume={(f) => {
          const totalFrames = s(53)
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
          <IntroScene title="RepoPress" subtitle="The Git-native headless CMS for developers" badge="Tutorial" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 20 }, durationInFrames: TRANSITION_FRAMES })}
          presentation={fade()}
        />

        {/* 2 — Title: Connect your repo */}
        <TransitionSeries.Sequence durationInFrames={s(SCENE_DURATIONS_S.titleConnect)} premountFor={30}>
          <TitleDropScene step={1} title="Connect Your Repo" accent="Link any GitHub repository in seconds" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 20 }, durationInFrames: TRANSITION_FRAMES })}
          presentation={slide({ direction: "from-right" })}
        />

        {/* 3 — Frameworks */}
        <TransitionSeries.Sequence durationInFrames={s(SCENE_DURATIONS_S.frameworks)} premountFor={30}>
          <FrameworkScene title="Works With Your Stack" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 20 }, durationInFrames: TRANSITION_FRAMES })}
          presentation={wipe({ direction: "from-left" })}
        />

        {/* 4 — Git-native feature */}
        <TransitionSeries.Sequence durationInFrames={s(SCENE_DURATIONS_S.gitNative)} premountFor={30}>
          <AbsoluteFill
            style={{ display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#000000" }}
          >
            <GitNativeFeature />
          </AbsoluteFill>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 20 }, durationInFrames: TRANSITION_FRAMES })}
          presentation={slide({ direction: "from-right" })}
        />

        {/* 5 — Title: Write MDX */}
        <TransitionSeries.Sequence durationInFrames={s(SCENE_DURATIONS_S.titleEditor)} premountFor={30}>
          <TitleDropScene step={2} title="Write in MDX" accent="Live preview as you type" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 20 }, durationInFrames: TRANSITION_FRAMES })}
          presentation={fade()}
        />

        {/* 6 — MDX Editor feature */}
        <TransitionSeries.Sequence durationInFrames={s(SCENE_DURATIONS_S.mdxEditor)} premountFor={30}>
          <AbsoluteFill
            style={{ display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#000000" }}
          >
            <MDXEditorFeature />
          </AbsoluteFill>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 20 }, durationInFrames: TRANSITION_FRAMES })}
          presentation={wipe({ direction: "from-right" })}
        />

        {/* 7 — Title: Workflow */}
        <TransitionSeries.Sequence durationInFrames={s(SCENE_DURATIONS_S.titleWorkflow)} premountFor={30}>
          <TitleDropScene step={3} title="Publish With Confidence" accent="Draft → Review → Approve → Publish" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 20 }, durationInFrames: TRANSITION_FRAMES })}
          presentation={slide({ direction: "from-right" })}
        />

        {/* 8 — Workflow feature */}
        <TransitionSeries.Sequence durationInFrames={s(SCENE_DURATIONS_S.workflow)} premountFor={30}>
          <AbsoluteFill
            style={{ display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#000000" }}
          >
            <WorkflowFeature />
          </AbsoluteFill>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 20 }, durationInFrames: TRANSITION_FRAMES })}
          presentation={fade()}
        />

        {/* 9 — Title: Studio */}
        <TransitionSeries.Sequence durationInFrames={s(SCENE_DURATIONS_S.titleStudio)} premountFor={30}>
          <TitleDropScene step={4} title="Studio Editor" accent="Real-time preview with split-pane editing" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 20 }, durationInFrames: TRANSITION_FRAMES })}
          presentation={wipe({ direction: "from-left" })}
        />

        {/* 10 — Studio Demo */}
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

        {/* 11 — CTA */}
        <TransitionSeries.Sequence durationInFrames={s(SCENE_DURATIONS_S.cta)} premountFor={30}>
          <CTAScene headline="Start editing your docs today." url="repopress.app" />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  )
}

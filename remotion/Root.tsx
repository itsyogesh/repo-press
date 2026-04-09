import "./fonts"
import { Composition } from "remotion"
import { GitNativeFeature } from "./compositions/GitNativeFeature"
import { LaunchVideo, launchVideoSchema } from "./compositions/LaunchVideo"
import { MDXEditorFeature } from "./compositions/MDXEditorFeature"
import { StudioDemo } from "./compositions/StudioDemo"
import { TutorialVideo, tutorialVideoSchema } from "./compositions/TutorialVideo"
import { WorkflowFeature } from "./compositions/WorkflowFeature"

export const RemotionRoot = () => {
  return (
    <>
      {/* ── Feature compositions (building blocks) ─────────────────────── */}
      <Composition id="StudioDemo" component={StudioDemo} durationInFrames={300} fps={30} width={1280} height={720} />
      <Composition
        id="GitNativeFeature"
        component={GitNativeFeature}
        durationInFrames={150}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="MDXEditorFeature"
        component={MDXEditorFeature}
        durationInFrames={210}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="WorkflowFeature"
        component={WorkflowFeature}
        durationInFrames={150}
        fps={30}
        width={1280}
        height={720}
      />

      {/* ── Full-length production videos ──────────────────────────────── */}
      {/*
        NOTE: durationInFrames values below are estimates.
        Open Remotion Studio (`npx remotion studio remotion/Root.tsx`) and
        verify the actual duration of each TransitionSeries before finalizing.
        Tutorial ≈ 53s × 30fps = 1590f  |  Launch ≈ 29s × 30fps = 870f
      */}
      <Composition
        id="TutorialVideo"
        component={TutorialVideo}
        durationInFrames={1590}
        fps={30}
        width={1280}
        height={720}
        schema={tutorialVideoSchema}
        defaultProps={tutorialVideoSchema.parse({})}
      />
      <Composition
        id="LaunchVideo"
        component={LaunchVideo}
        durationInFrames={870}
        fps={30}
        width={1280}
        height={720}
        schema={launchVideoSchema}
        defaultProps={launchVideoSchema.parse({})}
      />
    </>
  )
}

import "./fonts"
import { Composition, registerRoot } from "remotion"
import { GitNativeFeature } from "./compositions/GitNativeFeature"
import { LaunchVideo, launchVideoDefaultProps } from "./compositions/LaunchVideo"
import { MDXEditorFeature } from "./compositions/MDXEditorFeature"
import { StudioDemo } from "./compositions/StudioDemo"
import { studioDemoComposition } from "./compositions/studio-demo-composition"
import { TutorialVideo, tutorialVideoDefaultProps } from "./compositions/TutorialVideo"
import { WorkflowFeature } from "./compositions/WorkflowFeature"

export const RemotionRoot = () => {
  return (
    <>
      {/* ── Feature compositions (building blocks) ─────────────────────── */}
      <Composition
        id={studioDemoComposition.id}
        component={StudioDemo}
        durationInFrames={studioDemoComposition.durationInFrames}
        fps={studioDemoComposition.fps}
        width={studioDemoComposition.width}
        height={studioDemoComposition.height}
      />
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
        durationInFrames = sum(scene_seconds) × 30fps − (n_transitions × 25f)
        Tutorial: (61s × 30) − (10 × 25) = 1830 − 250 = 1580f (~52.7s)
        Launch:   (33s × 30) − (5  × 25) = 990  − 125 = 865f  (~28.8s)
      */}
      <Composition
        id="TutorialVideo"
        component={TutorialVideo}
        durationInFrames={1580}
        fps={30}
        width={1280}
        height={720}
        defaultProps={tutorialVideoDefaultProps}
      />
      <Composition
        id="LaunchVideo"
        component={LaunchVideo}
        durationInFrames={865}
        fps={30}
        width={1280}
        height={720}
        defaultProps={launchVideoDefaultProps}
      />
    </>
  )
}

registerRoot(RemotionRoot)

import { Composition } from "remotion"
import { GitNativeFeature } from "./compositions/GitNativeFeature"
import { MDXEditorFeature } from "./compositions/MDXEditorFeature"
import { StudioDemo } from "./compositions/StudioDemo"
import { WorkflowFeature } from "./compositions/WorkflowFeature"

export const RemotionRoot = () => {
  return (
    <>
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
    </>
  )
}

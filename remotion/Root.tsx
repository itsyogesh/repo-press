import { Composition } from "remotion"
import { StudioDemo } from "./compositions/StudioDemo"

export const RemotionRoot = () => {
  return (
    <Composition id="StudioDemo" component={StudioDemo} durationInFrames={300} fps={30} width={1280} height={720} />
  )
}

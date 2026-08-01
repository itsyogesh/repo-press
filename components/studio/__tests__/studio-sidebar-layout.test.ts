// @vitest-environment node
import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("Studio expanded sidebar layout", () => {
  it("gives only the expanded sidebar panel a flex-column shell", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "components/studio/studio-layout.tsx"), "utf8")
    const expandedSidebar = source.match(
      /<ResizablePanel[\s\S]*?id="sidebar"[\s\S]*?<StudioPanelShell className="([^"]+)"/,
    )

    expect(expandedSidebar?.[1].split(/\s+/)).toEqual(
      expect.arrayContaining(["flex", "flex-col", "bg-studio-canvas-inset/70"]),
    )
    expect(source.match(/<StudioPanelShell className="flex flex-col bg-studio-canvas-inset\/70">/g)).toHaveLength(1)
  })
})

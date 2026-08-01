"use client"

import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CodeToggle,
  CreateLink,
  DiffSourceToggleWrapper,
  InsertCodeBlock,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  Separator,
  StrikeThroughSupSubToggles,
  UndoRedo,
} from "@mdxeditor/editor"
import { cn } from "@/lib/utils"
import { InsertJsxButton } from "./insert-jsx-button"

interface StudioToolbarProps {
  owner: string
  repo: string
  branch: string
  projectId?: string
  userId?: string
  selectedFilePath?: string
  showMarkdownMediaInserts?: boolean
}

export function StudioToolbar({
  owner,
  repo,
  branch,
  projectId,
  userId,
  selectedFilePath,
  showMarkdownMediaInserts = true,
}: StudioToolbarProps) {
  return (
    <DiffSourceToggleWrapper options={["rich-text", "source"]}>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-studio-border/70 bg-studio-canvas-inset/45 p-2">
        <ToolbarCluster label="Insert">
          <InsertJsxButton
            owner={owner}
            repo={repo}
            branch={branch}
            projectId={projectId}
            userId={userId}
            selectedFilePath={selectedFilePath}
          />
        </ToolbarCluster>

        <ToolbarCluster label="Edit">
          <UndoRedo />
        </ToolbarCluster>

        <ToolbarCluster label="Text">
          <BoldItalicUnderlineToggles />
          <CodeToggle />
          <Separator />
          <StrikeThroughSupSubToggles />
        </ToolbarCluster>

        <ToolbarCluster label="Structure">
          <BlockTypeSelect />
          <Separator />
          <ListsToggle />
        </ToolbarCluster>

        <ToolbarCluster label="Embed">
          <CreateLink />
          {showMarkdownMediaInserts ? <InsertImage /> : null}
          <InsertTable />
          <InsertThematicBreak />
          <InsertCodeBlock />
        </ToolbarCluster>
      </div>
    </DiffSourceToggleWrapper>
  )
}

function ToolbarCluster({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-md border border-studio-border/70 bg-studio-canvas px-1.5 py-1",
        "before:pointer-events-none",
      )}
    >
      <span className="hidden px-1 text-[10px] font-medium uppercase tracking-[0.16em] text-studio-fg-muted xl:inline">
        {label}
      </span>
      {children}
    </div>
  )
}

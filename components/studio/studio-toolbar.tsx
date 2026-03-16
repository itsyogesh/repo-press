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
import { InsertJsxButton } from "./insert-jsx-button"

interface StudioToolbarProps {
  owner: string
  repo: string
  branch: string
  projectId?: string
  userId?: string
  showMarkdownMediaInserts?: boolean
}

export function StudioToolbar({
  owner,
  repo,
  branch,
  projectId,
  userId,
  showMarkdownMediaInserts = true,
}: StudioToolbarProps) {
  return (
    <DiffSourceToggleWrapper options={["rich-text", "source"]}>
      <div className="flex items-center gap-0.5 flex-wrap">
        <UndoRedo />
        <Separator />
        <BoldItalicUnderlineToggles />
        <CodeToggle />
        <Separator />
        <StrikeThroughSupSubToggles />
        <Separator />
        <BlockTypeSelect />
        <Separator />
        <ListsToggle />
        <Separator />
        <CreateLink />
        {showMarkdownMediaInserts ? <InsertImage /> : null}
        <InsertTable />
        <InsertThematicBreak />
        <InsertCodeBlock />
        <Separator />
        <InsertJsxButton owner={owner} repo={repo} branch={branch} projectId={projectId} userId={userId} />
      </div>
    </DiffSourceToggleWrapper>
  )
}

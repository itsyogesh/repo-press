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
import { InsertRepoComponent } from "./insert-repo-component"

export function StudioToolbar({ owner, repo, branch }: { owner: string; repo: string; branch: string }) {
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
        <InsertImage />
        <InsertTable />
        <InsertThematicBreak />
        <InsertCodeBlock />
        <Separator />
        <InsertRepoComponent owner={owner} repo={repo} branch={branch} />
      </div>
    </DiffSourceToggleWrapper>
  )
}

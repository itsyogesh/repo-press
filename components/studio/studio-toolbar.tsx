'use client'

import {
  BoldItalicUnderlineToggles,
  StrikeThroughSupSubToggles,
  BlockTypeSelect,
  CreateLink,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  InsertCodeBlock,
  ListsToggle,
  UndoRedo,
  DiffSourceToggleWrapper,
  Separator,
  CodeToggle,
} from '@mdxeditor/editor'

export function StudioToolbar() {
  return (
    <DiffSourceToggleWrapper options={['rich-text', 'source']}>
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
      </div>
    </DiffSourceToggleWrapper>
  )
}

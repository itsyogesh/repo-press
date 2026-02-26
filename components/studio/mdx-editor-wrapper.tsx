'use client'
import {
  MDXEditor,
  type MDXEditorMethods,
  type MDXEditorProps,
} from '@mdxeditor/editor'
import { forwardRef } from 'react'

const MDXEditorComponent = forwardRef<MDXEditorMethods, MDXEditorProps>(
  (props, ref) => <MDXEditor {...props} ref={ref} />
)
MDXEditorComponent.displayName = 'MDXEditorComponent'
export default MDXEditorComponent

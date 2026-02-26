'use client'
import dynamic from 'next/dynamic'
import type { MDXEditorMethods, MDXEditorProps } from '@mdxeditor/editor'
import { forwardRef } from 'react'

// Dynamic import to prevent SSR — MDXEditor relies on browser APIs
const Editor = dynamic(() => import('./mdx-editor-wrapper'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-sm text-studio-fg-muted animate-pulse">
      Loading editor...
    </div>
  ),
})

export const ForwardRefEditor = forwardRef<MDXEditorMethods, MDXEditorProps>(
  (props, ref) => <Editor {...props} ref={ref} />
)
ForwardRefEditor.displayName = 'ForwardRefEditor'

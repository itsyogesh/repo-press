'use client'
import dynamic from 'next/dynamic'
import type { MDXEditorMethods, MDXEditorProps } from '@mdxeditor/editor'
import { forwardRef } from 'react'

// Dynamic import to prevent SSR — MDXEditor relies on browser APIs
const Editor = dynamic(() => import('./mdx-editor-wrapper'), {
  ssr: false,
  loading: () => (
    <div className="h-full space-y-4 px-6 py-4">
      <div className="h-8 w-1/3 animate-pulse rounded bg-studio-canvas-inset" />
      <div className="h-6 w-2/3 animate-pulse rounded bg-studio-canvas-inset" />
      <div className="h-6 w-1/2 animate-pulse rounded bg-studio-canvas-inset" />
      <div className="h-80 w-full animate-pulse rounded bg-studio-canvas-inset" />
    </div>
  ),
})

export const ForwardRefEditor = forwardRef<MDXEditorMethods, MDXEditorProps>(
  (props, ref) => <Editor {...props} ref={ref} />
)
ForwardRefEditor.displayName = 'ForwardRefEditor'

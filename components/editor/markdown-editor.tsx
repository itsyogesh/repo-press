"use client"

import { Textarea } from "@/components/ui/textarea"

interface MarkdownEditorProps {
  content: string
  onChange: (value: string) => void
}

export function MarkdownEditor({ content, onChange }: MarkdownEditorProps) {
  return (
    <div className="h-full w-full p-4">
      <Textarea
        className="h-full w-full resize-none font-mono text-sm"
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write your markdown here..."
      />
    </div>
  )
}

"use client"

interface PreviewProps {
  content: string
}

export function Preview({ content }: PreviewProps) {
  return (
    <div className="h-full w-full p-4 overflow-auto prose dark:prose-invert max-w-none">
      <div className="whitespace-pre-wrap">{content}</div>
    </div>
  )
}

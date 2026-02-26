"use client"

import * as React from "react"
import { AlertTriangle, Copy, FileCode } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }

    return this.props.children
  }
}

export { ErrorBoundary }

interface ErrorFallbackProps {
  title?: string
  message?: string
  onRetry?: () => void
}

export function ExplorerErrorFallback({
  title = "Failed to load file explorer",
  message = "There was an error loading the file tree.",
}: ErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <AlertTriangle className="h-10 w-10 text-studio-danger mb-4" />
      <h3 className="font-semibold text-studio-fg mb-2">{title}</h3>
      <p className="text-sm text-studio-fg-muted">{message}</p>
    </div>
  )
}

interface EditorErrorFallbackProps {
  content?: string
  onOpenSource?: () => void
  onCopy?: () => void
}

export function EditorErrorFallback({ content, onOpenSource, onCopy }: EditorErrorFallbackProps) {
  const [showDetails, setShowDetails] = React.useState(false)

  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <AlertTriangle className="h-10 w-10 text-studio-danger mb-4" />
      <h3 className="font-semibold text-studio-fg mb-2">Failed to load editor</h3>
      <p className="text-sm text-studio-fg-muted mb-4">The editor encountered an error parsing this file.</p>
      <div className="flex gap-2">
        {onOpenSource && (
          <Button variant="outline" size="sm" onClick={onOpenSource}>
            <FileCode className="h-4 w-4 mr-2" />
            Open in source mode
          </Button>
        )}
        {content && (
          <Button variant="outline" size="sm" onClick={onCopy || handleCopy}>
            <Copy className="h-4 w-4 mr-2" />
            Copy content
          </Button>
        )}
      </div>
      {showDetails && (
        <div className="mt-4 p-3 bg-studio-canvas-inset rounded text-xs text-left w-full overflow-auto max-h-32">
          <pre className="whitespace-pre-wrap">Error loading editor content</pre>
        </div>
      )}
      <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setShowDetails(!showDetails)}>
        {showDetails ? "Hide details" : "Show details"}
      </Button>
    </div>
  )
}

export function PreviewErrorFallback({
  title = "Failed to render preview",
  message = "There was an error rendering the preview.",
}: ErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <AlertTriangle className="h-10 w-10 text-studio-danger mb-4" />
      <h3 className="font-semibold text-studio-fg mb-2">{title}</h3>
      <p className="text-sm text-studio-fg-muted">{message}</p>
    </div>
  )
}

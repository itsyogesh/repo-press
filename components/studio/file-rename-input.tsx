import * as React from "react"
import { Input } from "@/components/ui/input"

interface FileRenameInputProps {
  initialValue: string
  onSubmit: (newValue: string) => void
  onCancel: () => void
  className?: string
}

export function FileRenameInput({ initialValue, onSubmit, onCancel, className }: FileRenameInputProps) {
  const [value, setValue] = React.useState(initialValue)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const submittedRef = React.useRef(false)

  React.useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
      // Select the filename part without the extension
      const lastDot = initialValue.lastIndexOf(".")
      const selectionEnd = lastDot !== -1 ? lastDot : initialValue.length
      inputRef.current.setSelectionRange(0, selectionEnd)
    }
  }, [initialValue])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      e.stopPropagation()
      submittedRef.current = true
      if (value.trim() && value !== initialValue) {
        onSubmit(value.trim())
      } else {
        onCancel()
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
    }
  }

  const handleBlur = () => {
    if (submittedRef.current) return
    if (value.trim() && value !== initialValue) {
      onSubmit(value.trim())
    } else {
      onCancel()
    }
  }

  return (
    <Input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      className={`h-6 text-sm px-1 py-0 shadow-none -ml-1 ${className}`}
      onClick={(e) => e.stopPropagation()}
      autoComplete="off"
      spellCheck={false}
    />
  )
}

"use client"

import { X } from "lucide-react"
import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  className?: string
}

export function TagInput({ value = [], onChange, placeholder = "Add tag...", className }: TagInputProps) {
  const [inputValue, setInputValue] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)
  const inputId = React.useId()
  const tagEntries = React.useMemo(() => {
    const seen = new Map<string, number>()
    return value.map((tag) => {
      const nextCount = (seen.get(tag) ?? 0) + 1
      seen.set(tag, nextCount)
      return {
        tag,
        key: `${tag}::${nextCount}`,
      }
    })
  }, [value])

  const addTag = (tag: string) => {
    const trimmed = tag.trim()
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
    }
    setInputValue("")
  }

  const removeTagByKey = (keyToRemove: string) => {
    const seen = new Map<string, number>()
    const next: string[] = []

    for (const tag of value) {
      const nextCount = (seen.get(tag) ?? 0) + 1
      seen.set(tag, nextCount)
      const key = `${tag}::${nextCount}`

      if (key === keyToRemove) {
        continue
      }
      next.push(tag)
    }

    onChange(next)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      addTag(inputValue)
    } else if (e.key === "Backspace" && inputValue === "" && tagEntries.length > 0) {
      const lastEntry = tagEntries[tagEntries.length - 1]
      removeTagByKey(lastEntry.key)
    }
  }

  return (
    <label
      htmlFor={inputId}
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-md border border-studio-border bg-studio-canvas px-2 py-1.5 min-h-[36px] cursor-text",
        className,
      )}
    >
      {tagEntries.map(({ tag, key }) => (
        <Badge
          key={key}
          variant="secondary"
          className="h-6 gap-1 px-2 text-xs bg-studio-accent-muted text-studio-accent hover:bg-studio-accent/20 transition-colors"
        >
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              removeTagByKey(key)
            }}
            className="ml-0.5 rounded-full hover:bg-studio-accent/30 p-0.5 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Input
        id={inputId}
        ref={inputRef}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (inputValue.trim()) {
            addTag(inputValue)
          }
        }}
        placeholder={value.length === 0 ? placeholder : ""}
        className="border-0 shadow-none h-6 px-1 text-sm min-w-[80px] flex-1 focus-visible:ring-0 bg-transparent"
      />
    </label>
  )
}

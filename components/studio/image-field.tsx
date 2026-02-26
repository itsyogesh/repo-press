"use client"

import * as React from "react"
import { Eye, ImageIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ImageFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function ImageField({ value, onChange, placeholder = "/images/cover.jpg", className }: ImageFieldProps) {
  const [showPreview, setShowPreview] = React.useState(!!value)

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <ImageIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-studio-fg-muted" />
          <Input
            value={value || ""}
            onChange={(e) => {
              onChange(e.target.value)
              if (e.target.value) setShowPreview(true)
            }}
            placeholder={placeholder}
            className="pl-9 border-studio-border"
          />
        </div>
        {value && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => setShowPreview(!showPreview)}
            title={showPreview ? "Hide preview" : "Show preview"}
          >
            <Eye className="h-4 w-4" />
          </Button>
        )}
      </div>
      {value && showPreview && (
        <div className="rounded-md border border-studio-border overflow-hidden bg-studio-canvas-inset">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Cover preview"
            className="max-h-32 w-full object-cover"
            onError={(e) => {
              // Hide the broken image
              (e.target as HTMLImageElement).style.display = "none"
            }}
          />
        </div>
      )}
    </div>
  )
}

"use client"

import * as React from "react"
import { Eye, ImageIcon, FolderOpen } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface ImageFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  imagePaths?: string[]
}

export function ImageField({
  value,
  onChange,
  placeholder = "/images/cover.jpg",
  className,
  imagePaths = [],
}: ImageFieldProps) {
  const [showPreview, setShowPreview] = React.useState(!!value)
  const [browserOpen, setBrowserOpen] = React.useState(false)

  const handleSelectImage = (path: string) => {
    onChange(path)
    setBrowserOpen(false)
    setShowPreview(true)
  }

  return (
    <>
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
          {imagePaths.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0 border-studio-border"
              onClick={() => setBrowserOpen(true)}
            >
              <FolderOpen className="h-4 w-4 mr-1" />
              Browse
            </Button>
          )}
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
                ;(e.target as HTMLImageElement).style.display = "none"
              }}
            />
          </div>
        )}
      </div>

      <Dialog open={browserOpen} onOpenChange={setBrowserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Browse Images</DialogTitle>
            <DialogDescription>Select an image from your repository</DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[300px] mt-4">
            <div className="grid grid-cols-3 gap-2 p-1">
              {imagePaths.map((path) => (
                <button
                  key={path}
                  onClick={() => handleSelectImage(path)}
                  className={cn(
                    "relative aspect-square rounded-md border overflow-hidden bg-studio-canvas-inset hover:border-studio-accent transition-colors",
                    value === path && "border-studio-accent ring-2 ring-studio-accent",
                  )}
                  title={path}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={path}
                    alt={path.split("/").pop()}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).src =
                        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpath d='m21 15-5-5L5 21'/%3E%3C/svg%3E"
                    }}
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                    <p className="text-[8px] text-white truncate">{path.split("/").pop()}</p>
                  </div>
                </button>
              ))}
            </div>
            {imagePaths.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-studio-fg-muted py-8">
                <ImageIcon className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No images found in repository</p>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}

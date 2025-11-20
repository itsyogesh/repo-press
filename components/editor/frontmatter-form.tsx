"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useState } from "react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

export interface Frontmatter {
  title?: string
  date?: string
  description?: string
  tags?: string[]
  [key: string]: any
}

interface FrontmatterFormProps {
  data: Frontmatter
  onChange: (data: Frontmatter) => void
}

export function FrontmatterForm({ data, onChange }: FrontmatterFormProps) {
  const [isOpen, setIsOpen] = useState(true)

  const handleChange = (key: string, value: string) => {
    onChange({ ...data, [key]: value })
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border-b">
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30">
        <h3 className="text-sm font-medium">Frontmatter</h3>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="p-4 space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={data.title || ""}
            onChange={(e) => handleChange("title", e.target.value)}
            placeholder="Post Title"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" value={data.date || ""} onChange={(e) => handleChange("date", e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            value={data.description || ""}
            onChange={(e) => handleChange("description", e.target.value)}
            placeholder="Short description"
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, ChevronRight, Save } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

interface EditorProps {
  content: string
  frontmatter: Record<string, any>
  onChangeContent: (value: string) => void
  onChangeFrontmatter: (key: string, value: any) => void
  onSave: () => void
  isSaving: boolean
}

export function Editor({ content, frontmatter, onChangeContent, onChangeFrontmatter, onSave, isSaving }: EditorProps) {
  const [isFrontmatterOpen, setIsFrontmatterOpen] = React.useState(true)

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-2 border-b bg-muted/30">
        <span className="text-sm font-medium">Editor</span>
        <Button size="sm" onClick={onSave} disabled={isSaving}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          <Collapsible
            open={isFrontmatterOpen}
            onOpenChange={setIsFrontmatterOpen}
            className="border rounded-md bg-card"
          >
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <h3 className="text-sm font-semibold">Frontmatter</h3>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-9 p-0">
                  {isFrontmatterOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="sr-only">Toggle Frontmatter</span>
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="p-4 space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={frontmatter.title || ""}
                  onChange={(e) => onChangeFrontmatter("title", e.target.value)}
                  placeholder="Post Title"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={frontmatter.date || ""}
                  onChange={(e) => onChangeFrontmatter("date", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={frontmatter.description || ""}
                  onChange={(e) => onChangeFrontmatter("description", e.target.value)}
                  placeholder="Brief description..."
                  className="h-20"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tags">Tags (comma separated)</Label>
                <Input
                  id="tags"
                  value={frontmatter.tags || ""}
                  onChange={(e) => onChangeFrontmatter("tags", e.target.value)}
                  placeholder="react, nextjs, tutorial"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="coverImage">Cover Image URL</Label>
                <Input
                  id="coverImage"
                  value={frontmatter.coverImage || ""}
                  onChange={(e) => onChangeFrontmatter("coverImage", e.target.value)}
                  placeholder="/images/cover.jpg"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="space-y-2">
            <Label>Content (MDX)</Label>
            <Textarea
              value={content}
              onChange={(e) => onChangeContent(e.target.value)}
              className="min-h-[500px] font-mono text-sm"
              placeholder="Write your post content here..."
            />
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

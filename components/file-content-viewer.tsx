"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { File } from "lucide-react"

interface FileContentViewerProps {
  fileName: string
  content: string
  language?: string
}

export function FileContentViewer({ fileName, content, language }: FileContentViewerProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <File className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">{fileName}</CardTitle>
          </div>
          {language && (
            <Badge variant="outline" className="text-xs">
              {language}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px] w-full rounded-md border">
          <pre className="p-4 text-sm">
            <code>{content}</code>
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

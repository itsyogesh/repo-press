"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FileText, Search } from "lucide-react"
import { cn } from "@/lib/utils"

type DocumentStatus = "draft" | "in_review" | "approved" | "published" | "scheduled" | "archived"

const STATUS_CONFIG: Record<DocumentStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Draft", variant: "secondary" },
  in_review: { label: "In Review", variant: "outline" },
  approved: { label: "Approved", variant: "outline" },
  published: { label: "Published", variant: "default" },
  scheduled: { label: "Scheduled", variant: "secondary" },
  archived: { label: "Archived", variant: "destructive" },
}

interface DocumentListProps {
  projectId: string
  selectedFilePath?: string
  onSelectDocument: (filePath: string) => void
}

export function DocumentList({ projectId, selectedFilePath, onSelectDocument }: DocumentListProps) {
  const [statusFilter, setStatusFilter] = React.useState<DocumentStatus | "all">("all")
  const [searchTerm, setSearchTerm] = React.useState("")

  const documents = useQuery(
    api.documents.listByProject,
    statusFilter === "all"
      ? { projectId: projectId as Id<"projects"> }
      : { projectId: projectId as Id<"projects">, status: statusFilter },
  )

  const searchResults = useQuery(
    api.documents.search,
    searchTerm.length >= 2
      ? { projectId: projectId as Id<"projects">, searchTerm }
      : "skip",
  )

  // When searching, apply the status filter client-side since the search index doesn't support it
  const filteredSearchResults = searchResults && statusFilter !== "all"
    ? searchResults.filter((doc) => doc.status === statusFilter)
    : searchResults

  const displayedDocs = searchTerm.length >= 2 ? filteredSearchResults : documents

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Documents
      </div>

      <div className="p-2 space-y-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 pl-7 text-xs"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.entries(STATUS_CONFIG) as [DocumentStatus, typeof STATUS_CONFIG[DocumentStatus]][]).map(([key, config]) => (
              <SelectItem key={key} value={key}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {displayedDocs === undefined ? (
            <div className="text-xs text-muted-foreground p-2 text-center">Loading...</div>
          ) : displayedDocs.length === 0 ? (
            <div className="text-xs text-muted-foreground p-2 text-center">
              {searchTerm ? "No results found" : "No documents yet"}
            </div>
          ) : (
            displayedDocs.map((doc) => {
              const statusInfo = STATUS_CONFIG[doc.status as DocumentStatus] || STATUS_CONFIG.draft
              return (
                <Button
                  key={doc._id}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "w-full justify-start gap-2 px-2 h-auto py-2 font-normal",
                    selectedFilePath === doc.filePath && "bg-accent text-accent-foreground",
                  )}
                  onClick={() => onSelectDocument(doc.filePath)}
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex flex-col items-start gap-0.5 min-w-0">
                    <span className="truncate text-sm w-full text-left">{doc.title}</span>
                    <div className="flex items-center gap-1">
                      <Badge variant={statusInfo.variant} className="text-[10px] px-1 py-0 h-4">
                        {statusInfo.label}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {doc.filePath.split("/").pop()}
                      </span>
                    </div>
                  </div>
                </Button>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

import * as React from "react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { formatDistanceToNow } from "date-fns"
import { 
  ArrowLeft, 
  GitBranch, 
  Moon, 
  Sun, 
  MoreVertical,
  History,
  Keyboard,
  HelpCircle
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Badge } from "@/components/ui/badge"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { useStudio } from "./studio-context"
import { useViewMode } from "./view-mode-context"
import { StatusActions } from "./status-actions"
import type { FileTreeNode } from "@/lib/github"

interface StudioHeaderProps {
  selectedFile: FileTreeNode | null
  documentId?: string
  currentStatus: string
  statusInfo: { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
  onSave: () => void
  isSaving: boolean
  lastSavedAt?: number | null
}

export function StudioHeader({
  selectedFile,
  documentId,
  currentStatus,
  statusInfo,
  onSave,
  isSaving,
  lastSavedAt,
}: StudioHeaderProps) {
  const { owner, repo, branch, contentRoot } = useStudio()
  const { viewMode, setViewMode } = useViewMode()
  const { theme, setTheme } = useTheme()

  // Build breadcrumbs
  const pathSegments = selectedFile ? selectedFile.path.split("/") : []
  // If contentRoot is present, we might want to trim it, or just show the full path. Let's show full path for now.
  const filename = pathSegments.pop()
  
  // Truncate logic if too deep
  const showEllipsis = pathSegments.length > 3
  const visibleSegments = showEllipsis ? pathSegments.slice(-2) : pathSegments

  return (
    <header className="flex h-full w-full items-center justify-between gap-4">
      {/* Left: Navigation & Breadcrumbs */}
      <div className="flex items-center gap-2 overflow-hidden flex-1">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8 shrink-0">
          <Link href={`/dashboard/${owner}/${repo}`}>
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back to dashboard</span>
          </Link>
        </Button>

        <Breadcrumb className="line-clamp-1 truncate text-sm">
          <BreadcrumbList className="flex-nowrap whitespace-nowrap">
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/dashboard/${owner}/${repo}`} className="truncate max-w-[100px]">{owner}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/dashboard/${owner}/${repo}`} className="truncate font-semibold max-w-[150px]">{repo}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {pathSegments.length > 0 && <BreadcrumbSeparator />}
            
            {showEllipsis && (
              <>
                <BreadcrumbItem>
                  <span className="text-muted-foreground">...</span>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </>
            )}

            {visibleSegments.map((seg, i) => (
              <React.Fragment key={i}>
                <BreadcrumbItem>
                  <span className="text-muted-foreground truncate max-w-[100px]">{seg}</span>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </React.Fragment>
            ))}

            <BreadcrumbItem>
              <BreadcrumbPage className="truncate max-w-[200px] font-medium text-foreground">
                {filename || "Select a file"}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Center: Branch & Status */}
      <div className="flex items-center gap-4 justify-center flex-1 shrink-0">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-md border border-border/50">
          <GitBranch className="h-3.5 w-3.5" />
          <span className="truncate max-w-[150px]">{branch}</span>
        </div>

        {selectedFile && (
           <div className="flex items-center gap-1">
             <Badge variant={statusInfo.variant} className="capitalize">
               {statusInfo.label}
             </Badge>
             {documentId && (
               <StatusActions documentId={documentId} currentStatus={currentStatus as any} />
             )}
           </div>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 justify-end flex-1">
        <ToggleGroup 
          type="single" 
          value={viewMode === "zen" ? "wysiwyg" : viewMode} 
          onValueChange={(val) => {
            if (val) setViewMode(val as any)
          }}
          className="bg-muted/50 p-0.5 rounded-md border border-border/50"
        >
          <ToggleGroupItem value="wysiwyg" className="h-7 px-2.5 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm">
            WYSIWYG
          </ToggleGroupItem>
          <ToggleGroupItem value="source" className="h-7 px-2.5 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm">
            Source
          </ToggleGroupItem>
          <ToggleGroupItem value="split" className="h-7 px-2.5 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm">
            Split
          </ToggleGroupItem>
        </ToggleGroup>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span className="sr-only">Toggle theme</span>
        </Button>

        <Button 
          variant="secondary" 
          size="sm" 
          className="h-8 gap-1.5"
          onClick={onSave}
          disabled={!selectedFile || isSaving}
        >
          {isSaving ? "Saving..." : lastSavedAt ? `Saved ${formatDistanceToNow(lastSavedAt)} ago` : "Save"}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">More options</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <History className="h-4 w-4 mr-2" />
              History
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Keyboard className="h-4 w-4 mr-2" />
              Keyboard Shortcuts
            </DropdownMenuItem>
            <DropdownMenuItem>
              <HelpCircle className="h-4 w-4 mr-2" />
              Help
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

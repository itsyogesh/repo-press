"use client"

import * as React from "react"
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface PreviewStatusProps {
  isCompiling: boolean
  warnings: string[]
  className?: string
}

export function PreviewStatus({ isCompiling, warnings, className }: PreviewStatusProps) {
  return (
    <div className={cn("flex items-center gap-2 font-sans", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-7 gap-1.5 px-2 rounded-full text-[10px] uppercase tracking-wider font-bold shadow-sm transition-colors",
              isCompiling
                ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                : warnings.length > 0
                  ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                  : "border-green-200 bg-green-50 text-green-700 hover:bg-green-100",
            )}
          >
            {isCompiling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : warnings.length > 0 ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {isCompiling ? "Compiling" : warnings.length > 0 ? `${warnings.length} Issues` : "All Systems Go"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <div
            className={cn(
              "border-b p-3 flex items-center justify-between",
              warnings.length > 0 ? "bg-amber-50 border-amber-100" : "bg-green-50 border-green-100",
            )}
          >
            <div
              className={cn(
                "flex items-center gap-2 font-bold text-xs uppercase tracking-wider",
                warnings.length > 0 ? "text-amber-800" : "text-green-800",
              )}
            >
              {warnings.length > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              MDX Diagnostics
            </div>
            <Badge
              variant="outline"
              className={cn(
                "h-5 px-1.5 text-[10px]",
                warnings.length > 0
                  ? "bg-amber-100 border-amber-200 text-amber-800"
                  : "bg-green-100 border-green-200 text-green-800",
              )}
            >
              {warnings.length}
            </Badge>
          </div>
          <div className="p-2 max-h-[300px] overflow-auto">
            {warnings.length > 0 ? (
              <ul className="space-y-1">
                {warnings.map((w) => (
                  <li
                    key={w}
                    className="text-xs p-2 rounded bg-muted/50 border border-transparent hover:border-amber-200 hover:bg-amber-50/50 transition-colors flex gap-2"
                  >
                    <div className="mt-0.5 size-1.5 rounded-full bg-amber-400 shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-4 text-center space-y-2">
                <div className="text-2xl">🎉</div>
                <p className="text-xs font-medium text-muted-foreground">
                  Everything looks perfect! No issues detected in your MDX or adapter.
                </p>
              </div>
            )}
          </div>
          <div className="p-3 bg-muted/30 border-t text-[10px] text-muted-foreground italic text-left">
            {warnings.length > 0
              ? "Issues can usually be resolved in your repopress.config.json or mdx-preview.tsx."
              : "Your repository is fully optimized for RepoPress MDX editing."}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

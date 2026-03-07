"use client"

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

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
                ? "border-studio-accent/25 bg-studio-accent-muted text-studio-accent hover:bg-studio-accent-muted/80"
                : warnings.length > 0
                  ? "border-studio-attention/25 bg-studio-attention-muted text-studio-attention hover:bg-studio-attention-muted/80"
                  : "border-studio-success/25 bg-studio-success-muted text-studio-success hover:bg-studio-success-muted/80",
            )}
          >
            {isCompiling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : warnings.length > 0 ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {isCompiling ? "Compiling" : warnings.length > 0 ? `${warnings.length} Issues` : ""}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <div
            className={cn(
              "border-b p-3 flex items-center justify-between",
              warnings.length > 0
                ? "bg-studio-attention-muted/70 border-studio-attention/15"
                : "bg-studio-success-muted/70 border-studio-success/15",
            )}
          >
            <div
              className={cn(
                "flex items-center gap-2 font-bold text-xs uppercase tracking-wider",
                warnings.length > 0 ? "text-studio-attention" : "text-studio-success",
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
                  ? "bg-studio-attention-muted border-studio-attention/25 text-studio-attention"
                  : "bg-studio-success-muted border-studio-success/25 text-studio-success",
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
                    className="text-xs p-2 rounded bg-muted/50 border border-transparent hover:border-studio-attention/20 hover:bg-studio-attention-muted/40 transition-colors flex gap-2"
                  >
                    <div className="mt-0.5 size-1.5 rounded-full bg-studio-attention shrink-0" />
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

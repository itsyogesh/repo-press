"use client"

import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface PreviewStatusProps {
  isCompiling: boolean
  warnings: string[]
  profile?: Readonly<{ label: string; description: string }>
  className?: string
}

export function PreviewStatus({ isCompiling, warnings, profile, className }: PreviewStatusProps) {
  const hasWarnings = warnings.length > 0
  const statusLabel = isCompiling
    ? "Compiling"
    : hasWarnings
      ? `${warnings.length} Issues`
      : (profile?.label ?? "No issues")
  return (
    <div className={cn("flex items-center gap-2 font-sans", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-7 gap-1.5 px-2 rounded-full text-[10px] uppercase tracking-wider font-medium transition-colors",
              isCompiling
                ? "border-studio-accent/25 bg-studio-accent-muted text-studio-accent hover:bg-studio-accent-muted/80"
                : hasWarnings
                  ? "border-studio-attention/25 bg-studio-attention-muted text-studio-attention hover:bg-studio-attention-muted/80"
                  : profile
                    ? "border-studio-accent/25 bg-studio-accent-muted text-studio-accent hover:bg-studio-accent-muted/80"
                    : "border-studio-success/25 bg-studio-success-muted text-studio-success hover:bg-studio-success-muted/80",
            )}
          >
            {isCompiling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : hasWarnings ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : profile ? (
              <ShieldCheck className="h-3.5 w-3.5" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {statusLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <div
            className={cn(
              "border-b p-3 flex items-center justify-between",
              hasWarnings
                ? "bg-studio-attention-muted/70 border-studio-attention/15"
                : profile
                  ? "bg-studio-accent-muted/70 border-studio-accent/15"
                  : "bg-studio-success-muted/70 border-studio-success/15",
            )}
          >
            <div
              className={cn(
                "flex items-center gap-2 font-medium text-xs uppercase tracking-wider",
                hasWarnings ? "text-studio-attention" : profile ? "text-studio-accent" : "text-studio-success",
              )}
            >
              {hasWarnings ? (
                <AlertTriangle className="h-4 w-4" />
              ) : profile ? (
                <ShieldCheck className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {hasWarnings ? "MDX Diagnostics" : (profile?.label ?? "MDX Diagnostics")}
            </div>
            <Badge
              variant="outline"
              className={cn(
                "h-5 px-1.5 text-[10px]",
                hasWarnings
                  ? "bg-studio-attention-muted border-studio-attention/25 text-studio-attention"
                  : profile
                    ? "bg-studio-accent-muted border-studio-accent/25 text-studio-accent"
                    : "bg-studio-success-muted border-studio-success/25 text-studio-success",
              )}
            >
              {warnings.length}
            </Badge>
          </div>
          <div className="p-2 max-h-[300px] overflow-auto">
            {hasWarnings ? (
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
            ) : profile ? (
              <div className="space-y-2 p-3">
                <p className="text-xs leading-relaxed text-muted-foreground">{profile.description}</p>
                <p className="text-xs font-medium text-foreground">No diagnostics were reported for this snapshot.</p>
              </div>
            ) : (
              <div className="p-4 text-center space-y-2">
                <CheckCircle2 className="mx-auto size-5 text-studio-success" aria-hidden="true" />
                <p className="text-xs font-medium text-muted-foreground">
                  No diagnostics for the current preview snapshot.
                </p>
              </div>
            )}
          </div>
          <div className="p-3 bg-muted/30 border-t text-[10px] text-muted-foreground italic text-left">
            {hasWarnings
              ? "Review the diagnostics for the current snapshot and preview fidelity before publishing."
              : profile
                ? "Repository code remains isolated; only RepoPress-approved preview capabilities are displayed."
                : "No diagnostics were reported; the displayed fidelity may still differ from production."}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

"use client"

import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Code2, Loader2, Save } from "lucide-react"
import { useCallback, useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { commitRawConfigAction } from "@/app/dashboard/[owner]/[repo]/config-actions"
import { repoPressConfigSchema } from "@/lib/config-schema"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible"
import { Textarea } from "./ui/textarea"

interface RawConfigEditorProps {
  owner: string
  repo: string
  branch: string
  initialJson: string
  initialSha: string
  isWriter: boolean
  onCommitted?: () => void
}

interface ValidationResult {
  valid: boolean
  errors: string[]
}

function validateConfig(json: string): ValidationResult {
  try {
    const parsed = JSON.parse(json)

    const result = repoPressConfigSchema.safeParse(parsed)
    if (!result.success) {
      return {
        valid: false,
        errors: result.error.errors.map(
          (e: { path: (string | number)[]; message: string }) => `${e.path.join(".")}: ${e.message}`,
        ),
      }
    }
    return { valid: true, errors: [] }
  } catch {
    return { valid: false, errors: ["Invalid JSON syntax"] }
  }
}

function computeLineDiff(original: string, modified: string): { added: number; removed: number; changed: boolean } {
  const origLines = original.trim().split("\n")
  const modLines = modified.trim().split("\n")

  let added = 0
  let removed = 0

  const maxLen = Math.max(origLines.length, modLines.length)
  for (let i = 0; i < maxLen; i++) {
    const origLine = origLines[i]
    const modLine = modLines[i]
    if (origLine === undefined && modLine !== undefined) added++
    else if (origLine !== undefined && modLine === undefined) removed++
    else if (origLine !== modLine) {
      added++
      removed++
    }
  }

  return { added, removed, changed: added > 0 || removed > 0 }
}

export function RawConfigEditor({
  owner,
  repo,
  branch,
  initialJson,
  initialSha,
  isWriter,
  onCommitted,
}: RawConfigEditorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [value, setValue] = useState(initialJson)
  const [sha, setSha] = useState(initialSha)
  const [isPending, startTransition] = useTransition()
  const [validation, setValidation] = useState<ValidationResult>({ valid: true, errors: [] })

  // Re-sync when initialJson changes (e.g., after a commit + refresh)
  useEffect(() => {
    setValue(initialJson)
    setSha(initialSha)
    setValidation(validateConfig(initialJson))
  }, [initialJson, initialSha])

  const handleChange = useCallback((newValue: string) => {
    setValue(newValue)
    setValidation(validateConfig(newValue))
  }, [])

  const diff = computeLineDiff(initialJson, value)

  const handleCommit = () => {
    if (!validation.valid) return

    startTransition(async () => {
      const result = await commitRawConfigAction(owner, repo, branch, value, sha, initialJson)
      if (result.success) {
        toast.success("Config committed to GitHub")
        // Update SHA to prevent stale conflicts on subsequent edits
        setSha("") // Will be refreshed on next page load
        onCommitted?.()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleReset = () => {
    setValue(initialJson)
    setValidation(validateConfig(initialJson))
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between text-muted-foreground hover:text-foreground">
          <span className="flex items-center gap-2">
            <Code2 className="h-4 w-4" />
            <span className="text-sm font-medium">Advanced: Raw Config Editor</span>
          </span>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3">
        <div className="rounded-lg border bg-card p-4 space-y-4">
          {/* Validation status + diff summary */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {validation.valid ? (
                <Badge
                  variant="outline"
                  className="border-studio-success/20 bg-studio-success-muted text-studio-success"
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Valid
                </Badge>
              ) : (
                <Badge variant="outline" className="border-destructive/20 bg-destructive/5 text-destructive">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Invalid
                </Badge>
              )}
              {diff.changed && (
                <span className="text-xs text-muted-foreground">
                  <span className="text-studio-success">+{diff.added}</span>
                  {" / "}
                  <span className="text-destructive">-{diff.removed}</span>
                  {" lines changed"}
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">repopress.config.json</span>
          </div>

          {/* Editor */}
          <Textarea
            className="font-mono text-xs min-h-[300px] resize-y bg-muted/50"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            disabled={isPending || !isWriter}
            spellCheck={false}
          />

          {/* Validation errors */}
          {!validation.valid && validation.errors.length > 0 && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3">
              <p className="text-xs font-medium text-destructive mb-1">Validation errors:</p>
              <ul className="text-xs text-destructive/80 list-disc list-inside space-y-0.5">
                {validation.errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          {isWriter && (
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleReset} disabled={isPending || !diff.changed}>
                Reset
              </Button>
              <Button size="sm" onClick={handleCommit} disabled={isPending || !validation.valid || !diff.changed}>
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Committing...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Commit Changes
                  </>
                )}
              </Button>
            </div>
          )}

          {!isWriter && (
            <p className="text-xs text-muted-foreground text-center">
              Read-only - you need editor or owner access to modify the config.
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

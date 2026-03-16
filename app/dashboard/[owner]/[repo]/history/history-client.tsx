"use client"

import { useMutation, useQuery } from "convex/react"
import { ArrowLeft, Clock, Eye, EyeOff, FileText, GitCommit, RotateCcw } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { DiffViewer } from "@/components/studio/history/diff-viewer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { cn } from "@/lib/utils"

interface HistoryClientProps {
  owner: string
  repo: string
  branch?: string
  projectId?: string
  projectAccessToken?: string
}

type ViewMode = "list" | "compare"

export function HistoryClient({ owner, repo, branch: _branch, projectId, projectAccessToken }: HistoryClientProps) {
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const [compareVersions, setCompareVersions] = useState<[string | null, string | null]>([null, null])
  const [isRestoring, setIsRestoring] = useState(false)

  const user = useQuery(api.auth.getCurrentUser)
  const userId = user?._id as string | undefined

  const queryAuth = { userId, projectAccessToken: projectAccessToken || undefined }

  const project = useQuery(api.projects.get, projectId ? { id: projectId as Id<"projects">, ...queryAuth } : "skip")

  const documents = useQuery(api.documents.listByProject, project?._id ? { projectId: project._id, ...queryAuth } : "skip")

  const documentHistory = useQuery(
    api.documentHistory.listByDocument,
    selectedDoc ? { documentId: selectedDoc as Id<"documents">, ...queryAuth } : "skip",
  )

  const restoreMutation = useMutation(api.documentHistory.restoreVersion)

  const handleRestore = async (historyId: string) => {
    if (
      !confirm(
        "Are you sure you want to restore this version? This will create a new version with the restored content.",
      )
    ) {
      return
    }

    setIsRestoring(true)
    try {
      await restoreMutation({
        historyId: historyId as Id<"documentHistory">,
        userId,
        projectAccessToken: projectAccessToken ?? undefined,
      })
      toast.success("Version restored successfully")
    } catch (error) {
      console.error("Error restoring version:", error)
      toast.error("Failed to restore version")
    } finally {
      setIsRestoring(false)
    }
  }

  const toggleCompareVersion = (versionId: string) => {
    if (compareVersions[0] === versionId) {
      setCompareVersions([null, compareVersions[1]])
    } else if (compareVersions[1] === versionId) {
      setCompareVersions([compareVersions[0], null])
    } else if (compareVersions[0] === null) {
      setCompareVersions([versionId, compareVersions[1]])
    } else if (compareVersions[1] === null) {
      setCompareVersions([compareVersions[0], versionId])
    } else {
      setCompareVersions([versionId, compareVersions[1]])
    }
  }

  const compareEntries = useMemo(() => {
    if (!documentHistory || !compareVersions[0] || !compareVersions[1]) return null
    const entry1 = documentHistory.find((e) => e._id === compareVersions[0])
    const entry2 = documentHistory.find((e) => e._id === compareVersions[1])
    if (!entry1 || !entry2) return null
    return [entry1, entry2].sort((a, b) => a.createdAt - b.createdAt)
  }, [documentHistory, compareVersions])

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto px-4 py-4">
          <Link
            href={`/dashboard/${owner}/${repo}`}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to {owner}/{repo}
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Document History</h1>
              <p className="text-muted-foreground">View version history and compare changes</p>
            </div>
            {selectedDoc && documentHistory && documentHistory.length > 0 && (
              <div className="flex gap-2">
                <Button
                  variant={viewMode === "list" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                >
                  <Clock className="h-4 w-4 mr-2" />
                  List
                </Button>
                <Button
                  variant={viewMode === "compare" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("compare")}
                  disabled={documentHistory.length < 2}
                >
                  <GitCommit className="h-4 w-4 mr-2" />
                  Compare
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="border rounded-lg p-4">
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Documents
            </h2>
            {!projectId ? (
              <p className="text-muted-foreground">
                Open history from Studio so RepoPress can target the active project.
              </p>
            ) : !project ? (
              <p className="text-muted-foreground">Loading project...</p>
            ) : !documents ? (
              <p className="text-muted-foreground">Loading documents...</p>
            ) : documents.length === 0 ? (
              <p className="text-muted-foreground">No documents found</p>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {documents.map((doc) => (
                  <button
                    type="button"
                    key={doc._id}
                    onClick={() => {
                      setSelectedDoc(doc._id)
                      setCompareVersions([null, null])
                    }}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-colors",
                      selectedDoc === doc._id ? "border-primary bg-primary/5" : "hover:bg-muted border-transparent",
                    )}
                  >
                    <div className="font-medium truncate">{doc.title || doc.filePath}</div>
                    <div className="text-sm text-muted-foreground truncate">{doc.filePath}</div>
                    <Badge variant="outline" className="mt-2 text-xs">
                      {doc.status}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-2 border rounded-lg p-4">
            {viewMode === "list" ? (
              <>
                <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Version History
                  {documentHistory && (
                    <Badge variant="secondary" className="ml-2">
                      {documentHistory.length} versions
                    </Badge>
                  )}
                </h2>
                {!selectedDoc ? (
                  <p className="text-muted-foreground">Select a document to view its history</p>
                ) : !documentHistory ? (
                  <p className="text-muted-foreground">Loading history...</p>
                ) : documentHistory.length === 0 ? (
                  <p className="text-muted-foreground">No version history yet</p>
                ) : (
                  <div className="space-y-4 max-h-[600px] overflow-y-auto">
                    {documentHistory.map((entry, index) => (
                      <div
                        key={entry._id}
                        className={cn(
                          "border rounded-lg p-4 transition-colors",
                          compareVersions.includes(entry._id) ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant={index === 0 ? "default" : "secondary"}>
                              {index === 0 ? "Current" : `v${documentHistory.length - index}`}
                            </Badge>
                            {entry.changeType && (
                              <Badge variant="outline" className="text-xs capitalize">
                                {entry.changeType}
                              </Badge>
                            )}
                            {entry.commitSha && (
                              <a
                                href={`https://github.com/${owner}/${repo}/commit/${entry.commitSha}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                              >
                                <GitCommit className="h-3 w-3" />
                                {entry.commitSha.slice(0, 7)}
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => toggleCompareVersion(entry._id)}>
                              {compareVersions.includes(entry._id) ? (
                                <>
                                  <EyeOff className="h-3 w-3 mr-1" />
                                  Deselect
                                </>
                              ) : (
                                <>
                                  <Eye className="h-3 w-3 mr-1" />
                                  Compare
                                </>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRestore(entry._id)}
                              disabled={isRestoring}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Restore
                            </Button>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "Unknown"}
                        </div>
                        {entry.message && <p className="text-sm mt-1">{entry.message}</p>}
                        {entry.editedBy && (
                          <p className="text-xs text-muted-foreground mt-1">by user {entry.editedBy}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                  <GitCommit className="h-5 w-5" />
                  Compare Versions
                </h2>
                {!compareEntries ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground mb-4">Select two versions to compare from the list</p>
                    <p className="text-sm text-muted-foreground">
                      Click &quot;Compare&quot; on any two versions to see the differences
                    </p>
                  </div>
                ) : (
                  <DiffViewer
                    originalValue={compareEntries[0].body}
                    modifiedValue={compareEntries[1].body}
                    language="markdown"
                    className="h-[600px]"
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

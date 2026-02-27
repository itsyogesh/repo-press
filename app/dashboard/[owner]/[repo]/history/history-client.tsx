"use client"

import Link from "next/link"
import { ArrowLeft, Clock, FileText } from "lucide-react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"

interface HistoryClientProps {
  owner: string
  repo: string
}

export function HistoryClient({ owner, repo }: HistoryClientProps) {
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null)

  const project = useQuery(api.projects.findByRepo, {
    repoOwner: owner,
    repoName: repo,
  })

  const documents = useQuery(api.documents.listByProject, project?._id ? { projectId: project._id } : "skip")

  const documentHistory = useQuery(
    api.documentHistory.listByDocument,
    selectedDoc ? { documentId: selectedDoc as Id<"documents"> } : "skip",
  )

  const selectedDocument = documents?.find((d) => d._id === selectedDoc)

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
          <h1 className="text-2xl font-semibold">Document History</h1>
          <p className="text-muted-foreground">View version history for your documents</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border rounded-lg p-4">
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Documents
            </h2>
            {!project ? (
              <p className="text-muted-foreground">Loading project...</p>
            ) : !documents ? (
              <p className="text-muted-foreground">Loading documents...</p>
            ) : documents.length === 0 ? (
              <p className="text-muted-foreground">No documents found</p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <button
                    type="button"
                    key={doc._id}
                    onClick={() => setSelectedDoc(doc._id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedDoc === doc._id ? "border-primary bg-primary/5" : "hover:bg-muted"
                    }`}
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

          <div className="border rounded-lg p-4">
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Version History
            </h2>
            {!selectedDoc ? (
              <p className="text-muted-foreground">Select a document to view its history</p>
            ) : !documentHistory ? (
              <p className="text-muted-foreground">Loading history...</p>
            ) : documentHistory.length === 0 ? (
              <p className="text-muted-foreground">No version history yet</p>
            ) : (
              <div className="space-y-4">
                {documentHistory.map((entry, index) => (
                  <div key={entry._id} className="border-l-2 pl-4 pb-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant={index === 0 ? "default" : "secondary"}>
                        {index === 0 ? "Current" : `v${documentHistory.length - index}`}
                      </Badge>
                      <span className="text-muted-foreground">
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "Unknown"}
                      </span>
                    </div>
                    {entry.message && <p className="text-sm mt-1">{entry.message}</p>}
                    {entry.editedBy && <p className="text-xs text-muted-foreground mt-1">by {entry.editedBy}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

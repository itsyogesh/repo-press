"use client"

import { useMutation, useQuery } from "convex/react"
import { Archive, CheckCircle, ChevronDown, Send, Undo2, XCircle } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"

type DocumentStatus = "draft" | "in_review" | "approved" | "published" | "scheduled" | "archived"

// Statuses reachable via transitionStatus (excludes "published" which requires GitHub commit)
type TransitionableStatus = "draft" | "in_review" | "approved" | "scheduled" | "archived"

const STATUS_ACTIONS: Record<
  DocumentStatus,
  { label: string; icon: React.ElementType; targetStatus: TransitionableStatus }[]
> = {
  draft: [
    { label: "Submit for Review", icon: Send, targetStatus: "in_review" },
    { label: "Archive", icon: Archive, targetStatus: "archived" },
  ],
  in_review: [
    { label: "Approve", icon: CheckCircle, targetStatus: "approved" },
    { label: "Request Changes", icon: XCircle, targetStatus: "draft" },
    { label: "Archive", icon: Archive, targetStatus: "archived" },
  ],
  approved: [
    { label: "Unpublish (back to Draft)", icon: Undo2, targetStatus: "draft" },
    { label: "Archive", icon: Archive, targetStatus: "archived" },
  ],
  published: [
    { label: "Unpublish (back to Draft)", icon: Undo2, targetStatus: "draft" },
    { label: "Archive", icon: Archive, targetStatus: "archived" },
  ],
  scheduled: [
    { label: "Cancel Schedule (back to Draft)", icon: Undo2, targetStatus: "draft" },
    { label: "Archive", icon: Archive, targetStatus: "archived" },
  ],
  archived: [{ label: "Restore to Draft", icon: Undo2, targetStatus: "draft" }],
}

interface StatusActionsProps {
  documentId: string
  currentStatus: DocumentStatus
}

export function StatusActions({ documentId, currentStatus }: StatusActionsProps) {
  const user = useQuery(api.auth.getCurrentUser)
  const transitionStatus = useMutation(api.documents.transitionStatus)
  const [isLoading, setIsLoading] = React.useState(false)
  const [reviewDialogOpen, setReviewDialogOpen] = React.useState(false)
  const [reviewNote, setReviewNote] = React.useState("")
  const [pendingAction, setPendingAction] = React.useState<TransitionableStatus | null>(null)

  const actions = STATUS_ACTIONS[currentStatus] || []

  if (actions.length === 0) return null

  const handleAction = async (targetStatus: TransitionableStatus) => {
    // For review-related actions, show the note dialog
    if (targetStatus === "in_review" || (currentStatus === "in_review" && targetStatus === "draft")) {
      setPendingAction(targetStatus)
      setReviewDialogOpen(true)
      return
    }

    await executeTransition(targetStatus)
  }

  const executeTransition = async (targetStatus: TransitionableStatus, note?: string) => {
    if (!user?._id) return
    setIsLoading(true)

    try {
      await transitionStatus({
        id: documentId as Id<"documents">,
        newStatus: targetStatus,
        reviewerId: user._id as string,
        reviewNote: note,
      })

      const label = actions.find((a) => a.targetStatus === targetStatus)?.label || targetStatus
      toast.success(`Status changed: ${label}`)
    } catch (error: any) {
      console.error("Error transitioning status:", error)
      toast.error(error.message || "Failed to change status")
    } finally {
      setIsLoading(false)
      setReviewDialogOpen(false)
      setReviewNote("")
      setPendingAction(null)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={isLoading}>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {actions.map((action, i) => (
            <React.Fragment key={action.targetStatus}>
              {action.targetStatus === "archived" && i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={() => handleAction(action.targetStatus)}>
                <action.icon className="h-4 w-4 mr-2" />
                {action.label}
              </DropdownMenuItem>
            </React.Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingAction === "in_review" ? "Submit for Review" : "Request Changes"}</DialogTitle>
            <DialogDescription>
              {pendingAction === "in_review"
                ? "Add an optional note for the reviewer."
                : "Explain what changes are needed."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={
              pendingAction === "in_review"
                ? "Notes for the reviewer (optional)..."
                : "Describe the requested changes..."
            }
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => pendingAction && executeTransition(pendingAction, reviewNote || undefined)}
              disabled={isLoading}
            >
              {isLoading ? "Updating..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

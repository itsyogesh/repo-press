"use client"

import { cn } from "@/lib/utils"

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("skeleton bg-studio-border-muted rounded animate-pulse", className)} />
}

export function EditorSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Frontmatter skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <div className="grid gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      </div>

      {/* Editor content skeleton */}
      <div className="space-y-3 pt-4">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-5/6" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-4/5" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-1/2" />
      </div>
    </div>
  )
}

export function FileTreeSkeleton() {
  return (
    <div className="p-2 space-y-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={`skeleton-${i}`} className="flex items-center gap-2 p-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </div>
  )
}

export function FrontmatterSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-4 w-20" />
      <div className="grid gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    </div>
  )
}

export function PreviewSkeleton() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="pt-4 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  )
}

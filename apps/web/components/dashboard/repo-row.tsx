"use client"

import { ArrowRight, Lock } from "lucide-react"
import Link from "next/link"

import type { GitHubRepo } from "@/lib/github"
import { cn } from "@/lib/utils"

interface RepoRowProps {
  repo: GitHubRepo
  connectedProjectCount: number
}

/**
 * A repository row — editorial, hairline-divided. A connected repo gets a
 * green dot + project count; an unconnected one a faint dot and "Connect".
 */
export function RepoRow({ repo, connectedProjectCount }: RepoRowProps) {
  const connected = connectedProjectCount > 0

  return (
    <Link
      href={`/dashboard/${repo.full_name}`}
      className="group flex items-center gap-4 border-b border-border py-3 transition-[padding-left] duration-150 ease-out hover:pl-2"
    >
      <span
        className={cn("size-[7px] shrink-0 rounded-full", connected ? "bg-[var(--success)]" : "bg-border-strong")}
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
          {repo.name}
          {repo.private ? <Lock className="size-3 shrink-0 text-muted-foreground" /> : null}
        </span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">{repo.full_name}</span>
      </div>
      {connected ? (
        <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-primary sm:inline">
          {connectedProjectCount} project{connectedProjectCount !== 1 ? "s" : ""}
        </span>
      ) : null}
      <span className="hidden shrink-0 items-center gap-1 text-sm text-primary opacity-0 transition-opacity duration-150 group-hover:opacity-100 sm:inline-flex">
        {connected ? "Open hub" : "Connect"} <ArrowRight className="size-3.5" />
      </span>
    </Link>
  )
}

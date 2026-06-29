import { BookOpen, GitBranch, PenTool, Rocket } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Documentation - RepoPress",
  description: "Everything you need to get started with RepoPress, the visual editor for GitHub content.",
}

const guides = [
  {
    href: "/docs/getting-started",
    title: "Getting Started",
    description: "Set up RepoPress and connect your first repository.",
    icon: Rocket,
  },
  {
    href: "/docs/how-it-works",
    title: "How It Works",
    description: "See how RepoPress connects to your repository and manages content.",
    icon: BookOpen,
  },
  {
    href: "/docs/connecting-a-repo",
    title: "Connecting a Repository",
    description: "Connect your GitHub repo and choose a content folder to edit.",
    icon: GitBranch,
  },
  {
    href: "/docs/studio-editor",
    title: "Studio Editor",
    description: "Write and publish with the visual editor, live preview, and version history.",
    icon: PenTool,
  },
]

export default function DocsPage() {
  return (
    <div>
      <h1 className="mb-4 text-3xl font-semibold tracking-tight md:text-4xl">Documentation</h1>
      <p className="mb-12 text-lg text-muted-foreground">Everything you need to get started with RepoPress.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {guides.map((guide) => {
          const Icon = guide.icon
          return (
            <Link
              key={guide.href}
              href={guide.href}
              className="group rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mb-1 text-lg font-semibold text-card-foreground">{guide.title}</h2>
              <p className="text-sm text-muted-foreground">{guide.description}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

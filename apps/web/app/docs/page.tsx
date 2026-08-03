import { ArrowRight } from "lucide-react"
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
  },
  {
    href: "/docs/how-it-works",
    title: "How It Works",
    description: "See how RepoPress connects to your repository and manages content.",
  },
  {
    href: "/docs/connecting-a-repo",
    title: "Connecting a Repository",
    description: "Connect your GitHub repo and choose a content folder to edit.",
  },
  {
    href: "/docs/studio-editor",
    title: "Studio Editor",
    description: "Write and publish with the visual editor, live preview, and version history.",
  },
]

export default function DocsPage() {
  return (
    <div>
      <h1 className="rp-display text-4xl md:text-5xl">Documentation</h1>
      <p className="mt-4 mb-12 max-w-[46ch] text-lg leading-8 text-muted-foreground">
        Everything you need to get started with RepoPress.
      </p>

      <div className="border-t border-border">
        {guides.map((guide) => (
          <Link
            key={guide.href}
            href={guide.href}
            className="group flex items-baseline justify-between gap-6 border-b border-border py-5"
          >
            <div>
              <h2 className="rp-display text-lg text-foreground transition-colors group-hover:text-primary">
                {guide.title}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{guide.description}</p>
            </div>
            <ArrowRight className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </div>
  )
}

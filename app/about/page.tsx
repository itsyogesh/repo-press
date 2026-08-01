import { Github, Twitter } from "lucide-react"
import type { Metadata } from "next"
import Footer from "@/components/landing/footer"
import Navbar from "@/components/landing/navbar"

export const metadata: Metadata = {
  title: "About - RepoPress",
  description:
    "RepoPress is a visual editor for content that lives in GitHub. Edit docs and blog posts without touching code.",
}

const techStack = [
  {
    name: "Next.js",
    description: "Modern web framework for fast, reliable pages",
  },
  {
    name: "Convex",
    description: "Real-time backend that keeps your edits in sync",
  },
  {
    name: "GitHub API",
    description: "Reads and writes directly to your repository",
  },
  {
    name: "Tailwind CSS",
    description: "Consistent, polished design across the app",
  },
  {
    name: "shadcn/ui",
    description: "Accessible interface components",
  },
]

const principles = [
  {
    title: "Your content stays in GitHub",
    description:
      "Every edit becomes a real commit in your repository. No proprietary databases, no vendor lock-in. If you stop using RepoPress, your content is exactly where it has always been.",
  },
  {
    title: "Open source, always",
    description:
      "MIT licensed and community-driven. Read the code, fork it, contribute to it. The best tools are built in the open.",
  },
  {
    title: "Built for everyone who writes",
    description:
      "Whether you maintain docs, write blog posts, or manage a content team - RepoPress gives you a visual editor without asking you to learn Git commands.",
  },
  {
    title: "No lock-in, ever",
    description:
      "Your content is standard Markdown and MDX in your repository. There is nothing to export, nothing to migrate. Your files are always yours.",
  },
]

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        {/* Hero */}
        <section className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="rp-display mb-6 text-3xl md:text-5xl">A visual editor for content that lives in GitHub</h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              RepoPress exists because updating a blog post or documentation page shouldn&apos;t require a terminal.
              Your content stays in your repository. We just make it easier to edit.
            </p>
          </div>
        </section>

        {/* Mission */}
        <section className="border-y border-border/40 bg-muted/30">
          <div className="container mx-auto px-4 py-16 md:py-20">
            <div className="max-w-3xl mx-auto">
              <h2 className="rp-display text-xl mb-4">Why we built this</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                If your website runs on GitHub - whether it is a documentation site, a blog, or a marketing page -
                updating content means opening a code editor, writing Markdown, and pushing a commit. That works for
                developers, but it shuts out everyone else on the team.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-6">
                RepoPress is a visual editor that connects directly to your GitHub repository. You see your files, edit
                them in a clean interface with a live preview, and publish changes as a pull request. No terminal, no
                Markdown syntax, no merge conflicts. Your content stays as standard files in your repo - we never move
                it to a separate database.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                The result: writers and content teams can update the site themselves, while developers keep full control
                over the repository and review process.
              </p>
            </div>
          </div>
        </section>

        {/* Principles */}
        <section className="container mx-auto px-4 py-16 md:py-20">
          <div className="max-w-3xl mx-auto">
            <h2 className="rp-display text-xl mb-8">What We Believe</h2>
            <div className="grid gap-8 sm:grid-cols-2">
              {principles.map((principle) => (
                <div key={principle.title}>
                  <h3 className="rp-display mb-2">{principle.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{principle.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tech Stack */}
        <section className="border-y border-border/40 bg-muted/30">
          <div className="container mx-auto px-4 py-16 md:py-20">
            <div className="max-w-3xl mx-auto">
              <h2 className="rp-display text-xl mb-8">Built with</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {techStack.map((tech) => (
                  <div key={tech.name} className="rounded-lg border border-border/60 bg-card p-4">
                    <h3 className="rp-display mb-1">{tech.name}</h3>
                    <p className="text-sm text-muted-foreground">{tech.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Creator */}
        <section className="container mx-auto px-4 py-16 md:py-20">
          <div className="max-w-3xl mx-auto">
            <h2 className="rp-display text-xl mb-4">Created By</h2>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-lg border border-border/60 bg-card p-6">
              <div className="flex-1">
                <h3 className="rp-display text-lg mb-1">@itsyogesh</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Building open-source tools that help teams publish content without learning Git.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <a
                  href="https://twitter.com/itsyogesh18"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Twitter className="h-4 w-4" />
                  Twitter
                </a>
                <a
                  href="https://github.com/itsyogesh"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Github className="h-4 w-4" />
                  GitHub
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Open Source */}
        <section className="border-t border-border/40 bg-muted/30">
          <div className="container mx-auto px-4 py-16 md:py-20">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="rp-display text-xl mb-4">Free and open source</h2>
              <p className="text-muted-foreground leading-relaxed mb-6 max-w-xl mx-auto">
                RepoPress is MIT licensed. Browse the code, report issues, or contribute. RepoPress improves with every
                contribution and bug report.
              </p>
              <a
                href="https://github.com/itsyogesh/repo-press"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Github className="h-4 w-4" />
                View on GitHub
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}

import { Github, Twitter } from "lucide-react"
import type { Metadata } from "next"
import Footer from "@/components/landing/footer"
import Navbar from "@/components/landing/navbar"

export const metadata: Metadata = {
  title: "About — RepoPress",
  description: "Learn about RepoPress, the Git-native headless CMS for GitHub repositories.",
}

const techStack = [
  {
    name: "Next.js",
    description: "React framework for production-grade web apps",
  },
  {
    name: "Convex",
    description: "Reactive backend for real-time operational state",
  },
  {
    name: "GitHub API",
    description: "Direct integration with your repositories",
  },
  {
    name: "Tailwind CSS",
    description: "Utility-first styling with design tokens",
  },
  {
    name: "shadcn/ui",
    description: "Accessible, composable UI components",
  },
]

const principles = [
  {
    title: "Git is the source of truth",
    description:
      "Your content lives in your repository. Every edit is a commit. Every change has history. No proprietary databases, no vendor lock-in.",
  },
  {
    title: "Open source, always",
    description:
      "MIT licensed and community-driven. Read the code, fork it, contribute to it. We believe the best tools are built in the open.",
  },
  {
    title: "Developer experience first",
    description:
      "Built by developers, for developers. We don't compromise on the tools and workflows you already love.",
  },
  {
    title: "No vendor lock-in",
    description:
      "Your content is Markdown and MDX in your repo. If you stop using RepoPress tomorrow, your content is exactly where it's always been.",
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
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground mb-6">
              Built for developers who love Git
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              RepoPress exists because content management shouldn&apos;t require abandoning Git. Your repo <em>is</em>{" "}
              your CMS.
            </p>
          </div>
        </section>

        {/* Mission */}
        <section className="border-y border-border/40 bg-muted/30">
          <div className="container mx-auto px-4 py-16 md:py-20">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-xl font-semibold text-foreground mb-4">Our Mission</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Every developer knows the pain: you want a CMS for your content site, but traditional platforms force
                you into proprietary dashboards, opaque databases, and workflows that feel nothing like the Git-based
                development you love.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-6">
                RepoPress takes a different approach. We built a headless CMS that treats your GitHub repository as the
                single source of truth. Your content stays as Markdown and MDX files in your repo. Every edit creates a
                real Git commit. Branches, pull requests, and code review—they all just work, because your content
                workflow <em>is</em> your development workflow.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                No databases to migrate. No proprietary formats to export. No vendor lock-in. Just your content, in your
                repo, forever.
              </p>
            </div>
          </div>
        </section>

        {/* Principles */}
        <section className="container mx-auto px-4 py-16 md:py-20">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl font-semibold text-foreground mb-8">What We Believe</h2>
            <div className="grid gap-8 sm:grid-cols-2">
              {principles.map((principle) => (
                <div key={principle.title}>
                  <h3 className="font-semibold text-foreground mb-2">{principle.title}</h3>
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
              <h2 className="text-xl font-semibold text-foreground mb-8">Tech Stack</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {techStack.map((tech) => (
                  <div key={tech.name} className="rounded-lg border border-border/60 bg-card p-4">
                    <h3 className="font-semibold text-card-foreground mb-1">{tech.name}</h3>
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
            <h2 className="text-xl font-semibold text-foreground mb-4">Created By</h2>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-lg border border-border/60 bg-card p-6">
              <div className="flex-1">
                <h3 className="font-semibold text-card-foreground text-lg mb-1">@itsyogesh</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Full-stack developer who believes the best content management tools should feel like home for
                  developers—built on Git, open source, and community-driven.
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
              <h2 className="text-xl font-semibold text-foreground mb-4">Open Source &amp; MIT Licensed</h2>
              <p className="text-muted-foreground leading-relaxed mb-6 max-w-xl mx-auto">
                RepoPress is free and open source. Browse the code, report issues, submit pull requests, or fork it and
                make it your own.
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

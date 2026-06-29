import { ArrowRight, GitBranch, Github, Sparkles } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function Hero() {
  return (
    <section className="px-6 pb-16 pt-20">
      <div className="mx-auto max-w-[1120px]">
        {/* Centered text block */}
        <div className="mx-auto flex max-w-[640px] flex-col items-center gap-6 text-center">
          <div className="flex items-center gap-2.5 font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full bg-primary" />
            Visual content editing for GitHub repositories
          </div>

          <h1 className="rp-display max-w-[16ch] text-[clamp(2.5rem,5vw,4rem)]">
            Edit your docs and blog without touching code.
          </h1>

          <p className="max-w-[48ch] text-balance text-base leading-7 text-muted-foreground">
            RepoPress gives you a visual editor for the Markdown and MDX files already in your repository. Edit,
            preview, and publish — changes go back to GitHub as pull requests.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/dashboard">
              <Button size="lg">
                Try the visual editor
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="#how-it-works">
              <Button size="lg" variant="outline">
                See how it works
              </Button>
            </Link>
            <a href="https://github.com/itsyogesh/repo-press" target="_blank" rel="noopener noreferrer">
              <Button size="lg" variant="ghost">
                <Github className="mr-2 h-4 w-4" />
                GitHub
              </Button>
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium text-primary">
              <GitBranch className="h-3.5 w-3.5" />
              Publishes via pull request
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span className="flex items-center gap-1.5">
              <Github className="h-3.5 w-3.5" />
              Works with any GitHub repo
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Live preview as you edit
            </span>
          </div>
        </div>

        {/* Editor mock */}
        <div className="relative mx-auto mt-16 max-w-4xl">
          <div className="absolute inset-x-1/4 top-8 -z-10 h-48 rounded-full bg-primary/8 blur-[72px]" />

          <div className="overflow-hidden rounded-lg border border-border bg-background shadow-[var(--shadow-2)]">
            {/* Top bar */}
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <div className="flex items-center gap-4">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-foreground/25" />
                  <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-foreground/10" />
                </div>
                <div>
                  <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">
                    Active document
                  </p>
                  <p className="text-sm font-medium tracking-[-0.02em] text-foreground">blog/getting-started.mdx</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground">
                  Draft
                </span>
                <span className="rounded-full border border-primary/15 bg-primary/10 px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-primary">
                  Branch / docs-update
                </span>
              </div>
            </div>

            {/* Editor panes */}
            <div className="grid lg:grid-cols-2">
              {/* Code pane — dark */}
              <div className="border-b border-border/30 bg-foreground px-5 py-5 text-background lg:border-b-0 lg:border-r lg:border-r-border/20">
                <p className="mb-4 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-background/50">
                  MDX editor
                </p>
                <div className="space-y-1.5 font-mono text-sm leading-7">
                  <p className="text-background/45">---</p>
                  <p>
                    <span className="text-primary/80">title:</span>{" "}
                    <span className="text-background">"Getting started with your blog"</span>
                  </p>
                  <p>
                    <span className="text-primary/80">status:</span>{" "}
                    <span className="text-background">"draft"</span>
                  </p>
                  <p className="text-background/45">---</p>
                  <p className="pt-3 text-background"># Getting started with your blog</p>
                  <p className="text-background/72">
                    A step-by-step guide to publishing your first post.
                  </p>
                  <div className="mt-4 rounded-md border border-background/10 bg-background/5 p-3 text-xs text-background/75">
                    &lt;Callout variant="note"&gt;Ready to preview&lt;/Callout&gt;
                  </div>
                </div>
              </div>

              {/* Preview pane — light */}
              <div className="bg-background px-5 py-5">
                <div className="mb-4 flex items-center justify-between">
                  <p className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
                    Rendered preview
                  </p>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Component-safe
                  </span>
                </div>
                <h2 className="mb-2 text-xl font-semibold tracking-[-0.03em] text-foreground">
                  Getting started with your blog
                </h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  A step-by-step guide to publishing your first post using the visual editor.
                </p>
                <div className="mt-5 space-y-2">
                  <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                    Auto-detected:{" "}
                    <span className="font-mono text-xs text-foreground">blog/</span>
                  </div>
                  <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                    <GitBranch className="mr-1.5 inline h-3.5 w-3.5 text-primary" />
                    Pull request ready when you publish
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

import { Code2, Cpu, FileText, GitBranch, Github, GitPullRequest, History, Zap } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

const frameworks = ["Next.js", "Astro", "Hugo", "Docusaurus", "Jekyll", "Fumadocs", "Nextra", "Gatsby"]

export default function FeatureGrid() {
  return (
    <section id="features" className="container mx-auto px-4 py-24 space-y-8">
      <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
        <h2 className="text-4xl font-bold tracking-tight sm:text-5xl text-balance">
          Everything you need to manage content
        </h2>
        <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7 text-balance">
          RepoPress transforms your GitHub repository into a powerful headless CMS. Edit MDX blogs, documentation, legal
          files, and more without leaving your browser.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto">
        {/* Large Card: Framework Auto-Detection */}
        <div className="md:col-span-2 md:row-span-2 rounded-3xl bg-gradient-to-br from-primary/5 to-primary/10 border border-border p-8 flex flex-col justify-between overflow-hidden relative group">
          <div className="relative z-10">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
              <Cpu className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-2xl font-semibold mb-2">Framework Auto-Detection</h3>
            <p className="text-muted-foreground max-w-md">
              Connect your repo and we&apos;ll detect your framework automatically. Works with Next.js, Astro, Hugo,
              Docusaurus, Jekyll, Fumadocs, Nextra, and more.
            </p>
          </div>

          {/* Framework badges */}
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {frameworks.map((fw) => (
              <div
                key={fw}
                className="flex items-center justify-center gap-2 rounded-xl bg-background border border-border px-3 py-2.5 text-sm font-medium text-foreground shadow-sm transition-all group-hover:border-primary/30"
              >
                <Zap className="h-3.5 w-3.5 text-primary" />
                {fw}
              </div>
            ))}
          </div>
        </div>

        {/* Card: 100% Open Source */}
        <div className="rounded-3xl bg-zinc-950 text-white p-8 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Github className="h-32 w-32" />
          </div>
          <div>
            <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center mb-6">
              <Code2 className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-xl font-semibold mb-2">100% Open Source</h3>
            <p className="text-zinc-400 text-sm">
              Built by developers, for developers. Host it yourself or deploy on Vercel in seconds.
            </p>
          </div>
          <Button variant="secondary" className="mt-6 w-full rounded-full" asChild>
            <Link href="https://github.com/itsyogesh/repo-press" target="_blank">
              Star on GitHub
            </Link>
          </Button>
        </div>

        {/* Card: Visual MDX Studio */}
        <div className="rounded-3xl bg-muted dark:bg-card border border-border p-8 flex flex-col">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Visual MDX Studio</h3>
          <p className="text-muted-foreground text-sm mb-6">
            Write with a live preview. Edit MDX with frontmatter, custom components, and real-time rendering.
          </p>

          {/* Mock Editor UI */}
          <div className="mt-auto rounded-xl border border-border bg-background shadow-sm p-3">
            <div className="flex items-center gap-1.5 mb-3 border-b border-border pb-2">
              <div className="w-2 h-2 rounded-full bg-red-400/80" />
              <div className="w-2 h-2 rounded-full bg-yellow-400/80" />
              <div className="w-2 h-2 rounded-full bg-green-400/80" />
              <div className="ml-2 text-[10px] text-muted-foreground font-mono">post.mdx</div>
            </div>
            <div className="space-y-2">
              <div className="h-5 w-3/4 bg-muted rounded-md" />
              <div className="h-3 w-full bg-muted/50 rounded-md" />
              <div className="h-3 w-5/6 bg-muted/50 rounded-md" />
              <div className="h-16 w-full bg-primary/5 dark:bg-primary/10 rounded-lg border border-primary/20 flex items-center justify-center">
                <span className="text-[10px] text-primary font-mono">{"<Component />"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card: Draft → Review → Publish */}
        <div className="rounded-3xl bg-muted dark:bg-card border border-border p-8 flex flex-col">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <GitPullRequest className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Draft → Review → Publish</h3>
          <p className="text-muted-foreground text-sm mb-6">
            Full editorial workflow with draft, review, approval, and publish states. Perfect for teams.
          </p>

          {/* Mini Workflow Diagram */}
          <div className="mt-auto flex items-center gap-2">
            <div className="flex-1 rounded-lg bg-background border border-border px-3 py-2 text-center">
              <span className="text-xs font-medium text-muted-foreground">Draft</span>
            </div>
            <span className="text-muted-foreground text-xs">→</span>
            <div className="flex-1 rounded-lg bg-background border border-border px-3 py-2 text-center">
              <span className="text-xs font-medium text-muted-foreground">Review</span>
            </div>
            <span className="text-muted-foreground text-xs">→</span>
            <div className="flex-1 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-center">
              <span className="text-xs font-medium text-primary">Publish</span>
            </div>
          </div>
        </div>

        {/* Card: Version History */}
        <div className="rounded-3xl bg-muted dark:bg-card border border-border p-8 flex flex-col">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <History className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Version History</h3>
          <p className="text-muted-foreground text-sm mb-6">
            Every edit creates a snapshot. Compare versions, revert changes, and never lose content.
          </p>

          {/* Mini Version Timeline */}
          <div className="mt-auto space-y-3 pl-4 border-l-2 border-border">
            <div className="flex items-center gap-2 relative">
              <div className="absolute -left-[21px] w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-background" />
              <span className="text-xs font-medium text-foreground">Current version</span>
              <span className="text-[10px] text-muted-foreground ml-auto">2m ago</span>
            </div>
            <div className="flex items-center gap-2 relative">
              <div className="absolute -left-[21px] w-2.5 h-2.5 rounded-full bg-muted-foreground/30 ring-2 ring-background" />
              <span className="text-xs text-muted-foreground">Updated heading</span>
              <span className="text-[10px] text-muted-foreground ml-auto">1h ago</span>
            </div>
            <div className="flex items-center gap-2 relative">
              <div className="absolute -left-[21px] w-2.5 h-2.5 rounded-full bg-muted-foreground/30 ring-2 ring-background" />
              <span className="text-xs text-muted-foreground">Initial draft</span>
              <span className="text-[10px] text-muted-foreground ml-auto">3h ago</span>
            </div>
          </div>
        </div>

        {/* Card: Git Native Workflow */}
        <div className="rounded-3xl bg-muted dark:bg-card border border-border p-8 flex flex-col">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <GitBranch className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Git Native Workflow</h3>
          <p className="text-muted-foreground text-sm mb-6">
            Content lives in your repo. Every save is a Git commit. No vendor lock-in, ever.
          </p>

          {/* Mini Git Log */}
          <div className="mt-auto rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mb-3">
              <GitBranch className="h-3.5 w-3.5" />
              <span>main</span>
            </div>
            <div className="pl-2 border-l-2 border-border ml-1.5 space-y-3 py-1">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-foreground font-medium truncate">feat: update pricing page</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-foreground font-medium truncate">docs: add install guide</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

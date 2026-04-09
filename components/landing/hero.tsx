import { ArrowRight, FolderTree, GitBranch, Github, Sparkles } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

const signalCards = [
  {
    title: "Framework-aware from minute one",
    description: "Detects docs, blogs, MDX routes, and content roots without a setup maze.",
  },
  {
    title: "Preview what actually ships",
    description: "Work in split view with rendered components, frontmatter, and media in context.",
  },
  {
    title: "Keep Git in the driver seat",
    description: "Draft, review, and publish through repo-native flows instead of a detached admin UI.",
  },
]

const timeline = [
  {
    label: "Scan",
    detail: "Detected docs root, MDX routes, and image-heavy collections.",
    state: "Ready",
  },
  {
    label: "Preview",
    detail: "Rendered interactive components before opening a publish lane.",
    state: "Live",
  },
  {
    label: "Publish",
    detail: "Prepared a clean PR lane with the updated document and assets.",
    state: "Prepared",
  },
]

export default function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-10 sm:pb-24 lg:pb-28">
      <div className="bg-grid-small-black dark:bg-grid-small-white absolute inset-x-0 top-0 -z-20 h-[34rem] opacity-50" />
      <div className="absolute inset-x-0 top-0 -z-10 h-[28rem] bg-gradient-to-b from-accent/40 via-background/80 to-background" />

      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3 font-mono text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
              Product-grade Git-native publishing
            </div>

            <h1 className="max-w-[12ch] text-5xl font-semibold tracking-[-0.06em] text-balance text-foreground sm:text-6xl lg:text-7xl">
              Your repository already knows how content should ship.
            </h1>

            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              RepoPress turns markdown, MDX, docs, and blogs into a calm visual studio with live preview, publish lanes,
              and framework-aware setup—without moving the source of truth out of Git.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/dashboard">
              <Button size="lg" className="h-12 rounded-xl px-6">
                Open studio
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/docs">
              <Button size="lg" variant="outline" className="h-12 rounded-xl px-6">
                Read docs
              </Button>
            </Link>
            <a href="https://github.com/itsyogesh/repo-press" target="_blank" rel="noopener noreferrer">
              <Button size="lg" variant="ghost" className="h-12 rounded-xl px-4">
                <Github className="mr-2 h-4 w-4" />
                GitHub
              </Button>
            </a>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {signalCards.map((card) => (
              <div key={card.title} className="surface-card rounded-2xl border p-4">
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-muted-foreground">Signal</p>
                <h2 className="mt-3 text-sm font-semibold tracking-[-0.02em] text-foreground">{card.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-x-8 top-10 -z-10 h-40 rounded-full bg-primary/12 blur-3xl" />

          <div className="surface-card overflow-hidden rounded-[1.75rem] border">
            <div className="flex flex-col gap-4 border-b border-border/70 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-foreground/25" />
                  <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-foreground/10" />
                </div>
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
                    Active document
                  </p>
                  <p className="text-sm font-medium tracking-[-0.02em] text-foreground">content/docs/intro.mdx</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                  Draft
                </span>
                <span className="rounded-full border border-primary/15 bg-primary/10 px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-primary">
                  Lane / docs-main
                </span>
              </div>
            </div>

            <div className="grid lg:grid-cols-[0.94fr_1.06fr]">
              <div className="border-b border-background/10 bg-foreground px-6 py-6 text-background lg:border-b-0 lg:border-r lg:border-r-background/10">
                <div className="mb-5 flex items-center justify-between">
                  <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-background/55">
                    MDX editor
                  </span>
                  <span className="rounded-full border border-background/10 px-2.5 py-1 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-background/70">
                    live
                  </span>
                </div>

                <div className="space-y-2 font-mono text-sm leading-7">
                  <p className="text-background/45">---</p>
                  <p>
                    <span className="text-primary">title:</span>{" "}
                    <span className="text-background">"Ship docs like product"</span>
                  </p>
                  <p>
                    <span className="text-primary">status:</span> <span className="text-background">"draft"</span>
                  </p>
                  <p>
                    <span className="text-primary">lane:</span> <span className="text-background">"docs-main"</span>
                  </p>
                  <p className="text-background/45">---</p>
                  <p className="pt-3 text-background"># Visual editing without losing the repo</p>
                  <p className="text-background/72">
                    Preview components, manage frontmatter, and keep content changes attached to Git history.
                  </p>
                  <div className="mt-4 rounded-2xl border border-background/10 bg-background/5 p-4 text-background/78">
                    &lt;Callout variant="note"&gt;Ready for preview and publish&lt;/Callout&gt;
                  </div>
                </div>
              </div>

              <div className="bg-background px-6 py-6">
                <div className="mb-5 flex items-center justify-between">
                  <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                    Rendered preview
                  </span>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Component-safe
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-3">
                    <h2 className="max-w-[16ch] text-3xl font-semibold tracking-[-0.04em] text-foreground">
                      Visual editing without losing the repo
                    </h2>
                    <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                      Draft in split view, validate components before merge, and keep editorial flow attached to the
                      same repository your team already ships from.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border/70 bg-muted/40 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <FolderTree className="h-4 w-4 text-primary" />
                        Auto-detected content root
                      </div>
                      <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        apps/docs/content/docs
                      </p>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-muted/40 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <GitBranch className="h-4 w-4 text-primary" />
                        Publish lane ready
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Create or update a PR without leaving the studio.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="surface-card relative -mt-6 ml-auto w-full max-w-md rounded-[1.5rem] border p-4 sm:-mt-8 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                  Ops timeline
                </p>
                <h2 className="text-base font-semibold tracking-[-0.02em] text-foreground">
                  From repo scan to publish lane
                </h2>
              </div>
              <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-muted-foreground">
                live
              </span>
            </div>

            <div className="space-y-4">
              {timeline.map((item) => (
                <div key={item.label} className="flex gap-3">
                  <div className="flex flex-col items-center pt-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                    <span className="mt-2 h-full w-px bg-border/70" />
                  </div>
                  <div className="pb-2 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                        {item.label}
                      </span>
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[0.65rem] font-medium text-primary">
                        {item.state}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

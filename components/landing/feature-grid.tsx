import { ArrowUpRight, FileText, FolderTree, GitBranch, Layers3, PanelTopOpen, Sparkles } from "lucide-react"

const frameworks = ["Next.js", "Astro", "Fumadocs", "Nextra", "Docusaurus", "Hugo"]

const studioSignals = [
  "Side-by-side editing with live preview",
  "Title, metadata, and images managed in one place",
  "Search and navigate your content with keyboard shortcuts",
]

const historyMoments = [
  { label: "Current", detail: "Updated the getting started guide", time: "2m ago" },
  { label: "Review", detail: "Editor approved content changes", time: "48m ago" },
  { label: "Original", detail: "First version imported from repo", time: "Today" },
]

export default function FeatureGrid() {
  return (
    <section id="features" className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <p className="font-mono text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">What you get</p>
          <h2 className="text-4xl font-semibold tracking-[-0.05em] text-balance text-foreground sm:text-5xl">
            Everything you need to edit content. Nothing you don't.
          </h2>
          <p className="text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            A focused workspace for writing, previewing, and publishing — without the complexity of a traditional CMS.
          </p>
        </div>

        <div className="mt-14 grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
          <div className="surface-card rounded-[2rem] border p-8 sm:p-10">
            <div className="flex flex-col gap-4">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border/70 bg-background/75 px-3 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-muted-foreground">
                <PanelTopOpen className="h-3.5 w-3.5 text-primary" />
                Studio editor
              </div>
              <h3 className="max-w-[14ch] text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
                One workspace for everything.
              </h3>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
                Edit your content, preview the result, check version history, and publish — all in one screen. No
                hunting through menus or switching between tools.
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {studioSignals.map((signal) => (
                <div
                  key={signal}
                  className="rounded-2xl border border-border/70 bg-muted/35 p-4 text-sm leading-6 text-muted-foreground"
                >
                  {signal}
                </div>
              ))}
            </div>

            <div className="mt-8 overflow-hidden rounded-[1.5rem] border border-border/70 bg-background">
              <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                    Studio snapshot
                  </p>
                  <p className="text-sm font-semibold tracking-[-0.02em] text-foreground">docs/getting-started.mdx</p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-primary">
                  Preview synced
                </span>
              </div>

              <div className="grid gap-0 lg:grid-cols-[0.88fr_1.12fr]">
                <div className="border-b border-border/70 bg-muted/35 px-5 py-5 lg:border-b-0 lg:border-r">
                  <div className="space-y-3">
                    <div className="h-4 w-40 rounded-full bg-muted" />
                    <div className="h-10 rounded-2xl border border-border/70 bg-background" />
                    <div className="h-24 rounded-2xl border border-border/70 bg-background" />
                    <div className="h-16 rounded-2xl border border-primary/15 bg-primary/8" />
                  </div>
                </div>

                <div className="px-5 py-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border/70 bg-muted/35 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <FileText className="h-4 w-4 text-primary" />
                        Rich content editing
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Edit formatted text, images, and interactive components in one place.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-muted/35 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <GitBranch className="h-4 w-4 text-primary" />
                        Pull requests
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Publish your changes as a pull request when you're ready.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6">
            <div className="surface-card rounded-[1.75rem] border p-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FolderTree className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                    Auto-setup
                  </p>
                  <h3 className="text-xl font-semibold tracking-[-0.03em] text-foreground">
                    Connects to your repo in seconds
                  </h3>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                RepoPress scans your repository and figures out how your content is organized. No configuration files
                to write, no setup wizard to click through.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {frameworks.map((framework) => (
                  <span
                    key={framework}
                    className="rounded-full border border-border/70 bg-background px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-muted-foreground"
                  >
                    {framework}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-foreground/10 bg-foreground px-6 py-7 text-background">
              <div className="flex items-center gap-3">
                <span className="inline-flex size-11 items-center justify-center rounded-xl border border-background/10 bg-background/5 text-background">
                  <Layers3 className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-background/60">Your content</p>
                  <h3 className="text-xl font-semibold tracking-[-0.03em]">Content stays in GitHub</h3>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-background/72">
                No separate database, no vendor lock-in. RepoPress reads from and writes to your repository. If you
                stop using it, your content is exactly where you left it.
              </p>
              <div className="mt-6 inline-flex items-center gap-2 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-background/68">
                Open source and self-hostable
                <ArrowUpRight className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.82fr_1.02fr_0.86fr]">
          <div className="surface-card rounded-[1.75rem] border p-6">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold tracking-[-0.03em] text-foreground">See your actual page</h3>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Preview how your content will look on your site. Images, formatting, and components render in real time
              as you type.
            </p>
          </div>

          <div className="surface-card rounded-[1.75rem] border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">History</p>
                <h3 className="text-lg font-semibold tracking-[-0.03em] text-foreground">Full version history</h3>
              </div>
              <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-muted-foreground">
                Snapshot aware
              </span>
            </div>
            <div className="mt-5 space-y-4 border-l border-border/70 pl-4">
              {historyMoments.map((moment) => (
                <div key={moment.label} className="relative">
                  <span className="absolute -left-[1.15rem] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium tracking-[-0.01em] text-foreground">{moment.label}</span>
                    <span className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-muted-foreground">
                      {moment.time}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{moment.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="surface-card rounded-[1.75rem] border p-6">
            <div className="flex items-center gap-3">
              <GitBranch className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold tracking-[-0.03em] text-foreground">Built-in review workflow</h3>
            </div>
            <div className="mt-5 space-y-3 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
              <div className="rounded-2xl border border-border/70 bg-background px-4 py-3">draft → ready for review</div>
              <div className="rounded-2xl border border-border/70 bg-background px-4 py-3">
                review → approved
              </div>
              <div className="rounded-2xl border border-primary/15 bg-primary/10 px-4 py-3 text-primary">
                approved → published via pull request
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

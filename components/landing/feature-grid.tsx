import { ArrowUpRight, FileText, FolderTree, GitBranch, Layers3, PanelTopOpen, Sparkles } from "lucide-react"

const frameworks = ["Next.js", "Astro", "Fumadocs", "Nextra", "Docusaurus", "Hugo"]

const studioSignals = [
  "Split-view editing with preview",
  "Frontmatter, media, and history in one shell",
  "Command palette that feels like a real operator surface",
]

const historyMoments = [
  { label: "Current", detail: "Updated component callout copy", time: "2m ago" },
  { label: "Review", detail: "Editor approved docs lane changes", time: "48m ago" },
  { label: "Origin", detail: "Imported framework-aware content root", time: "Today" },
]

export default function FeatureGrid() {
  return (
    <section id="features" className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <p className="font-mono text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">Studio power</p>
          <h2 className="text-4xl font-semibold tracking-[-0.05em] text-balance text-foreground sm:text-5xl">
            A product surface, not a pile of admin cards.
          </h2>
          <p className="text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            RepoPress is designed to feel closer to a workspace than a CMS: stronger hierarchy, calmer controls, and
            Git-native flows that make sense to developers and content teams.
          </p>
        </div>

        <div className="mt-14 grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
          <div className="surface-card rounded-[2rem] border p-8 sm:p-10">
            <div className="flex flex-col gap-4">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border/70 bg-background/75 px-3 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-muted-foreground">
                <PanelTopOpen className="h-3.5 w-3.5 text-primary" />
                Studio shell
              </div>
              <h3 className="max-w-[14ch] text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
                One editing shell for content, preview, and publishing.
              </h3>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
                Instead of bouncing between markdown fields, media tabs, and hidden publish dialogs, the studio keeps
                editing, preview, history, and Git actions legible in one place.
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
                        MDX + components
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Render real components and keep authoring context intact while editing.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-muted/35 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <GitBranch className="h-4 w-4 text-primary" />
                        Publish lanes
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Draft into PR-ready changes without losing the repo story.
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
                    Framework-aware
                  </p>
                  <h3 className="text-xl font-semibold tracking-[-0.03em] text-foreground">
                    Auto-detection as onboarding
                  </h3>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                The first impression matters. RepoPress starts by understanding how the repo is already organized
                instead of forcing the user into a generic setup wizard.
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
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-background/60">Open format</p>
                  <h3 className="text-xl font-semibold tracking-[-0.03em]">Git-native by default</h3>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-background/72">
                Content stays in the repo, which means no hidden content silo, no forced migration, and a cleaner mental
                model for engineering teams.
              </p>
              <div className="mt-6 inline-flex items-center gap-2 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-background/68">
                Self-hosted friendly
                <ArrowUpRight className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.82fr_1.02fr_0.86fr]">
          <div className="surface-card rounded-[1.75rem] border p-6">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold tracking-[-0.03em] text-foreground">Preview real surfaces</h3>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              RepoPress is built around the high-value moments competitors often flatten: previews, media, publish
              actions, and content movement across the repo.
            </p>
          </div>

          <div className="surface-card rounded-[1.75rem] border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">History</p>
                <h3 className="text-lg font-semibold tracking-[-0.03em] text-foreground">A calmer version trail</h3>
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
              <h3 className="text-lg font-semibold tracking-[-0.03em] text-foreground">Git workflow stays legible</h3>
            </div>
            <div className="mt-5 space-y-3 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
              <div className="rounded-2xl border border-border/70 bg-background px-4 py-3">draft → docs-main</div>
              <div className="rounded-2xl border border-border/70 bg-background px-4 py-3">
                review → editor approved
              </div>
              <div className="rounded-2xl border border-primary/15 bg-primary/10 px-4 py-3 text-primary">
                publish → PR lane ready
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

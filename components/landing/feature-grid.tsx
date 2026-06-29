import { GitBranch, Layers3, PanelTopOpen, Sparkles } from "lucide-react"

const frameworks = ["Next.js", "Astro", "Fumadocs", "Nextra", "Docusaurus", "Hugo"]

const historyMoments = [
  { label: "Current", detail: "Updated the getting started guide", time: "2m ago" },
  { label: "Review", detail: "Editor approved content changes", time: "48m ago" },
  { label: "Original", detail: "First version imported from repo", time: "Today" },
]

const features = [
  {
    icon: PanelTopOpen,
    tag: "Studio editor",
    title: "One workspace for everything.",
    description:
      "Edit your content, preview the result, check version history, and publish — all in one screen. No hunting through menus or switching between tools.",
  },
  {
    icon: Layers3,
    tag: "Your content",
    title: "Content stays in GitHub.",
    description:
      "No separate database, no vendor lock-in. RepoPress reads from and writes to your repository. If you stop using it, your content is exactly where you left it.",
    inverse: true,
  },
  {
    icon: Sparkles,
    tag: "Preview",
    title: "See your actual page.",
    description:
      "Preview how your content will look on your site. Images, formatting, and components render in real time as you type.",
  },
  {
    icon: GitBranch,
    tag: "Workflow",
    title: "Built-in review workflow.",
    description:
      "Draft, review, approve, and publish — every step tracked. Your team reviews changes before anything goes live.",
  },
]

export default function FeatureGrid() {
  return (
    <section id="features" className="border-t border-border px-6 py-24">
      <div className="mx-auto max-w-[1120px]">
        {/* Heading */}
        <div className="mb-16">
          <p className="rp-overline mb-4">What you get</p>
          <h2 className="rp-display max-w-[24ch] text-[clamp(1.75rem,4vw,2.5rem)] text-balance">
            Everything you need to edit content. Nothing you don't.
          </h2>
        </div>

        {/* Main feature row: studio + auto-setup */}
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Studio — primary */}
          <div className="rounded-lg border border-border bg-background p-8">
            <div className="mb-6 flex items-center gap-2">
              <PanelTopOpen className="h-4 w-4 text-primary" />
              <p className="rp-overline">Studio editor</p>
            </div>
            <h3 className="rp-display text-[1.75rem] text-balance">One workspace for everything.</h3>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              Edit your content, preview the result, check version history, and publish — all in one screen. No hunting
              through menus or switching between tools.
            </p>
            <div className="mt-8 divide-y divide-border">
              {["Side-by-side editing with live preview", "Title, metadata, and images in one place", "Find any file fast with keyboard shortcuts"].map(
                (signal) => (
                  <p key={signal} className="py-3 text-sm text-muted-foreground">
                    {signal}
                  </p>
                ),
              )}
            </div>
          </div>

          <div className="flex flex-col gap-6">
            {/* Auto-setup */}
            <div className="rounded-lg border border-border bg-background p-6">
              <p className="rp-overline mb-3">Auto-setup</p>
              <h3 className="text-lg font-medium tracking-[-0.02em] text-foreground">Connects to your repo in seconds.</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                RepoPress scans your repository and figures out how your content is organized. No configuration files to
                write, no setup wizard.
              </p>
              <div className="mt-5 flex flex-wrap gap-1.5">
                {frameworks.map((framework) => (
                  <span
                    key={framework}
                    className="rounded-full border border-border px-3 py-1 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-muted-foreground"
                  >
                    {framework}
                  </span>
                ))}
              </div>
            </div>

            {/* Content in GitHub — inverse */}
            <div className="rounded-lg border border-foreground/10 bg-foreground p-6 text-background">
              <p className="mb-3 font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-background/55">
                Your content
              </p>
              <h3 className="text-lg font-medium tracking-[-0.02em]">Content stays in GitHub.</h3>
              <p className="mt-3 text-sm leading-6 text-background/72">
                No separate database, no vendor lock-in. RepoPress reads from and writes to your repository. Open source
                and self-hostable.
              </p>
            </div>
          </div>
        </div>

        {/* Secondary features: preview + history + workflow */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* Live preview */}
          <div className="rounded-lg border border-border bg-background p-6">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="rp-overline">Preview</p>
            </div>
            <h3 className="text-lg font-medium tracking-[-0.02em] text-foreground">See your actual page.</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Images, formatting, and components render in real time as you type.
            </p>
          </div>

          {/* Version history */}
          <div className="rounded-lg border border-border bg-background p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="rp-overline">History</p>
              </div>
              <span className="rounded-full border border-border px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground">
                Snapshot aware
              </span>
            </div>
            <h3 className="mb-4 text-lg font-medium tracking-[-0.02em] text-foreground">Full version history.</h3>
            <div className="space-y-4 border-l border-border pl-4">
              {historyMoments.map((moment) => (
                <div key={moment.label} className="relative">
                  <span className="absolute -left-[1.15rem] top-1.5 h-2 w-2 rounded-full bg-primary" />
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{moment.label}</span>
                    <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground">
                      {moment.time}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{moment.detail}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Review workflow */}
          <div className="rounded-lg border border-border bg-background p-6">
            <div className="mb-4 flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" />
              <p className="rp-overline">Workflow</p>
            </div>
            <h3 className="mb-5 text-lg font-medium tracking-[-0.02em] text-foreground">Built-in review workflow.</h3>
            <div className="divide-y divide-border font-mono text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
              <p className="py-2.5">draft → ready for review</p>
              <p className="py-2.5">review → approved</p>
              <p className="py-2.5 text-primary">approved → published via pull request</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

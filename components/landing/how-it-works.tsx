import { ArrowRight, FileEdit, FolderGit2, Github, Sparkles } from "lucide-react"

const steps = [
  {
    icon: Github,
    eyebrow: "01 / Connect",
    title: "Sign in with GitHub and pick a repo.",
    description: "Sign in with your GitHub account and select the repository where your content lives.",
    detail: "No imports, no migration, no separate database to maintain.",
  },
  {
    icon: FolderGit2,
    eyebrow: "02 / Detect",
    title: "RepoPress finds your content automatically.",
    description:
      "We scan your repository, detect the framework, and locate your docs and blog posts — no configuration needed.",
    detail: "Supports Fumadocs, Nextra, Astro, Hugo, Docusaurus, Jekyll, and more.",
  },
  {
    icon: FileEdit,
    eyebrow: "03 / Edit",
    title: "Write and preview in a visual editor.",
    description:
      "Edit your content with a side-by-side preview. Update titles, images, and metadata without touching code.",
    detail: "Feels like a writing app, not a developer tool.",
  },
  {
    icon: Sparkles,
    eyebrow: "04 / Publish",
    title: "Publish your changes as a pull request.",
    description:
      "When you're ready, create a pull request with your changes. Your team can review before anything goes live.",
    detail: "Every change is tracked in your repository's history.",
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <p className="font-mono text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">How it works</p>
          <h2 className="text-4xl font-semibold tracking-[-0.05em] text-balance text-foreground sm:text-5xl">
            From GitHub login to published content in four steps.
          </h2>
          <p className="text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            No setup wizard, no config files. Connect your repo and start editing in under a minute.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {steps.map((step) => {
            const Icon = step.icon
            return (
              <div key={step.eyebrow} className="surface-card flex flex-col rounded-[1.75rem] border p-6">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-muted-foreground">
                    {step.eyebrow}
                  </span>
                  <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                </div>

                <h3 className="mt-8 text-xl font-semibold tracking-[-0.03em] text-foreground">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{step.description}</p>
                <p className="mt-6 text-sm leading-6 text-muted-foreground/90">{step.detail}</p>
              </div>
            )
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-muted/35 px-4 py-3 text-sm text-muted-foreground">
          <span className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-foreground">Connect</span>
          <ArrowRight className="h-4 w-4" />
          <span className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-foreground">Detect</span>
          <ArrowRight className="h-4 w-4" />
          <span className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-foreground">Edit</span>
          <ArrowRight className="h-4 w-4" />
          <span className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-foreground">Publish</span>
          <span className="ml-auto hidden font-mono text-[0.68rem] uppercase tracking-[0.2em] text-muted-foreground lg:inline">
            Your content stays in your repo
          </span>
        </div>
      </div>
    </section>
  )
}

import { ArrowRight, FileEdit, FolderGit2, Github, Sparkles } from "lucide-react"

const steps = [
  {
    icon: Github,
    eyebrow: "01 / Connect",
    title: "Point RepoPress at the repository you already trust.",
    description: "Sign in with GitHub and choose the repo that already stores your docs, blog, or product content.",
    detail: "No export step, no content migration, no separate editorial database.",
  },
  {
    icon: FolderGit2,
    eyebrow: "02 / Detect",
    title: "Map the content system automatically.",
    description:
      "We scan the repo structure, infer the framework, and surface likely content roots and collection shapes.",
    detail: "Works especially well for MDX-first docs and content-heavy repos.",
  },
  {
    icon: FileEdit,
    eyebrow: "03 / Edit",
    title: "Move through content in a visual studio shell.",
    description:
      "Write in split view, preview real components, manage frontmatter, and keep media and history close by.",
    detail: "Feels closer to a workspace than a generic CMS dashboard.",
  },
  {
    icon: Sparkles,
    eyebrow: "04 / Ship",
    title: "Publish through Git instead of around it.",
    description:
      "Draft, review, approve, and open publish lanes that keep the repo history legible for the rest of the team.",
    detail: "RepoPress augments the workflow your codebase already depends on.",
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <p className="font-mono text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">Workflow</p>
          <h2 className="text-4xl font-semibold tracking-[-0.05em] text-balance text-foreground sm:text-5xl">
            A content workflow that respects Git at every step.
          </h2>
          <p className="text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            RepoPress is opinionated about one thing: the repo remains the operating model. The UI exists to make that
            model faster, clearer, and calmer to work inside.
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
          <span className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-foreground">Ship</span>
          <span className="ml-auto hidden font-mono text-[0.68rem] uppercase tracking-[0.2em] text-muted-foreground lg:inline">
            Repository remains source of truth
          </span>
        </div>
      </div>
    </section>
  )
}

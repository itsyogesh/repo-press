import { GitMerge } from "lucide-react"

const steps = [
  {
    num: "01",
    ref: "connect",
    title: "Sign in with GitHub and pick a repo.",
    description: "Sign in with your GitHub account and select the repository where your content lives.",
    detail: "No imports, no migration, no separate database to maintain.",
  },
  {
    num: "02",
    ref: "detect",
    title: "RepoPress finds your content automatically.",
    description:
      "We scan your repository, detect the framework, and locate your docs and blog posts — no configuration needed.",
    detail: "Supports Fumadocs, Nextra, Astro, Hugo, Docusaurus, Jekyll, and more.",
  },
  {
    num: "03",
    ref: "edit",
    title: "Write and preview in a visual editor.",
    description:
      "Edit your content with a side-by-side preview. Update titles, images, and metadata without touching code.",
    detail: "Feels like a writing app, not a developer tool.",
  },
  {
    num: "04",
    ref: "publish",
    title: "Publish your changes as a pull request.",
    description:
      "When you're ready, open a pull request with your changes. Your team can review before anything goes live.",
    detail: "Every change is tracked in your repository's history.",
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-border px-6 py-28">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-16 max-w-[26ch]">
          <h2 className="rp-display text-[clamp(2rem,4.5vw,3rem)] text-balance">
            Every edit becomes a commit on its way to main.
          </h2>
          <p className="mt-5 max-w-[46ch] text-lg leading-8 text-muted-foreground">
            Four steps from GitHub login to published content — and the whole path is tracked in your repository's
            history.
          </p>
        </div>

        {/* Git-graph rail — each step is a commit node on a Signal-Slate branch line that merges into main. */}
        <ol className="mx-auto max-w-[52rem]">
          {steps.map((step, index) => (
            <li key={step.num} className="grid grid-cols-[2.25rem_1fr] gap-x-5 sm:grid-cols-[2.5rem_1fr] sm:gap-x-8">
              {/* rail */}
              <div className="flex flex-col items-center">
                <span className="z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 font-mono text-xs font-medium text-primary">
                  {step.num}
                </span>
                <span aria-hidden className="w-px flex-1 bg-gradient-to-b from-primary/40 to-primary/15" />
              </div>
              {/* content */}
              <div className="pb-12">
                <span className="font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-primary">{step.ref}</span>
                <h3 className="mt-2 rp-display text-xl">{step.title}</h3>
                <p className="mt-2 max-w-[52ch] text-base leading-7 text-muted-foreground">{step.description}</p>
                <p className="mt-3 border-l border-border pl-4 text-sm leading-6 text-muted-foreground/80">
                  {step.detail}
                </p>
              </div>
            </li>
          ))}

          {/* merge into main */}
          <li className="grid grid-cols-[2.25rem_1fr] gap-x-5 sm:grid-cols-[2.5rem_1fr] sm:gap-x-8">
            <div className="flex flex-col items-center">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <GitMerge className="h-4 w-4" />
              </span>
            </div>
            <div className="flex items-center">
              <p className="font-mono text-sm text-foreground">
                merged into <span className="text-primary">main</span> — your content is live.
              </p>
            </div>
          </li>
        </ol>
      </div>
    </section>
  )
}

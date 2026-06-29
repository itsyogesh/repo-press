const steps = [
  {
    num: "01",
    eyebrow: "Connect",
    title: "Sign in with GitHub and pick a repo.",
    description: "Sign in with your GitHub account and select the repository where your content lives.",
    detail: "No imports, no migration, no separate database to maintain.",
  },
  {
    num: "02",
    eyebrow: "Detect",
    title: "RepoPress finds your content automatically.",
    description:
      "We scan your repository, detect the framework, and locate your docs and blog posts — no configuration needed.",
    detail: "Supports Fumadocs, Nextra, Astro, Hugo, Docusaurus, Jekyll, and more.",
  },
  {
    num: "03",
    eyebrow: "Edit",
    title: "Write and preview in a visual editor.",
    description:
      "Edit your content with a side-by-side preview. Update titles, images, and metadata without touching code.",
    detail: "Feels like a writing app, not a developer tool.",
  },
  {
    num: "04",
    eyebrow: "Publish",
    title: "Publish your changes as a pull request.",
    description:
      "When you're ready, create a pull request with your changes. Your team can review before anything goes live.",
    detail: "Every change is tracked in your repository's history.",
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-border px-6 py-24">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-16">
          <p className="rp-overline mb-4">How it works</p>
          <h2 className="rp-display max-w-[22ch] text-[clamp(1.75rem,4vw,2.5rem)] text-balance">
            From GitHub login to published content in four steps.
          </h2>
        </div>

        <div className="divide-y divide-border">
          {steps.map((step) => (
            <div key={step.num} className="grid py-8 md:grid-cols-[4rem_1fr_1fr] md:gap-12">
              <div className="mb-4 font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-muted-foreground md:mb-0 md:pt-0.5">
                {step.num}
              </div>
              <div>
                <p className="rp-overline mb-2">{step.eyebrow}</p>
                <h3 className="text-lg font-medium tracking-[-0.02em] text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground md:mt-0">{step.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

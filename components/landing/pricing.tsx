import { Check, Sparkles } from "lucide-react"

const features = [
  "Unlimited repositories",
  "Framework auto-detection",
  "Visual MDX Studio editor",
  "Document workflows",
  "Version history & revert",
  "Webhook integrations",
  "Multi-project dashboard",
  "GitHub OAuth authentication",
]

export default function Pricing() {
  return (
    <section id="pricing" className="container mx-auto px-4 py-24">
      <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center mb-16">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
          <Sparkles className="h-4 w-4" />
          Early Access
        </div>
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Free. Open Source. Always.</h2>
        <p className="max-w-[85%] text-muted-foreground sm:text-lg text-balance">
          RepoPress is free during early access and will always remain open source under the MIT license.
        </p>
      </div>

      <div className="mx-auto max-w-md">
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <div className="text-5xl font-bold tracking-tight mb-2">$0</div>
          <p className="text-muted-foreground mb-8">Free forever for open source</p>
          <ul className="space-y-3 text-left mb-8">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-sm">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <span className="text-foreground">{feature}</span>
              </li>
            ))}
          </ul>
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-full bg-primary px-8 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors w-full"
          >
            Get started for free
          </a>
        </div>
      </div>
    </section>
  )
}

import { ArrowRight, GitBranch, PanelTopOpen, Sparkles } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

const ctaFeatures = [
  {
    icon: PanelTopOpen,
    title: "Visual editor, zero setup",
    description: "Edit content with a live preview. No config files, no build steps, no terminal commands.",
  },
  {
    icon: GitBranch,
    title: "Changes go through GitHub",
    description: "Every edit becomes a pull request. Your team reviews before anything goes live.",
  },
  {
    icon: Sparkles,
    title: "Free and open source",
    description: "MIT licensed, no vendor lock-in. Self-host or use the hosted version.",
  },
]

export default function CTA() {
  return (
    <section className="border-t border-border bg-foreground px-6 py-20 text-background">
      <div className="mx-auto max-w-[1120px]">
        <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <h2 className="rp-display max-w-[18ch] text-[clamp(2rem,4vw,3rem)]">
              Your content is in GitHub. Start editing it visually.
            </h2>
            <p className="mt-4 max-w-[52ch] text-base leading-7 text-background/72">
              Connect your repository and start writing in a visual editor. Changes publish as pull requests. Your
              content never leaves GitHub.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button size="lg" variant="secondary" asChild>
              <Link href="/dashboard">
                Try the visual editor
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-background/15 bg-background/5 text-background hover:bg-background/10 hover:text-background"
              asChild
            >
              <a href="https://docs.repopress.org" target="_blank" rel="noopener noreferrer">
                Read the docs
              </a>
            </Button>
          </div>
        </div>

        <div className="mt-14 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-background/15 pt-8 font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-background/55">
          {ctaFeatures.map((f) => {
            const Icon = f.icon
            return (
              <span key={f.title} className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-primary" />
                {f.title}
              </span>
            )
          })}
        </div>
      </div>
    </section>
  )
}

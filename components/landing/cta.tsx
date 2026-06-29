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
            <p className="rp-overline mb-4 text-background/55">Get started</p>
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
              <Link href="/docs">Read the docs</Link>
            </Button>
          </div>
        </div>

        <div className="mt-16 grid border-t border-background/15 md:grid-cols-3 md:divide-x md:divide-background/15">
          {ctaFeatures.map((f, i) => {
            const Icon = f.icon
            return (
              <div
                key={f.title}
                className="border-b border-background/15 px-6 py-6 last:border-b-0 md:border-b-0 md:first:pl-0"
              >
                <Icon className="mb-4 h-5 w-5 text-background/60" />
                <h3 className="text-base font-medium tracking-[-0.01em]">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-background/68">{f.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

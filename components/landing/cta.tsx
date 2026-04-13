import { ArrowRight, GitBranch, PanelTopOpen, Sparkles } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function CTA() {
  return (
    <section className="px-4 py-24">
      <div className="mx-auto max-w-6xl rounded-[2rem] border border-foreground/10 bg-foreground px-6 py-10 text-background sm:px-8 sm:py-12">
        <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-background/60">Get started</p>
            <h2 className="mt-4 max-w-[18ch] text-4xl font-semibold tracking-[-0.05em] text-balance sm:text-5xl">
              Your content is in GitHub. Start editing it visually.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-background/72 sm:text-lg sm:leading-8">
              Connect your repository and start writing in a visual editor. Changes publish as pull requests. Your
              content never leaves GitHub.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Button size="lg" variant="secondary" className="h-12 rounded-xl px-6" asChild>
              <Link href="/dashboard">
                Try the visual editor
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 rounded-xl border-background/15 bg-background/5 px-6 text-background hover:bg-background/10 hover:text-background"
              asChild
            >
              <Link href="/docs">Read the docs</Link>
            </Button>
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.5rem] border border-background/10 bg-background/5 p-5">
            <PanelTopOpen className="h-5 w-5 text-background" />
            <h3 className="mt-4 text-base font-semibold tracking-[-0.02em]">Visual editor, zero setup</h3>
            <p className="mt-2 text-sm leading-6 text-background/68">
              Edit content with a live preview. No config files, no build steps, no terminal commands.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-background/10 bg-background/5 p-5">
            <GitBranch className="h-5 w-5 text-background" />
            <h3 className="mt-4 text-base font-semibold tracking-[-0.02em]">Changes go through GitHub</h3>
            <p className="mt-2 text-sm leading-6 text-background/68">
              Every edit becomes a pull request. Your team reviews before anything goes live.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-background/10 bg-background/5 p-5">
            <Sparkles className="h-5 w-5 text-background" />
            <h3 className="mt-4 text-base font-semibold tracking-[-0.02em]">Free and open source</h3>
            <p className="mt-2 text-sm leading-6 text-background/68">
              MIT licensed, no vendor lock-in. Self-host or use the hosted version.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

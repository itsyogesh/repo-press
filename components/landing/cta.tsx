import { ArrowRight, GitBranch, PanelTopOpen, Sparkles } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function CTA() {
  return (
    <section className="px-4 py-24">
      <div className="mx-auto max-w-6xl rounded-[2rem] border border-foreground/10 bg-foreground px-6 py-10 text-background sm:px-8 sm:py-12">
        <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-background/60">
              Ready when your repo is
            </p>
            <h2 className="mt-4 max-w-[12ch] text-4xl font-semibold tracking-[-0.05em] text-balance sm:text-5xl">
              Bring the repo. Keep the workflow. Lose the CMS drag.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-background/72 sm:text-lg sm:leading-8">
              RepoPress gives content teams a premium workspace without disconnecting from the repository, components,
              and publish paths the rest of the product already depends on.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Button size="lg" variant="secondary" className="h-12 rounded-xl px-6" asChild>
              <Link href="/dashboard">
                Open studio
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 rounded-xl border-background/15 bg-background/5 px-6 text-background hover:bg-background/10 hover:text-background"
              asChild
            >
              <Link href="/docs">Explore docs</Link>
            </Button>
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.5rem] border border-background/10 bg-background/5 p-5">
            <PanelTopOpen className="h-5 w-5 text-background" />
            <h3 className="mt-4 text-base font-semibold tracking-[-0.02em]">Visual shell, operator mindset</h3>
            <p className="mt-2 text-sm leading-6 text-background/68">
              Edit, preview, and route publishing decisions from one authored workspace.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-background/10 bg-background/5 p-5">
            <GitBranch className="h-5 w-5 text-background" />
            <h3 className="mt-4 text-base font-semibold tracking-[-0.02em]">Git stays legible</h3>
            <p className="mt-2 text-sm leading-6 text-background/68">
              Drafts, reviews, and publish lanes still tell a clear story in the repo.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-background/10 bg-background/5 p-5">
            <Sparkles className="h-5 w-5 text-background" />
            <h3 className="mt-4 text-base font-semibold tracking-[-0.02em]">Designed to feel premium</h3>
            <p className="mt-2 text-sm leading-6 text-background/68">
              Calmer hierarchy, stronger proof, and less CMS chrome competing for attention.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

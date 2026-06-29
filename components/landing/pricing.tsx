import { Check } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

const features = [
  "Unlimited repositories",
  "Automatic framework detection",
  "Visual editor with live preview",
  "Draft, review, and publish workflow",
  "Full version history",
  "Webhook integrations",
  "Multi-project workspace",
  "GitHub login — no extra accounts",
]

export default function Pricing() {
  return (
    <section id="pricing" className="border-t border-border px-6 py-24">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-16 text-center">
          <p className="rp-overline mb-4">Pricing</p>
          <h2 className="rp-display text-[clamp(1.75rem,4vw,2.5rem)]">Free to use. Open source forever.</h2>
          <p className="mx-auto mt-4 max-w-[48ch] text-balance text-muted-foreground">
            RepoPress is free during early access and will remain open source under the MIT license. No credit card, no
            trial expiration.
          </p>
        </div>

        <div className="mx-auto max-w-sm">
          <div className="rounded-lg border border-border bg-background p-8">
            <div className="mb-1 text-4xl font-semibold tracking-tight">$0</div>
            <p className="mb-8 text-sm text-muted-foreground">Free forever for open source</p>
            <ul className="mb-8 space-y-3">
              {features.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm">
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                  <span className="text-foreground">{feature}</span>
                </li>
              ))}
            </ul>
            <Button size="lg" className="w-full" asChild>
              <Link href="/dashboard">Try the visual editor</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

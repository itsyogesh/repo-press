import { FileText } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function CTA() {
  return (
    <section className="container mx-auto px-4 py-24">
      <div className="relative overflow-hidden rounded-[2.5rem] border border-border bg-muted/50 p-8 md:p-16">
        {/* Draft lines effect */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <h2 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl mb-6">
            Start crafting brilliant content today
          </h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
            Start managing your GitHub content with a visual editor. Free and open source, always.
          </p>
          <Button size="lg" className="h-12 rounded-full px-8" asChild>
            <Link href="/dashboard">Get started for free</Link>
          </Button>
        </div>

        {/* Mock UI Illustration */}
        <div className="relative mt-16 mx-auto max-w-4xl">
          {/* Gradient Glow */}
          <div className="absolute -top-24 left-1/2 h-64 w-3/4 -translate-x-1/2 rounded-full bg-linear-to-r from-primary/20 via-primary/10 to-transparent opacity-50 blur-3xl" />

          <div className="relative rounded-t-2xl border border-border bg-card/80 p-2 shadow-2xl backdrop-blur-sm">
            <div className="rounded-t-xl bg-muted border-b border-border p-4 flex items-center gap-4">
              <div className="flex gap-2">
                <div className="h-3 w-3 rounded-full bg-red-400/20" />
                <div className="h-3 w-3 rounded-full bg-yellow-400/20" />
                <div className="h-3 w-3 rounded-full bg-green-400/20" />
              </div>
              <div className="h-6 w-64 rounded-md bg-muted-foreground/10" />
            </div>
            <div className="p-8 space-y-6 min-h-[200px]">
              <div className="flex items-center gap-3 mb-8">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="h-4 w-32 bg-muted-foreground/10 rounded mb-2" />
                  <div className="h-3 w-24 bg-muted-foreground/5 rounded" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="h-4 w-full bg-muted-foreground/10 rounded" />
                <div className="h-4 w-5/6 bg-muted-foreground/10 rounded" />
                <div className="h-4 w-4/6 bg-muted-foreground/10 rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

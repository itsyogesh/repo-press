import { FileText } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function CTA() {
  return (
    <section className="container mx-auto px-4 py-24">
      <div className="relative overflow-hidden rounded-[2.5rem] border border-zinc-200 bg-zinc-50/50 p-8 md:p-16">
        {/* Draft lines effect */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <h2 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl mb-6">
            Start crafting brilliant content today
          </h2>
          <p className="text-lg text-zinc-600 mb-10 max-w-2xl mx-auto">
            Join thousands of developers and elevate your documentation workflow for free. No config, just content.
          </p>
          <Button size="lg" className="h-12 rounded-full bg-zinc-900 px-8 text-white hover:bg-zinc-800" asChild>
            <Link href="/dashboard">Get started for free</Link>
          </Button>
        </div>

        {/* Mock UI Illustration */}
        <div className="relative mt-16 mx-auto max-w-4xl">
          {/* Gradient Glow */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-3/4 h-64 bg-gradient-to-r from-orange-200 via-pink-200 to-purple-200 opacity-50 blur-3xl rounded-full" />

          <div className="relative rounded-t-2xl border border-zinc-200 bg-white/80 p-2 shadow-2xl backdrop-blur-sm">
            <div className="rounded-t-xl bg-zinc-50 border-b border-zinc-100 p-4 flex items-center gap-4">
              <div className="flex gap-2">
                <div className="h-3 w-3 rounded-full bg-red-400/20" />
                <div className="h-3 w-3 rounded-full bg-yellow-400/20" />
                <div className="h-3 w-3 rounded-full bg-green-400/20" />
              </div>
              <div className="h-6 w-64 rounded-md bg-zinc-100" />
            </div>
            <div className="p-8 space-y-6 min-h-[200px]">
              <div className="flex items-center gap-3 mb-8">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="h-4 w-32 bg-zinc-100 rounded mb-2" />
                  <div className="h-3 w-24 bg-zinc-50 rounded" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="h-4 w-full bg-zinc-100 rounded" />
                <div className="h-4 w-5/6 bg-zinc-100 rounded" />
                <div className="h-4 w-4/6 bg-zinc-100 rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

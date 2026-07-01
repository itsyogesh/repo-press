import { Check } from "lucide-react"

const notes = [
  {
    name: "Decap CMS",
    tension: "Functional but dated. The editing experience hasn't kept up with modern tools.",
    response:
      "RepoPress gives you a clean, visual editor with live preview — designed for how people write today, not ten years ago.",
  },
  {
    name: "TinaCMS",
    tension: "Powerful, but requires developer setup before content teams can use it.",
    response: "RepoPress works out of the box. Connect your repo and start editing — no build step or config needed.",
  },
  {
    name: "CloudCannon",
    tension: "Rich features, but it's a managed platform that can feel heavy and locked-in.",
    response: "RepoPress is open source and reads directly from your repository. Your content never leaves GitHub.",
  },
]

const commitments = [
  "Your content stays in GitHub — no separate database, no vendor lock-in.",
  "Edit, preview, and publish from a single workspace.",
  "Works with your existing repository structure. No migration required.",
  "Open source and free to use. Self-host if you prefer.",
]

export default function Comparison() {
  return (
    <section id="comparison" className="border-t border-border px-6 py-24">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-16 max-w-[30ch]">
          <h2 className="rp-display text-[clamp(2rem,4.5vw,3rem)] text-balance">
            A better way to manage content in your GitHub repository.
          </h2>
          <p className="mt-5 max-w-[52ch] text-lg leading-8 text-muted-foreground">
            Other tools make you choose between a developer experience and an editing experience. RepoPress gives you
            both.
          </p>
        </div>

        <div className="grid md:grid-cols-2 md:gap-16">
          {/* Alternatives */}
          <div className="divide-y divide-border">
            {notes.map((note) => (
              <div key={note.name} className="py-6">
                <p className="rp-overline mb-3">{note.name}</p>
                <p className="text-sm font-medium tracking-[-0.01em] text-foreground">{note.tension}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{note.response}</p>
              </div>
            ))}
          </div>

          {/* Commitments */}
          <div className="mt-10 md:mt-0 md:border-l md:border-border md:pl-16">
            <p className="rp-overline border-b border-border pb-4">What we believe</p>
            <div className="divide-y divide-border">
              {commitments.map((commitment) => (
                <div key={commitment} className="flex gap-3 py-4">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-sm leading-6 text-muted-foreground">{commitment}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

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
    <section id="comparison" className="px-4 py-24">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="font-mono text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">Alternatives</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-balance text-foreground sm:text-5xl">
            A better way to manage content in your GitHub repository.
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            Other tools make you choose between a developer experience and an editing experience. RepoPress gives you
            both.
          </p>

          <div className="mt-8 space-y-4">
            {notes.map((note) => (
              <div key={note.name} className="surface-card rounded-[1.5rem] border p-5">
                <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                  {note.name}
                </p>
                <p className="mt-3 text-sm font-medium tracking-[-0.01em] text-foreground">{note.tension}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{note.response}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-card overflow-hidden rounded-[1.75rem] border">
          <div className="border-b border-border/70 px-6 py-5">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
              What we believe
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground">
              Principles behind RepoPress
            </h3>
          </div>

          <div className="grid gap-4 px-6 py-6">
            {commitments.map((commitment) => (
              <div key={commitment} className="flex gap-3 rounded-[1.5rem] border border-border/70 bg-muted/35 p-5">
                <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Check className="h-4 w-4" />
                </span>
                <p className="text-sm leading-6 text-muted-foreground">{commitment}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

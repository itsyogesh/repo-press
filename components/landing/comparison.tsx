import { Check } from "lucide-react"

const notes = [
  {
    name: "Decap CMS",
    tension: "Functional, but the admin surface can feel dated and utilitarian.",
    response:
      "RepoPress answers with stronger hierarchy, calmer spacing, and a workflow that feels authored instead of inherited.",
  },
  {
    name: "TinaCMS",
    tension: "Powerful for developers, but easy to tip into a tool-heavy editing experience.",
    response: "RepoPress keeps the developer trust while dialing the shell closer to a Notion + VS Code hybrid.",
  },
  {
    name: "CloudCannon",
    tension: "Rich visual editing, but the SaaS shell can feel heavy for Git-native teams.",
    response:
      "RepoPress keeps the workflow light, sharp, and rooted in the repository rather than an enterprise console.",
  },
]

const commitments = [
  "Keep Git as the source of truth instead of hiding content behind a separate admin model.",
  "Put rendered preview, repo context, and publishing decisions in the same authored surface.",
  "Use typography, spacing, and calmer hierarchy to avoid the default dashboard feel.",
  "Stay credible for self-hosted teams that want open workflows without SaaS heaviness.",
]

export default function Comparison() {
  return (
    <section id="comparison" className="px-4 py-24">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="font-mono text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">Competitive bar</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-balance text-foreground sm:text-5xl">
            Built for teams that have outgrown dated, tool-heavy, or SaaS-heavy CMS workflows.
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            RepoPress sits in a deliberate middle lane: calmer than a dev-tool console, sharper than a default CMS
            admin, and lighter than a heavy managed content platform.
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
              Design commitments
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground">
              What the landing should make clear
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

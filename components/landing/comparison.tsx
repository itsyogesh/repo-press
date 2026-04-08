import { Check, Minus, X } from "lucide-react"

type CellValue = "yes" | "no" | "partial"

interface ComparisonRow {
  feature: string
  repopress: CellValue
  decap: CellValue
  tina: CellValue
  keystatic: CellValue
}

const rows: ComparisonRow[] = [
  { feature: "Framework Auto-Detection", repopress: "yes", decap: "no", tina: "no", keystatic: "no" },
  { feature: "Visual MDX Editor", repopress: "yes", decap: "no", tina: "yes", keystatic: "yes" },
  { feature: "Document History & Revert", repopress: "yes", decap: "no", tina: "no", keystatic: "no" },
  { feature: "Webhook Integration", repopress: "yes", decap: "no", tina: "yes", keystatic: "no" },
  { feature: "Multi-State Workflows", repopress: "yes", decap: "no", tina: "no", keystatic: "no" },
  { feature: "Multi-Project Support", repopress: "yes", decap: "no", tina: "no", keystatic: "no" },
  { feature: "100% Open Source", repopress: "yes", decap: "yes", tina: "partial", keystatic: "yes" },
  { feature: "Git-Native Storage", repopress: "yes", decap: "yes", tina: "yes", keystatic: "yes" },
]

const competitors = [
  { key: "repopress" as const, label: "RepoPress" },
  { key: "decap" as const, label: "Decap CMS" },
  { key: "tina" as const, label: "TinaCMS" },
  { key: "keystatic" as const, label: "Keystatic" },
]

function CellIcon({ value }: { value: CellValue }) {
  if (value === "yes") {
    return <Check className="mx-auto h-5 w-5 text-primary" />
  }
  if (value === "partial") {
    return <Minus className="mx-auto h-5 w-5 text-muted-foreground" />
  }
  return <X className="mx-auto h-5 w-5 text-muted-foreground/50" />
}

export default function Comparison() {
  return (
    <section id="comparison" className="container mx-auto px-4 py-24">
      <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center mb-16">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">How RepoPress Compares</h2>
        <p className="max-w-[85%] text-muted-foreground sm:text-lg sm:leading-7 text-balance">
          See how RepoPress stacks up against other Git-based content management solutions.
        </p>
      </div>

      <div className="mx-auto max-w-4xl overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="px-6 py-4 text-left font-medium text-muted-foreground">Feature</th>
              {competitors.map((c) => (
                <th
                  key={c.key}
                  className={`px-6 py-4 text-center font-medium ${
                    c.key === "repopress" ? "bg-primary/5 text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.feature} className={i < rows.length - 1 ? "border-b border-border" : ""}>
                <td className="px-6 py-4 font-medium">{row.feature}</td>
                {competitors.map((c) => (
                  <td key={c.key} className={`px-6 py-4 text-center ${c.key === "repopress" ? "bg-primary/5" : ""}`}>
                    <CellIcon value={row[c.key]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

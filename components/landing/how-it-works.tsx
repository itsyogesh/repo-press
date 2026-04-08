import { FileEdit, FolderGit2, Github, Zap } from "lucide-react"

const steps = [
  {
    number: 1,
    icon: Github,
    title: "Sign in with GitHub",
    description: "Connect your GitHub account with one click.",
  },
  {
    number: 2,
    icon: FolderGit2,
    title: "Select your repo",
    description: "Choose any repository with MDX or markdown content.",
  },
  {
    number: 3,
    icon: Zap,
    title: "Auto-detect framework",
    description: "RepoPress automatically detects your framework and configures itself.",
  },
  {
    number: 4,
    icon: FileEdit,
    title: "Edit & publish",
    description: "Use the visual editor to write, preview, and publish.",
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="container mx-auto px-4 py-24">
      <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center mb-16">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">How It Works</h2>
        <p className="max-w-[85%] text-muted-foreground sm:text-lg sm:leading-7 text-balance">
          Go from zero to publishing in under a minute.
        </p>
      </div>

      <div className="relative mx-auto max-w-5xl">
        {/* Connecting line — desktop only */}
        <div className="absolute top-10 left-[calc(12.5%+20px)] right-[calc(12.5%+20px)] hidden md:block">
          <div className="h-px w-full border-t-2 border-dashed border-border" />
        </div>

        <div className="grid grid-cols-1 gap-10 md:grid-cols-4 md:gap-6">
          {steps.map((step) => {
            const Icon = step.icon
            return (
              <div key={step.number} className="relative flex flex-col items-center text-center">
                {/* Numbered circle with icon */}
                <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="h-8 w-8 text-primary" />
                  <span className="absolute -top-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {step.number}
                  </span>
                </div>

                {/* Text */}
                <h3 className="mt-6 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

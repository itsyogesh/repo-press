import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

const faqs = [
  {
    question: "Do I need to know how to code?",
    answer:
      "No. If you can use Google Docs, you can use RepoPress. The visual editor handles formatting, images, and metadata — you never need to touch code or a terminal. You do need a GitHub account, which is free to create.",
  },
  {
    question: "Is RepoPress free?",
    answer:
      "Yes. RepoPress is free and open source under the MIT license. You can self-host it or use our hosted version. No credit card required, no trial period.",
  },
  {
    question: "Which frameworks does it work with?",
    answer:
      "RepoPress automatically detects and supports Next.js (including Fumadocs and Nextra), Astro, Hugo, Docusaurus, Jekyll, and any project using MDX or Markdown files.",
  },
  {
    question: "What happens when I hit publish?",
    answer:
      "RepoPress creates a pull request in your GitHub repository with your content changes. Your team can review the changes before merging. Nothing goes live until the pull request is approved.",
  },
  {
    question: "Where is my content stored?",
    answer:
      "Your content stays in your GitHub repository. RepoPress reads from and writes to your repo directly — there is no separate database. If you stop using RepoPress, your content is exactly where you left it.",
  },
  {
    question: "Does it work with private repos?",
    answer:
      "Yes. RepoPress works with both public and private GitHub repositories. It uses GitHub OAuth so you only see repos you already have access to.",
  },
  {
    question: "Can I use it with my team?",
    answer:
      "Yes. RepoPress has a built-in review workflow: writers draft content, editors review and approve, and the approved content is published as a pull request. Everyone works from the same repository.",
  },
]

export default function FAQ() {
  return (
    <section id="faq" className="border-t border-border px-6 py-24">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-16 text-center">
          <p className="rp-overline mb-4">FAQ</p>
          <h2 className="rp-display text-[clamp(1.75rem,4vw,2.5rem)]">Frequently asked questions</h2>
          <p className="mx-auto mt-4 max-w-[48ch] text-balance text-muted-foreground">
            Common questions about RepoPress, answered plainly.
          </p>
        </div>

        <div className="mx-auto max-w-3xl">
          <Accordion type="single" collapsible>
            {faqs.map((faq) => (
              <AccordionItem key={faq.question} value={faq.question}>
                <AccordionTrigger className="text-left text-base font-medium tracking-[-0.01em]">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-7 text-muted-foreground">{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  )
}

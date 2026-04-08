import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

const faqs = [
  {
    question: "Is RepoPress free?",
    answer:
      "Yes! RepoPress is free and open source. You can self-host it or use our hosted version. We believe developer tools should be accessible to everyone.",
  },
  {
    question: "Which frameworks are supported?",
    answer:
      "RepoPress auto-detects and supports Next.js (including Fumadocs and Nextra), Astro, Hugo, Docusaurus, Jekyll, and any project using MDX or Markdown files.",
  },
  {
    question: "How is this different from Decap CMS or TinaCMS?",
    answer:
      "RepoPress is the only Git-native CMS with framework auto-detection, document version history with revert, multi-state editorial workflows (draft → review → approved → published), and multi-project support from a single dashboard.",
  },
  {
    question: "Does it work with private repos?",
    answer:
      "Yes, RepoPress works with both public and private GitHub repositories. We use GitHub OAuth to securely access your repos.",
  },
  {
    question: "Where is my content stored?",
    answer:
      "Your content always stays in your Git repository. RepoPress reads from and commits to your repo directly. There's no proprietary database or vendor lock-in.",
  },
  {
    question: "Can I use it with my team?",
    answer:
      "Yes! RepoPress supports multi-state workflows perfect for teams. Writers can draft content, editors can review and approve, and publishers can push to production.",
  },
]

export default function FAQ() {
  return (
    <section id="faq" className="container mx-auto px-4 py-24">
      <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center mb-16">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Frequently Asked Questions</h2>
        <p className="max-w-[85%] text-muted-foreground sm:text-lg sm:leading-7 text-balance">
          Everything you need to know about RepoPress.
        </p>
      </div>

      <div className="mx-auto max-w-3xl">
        <Accordion type="single" collapsible>
          {faqs.map((faq) => (
            <AccordionItem key={faq.question} value={faq.question}>
              <AccordionTrigger className="text-left font-medium text-base">{faq.question}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">{faq.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}

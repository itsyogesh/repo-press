export const MERRY_CONFIG = {
  version: 1,
  defaults: { branch: "main", framework: "auto" },
  projects: [
    {
      id: "main",
      name: "Merry Magic Mail Blog",
      contentRoot: "apps/web/app/(main)/blog",
      framework: "next-mdx",
      contentType: "blog",
      branch: "main",
      preview: { entry: ".repopress/mdx-preview.tsx" },
      components: {
        CoverImage: {
          displayName: "Cover image",
          description: "A Merry blog cover using a preset name or image URL.",
          category: "Media",
          schemaStatus: "complete",
          props: [
            {
              name: "src",
              type: "string",
              label: "Preset or image URL",
              required: true,
              placeholder: "templates",
            },
            {
              name: "alt",
              type: "string",
              label: "Alternative text",
              required: true,
              placeholder: "Describe the cover image",
            },
          ],
          hasChildren: false,
          kind: "flow",
        },
        InfoBox: {
          displayName: "Information box",
          description: "A Merry information, tip, or warning callout.",
          category: "Callouts",
          schemaStatus: "complete",
          props: [
            { name: "type", type: "string", label: "Type", default: "info", options: ["info", "tip", "warning"] },
          ],
          slots: [{ name: "children", accepts: "mdx", required: true }],
          hasChildren: true,
          kind: "flow",
        },
        Checklist: {
          displayName: "Checklist",
          description: "A static list with Merry check marks.",
          category: "Lists",
          schemaStatus: "complete",
          props: [
            {
              name: "items",
              type: "expression",
              label: "Items",
              required: true,
              placeholder: 'JSON array, for example: ["Cookies", "Carrots"]',
            },
          ],
          hasChildren: false,
          kind: "flow",
        },
        CTABox: {
          displayName: "Call to action",
          description: "A Merry promotional callout with an inert preview action.",
          category: "Marketing",
          schemaStatus: "complete",
          props: [
            { name: "title", type: "string", label: "Title", required: true },
            { name: "description", type: "string", label: "Description", required: true },
            { name: "buttonText", type: "string", label: "Button text", required: true },
            {
              name: "buttonHref",
              type: "string",
              label: "Button destination",
              required: true,
              placeholder: "/letters-to-santa",
            },
          ],
          hasChildren: false,
          kind: "flow",
        },
        LetterPaper: {
          displayName: "Letter paper",
          description: "Merry ruled North Pole stationery for letter templates.",
          category: "Letters",
          schemaStatus: "complete",
          props: [
            { name: "title", type: "string", label: "Title", default: "Letter to Santa" },
            { name: "showStamp", type: "boolean", label: "Show North Pole stamp", default: true },
            {
              name: "templateText",
              type: "string",
              label: "Prefilled template text",
              placeholder: "Optional text used to prefill the letter experience",
            },
          ],
          slots: [{ name: "children", accepts: "mdx", required: true }],
          hasChildren: true,
          kind: "flow",
        },
      },
    },
  ],
} as const

export const MERRY_ADAPTER_SOURCE = `import type { ReactNode } from "react"
import {
  PreviewAction,
  PreviewBox,
  PreviewDocument,
  PreviewIcon,
  PreviewImage,
  PreviewInline,
  PreviewList,
  PreviewPaper,
  PreviewStack,
  PreviewText,
} from "@repopress/preview"

type ChildrenProps = { children?: ReactNode }

function Document({ children }: ChildrenProps) {
  return <PreviewDocument layout="article" tone="warm">{children}</PreviewDocument>
}

const coverPresets = {
  templates: "https://soxgiykgxzadvzcy.public.blob.vercel-storage.com/blog/templates-cover-Pduq3obFhtWzBzwmfWzVwloNZurTBC.png",
  perfectLetter: "https://soxgiykgxzadvzcy.public.blob.vercel-storage.com/blog/perfect-letter-cover-az71619y7SxQI9IipkpKkVDziJR14w.png",
}

function CoverImage({ src, alt }: { src?: string; alt?: string }) {
  const preset = src === "templates" ? "Free Santa letter templates" : src === "perfectLetter" ? "The perfect Santa letter" : src
  const imageSource = src === "templates" || src === "perfectLetter" ? coverPresets[src] : src
  return <PreviewImage src={imageSource} alt={alt || "Merry Magic Mail cover"} label={preset || alt} aspect="wide" />
}

function InfoBox({ children, type = "info" }: ChildrenProps & { type?: "info" | "tip" | "warning" }) {
  const tone = type === "tip" ? "tip" : type === "warning" ? "warning" : "info"
  const icon = type === "tip" ? "tip" : type === "warning" ? "warning" : "info"
  const label = type === "tip" ? "Pro Tip" : type === "warning" ? "Note" : "Info"
  return (
    <PreviewBox tone={tone}>
      <PreviewInline align="start" gap="compact">
        <PreviewIcon name={icon} label={label} />
        <PreviewStack gap="compact">
          <PreviewText weight="semibold" tone="accent">{label}</PreviewText>
          {children}
        </PreviewStack>
      </PreviewInline>
    </PreviewBox>
  )
}

function Checklist({ items }: { items?: readonly string[] }) {
  return <PreviewBox tone="neutral"><PreviewList items={items} style="check" /></PreviewBox>
}

function CTABox({ title, description, buttonText, buttonHref }: { title?: string; description?: string; buttonText?: string; buttonHref?: string }) {
  return (
    <PreviewBox tone="accent">
      <PreviewStack gap="default">
        <PreviewText as="h3" size="title" weight="semibold">{title || "Create Christmas magic"}</PreviewText>
        <PreviewText as="p" tone="muted">{description}</PreviewText>
        <PreviewAction label={buttonText || "Continue"} href={buttonHref} tone="primary" />
      </PreviewStack>
    </PreviewBox>
  )
}

function LetterPaper({ children, title = "Letter to Santa", showStamp = true, templateText }: ChildrenProps & { title?: string; showStamp?: boolean; templateText?: string }) {
  return (
    <PreviewPaper
      variant="letter"
      title={title}
      headingLevel={2}
      showStamp={showStamp}
      actionLabel={templateText ? "Want Santa to reply? Write your letter now!" : undefined}
    >
      {children}
    </PreviewPaper>
  )
}

export const adapter = { Document, components: { CoverImage, InfoBox, Checklist, CTABox, LetterPaper } }
`

export const MERRY_DOCUMENT_SOURCE = `# A letter from the North Pole

<CoverImage src="templates" alt="A collection of printable Santa letter templates" />

<InfoBox type="tip">Add a drawing, a few stickers, and your favorite festive colors.</InfoBox>

<Checklist items={["Write a warm greeting", "Share one kind thing you did", "Leave a question for Santa"]} />

<LetterPaper title="Classic Letter" showStamp={true} templateText="Dear Santa,">
Dear Santa, this year I learned how much fun it is to help other people.
</LetterPaper>

<CTABox
  title="Send your letter to Santa"
  description="Turn this template into a magical personalized letter experience."
  buttonText="Start writing"
  buttonHref="/letters-to-santa?utm_source=repopress_preview"
/>
`

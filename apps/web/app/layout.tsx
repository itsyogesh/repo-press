import type { Metadata } from "next"
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google"
import type React from "react"
import { RootChrome } from "@/components/root-chrome"
import "./globals.css"

// Editorial type registers — Geist (UI/body), Geist Mono (technical),
// Instrument Serif (display/marketing headlines). Exposed as CSS variables
// consumed by --font-sans / --font-mono / --font-serif in globals.css.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" })
const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://repopress.dev"),
  title: {
    default: "RepoPress - Your Repo is Your CMS",
    template: "%s | RepoPress",
  },
  description:
    "Git-native headless CMS for GitHub repositories. Visual MDX editing with draft/publish workflows. Your content stays in Git.",
  keywords: ["CMS", "GitHub", "MDX", "headless CMS", "Git", "content management", "documentation", "open source"],
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "RepoPress - Your Repo is Your CMS",
    description:
      "Git-native headless CMS for GitHub repositories. Visual MDX editing with draft/publish workflows. Your content stays in Git.",
    url: "/",
    siteName: "RepoPress",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "RepoPress - Your Repo is Your CMS",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RepoPress - Your Repo is Your CMS",
    description:
      "Git-native headless CMS for GitHub repositories. Visual MDX editing with draft/publish workflows. Your content stays in Git.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <RootChrome>{children}</RootChrome>
      </body>
    </html>
  )
}

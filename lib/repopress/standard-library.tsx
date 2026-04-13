"use client"

import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Info, XCircle } from "lucide-react"
import React from "react"
import * as jsxRuntime from "react/jsx-runtime"

/**
 * Standard built-in components for RepoPress.
 * These provide high-quality fallbacks for common documentation patterns.
 */
export const standardComponents: Record<string, React.ComponentType<any>> = {
  Callout: (props) => (
    <div className="my-4 flex gap-3 rounded-lg border border-studio-accent/20 bg-studio-accent-muted/60 p-4 text-left text-sm text-foreground shadow-sm font-sans">
      <div className="mt-0.5">
        <Info className="h-4 w-4 text-studio-accent" />
      </div>
      <div className="flex-1">{props.children}</div>
    </div>
  ),
  Steps: (props) => (
    <div className="space-y-4 my-6 border-l-2 border-muted pl-6 text-left font-sans">{props.children}</div>
  ),
  Step: (props) => (
    <div className="relative text-left font-sans">
      <div className="absolute -left-[33px] top-0 size-4 rounded-full bg-background border-2 border-muted flex items-center justify-center text-[10px] font-bold" />
      {props.children}
    </div>
  ),
  Tabs: (props) => <div className="my-4 border rounded-md p-1 bg-muted/30 text-left font-sans">{props.children}</div>,
  Tab: (props) => (
    <div className="p-4 bg-background rounded border shadow-sm text-left font-sans">{props.children}</div>
  ),
  Badge: (props) => (
    <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 mx-1 font-sans">
      {props.children}
    </div>
  ),
  Button: (props) => (
    <button
      type="button"
      className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 px-3 mx-1 font-sans"
    >
      {props.children}
    </button>
  ),
  Card: (props) => (
    <div className="my-4 p-6 border rounded-xl bg-card shadow-sm text-left font-sans">{props.children}</div>
  ),
  FileTree: (props) => (
    <div className="my-4 p-4 border rounded-md bg-muted/20 font-mono text-xs text-left">{props.children}</div>
  ),
  Image: (props) => <img {...props} className="rounded-lg border shadow-sm max-w-full" alt={props.alt || ""} />,
  Video: (props) => <video {...props} className="rounded-lg border shadow-sm max-w-full" controls />,
}

const LinkShim = React.forwardRef<
  HTMLAnchorElement,
  React.AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string | URL | null }
>(({ href, children, ...props }, ref) => {
  const resolvedHref = href == null ? undefined : String(href)
  return (
    <a ref={ref} href={resolvedHref} {...props}>
      {children}
    </a>
  )
})
LinkShim.displayName = "LinkShim"

const ImageShim = React.forwardRef<
  HTMLImageElement,
  React.ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean
    priority?: boolean
    sizes?: string
    quality?: number
  }
>(({ alt = "", fill, src, style, ...props }, ref) => {
  const resolvedSrc =
    typeof src === "string"
      ? src
      : src && typeof src === "object" && "src" in src
        ? String((src as { src?: string }).src || "")
        : ""

  const nextStyle = fill
    ? {
        position: "absolute" as const,
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover" as const,
        ...style,
      }
    : style

  return <img ref={ref} alt={alt} src={resolvedSrc} style={nextStyle} {...props} />
})
ImageShim.displayName = "ImageShim"

const Cards = ({ children }: { children?: React.ReactNode }) => (
  <div className="my-4 grid gap-4 md:grid-cols-2">{children}</div>
)

const File = ({ children }: { children?: React.ReactNode }) => (
  <div className="rounded-md border border-studio-border/70 bg-background px-3 py-2 text-left font-mono text-xs shadow-sm">
    {children}
  </div>
)

const Files = ({ children }: { children?: React.ReactNode }) => (
  <div className="my-4 space-y-2 rounded-xl border border-studio-border/70 bg-muted/20 p-4">{children}</div>
)

export const fumadocsDefaultComponents: Record<string, unknown> = {
  ...standardComponents,
  a: LinkShim,
  img: ImageShim,
  Link: LinkShim,
  Image: ImageShim,
  Card: standardComponents.Card,
  Cards,
  File,
  Files,
}

export const standardAllowImports: Record<string, Record<string, unknown>> = {
  react: {
    Fragment: React.Fragment,
    useState: React.useState,
    useEffect: React.useEffect,
    useMemo: React.useMemo,
    useCallback: React.useCallback,
  },
  "react/jsx-runtime": {
    Fragment: React.Fragment,
    jsx: jsxRuntime.jsx,
    jsxs: jsxRuntime.jsxs,
  },
  "lucide-react": {
    Info,
    AlertTriangle,
    CheckCircle,
    XCircle,
    ChevronRight,
    ChevronDown,
  },
  "next/link": {
    default: LinkShim,
  },
  "next/image": {
    default: ImageShim,
  },
  "fumadocs-ui/mdx": {
    default: fumadocsDefaultComponents,
    defaultComponents: fumadocsDefaultComponents,
    Callout: standardComponents.Callout,
    Step: standardComponents.Step,
    Steps: standardComponents.Steps,
    Tab: standardComponents.Tab,
    Tabs: standardComponents.Tabs,
    Card: standardComponents.Card,
    Cards,
    File,
    Files,
    Image: ImageShim,
    Link: LinkShim,
  },
}

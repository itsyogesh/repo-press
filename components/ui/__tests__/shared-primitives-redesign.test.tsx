import type * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("cmdk", () => {
  const Command = Object.assign(
    ({ children, className, ...props }: React.ComponentProps<"div">) => (
      <div data-cmdk-root="" className={className} {...props}>
        {children}
      </div>
    ),
    {
      Input: ({
        className,
        onValueChange,
        value,
        ...props
      }: React.ComponentProps<"input"> & { onValueChange?: (value: string) => void }) => (
        <input
          className={className}
          value={value}
          onChange={(event) => onValueChange?.(event.target.value)}
          {...props}
        />
      ),
      List: ({ children, className, ...props }: React.ComponentProps<"div">) => (
        <div data-cmdk-list="" className={className} {...props}>
          {children}
        </div>
      ),
      Empty: ({ children, className, ...props }: React.ComponentProps<"div">) => (
        <div data-cmdk-empty="" className={className} {...props}>
          {children}
        </div>
      ),
      Group: ({
        children,
        className,
        heading,
        ...props
      }: React.ComponentProps<"div"> & { heading?: React.ReactNode }) => (
        <div data-cmdk-group="" className={className} {...props}>
          {heading ? <div cmdk-group-heading="">{heading}</div> : null}
          {children}
        </div>
      ),
      Separator: ({ className, ...props }: React.ComponentProps<"div">) => (
        <div data-cmdk-separator="" className={className} {...props} />
      ),
      Item: ({ children, className, ...props }: React.ComponentProps<"div">) => (
        <div data-cmdk-item="" className={className} {...props}>
          {children}
        </div>
      ),
    },
  )

  return { Command }
})

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div data-slot="dialog">{children}</div>,
  DialogContent: ({
    children,
    className,
    showCloseButton,
    ...props
  }: React.ComponentProps<"div"> & { showCloseButton?: boolean }) => (
    <div data-slot="dialog-content" data-show-close-button={showCloseButton} className={className} {...props}>
      {children}
    </div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children, className }: React.ComponentProps<"div">) => <div className={className}>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

import { Button } from "../button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../card"
import { CommandDialog, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "../command"

describe("shared primitives redesign", () => {
  it("gives buttons the redesign focus and elevation treatment", () => {
    const html = renderToStaticMarkup(<Button>Continue</Button>)

    expect(html).toContain("tracking-[-0.01em]")
    expect(html).toContain("focus-visible:ring-4")
    expect(html).toContain("shadow-[var(--shadow-button)]")
    expect(html).toContain("motion-reduce:transition-none")
  })

  it("keeps destructive buttons readable in dark mode", () => {
    const html = renderToStaticMarkup(<Button variant="destructive">Delete</Button>)

    expect(html).toContain("text-white")
    expect(html).toContain("dark:text-white")
  })

  it("gives cards a custom panel surface and spacing rhythm", () => {
    const html = renderToStaticMarkup(
      <Card>
        <CardHeader>
          <CardTitle>Shared surface</CardTitle>
          <CardDescription>Monochrome panel styling</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
      </Card>,
    )

    expect(html).toContain("surface-card")
    expect(html).toContain("px-[var(--space-panel-lg)]")
    expect(html).toContain("tracking-[-0.02em]")
  })

  it("applies glass treatment to the command palette shell", () => {
    const html = renderToStaticMarkup(
      <CommandDialog open onOpenChange={() => {}} showCloseButton={false}>
        <CommandInput value="" onValueChange={() => {}} />
        <CommandList>
          <CommandGroup heading="Actions">
            <CommandItem value="save">
              Save draft
              <CommandShortcut>⌘S</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>,
    )
    const dialogShellClasses = html.match(/data-slot="dialog-content"[^>]*class="([^"]+)"/)?.[1]

    expect(html).toContain("glass-command")
    expect(html).toContain("max-h-[min(32rem,80vh)]")
    expect(html).toContain("tracking-[0.18em]")
    expect(dialogShellClasses).not.toContain("border-0")
    expect(dialogShellClasses).not.toContain("bg-transparent")
    expect(dialogShellClasses).not.toContain("shadow-none")
  })
})

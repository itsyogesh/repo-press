"use client"

import * as React from "react"
import { useStudioAdapter } from "./studio-adapter-context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Box, Plus } from "lucide-react"
import { usePublisher, insertJsx$ } from "@mdxeditor/editor"

export function InsertRepoComponent() {
  const { components: schema, adapter } = useStudioAdapter()
  console.log("InsertRepoComponent Context:", {
    hasSchema: !!schema,
    hasAdapter: !!adapter,
    count: Object.keys(adapter?.components || {}).length,
  })
  const insertJsx = usePublisher(insertJsx$)

  // Combine discovered components from adapter and defined ones from schema
  const componentNames = React.useMemo(() => {
    const names = new Set([...Object.keys(adapter?.components || {}), ...Object.keys(schema || {})])
    return Array.from(names).sort()
  }, [adapter, schema])

  if (componentNames.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded px-2 text-xs font-medium hover:bg-studio-canvas-inset transition-colors"
          title="Insert component"
        >
          <Box className="h-3.5 w-3.5" />
          <span>JSX</span>
          <Plus className="h-3 w-3 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 overflow-y-auto max-h-[400px]">
        <DropdownMenuLabel className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
          Repository Components
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {componentNames.map((name) => (
          <DropdownMenuItem
            key={name}
            onClick={() => {
              const compSchema = schema?.[name]
              insertJsx({
                name,
                kind: compSchema?.kind || "flow",
                props: {},
              })
            }}
            className="flex items-center justify-between gap-2"
          >
            <span className="font-medium">{name}</span>
            {schema?.[name] && (
              <span className="text-[10px] bg-studio-accent/10 text-studio-accent px-1 rounded">Config</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

import { Skeleton } from "@/components/ui/skeleton"

export default function StudioLoading() {
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-studio-canvas text-studio-fg">
      <div className="shrink-0 border-b bg-background">
        <div className="w-full px-2 sm:px-3 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Skeleton className="h-6 w-64" />
          </div>
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </div>

      <div className="h-[--spacing-studio-header-h] shrink-0 border-b border-studio-border bg-studio-canvas px-2 sm:px-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2 flex-1">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-36 rounded-md" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Skeleton className="h-8 w-14 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </div>

      <div className="flex-1 min-h-0 flex border-t border-studio-border">
        <div className="w-14 shrink-0 border-r border-studio-border bg-studio-canvas-inset flex flex-col">
          <div className="border-b border-studio-border px-2 py-2 flex flex-col items-center gap-2">
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
          <div className="h-full" />
          <div className="border-t border-studio-border px-2 py-2 flex flex-col items-center gap-2">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-5 w-5 rounded-full" />
          </div>
        </div>

        <div className="flex-1 min-w-0 bg-studio-canvas flex flex-col">
          <div className="flex-1 min-h-0 overflow-hidden px-6 py-8 flex items-center justify-center">
            <div className="w-full max-w-2xl space-y-5">
              <div className="space-y-2 text-center">
                <Skeleton className="mx-auto h-8 w-52" />
                <Skeleton className="mx-auto h-4 w-96 max-w-full" />
              </div>
              <div className="mx-auto max-w-xl space-y-3">
                <Skeleton className="h-11 w-full rounded-md" />
                <div className="space-y-1 rounded-lg border border-studio-border bg-studio-canvas-inset/30 p-2">
                  {Array.from({ length: 8 }).map((_, idx) => (
                    <div key={`empty-search-row-${idx}`} className="flex items-start gap-2 rounded-md px-2 py-2">
                      <Skeleton className="h-3.5 w-3.5 mt-0.5 rounded" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <Skeleton className={idx % 2 === 0 ? "h-4 w-2/3" : "h-4 w-3/4"} />
                        <Skeleton className={idx % 2 === 0 ? "h-3 w-full" : "h-3 w-11/12"} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="h-[--spacing-studio-footer-h] shrink-0 border-t border-studio-border bg-studio-canvas px-3 flex items-center justify-between">
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="h-3.5 w-24" />
      </div>
    </div>
  )
}

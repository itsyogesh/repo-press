import { SettingsLayout } from "@/components/settings/settings-layout"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function SettingsLoading() {
  return (
    <SettingsLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>

        <div className="pt-2 grid gap-6">
          {[1, 2].map((i) => (
            <Card key={i} className="overflow-hidden border-border bg-card shadow-sm">
              <div className="p-6 space-y-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-5 w-16" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-5 w-40" />
                  </div>
                  <div className="space-y-1.5">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                </div>

                <div className="pt-4 border-t border-border/50">
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </SettingsLayout>
  )
}

import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

interface RepoBreadcrumbProps {
  owner: string
  repo: string
  path?: string[]
  branch?: string
}

export function RepoBreadcrumb({ owner, repo, path = [], branch = "main" }: RepoBreadcrumbProps) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/dashboard">Dashboard</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href={`/dashboard/${owner}/${repo}?branch=${branch}`} className="font-mono">
              {owner}/{repo}
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {path.map((segment, index) => {
          const isLast = index === path.length - 1
          const segmentPath = path.slice(0, index + 1).join("/")
          const params = new URLSearchParams({ path: segmentPath, branch })
          const href = `/dashboard/${owner}/${repo}/files?${params.toString()}`

          return (
            <div key={path.slice(0, index + 1).join("/")} className="flex items-center gap-1.5">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="font-mono">{segment}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={href} className="font-mono">
                      {segment}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </div>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

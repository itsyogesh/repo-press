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
            <Link href={`/dashboard/${owner}/${repo}?branch=${branch}`}>
              {owner}/{repo}
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {path.map((segment, index) => {
          const isLast = index === path.length - 1
          const href = `/dashboard/${owner}/${repo}?path=${path.slice(0, index + 1).join("/")}&branch=${branch}`

          return (
            <div key={segment} className="flex items-center gap-1.5">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{segment}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={href}>{segment}</Link>
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

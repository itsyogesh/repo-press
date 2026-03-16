import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h2 className="text-2xl font-bold">Not Found</h2>
      <p className="text-muted-foreground mt-2">Could not find requested resource</p>
      <Link href="/" className="mt-4 text-primary hover:underline">
        Return Home
      </Link>
    </div>
  )
}

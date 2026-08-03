import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.22em] text-muted-foreground/55">404</p>
      <h2 className="rp-display mt-4 text-4xl md:text-5xl">Page not found.</h2>
      <p className="mt-4 max-w-[40ch] text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link href="/" className="mt-8 text-sm font-medium text-primary hover:underline">
        Return home
      </Link>
    </div>
  )
}

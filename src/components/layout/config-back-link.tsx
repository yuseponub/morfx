import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export function ConfigBackLink({
  href,
  label,
  className,
}: {
  href: string
  label: string
  className?: string
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground ${className ?? ''}`}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  )
}

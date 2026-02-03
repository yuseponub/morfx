'use client'

import { ThemeToggle } from './theme-toggle'
import { MobileNav } from './mobile-nav'

export function Header() {
  return (
    <header className="h-12 border-b bg-card flex items-center justify-between px-4 md:px-6">
      {/* Left: Mobile nav only */}
      <div className="flex items-center">
        <MobileNav />
      </div>

      {/* Right: Theme toggle */}
      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  )
}

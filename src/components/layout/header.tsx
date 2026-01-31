'use client'

import { User } from '@supabase/supabase-js'
import { ThemeToggle } from './theme-toggle'
import { UserMenu } from './user-menu'
import { MobileNav } from './mobile-nav'

interface HeaderProps {
  user: User
}

export function Header({ user }: HeaderProps) {
  return (
    <header className="h-12 border-b bg-card flex items-center justify-between px-4 md:px-6">
      {/* Left: Mobile nav only */}
      <div className="flex items-center">
        <MobileNav />
      </div>

      {/* Right: Theme toggle + User menu */}
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <UserMenu user={user} />
      </div>
    </header>
  )
}

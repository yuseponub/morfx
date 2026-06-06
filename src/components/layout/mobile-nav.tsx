'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, Building2, MessageSquare, Settings, Bot, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

const navItems = [
  {
    href: '/crm',
    label: 'CRM',
    icon: Building2,
  },
  {
    href: '/whatsapp',
    label: 'WhatsApp',
    icon: MessageSquare,
  },
  {
    href: '/automatizaciones',
    label: 'Automatizaciones',
    icon: Zap,
  },
  {
    href: '/agentes',
    label: 'Agentes',
    icon: Bot,
  },
  {
    href: '/settings',
    label: 'Configuracion',
    icon: Settings,
  },
]

/**
 * MobileNav — Sheet de navegación móvil.
 *
 * Prop `v3` (flag `ui_editorial_v3`, Standalone ui-redesign-editorial-shell, D-05):
 * ADITIVA, default `false`. Cuando `v3=false` (path no-v3) el componente renderiza
 * BYTE-IDÉNTICO a hoy (Regla 6 — early-return del branch v3 ANTES del return legacy).
 * El `<MobileNav />` del header de marketing (`header.tsx`) NO pasa `v3` → queda
 * byte-frozen. El `<MobileNav v3 />` del dashboard ((dashboard)/layout.tsx, D-05b)
 * renderiza el reskin editorial: `<SheetContent>` lleva `theme-editorial-v3` (mismo
 * principio Opción B que el sidebar v3) para que los tokens resuelvan; dark cubierto
 * por el descendant `.dark .theme-editorial-v3` global (sin compound dark — Pitfall 3).
 */
export function MobileNav({ v3 = false }: { v3?: boolean } = {}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // =========================================================================
  // Editorial v3 branch (D-05). Reusa el lenguaje visual del sidebar v3:
  // SheetContent con `theme-editorial-v3 sb` (tokens + fondo plano editorial),
  // wordmark tipográfico morf·x, nav `.sb-nav`/`.cat`/`li a.active`. Cada Link
  // cierra el sheet al navegar (onClick setOpen(false)). El return no-v3 abajo
  // queda BYTE-FROZEN (Regla 6).
  // =========================================================================
  if (v3) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Abrir menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="theme-editorial-v3 sb w-64 p-0">
          <SheetHeader className="brand">
            <SheetTitle className="wm" asChild>
              <div>
                morf<b>·</b>x
              </div>
            </SheetTitle>
          </SheetHeader>
          <nav className="sb-nav">
            <div className="cat">Navegacion</div>
            <ul>
              {navItems.map((item) => {
                const isActive = pathname.startsWith(item.href)
                const Icon = item.icon

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={isActive ? 'active' : ''}
                    >
                      <Icon width={16} height={16} />
                      <span style={{ flex: 1 }}>{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Abrir menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetHeader className="h-16 flex items-center px-6 border-b">
          <SheetTitle>
            <Image src="/logo-light.png" className="block dark:hidden h-8 w-auto" alt="morfx" width={85} height={32} />
            <Image src="/logo-dark.png" className="hidden dark:block h-8 w-auto" alt="morfx" width={135} height={32} />
          </SheetTitle>
        </SheetHeader>
        <nav className="p-4">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href)
              const Icon = item.icon

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  )
}

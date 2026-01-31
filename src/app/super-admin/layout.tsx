import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Building2, DollarSign, Settings, ArrowLeft } from 'lucide-react'

export default async function SuperAdminLayout({
  children
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if user is MorfX platform owner
  const MORFX_OWNER_ID = process.env.MORFX_OWNER_USER_ID

  if (!MORFX_OWNER_ID || user.id !== MORFX_OWNER_ID) {
    redirect('/dashboard')  // Unauthorized - redirect to normal dashboard
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Super Admin Header */}
      <header className="border-b bg-card">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              <span className="font-semibold">Super Admin</span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <div className="border-b">
        <div className="container">
          <nav className="flex gap-4 h-12 items-center">
            <Link
              href="/super-admin"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Overview
            </Link>
            <Link
              href="/super-admin/workspaces"
              className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <Building2 className="h-4 w-4" />
              Workspaces
            </Link>
            <Link
              href="/super-admin/costos"
              className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <DollarSign className="h-4 w-4" />
              Costos
            </Link>
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="container py-6">
        {children}
      </main>
    </div>
  )
}

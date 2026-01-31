import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Phase 1: Simple welcome page
  // Phase 2 will implement the full wizard with workspace setup
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-lg bg-primary flex items-center justify-center mb-4">
            <span className="text-primary-foreground font-bold text-2xl">M</span>
          </div>
          <CardTitle className="text-2xl">Bienvenido a morfx</CardTitle>
          <CardDescription>
            Tu plataforma para gestionar ventas por WhatsApp y CRM en un solo lugar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Estamos preparando tu workspace. La configuracion completa estara disponible proximamente.
          </p>
          <Button asChild className="w-full">
            <Link href="/crm">Continuar al dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

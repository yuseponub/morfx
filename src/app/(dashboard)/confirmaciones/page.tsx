import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ConfirmacionesPanel } from './confirmaciones-panel'

export default async function ConfirmacionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) redirect('/login')

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Confirmaciones GoDentist</h1>
          <p className="text-muted-foreground">
            Enviar confirmaciones de citas por WhatsApp
          </p>
        </div>
        <ConfirmacionesPanel />
      </div>
    </div>
  )
}

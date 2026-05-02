/**
 * /agentes/somnio-v4/unknown-cases — UI de revisión humana de unknown_cases.
 *
 * Standalone somnio-sales-v4 / Plan 10.
 *
 * D-12 obliga a entregar el loop completo día 1: capture → cluster → review humano.
 * D-23 + Regla 6: la página solo es accesible para miembros del workspace Somnio
 * (`a3843b3f-c337-4836-92b5-89c58bb98490`). Otros workspaces ven 403-style.
 *
 * Server component que fetchea via domain layer (Regla 3 — cero uso del admin
 * Supabase client aquí; toda lectura pasa por `src/lib/domain/unknown-cases.ts`).
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { listClusters, listUnclustered } from '@/lib/domain/unknown-cases'
import { SOMNIO_WORKSPACE_ID } from '@/lib/agents/somnio-v4/config'
import { ClusterCard } from './_components/ClusterCard'
import { UnclusteredList } from './_components/UnclusteredList'

export default async function UnknownCasesPage() {
  // 1. Auth + workspace gate (mismo patrón que /agentes/page.tsx)
  const supabase = await createClient()
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value

  if (!workspaceId) {
    redirect('/crm/pedidos')
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // 2. Verificar membresía en el workspace activo (RLS-style explicit check)
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    redirect('/crm/pedidos')
  }

  // Agents no acceden páginas de configuración (mismo patrón que /agentes)
  if (membership.role === 'agent') {
    redirect('/crm/pedidos')
  }

  // 3. Workspace gate Somnio-only (D-23, Regla 6 — v4 SOLO opera en Somnio)
  if (workspaceId !== SOMNIO_WORKSPACE_ID) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Casos sin resolver — Somnio v4</h1>
        </div>
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Esta página solo está disponible en el workspace Somnio. Cambia de workspace
          desde el menú superior para acceder.
        </div>
      </div>
    )
  }

  // 4. Fetch via domain layer (Regla 3)
  const ctx = { workspaceId }
  const [clusters, unclustered] = await Promise.all([
    listClusters(ctx),
    listUnclustered(ctx),
  ])

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Casos sin resolver — Somnio v4</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Mensajes de clientes que el agente escaló a humano. Los clusters de ≥10 casos
          similares en 30 días aparecen primero — listos para promover a KB doc o transition.
        </p>
      </div>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">
          Clusters listos para revisión ({clusters.length})
        </h2>
        {clusters.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay clusters maduros aún. El cron diario (4am Bogota) agrupa casos similares
            cuando ≥10 mensajes coinciden en una ventana de 30 días.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {clusters.map((c) => (
              <ClusterCard key={c.clusterId} cluster={c} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Casos sin cluster — recientes ({unclustered.length})
        </h2>
        <UnclusteredList rows={unclustered} />
      </section>
    </div>
  )
}

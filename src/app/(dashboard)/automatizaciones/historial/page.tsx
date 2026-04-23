import { cookies } from 'next/headers'
import { getAutomations, getExecutionHistory } from '@/app/actions/automations'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
import { ExecutionHistory } from '../components/execution-history'

interface PageProps {
  searchParams: Promise<{
    page?: string
    status?: string
    automationId?: string
  }>
}

export default async function HistorialPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = params.page ? parseInt(params.page, 10) : 1
  const status = params.status || undefined
  const automationId = params.automationId || undefined

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value

  const [history, automations, dashV2] = await Promise.all([
    getExecutionHistory({
      page,
      pageSize: 20,
      status,
      automationId,
    }),
    getAutomations(),
    workspaceId ? getIsDashboardV2Enabled(workspaceId) : Promise.resolve(false),
  ])

  if (dashV2) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-5 space-y-4">
          <div className="pb-3 border-b border-[var(--ink-1)]">
            <span
              className="block text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Módulo · automatizaciones · historial
            </span>
            <h1
              className="mt-1 text-[26px] leading-[1.2] font-semibold tracking-[-0.015em] text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Historial de ejecuciones
            </h1>
            <p
              className="mt-1 text-[12px] italic text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              Revisa el historial de ejecuciones de tus automatizaciones.
            </p>
          </div>
          <ExecutionHistory
            initialData={history}
            automations={automations}
            currentFilters={{ page, status, automationId }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto"><div className="container py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Historial de Ejecuciones</h1>
        <p className="text-muted-foreground">
          Revisa el historial de ejecuciones de tus automatizaciones
        </p>
      </div>
      <ExecutionHistory
        initialData={history}
        automations={automations}
        currentFilters={{ page, status, automationId }}
      />
    </div></div>
  )
}

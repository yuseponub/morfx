import { getAutomations, getExecutionHistory } from '@/app/actions/automations'
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

  const [history, automations] = await Promise.all([
    getExecutionHistory({
      page,
      pageSize: 20,
      status,
      automationId,
    }),
    getAutomations(),
  ])

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

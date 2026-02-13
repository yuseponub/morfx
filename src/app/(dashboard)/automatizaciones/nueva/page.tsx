import { cookies } from 'next/headers'
import { AutomationWizard } from '../components/automation-wizard'
import { getPipelines } from '@/app/actions/pipelines'
import { getTags } from '@/app/actions/tags'

export default async function NuevaAutomatizacionPage() {
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value

  if (!workspaceId) {
    return (
      <div className="container py-6">
        <p className="text-muted-foreground">No hay workspace seleccionado</p>
      </div>
    )
  }

  const [pipelines, tags] = await Promise.all([
    getPipelines(),
    getTags(),
  ])

  return (
    <div className="flex-1 overflow-y-auto"><div className="container py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nueva Automatizacion</h1>
        <p className="text-muted-foreground">
          Configura un trigger, condiciones y acciones
        </p>
      </div>
      <AutomationWizard pipelines={pipelines} tags={tags} />
    </div></div>
  )
}

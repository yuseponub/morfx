import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { AutomationWizard } from '../../components/automation-wizard'
import { getAutomation } from '@/app/actions/automations'
import { getPipelines } from '@/app/actions/pipelines'
import { getTags } from '@/app/actions/tags'
import { getTemplates } from '@/app/actions/templates'
import type { AutomationFormData } from '@/lib/automations/types'

interface EditPageProps {
  params: Promise<{ id: string }>
}

export default async function EditarAutomatizacionPage({ params }: EditPageProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value

  if (!workspaceId) {
    return (
      <div className="container py-6">
        <p className="text-muted-foreground">No hay workspace seleccionado</p>
      </div>
    )
  }

  const [automation, pipelines, tags, templates] = await Promise.all([
    getAutomation(id),
    getPipelines(),
    getTags(),
    getTemplates(),
  ])

  const approvedTemplates = templates.filter(t => t.status === 'APPROVED')

  if (!automation) {
    notFound()
  }

  const initialData: AutomationFormData & { id: string } = {
    id: automation.id,
    name: automation.name,
    description: automation.description ?? '',
    trigger_type: automation.trigger_type,
    trigger_config: automation.trigger_config,
    conditions: automation.conditions,
    actions: automation.actions,
  }

  return (
    <div className="flex-1 overflow-y-auto"><div className="container py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Editar Automatizacion</h1>
        <p className="text-muted-foreground">
          Modifica la configuracion de esta automatizacion
        </p>
      </div>
      <AutomationWizard
        initialData={initialData}
        pipelines={pipelines}
        tags={tags}
        templates={approvedTemplates}
      />
    </div></div>
  )
}

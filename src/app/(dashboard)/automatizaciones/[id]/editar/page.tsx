import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { AutomationWizard } from '../../components/automation-wizard'
import { getAutomation } from '@/app/actions/automations'
import { getPipelines } from '@/app/actions/pipelines'
import { getTags } from '@/app/actions/tags'
import { getTemplates } from '@/app/actions/templates'
import { getActiveProducts } from '@/app/actions/products'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
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

  const [automation, pipelines, tags, templates, products, dashV2] = await Promise.all([
    getAutomation(id),
    getPipelines(),
    getTags(),
    getTemplates(),
    getActiveProducts(),
    getIsDashboardV2Enabled(workspaceId),
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

  if (dashV2) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-5 space-y-4">
          <div className="pb-3 border-b border-[var(--ink-1)]">
            <span
              className="block text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Módulo · automatizaciones · editar
            </span>
            <h1
              className="mt-1 text-[26px] leading-[1.2] font-semibold tracking-[-0.015em] text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Editar automatización
            </h1>
            <p
              className="mt-1 text-[12px] italic text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              Modifica la configuración de esta automatización.
            </p>
          </div>
          <AutomationWizard
            initialData={initialData}
            pipelines={pipelines}
            tags={tags}
            templates={approvedTemplates}
            products={products}
          />
        </div>
      </div>
    )
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
        products={products}
      />
    </div></div>
  )
}

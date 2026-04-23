import { cookies } from 'next/headers'
import { AutomationWizard } from '../components/automation-wizard'
import { getPipelines } from '@/app/actions/pipelines'
import { getTags } from '@/app/actions/tags'
import { getTemplates } from '@/app/actions/templates'
import { getActiveProducts } from '@/app/actions/products'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'

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

  const [pipelines, tags, templates, products, dashV2] = await Promise.all([
    getPipelines(),
    getTags(),
    getTemplates(),
    getActiveProducts(),
    getIsDashboardV2Enabled(workspaceId),
  ])

  const approvedTemplates = templates.filter(t => t.status === 'APPROVED')

  if (dashV2) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-5 space-y-4">
          <div className="pb-3 border-b border-[var(--ink-1)]">
            <span
              className="block text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Módulo · automatizaciones · nueva
            </span>
            <h1
              className="mt-1 text-[26px] leading-[1.2] font-semibold tracking-[-0.015em] text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Nueva automatización
            </h1>
            <p
              className="mt-1 text-[12px] italic text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              Configura un trigger, condiciones y acciones.
            </p>
          </div>
          <AutomationWizard pipelines={pipelines} tags={tags} templates={approvedTemplates} products={products} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto"><div className="container py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nueva Automatizacion</h1>
        <p className="text-muted-foreground">
          Configura un trigger, condiciones y acciones
        </p>
      </div>
      <AutomationWizard pipelines={pipelines} tags={tags} templates={approvedTemplates} products={products} />
    </div></div>
  )
}

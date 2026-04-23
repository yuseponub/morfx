import { cookies } from 'next/headers'
import { getAutomations, getFolders } from '@/app/actions/automations'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
import { AutomationList } from './components/automation-list'

export default async function AutomatizacionesPage() {
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  const [automations, folders, dashV2] = await Promise.all([
    getAutomations(),
    getFolders(),
    workspaceId ? getIsDashboardV2Enabled(workspaceId) : Promise.resolve(false),
  ])

  if (dashV2) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-5 space-y-4">
          {/* Editorial topbar — D-DASH-14 (mock automatizaciones.html lines 297-319) */}
          <div className="pb-3 border-b border-[var(--ink-1)]">
            <span
              className="block text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Módulo · automatizaciones
            </span>
            <h1
              className="mt-1 text-[26px] leading-[1.2] font-semibold tracking-[-0.015em] text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Automatizaciones
            </h1>
          </div>
          <AutomationList initialAutomations={automations} initialFolders={folders} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto"><div className="container py-6 space-y-6">
      <AutomationList initialAutomations={automations} initialFolders={folders} />
    </div></div>
  )
}

import Link from 'next/link'
import { cookies } from 'next/headers'
import { ArrowLeftIcon } from 'lucide-react'
import { getTeams } from '@/app/actions/teams'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
import { Button } from '@/components/ui/button'
import { TeamList } from './components/team-list'

export default async function TeamsPage() {
  const teams = await getTeams()

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  const v2 = workspaceId ? await getIsDashboardV2Enabled(workspaceId) : false

  if (v2) {
    return (
      <div className="flex-1 overflow-auto bg-[var(--paper-1)]">
        {/* Editorial topbar */}
        <div className="px-8 pt-[18px] pb-[14px] border-b border-[var(--ink-1)] bg-[var(--paper-1)] flex items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
              Datos · WhatsApp
            </div>
            <h1 className="m-0 mt-0.5 text-[30px] font-bold tracking-[-0.015em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
              Equipos
              <em className="ml-2.5 text-[15px] font-normal not-italic text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
                — organiza agentes en equipos para asignar conversaciones
              </em>
            </h1>
          </div>
          <Link
            href="/configuracion/whatsapp"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] text-[13px] font-semibold hover:bg-[var(--paper-2)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Volver
          </Link>
        </div>

        <div className="px-8 py-6 max-w-[880px]">
          <TeamList teams={teams} v2={v2} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="container py-6 px-6 max-w-4xl space-y-6">
        {/* Back button */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/configuracion/whatsapp">
              <ArrowLeftIcon className="mr-2 h-4 w-4" />
              Volver
            </Link>
          </Button>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Equipos</h1>
            <p className="text-muted-foreground">
              Organiza agentes en equipos para asignar conversaciones
            </p>
          </div>
        </div>

        {/* Team list with member management */}
        <TeamList teams={teams} />
      </div>
    </div>
  )
}

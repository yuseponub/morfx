import { getTasks, getTaskTypes, getTaskSummary } from '@/app/actions/tasks'
import { getWorkspaceMembers } from '@/app/actions/invitations'
import { cookies } from 'next/headers'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
import { TaskList } from './components/task-list'

export default async function TareasPage() {
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value

  if (!workspaceId) {
    return (
      <div className="container py-6">
        <p className="text-muted-foreground">No hay workspace seleccionado</p>
      </div>
    )
  }

  // Fetch all data in parallel (Regla 6 — fetches preservados: getTasks/getTaskTypes/getWorkspaceMembers/getTaskSummary)
  const [tasks, taskTypes, members, summary, dashV2] = await Promise.all([
    getTasks({ status: 'all' }),
    getTaskTypes(),
    getWorkspaceMembers(workspaceId),
    getTaskSummary(),
    getIsDashboardV2Enabled(workspaceId),
  ])

  return (
    <div className="container py-6 space-y-6">
      {dashV2 ? (
        // Editorial topbar — D-DASH-12 + D-DASH-14 (mock tareas.html lines 306-321)
        <div className="flex items-end justify-between gap-3 pb-3 border-b border-[var(--ink-1)]">
          <div>
            <span
              className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Módulo · Operación
            </span>
            <h1
              className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.015em] text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Tareas
              <em
                className="ml-2 not-italic text-[14px] font-normal text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                {`· ${summary.pending} abierta${summary.pending !== 1 ? 's' : ''}`}
                {summary.overdue > 0 &&
                  ` · ${summary.overdue} vence${summary.overdue !== 1 ? 'n' : ''} hoy`}
              </em>
            </h1>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Tareas</h1>
            <p className="text-muted-foreground">
              Gestiona tus tareas y recordatorios
              {summary.pending > 0 && (
                <span className="ml-2">
                  ({summary.pending} pendiente{summary.pending !== 1 ? 's' : ''}
                  {summary.overdue > 0 && (
                    <span className="text-destructive"> - {summary.overdue} vencida{summary.overdue !== 1 ? 's' : ''}</span>
                  )}
                  )
                </span>
              )}
            </p>
          </div>
        </div>
      )}
      <TaskList
        initialTasks={tasks}
        taskTypes={taskTypes}
        members={members}
        dashV2={dashV2}
      />
    </div>
  )
}

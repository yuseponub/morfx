import { cookies } from 'next/headers'
import { Clock } from 'lucide-react'
import { getTaskTypes } from '@/app/actions/tasks'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TaskTypesManager } from './components/task-types-manager'

export default async function TareasConfigPage() {
  const taskTypes = await getTaskTypes()

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
              Workspace
            </div>
            <h1 className="m-0 mt-0.5 text-[30px] font-bold tracking-[-0.015em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
              Tareas
              <em className="ml-2.5 text-[15px] font-normal not-italic text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
                — personaliza los tipos de tarea y opciones
              </em>
            </h1>
          </div>
        </div>

        <div className="px-8 py-6 max-w-[880px] space-y-[18px]">
          {/* Card: Tipos de Tarea */}
          <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)]">
            <div className="px-[18px] py-[14px] border-b border-[var(--border)]">
              <h3 className="text-[18px] font-bold tracking-[-0.01em] m-0" style={{ fontFamily: 'var(--font-display)' }}>Tipos de Tarea</h3>
              <p className="text-[12px] text-[var(--ink-3)] mt-[3px] m-0" style={{ fontFamily: 'var(--font-sans)' }}>
                Crea y organiza los tipos de tarea para tu equipo. Los tipos ayudan a categorizar tareas como &quot;Llamada&quot;, &quot;Seguimiento&quot;, &quot;Cobro&quot;, etc.
              </p>
            </div>
            <div className="px-[18px] py-[16px]">
              <TaskTypesManager initialTypes={taskTypes} v2={v2} />
            </div>
          </div>

          {/* Future feature card editorial dimmed */}
          <div className="bg-[var(--paper-0)] border border-[var(--border)] rounded-[var(--radius-3)] opacity-60">
            <div className="px-[18px] py-[14px] border-b border-[var(--border)]">
              <h3 className="text-[18px] font-bold tracking-[-0.01em] m-0" style={{ fontFamily: 'var(--font-display)' }}>Recordatorios</h3>
              <p className="text-[12px] text-[var(--ink-3)] mt-[3px] m-0" style={{ fontFamily: 'var(--font-sans)' }}>
                Proximamente: configura cuando recibir notificaciones de tareas.
              </p>
            </div>
            <div className="px-[18px] py-[16px]">
              <p className="text-[13px] text-[var(--ink-3)] flex items-center gap-2" style={{ fontFamily: 'var(--font-sans)' }}>
                <Clock className="h-4 w-4" />
                Esta funcionalidad estara disponible pronto.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container py-6 space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Configuracion de Tareas</h1>
        <p className="text-muted-foreground">
          Personaliza los tipos de tarea y opciones
        </p>
      </div>

      {/* Task Types Section */}
      <Card>
        <CardHeader>
          <CardTitle>Tipos de Tarea</CardTitle>
          <CardDescription>
            Crea y organiza los tipos de tarea para tu equipo. Los tipos ayudan a categorizar
            tareas como "Llamada", "Seguimiento", "Cobro", etc.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaskTypesManager initialTypes={taskTypes} />
        </CardContent>
      </Card>

      {/* Future: Reminder settings */}
      <Card className="opacity-60">
        <CardHeader>
          <CardTitle>Recordatorios</CardTitle>
          <CardDescription>
            Proximamente: configura cuando recibir notificaciones de tareas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Esta funcionalidad estara disponible pronto.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

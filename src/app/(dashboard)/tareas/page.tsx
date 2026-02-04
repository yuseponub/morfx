import { getTasks, getTaskTypes, getTaskSummary } from '@/app/actions/tasks'
import { getWorkspaceMembers } from '@/app/actions/invitations'
import { cookies } from 'next/headers'
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

  // Fetch all data in parallel
  const [tasks, taskTypes, members, summary] = await Promise.all([
    getTasks({ status: 'all' }),
    getTaskTypes(),
    getWorkspaceMembers(workspaceId),
    getTaskSummary(),
  ])

  return (
    <div className="container py-6 space-y-6">
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
      <TaskList
        initialTasks={tasks}
        taskTypes={taskTypes}
        members={members}
      />
    </div>
  )
}

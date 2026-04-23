import { getTaskTypes } from '@/app/actions/tasks'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TaskTypesManager } from './components/task-types-manager'

export default async function TareasConfigPage() {
  const taskTypes = await getTaskTypes()

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

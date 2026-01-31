import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserWorkspaces } from '@/app/actions/workspace'
import { PermissionMatrix } from '@/components/workspace/permission-matrix'

export default async function RolesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const workspaces = await getUserWorkspaces()

  if (workspaces.length === 0) {
    redirect('/create-workspace')
  }

  // Get selected workspace from cookie
  const cookieStore = await cookies()
  const selectedWorkspaceId = cookieStore.get('morfx_workspace')?.value

  // Find selected workspace or use first one
  const currentWorkspace = workspaces.find(w => w.id === selectedWorkspaceId) || workspaces[0]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Roles y permisos</h1>
        <p className="text-muted-foreground">
          Consulta los permisos disponibles para cada rol en {currentWorkspace.name}
        </p>
      </div>

      <PermissionMatrix />

      <div className="rounded-lg border p-4 bg-muted/50">
        <h3 className="font-medium mb-2">Sobre los roles</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">Propietario:</strong> Control total del workspace.
            Puede eliminar el workspace y transferir la propiedad.
          </li>
          <li>
            <strong className="text-foreground">Admin:</strong> Puede gestionar miembros e
            invitaciones, pero no puede eliminar el workspace ni cambiar al propietario.
          </li>
          <li>
            <strong className="text-foreground">Agente:</strong> Acceso basico para trabajar con
            contactos, pedidos y WhatsApp. No puede gestionar miembros ni configuracion avanzada.
          </li>
        </ul>
      </div>
    </div>
  )
}

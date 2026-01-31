import Link from 'next/link'
import { getAllWorkspaces } from '@/app/actions/super-admin'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronRight, Users } from 'lucide-react'

export default async function WorkspacesPage() {
  const workspaces = await getAllWorkspaces()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Workspaces</h1>
        <p className="text-muted-foreground">
          Gestiona configuraciones por workspace
        </p>
      </div>

      <div className="space-y-3">
        {workspaces.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No hay workspaces registrados
            </CardContent>
          </Card>
        ) : (
          workspaces.map((workspace) => (
            <Link key={workspace.id} href={`/super-admin/workspaces/${workspace.id}`}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <h3 className="font-medium">{workspace.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      {workspace.member_count} miembros
                      <span className="mx-1">·</span>
                      {new Date(workspace.created_at).toLocaleDateString('es-CO')}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

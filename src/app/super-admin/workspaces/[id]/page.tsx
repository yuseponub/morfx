import { notFound } from 'next/navigation'
import { getWorkspaceDetails } from '@/app/actions/super-admin'
import { WorkspaceLimitsForm } from './components/workspace-limits-form'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface Props {
  params: Promise<{ id: string }>
}

export default async function WorkspaceConfigPage({ params }: Props) {
  const { id } = await params
  const { workspace, limits } = await getWorkspaceDetails(id)

  if (!workspace) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/super-admin/workspaces">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{workspace.name}</h1>
          <p className="text-muted-foreground">Configuracion del workspace</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Miembros</CardTitle>
            <CardDescription>Usuarios en este workspace</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {workspace.workspace_members?.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin miembros</p>
              ) : (
                workspace.workspace_members?.map((member: {
                  user_id: string
                  role: string
                  profiles: { email: string; full_name: string | null } | null
                }) => (
                  <div key={member.user_id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">
                        {member.profiles?.full_name || member.profiles?.email}
                      </p>
                      {member.profiles?.full_name && (
                        <p className="text-xs text-muted-foreground">
                          {member.profiles?.email}
                        </p>
                      )}
                    </div>
                    <span className="text-xs bg-muted px-2 py-1 rounded capitalize">
                      {member.role}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Limites y Configuracion</CardTitle>
            <CardDescription>Configuraciones especiales para este workspace</CardDescription>
          </CardHeader>
          <CardContent>
            <WorkspaceLimitsForm workspaceId={id} initialLimits={limits} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

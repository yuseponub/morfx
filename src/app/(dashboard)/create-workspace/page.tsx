import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserWorkspaces } from '@/app/actions/workspace'
import { CreateWorkspaceForm } from '@/components/workspace/create-workspace-form'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default async function CreateWorkspacePage() {
  const supabase = await createClient()
  // getClaims() (verify local, sin refresh) en lugar de getUser(): este guard
  // sin instrumentar era el que abortaba el ciclo action→revalidate de
  // createWorkspace con AuthSessionMissingError (C-1, FINDINGS-C1).
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims?.sub) {
    redirect('/login')
  }

  // Check if user already has workspaces
  const workspaces = await getUserWorkspaces()

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {workspaces.length > 0 ? 'Crear nuevo workspace' : 'Crea tu primer workspace'}
          </CardTitle>
          <CardDescription>
            {workspaces.length > 0
              ? 'Agrega otro workspace a tu cuenta'
              : 'Un workspace es donde tu equipo colabora'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateWorkspaceForm />
        </CardContent>
      </Card>
    </div>
  )
}

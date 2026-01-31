import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getInvitationByToken } from '@/app/actions/invitations'
import { AcceptInvitationButton } from './accept-button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface InvitePageProps {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params
  const invitation = await getInvitationByToken(token)

  if (!invitation) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Invitacion no valida</CardTitle>
            <CardDescription>
              Esta invitacion ha expirado o ya fue utilizada.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Link href="/login">
              <Button>Ir a iniciar sesion</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const roleLabels: Record<string, string> = {
    admin: 'Administrador',
    agent: 'Agente',
  }

  // If not logged in, show login prompt
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Te han invitado</CardTitle>
            <CardDescription>
              Has sido invitado a unirte a <strong>{invitation.workspace.name}</strong> como{' '}
              <strong>{roleLabels[invitation.role]}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Inicia sesion o crea una cuenta para aceptar la invitacion.
            </p>
            <div className="flex flex-col gap-2">
              <Link href={`/login?redirect=/invite/${token}`}>
                <Button className="w-full">Iniciar sesion</Button>
              </Link>
              <Link href={`/signup?redirect=/invite/${token}`}>
                <Button variant="outline" className="w-full">
                  Crear cuenta
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Check if invitation email matches user email
  const emailMismatch = invitation.email !== user.email

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Unirte a {invitation.workspace.name}</CardTitle>
          <CardDescription>
            Has sido invitado como <strong>{roleLabels[invitation.role]}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {emailMismatch ? (
            <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
              <p>
                Esta invitacion fue enviada a <strong>{invitation.email}</strong>, pero
                estas conectado como <strong>{user.email}</strong>.
              </p>
              <p className="mt-2">
                Por favor inicia sesion con el correo correcto para aceptar la invitacion.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center">
              Al aceptar, tendras acceso a los recursos del workspace segun tu rol.
            </p>
          )}

          <AcceptInvitationButton
            token={token}
            disabled={emailMismatch}
          />
        </CardContent>
      </Card>
    </div>
  )
}

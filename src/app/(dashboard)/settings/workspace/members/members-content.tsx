'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, MoreHorizontal, Trash2, Shield, User, Clock, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { InviteMemberForm } from '@/components/workspace/invite-member-form'
import { removeMember, updateMemberRole, cancelInvitation } from '@/app/actions/invitations'
import type { WorkspaceWithRole, MemberWithUser, WorkspaceInvitation } from '@/lib/types/database'

interface MembersPageContentProps {
  workspace: WorkspaceWithRole
  members: MemberWithUser[]
  invitations: WorkspaceInvitation[]
  isAdmin: boolean
  currentUserId: string
}

const roleLabels: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Admin',
  agent: 'Agente',
}

const roleIcons: Record<string, typeof User> = {
  owner: Shield,
  admin: Shield,
  agent: User,
}

export function MembersPageContent({
  workspace,
  members,
  invitations,
  isAdmin,
  currentUserId,
}: MembersPageContentProps) {
  const router = useRouter()
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [loadingMemberId, setLoadingMemberId] = useState<string | null>(null)

  async function handleRemoveMember(memberId: string) {
    if (!confirm('Estas seguro de eliminar este miembro?')) return
    setLoadingMemberId(memberId)
    await removeMember(workspace.id, memberId)
    router.refresh()
    setLoadingMemberId(null)
  }

  async function handleChangeRole(memberId: string, newRole: 'admin' | 'agent') {
    setLoadingMemberId(memberId)
    await updateMemberRole(workspace.id, memberId, newRole)
    router.refresh()
    setLoadingMemberId(null)
  }

  async function handleCancelInvitation(invitationId: string) {
    if (!confirm('Estas seguro de cancelar esta invitacion?')) return
    await cancelInvitation(invitationId)
    router.refresh()
  }

  function getInitials(email: string): string {
    return email.slice(0, 2).toUpperCase()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Equipo</h1>
          <p className="text-muted-foreground">
            Gestiona los miembros de {workspace.name}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowInviteForm(!showInviteForm)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Invitar
          </Button>
        )}
      </div>

      {showInviteForm && isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Invitar nuevo miembro</CardTitle>
            <CardDescription>
              Envia una invitacion por correo electronico
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteMemberForm
              workspaceId={workspace.id}
              onSuccess={() => {
                router.refresh()
              }}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Miembros ({members.length})</CardTitle>
          <CardDescription>
            Personas con acceso a este workspace
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {members.map((member) => {
              const RoleIcon = roleIcons[member.role] || User
              const isCurrentUser = member.user_id === currentUserId
              const canManage = isAdmin && member.role !== 'owner' && !isCurrentUser

              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>
                        {getInitials(member.user.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">
                        {member.user.email}
                        {isCurrentUser && (
                          <span className="ml-2 text-xs text-muted-foreground">(tu)</span>
                        )}
                      </p>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <RoleIcon className="h-3 w-3" />
                        <span>{roleLabels[member.role]}</span>
                      </div>
                    </div>
                  </div>

                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={loadingMemberId === member.id}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            handleChangeRole(
                              member.id,
                              member.role === 'admin' ? 'agent' : 'admin'
                            )
                          }
                        >
                          <Shield className="mr-2 h-4 w-4" />
                          {member.role === 'admin'
                            ? 'Cambiar a Agente'
                            : 'Promover a Admin'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleRemoveMember(member.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Invitaciones pendientes ({invitations.length})</CardTitle>
            <CardDescription>
              Invitaciones que aun no han sido aceptadas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{invitation.email}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{roleLabels[invitation.role]}</span>
                        <span>-</span>
                        <Clock className="h-3 w-3" />
                        <span>
                          Expira {new Date(invitation.expires_at).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancelInvitation(invitation.id)}
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

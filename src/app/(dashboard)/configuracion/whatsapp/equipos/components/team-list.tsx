'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TeamForm } from './team-form'
import { TeamMembersManager } from './team-members-manager'
import { deleteTeam, Team } from '@/app/actions/teams'
import { toast } from 'sonner'
import { Users, Edit, Trash2, ChevronDown, ChevronUp, Star, Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

interface TeamWithCount extends Team {
  member_count: number
}

interface TeamListProps {
  teams: TeamWithCount[]
}

export function TeamList({ teams }: TeamListProps) {
  const router = useRouter()
  const [expandedId, setExpandedId] = useState<string | null>(
    teams.length > 0 ? teams[0].id : null
  )
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete() {
    if (!deletingTeam) return

    setIsDeleting(true)
    const result = await deleteTeam(deletingTeam.id)
    setIsDeleting(false)

    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Equipo eliminado')
      router.refresh()
    }

    setDeletingTeam(null)
  }

  return (
    <>
      {/* Create team button */}
      <div className="flex justify-end mb-4">
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Equipo
        </Button>
      </div>

      {/* Empty state */}
      {teams.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium text-lg">No hay equipos</h3>
            <p className="text-muted-foreground mb-4">
              Crea un equipo para organizar a tus agentes
            </p>
            <Button variant="outline" onClick={() => setShowCreateForm(true)}>
              Crear primer equipo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {teams.map((team) => (
            <Card key={team.id} className="py-0">
              <CardHeader
                className={cn(
                  'cursor-pointer hover:bg-muted/50 transition-colors py-4',
                  expandedId === team.id && 'border-b'
                )}
                onClick={() => setExpandedId(expandedId === team.id ? null : team.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {expandedId === team.id ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronUp className="h-5 w-5 text-muted-foreground rotate-180" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-medium">{team.name}</CardTitle>
                        {team.is_default && (
                          <Badge variant="secondary" className="gap-1">
                            <Star className="h-3 w-3" />
                            Por defecto
                          </Badge>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {team.member_count} miembro{team.member_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingTeam(team)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeletingTeam(team)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {expandedId === team.id && (
                <CardContent className="pt-4 pb-4">
                  <TeamMembersManager teamId={team.id} />
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Create team dialog */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Equipo</DialogTitle>
          </DialogHeader>
          <TeamForm onSuccess={() => setShowCreateForm(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit team dialog */}
      <Dialog open={!!editingTeam} onOpenChange={() => setEditingTeam(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Equipo</DialogTitle>
          </DialogHeader>
          {editingTeam && (
            <TeamForm team={editingTeam} onSuccess={() => setEditingTeam(null)} />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deletingTeam} onOpenChange={() => setDeletingTeam(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar equipo</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion no se puede deshacer. Debes eliminar los miembros del equipo primero.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

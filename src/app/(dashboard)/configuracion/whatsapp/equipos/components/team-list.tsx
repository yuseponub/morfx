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
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

interface TeamWithCount extends Team {
  member_count: number
}

interface TeamListProps {
  teams: TeamWithCount[]
  v2?: boolean
}

export function TeamList({ teams, v2: v2Prop }: TeamListProps) {
  const v2Hook = useDashboardV2()
  const v2 = v2Prop ?? v2Hook
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

  const btnPrimaryV2 = v2
    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] !bg-[var(--ink-1)] !text-[var(--paper-0)] hover:!bg-[var(--ink-2)] !border !border-[var(--ink-1)] !shadow-[0_1px_0_var(--ink-1)] text-[13px] font-semibold'
    : ''
  const btnSecondaryV2 = v2
    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] text-[13px] font-semibold shadow-none hover:bg-[var(--paper-2)]'
    : ''
  const cardV2 = v2 ? '!bg-[var(--paper-0)] !border !border-[var(--ink-1)] !rounded-[var(--radius-3)] !shadow-[0_1px_0_var(--ink-1)]' : ''
  const v2FontSans = v2 ? { fontFamily: 'var(--font-sans)' } : undefined
  const v2FontDisplay = v2 ? { fontFamily: 'var(--font-display)' } : undefined

  return (
    <>
      {/* Create team button */}
      <div className="flex justify-end mb-4">
        <Button onClick={() => setShowCreateForm(true)} className={btnPrimaryV2} style={v2FontSans}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Equipo
        </Button>
      </div>

      {/* Empty state */}
      {teams.length === 0 ? (
        v2 ? (
          <div className="text-center py-12 flex flex-col items-center gap-3">
            <Users className="h-10 w-10 text-[var(--ink-3)] opacity-50" />
            <p className="mx-h3">No hay equipos todavia.</p>
            <p className="mx-caption">Crea un equipo para agrupar agentes y asignar conversaciones automaticamente.</p>
            <p className="mx-rule-ornament">· · ·</p>
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] text-[13px] font-semibold shadow-none hover:bg-[var(--paper-2)] mt-1"
              style={v2FontSans}
            >
              Crear primer equipo
            </button>
          </div>
        ) : (
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
        )
      ) : (
        <div className="space-y-3">
          {teams.map((team) => (
            <Card key={team.id} className={cn('py-0', cardV2)}>
              <CardHeader
                className={cn(
                  'cursor-pointer transition-colors py-4',
                  v2 ? 'hover:bg-[var(--paper-1)]' : 'hover:bg-muted/50',
                  expandedId === team.id && (v2 ? 'border-b border-[var(--border)]' : 'border-b')
                )}
                onClick={() => setExpandedId(expandedId === team.id ? null : team.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {expandedId === team.id ? (
                      <ChevronDown className={cn('h-5 w-5 text-muted-foreground', v2 && '!text-[var(--ink-3)]')} />
                    ) : (
                      <ChevronUp className={cn('h-5 w-5 text-muted-foreground rotate-180', v2 && '!text-[var(--ink-3)]')} />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className={cn('text-base font-medium', v2 && '!text-[15px] !font-bold !tracking-[-0.01em] !text-[var(--ink-1)]')} style={v2FontDisplay}>{team.name}</CardTitle>
                        {team.is_default && (
                          v2 ? (
                            <span className="mx-tag mx-tag--gold inline-flex items-center gap-1">
                              <Star className="h-3 w-3" />
                              Por defecto
                            </span>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <Star className="h-3 w-3" />
                              Por defecto
                            </Badge>
                          )
                        )}
                      </div>
                      <span className={cn('text-sm text-muted-foreground', v2 && '!text-[11px] !text-[var(--ink-3)]')} style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}>
                        {team.member_count} miembro{team.member_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingTeam(team)}
                      className={cn(v2 && 'text-[var(--ink-2)] hover:bg-[var(--paper-2)] hover:text-[var(--ink-1)]')}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn('text-destructive hover:text-destructive', v2 && '!text-[oklch(0.55_0.14_28)] hover:!bg-[oklch(0.98_0.02_28)]')}
                      onClick={() => setDeletingTeam(team)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {expandedId === team.id && (
                <CardContent className="pt-4 pb-4">
                  <TeamMembersManager teamId={team.id} v2={v2} />
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Create team dialog */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className={cn(v2 && 'bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_2px_0_var(--ink-1)]')}>
          <DialogHeader>
            <DialogTitle className={cn(v2 && 'text-[20px] font-bold tracking-[-0.01em]')} style={v2FontDisplay}>Crear Equipo</DialogTitle>
          </DialogHeader>
          <TeamForm onSuccess={() => setShowCreateForm(false)} v2={v2} />
        </DialogContent>
      </Dialog>

      {/* Edit team dialog */}
      <Dialog open={!!editingTeam} onOpenChange={() => setEditingTeam(null)}>
        <DialogContent className={cn(v2 && 'bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_2px_0_var(--ink-1)]')}>
          <DialogHeader>
            <DialogTitle className={cn(v2 && 'text-[20px] font-bold tracking-[-0.01em]')} style={v2FontDisplay}>Editar Equipo</DialogTitle>
          </DialogHeader>
          {editingTeam && (
            <TeamForm team={editingTeam} onSuccess={() => setEditingTeam(null)} v2={v2} />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deletingTeam} onOpenChange={() => setDeletingTeam(null)}>
        <AlertDialogContent className={cn(v2 && 'bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_2px_0_var(--ink-1)]')}>
          <AlertDialogHeader>
            <AlertDialogTitle className={cn(v2 && 'text-[20px] font-bold tracking-[-0.01em]')} style={v2FontDisplay}>Eliminar equipo</AlertDialogTitle>
            <AlertDialogDescription className={cn(v2 && 'text-[13px] text-[var(--ink-2)]')} style={v2FontSans}>
              Esta accion no se puede deshacer. Debes eliminar los miembros del equipo primero.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} className={btnSecondaryV2} style={v2FontSans}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className={cn(
                'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                v2 && 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] !border !border-[oklch(0.75_0.10_28)] !bg-[var(--paper-0)] !text-[oklch(0.38_0.14_28)] !shadow-[0_1px_0_oklch(0.75_0.10_28)] hover:!bg-[oklch(0.98_0.02_28)] text-[13px] font-semibold'
              )}
              style={v2FontSans}
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

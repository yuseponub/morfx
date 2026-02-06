'use client'

/**
 * Saved Sessions Modal Component
 * Phase 15: Agent Sandbox
 *
 * Lists saved sessions with option to load or delete.
 */

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Trash2, MessageSquare, Coins } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { SavedSandboxSession } from '@/lib/sandbox/types'
import { loadSandboxSessions, deleteSandboxSession } from '@/lib/sandbox/sandbox-session'
import { toast } from 'sonner'

interface SavedSessionsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLoadSession: (session: SavedSandboxSession) => void
}

export function SavedSessionsModal({
  open,
  onOpenChange,
  onLoadSession,
}: SavedSessionsModalProps) {
  const [sessions, setSessions] = useState<SavedSandboxSession[]>([])
  const [sessionToDelete, setSessionToDelete] = useState<SavedSandboxSession | null>(null)

  // Load sessions when modal opens
  useEffect(() => {
    if (open) {
      setSessions(loadSandboxSessions())
    }
  }, [open])

  const handleDelete = (session: SavedSandboxSession) => {
    setSessionToDelete(session)
  }

  const confirmDelete = () => {
    if (sessionToDelete) {
      deleteSandboxSession(sessionToDelete.id)
      setSessions(sessions.filter(s => s.id !== sessionToDelete.id))
      toast.success('Sesion eliminada')
      setSessionToDelete(null)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Sesiones guardadas</DialogTitle>
            <DialogDescription>
              Selecciona una sesion para continuar la prueba.
            </DialogDescription>
          </DialogHeader>

          {sessions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No hay sesiones guardadas
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2 pr-4">
                {sessions.map(session => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <button
                      className="flex-1 text-left"
                      onClick={() => onLoadSession(session)}
                    >
                      <div className="font-medium">{session.name}</div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {session.messages.length}
                        </span>
                        <span className="flex items-center gap-1">
                          <Coins className="h-3 w-3" />
                          {session.totalTokens.toLocaleString()}
                        </span>
                        <span>
                          {format(new Date(session.createdAt), 'dd/MM HH:mm')}
                        </span>
                      </div>
                    </button>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(session)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!sessionToDelete} onOpenChange={() => setSessionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar sesion?</AlertDialogTitle>
            <AlertDialogDescription>
              Esto eliminara permanentemente la sesion &quot;{sessionToDelete?.name}&quot;.
              Esta accion no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

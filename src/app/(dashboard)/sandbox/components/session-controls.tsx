'use client'

/**
 * Session Controls Component
 * Phase 15: Agent Sandbox
 *
 * Toolbar buttons for session management:
 * - New Session (with confirmation)
 * - Save Session
 * - Load Session (opens modal)
 */

import { useState } from 'react'
import { Plus, Save, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SavedSessionsModal } from './saved-sessions-modal'
import type { SavedSandboxSession, SandboxMessage, SandboxState, DebugTurn } from '@/lib/sandbox/types'
import { saveSandboxSession, generateSessionId } from '@/lib/sandbox/sandbox-session'
import { toast } from 'sonner'

interface SessionControlsProps {
  agentId: string
  messages: SandboxMessage[]
  state: SandboxState
  debugTurns: DebugTurn[]
  totalTokens: number
  hasMessages: boolean
  onNewSession: () => void
  onLoadSession: (session: SavedSandboxSession) => void
}

export function SessionControls({
  agentId,
  messages,
  state,
  debugTurns,
  totalTokens,
  hasMessages,
  onNewSession,
  onLoadSession,
}: SessionControlsProps) {
  const [showNewConfirm, setShowNewConfirm] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showLoadModal, setShowLoadModal] = useState(false)
  const [sessionName, setSessionName] = useState('')

  const handleNewSession = () => {
    if (hasMessages) {
      setShowNewConfirm(true)
    } else {
      onNewSession()
    }
  }

  const handleConfirmNew = () => {
    setShowNewConfirm(false)
    onNewSession()
  }

  const handleSave = () => {
    if (!sessionName.trim()) {
      toast.error('Por favor ingresa un nombre para la sesion')
      return
    }

    const session: SavedSandboxSession = {
      id: generateSessionId(),
      name: sessionName.trim(),
      agentId,
      messages,
      state,
      debugTurns,
      totalTokens,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    saveSandboxSession(session)
    toast.success('Sesion guardada')
    setShowSaveDialog(false)
    setSessionName('')
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleNewSession}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nueva
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSaveDialog(true)}
          disabled={!hasMessages}
        >
          <Save className="h-4 w-4 mr-1.5" />
          Guardar
        </Button>

        <Button variant="outline" size="sm" onClick={() => setShowLoadModal(true)}>
          <FolderOpen className="h-4 w-4 mr-1.5" />
          Cargar
        </Button>
      </div>

      {/* New Session Confirmation */}
      <AlertDialog open={showNewConfirm} onOpenChange={setShowNewConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Crear nueva sesion?</AlertDialogTitle>
            <AlertDialogDescription>
              Tienes una conversacion activa. Al crear una nueva sesion perderas
              los mensajes actuales a menos que los guardes primero.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmNew}>
              Crear nueva
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save Session Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guardar sesion</DialogTitle>
            <DialogDescription>
              Elige un nombre para identificar esta sesion de prueba.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="session-name">Nombre de la sesion</Label>
              <Input
                id="session-name"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="Ej: Test flujo de compra"
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
            </div>

            <div className="text-sm text-muted-foreground">
              {messages.length} mensajes | {totalTokens.toLocaleString()} tokens
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load Sessions Modal */}
      <SavedSessionsModal
        open={showLoadModal}
        onOpenChange={setShowLoadModal}
        onLoadSession={(session) => {
          onLoadSession(session)
          setShowLoadModal(false)
        }}
      />
    </>
  )
}

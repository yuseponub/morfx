'use client'

/**
 * Sandbox Header Component
 * Phase 15: Agent Sandbox
 *
 * Toolbar with agent selector and session controls.
 * Shows agent name + status.
 */

import { Bot, RotateCcw, Coins } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { setLastAgentId } from '@/lib/sandbox/sandbox-session'

// Available agents - will grow as more agents are registered
const AVAILABLE_AGENTS = [
  { id: 'somnio-sales-v1', name: 'Somnio Sales Agent' },
]

interface SandboxHeaderProps {
  agentId: string
  onAgentChange: (agentId: string) => void
  onReset: () => void
  totalTokens: number
  messageCount: number
}

export function SandboxHeader({
  agentId,
  onAgentChange,
  onReset,
  totalTokens,
  messageCount,
}: SandboxHeaderProps) {
  const handleAgentChange = (newAgentId: string) => {
    setLastAgentId(newAgentId)
    onAgentChange(newAgentId)
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
      {/* Left: Agent selector and status */}
      <div className="flex items-center gap-3">
        <Bot className="h-5 w-5 text-primary" />

        <Select value={agentId} onValueChange={handleAgentChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Seleccionar agente" />
          </SelectTrigger>
          <SelectContent>
            {AVAILABLE_AGENTS.map(agent => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          Activo
        </span>
      </div>

      {/* Right: Stats and controls */}
      <div className="flex items-center gap-4">
        {/* Token counter */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Coins className="h-4 w-4" />
          <span>{totalTokens.toLocaleString()} tokens</span>
          <span className="mx-1">|</span>
          <span>{messageCount} mensajes</span>
        </div>

        {/* Reset button with confirmation */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={messageCount === 0}>
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Resetear
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Resetear sesion?</AlertDialogTitle>
              <AlertDialogDescription>
                Esto borrara todos los mensajes y el estado actual de la conversacion.
                Esta accion no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={onReset}>
                Resetear
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

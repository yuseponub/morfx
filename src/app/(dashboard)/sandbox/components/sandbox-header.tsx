'use client'

/**
 * Sandbox Header Component
 * Phase 15: Agent Sandbox
 *
 * Toolbar with agent selector, session controls, CRM agent multi-select, and stats.
 */

import { useState } from 'react'
import { Bot, RotateCcw, Coins, Settings } from 'lucide-react'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { SessionControls } from './session-controls'
import { setLastAgentId } from '@/lib/sandbox/sandbox-session'
import type { SandboxMessage, SandboxState, DebugTurn, SavedSandboxSession, CrmAgentState, CrmExecutionMode } from '@/lib/sandbox/types'

// Available agents - will grow as more agents are registered
const AVAILABLE_AGENTS = [
  { id: 'somnio-sales-v1', name: 'Somnio Sales Agent' },
]

interface SandboxHeaderProps {
  agentId: string
  onAgentChange: (agentId: string) => void
  onReset: () => void
  onNewSession: () => void
  onLoadSession: (session: SavedSandboxSession) => void
  totalTokens: number
  messageCount: number
  messages: SandboxMessage[]
  state: SandboxState
  debugTurns: DebugTurn[]
  crmAgents: CrmAgentState[]
  onCrmAgentToggle: (agentId: string, enabled: boolean) => void
  onCrmAgentModeChange: (agentId: string, mode: CrmExecutionMode) => void
}

export function SandboxHeader({
  agentId,
  onAgentChange,
  onReset,
  onNewSession,
  onLoadSession,
  totalTokens,
  messageCount,
  messages,
  state,
  debugTurns,
  crmAgents,
  onCrmAgentToggle,
  onCrmAgentModeChange,
}: SandboxHeaderProps) {
  const [crmPopoverOpen, setCrmPopoverOpen] = useState(false)

  const handleAgentChange = (newAgentId: string) => {
    setLastAgentId(newAgentId)
    onAgentChange(newAgentId)
  }

  const enabledCrmCount = crmAgents.filter(a => a.enabled).length

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
      {/* Left: Agent selector, CRM agents, and status */}
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

        {/* CRM Agent Multi-Select */}
        {crmAgents.length > 0 && (
          <Popover open={crmPopoverOpen} onOpenChange={setCrmPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Settings className="h-4 w-4" />
                CRM Agents
                {enabledCrmCount > 0 && (
                  <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                    {enabledCrmCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
              <div className="space-y-3">
                <div className="text-sm font-medium">CRM Agents</div>
                <p className="text-xs text-muted-foreground">
                  Selecciona agentes CRM para ejecutar cuando se cree una orden.
                </p>
                <div className="space-y-3">
                  {crmAgents.map(agent => (
                    <CrmAgentRow
                      key={agent.agentId}
                      agent={agent}
                      onToggle={onCrmAgentToggle}
                      onModeChange={onCrmAgentModeChange}
                    />
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}

        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          Activo
        </span>
      </div>

      {/* Center: Session controls */}
      <SessionControls
        agentId={agentId}
        messages={messages}
        state={state}
        debugTurns={debugTurns}
        totalTokens={totalTokens}
        hasMessages={messageCount > 0}
        onNewSession={onNewSession}
        onLoadSession={onLoadSession}
      />

      {/* Right: Stats and reset */}
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

// ============================================================================
// CRM Agent Row Sub-Component
// ============================================================================

function CrmAgentRow({
  agent,
  onToggle,
  onModeChange,
}: {
  agent: CrmAgentState
  onToggle: (agentId: string, enabled: boolean) => void
  onModeChange: (agentId: string, mode: CrmExecutionMode) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-2">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Checkbox
          id={`crm-${agent.agentId}`}
          checked={agent.enabled}
          onCheckedChange={(checked) => onToggle(agent.agentId, checked === true)}
        />
        <label
          htmlFor={`crm-${agent.agentId}`}
          className="text-sm cursor-pointer truncate"
          title={agent.description}
        >
          {agent.name}
        </label>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground">
          {agent.mode === 'dry-run' ? 'DRY' : 'LIVE'}
        </span>
        <Switch
          checked={agent.mode === 'live'}
          onCheckedChange={(checked) =>
            onModeChange(agent.agentId, checked ? 'live' : 'dry-run')
          }
          disabled={!agent.enabled}
          aria-label={`Toggle ${agent.name} live mode`}
        />
      </div>
    </div>
  )
}

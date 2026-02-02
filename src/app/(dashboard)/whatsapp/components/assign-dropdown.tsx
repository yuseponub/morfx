'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { getAvailableAgents, assignConversation } from '@/app/actions/assignment'
import { toast } from 'sonner'
import { User, UserPlus, Circle, Loader2 } from 'lucide-react'

interface AssignDropdownProps {
  conversationId: string
  currentAssignee?: {
    id: string
    name: string
  } | null
  onAssign?: (assignee: { id: string; name: string } | null) => void
}

/**
 * Dropdown to manually assign a conversation to an agent.
 * Shows agents grouped by team with online/offline status.
 */
export function AssignDropdown({ conversationId, currentAssignee, onAssign }: AssignDropdownProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [agents, setAgents] = useState<{
    id: string
    name: string
    team: string
    teamId: string
    is_online: boolean
  }[]>([])
  const [loadingAgents, setLoadingAgents] = useState(false)

  useEffect(() => {
    if (open) {
      loadAgents()
    }
  }, [open])

  async function loadAgents() {
    setLoadingAgents(true)
    try {
      const data = await getAvailableAgents()
      setAgents(data)
    } catch (error) {
      toast.error('Error al cargar agentes')
    } finally {
      setLoadingAgents(false)
    }
  }

  async function handleAssign(agentId: string | null, agentName?: string) {
    setLoading(true)
    try {
      const result = await assignConversation(conversationId, agentId)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success(agentId ? 'Conversacion asignada' : 'Conversacion desasignada')
        // Notify parent immediately for optimistic UI update
        if (onAssign) {
          onAssign(agentId ? { id: agentId, name: agentName || 'Agente' } : null)
        }
        router.refresh()
      }
      setOpen(false)
    } catch (error) {
      toast.error('Error al asignar')
    } finally {
      setLoading(false)
    }
  }

  // Group agents by team
  const agentsByTeam = agents.reduce((acc, agent) => {
    if (!acc[agent.team]) acc[agent.team] = []
    acc[agent.team].push(agent)
    return acc
  }, {} as Record<string, typeof agents>)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 h-8">
          {currentAssignee ? (
            <>
              <User className="h-4 w-4" />
              <span className="max-w-[100px] truncate">{currentAssignee.name}</span>
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" />
              Sin asignar
            </>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Asignar a</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {currentAssignee && (
          <>
            <DropdownMenuItem
              onClick={() => handleAssign(null)}
              disabled={loading}
              className="text-destructive focus:text-destructive"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Quitar asignacion
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {loadingAgents ? (
          <div className="py-4 text-center">
            <Loader2 className="h-4 w-4 animate-spin mx-auto" />
          </div>
        ) : agents.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            No hay agentes configurados
          </div>
        ) : (
          Object.entries(agentsByTeam).map(([team, teamAgents]) => (
            <div key={team}>
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                {team}
              </DropdownMenuLabel>
              {teamAgents.map((agent) => (
                <DropdownMenuItem
                  key={agent.id}
                  onClick={() => handleAssign(agent.id, agent.name)}
                  disabled={loading || agent.id === currentAssignee?.id}
                  className="flex items-center gap-2"
                >
                  <Circle
                    className={`h-2 w-2 flex-shrink-0 ${
                      agent.is_online ? 'fill-green-500 text-green-500' : 'fill-gray-300 text-gray-300'
                    }`}
                  />
                  <span className="flex-1 truncate">{agent.name}</span>
                  {agent.id === currentAssignee?.id && (
                    <Badge variant="secondary" className="text-xs">
                      Actual
                    </Badge>
                  )}
                </DropdownMenuItem>
              ))}
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

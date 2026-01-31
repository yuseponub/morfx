'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  getTeamWithMembers,
  addTeamMember,
  removeTeamMember,
  getUnassignedMembers,
  TeamMember
} from '@/app/actions/teams'
import { toast } from 'sonner'
import { Loader2, UserPlus, UserMinus, Circle } from 'lucide-react'

interface TeamMembersManagerProps {
  teamId: string
}

export function TeamMembersManager({ teamId }: TeamMembersManagerProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [availableMembers, setAvailableMembers] = useState<{ id: string; email: string; name: string | null }[]>([])
  const [selectedMember, setSelectedMember] = useState<string>('')
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [teamId])

  async function loadData() {
    setLoading(true)
    try {
      const [teamData, unassigned] = await Promise.all([
        getTeamWithMembers(teamId),
        getUnassignedMembers()
      ])
      setMembers(teamData?.members || [])
      setAvailableMembers(unassigned)
    } catch (error) {
      toast.error('Error al cargar miembros')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd() {
    if (!selectedMember) return
    setAdding(true)
    try {
      const result = await addTeamMember(teamId, selectedMember)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Miembro agregado')
        setSelectedMember('')
        loadData()
        router.refresh()
      }
    } catch (error) {
      toast.error('Error al agregar miembro')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(userId: string) {
    setRemoving(userId)
    try {
      const result = await removeTeamMember(teamId, userId)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Miembro eliminado')
        loadData()
        router.refresh()
      }
    } catch (error) {
      toast.error('Error al eliminar miembro')
    } finally {
      setRemoving(null)
    }
  }

  if (loading) {
    return (
      <div className="py-4 text-center">
        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Add member */}
      <div className="flex gap-2">
        <Select value={selectedMember} onValueChange={setSelectedMember}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Agregar miembro..." />
          </SelectTrigger>
          <SelectContent>
            {availableMembers.length === 0 ? (
              <div className="py-2 px-3 text-sm text-muted-foreground">
                No hay miembros disponibles
              </div>
            ) : (
              availableMembers.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name || member.email}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button
          onClick={handleAdd}
          disabled={!selectedMember || adding}
          size="icon"
        >
          {adding ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Members list */}
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No hay miembros en este equipo
        </p>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between p-2 rounded-lg border"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    {(member.user_name || member.user_email || 'A').charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">
                    {member.user_name || member.user_email}
                  </p>
                  {member.user_name && member.user_email && (
                    <p className="text-xs text-muted-foreground">{member.user_email}</p>
                  )}
                </div>
                <Badge
                  variant={member.is_online ? 'default' : 'secondary'}
                  className={`gap-1 ${member.is_online ? 'bg-green-500 hover:bg-green-500' : ''}`}
                >
                  <Circle className={`h-2 w-2 ${member.is_online ? 'fill-current' : ''}`} />
                  {member.is_online ? 'Online' : 'Offline'}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemove(member.user_id)}
                disabled={removing === member.user_id}
              >
                {removing === member.user_id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserMinus className="h-4 w-4" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

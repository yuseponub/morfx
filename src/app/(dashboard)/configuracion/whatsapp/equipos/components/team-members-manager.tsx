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
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

interface TeamMembersManagerProps {
  teamId: string
  v2?: boolean
}

export function TeamMembersManager({ teamId, v2: v2Prop }: TeamMembersManagerProps) {
  const v2Hook = useDashboardV2()
  const v2 = v2Prop ?? v2Hook
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

  const v2FontSans = v2 ? { fontFamily: 'var(--font-sans)' } : undefined
  const v2FontMono = v2 ? { fontFamily: 'var(--font-mono)' } : undefined
  const selectTriggerV2 = v2
    ? 'border border-[var(--border)] bg-[var(--paper-0)] text-[13px] text-[var(--ink-1)] rounded-[var(--radius-3)] focus:border-[var(--ink-1)] focus:ring-0 focus:shadow-[0_0_0_3px_var(--paper-3)]'
    : ''
  const selectContentV2 = v2 ? 'bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]' : ''
  const selectItemV2 = v2 ? 'text-[13px] text-[var(--ink-1)] focus:bg-[var(--paper-2)]' : ''
  const btnPrimaryV2 = v2
    ? '!bg-[var(--ink-1)] !text-[var(--paper-0)] hover:!bg-[var(--ink-2)] !border !border-[var(--ink-1)] !shadow-[0_1px_0_var(--ink-1)]'
    : ''

  if (loading) {
    return (
      <div className="py-4 text-center">
        <Loader2 className={cn('h-5 w-5 animate-spin mx-auto', v2 && '!text-[var(--ink-3)]')} />
      </div>
    )
  }

  if (v2) {
    return (
      <div className="space-y-4">
        {/* Add member */}
        <div className="flex gap-2">
          <Select value={selectedMember} onValueChange={setSelectedMember}>
            <SelectTrigger className={cn('flex-1', selectTriggerV2)} style={v2FontSans}>
              <SelectValue placeholder="Agregar miembro..." />
            </SelectTrigger>
            <SelectContent className={selectContentV2}>
              {availableMembers.length === 0 ? (
                <div className="py-2 px-3 text-[13px] text-[var(--ink-3)]" style={v2FontSans}>
                  No hay miembros disponibles
                </div>
              ) : (
                availableMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id} className={selectItemV2} style={v2FontSans}>
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
            className={btnPrimaryV2}
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
          <div className="text-center py-6 flex flex-col items-center gap-2">
            <p className="text-[13px] text-[var(--ink-3)]" style={v2FontSans}>No hay miembros en este equipo</p>
            <p className="mx-rule-ornament">· · ·</p>
          </div>
        ) : (
          <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)] overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--ink-1)] bg-[var(--paper-1)]" style={v2FontSans}>Miembro</th>
                  <th className="text-left px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--ink-1)] bg-[var(--paper-1)]" style={v2FontSans}>Estado</th>
                  <th className="border-b border-[var(--ink-1)] bg-[var(--paper-1)] w-[60px]"></th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-[var(--paper-1)]">
                    <td className="px-[10px] py-[10px] border-b border-[var(--border)]">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--paper-3)] border border-[var(--ink-2)] text-[11px] font-bold text-[var(--ink-1)]" style={v2FontSans}>
                          {(member.user_name || member.user_email || 'A').charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <div className="text-[13px] font-semibold text-[var(--ink-1)]" style={v2FontSans}>
                            {member.user_name || member.user_email}
                          </div>
                          {member.user_name && member.user_email && (
                            <div className="text-[11px] text-[var(--ink-3)]" style={v2FontMono}>{member.user_email}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-[10px] py-[10px] border-b border-[var(--border)]">
                      <span className={cn('mx-tag', member.is_online ? 'mx-tag--verdigris' : 'mx-tag--ink')}>
                        <Circle className={cn('h-2 w-2 inline-block mr-1', member.is_online && 'fill-current')} />
                        {member.is_online ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="px-[10px] py-[10px] border-b border-[var(--border)] text-right">
                      <button
                        type="button"
                        onClick={() => handleRemove(member.user_id)}
                        disabled={removing === member.user_id}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-[var(--radius-2)] text-[var(--ink-2)] hover:bg-[var(--paper-2)] hover:text-[var(--ink-1)] disabled:opacity-50"
                      >
                        {removing === member.user_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UserMinus className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

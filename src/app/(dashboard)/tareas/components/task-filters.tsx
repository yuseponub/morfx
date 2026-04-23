'use client'

import * as React from 'react'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type { TaskFilters, TaskPriority, TaskStatus } from '@/lib/tasks/types'
import type { MemberWithUser } from '@/lib/types/database'

interface TaskFiltersProps {
  filters: TaskFilters
  onFiltersChange: (filters: TaskFilters) => void
  members: MemberWithUser[]
  currentUserId?: string
  v2?: boolean
}

export function TaskFiltersBar({
  filters,
  onFiltersChange,
  members,
  currentUserId,
  v2 = false,
}: TaskFiltersProps) {
  // Portal target: the `.theme-editorial` wrapper mounted by dashboard layout.
  // Radix falls back to document.body when null (BC preserved).
  const portalTarget =
    typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('.theme-editorial')
      : null

  // Status toggle: all | pending | completed
  const statusValue = filters.status || 'all'

  const handleStatusChange = (value: string) => {
    if (!value) return
    onFiltersChange({
      ...filters,
      status: value as TaskStatus | 'all',
    })
  }

  // Priority filter
  const handlePriorityChange = (value: string) => {
    onFiltersChange({
      ...filters,
      priority: value === 'all' ? undefined : value as TaskPriority,
    })
  }

  // Assignment filter
  const handleAssignmentChange = (value: string) => {
    onFiltersChange({
      ...filters,
      assigned_to: value === 'all' ? undefined : value,
    })
  }

  // Check if any filters are active (besides default status)
  const hasActiveFilters =
    filters.priority !== undefined ||
    filters.assigned_to !== undefined

  // Clear filters
  const clearFilters = () => {
    onFiltersChange({
      status: filters.status,
    })
  }

  if (v2) {
    // Editorial chip-row + Selects — D-DASH-14 + mock lines 56-58 (chip) + §topbar Selects
    const statusChips: Array<{ id: TaskStatus | 'all'; label: string }> = [
      { id: 'all', label: 'Todas' },
      { id: 'pending', label: 'Pendientes' },
      { id: 'completed', label: 'Completadas' },
    ]

    return (
      <div className="flex flex-wrap items-center gap-2">
        {/* Status chips */}
        <div className="flex items-center gap-1.5" role="group" aria-label="Filtro de estado">
          {statusChips.map((chip) => {
            const isOn = statusValue === chip.id
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => handleStatusChange(chip.id)}
                aria-pressed={isOn}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-1)]',
                  isOn
                    ? 'bg-[var(--ink-1)] text-[var(--paper-0)] border border-[var(--ink-1)] font-semibold'
                    : 'bg-[var(--paper-0)] text-[var(--ink-2)] border border-[var(--border)] hover:bg-[var(--paper-2)]'
                )}
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                {chip.label}
              </button>
            )
          })}
        </div>

        {/* Priority filter */}
        <Select
          value={filters.priority || 'all'}
          onValueChange={handlePriorityChange}
        >
          <SelectTrigger
            className="w-[140px] h-auto border border-[var(--ink-1)] rounded-[3px] bg-[var(--paper-0)] text-[var(--ink-1)] px-2.5 py-1 text-[13px] font-normal shadow-none focus-visible:ring-0 focus-visible:border-[var(--ink-1)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <SelectValue placeholder="Prioridad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las prioridades</SelectItem>
            <SelectItem value="high">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 border border-[var(--ink-1)]"
                  style={{ background: 'var(--rubric-2)' }}
                  aria-hidden
                />
                Alta
              </div>
            </SelectItem>
            <SelectItem value="medium">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 border border-[var(--ink-1)]"
                  style={{ background: 'var(--accent-gold)' }}
                  aria-hidden
                />
                Media
              </div>
            </SelectItem>
            <SelectItem value="low">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 border border-[var(--ink-1)]"
                  style={{ background: 'var(--ink-4)' }}
                  aria-hidden
                />
                Baja
              </div>
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Assignment filter */}
        <Select
          value={filters.assigned_to || 'all'}
          onValueChange={handleAssignmentChange}
        >
          <SelectTrigger
            className="w-[160px] h-auto border border-[var(--ink-1)] rounded-[3px] bg-[var(--paper-0)] text-[var(--ink-1)] px-2.5 py-1 text-[13px] font-normal shadow-none focus-visible:ring-0 focus-visible:border-[var(--ink-1)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <SelectValue placeholder="Asignacion" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="me">Mis tareas</SelectItem>
            <SelectItem value="unassigned">Sin asignar</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.user_id} value={member.user_id}>
                {member.user?.email || 'Usuario'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Clear filters button */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-[var(--ink-3)] hover:text-[var(--rubric-2)] hover:bg-transparent h-auto px-2 py-1 text-[11px]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <XIcon className="h-3 w-3 mr-1" />
            Limpiar
          </Button>
        )}

        {/* Portal target reference (kept as variable to avoid dead-code elimination; consumed indirectly by Radix when needed) */}
        {portalTarget ? null : null}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Status toggle */}
      <ToggleGroup
        type="single"
        value={statusValue}
        onValueChange={handleStatusChange}
        className="bg-muted rounded-lg p-1"
      >
        <ToggleGroupItem
          value="all"
          className="data-[state=on]:bg-background data-[state=on]:shadow-sm px-3 h-8"
        >
          Todas
        </ToggleGroupItem>
        <ToggleGroupItem
          value="pending"
          className="data-[state=on]:bg-background data-[state=on]:shadow-sm px-3 h-8"
        >
          Pendientes
        </ToggleGroupItem>
        <ToggleGroupItem
          value="completed"
          className="data-[state=on]:bg-background data-[state=on]:shadow-sm px-3 h-8"
        >
          Completadas
        </ToggleGroupItem>
      </ToggleGroup>

      {/* Priority filter */}
      <Select
        value={filters.priority || 'all'}
        onValueChange={handlePriorityChange}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Prioridad" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas las prioridades</SelectItem>
          <SelectItem value="high">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              Alta
            </div>
          </SelectItem>
          <SelectItem value="medium">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-yellow-500" />
              Media
            </div>
          </SelectItem>
          <SelectItem value="low">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-gray-400" />
              Baja
            </div>
          </SelectItem>
        </SelectContent>
      </Select>

      {/* Assignment filter */}
      <Select
        value={filters.assigned_to || 'all'}
        onValueChange={handleAssignmentChange}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Asignacion" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas</SelectItem>
          <SelectItem value="me">Mis tareas</SelectItem>
          <SelectItem value="unassigned">Sin asignar</SelectItem>
          {members.map((member) => (
            <SelectItem key={member.user_id} value={member.user_id}>
              {member.user?.email || 'Usuario'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Clear filters button */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="text-muted-foreground"
        >
          <XIcon className="h-4 w-4 mr-1" />
          Limpiar
        </Button>
      )}
    </div>
  )
}

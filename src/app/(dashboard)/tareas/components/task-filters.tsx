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
import type { TaskFilters, TaskPriority, TaskStatus } from '@/lib/tasks/types'
import type { MemberWithUser } from '@/lib/types/database'

interface TaskFiltersProps {
  filters: TaskFilters
  onFiltersChange: (filters: TaskFilters) => void
  members: MemberWithUser[]
  currentUserId?: string
}

export function TaskFiltersBar({
  filters,
  onFiltersChange,
  members,
  currentUserId,
}: TaskFiltersProps) {
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

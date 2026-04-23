'use client'

import * as React from 'react'
import { User, Phone, Mail, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
import { cn } from '@/lib/utils'
import type { Contact } from '@/lib/types/database'
import type { ParsedContact } from '@/lib/csv/parser'

// ============================================================================
// Types
// ============================================================================

export type DuplicateResolution = 'skip' | 'update' | 'create_new'

export interface DuplicateEntry {
  row: number
  csvData: ParsedContact
  existingContact: Contact
}

interface DuplicateResolverProps {
  duplicates: DuplicateEntry[]
  invalidCount: number
  validCount: number
  onResolve: (resolutions: Map<number, DuplicateResolution>) => void
  onCancel: () => void
}

// ============================================================================
// Component
// ============================================================================

export function DuplicateResolver({
  duplicates,
  invalidCount,
  validCount,
  onResolve,
  onCancel
}: DuplicateResolverProps) {
  const v2 = useDashboardV2()
  // Track resolution for each duplicate by row number
  const [resolutions, setResolutions] = React.useState<Map<number, DuplicateResolution>>(() => {
    const map = new Map<number, DuplicateResolution>()
    duplicates.forEach(d => map.set(d.row, 'skip'))
    return map
  })

  const handleResolutionChange = (row: number, resolution: DuplicateResolution) => {
    setResolutions(prev => {
      const next = new Map(prev)
      next.set(row, resolution)
      return next
    })
  }

  const handleApplyToAll = (resolution: DuplicateResolution) => {
    setResolutions(prev => {
      const next = new Map(prev)
      duplicates.forEach(d => next.set(d.row, resolution))
      return next
    })
  }

  const handleConfirm = () => {
    onResolve(resolutions)
  }

  // Count resolutions
  const skipCount = Array.from(resolutions.values()).filter(r => r === 'skip').length
  const updateCount = Array.from(resolutions.values()).filter(r => r === 'update').length

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div
        className={cn(
          'text-sm space-y-1 p-3 rounded-lg',
          v2 ? 'bg-[var(--paper-2)] border border-[var(--ink-1)]' : 'bg-muted/50'
        )}
      >
        <p><strong>{validCount}</strong> contactos nuevos listos para importar</p>
        <p><strong>{duplicates.length}</strong> contactos con telefono duplicado</p>
        {invalidCount > 0 && (
          <p className={v2 ? 'text-[var(--rubric-2)]' : 'text-destructive'}>
            <strong>{invalidCount}</strong> filas con errores (seran omitidas)
          </p>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleApplyToAll('skip')}
          className={v2 ? 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]' : ''}
        >
          Omitir todos
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleApplyToAll('update')}
          className={v2 ? 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]' : ''}
        >
          Actualizar todos
        </Button>
      </div>

      {/* Duplicate list */}
      <ScrollArea className="h-[300px] pr-4">
        <div className="space-y-4">
          {duplicates.map((dup) => (
            <DuplicateItem
              key={dup.row}
              entry={dup}
              resolution={resolutions.get(dup.row) || 'skip'}
              onResolutionChange={(r) => handleResolutionChange(dup.row, r)}
              v2={v2}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Actions */}
      <div className={cn('flex justify-between items-center pt-2 border-t', v2 && 'border-[var(--ink-1)]')}>
        <div className={cn('text-sm', v2 ? 'text-[var(--ink-3)] mx-smallcaps' : 'text-muted-foreground')}>
          {skipCount} omitir, {updateCount} actualizar
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            className={v2 ? 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]' : ''}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            className={v2 ? 'bg-[var(--ink-1)] text-[var(--paper-0)] hover:bg-[var(--ink-2)] shadow-[0_1px_0_var(--ink-1)] border border-[var(--ink-1)]' : ''}
            style={v2 ? { fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '13px', borderRadius: 'var(--radius-3)' } : undefined}
          >
            Continuar importacion
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Duplicate Item Component
// ============================================================================

interface DuplicateItemProps {
  entry: DuplicateEntry
  resolution: DuplicateResolution
  onResolutionChange: (resolution: DuplicateResolution) => void
  v2?: boolean
}

function DuplicateItem({ entry, resolution, onResolutionChange, v2 = false }: DuplicateItemProps) {
  const { csvData, existingContact, row } = entry

  return (
    <div
      className={cn(
        'border rounded-lg p-3 space-y-3',
        v2 && 'bg-[var(--paper-2)] border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]'
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn('text-xs', v2 ? 'text-[var(--ink-3)] mx-smallcaps' : 'text-muted-foreground')}
        >
          Fila {row}
        </span>
        <span
          className={cn('text-xs font-mono', v2 ? 'text-[var(--ink-2)]' : 'text-muted-foreground')}
          style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
        >
          {csvData.phone}
        </span>
      </div>

      {/* Side by side comparison */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        {/* CSV Data */}
        <div className="space-y-1">
          <Label className={cn('text-xs', v2 ? 'mx-smallcaps text-[var(--ink-3)]' : 'text-muted-foreground')}>
            Datos del CSV
          </Label>
          <div className={cn('space-y-1 p-2 rounded', v2 ? 'bg-[var(--paper-0)] border border-[var(--border)]' : 'bg-muted/30')}>
            <div className="flex items-center gap-2">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="truncate">{csvData.name}</span>
            </div>
            {csvData.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-3 w-3 text-muted-foreground" />
                <span className="truncate text-xs">{csvData.email}</span>
              </div>
            )}
            {csvData.city && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                <span className="truncate text-xs">{csvData.city}</span>
              </div>
            )}
          </div>
        </div>

        {/* Existing Contact */}
        <div className="space-y-1">
          <Label className={cn('text-xs', v2 ? 'mx-smallcaps text-[var(--ink-3)]' : 'text-muted-foreground')}>
            Contacto existente
          </Label>
          <div className={cn('space-y-1 p-2 rounded', v2 ? 'bg-[var(--paper-0)] border border-[var(--border)]' : 'bg-muted/30')}>
            <div className="flex items-center gap-2">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="truncate">{existingContact.name}</span>
            </div>
            {existingContact.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-3 w-3 text-muted-foreground" />
                <span className="truncate text-xs">{existingContact.email}</span>
              </div>
            )}
            {existingContact.city && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                <span className="truncate text-xs">{existingContact.city}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Resolution options */}
      <div className="flex gap-2">
        <Button
          variant={resolution === 'skip' ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'flex-1',
            v2 &&
              (resolution === 'skip'
                ? 'bg-[var(--ink-1)] text-[var(--paper-0)] hover:bg-[var(--ink-2)] shadow-[0_1px_0_var(--ink-1)] border border-[var(--ink-1)]'
                : 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]')
          )}
          onClick={() => onResolutionChange('skip')}
        >
          Omitir
        </Button>
        <Button
          variant={resolution === 'update' ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'flex-1',
            v2 &&
              (resolution === 'update'
                ? 'bg-[var(--ink-1)] text-[var(--paper-0)] hover:bg-[var(--ink-2)] shadow-[0_1px_0_var(--ink-1)] border border-[var(--ink-1)]'
                : 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]')
          )}
          onClick={() => onResolutionChange('update')}
        >
          Actualizar
        </Button>
      </div>
    </div>
  )
}

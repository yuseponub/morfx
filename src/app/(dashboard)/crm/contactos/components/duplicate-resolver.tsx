'use client'

import * as React from 'react'
import { User, Phone, Mail, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
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
      <div className="text-sm space-y-1 p-3 bg-muted/50 rounded-lg">
        <p><strong>{validCount}</strong> contactos nuevos listos para importar</p>
        <p><strong>{duplicates.length}</strong> contactos con telefono duplicado</p>
        {invalidCount > 0 && (
          <p className="text-destructive"><strong>{invalidCount}</strong> filas con errores (seran omitidas)</p>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleApplyToAll('skip')}
        >
          Omitir todos
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleApplyToAll('update')}
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
            />
          ))}
        </div>
      </ScrollArea>

      {/* Actions */}
      <div className="flex justify-between items-center pt-2 border-t">
        <div className="text-sm text-muted-foreground">
          {skipCount} omitir, {updateCount} actualizar
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>
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
}

function DuplicateItem({ entry, resolution, onResolutionChange }: DuplicateItemProps) {
  const { csvData, existingContact, row } = entry

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Fila {row}</span>
        <span className="text-xs font-mono text-muted-foreground">{csvData.phone}</span>
      </div>

      {/* Side by side comparison */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        {/* CSV Data */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Datos del CSV</Label>
          <div className="space-y-1 p-2 bg-muted/30 rounded">
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
          <Label className="text-xs text-muted-foreground">Contacto existente</Label>
          <div className="space-y-1 p-2 bg-muted/30 rounded">
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
          className="flex-1"
          onClick={() => onResolutionChange('skip')}
        >
          Omitir
        </Button>
        <Button
          variant={resolution === 'update' ? 'default' : 'outline'}
          size="sm"
          className="flex-1"
          onClick={() => onResolutionChange('update')}
        >
          Actualizar
        </Button>
      </div>
    </div>
  )
}

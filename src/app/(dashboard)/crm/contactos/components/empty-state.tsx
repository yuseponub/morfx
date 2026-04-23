'use client'

import { UserPlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  onCreateClick: () => void
  v2?: boolean
}

export function EmptyState({ onCreateClick, v2 = false }: EmptyStateProps) {
  if (v2) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <p className="mx-h3">No hay contactos.</p>
        <p className="mx-caption max-w-sm">
          Empieza agregando tu primer contacto para gestionar tus clientes y leads.
        </p>
        <p className="mx-rule-ornament">· · ·</p>
        <Button
          onClick={onCreateClick}
          className="bg-[var(--ink-1)] text-[var(--paper-0)] hover:bg-[var(--ink-2)] shadow-[0_1px_0_var(--ink-1)] border border-[var(--ink-1)] mt-2"
          style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '13px', borderRadius: 'var(--radius-3)' }}
        >
          <UserPlusIcon className="mr-2 h-4 w-4" />
          Crear primer contacto
        </Button>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <UserPlusIcon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No hay contactos</h3>
      <p className="text-muted-foreground mb-6 max-w-sm">
        Empieza agregando tu primer contacto para gestionar tus clientes y leads.
      </p>
      <Button onClick={onCreateClick}>
        <UserPlusIcon className="mr-2 h-4 w-4" />
        Crear primer contacto
      </Button>
    </div>
  )
}

'use client'

import { UserPlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  onCreateClick: () => void
  /**
   * Editorial v3 flag (standalone ui-redesign-editorial-core, Plan 02). When
   * true, renders the typographic editorial empty state (serif italic copy,
   * editorial `.btn.pri`) that resolves under `.theme-editorial-v3`. Default
   * false → legacy shadcn empty state is byte-identical (Regla 6).
   */
  v3?: boolean
}

export function EmptyState({ onCreateClick, v3 = false }: EmptyStateProps) {
  if (v3) {
    return (
      <section className="page">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '64px 24px',
            textAlign: 'center',
            gap: 16,
          }}
        >
          <div className="eye">CRM · Directorio</div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 24,
              color: 'var(--ink-1)',
              margin: 0,
            }}
          >
            Aún no hay contactos.
          </h2>
          <p
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: 16,
              color: 'var(--ink-3)',
              maxWidth: 360,
              margin: 0,
            }}
          >
            Empieza agregando tu primer contacto para gestionar tus clientes y
            leads.
          </p>
          <button type="button" className="btn pri" onClick={onCreateClick}>
            Crear primer contacto
          </button>
        </div>
      </section>
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

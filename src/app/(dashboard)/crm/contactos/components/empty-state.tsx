'use client'

import { UserPlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  onCreateClick: () => void
}

export function EmptyState({ onCreateClick }: EmptyStateProps) {
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

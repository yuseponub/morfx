'use client'

/**
 * PromoteDialog — modal cliente que pide confirmación al operador antes de
 * marcar todas las rows del cluster como `status='promoted'`. El operador debe
 * haber creado por su cuenta:
 *   - un KB doc en `src/lib/agents/somnio-v4/knowledge/` (PR review obligatorio — D-52), O
 *   - una entrada nueva en `transitions.ts`.
 *
 * Standalone somnio-sales-v4 / Plan 10.
 */

import { useState, useTransition } from 'react'
import { markPromotedAction } from '../_actions'
import type { ClusterSummary } from '@/lib/domain/unknown-cases'

export function PromoteDialog({
  open,
  onClose,
  cluster,
}: {
  open: boolean
  onClose: () => void
  cluster: ClusterSummary
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const handleConfirm = () => {
    setError(null)
    startTransition(async () => {
      const r = await markPromotedAction({ clusterId: cluster.clusterId })
      if (r.success) {
        onClose()
      } else {
        setError(r.error ?? 'Error desconocido')
      }
    })
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold mb-2">Marcar como promovido</h3>
        <p className="text-sm text-muted-foreground mb-4">Confirma que ya creaste:</p>
        <ul className="text-sm list-disc pl-5 mb-4">
          <li>
            Un KB doc en <code>src/lib/agents/somnio-v4/knowledge/</code> (PR review
            obligatorio — D-52), <strong>O</strong>
          </li>
          <li>
            Una nueva entrada en <code>transitions.ts</code>
          </li>
        </ul>
        <p className="text-xs text-muted-foreground mb-4">
          Esto marcará los {cluster.size} casos como <code>status=&apos;promoted&apos;</code>.
        </p>
        {error && <p className="text-xs text-destructive mb-3">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={pending}
            className="px-3 py-1.5 text-sm border rounded disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={pending}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded disabled:opacity-50"
          >
            {pending ? 'Marcando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

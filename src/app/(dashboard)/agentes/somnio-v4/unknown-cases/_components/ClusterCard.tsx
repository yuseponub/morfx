'use client'

/**
 * ClusterCard — tarjeta cliente que muestra un cluster maduro de unknown_cases
 * y expone botones para descartarlo (`dismissClusterAction`) o promoverlo
 * (`markPromotedAction` via PromoteDialog).
 *
 * Standalone somnio-sales-v4 / Plan 10.
 */

import { useState, useTransition } from 'react'
import { dismissClusterAction } from '../_actions'
import type { ClusterSummary } from '@/lib/domain/unknown-cases'
import { PromoteDialog } from './PromoteDialog'

export function ClusterCard({ cluster }: { cluster: ClusterSummary }) {
  const [pending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDismiss = () => {
    if (!confirm(`¿Descartar cluster de ${cluster.size} casos?`)) return
    setError(null)
    startTransition(async () => {
      const r = await dismissClusterAction({ clusterId: cluster.clusterId })
      if (!r.success) setError(r.error ?? 'Error desconocido')
    })
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })

  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold">Cluster · {cluster.size} casos</span>
        <span className="text-xs text-muted-foreground">
          {cluster.dominantIntent
            ? `intent: ${cluster.dominantIntent}`
            : 'sin intent dominante'}
        </span>
      </div>
      <div className="text-xs text-muted-foreground mb-3">
        {cluster.oldestCaseAt ? fmtDate(cluster.oldestCaseAt) : '—'} –{' '}
        {cluster.newestCaseAt ? fmtDate(cluster.newestCaseAt) : '—'}
      </div>
      <ul className="text-sm space-y-1 mb-4">
        {cluster.exampleMessages.map((m, i) => (
          <li key={i} className="text-muted-foreground">
            › {m}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          onClick={() => setDialogOpen(true)}
          disabled={pending}
          className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded disabled:opacity-50"
        >
          Marcar como promovido
        </button>
        <button
          onClick={handleDismiss}
          disabled={pending}
          className="px-3 py-1.5 text-sm border rounded disabled:opacity-50"
        >
          {pending ? 'Procesando…' : 'Descartar'}
        </button>
      </div>
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
      <PromoteDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        cluster={cluster}
      />
    </div>
  )
}

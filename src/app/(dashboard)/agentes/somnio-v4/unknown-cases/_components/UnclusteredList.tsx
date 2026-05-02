/**
 * UnclusteredList — tabla server-renderable de casos pending sin cluster.
 *
 * Standalone somnio-sales-v4 / Plan 10.
 *
 * No requiere `'use client'` — solo presentación, sin handlers ni estado.
 */

import type { UnknownCaseRow } from '@/lib/domain/unknown-cases'

export function UnclusteredList({ rows }: { rows: UnknownCaseRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay casos sin cluster.</p>
  }

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota' })

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="text-left px-3 py-2">Mensaje</th>
            <th className="text-left px-3 py-2">Intent</th>
            <th className="text-left px-3 py-2">Confianza</th>
            <th className="text-left px-3 py-2">Razón</th>
            <th className="text-left px-3 py-2">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2">{r.message}</td>
              <td className="px-3 py-2">{r.intent ?? '—'}</td>
              <td className="px-3 py-2">
                {r.confidence != null ? r.confidence.toFixed(2) : '—'}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {r.reason ?? '—'}
              </td>
              <td className="px-3 py-2 text-xs">{fmtDateTime(r.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

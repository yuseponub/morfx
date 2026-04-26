// ============================================================================
// Surface 5 (D-06.5) — Audit log viewer.
// Server component que llama listAuditLog({ workspaceId }, filter) via
// domain layer. Filtros via searchParams: reason, agent_id, from, to.
// Regla 3: este archivo solo lee via domain layer (Plan 02).
// ============================================================================

import Link from 'next/link'
import { listAuditLog, type AuditLogFilter } from '@/lib/domain/routing'
import { getActiveWorkspaceId } from '@/app/actions/workspace'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const VALID_REASONS = new Set([
  'matched',
  'human_handoff',
  'no_rule_matched',
  'fallback_legacy',
])

interface AuditPageProps {
  searchParams: Promise<{
    reason?: string
    agent_id?: string
    from?: string
    to?: string
  }>
}

function reasonBadge(reason: unknown) {
  const r = String(reason)
  if (r === 'matched') return <Badge>matched</Badge>
  if (r === 'human_handoff') return <Badge variant="secondary">handoff</Badge>
  if (r === 'no_rule_matched') return <Badge variant="outline">no_rule</Badge>
  if (r === 'fallback_legacy')
    return <Badge variant="destructive">fallback_legacy</Badge>
  return <Badge variant="outline">{r}</Badge>
}

export default async function RoutingAuditPage({ searchParams }: AuditPageProps) {
  const params = await searchParams
  const workspaceId = await getActiveWorkspaceId()
  if (!workspaceId) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-muted-foreground">No hay workspace seleccionado.</p>
      </div>
    )
  }

  const filter: AuditLogFilter = {
    reason: VALID_REASONS.has(params.reason ?? '')
      ? (params.reason as AuditLogFilter['reason'])
      : undefined,
    agent_id:
      params.agent_id === 'null'
        ? null
        : params.agent_id && params.agent_id.length > 0
          ? params.agent_id
          : undefined,
    from: params.from || undefined,
    to: params.to || undefined,
    limit: 50,
  }

  const result = await listAuditLog({ workspaceId }, filter)
  const rows = result.success ? result.data : []
  const errorMessage = result.success ? null : result.error

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold">Routing Audit Log</h1>
          <p className="text-sm text-muted-foreground">
            Decisiones del router (50 mas recientes). Filtros via URL.
          </p>
        </div>
        <Link href="/agentes/routing">
          <Button variant="outline">Volver a reglas</Button>
        </Link>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            method="get"
            className="grid grid-cols-1 md:grid-cols-5 gap-3 text-sm"
          >
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">reason</span>
              <select
                name="reason"
                defaultValue={params.reason ?? ''}
                className="rounded border px-2 py-1 bg-background"
              >
                <option value="">(todos)</option>
                <option value="matched">matched</option>
                <option value="human_handoff">human_handoff</option>
                <option value="no_rule_matched">no_rule_matched</option>
                <option value="fallback_legacy">fallback_legacy</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">agent_id ('null' = handoff)</span>
              <input
                name="agent_id"
                defaultValue={params.agent_id ?? ''}
                placeholder="ej: somnio-recompra-v1"
                className="rounded border px-2 py-1 bg-background"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">from (ISO)</span>
              <input
                name="from"
                defaultValue={params.from ?? ''}
                placeholder="2026-04-01T00:00:00Z"
                className="rounded border px-2 py-1 bg-background"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">to (ISO)</span>
              <input
                name="to"
                defaultValue={params.to ?? ''}
                placeholder="2026-04-30T23:59:59Z"
                className="rounded border px-2 py-1 bg-background"
              />
            </label>
            <div className="flex items-end gap-2">
              <Button type="submit">Aplicar</Button>
              <Link href="/agentes/routing/audit">
                <Button type="button" variant="outline">
                  Limpiar
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      {errorMessage && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Error cargando audit log: {errorMessage}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide">decided_at</th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide">reason</th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide">agent_id</th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide">lifecycle</th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide">contact</th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide">latency</th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide">facts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const r = row as Record<string, unknown>
                const decidedAt = r.decided_at as string | null
                const conversationId = r.conversation_id as string | null
                const contactId = r.contact_id as string | null
                const facts = r.facts_snapshot as unknown
                return (
                  <tr key={(r.id as string) ?? idx} className="border-b align-top">
                    <td className="p-3 whitespace-nowrap text-xs">
                      {decidedAt
                        ? new Date(decidedAt).toLocaleString('es-CO', {
                            timeZone: 'America/Bogota',
                          })
                        : '-'}
                    </td>
                    <td className="p-3">{reasonBadge(r.reason)}</td>
                    <td className="p-3 font-mono text-xs">
                      {(r.agent_id as string) ?? '(null)'}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {(r.lifecycle_state as string) ?? '-'}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {conversationId ? (
                        <Link
                          href={`/conversaciones/${conversationId}`}
                          className="underline"
                        >
                          {conversationId.slice(0, 8)}
                        </Link>
                      ) : (
                        contactId?.slice(0, 8) ?? '-'
                      )}
                    </td>
                    <td className="p-3 text-xs">
                      {(r.latency_ms as number | null) ?? '-'}
                      {typeof r.latency_ms === 'number' ? ' ms' : ''}
                    </td>
                    <td className="p-3 text-xs">
                      <details>
                        <summary className="cursor-pointer text-muted-foreground">
                          ver facts
                        </summary>
                        <pre className="mt-2 max-w-md whitespace-pre-wrap break-words rounded bg-muted p-2 text-[11px]">
                          {JSON.stringify(facts, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && !errorMessage && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    No hay decisiones registradas para los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

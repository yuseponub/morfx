// ============================================================================
// Surface 1 (D-06.1) — Lista de routing rules.
// Server component que llama listRules({ workspaceId }) via domain layer.
// Regla 3: este archivo solo lee via domain layer (Plan 02).
// ============================================================================

import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { listRules, type RoutingRule } from '@/lib/domain/routing'
import { getActiveWorkspaceId } from '@/app/actions/workspace'
import { deleteRuleAction } from './_actions'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

async function handleDeleteRule(formData: FormData): Promise<void> {
  'use server'
  const ruleId = formData.get('ruleId')
  if (typeof ruleId !== 'string' || !ruleId) return
  await deleteRuleAction(ruleId)
  revalidatePath('/agentes/routing')
}

function formatRuleOutput(rule: RoutingRule): string {
  const params = (rule.event as { params?: unknown })?.params
  return typeof params === 'object' && params !== null
    ? JSON.stringify(params)
    : '<sin params>'
}

export default async function RoutingRulesPage() {
  const workspaceId = await getActiveWorkspaceId()
  if (!workspaceId) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-muted-foreground">No hay workspace seleccionado.</p>
      </div>
    )
  }

  const result = await listRules({ workspaceId })
  const rules = result.success ? result.data : []
  const errorMessage = result.success ? null : result.error

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold">Routing Rules</h1>
          <p className="text-sm text-muted-foreground">
            Reglas de lifecycle classifier + agent router. Editables sin
            redeploy.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/agentes/routing/audit">
            <Button variant="outline">Audit log</Button>
          </Link>
          <Link href="/agentes/routing/editor?new=1">
            <Button>+ Nueva regla</Button>
          </Link>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Error cargando reglas: {errorMessage}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead className="border-b">
              <tr>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide">Prioridad</th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide">Nombre</th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide">Tipo</th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide">Output</th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide">Activa</th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide">Ultima edicion</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-b hover:bg-muted/50">
                  <td className="p-3">{r.priority}</td>
                  <td className="p-3 font-mono text-sm">{r.name}</td>
                  <td className="p-3">
                    <Badge variant="outline">{r.rule_type}</Badge>
                  </td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">
                    {formatRuleOutput(r)}
                  </td>
                  <td className="p-3">
                    {r.active ? (
                      <Badge>activa</Badge>
                    ) : (
                      <Badge variant="secondary">inactiva</Badge>
                    )}
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {new Date(r.updated_at).toLocaleString('es-CO', {
                      timeZone: 'America/Bogota',
                    })}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2 justify-end">
                      <Link href={`/agentes/routing/editor?id=${r.id}`}>
                        <Button size="sm" variant="outline">
                          Editar
                        </Button>
                      </Link>
                      {r.active && (
                        <form action={handleDeleteRule}>
                          <input type="hidden" name="ruleId" value={r.id} />
                          <Button
                            type="submit"
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-800"
                          >
                            Desactivar
                          </Button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && !errorMessage && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    No hay reglas.{' '}
                    <Link
                      href="/agentes/routing/editor?new=1"
                      className="underline"
                    >
                      Crear la primera
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="mt-3 text-xs text-muted-foreground">
        Los cambios pueden tardar hasta 10 segundos en aplicarse en todos los
        servidores.
      </p>
    </div>
  )
}

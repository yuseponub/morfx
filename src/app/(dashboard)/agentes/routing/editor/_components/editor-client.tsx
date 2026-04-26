'use client'

// ============================================================================
// Editor client — Surfaces 2 + 3 + 4 (D-06.2/3/4)
//
// Form principal del editor de routing rules. Maneja:
//   - Inputs: name, priority, rule_type, active
//   - Output picker:
//     · lifecycle_classifier → select 8 lifecycle states (D-03)
//     · agent_router         → input agent_id + opcion vacio = human_handoff
//   - ConditionBuilder recursivo all/any/not + leaves
//   - SimulateButton (server action simulateAction → dryRunReplay)
//   - Submit boton (server action createOrUpdateRuleAction)
//   - Validacion inline via validateRule (Ajv en browser)
//
// W-3 fix: facts se filtran por valid_in_rule_types segun el rule_type
// seleccionado. Cambiar rule_type re-evalua el filtro automaticamente.
//
// Pitfall 3: post-save mostramos "Los cambios pueden tardar hasta 10 segundos
// en aplicarse en todos los servidores."
// ============================================================================

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { validateRule } from '@/lib/agents/routing/schema/validate'
import {
  createOrUpdateRuleAction,
  simulateAction,
} from '../../_actions'
import { ConditionBuilder, type FactItem } from './ConditionBuilder'
import { FactPicker, filterFactsByRuleType } from './FactPicker'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { RoutingRule } from '@/lib/domain/routing'
import type { DryRunResult } from '@/lib/agents/routing/dry-run'

const LIFECYCLE_STATES = [
  'new_prospect',
  'order_in_progress',
  'in_transit',
  'just_received',
  'dormant_buyer',
  'abandoned_cart',
  'reactivation_window',
  'blocked',
] as const

type RuleDraft = Partial<RoutingRule> & {
  schema_version: 'v1'
  rule_type: 'lifecycle_classifier' | 'agent_router'
  name: string
  priority: number
  conditions: { all: unknown[] } | { any: unknown[] } | { not: unknown }
  event:
    | { type: 'route'; params: { lifecycle_state: string } }
    | { type: 'route'; params: { agent_id: string | null } }
  active: boolean
}

interface Props {
  initialRule: RoutingRule | null
  facts: FactItem[]
  tags: string[]
  workspaceId: string
}

function defaultRule(): RuleDraft {
  return {
    schema_version: 'v1',
    rule_type: 'lifecycle_classifier',
    name: '',
    priority: 100,
    conditions: { all: [] },
    event: {
      type: 'route',
      params: { lifecycle_state: 'new_prospect' },
    },
    active: true,
  }
}

type SimResultState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; data: DryRunResult }

export function RoutingRuleEditorClient({
  initialRule,
  facts,
  tags,
  workspaceId: _workspaceId,
}: Props) {
  void _workspaceId // workspaceId is provided by the server action; UI label only
  const router = useRouter()
  const [rule, setRule] = useState<RuleDraft>(() => {
    if (!initialRule) return defaultRule()
    // Cast — initialRule comes from domain.getRule (already schema-conformant).
    return { ...(initialRule as unknown as RuleDraft) }
  })
  const [errors, setErrors] = useState<string[]>([])
  const [simState, setSimState] = useState<SimResultState>({ kind: 'idle' })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // W-3 fix — facts filtered by rule_type. Recomputed on every rule_type change.
  const visibleFacts = useMemo(
    () => filterFactsByRuleType(facts, rule.rule_type),
    [facts, rule.rule_type],
  )

  // Client-side schema validation (Ajv runs in browser — schema is serializable).
  const validation = useMemo(() => validateRule(rule), [rule])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  function setRuleType(rt: 'lifecycle_classifier' | 'agent_router') {
    // When switching rule_type, reset the event.params shape to match.
    const event: RuleDraft['event'] =
      rt === 'lifecycle_classifier'
        ? { type: 'route', params: { lifecycle_state: 'new_prospect' } }
        : { type: 'route', params: { agent_id: null } }
    setRule({ ...rule, rule_type: rt, event })
  }

  async function onSimulate() {
    setSimState({ kind: 'loading' })
    try {
      const data = await simulateAction({
        candidateRules: [rule as unknown as RoutingRule],
        daysBack: 7,
      })
      setSimState({ kind: 'ok', data })
    } catch (e) {
      setSimState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  async function onSave() {
    if (!validation.ok) {
      setErrors(validation.errors)
      return
    }
    setErrors([])
    setIsSubmitting(true)
    try {
      const result = await createOrUpdateRuleAction(
        rule as unknown as Partial<RoutingRule>,
      )
      if (!result.success) {
        setErrors([result.error])
        return
      }
      router.push('/agentes/routing')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col lg:flex-row gap-4 p-6">
      <Card className="flex-1">
        <CardHeader>
          <CardTitle>
            {initialRule ? 'Editar regla' : 'Nueva regla'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* --- name --- */}
          <div>
            <Label>Nombre</Label>
            <Input
              value={rule.name}
              onChange={(e) => setRule({ ...rule, name: e.target.value })}
              placeholder="ej: in_transit_to_postsale"
            />
          </div>

          {/* --- rule_type --- */}
          <div>
            <Label>Tipo</Label>
            <Select
              value={rule.rule_type}
              onValueChange={(v) =>
                setRuleType(v as 'lifecycle_classifier' | 'agent_router')
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lifecycle_classifier">
                  lifecycle_classifier (Layer 1)
                </SelectItem>
                <SelectItem value="agent_router">
                  agent_router (Layer 2)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* --- priority --- */}
          <div>
            <Label>Prioridad (1..100000)</Label>
            <Input
              type="number"
              min={1}
              max={100000}
              value={rule.priority}
              onChange={(e) =>
                setRule({
                  ...rule,
                  priority: parseInt(e.target.value, 10) || 0,
                })
              }
            />
          </div>

          {/* --- active --- */}
          <div className="flex items-center gap-2">
            <Switch
              checked={rule.active}
              onCheckedChange={(v) => setRule({ ...rule, active: v })}
            />
            <Label>Activa</Label>
          </div>

          {/* --- output --- */}
          <div>
            <Label>Output</Label>
            {rule.rule_type === 'lifecycle_classifier' ? (
              <Select
                value={
                  ((rule.event.params as { lifecycle_state?: string })
                    .lifecycle_state ?? 'new_prospect')
                }
                onValueChange={(v) =>
                  setRule({
                    ...rule,
                    event: {
                      type: 'route',
                      params: { lifecycle_state: v },
                    },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIFECYCLE_STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="space-y-1">
                <Input
                  placeholder="agent_id (ej: somnio-recompra-v1) o vacio para human_handoff"
                  value={
                    (rule.event.params as { agent_id?: string | null })
                      .agent_id ?? ''
                  }
                  onChange={(e) =>
                    setRule({
                      ...rule,
                      event: {
                        type: 'route',
                        params: {
                          agent_id:
                            e.target.value.length > 0 ? e.target.value : null,
                        },
                      },
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Vacio = human_handoff (bot no responde)
                </p>
              </div>
            )}
          </div>

          {/* --- conditions --- */}
          <div>
            <Label>Condiciones</Label>
            <ConditionBuilder
              value={rule.conditions as never}
              onChange={(c) => setRule({ ...rule, conditions: c as never })}
              facts={visibleFacts}
              tags={tags}
            />
          </div>

          {/* --- errors --- */}
          {errors.length > 0 && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-semibold mb-1">Errores:</p>
              <ul className="list-disc list-inside space-y-1">
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {!validation.ok && validation.errors.length > 0 && (
            <div className="text-xs text-yellow-700">
              Schema warnings: {validation.errors.join('; ')}
            </div>
          )}

          {/* --- actions --- */}
          <div className="flex gap-2">
            <Button onClick={onSave} disabled={!validation.ok || isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </Button>
            <Button
              variant="outline"
              onClick={onSimulate}
              disabled={simState.kind === 'loading'}
            >
              {simState.kind === 'loading' ? 'Simulando...' : 'Simular cambio'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Los cambios pueden tardar hasta 10 segundos en aplicarse en todos
            los servidores.
          </p>
        </CardContent>
      </Card>

      {/* --- side panel --- */}
      <div className="w-full lg:w-96 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Resultado simulacion (D-10, D-14)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {simState.kind === 'idle' && (
              <p className="text-sm text-muted-foreground">
                Click &ldquo;Simular cambio&rdquo; para ver el impacto en los
                ultimos 7 dias.
              </p>
            )}
            {simState.kind === 'loading' && (
              <p className="text-sm text-muted-foreground">Simulando...</p>
            )}
            {simState.kind === 'error' && (
              <p className="text-sm text-red-600">{simState.message}</p>
            )}
            {simState.kind === 'ok' && (
              <SimulationResultPanel data={simState.data} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Facts disponibles</CardTitle>
            <p className="text-xs text-muted-foreground">
              Filtrados por rule_type: <code>{rule.rule_type}</code>
            </p>
          </CardHeader>
          <CardContent>
            <FactPicker facts={visibleFacts} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Helper — SimulationResultPanel
// ----------------------------------------------------------------------------
function SimulationResultPanel({ data }: { data: DryRunResult }) {
  const changedRows = data.decisions.filter((d) => d.changed)
  return (
    <div className="space-y-3 text-sm">
      <div>
        <strong>Total inbound (7d):</strong> {data.total_inbound}
      </div>
      <div>
        <strong>Cambiarian:</strong> {data.summary.changed_count}
      </div>
      <div>
        <strong>Antes:</strong>
        <pre className="text-xs bg-muted p-2 rounded mt-1">
          {JSON.stringify(data.summary.before, null, 2)}
        </pre>
      </div>
      <div>
        <strong>Despues:</strong>
        <pre className="text-xs bg-muted p-2 rounded mt-1">
          {JSON.stringify(data.summary.after, null, 2)}
        </pre>
      </div>
      <details>
        <summary className="cursor-pointer">
          Ver conversaciones afectadas ({changedRows.length})
        </summary>
        <ul className="text-xs mt-2 space-y-1">
          {changedRows.slice(0, 50).map((d) => (
            <li key={d.conversation_id}>
              <a
                href={`/conversaciones/${d.conversation_id}`}
                className="underline"
              >
                {d.conversation_id.slice(0, 8)}
              </a>
              : {d.current_decision?.reason ?? 'unknown'}/
              {d.current_decision?.agent_id ?? 'null'} →{' '}
              {d.candidate_decision.reason}/
              {d.candidate_decision.agent_id ?? 'null'}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

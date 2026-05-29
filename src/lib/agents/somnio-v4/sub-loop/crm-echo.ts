/**
 * CRM echo — contrato de salida CRM del sub-loop (standalone #2, Plan 05). D-14/D-23/D-22.
 *
 * Dos responsabilidades:
 *
 * 1. **deriveCrmActions (D-14/D-23):** funcion PURA que deriva `CrmActionRegistrada[]`
 *    de los tool-results REALES del AI SDK (`rawResult.steps[].toolResults`). Es
 *    GROUND-TRUTH — lo que el sub-loop EJECUTO de verdad — NO el auto-reporte del LLM
 *    (que podria mentir; T-sub-01 Repudiation). Resuelve el BLOCKER de research #1:
 *    `LoopOutcomeSchema` NO tiene campos de accion CRM, asi que el orquestador NO
 *    podia poblar el ledger. Solucion adoptada (opcion B del RESEARCH): derivar del
 *    rawResult, mapeando `MutationResult.status` -> result {success|failed|cas_reject}.
 *    Espeja el patron de acceso de extractStepData (index.ts:144-225).
 *
 * 2. **createSimulatedMutationTools (D-22/S5):** factory de mutation-tools SIMULADAS
 *    para el sandbox. Cada tool retorna un `MutationResult` sintetico ('executed')
 *    SIN tocar DB. El sub-loop ve "exito", puebla crmActions igual (View B), el debug
 *    panel los muestra — pero CERO escritura. Paridad INTERRUPTION-PARITY §4.4
 *    (persistencia DB vs memoria = diferencia permitida). CERO import de domain /
 *    supabase (T-sub-03 / Regla 3 — verificable via grep).
 *
 * v4-specific -> Regla 6 satisfecha.
 */
import { tool } from 'ai'
import { z } from 'zod'
import type { CrmActionRegistrada } from '../types'

/**
 * Las 5 mutation-tools del toolset `crm_mutation` (tools.ts:57-61). Solo estas
 * cuentan como mutacion CRM en deriveCrmActions; kb_search / getActiveOrderByPhone
 * (read-only) se filtran.
 */
export const MUTATION_TOOL_NAMES: ReadonlySet<string> = new Set([
  'createOrder',
  'updateOrder',
  'moveOrderToStage',
  'addOrderNote',
  'updateContact',
])

/** Subset del shape de un toolResult del AI SDK v6 que consumimos. */
interface ToolResultLike {
  toolName?: string
  input?: unknown
  output?: {
    status?: string
    error?: { code?: string }
    data?: { stageId?: string }
  } | unknown
}

/**
 * Mapea `MutationResult.status` -> `CrmActionRegistrada.result` (D-14/D-23):
 *   - 'executed' | 'duplicate'      -> 'success'
 *   - 'stage_changed_concurrently'  -> 'cas_reject'
 *   - else (validation_error/error/resource_not_found/workspace_mismatch) -> 'failed'
 */
function mapStatusToResult(status: string | undefined): CrmActionRegistrada['result'] {
  if (status === 'executed' || status === 'duplicate') return 'success'
  if (status === 'stage_changed_concurrently') return 'cas_reject'
  return 'failed'
}

/**
 * Deriva `crmActions[]` de los tool-results reales del rawResult del AI SDK
 * (GROUND-TRUTH, NO auto-reporte del LLM — D-23). Filtra por MUTATION_TOOL_NAMES,
 * mapea status -> result, conserva args/code/stageAtTime. `origen: 'rag'` (D-14 —
 * ahora ejecuta el sub-loop grounded, no el camino determinista).
 *
 * Defensivo ante rawResult null / sin steps / sin toolResults -> [].
 */
export function deriveCrmActions(rawResult: unknown): CrmActionRegistrada[] {
  if (!rawResult || typeof rawResult !== 'object') return []
  const steps = (rawResult as { steps?: unknown }).steps
  if (!Array.isArray(steps)) return []

  const allResults = steps.flatMap((step: { toolResults?: ToolResultLike[] }) =>
    Array.isArray(step?.toolResults) ? step.toolResults : [],
  )

  const actions: CrmActionRegistrada[] = []
  for (const tr of allResults) {
    if (!tr?.toolName || !MUTATION_TOOL_NAMES.has(tr.toolName)) continue

    const output = (tr.output ?? {}) as {
      status?: string
      error?: { code?: string }
      data?: { stageId?: string }
    }
    const result = mapStatusToResult(output.status)
    const code = output.error?.code

    const action: CrmActionRegistrada = {
      tool: tr.toolName,
      args: (tr.input ?? {}) as Record<string, unknown>,
      result,
      origen: 'rag',
    }
    if (code != null) action.code = code
    if (output.data?.stageId != null) action.stageAtTime = output.data.stageId

    actions.push(action)
  }

  return actions
}

/**
 * Factory de mutation-tools SIMULADAS (D-22/S5). Cada `execute` retorna un
 * `MutationResult` sintetico ('executed') con un id `sim-*` + echo del input +
 * flag `_simulated:true`, SIN tocar DB. El sub-loop puebla crmActions igual
 * (View B), el debug panel los muestra; cero escritura (paridad §4.4).
 *
 * Schema permisivo (z.record passthrough) — no replicamos el schema exacto de la
 * real (no hay validacion de negocio en sandbox; el objetivo es el no-op + el echo).
 * CERO import de domain / supabase (T-sub-03 / Regla 3).
 */
export function createSimulatedMutationTools(): Record<string, any> {
  const simulatedExecute = async (input: Record<string, unknown>) => ({
    status: 'executed' as const,
    data: {
      id: `sim-${Math.random().toString(36).slice(2, 10)}`,
      _simulated: true,
      ...input,
    },
  })

  const passthroughSchema = z.record(z.string(), z.unknown())

  const make = () =>
    tool({
      description: 'simulated mutation-tool (sandbox no-op, D-22)',
      inputSchema: passthroughSchema,
      execute: simulatedExecute,
    })

  return {
    createOrder: make(),
    updateOrder: make(),
    moveOrderToStage: make(),
    addOrderNote: make(),
    updateContact: make(),
  }
}

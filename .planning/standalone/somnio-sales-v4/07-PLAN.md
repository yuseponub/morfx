---
plan: 07
phase: somnio-sales-v4
wave: 3
depends_on: [06]
files_modified:
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts
  - src/lib/agents/somnio-v4/escalation.ts
  - src/lib/agents/somnio-v4/threshold.ts
  - src/lib/agents/somnio-v4/invocations.ts
  - src/lib/agents/somnio-v4/index.ts
  - src/lib/agents/somnio-v4/__tests__/escalation.test.ts
  - src/lib/agents/somnio-v4/__tests__/invocations.test.ts
addresses_decisions: [D-01, D-02, D-03, D-07, D-09, D-11, D-13, D-15, D-16, D-17, D-18, D-19, D-20, D-22, D-24, D-35, D-57, D-58, D-60, D-65, D-68]
addresses_research_pitfalls: [Pitfall 5]
autonomous: true
estimated_tasks: 8
must_haves:
  truths:
    - "somnio-v4-agent.ts processMessage orquesta: comprehend → mergeAnalysis → decideEscalation → (sub-loop OR happy path)"
    - "createOrder en happy path se ejecuta INLINE vía crm-mutation-tools (D-07/D-19/D-20) — NO deferred"
    - "createOrder failure NO envía template post-success — escala a sub-loop o template error (D-20)"
    - "W-04: las 5 mutations D-19 están wired inline. createOrder/updateOrder/moveOrderToStage como come-back; updateContact/addOrderNote como execute fire-and-forget"
    - "invocations.ts mapea transitions del state machine a Invocation objects (W-04 — resolvedor inline)"
    - "Cada createOrder/addOrderNote pasa idempotencyKey con tag 'happy' (Pitfall 5)"
    - "Threshold leído desde platform_config en cada turn (D-11 parametrizable)"
    - "Sub-loop se invoca SOLO bajo los 4 triggers D-02 (no más, no menos)"
    - "D-60: cuando outcome=no_match, session se flagged con requiresHuman=true (state.requires_human)"
    - "Cero imports desde @/lib/agents/somnio-v3/* (D-24)"
    - "index.ts re-exporta processMessage (completar de Plan 06)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/somnio-v4-agent.ts"
      provides: "processMessage orquestador principal del agente"
      exports: ["processMessage"]
    - path: "src/lib/agents/somnio-v4/escalation.ts"
      provides: "decideSubLoopReason — pure function que decide trigger D-02"
      exports: ["decideSubLoopReason"]
    - path: "src/lib/agents/somnio-v4/threshold.ts"
      provides: "getLowConfidenceThreshold — lee platform_config"
      exports: ["getLowConfidenceThreshold"]
    - path: "src/lib/agents/somnio-v4/invocations.ts"
      provides: "buildInvocationsForTransition — mapea state changes a 5 mutations D-19 (W-04)"
      exports: ["buildInvocationsForTransition", "executeInvocations"]
  key_links:
    - from: "processMessage decideSubLoopReason returns 'low_confidence'"
      to: "runSubLoop({reason: 'low_confidence', ctx})"
      via: "imports desde ./sub-loop"
      pattern: "runSubLoop"
    - from: "processMessage CREATE_ORDER_ACTIONS.has(action)"
      to: "createCrmMutationTools(...).createOrder.execute({...})"
      via: "directo, NO via crm-writer-adapter"
      pattern: "createCrmMutationTools"
    - from: "processMessage transition with shipping change"
      to: "tools.updateOrder.execute({orderId, shippingAddress, shippingCity, shippingDepartment})"
      via: "buildInvocationsForTransition resolves come-back invocation (W-04)"
      pattern: "tools.updateOrder.execute"
    - from: "processMessage transition with cancelar action"
      to: "tools.moveOrderToStage.execute({orderId, stageId: CANCELED_UUID})"
      via: "buildInvocationsForTransition come-back (W-04)"
      pattern: "tools.moveOrderToStage.execute"
    - from: "processMessage transition with email/cedula captured"
      to: "tools.updateContact.execute({...})"
      via: "execute fire-and-forget (W-04 / D-19 execute kind)"
      pattern: "tools.updateContact"
    - from: "processMessage handoff or mutation_failed"
      to: "tools.addOrderNote.execute({orderId, note})"
      via: "execute fire-and-forget audit (W-04 / D-19 execute kind)"
      pattern: "tools.addOrderNote"
---

<objective>
Wave 3 — el orquestador `somnio-v4-agent.ts`. Esta es la pieza central de v4.

Construye:
1. `escalation.ts` — pure function `decideSubLoopReason()` que evalúa los 4 triggers D-02
2. `threshold.ts` — wrapper que lee `platform_config.somnio_v4_low_confidence_threshold`
3. **`invocations.ts` (W-04 fix)** — resolvedor que mapea transitions del state machine a `Invocation` objects para las 5 mutations D-19. Por cada transition resuelta, decide si emitir invocations come-back (createOrder/updateOrder/moveOrderToStage) o execute fire-and-forget (updateContact/addOrderNote). Esto cierra el gap del checker B-W-04 — las 4 mutations no-createOrder estaban sólo accesibles vía sub-loop, ahora también se disparan inline desde happy path.
4. `somnio-v4-agent.ts` — `processMessage` + `processSystemEvent` orquestadores. Reemplaza el deferred-orderData de v3 por crm-mutation-tools INLINE (D-07/D-20). D-60: cuando outcome=no_match, marca `requires_human=true` en el state output.
5. Actualizar `index.ts` para re-exportar `processMessage`
6. Tests de escalation + tests de invocations builder

Output: 5 archivos código + 2 tests + 1 commit autónomo.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/standalone/somnio-sales-v4/CONTEXT.md
@.planning/standalone/somnio-sales-v4/RESEARCH.md
@.planning/standalone/somnio-sales-v4/PATTERNS.md
@.claude/skills/crm-mutation-tools.md
@src/lib/agents/somnio-v3/somnio-v3-agent.ts
@src/lib/agents/engine/v3-production-runner.ts
@src/lib/agents/somnio-v4/state.ts
@src/lib/agents/somnio-v4/transitions.ts
@src/lib/agents/somnio-v4/comprehension.ts
@src/lib/agents/somnio-v4/response-track.ts
@src/lib/agents/somnio-v4/sub-loop/index.ts
@src/lib/agents/somnio-v4/constants.ts
@src/lib/agents/somnio-v4/types.ts
</context>

<interfaces>
<!-- Patrón v3 a reemplazar (deferred order creation): src/lib/agents/engine/v3-production-runner.ts:475-493 -->
<!-- En v4 esto se HACE INLINE por D-07/D-19/D-20: -->

```typescript
// V4 sketch (PATTERNS sección "somnio-v4-agent.ts" lines 511-540)
if (CREATE_ORDER_ACTIONS.has(salesResult.accion)) {
  const tools = createCrmMutationTools({ workspaceId, invoker: 'somnio-sales-v4' })
  const result = await tools.createOrder.execute({
    /* fields desde mergedState */,
    idempotencyKey: `somnio-v4-createOrder-${sessionId}-happy`,  // Pitfall 5
  })
  if (result.status !== 'success') {
    // D-20: NO enviar template pendiente_* sin orden creada — escalar
    return mapErrorToAgentOutput(result, mergedState)
  }
}
```

<!-- D-19 — 5 mutations totales y su trigger kind (W-04 fix wires todas inline) -->
| Tool | Trigger kind | Cuándo se dispara |
|---|---|---|
| `createOrder` | come_back | Transition con `accion ∈ CREATE_ORDER_ACTIONS`, antes del template pendiente_* (existente) |
| `updateOrder` | come_back | Transition donde se capturan/actualizan shipping fields del state — orderId resuelto vía state.activeOrderId |
| `moveOrderToStage` | come_back | Transition con `accion='cancelar'` o equivalente → stageId=CANCELED_UUID; CAS reject propaga a sub-loop reason='cas_reject' |
| `updateContact` | execute (fire-and-forget) | Transition donde se captura email/cédula nuevo en state.datosCliente |
| `addOrderNote` | execute (fire-and-forget) | Transitions handoff/mutation-failure (audit interno; nota: "v4 escaló por reason X") |

<!-- D-02 escalation triggers -->
SubLoopReason = 'low_confidence' | 'crm_mutation' | 'cas_reject' | 'razonamiento_libre'
- low_confidence: intent_confidence < threshold
- razonamiento_libre: intent.primary IN {'razonamiento_libre', 'otro'}
- crm_mutation: cualquier transition que produzca acción CRM no trivial donde la mutación necesite validación contextual
- cas_reject: post-execution de moveOrderToStage si retorna 'stage_changed_concurrently'

<!-- crm-mutation-tools factory shape (.claude/skills/crm-mutation-tools.md) -->
```typescript
const tools = createCrmMutationTools({ workspaceId, invoker: 'somnio-sales-v4' })
// tools.createOrder.execute({...}) → MutationResult
// tools.updateOrder.execute({...}) → MutationResult
// tools.moveOrderToStage.execute({...}) → MutationResult (puede retornar 'stage_changed_concurrently')
// tools.addOrderNote.execute({...}) → MutationResult
// tools.updateContact.execute({...}) → MutationResult
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: threshold.ts (lookup platform_config)</name>
  <files>src/lib/agents/somnio-v4/threshold.ts</files>
  <read_first>
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-03, D-11, D-65)
    - supabase/migrations/20260501100200_somnio_v4_platform_config.sql (key seed)
  </read_first>
  <action>
Crear `src/lib/agents/somnio-v4/threshold.ts`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_THRESHOLD = 0.70  // D-03 — fallback si platform_config no responde

let cachedAt = 0
let cachedValue = DEFAULT_THRESHOLD
const CACHE_TTL_MS = 60_000  // 60s — calibración post-flip puede ajustar via SQL UPDATE

/**
 * Lee `platform_config.somnio_v4_low_confidence_threshold` (D-11 parametrizable).
 * Cachea 60s para no martillar la DB en cada turn.
 * Fallback a 0.70 (D-03) si la key no existe o hay error.
 *
 * D-65: el valor se aplica directamente sobre `intent.intent_confidence` (sin fórmula).
 */
export async function getLowConfidenceThreshold(): Promise<number> {
  const now = Date.now()
  if (now - cachedAt < CACHE_TTL_MS) return cachedValue

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('platform_config')
      .select('value')
      .eq('key', 'somnio_v4_low_confidence_threshold')
      .maybeSingle()

    if (error || !data) {
      cachedValue = DEFAULT_THRESHOLD
    } else {
      const v = typeof data.value === 'number' ? data.value : Number(data.value)
      cachedValue = Number.isFinite(v) && v >= 0 && v <= 1 ? v : DEFAULT_THRESHOLD
    }
    cachedAt = now
    return cachedValue
  } catch {
    cachedValue = DEFAULT_THRESHOLD
    cachedAt = now
    return cachedValue
  }
}

/** Test helper — limpia cache. */
export function __clearThresholdCache() {
  cachedAt = 0
  cachedValue = DEFAULT_THRESHOLD
}
```

Nota: se usa `createAdminClient` directo aquí porque no hay un domain wrapper específico para platform_config (similar a sync.ts en Plan 04 — RESEARCH lo autoriza para tablas nuevas/utilitarias).
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/threshold.ts && grep -q "getLowConfidenceThreshold" src/lib/agents/somnio-v4/threshold.ts && grep -q "DEFAULT_THRESHOLD = 0.70" src/lib/agents/somnio-v4/threshold.ts && grep -q "somnio_v4_low_confidence_threshold" src/lib/agents/somnio-v4/threshold.ts && [ "$(grep -rE \"from '@/lib/agents/somnio-v3\" src/lib/agents/somnio-v4/threshold.ts | wc -l)" = "0" ]</automated>
  </verify>
  <acceptance_criteria>
    - exporta `getLowConfidenceThreshold`
    - DEFAULT_THRESHOLD = 0.70 (D-03)
    - usa key literal `somnio_v4_low_confidence_threshold`
    - tiene cache 60s para evitar DB hit por turn
    - fallback robusto a 0.70 si DB falla
  </acceptance_criteria>
  <done>Threshold lookup listo.</done>
</task>

<task type="auto">
  <name>Task 2: escalation.ts (decideSubLoopReason pure function)</name>
  <files>src/lib/agents/somnio-v4/escalation.ts</files>
  <read_first>
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-02, D-65, D-69)
    - src/lib/agents/somnio-v4/sub-loop/output-schema.ts (SubLoopReason type)
  </read_first>
  <action>
Crear `src/lib/agents/somnio-v4/escalation.ts`:

```typescript
import type { SubLoopReason } from './sub-loop/output-schema'

export interface EscalationInput {
  /** intent_confidence reportado por comprehend (D-63). 0..1 */
  confidence: number
  /** Threshold leído de platform_config (D-11). 0..1 */
  threshold: number
  /** intent.primary clasificado por comprehend. */
  intent: string
  /** True si la transition resuelta produce una acción CRM no-trivial (set por orquestador post-resolveTransition). */
  isCrmMutation: boolean
  /**
   * True si una mutación moveOrderToStage acaba de retornar 'stage_changed_concurrently'.
   * Solo se setea en el segundo pase del orquestador (after-mutation re-run).
   */
  casReject: boolean
}

/**
 * Decide si escalar al sub-loop y con qué reason (D-02).
 * Orden de prioridad: cas_reject > crm_mutation > razonamiento_libre > low_confidence > null (happy path).
 *
 * Pure function — testeable sin DB ni LLM.
 *
 * D-69: 'otro' es sumidero por construcción del few-shot — caerá típicamente en low_confidence
 * por su intent_confidence < threshold, sin necesidad de lógica especial aquí.
 */
export function decideSubLoopReason(input: EscalationInput): SubLoopReason | null {
  // 1) cas_reject (post-mutation retry decision)
  if (input.casReject) return 'cas_reject'

  // 2) crm_mutation (transition produce mutación que necesita validación contextual)
  if (input.isCrmMutation) return 'crm_mutation'

  // 3) razonamiento_libre / otro intents — D-02 explícito
  if (input.intent === 'razonamiento_libre' || input.intent === 'otro') {
    return 'razonamiento_libre'
  }

  // 4) low confidence — D-65 threshold sobre intent_confidence
  if (input.confidence < input.threshold) return 'low_confidence'

  return null
}
```

Anti-patterns: NO mezclar la decisión con side-effects (DB, LLM). Pure function.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/escalation.ts && grep -q "decideSubLoopReason" src/lib/agents/somnio-v4/escalation.ts && grep -q "'cas_reject'" src/lib/agents/somnio-v4/escalation.ts && grep -q "'crm_mutation'" src/lib/agents/somnio-v4/escalation.ts && grep -q "'razonamiento_libre'" src/lib/agents/somnio-v4/escalation.ts && grep -q "'low_confidence'" src/lib/agents/somnio-v4/escalation.ts</automated>
  </verify>
  <acceptance_criteria>
    - Pure function exportada
    - Orden de prioridad documentado en JSDoc
    - 4 reasons cubiertos (cas_reject, crm_mutation, razonamiento_libre, low_confidence)
    - Cero imports de DB / LLM
  </acceptance_criteria>
  <done>Escalation logic listo.</done>
</task>

<task type="auto">
  <name>Task 3: invocations.ts — resolvedor de las 5 mutations D-19 inline (W-04 fix)</name>
  <files>src/lib/agents/somnio-v4/invocations.ts</files>
  <read_first>
    - src/lib/agents/somnio-v4/transitions.ts (TRANSITIONS array — buscar transitions con accion='cancelar', 'capturar_direccion', 'capturar_correo', 'capturar_cedula', etc.)
    - src/lib/agents/somnio-v4/state.ts (AgentState shape — datosCliente fields, activeOrderId)
    - src/lib/agents/somnio-v4/types.ts (Invocation type)
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-15, D-19, D-20)
    - .claude/skills/crm-mutation-tools.md (mutation tool inputs)
  </read_first>
  <action>
Crear `src/lib/agents/somnio-v4/invocations.ts`:

```typescript
import { createCrmMutationTools } from '@/lib/agents/shared/crm-mutation-tools'
import { getCollector } from '@/lib/observability'
import { SOMNIO_V4_AGENT_ID, SOMNIO_WORKSPACE_ID } from './config'
import type { AgentState, V4AgentInput } from './types'

/**
 * D-19 W-04: resolvedor que dispara las mutations CRM no-createOrder INLINE desde el happy path.
 *
 * Trigger kinds (D-15):
 *  - come-back (blocking, afecta respuesta): updateOrder, moveOrderToStage(cancelar)
 *  - execute (fire-and-forget): updateContact, addOrderNote
 *
 * createOrder se maneja directamente en somnio-v4-agent.ts (es path crítico, no pasa por aquí).
 *
 * Convención de idempotency keys (Pitfall 5):
 *   `somnio-v4-{tool}-{sessionId}-{tag}` donde tag identifica el call site.
 */

export interface InvocationContext {
  workspaceId: string
  sessionId: string
  conversationId: string
}

export interface InvocationOutcome {
  cancelarFailed?: { code: string; cas: boolean }   // si moveOrderToStage(cancelar) retornó error
  updateOrderFailed?: { code: string }
  // updateContact / addOrderNote son fire-and-forget — no se reportan
}

/**
 * Procesa el merged state tras resolveTransition y dispara las mutations apropiadas.
 *
 * Decisión de qué mutation disparar se basa en:
 *  - `salesAccion` (la accion del salesResult): 'cancelar' → moveOrderToStage; 'capturar_direccion' → updateOrder
 *  - `stateChanges`: si datosCliente.email/cedula cambió → updateContact
 *  - `escalation`: si processMessage decide escalar tras una mutation → addOrderNote audit
 *
 * Retorna InvocationOutcome con info de fallos come-back que el orquestador necesita
 * para decidir escalación (cas_reject) o template de error.
 */
export async function executeInvocations(args: {
  ctx: InvocationContext
  state: AgentState
  salesAccion: string | null
  stateChanges: Partial<AgentState['datosCliente']>
  input: V4AgentInput
  extra?: { handoffReason?: string; mutationFailedNote?: string }
}): Promise<InvocationOutcome> {
  const tools = createCrmMutationTools({
    workspaceId: args.ctx.workspaceId,
    invoker: SOMNIO_V4_AGENT_ID,
  })

  const outcome: InvocationOutcome = {}
  const orderId = args.state.activeOrderId  // resuelto previamente vía come-back getActiveOrderByPhone si aplica

  // -----------------------------------------------------------
  // come-back 1: updateOrder (shipping captured) — D-19 W-04
  // Transitions ejemplo: 'capturar_direccion', 'pedir_direccion_completa' al confirmar
  // Disparador: state changes en shipping fields tras transition
  // -----------------------------------------------------------
  const shippingChanged =
    !!orderId &&
    (
      'direccion' in args.stateChanges ||
      'ciudad' in args.stateChanges ||
      'departamento' in args.stateChanges
    ) &&
    !!args.state.datosCliente.direccion &&
    !!args.state.datosCliente.ciudad

  if (shippingChanged) {
    const result = await tools.updateOrder.execute({
      orderId,
      shippingAddress: args.state.datosCliente.direccion,
      shippingCity: args.state.datosCliente.ciudad,
      shippingDepartment: args.state.datosCliente.departamento ?? null,
      idempotencyKey: `somnio-v4-updateOrder-${args.ctx.sessionId}-shipping`,
    })
    if (result.status !== 'success') {
      outcome.updateOrderFailed = {
        code: 'error' in result ? (result.error?.code ?? 'unknown') : 'unknown',
      }
      getCollector()?.recordEvent('pipeline_decision', 'updateOrder_failed', {
        agent: SOMNIO_V4_AGENT_ID,
        sessionId: args.ctx.sessionId,
        errorCode: outcome.updateOrderFailed.code,
      })
    }
  }

  // -----------------------------------------------------------
  // come-back 2: moveOrderToStage (cancelar) — D-19 W-04
  // Transition: salesAccion='cancelar' (o equivalente) + activeOrderId presente
  // CAS reject (stage_changed_concurrently) → flag para que orquestador escale a sub-loop reason='cas_reject'
  // -----------------------------------------------------------
  if (args.salesAccion === 'cancelar' && orderId) {
    // CANCELED_UUID — usar la stage UUID que delivery-zones.ts / config define para 'CANCELADO'.
    // El executor debe leerla del config compartido (D-29) — placeholder constante mientras tanto.
    const CANCELED_STAGE_UUID = process.env.SOMNIO_CANCELED_STAGE_UUID ?? '<set-from-config>'
    const result = await tools.moveOrderToStage.execute({
      orderId,
      stageId: CANCELED_STAGE_UUID,
      idempotencyKey: `somnio-v4-moveStage-${args.ctx.sessionId}-cancelar`,
    })
    if (result.status !== 'success') {
      const code = 'error' in result ? (result.error?.code ?? 'unknown') : 'unknown'
      outcome.cancelarFailed = { code, cas: code === 'stage_changed_concurrently' }
      getCollector()?.recordEvent('pipeline_decision', 'moveOrderToStage_failed', {
        agent: SOMNIO_V4_AGENT_ID,
        sessionId: args.ctx.sessionId,
        targetStage: 'CANCELADO',
        errorCode: code,
        cas: outcome.cancelarFailed.cas,
      })
    }
  }

  // -----------------------------------------------------------
  // execute (fire-and-forget) 1: updateContact — D-19 W-04
  // Transitions: capturar_correo / capturar_cedula
  // -----------------------------------------------------------
  const contactFieldsToUpdate: { email?: string; idNumber?: string } = {}
  if ('email' in args.stateChanges && args.state.datosCliente.email) {
    contactFieldsToUpdate.email = args.state.datosCliente.email
  }
  if ('cedula' in args.stateChanges && args.state.datosCliente.cedula) {
    contactFieldsToUpdate.idNumber = args.state.datosCliente.cedula
  }
  if (Object.keys(contactFieldsToUpdate).length > 0 && args.input.contactPhone) {
    // Fire-and-forget — no esperamos resultado
    void tools.updateContact.execute({
      phone: args.input.contactPhone,
      ...contactFieldsToUpdate,
      idempotencyKey: `somnio-v4-updateContact-${args.ctx.sessionId}-${Object.keys(contactFieldsToUpdate).join('+')}`,
    }).catch((err) => {
      getCollector()?.recordEvent('pipeline_decision', 'updateContact_failed_silent', {
        agent: SOMNIO_V4_AGENT_ID,
        sessionId: args.ctx.sessionId,
        error: (err as Error).message,
      })
    })
  }

  // -----------------------------------------------------------
  // execute (fire-and-forget) 2: addOrderNote (handoff / mutation fail audit) — D-19 W-04
  // Disparado por orquestador cuando hay handoff humano o mutación falló — pasa note via args.extra
  // -----------------------------------------------------------
  if (orderId && (args.extra?.handoffReason || args.extra?.mutationFailedNote)) {
    const note = args.extra?.handoffReason
      ? `[v4 handoff] ${args.extra.handoffReason}`
      : `[v4 mutation_failed] ${args.extra?.mutationFailedNote ?? ''}`
    void tools.addOrderNote.execute({
      orderId,
      note,
      idempotencyKey: `somnio-v4-addOrderNote-${args.ctx.sessionId}-${args.extra?.handoffReason ? 'handoff' : 'mutation_failed'}`,
    }).catch((err) => {
      getCollector()?.recordEvent('pipeline_decision', 'addOrderNote_failed_silent', {
        agent: SOMNIO_V4_AGENT_ID,
        sessionId: args.ctx.sessionId,
        error: (err as Error).message,
      })
    })
  }

  return outcome
}
```

**W-04 fix:** este archivo cierra el gap del checker — las 4 mutations no-createOrder ahora se disparan inline desde happy path siguiendo D-19 trigger kinds (3 come-back + 2 execute). Sub-loop sigue siendo path alternativo cuando comprehension/mutación falla, pero NO es el único disparador.

**Anti-patterns aplicados:**
- come-back: `await` (blocking), retorna outcome
- execute: `void` + `.catch()` (fire-and-forget), errores van solo a observability
- Idempotency keys con tags distintivos por call site (Pitfall 5)
- D-20: si come-back falla, el orquestador NO envía template post-success — escala
- CAS reject explícito: el código del error se inspecciona y se propaga al orquestador para que decida `cas_reject` reason
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/invocations.ts && grep -q "executeInvocations" src/lib/agents/somnio-v4/invocations.ts && grep -q "tools.updateOrder.execute" src/lib/agents/somnio-v4/invocations.ts && grep -q "tools.moveOrderToStage.execute" src/lib/agents/somnio-v4/invocations.ts && grep -q "tools.updateContact.execute" src/lib/agents/somnio-v4/invocations.ts && grep -q "tools.addOrderNote.execute" src/lib/agents/somnio-v4/invocations.ts && grep -q "stage_changed_concurrently" src/lib/agents/somnio-v4/invocations.ts && grep -q "void tools" src/lib/agents/somnio-v4/invocations.ts && [ "$(grep -rE \"from '@/lib/agents/somnio-v3\" src/lib/agents/somnio-v4/invocations.ts | wc -l)" = "0" ]</automated>
  </verify>
  <acceptance_criteria>
    - 4 mutations no-createOrder presentes (updateOrder/moveOrderToStage/updateContact/addOrderNote)
    - come-back: `await tools.updateOrder.execute` y `await tools.moveOrderToStage.execute`
    - execute fire-and-forget: `void tools.updateContact.execute` y `void tools.addOrderNote.execute`
    - CAS reject detection (`stage_changed_concurrently`) presente
    - Idempotency keys con tags distintivos por call site
    - Cero imports somnio-v3
  </acceptance_criteria>
  <done>5 mutations D-19 wired inline (W-04 fix).</done>
</task>

<task type="auto">
  <name>Task 4: somnio-v4-agent.ts (orquestador) — happy path + sub-loop integration + D-60 + W-04 wire</name>
  <files>src/lib/agents/somnio-v4/somnio-v4-agent.ts</files>
  <read_first>
    - src/lib/agents/somnio-v3/somnio-v3-agent.ts (469 líneas — analog completo)
    - src/lib/agents/engine/v3-production-runner.ts (líneas 475-493 — patrón order deferred a reemplazar)
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (sección "somnio-v4-agent.ts")
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-01, D-07, D-15, D-16, D-18, D-19, D-20, D-58, D-60)
    - .claude/skills/crm-mutation-tools.md (factory + idempotency contract)
    - src/lib/agents/somnio-v4/invocations.ts (acabado de crear — executeInvocations)
    - src/lib/agents/somnio-v4/* (todos los building blocks de Plan 06)
  </read_first>
  <action>
Crear `src/lib/agents/somnio-v4/somnio-v4-agent.ts` clonando el shape de v3 + integrando las nuevas piezas.

Estructura completa (basada en PATTERNS sección "somnio-v4-agent.ts"):

```typescript
import { comprehend } from './comprehension'
import { mergeAnalysis, computeGates, serializeState, deserializeState, hasAction } from './state'
import { resolveTransition, systemEventToKey } from './transitions'
import { resolveSalesTrack } from './sales-track'
import { resolveResponseTrack } from './response-track'
import { checkGuards } from './guards'
import { derivePhase } from './phase'
import { CRM_ACTIONS, CREATE_ORDER_ACTIONS } from './constants'
import { SOMNIO_V4_AGENT_ID, SOMNIO_WORKSPACE_ID } from './config'
import { decideSubLoopReason } from './escalation'
import { getLowConfidenceThreshold } from './threshold'
import { runSubLoop } from './sub-loop'
import { executeInvocations } from './invocations'  // W-04 fix
import type { LoopOutcome } from './sub-loop/output-schema'
import { createCrmMutationTools } from '@/lib/agents/shared/crm-mutation-tools'
import { getCollector } from '@/lib/observability'
import type { AgentState, V4AgentInput, V4AgentOutput, AccionRegistrada } from './types'

/**
 * Top-level dispatch — D-18 turn order:
 *   comprehension → resolveTransition → invocations (come-back blocking, then execute fire-and-forget) → response
 * Sin boot step. Sin preload de CRM (D-16).
 */
export async function processMessage(input: V4AgentInput): Promise<V4AgentOutput> {
  if (input.systemEvent && input.systemEvent.type === 'timer_expired') {
    return processSystemEvent(input, input.systemEvent)
  }
  return processUserMessage(input)
}

async function processUserMessage(input: V4AgentInput): Promise<V4AgentOutput> {
  // 1) Deserialize state
  const state = deserializeState(input.session?.datos_capturados ?? {})

  // 2) Comprehend
  const { analysis, tokensUsed } = await comprehend({
    message: input.message,
    history: input.history ?? [],
    existingData: state.datosCliente,
    recentBotMessages: input.recentBotMessages ?? [],
  })

  // 3) Merge → state + changes
  const { mergedState, changes } = mergeAnalysis(state, analysis)

  // 4) Decide if escalate (low_confidence / razonamiento_libre — first pass before transition)
  const threshold = await getLowConfidenceThreshold()
  const earlyReason = decideSubLoopReason({
    confidence: analysis.intent.intent_confidence,
    threshold,
    intent: analysis.intent.primary,
    isCrmMutation: false,
    casReject: false,
  })

  getCollector()?.recordEvent('pipeline_decision', 'comprehension_completed', {
    agent: SOMNIO_V4_AGENT_ID,
    intent: analysis.intent.primary,
    intent_confidence: analysis.intent.intent_confidence,
    intent_confidence_reasoning: analysis.intent.intent_confidence_reasoning ?? null,
    threshold,
    scaledToSubLoop: earlyReason !== null,
    tokensUsed,
  })

  if (earlyReason === 'low_confidence' || earlyReason === 'razonamiento_libre') {
    getCollector()?.recordEvent('pipeline_decision', 'subloop_low_confidence_invoked', {
      agent: SOMNIO_V4_AGENT_ID,
      reason: earlyReason,
      confidence: analysis.intent.intent_confidence,
      threshold,
      intent: analysis.intent.primary,
    })
    const outcome = await runSubLoop({
      reason: earlyReason,
      ctx: {
        workspaceId: input.workspaceId ?? SOMNIO_WORKSPACE_ID,
        conversationId: input.conversationId,
        sessionId: input.sessionId,
        userMessage: input.message,
        recentMessages: (input.history ?? []).slice(-4).map((m) => ({ role: m.role, content: m.content })),
      },
    })
    // D-60: si no_match, agente flagga session con requiresHuman=true
    if (outcome.status === 'no_match') {
      // captureUnknownCase se invoca en Plan 09 hooked aquí (revision W-08 deja sólo Option 2: hoisted post-runSubLoop)
      // Plan 09 inyecta:  void captureUnknownCase({ ... })  +  emit handoff_low_confidence_fallback
    }
    return mapOutcomeToAgentOutput(outcome, mergedState)
  }

  // 5) Phase + sales track (state machine determinista)
  const phase = derivePhase(mergedState.accionesEjecutadas)
  const gates = computeGates(mergedState)

  // 6) Guards R0/R1
  const guardResult = checkGuards({ state: mergedState, gates, intent: analysis.intent.primary })
  if (!guardResult.ok) {
    // Misma semántica que v3
  }

  const salesResult = resolveSalesTrack({ phase, state: mergedState, gates, event: analysis.intent.primary })
  getCollector()?.recordEvent('pipeline_decision', 'sales_track_result', {
    agent: SOMNIO_V4_AGENT_ID,
    phase,
    accion: salesResult.accion,
  })

  // 7) D-19 W-04: ejecutar las 4 mutations no-createOrder INLINE (updateOrder, moveOrderToStage, updateContact, addOrderNote)
  const invCtx = {
    workspaceId: input.workspaceId ?? SOMNIO_WORKSPACE_ID,
    sessionId: input.sessionId,
    conversationId: input.conversationId,
  }
  const invOutcome = await executeInvocations({
    ctx: invCtx,
    state: mergedState,
    salesAccion: salesResult.accion ?? null,
    stateChanges: changes.datosCliente ?? {},
    input,
  })

  // 7.b) Si moveOrderToStage retornó CAS reject, escalar a sub-loop reason='cas_reject'
  if (invOutcome.cancelarFailed?.cas) {
    getCollector()?.recordEvent('pipeline_decision', 'subloop_cas_reject_invoked', {
      agent: SOMNIO_V4_AGENT_ID,
      sessionId: input.sessionId,
      cancelStageFailed: true,
    })
    const outcome = await runSubLoop({
      reason: 'cas_reject',
      ctx: {
        workspaceId: invCtx.workspaceId,
        conversationId: invCtx.conversationId,
        sessionId: invCtx.sessionId,
        userMessage: input.message,
        recentMessages: (input.history ?? []).slice(-4).map((m) => ({ role: m.role, content: m.content })),
      },
    })
    return mapOutcomeToAgentOutput(outcome, mergedState)
  }

  // 7.c) Si updateOrder o moveOrderToStage no-cas falló, fire addOrderNote audit + decidir si escalar
  if (invOutcome.updateOrderFailed || invOutcome.cancelarFailed) {
    const note = invOutcome.updateOrderFailed
      ? `updateOrder failed: ${invOutcome.updateOrderFailed.code}`
      : `moveOrderToStage(cancelar) failed: ${invOutcome.cancelarFailed?.code}`
    // re-emit invocations con extras → addOrderNote fire-and-forget audit (W-04)
    await executeInvocations({
      ctx: invCtx,
      state: mergedState,
      salesAccion: null,
      stateChanges: {},
      input,
      extra: { mutationFailedNote: note },
    })
  }

  // 8) D-07/D-19/D-20: si la action es create_order, EJECUTAR la mutación INLINE antes del template
  if (CREATE_ORDER_ACTIONS.has(salesResult.accion) && !hasAction(mergedState, 'crear_orden')) {
    const tools = createCrmMutationTools({
      workspaceId: input.workspaceId ?? SOMNIO_WORKSPACE_ID,
      invoker: SOMNIO_V4_AGENT_ID,
    })
    const idempotencyKey = `somnio-v4-createOrder-${input.sessionId}-happy`  // Pitfall 5
    const orderInput = buildCreateOrderInput(mergedState, input)

    const result = await tools.createOrder.execute({ ...orderInput, idempotencyKey })

    if (result.status !== 'success') {
      // D-20: NO enviar pendiente_*. Escalar a sub-loop reason='crm_mutation' o handoff humano.
      getCollector()?.recordEvent('pipeline_decision', 'createOrder_failed_happy', {
        agent: SOMNIO_V4_AGENT_ID,
        sessionId: input.sessionId,
        errorCode: 'error' in result ? (result.error?.code ?? 'unknown') : 'unknown',
      })
      const outcome = await runSubLoop({
        reason: 'crm_mutation',
        ctx: {
          workspaceId: input.workspaceId ?? SOMNIO_WORKSPACE_ID,
          conversationId: input.conversationId,
          sessionId: input.sessionId,
          userMessage: input.message,
          recentMessages: (input.history ?? []).slice(-4).map((m) => ({ role: m.role, content: m.content })),
        },
      })
      return mapOutcomeToAgentOutput(outcome, mergedState)
    }

    mergedState.accionesEjecutadas = [
      ...mergedState.accionesEjecutadas,
      { tipo: 'crear_orden', timestamp: new Date().toISOString(), result: { orderId: (result as any).data?.id ?? null } } as AccionRegistrada,
    ]
  }

  // 9) Response track (templates)
  const responseTrack = resolveResponseTrack({
    state: mergedState,
    salesResult,
    gates,
    workspaceId: input.workspaceId ?? SOMNIO_WORKSPACE_ID,
  })

  // 10) Output
  return {
    response: responseTrack,
    stateChanges: changes,
    nextState: serializeState(mergedState),
    accionesEjecutadas: mergedState.accionesEjecutadas,
    timerSignal: salesResult.timerSignal,
    requiresHuman: false,
  }
}

async function processSystemEvent(input: V4AgentInput, event: { type: 'timer_expired'; level: number }): Promise<V4AgentOutput> {
  // Clone v3 timer-path; reemplazar order creation deferred por crm-mutation-tools INLINE
  // (mismo patrón Pitfall 5 con tag 'timer_L{N}').
  const state = deserializeState(input.session?.datos_capturados ?? {})
  const phase = derivePhase(state.accionesEjecutadas)
  const gates = computeGates(state)
  const eventKey = systemEventToKey(event)
  const transition = resolveTransition(phase, eventKey, state, gates)
  if (!transition) {
    return { response: null, stateChanges: {}, nextState: serializeState(state), accionesEjecutadas: state.accionesEjecutadas, timerSignal: undefined, requiresHuman: false }
  }
  if (CREATE_ORDER_ACTIONS.has(transition.action)) {
    const tools = createCrmMutationTools({
      workspaceId: input.workspaceId ?? SOMNIO_WORKSPACE_ID,
      invoker: SOMNIO_V4_AGENT_ID,
    })
    const idempotencyKey = `somnio-v4-createOrder-${input.sessionId}-timer_L${event.level}`
    const result = await tools.createOrder.execute({
      ...buildCreateOrderInput(state, input),
      idempotencyKey,
    })
    if (result.status !== 'success') {
      getCollector()?.recordEvent('pipeline_decision', 'createOrder_failed_timer', {
        agent: SOMNIO_V4_AGENT_ID,
        sessionId: input.sessionId,
        timerLevel: event.level,
        errorCode: 'error' in result ? (result.error?.code ?? 'unknown') : 'unknown',
      })
      return mapErrorOutputForTimer(state)
    }
    state.accionesEjecutadas = [
      ...state.accionesEjecutadas,
      { tipo: 'crear_orden', timestamp: new Date().toISOString(), result: { orderId: (result as any).data?.id ?? null }, source: `timer_L${event.level}` } as AccionRegistrada,
    ]
  }
  const responseTrack = resolveResponseTrack({ state, salesResult: { accion: transition.action, timerSignal: transition.output.timerSignal, reason: transition.output.reason }, gates, workspaceId: input.workspaceId ?? SOMNIO_WORKSPACE_ID })
  return { response: responseTrack, stateChanges: {}, nextState: serializeState(state), accionesEjecutadas: state.accionesEjecutadas, timerSignal: transition.output.timerSignal, requiresHuman: false }
}

// =====================
// Helpers
// =====================

function buildCreateOrderInput(state: AgentState, input: V4AgentInput) {
  return {
    contactPhone: state.datosCliente.telefono ?? input.contactPhone,
    contactName: state.datosCliente.nombre,
    items: buildItemsFromPack(state.datosCliente.pack),
    shippingAddress: state.datosCliente.direccion,
    shippingCity: state.datosCliente.ciudad,
    shippingDepartment: state.datosCliente.departamento,
  }
}

function buildItemsFromPack(pack: string | undefined) {
  // Mapeo pack → items. Mismo patrón que v3 — el executor copia/adapta la lógica concreta de v3.
  return []  // placeholder — el executor debe completar con la misma lógica de v3
}

/**
 * D-60: cuando outcome=no_match, V4AgentOutput.requiresHuman=true.
 */
function mapOutcomeToAgentOutput(outcome: LoopOutcome, state: AgentState): V4AgentOutput {
  if (outcome.status === 'no_match') {
    return {
      response: { templates: [{ intent: outcome.responseTemplate }], freeText: null },
      stateChanges: {},
      nextState: serializeState(state),
      accionesEjecutadas: state.accionesEjecutadas,
      timerSignal: undefined,
      requiresHuman: true,                       // D-60: flag explícito
    }
  }
  if (outcome.status === 'canonical') {
    return {
      response: { templates: [], freeText: outcome.canonicalText },
      stateChanges: {},
      nextState: serializeState(state),
      accionesEjecutadas: state.accionesEjecutadas,
      timerSignal: undefined,
      requiresHuman: false,
    }
  }
  // template
  return {
    response: { templates: [{ intent: outcome.responseTemplate, extraContext: outcome.extraContext }], freeText: null },
    stateChanges: {},
    nextState: serializeState(state),
    accionesEjecutadas: state.accionesEjecutadas,
    timerSignal: undefined,
    requiresHuman: false,
  }
}

function mapErrorOutputForTimer(state: AgentState): V4AgentOutput {
  return {
    response: { templates: [{ intent: 'handoff_humano' }], freeText: null },
    stateChanges: {},
    nextState: serializeState(state),
    accionesEjecutadas: state.accionesEjecutadas,
    timerSignal: undefined,
    requiresHuman: true,                          // D-60 también en timer error
  }
}
```

**NOTAS IMPORTANTES PARA EL EXECUTOR:**
- W-04: Plan 07 wirea las 5 mutations D-19 inline. Sub-loop sigue siendo path alternativo (no único).
- D-60: `mapOutcomeToAgentOutput` retorna `requiresHuman=true` en branch `no_match` y en `mapErrorOutputForTimer` (handoff humano).
- W-08: Plan 09 hookeará `captureUnknownCase` JUSTO DESPUÉS de cada `await runSubLoop({...})` cuando `outcome.status === 'no_match'` — patron hoisted, NO embedded en `mapOutcomeToAgentOutput`.
- El shape EXACTO de `V4AgentOutput.response` debe coincidir con lo que ya espera v3 — clonar tipos correctamente.
- La función `buildItemsFromPack` debe replicar la lógica de v3 — el executor lee v3 sin importar (D-24).
- Anti-pattern: NO usar `createProductionAdapters({ agentId: 'somnio-sales-v3' })` — D-07 ordena `crm-mutation-tools` directo.

Ejecutar `pnpm typecheck` al terminar.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/somnio-v4-agent.ts && grep -q "export async function processMessage" src/lib/agents/somnio-v4/somnio-v4-agent.ts && grep -q "createCrmMutationTools" src/lib/agents/somnio-v4/somnio-v4-agent.ts && grep -q "invoker: SOMNIO_V4_AGENT_ID" src/lib/agents/somnio-v4/somnio-v4-agent.ts && grep -q "idempotencyKey" src/lib/agents/somnio-v4/somnio-v4-agent.ts && grep -q "somnio-v4-createOrder-" src/lib/agents/somnio-v4/somnio-v4-agent.ts && grep -q "decideSubLoopReason" src/lib/agents/somnio-v4/somnio-v4-agent.ts && grep -q "runSubLoop" src/lib/agents/somnio-v4/somnio-v4-agent.ts && grep -q "executeInvocations" src/lib/agents/somnio-v4/somnio-v4-agent.ts && grep -q "requiresHuman: true" src/lib/agents/somnio-v4/somnio-v4-agent.ts && grep -q "cas_reject" src/lib/agents/somnio-v4/somnio-v4-agent.ts && [ "$(grep -rE \"from '@/lib/agents/somnio-v3\" src/lib/agents/somnio-v4/somnio-v4-agent.ts | wc -l)" = "0" ] && [ "$(grep -E 'createProductionAdapters.*somnio-sales-v3' src/lib/agents/somnio-v4/somnio-v4-agent.ts | wc -l)" = "0" ]</automated>
  </verify>
  <acceptance_criteria>
    - exports `processMessage`
    - Usa `createCrmMutationTools` directo (D-07)
    - `invoker: SOMNIO_V4_AGENT_ID` literal
    - idempotencyKey con prefijo `somnio-v4-createOrder-` y tag distintivo (Pitfall 5)
    - Llama `decideSubLoopReason` y `runSubLoop`
    - Llama `executeInvocations` (W-04 fix)
    - cas_reject branch presente (escalación tras moveOrderToStage)
    - `requiresHuman: true` en `no_match` y timer error (D-60)
    - Cero imports somnio-v3
    - Cero referencias `createProductionAdapters({ agentId: 'somnio-sales-v3' })`
    - createOrder failure NO emite template post-success (D-20)
  </acceptance_criteria>
  <done>Orquestador completo con happy + timer paths + 5 mutations D-19 wired (W-04).</done>
</task>

<task type="auto">
  <name>Task 5: Actualizar index.ts para re-exportar processMessage</name>
  <files>src/lib/agents/somnio-v4/index.ts</files>
  <read_first>
    - src/lib/agents/somnio-v4/index.ts (versión Plan 06)
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts (acabado de crear)
  </read_first>
  <action>
Agregar al `index.ts` la línea de re-export de `processMessage` (que Plan 06 omitió a propósito):

```typescript
import { agentRegistry } from '../registry'
import { somnioV4Config } from './config'

agentRegistry.register(somnioV4Config)

export { SOMNIO_V4_AGENT_ID, SOMNIO_WORKSPACE_ID } from './config'
export { processMessage } from './somnio-v4-agent'  // <— NEW (Plan 07)
export type { V4AgentInput, V4AgentOutput } from './types'
```
  </action>
  <verify>
    <automated>grep -q "export { processMessage } from './somnio-v4-agent'" src/lib/agents/somnio-v4/index.ts && grep -q "agentRegistry.register(somnioV4Config)" src/lib/agents/somnio-v4/index.ts</automated>
  </verify>
  <acceptance_criteria>
    - Línea `export { processMessage } from './somnio-v4-agent'` presente
    - register sigue siendo el side-effect de import
  </acceptance_criteria>
  <done>API pública del módulo completa.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 6: Tests de escalation</name>
  <files>src/lib/agents/somnio-v4/__tests__/escalation.test.ts</files>
  <read_first>
    - src/lib/agents/somnio-v4/escalation.ts
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-02 — los 4 triggers)
  </read_first>
  <behavior>
    - Test 1: confidence=0.8, threshold=0.7, intent='precio', isCrmMutation=false, casReject=false → returns null (happy path)
    - Test 2: confidence=0.5, threshold=0.7 → returns 'low_confidence'
    - Test 3: intent='razonamiento_libre' con confidence=0.95 → returns 'razonamiento_libre' (intent gana sobre confidence alto)
    - Test 4: intent='otro' con confidence=0.95 → returns 'razonamiento_libre' (D-69 sumidero)
    - Test 5: isCrmMutation=true, confidence=0.95 → returns 'crm_mutation' (gana sobre confidence)
    - Test 6: casReject=true (con todos los demás flags) → returns 'cas_reject' (top priority)
  </behavior>
  <action>
Crear vitest:

```typescript
import { describe, it, expect } from 'vitest'
import { decideSubLoopReason } from '../escalation'

describe('decideSubLoopReason', () => {
  const base = { confidence: 0.8, threshold: 0.7, intent: 'precio', isCrmMutation: false, casReject: false }

  it('returns null on happy path', () => {
    expect(decideSubLoopReason(base)).toBeNull()
  })
  it('returns low_confidence when below threshold', () => {
    expect(decideSubLoopReason({ ...base, confidence: 0.5 })).toBe('low_confidence')
  })
  it('returns razonamiento_libre when intent is razonamiento_libre', () => {
    expect(decideSubLoopReason({ ...base, intent: 'razonamiento_libre' })).toBe('razonamiento_libre')
  })
  it('returns razonamiento_libre when intent is otro (D-69)', () => {
    expect(decideSubLoopReason({ ...base, intent: 'otro' })).toBe('razonamiento_libre')
  })
  it('returns crm_mutation when isCrmMutation flag is true', () => {
    expect(decideSubLoopReason({ ...base, isCrmMutation: true })).toBe('crm_mutation')
  })
  it('returns cas_reject as top priority', () => {
    expect(decideSubLoopReason({ ...base, casReject: true, isCrmMutation: true, intent: 'razonamiento_libre', confidence: 0.1 })).toBe('cas_reject')
  })
})
```

Ejecutar:
```bash
pnpm vitest run src/lib/agents/somnio-v4/__tests__/escalation.test.ts
```
  </action>
  <verify>
    <automated>pnpm vitest run src/lib/agents/somnio-v4/__tests__/escalation.test.ts --reporter=basic 2>&1 | grep -E "passed"</automated>
  </verify>
  <acceptance_criteria>
    - 6 tests pasan
    - cas_reject prioridad confirmada
  </acceptance_criteria>
  <done>Escalation logic testeada.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 7: Tests de invocations builder (W-04 fix)</name>
  <files>src/lib/agents/somnio-v4/__tests__/invocations.test.ts</files>
  <read_first>
    - src/lib/agents/somnio-v4/invocations.ts
    - .claude/skills/crm-mutation-tools.md
  </read_first>
  <behavior>
    - Test 1: state con shipping fields cambiados + activeOrderId → mock tools.updateOrder.execute called once con shipping payload
    - Test 2: salesAccion='cancelar' + activeOrderId → mock tools.moveOrderToStage.execute called once con CANCELED stage
    - Test 3: stateChanges.email='x@y.com' + contactPhone → mock tools.updateContact.execute called once (fire-and-forget)
    - Test 4: extra.handoffReason='subloop_no_match' → mock tools.addOrderNote.execute called once con `[v4 handoff]` prefix
    - Test 5: moveOrderToStage retorna `error.code='stage_changed_concurrently'` → outcome.cancelarFailed.cas === true
    - Test 6: sin activeOrderId → ningún update*/move* se llama (defensive guard)
  </behavior>
  <action>
Crear vitest con `vi.mock` de `@/lib/agents/shared/crm-mutation-tools`. Verificar `expect(mockUpdateOrder).toHaveBeenCalledWith(...)` por cada caso.

Ejecutar:
```bash
pnpm vitest run src/lib/agents/somnio-v4/__tests__/invocations.test.ts
```
  </action>
  <verify>
    <automated>pnpm vitest run src/lib/agents/somnio-v4/__tests__/invocations.test.ts --reporter=basic 2>&1 | grep -E "passed"</automated>
  </verify>
  <acceptance_criteria>
    - 6 tests pasan
    - W-04 cobertura: cada una de las 4 mutations no-createOrder tiene su test
  </acceptance_criteria>
  <done>Invocations builder testeado.</done>
</task>

<task type="auto">
  <name>Task 8: Commit + push</name>
  <files>(todos los del Plan 07)</files>
  <read_first>
    - CLAUDE.md (Reglas 1, 4)
  </read_first>
  <action>
```bash
git add src/lib/agents/somnio-v4/
git commit -m "feat(somnio-v4): plan-07 — orquestador somnio-v4-agent + escalation + threshold + invocations (W-04)

- threshold.ts: lookup platform_config.somnio_v4_low_confidence_threshold con cache 60s + fallback 0.70 (D-03/D-11)
- escalation.ts: decideSubLoopReason pure function — 4 reasons D-02 con prioridad cas_reject > crm_mutation > razonamiento_libre > low_confidence
- invocations.ts (W-04 fix): executeInvocations dispara las 4 mutations no-createOrder INLINE
  - come-back: updateOrder (shipping), moveOrderToStage (cancelar)
  - execute fire-and-forget: updateContact (email/cedula), addOrderNote (handoff/audit)
  - Idempotency tags: shipping/cancelar/email+cedula/handoff/mutation_failed (Pitfall 5)
  - CAS reject (stage_changed_concurrently) propagado al orquestador para escalar a sub-loop
- somnio-v4-agent.ts: processMessage + processSystemEvent
  - Happy path determinista (state machine)
  - Sub-loop escalation antes de resolveTransition (low_confidence/razonamiento_libre)
  - executeInvocations llamado tras resolveTransition (W-04)
  - cas_reject branch escala a sub-loop si moveOrderToStage retorna stage_changed_concurrently
  - createOrder INLINE vía crm-mutation-tools (D-07/D-19/D-20) — NO deferred
  - createOrder failure escala a sub-loop crm_mutation o handoff (D-20 fix vs v3)
  - D-60: mapOutcomeToAgentOutput retorna requiresHuman=true en no_match (handoff explícito)
  - idempotencyKey con tags 'happy' / 'timer_L3' / 'timer_L4' (Pitfall 5)
- index.ts: re-export processMessage
- 12 unit tests pasando (6 escalation + 6 invocations)

D-24 verificado: cero imports desde @/lib/agents/somnio-v3/*
D-07 verificado: cero llamadas createProductionAdapters({agentId:'somnio-sales-v3'})
W-04 fix: las 5 mutations D-19 wired inline (3 come-back + 2 execute)
D-60 fix: requiresHuman=true en outcome no_match

Standalone: somnio-sales-v4
Decisions: D-01, D-02, D-03, D-07, D-09, D-11, D-13, D-15, D-16, D-17, D-18, D-19, D-20, D-22, D-24, D-35, D-57, D-58, D-60, D-65, D-68

Co-Authored-By: Claude <noreply@anthropic.com>"
git push origin main
```
  </action>
  <verify>
    <automated>git log -1 --pretty=%s | grep -q "feat(somnio-v4): plan-07"</automated>
  </verify>
  <acceptance_criteria>
    - Commit + push completados
    - Vercel deploy ok
  </acceptance_criteria>
  <done>Wave 3 (orquestador) cierra; v4 con 5 mutations D-19 wired inline.</done>
</task>

</tasks>

<verification>
- processMessage es invocable
- 5 mutations D-19 wired inline (W-04 fix verificable via grep en somnio-v4-agent.ts e invocations.ts)
- createOrder no se difiere — se ejecuta inline
- requiresHuman=true en outcome no_match (D-60 fix)
- threshold leído por turn (con cache)
- Sub-loop se invoca con triggers correctos (incluyendo cas_reject post-mutation)
- D-24 + D-07 verificados via grep
</verification>

<success_criteria>
- Plan 08 (timers) puede usar `processMessage` (vía Inngest function que importa el módulo v4)
- Plan 09 (observation loop) puede hookear `captureUnknownCase` post-runSubLoop con outcome=no_match
- Plan 12 (smoke /sandbox) puede invocar el agente con un input mock y obtener output válido
</success_criteria>

<output>
Crear `.planning/standalone/somnio-sales-v4/07-SUMMARY.md` con:
- Tests output (12/12 passed)
- Verificación grep W-04 (las 5 mutations en código)
- Verificación grep D-60 (`requiresHuman: true` en branch no_match)
- Verificación D-07/D-24
- Hash commit
</output>

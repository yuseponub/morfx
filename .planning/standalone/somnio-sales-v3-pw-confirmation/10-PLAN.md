---
phase: somnio-sales-v3-pw-confirmation
plan: 10
type: execute
wave: 4
depends_on: [03, 04]
files_modified:
  - src/lib/agents/engine-adapters/production/crm-writer-adapter.ts
autonomous: true

requirements: []

must_haves:
  truths:
    - "src/lib/agents/engine-adapters/production/crm-writer-adapter.ts exporta funciones helper que invocan `proposeAction + confirmAction` directo (importadas de `@/lib/agents/crm-writer/two-step`) — patron `processWriterMessage` NO existe; importacion in-process directo es la unica opcion (ver RESEARCH §C.2 'Otra opcion mas limpia')"
    - "Adapter exporta 3 operaciones acotadas a las que PW V1 necesita: `updateOrderShipping(workspaceId, orderId, {shippingAddress, shippingCity, shippingDepartment})`, `moveOrderToConfirmado(workspaceId, orderId)`, `moveOrderToFaltaConfirmar(workspaceId, orderId)`"
    - "Cada operacion: (1) llama proposeAction(...) → obtiene action_id; (2) llama confirmAction(action_id) → ejecuta domain via two-step; (3) retorna `{status: 'executed' | 'failed', error?}` al caller"
    - "Manejo del error contract `stage_changed_concurrently` (Standalone crm-stage-integrity D-06): cuando confirmAction retorna `{status:'failed', error:{code:'stage_changed_concurrently'}}`, el adapter lo PROPAGA verbatim (NO reintenta — agent loop decide handoff per agent-scope.md)"
    - "Adapter usa `PW_CONFIRMATION_STAGES.CONFIRMADO` y `.FALTA_CONFIRMAR` de constants.ts (Plan 04) — NO hardcoded UUIDs en el adapter"
    - "Emite observability events `pipeline_decision:crm_writer_propose_emitted` + `pipeline_decision:crm_writer_confirm_emitted` (RESEARCH §A.5)"
    - "El adapter NO usa createAdminClient directo — solo importa crm-writer two-step (Regla 3, agent-scope.md validacion)"
    - "npm run typecheck no introduce errors nuevos"
  artifacts:
    - path: "src/lib/agents/engine-adapters/production/crm-writer-adapter.ts"
      provides: "Adapter wraps proposeAction+confirmAction with scope acotado a 3 operaciones que PW V1 necesita"
      contains: "updateOrderShipping"
      min_lines: 150
  key_links:
    - from: "src/lib/agents/engine-adapters/production/crm-writer-adapter.ts"
      to: "src/lib/agents/crm-writer/two-step.ts (proposeAction + confirmAction)"
      via: "in-process direct import (ver agent-scope.md Consumidor downstream)"
      pattern: "from '@/lib/agents/crm-writer/two-step'"
    - from: "src/lib/agents/engine-adapters/production/crm-writer-adapter.ts"
      to: "src/lib/agents/somnio-pw-confirmation/constants.ts (PW_CONFIRMATION_STAGES)"
      via: "stage UUIDs sourced from constants (NO hardcoded)"
      pattern: "PW_CONFIRMATION_STAGES"
---

<objective>
Wave 4 — Crear el adapter `crm-writer-adapter.ts` que envuelve `proposeAction + confirmAction` para las 3 operaciones que PW V1 necesita (D-08, D-10, D-12, D-14).

Purpose: D-08 lockea: TODA mutacion via crm-writer two-step (Regla 3). RESEARCH §C.2 confirma que NO existe `processWriterMessage` — el path correcto es importar `proposeAction + confirmAction` directos de `@/lib/agents/crm-writer/two-step`. El adapter las llama de forma sincrona (mismo turno: propose → confirm) porque el agente esta en backend (no es UI human-in-loop).

Manejo del error contract `stage_changed_concurrently` (Standalone crm-stage-integrity D-06 + agent-scope.md): el adapter NO reintenta — propaga verbatim al agent loop, que decide handoff humano (D-21 trigger c).

Output: 1 archivo `crm-writer-adapter.ts` (~150-200 lineas).

Dependencias: Plans 03, 04 (constants — PW_CONFIRMATION_STAGES).

**Patron arquitectonico**: V1 NO usa AI SDK tools. El adapter es invocado directamente por engine.ts (Plan 11) tras recibir `accion='confirmar_compra'` o `'actualizar_direccion'` o `'mover_a_falta_confirmar'` del state machine.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md §D-08 (mutaciones via crm-writer), §D-10 (mover CONFIRMADO), §D-12 (actualizar direccion), §D-14 (mover FALTA_CONFIRMAR), §D-13 (V1 NO editar items), §D-21 (handoff stub)
@.planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §C.1 (tools writer disponibles), §C.2 (NO processWriterMessage, importar two-step directo), §J Pitfall 5 (stage_changed_concurrently)
@.planning/standalone/crm-stage-integrity (Standalone D-06 — stage_changed_concurrently error contract)
@.claude/rules/agent-scope.md §CRM Writer Bot (referencia del scope writer)
@src/lib/agents/crm-writer/two-step.ts LINEAS COMPLETAS (proposeAction + confirmAction signatures)
@src/lib/agents/crm-writer/tools/orders.ts LINEAS COMPLETAS (updateOrder + moveOrderToStage + archiveOrder — ver shape de input)
@src/lib/agents/somnio-pw-confirmation/constants.ts (Plan 04 — PW_CONFIRMATION_STAGES)
@src/lib/agents/engine-adapters/production/ (verificar otros adapters existentes para patron de directorio)

<interfaces>
<!-- Output del adapter (caller consume) -->
type AdapterResult =
  | { status: 'executed'; actionId: string }
  | { status: 'failed'; actionId?: string; error: { code: string; message: string } }

<!-- API a exponer -->
async function updateOrderShipping(
  workspaceId: string,
  orderId: string,
  shipping: { shippingAddress: string; shippingCity: string; shippingDepartment: string },
  context: { agentId: 'somnio-sales-v3-pw-confirmation'; conversationId?: string }
): Promise<AdapterResult>

async function moveOrderToConfirmado(
  workspaceId: string,
  orderId: string,
  context: { agentId: 'somnio-sales-v3-pw-confirmation'; conversationId?: string }
): Promise<AdapterResult>

async function moveOrderToFaltaConfirmar(
  workspaceId: string,
  orderId: string,
  context: { agentId: 'somnio-sales-v3-pw-confirmation'; conversationId?: string }
): Promise<AdapterResult>

<!-- proposeAction + confirmAction signatures (existing — verify exact shape) -->
import { proposeAction, confirmAction } from '@/lib/agents/crm-writer/two-step'
// proposeAction({ workspaceId, agentId, tool, input, preview, conversationId? }) → { status, action_id, ... }
// confirmAction(actionId) → { status: 'executed' | 'expired' | 'already_executed' | 'failed', error?: {code, message} }
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Crear `crm-writer-adapter.ts` con 3 operaciones acotadas</name>
  <read_first>
    - src/lib/agents/crm-writer/two-step.ts LINEAS COMPLETAS (proposeAction + confirmAction signatures + return shapes)
    - src/lib/agents/crm-writer/tools/orders.ts lineas 100-220 (updateOrder Zod schema + moveOrderToStage Zod schema)
    - src/lib/agents/somnio-pw-confirmation/constants.ts (PW_CONFIRMATION_STAGES)
    - src/lib/agents/engine-adapters/production/ ls (verificar adapters existentes — orders.ts probablemente; clonar shape directorio)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §C.2 (recommendation pattern)
    - .claude/rules/agent-scope.md §CRM Writer Bot (error contract stage_changed_concurrently)
  </read_first>
  <action>
    Crear `src/lib/agents/engine-adapters/production/crm-writer-adapter.ts` con:

    1. **Imports:**
       - `proposeAction, confirmAction` de `@/lib/agents/crm-writer/two-step`
       - `PW_CONFIRMATION_STAGES, SOMNIO_PW_CONFIRMATION_AGENT_ID` de `@/lib/agents/somnio-pw-confirmation/constants`
       - `createModuleLogger` de `@/lib/audit/logger`
       - `getCollector` (opcional para observability) de `@/lib/observability` o equivalente
       - Type `AdapterResult` definido inline.

    2. **Helper privado** `executeProposeConfirm({workspaceId, agentId, tool, input, preview, conversationId})`:
       - Llama `proposeAction(...)` → si `status !== 'proposed'`, retorna `{status:'failed', error:{code: 'propose_failed', message: ...}}`.
       - Llama `confirmAction(action_id)` → si `status === 'executed'`, retorna `{status:'executed', actionId: action_id}`.
       - Si confirmAction retorna `{status:'failed', error}`, propaga verbatim el `error` (especial cuidado con `error.code === 'stage_changed_concurrently'` — debe pasar verbatim per agent-scope.md).
       - Si retorna `'expired'` o `'already_executed'`, log + retornar `{status:'failed', error:{code: 'expired_or_dup', ...}}`.
       - Emit observability events `pipeline_decision:crm_writer_propose_emitted` (post propose) + `pipeline_decision:crm_writer_confirm_emitted` (post confirm) con metrics (tool, action_id, status).

    3. **`updateOrderShipping(workspaceId, orderId, shipping, context)`**:
       - Llama `executeProposeConfirm` con:
         - `agentId: SOMNIO_PW_CONFIRMATION_AGENT_ID`
         - `tool: 'updateOrder'`
         - `input: { orderId, shippingAddress: shipping.shippingAddress, shippingCity: shipping.shippingCity, shippingDepartment: shipping.shippingDepartment }`
         - `preview: \`Actualizar shipping address de pedido ${orderId} a: ${shipping.shippingAddress}, ${shipping.shippingCity}, ${shipping.shippingDepartment}\``
         - `conversationId: context.conversationId`
       - Retorna AdapterResult.

    4. **`moveOrderToConfirmado(workspaceId, orderId, context)`**:
       - Llama `executeProposeConfirm` con:
         - `tool: 'moveOrderToStage'`
         - `input: { orderId, stageId: PW_CONFIRMATION_STAGES.CONFIRMADO }`
         - `preview: \`Mover pedido ${orderId} a stage CONFIRMADO\``
       - Retorna AdapterResult. **Si retorna error con code 'stage_changed_concurrently', propagar verbatim** (no convertir).

    5. **`moveOrderToFaltaConfirmar(workspaceId, orderId, context)`**:
       - Igual que `moveOrderToConfirmado` pero con `stageId: PW_CONFIRMATION_STAGES.FALTA_CONFIRMAR` y preview adaptado.

    6. **NO incluir** `editOrderItems` o cualquier funcion para D-13 (deferred a V1.1 — el agente escala a handoff).

    Commit: `feat(somnio-sales-v3-pw-confirmation): add crm-writer-adapter (in-process propose+confirm wrapper for 3 operations: updateOrderShipping, moveOrderToConfirmado, moveOrderToFaltaConfirmar — D-08, D-10, D-12, D-14, error contract stage_changed_concurrently propagated verbatim)`. NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/engine-adapters/production/crm-writer-adapter.ts</automated>
    <automated>grep -q "from '@/lib/agents/crm-writer/two-step'" src/lib/agents/engine-adapters/production/crm-writer-adapter.ts</automated>
    <automated>grep -q "from '@/lib/agents/somnio-pw-confirmation/constants'" src/lib/agents/engine-adapters/production/crm-writer-adapter.ts</automated>
    <automated>grep -q "export async function updateOrderShipping" src/lib/agents/engine-adapters/production/crm-writer-adapter.ts</automated>
    <automated>grep -q "export async function moveOrderToConfirmado" src/lib/agents/engine-adapters/production/crm-writer-adapter.ts</automated>
    <automated>grep -q "export async function moveOrderToFaltaConfirmar" src/lib/agents/engine-adapters/production/crm-writer-adapter.ts</automated>
    <automated>grep -q "PW_CONFIRMATION_STAGES.CONFIRMADO" src/lib/agents/engine-adapters/production/crm-writer-adapter.ts</automated>
    <automated>grep -q "PW_CONFIRMATION_STAGES.FALTA_CONFIRMAR" src/lib/agents/engine-adapters/production/crm-writer-adapter.ts</automated>
    <automated>grep -q "stage_changed_concurrently" src/lib/agents/engine-adapters/production/crm-writer-adapter.ts</automated>
    <automated>grep -q "proposeAction" src/lib/agents/engine-adapters/production/crm-writer-adapter.ts</automated>
    <automated>grep -q "confirmAction" src/lib/agents/engine-adapters/production/crm-writer-adapter.ts</automated>
    <automated>! grep -q "createAdminClient" src/lib/agents/engine-adapters/production/crm-writer-adapter.ts</automated>
    <automated>! grep -q "editOrderItems\\|editItems" src/lib/agents/engine-adapters/production/crm-writer-adapter.ts</automated>
    <automated>npm run typecheck 2>&1 | grep -E "src/lib/agents/engine-adapters/production/crm-writer-adapter" | grep -q "error TS" && exit 1 || exit 0</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(somnio-sales-v3-pw-confirmation): add crm-writer-adapter"</automated>
  </verify>
  <acceptance_criteria>
    - 3 funciones exportadas (updateOrderShipping, moveOrderToConfirmado, moveOrderToFaltaConfirmar).
    - Helper executeProposeConfirm centraliza el patron 2-step.
    - PW_CONFIRMATION_STAGES importado de constants (NO hardcoded).
    - stage_changed_concurrently propagado verbatim (no convertido).
    - NO createAdminClient (Regla 3).
    - NO editOrderItems (D-13 deferred).
    - typecheck OK.
    - Commit atomico.
  </acceptance_criteria>
  <done>
    - Adapter listo para Plan 11 (engine) que lo invoca tras recibir accion del state machine.
    - Plan 12 (tests) puede mockear proposeAction + confirmAction.
  </done>
</task>

</tasks>

<verification>
- 1 archivo creado.
- 3 operaciones acotadas a las que PW V1 necesita.
- Error contract stage_changed_concurrently honrado.
- typecheck OK.
- 1 commit atomico, NO pusheado.
</verification>

<success_criteria>
- Plan 11 (engine) puede llamar `await updateOrderShipping(workspaceId, orderId, {shippingAddress, shippingCity, shippingDepartment}, {agentId, conversationId})` y obtener AdapterResult.
- Si confirmAction retorna stage_changed_concurrently, el engine recibe el error y dispara handoff humano (D-21 trigger c).
- Plan 12 puede testear (mock two-step).
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-sales-v3-pw-confirmation/10-SUMMARY.md` documenting:
- Commit hash.
- LoC.
- Confirmacion: 3 operaciones implementadas.
- Confirmacion: error contract stage_changed_concurrently propagated verbatim.
- typecheck output.
</output>
</content>
</invoke>
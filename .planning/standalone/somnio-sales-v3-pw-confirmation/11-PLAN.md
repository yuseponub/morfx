---
phase: somnio-sales-v3-pw-confirmation
plan: 11
type: execute
wave: 5
depends_on: [03, 04, 05, 06, 07, 08, 09, 10]
files_modified:
  - src/lib/agents/somnio-pw-confirmation/engine-pw-confirmation.ts
  - src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts
  - src/lib/agents/somnio-pw-confirmation/index.ts
  - src/lib/agents/engine/v3-production-runner.ts
  - src/lib/agents/production/webhook-processor.ts
autonomous: true

requirements: []

must_haves:
  truths:
    - "src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts exporta `processMessage(input: V3AgentInput): Promise<V3AgentOutput>` — entry point que orquesta TODO el flow del agente"
    - "processMessage flow: deserializeState(session) → analyzeMessage(comprehension) → checkGuards → resolveSalesTrack → invocar crm-writer-adapter si accion requiere mutacion (confirmar_compra → moveOrderToConfirmado, actualizar_direccion → updateOrderShipping, mover_a_falta_confirmar → moveOrderToFaltaConfirmar) → resolveResponseTrack → serializeState → return V3AgentOutput"
    - "Si crm-writer-adapter retorna error con code='stage_changed_concurrently', emit observability event + override accion='handoff' + emit template cancelado_handoff (D-21 trigger c)"
    - "Si crm_context_status === 'error' al iniciar, emit template error_carga_pedido + degradar (NO bloquear)"
    - "engine-pw-confirmation.ts es opcional (wrapper para sandbox usage — clonar de engine-recompra.ts si util, NO si el agente es 100% production-only via Inngest)"
    - "src/lib/agents/somnio-pw-confirmation/index.ts ahora exporta `processMessage` (el stub de Plan 03 NO lo exportaba — agregar la export)"
    - "src/lib/agents/engine/v3-production-runner.ts agrega branch `else if (this.config.agentModule === 'somnio-pw-confirmation') { ... await import + processMessage }` — clonar el patron exacto de los branches 'godentist' y 'somnio-recompra'"
    - "src/lib/agents/production/webhook-processor.ts agrega branch nueva: cuando `routerDecidedAgentId === 'somnio-sales-v3-pw-confirmation'`, dispatcha event 'pw-confirmation/preload-and-invoke' via inngest.send (await — NUNCA fire-and-forget per MEMORY) + responde 200 inmediato. NO invoca runner inline (a diferencia de recompra branch que SI invoca inline)."
    - "El branch nuevo del webhook-processor NO crea sesion via SessionManager.createSession — la creacion de sesion la hace el step 2 del Inngest function via V3ProductionRunner (mismo flow que recompra). El webhook solo dispatcha el evento."
    - "npm run typecheck no introduce errors nuevos"
  artifacts:
    - path: "src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts"
      provides: "processMessage entry point — orquesta comprehension + guards + sales-track + crm-writer + response-track"
      contains: "processMessage"
      min_lines: 250
    - path: "src/lib/agents/somnio-pw-confirmation/engine-pw-confirmation.ts"
      provides: "Wrapper opcional para sandbox usage (puede ser stub minimo)"
      contains: "engine"
      min_lines: 30
    - path: "src/lib/agents/somnio-pw-confirmation/index.ts"
      provides: "Re-export de processMessage agregada"
      contains: "processMessage"
    - path: "src/lib/agents/engine/v3-production-runner.ts"
      provides: "Branch para agentModule='somnio-pw-confirmation'"
      contains: "somnio-pw-confirmation"
    - path: "src/lib/agents/production/webhook-processor.ts"
      provides: "Branch que dispatcha evento Inngest cuando routerDecidedAgentId === 'somnio-sales-v3-pw-confirmation'"
      contains: "pw-confirmation/preload-and-invoke"
  key_links:
    - from: "src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts"
      to: "engine-adapters/production/crm-writer-adapter (Plan 10)"
      via: "post-state-machine mutation calls"
      pattern: "updateOrderShipping\\|moveOrderToConfirmado\\|moveOrderToFaltaConfirmar"
    - from: "src/lib/agents/production/webhook-processor.ts (branch nueva)"
      to: "src/inngest/functions/pw-confirmation-preload-and-invoke.ts (Plan 09)"
      via: "inngest.send({name: 'pw-confirmation/preload-and-invoke', data: {...}})"
      pattern: "pw-confirmation/preload-and-invoke"
    - from: "src/lib/agents/engine/v3-production-runner.ts (branch nueva)"
      to: "src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts"
      via: "dynamic import + processMessage call"
      pattern: "agentModule === 'somnio-pw-confirmation'"
---

<objective>
Wave 5 — Wire it all up. Crear el entry point del agente (`somnio-pw-confirmation-agent.ts` con `processMessage`) + agregar branch en V3ProductionRunner + agregar branch en webhook-processor para dispatchar evento Inngest.

Purpose: Esta es la integracion final. processMessage orquesta:
1. Deserialize state desde session.
2. Si crm_context_status='error', emit template error_carga_pedido y return early (degradacion graceful).
3. Si state.phase === 'nuevo' (NO inicializado por createInitialState aun), llamar createInitialState con el _v3:active_order del session state.
4. Comprehension → analyzeMessage(message, state, history, crmContext).
5. Guards → checkGuards(analysis, state). Si blocked, override accion=handoff.
6. Sales-track → resolveSalesTrack({phase, intent, state, analysis, lastTemplate}).
7. Si accion requiere mutacion CRM, invoca crm-writer-adapter:
   - `confirmar_compra` → `moveOrderToConfirmado(workspaceId, state.active_order.orderId, ...)`
   - `actualizar_direccion` → `updateOrderShipping(workspaceId, state.active_order.orderId, {...state.datos}, ...)`
   - `mover_a_falta_confirmar` → `moveOrderToFaltaConfirmar(workspaceId, state.active_order.orderId, ...)`
8. Si adapter retorna error con `stage_changed_concurrently`, override accion=handoff + emit template `cancelado_handoff` + emit observability event.
9. Response-track → resolveResponseTrack({salesAction, intent, state, workspaceId}) → mensajes a enviar.
10. Update state (push accion al history) + serializeState.
11. Return V3AgentOutput con messages + new state info.

Output: 5 cambios:
- 2 archivos nuevos en `src/lib/agents/somnio-pw-confirmation/` (engine-pw-confirmation.ts opcional + somnio-pw-confirmation-agent.ts CRITICAL).
- 1 edit a `index.ts` (Plan 03) para agregar export de processMessage.
- 1 edit a `v3-production-runner.ts` (agregar case branch).
- 1 edit a `webhook-processor.ts` (agregar branch dispatch).

Dependencias: Plans 03 (config + types + index), 04 (constants), 05 (analyzeMessage), 06 (state.ts + transitions.ts + guards.ts + phase.ts), 07 (response-track.ts), 08 (sales-track.ts), 09 (Inngest function exists), 10 (crm-writer-adapter).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md (todas las decisiones)
@.planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §A.6 (estructura processMessage v3 — ~467 lineas), §B.1 Opcion C (webhook flow)
@src/lib/agents/somnio-recompra/somnio-recompra-agent.ts LINEAS COMPLETAS (~572 lineas — patron de processMessage clonar)
@src/lib/agents/somnio-v3/somnio-v3-agent.ts LINEAS COMPLETAS (~467 lineas — referencia)
@src/lib/agents/somnio-recompra/engine-recompra.ts (engine wrapper opcional para sandbox)
@src/lib/agents/engine/v3-production-runner.ts lineas 100-200 (branches existentes para agentModule)
@src/lib/agents/production/webhook-processor.ts lineas 200-550 (branch recompra como referencia para nueva branch PW)
@src/lib/agents/somnio-pw-confirmation/* (todos los archivos creados en Plans 04-08)
@src/lib/agents/engine-adapters/production/crm-writer-adapter.ts (Plan 10)

<interfaces>
<!-- processMessage signature canonical -->
async function processMessage(input: V3AgentInput): Promise<V3AgentOutput>

<!-- V3AgentInput shape (from Plan 03 types.ts — expandable) -->
interface V3AgentInput {
  sessionId: string
  conversationId: string
  contactId: string
  message: string
  workspaceId: string
  history: unknown[]
  phoneNumber?: string
  messageTimestamp?: string
}

<!-- V3AgentOutput shape -->
interface V3AgentOutput {
  messages: ResponseMessage[]
  intent?: string
  newPhase?: string
  acciones?: TipoAccion[]
  templateIdsSent?: string[]
}
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Crear `somnio-pw-confirmation-agent.ts` con processMessage entry point</name>
  <read_first>
    - src/lib/agents/somnio-recompra/somnio-recompra-agent.ts LINEAS COMPLETAS (~572 lineas — patron exacto a clonar)
    - src/lib/agents/somnio-v3/somnio-v3-agent.ts LINEAS COMPLETAS (referencia)
    - Todos los archivos creados en Plans 04-10 (constants, comprehension, state, transitions, guards, phase, response-track, sales-track, crm-writer-adapter)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts` con `processMessage(input)` que implementa el flow de 11 pasos descrito en `<objective>`.

    Estructura:
    ```typescript
    /**
     * Somnio Sales v3 PW-Confirmation Agent — Entry Point
     *
     * processMessage orchestrates: state hydration → comprehension → guards →
     * sales-track → crm-writer mutations → response-track → state persist.
     *
     * Pre-condition: session.datos_capturados._v3:crm_context (and _v3:active_order)
     * have been populated by Inngest function 'pw-confirmation-preload-and-invoke'
     * step 1 (D-05 BLOQUEANTE). The agent reads them directly — no polling.
     */

    import { createModuleLogger } from '@/lib/audit/logger'
    import { getCollector } from '@/lib/observability'

    import { analyzeMessage } from './comprehension'
    import { checkGuards } from './guards'
    import { resolveSalesTrack } from './sales-track'
    import { resolveResponseTrack } from './response-track'
    import {
      createInitialState,
      mergeAnalysis,
      shippingComplete,
      extractActiveOrder,
      serializeState,
      deserializeState,
    } from './state'
    import { derivePhase } from './phase'
    import { SOMNIO_PW_CONFIRMATION_AGENT_ID, ACTION_TEMPLATE_MAP } from './constants'
    import type { V3AgentInput, V3AgentOutput, TipoAccion } from './types'
    import {
      updateOrderShipping,
      moveOrderToConfirmado,
      moveOrderToFaltaConfirmar,
    } from '@/lib/agents/engine-adapters/production/crm-writer-adapter'

    const logger = createModuleLogger('somnio-pw-confirmation-agent')

    export async function processMessage(input: V3AgentInput): Promise<V3AgentOutput> {
      const { sessionId, conversationId, contactId, message, workspaceId, history, phoneNumber, messageTimestamp } = input

      // 1. Hydrate state from session.
      const { SessionManager } = await import('@/lib/agents/session-manager')
      const sm = new SessionManager()
      const sessionState = await sm.getState(sessionId)
      const captured = sessionState.datos_capturados ?? {}

      // Read CRM context (BLOQUEANTE — populated by Inngest function step 1).
      const crmContext = (captured['_v3:crm_context'] as string) || ''
      const crmContextStatus = (captured['_v3:crm_context_status'] as string) as 'ok' | 'empty' | 'error' | 'missing' || 'missing'
      const activeOrderJson = (captured['_v3:active_order'] as string) || '{}'
      const activeOrder = extractActiveOrder(crmContext, activeOrderJson)

      // 2. Degradacion: si CRM reader fallo, emit error_carga_pedido y return.
      if (crmContextStatus === 'error') {
        getCollector()?.recordEvent('pipeline_decision', 'crm_context_missing_proceeding_blind', {
          agent: SOMNIO_PW_CONFIRMATION_AGENT_ID, sessionId, contactId,
        })
        // Emit error_carga_pedido template via response-track.
        const errResponse = await resolveResponseTrack({
          salesAction: 'noop',
          intent: 'fallback', // triggers fallback template OR we can map directly
          state: createInitialState({ activeOrder: null, contact: null, crmContextStatus: 'error' }),
          workspaceId,
        })
        return {
          messages: errResponse.messages,
          intent: 'fallback',
          newPhase: 'handoff',
        }
      }

      // 3. Initialize state (or hydrate if exists).
      let state = deserializeState(captured)
      if (state.phase === 'nuevo' || !state.active_order) {
        // First turn — initialize from CRM context.
        state = createInitialState({
          activeOrder,
          contact: null, // contact details go inside active_order from extractActiveOrder
          crmContextStatus: crmContextStatus as 'ok' | 'empty',
        })
      }

      // 4. Comprehension via Haiku.
      const analysis = await analyzeMessage({
        message,
        state,
        history: history as Array<{ role: 'user' | 'assistant'; content: string }>,
        crmContext,
      })

      // 5. Guards.
      const guardResult = checkGuards(analysis)
      if (guardResult.blocked) {
        // Override action to handoff.
        state.requires_human = true
        const hoResponse = await resolveResponseTrack({
          salesAction: 'handoff',
          intent: analysis.intent,
          state,
          workspaceId,
        })
        await sm.updateCapturedData(sessionId, serializeState({ ...state, acciones: [...state.acciones, 'handoff'] }))
        getCollector()?.recordEvent('pipeline_decision', 'handoff_triggered', {
          agent: SOMNIO_PW_CONFIRMATION_AGENT_ID, sessionId,
          reason: guardResult.reason ?? 'guard_blocked',
        })
        return { messages: hoResponse.messages, intent: analysis.intent, newPhase: 'handoff' }
      }

      // 6. Sales-track.
      const salesResult = resolveSalesTrack({
        phase: state.phase,
        intent: analysis.intent,
        state, // mutable — sales-track updates counters
        analysis,
        lastTemplate: undefined, // D-26 — state-machine is the guard, NOT template_name
      })
      let accion: TipoAccion = salesResult.accion

      // 7. Mutaciones CRM via adapter.
      let mutationError: { code: string; message: string } | null = null

      if (accion === 'confirmar_compra' && state.active_order?.orderId) {
        const result = await moveOrderToConfirmado(workspaceId, state.active_order.orderId, {
          agentId: SOMNIO_PW_CONFIRMATION_AGENT_ID,
          conversationId,
        })
        if (result.status === 'failed') mutationError = result.error
      } else if (accion === 'actualizar_direccion' && state.active_order?.orderId) {
        if (state.datos.direccion && state.datos.ciudad && state.datos.departamento) {
          const result = await updateOrderShipping(
            workspaceId,
            state.active_order.orderId,
            {
              shippingAddress: state.datos.direccion,
              shippingCity: state.datos.ciudad,
              shippingDepartment: state.datos.departamento,
            },
            { agentId: SOMNIO_PW_CONFIRMATION_AGENT_ID, conversationId },
          )
          if (result.status === 'failed') mutationError = result.error
        }
      } else if (accion === 'mover_a_falta_confirmar' && state.active_order?.orderId) {
        const result = await moveOrderToFaltaConfirmar(workspaceId, state.active_order.orderId, {
          agentId: SOMNIO_PW_CONFIRMATION_AGENT_ID,
          conversationId,
        })
        if (result.status === 'failed') mutationError = result.error
      }

      // 8. Si mutacion fallo con stage_changed_concurrently → handoff.
      if (mutationError) {
        getCollector()?.recordEvent('pipeline_decision', 'stage_changed_concurrently_caught', {
          agent: SOMNIO_PW_CONFIRMATION_AGENT_ID, sessionId,
          errorCode: mutationError.code,
          originalAction: accion,
        })
        accion = 'handoff'
        state.requires_human = true
      }

      // 9. Response-track.
      const responseResult = await resolveResponseTrack({
        salesAction: accion,
        intent: analysis.intent,
        state,
        workspaceId,
      })

      // 10. Update state + persist.
      const finalState = {
        ...state,
        acciones: [...state.acciones, accion],
        intent_history: [...(state.intent_history ?? []), analysis.intent].slice(-6),
      }
      const newPhase = derivePhase(finalState.acciones)
      finalState.phase = newPhase

      await sm.updateCapturedData(sessionId, serializeState(finalState))

      // 11. Return.
      return {
        messages: responseResult.messages,
        intent: analysis.intent,
        newPhase,
        acciones: [accion],
        templateIdsSent: responseResult.templateIdsSent,
      }
    }
    ```

    Commit: `feat(somnio-sales-v3-pw-confirmation): add somnio-pw-confirmation-agent.ts processMessage entry (orchestrate comprehension + guards + sales-track + crm-writer-adapter mutations + response-track + state persist)`. NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts</automated>
    <automated>grep -q "export async function processMessage" src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts</automated>
    <automated>grep -q "deserializeState\\|createInitialState" src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts</automated>
    <automated>grep -q "analyzeMessage" src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts</automated>
    <automated>grep -q "checkGuards" src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts</automated>
    <automated>grep -q "resolveSalesTrack" src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts</automated>
    <automated>grep -q "resolveResponseTrack" src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts</automated>
    <automated>grep -q "moveOrderToConfirmado" src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts</automated>
    <automated>grep -q "updateOrderShipping" src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts</automated>
    <automated>grep -q "moveOrderToFaltaConfirmar" src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts</automated>
    <automated>grep -q "stage_changed_concurrently" src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts</automated>
    <automated>grep -q "_v3:crm_context_status" src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts</automated>
    <automated>grep -q "serializeState" src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts</automated>
    <automated>npm run typecheck 2>&1 | grep -E "somnio-pw-confirmation-agent" | grep -q "error TS" && exit 1 || exit 0</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(somnio-sales-v3-pw-confirmation): add somnio-pw-confirmation-agent.ts"</automated>
  </verify>
  <acceptance_criteria>
    - processMessage exportada con flow de 11 pasos.
    - Lectura BLOQUEANTE de _v3:crm_context (NO polling).
    - Degradacion graceful si crm_context_status='error'.
    - Mutaciones via adapter (3 operaciones).
    - stage_changed_concurrently → handoff.
    - Persiste state actualizado al final.
    - typecheck OK.
    - Commit atomico.
  </acceptance_criteria>
  <done>
    - Plan 12 (tests) puede testear processMessage con mocks de Haiku + adapter + SessionManager.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Crear `engine-pw-confirmation.ts` (wrapper opcional, ~30 lineas) + actualizar `index.ts` re-export de processMessage</name>
  <read_first>
    - src/lib/agents/somnio-recompra/engine-recompra.ts LINEAS COMPLETAS (~150 lineas — patron sandbox wrapper)
    - src/lib/agents/somnio-pw-confirmation/index.ts (Plan 03 — el stub actual)
    - src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts (Task 1)
  </read_first>
  <action>
    1. Crear `src/lib/agents/somnio-pw-confirmation/engine-pw-confirmation.ts` con un wrapper minimo (puede ser stub si no se usa para sandbox V1):

    ```typescript
    /**
     * Sandbox/dev wrapper for somnio-pw-confirmation agent.
     * Production usage goes through V3ProductionRunner directly (see v3-production-runner.ts).
     * This module is a placeholder for sandbox integration if/when needed.
     */

    import { processMessage } from './somnio-pw-confirmation-agent'
    import type { V3AgentInput, V3AgentOutput } from './types'

    export async function runEngine(input: V3AgentInput): Promise<V3AgentOutput> {
      return processMessage(input)
    }

    export { processMessage }
    ```

    2. Editar `src/lib/agents/somnio-pw-confirmation/index.ts` (creado en Plan 03) para agregar la re-export de `processMessage`:

    Cambio en index.ts:
    ```typescript
    // ... existing imports ...

    agentRegistry.register(somnioPwConfirmationConfig)

    export { SOMNIO_PW_CONFIRMATION_AGENT_ID } from './config'
    export { processMessage } from './somnio-pw-confirmation-agent'  // ★ NEW (Plan 11)
    export type { V3AgentInput, V3AgentOutput, TipoAccion } from './types'
    ```

    Commit: `feat(somnio-sales-v3-pw-confirmation): add engine-pw-confirmation wrapper + export processMessage from index`. NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-pw-confirmation/engine-pw-confirmation.ts</automated>
    <automated>grep -q "processMessage" src/lib/agents/somnio-pw-confirmation/index.ts</automated>
    <automated>grep -q "export { processMessage } from './somnio-pw-confirmation-agent'" src/lib/agents/somnio-pw-confirmation/index.ts</automated>
    <automated>npm run typecheck 2>&1 | grep -E "somnio-pw-confirmation/(engine|index)" | grep -q "error TS" && exit 1 || exit 0</automated>
  </verify>
  <acceptance_criteria>
    - engine-pw-confirmation.ts existe (stub OK para V1).
    - index.ts agrega re-export de processMessage.
    - typecheck OK.
    - Commit atomico.
  </acceptance_criteria>
  <done>
    - Modulo del agente completo (todos los archivos previstos por D-25).
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Agregar branch en V3ProductionRunner (case agentModule='somnio-pw-confirmation')</name>
  <read_first>
    - src/lib/agents/engine/v3-production-runner.ts LINEAS COMPLETAS (verificar lineas 150-170 con branches existentes para 'godentist' y 'somnio-recompra')
  </read_first>
  <action>
    Editar `src/lib/agents/engine/v3-production-runner.ts` para agregar el branch nuevo. Buscar el bloque que actualmente tiene:

    ```typescript
    if (this.config.agentModule === 'godentist') {
      const { processMessage } = await import('../godentist')
      output = await processMessage(v3Input as any) as unknown as V3AgentOutput
    } else if (this.config.agentModule === 'somnio-recompra') {
      const { processMessage } = await import('../somnio-recompra')
      output = await processMessage(v3Input as any) as unknown as V3AgentOutput
    }
    ```

    Agregar nuevo branch:

    ```typescript
    if (this.config.agentModule === 'godentist') {
      const { processMessage } = await import('../godentist')
      output = await processMessage(v3Input as any) as unknown as V3AgentOutput
    } else if (this.config.agentModule === 'somnio-recompra') {
      const { processMessage } = await import('../somnio-recompra')
      output = await processMessage(v3Input as any) as unknown as V3AgentOutput
    } else if (this.config.agentModule === 'somnio-pw-confirmation') {
      const { processMessage } = await import('../somnio-pw-confirmation')
      output = await processMessage(v3Input as any) as unknown as V3AgentOutput
    }
    ```

    El else final (default a sales-v3) NO se toca — sigue retornando a sales-v3 si agentModule no matchea.

    Commit: `feat(somnio-sales-v3-pw-confirmation): add agentModule='somnio-pw-confirmation' branch in V3ProductionRunner`. NO push.
  </action>
  <verify>
    <automated>grep -q "this.config.agentModule === 'somnio-pw-confirmation'" src/lib/agents/engine/v3-production-runner.ts</automated>
    <automated>grep -q "import('../somnio-pw-confirmation')" src/lib/agents/engine/v3-production-runner.ts</automated>
    <automated>npm run typecheck 2>&1 | grep -E "v3-production-runner" | grep -q "error TS" && exit 1 || exit 0</automated>
  </verify>
  <acceptance_criteria>
    - Branch agregada con dynamic import.
    - typecheck OK.
    - Commit atomico.
  </acceptance_criteria>
  <done>
    - V3ProductionRunner sabe instanciar el agente PW.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Agregar branch en webhook-processor.ts (dispatch evento Inngest cuando router decide PW)</name>
  <read_first>
    - src/lib/agents/production/webhook-processor.ts LINEAS COMPLETAS (verificar lineas 200-550, especialmente lineas 315-400 donde el branch recompra dispatcha)
    - src/inngest/client.ts (signature de inngest.send)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §B.1 Opcion C (webhook dispatch sin invoke runner inline)
  </read_first>
  <action>
    Agregar un branch nuevo en `webhook-processor.ts` que dispatcha el evento Inngest cuando `routerDecidedAgentId === 'somnio-sales-v3-pw-confirmation'`. Ubicar este branch ANTES del branch existente de recompra (o despues — el orden importa: el primero que matchea gana).

    Nuevo branch:

    ```typescript
    // Standalone: somnio-sales-v3-pw-confirmation (D-05 BLOQUEANTE — no inline invoke)
    if (routerDecidedAgentId === 'somnio-sales-v3-pw-confirmation') {
      // Dispatch event to Inngest function 'pw-confirmation/preload-and-invoke' (Plan 09).
      // The function 2-step: (1) call CRM reader BLOCKING + persist, (2) invoke agent with populated session.
      // Webhook does NOT invoke runner inline — agent waits for reader (D-05).
      // Webhook DOES respond 200 immediately (Vercel <5s SLA — see MEMORY).

      // Ensure session exists (createSession is idempotent — returns existing if already created).
      const sessionId = (await sm.getOrCreateSession({
        conversationId,
        contactId,
        workspaceId,
        agentId: routerDecidedAgentId,
      })).id

      getCollector()?.recordEvent('pipeline_decision', 'pw_confirmation_routed', {
        agent: routerDecidedAgentId,
        conversationId, contactId, sessionId,
      })

      // CRITICAL: await — never fire-and-forget (MEMORY: "Vercel serverless + Inngest").
      await inngest.send({
        name: 'pw-confirmation/preload-and-invoke',
        data: {
          sessionId,
          contactId,
          conversationId,
          workspaceId,
          messageContent: messageBody,
          messageId,
          messageTimestamp,
          phone: from,
          invoker: 'somnio-sales-v3-pw-confirmation' as const,
        },
      })

      getCollector()?.recordEvent('pipeline_decision', 'crm_reader_dispatched', {
        agent: routerDecidedAgentId,
        sessionId, contactId,
      })

      // Done — Inngest function takes over. Webhook returns success.
      return { success: true, agentId: routerDecidedAgentId, dispatched: true }
    }
    ```

    Adaptar nombres de variables segun el contexto exacto del file (el codigo arriba es indicativo — el executor debe leer el file completo y adaptar a las variables locales reales).

    Commit: `feat(somnio-sales-v3-pw-confirmation): add webhook-processor branch dispatching pw-confirmation/preload-and-invoke event when routerDecidedAgentId matches (D-05)`. NO push.
  </action>
  <verify>
    <automated>grep -q "routerDecidedAgentId === 'somnio-sales-v3-pw-confirmation'" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>grep -q "'pw-confirmation/preload-and-invoke'" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>grep -q "pw_confirmation_routed" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>grep -q "crm_reader_dispatched" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>grep -B2 "'pw-confirmation/preload-and-invoke'" src/lib/agents/production/webhook-processor.ts | grep -q "await inngest.send\\|await.*\\.send"</automated>
    <automated>npm run typecheck 2>&1 | grep -E "webhook-processor" | grep -q "error TS" && exit 1 || exit 0</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(somnio-sales-v3-pw-confirmation): add webhook-processor branch"</automated>
  </verify>
  <acceptance_criteria>
    - Branch agregada antes del branch recompra (o donde sea el match correcto).
    - inngest.send con `await` (NUNCA fire-and-forget).
    - Eventos observability emitidos: `pw_confirmation_routed`, `crm_reader_dispatched`.
    - Webhook retorna `{success: true}` inmediato (Vercel <5s SLA).
    - typecheck OK.
    - Commit atomico.
  </acceptance_criteria>
  <done>
    - Webhook → Inngest function → Reader → Agent flow completo.
  </done>
</task>

</tasks>

<verification>
- 5 archivos editados/creados.
- processMessage flow de 11 pasos implementado.
- V3ProductionRunner agrega branch.
- Webhook-processor agrega branch dispatch (con await — NO fire-and-forget).
- typecheck OK.
- 4 commits atomicos, NO pusheados.
</verification>

<success_criteria>
- Flow end-to-end: Webhook → Inngest function step 1 (reader bloqueante) → step 2 (agente via V3ProductionRunner) → processMessage orquesta todo → mensajes enviados al cliente.
- Plan 12 puede testear processMessage con mocks.
- Plan 13 puede activar el agente (push + smoke test prod).
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-sales-v3-pw-confirmation/11-SUMMARY.md` documenting:
- 4 commit hashes.
- Diagrama del flow end-to-end (webhook → Inngest → agent → mutations → response).
- LoC del processMessage agent.
- typecheck output.
</output>
</content>
</invoke>
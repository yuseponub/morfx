---
phase: somnio-sales-v3-pw-confirmation
plan: 09
type: execute
wave: 4
depends_on: [03, 04, 06]
files_modified:
  - src/inngest/events.ts
  - src/inngest/functions/pw-confirmation-preload-and-invoke.ts
  - src/app/api/inngest/route.ts
autonomous: true

requirements: []

must_haves:
  truths:
    - "src/inngest/events.ts agrega type definition `PwConfirmationPreloadAndInvokeEvents` con event name literal `'pw-confirmation/preload-and-invoke'` y data shape {sessionId, contactId, conversationId, workspaceId, messageContent, messageId, messageTimestamp, phone}"
    - "src/inngest/functions/pw-confirmation-preload-and-invoke.ts crea Inngest function 2-step (Opcion C de RESEARCH §B.1): step 1 'call-reader-and-persist' invoca processReaderMessage con AbortController 25s + persiste `_v3:crm_context`/`_v3:crm_context_status`/`_v3:active_order` JSON estructurado en session_state via SessionManager.updateCapturedData; step 2 'invoke-agent' instancia V3ProductionRunner({agentModule: 'somnio-pw-confirmation'}) y llama processMessage con la sesion ya populada"
    - "Function id literal: `'pw-confirmation-preload-and-invoke'`"
    - "Function trigger: `{ event: 'pw-confirmation/preload-and-invoke' }`"
    - "Function retries: 1 (NO retries adicionales — reader cuesta tokens, no amplificar fallos)"
    - "Function concurrency: `[{ key: 'event.data.sessionId', limit: 1 }]` (serializa turns por sesion para evitar race con segundo mensaje del cliente)"
    - "buildPwReaderPrompt(contactId, conversationId): el prompt fijo que el reader recibe — ver RESEARCH §B.2 lockeado verbatim. Pide al reader: leer contacto, listar pedidos, filtrar a stages relevantes, seleccionar mas reciente por created_at DESC, devolver parrafo con orderId/items/total/shipping/contacto/tags + lista de campos faltantes."
    - "Step 1 extrae `_v3:active_order` JSON estructurado del `reader.toolCalls` (Open Q3 resuelto: text + JSON). El parser busca el ultimo `ordersGet` toolCall en `reader.steps[*].toolResults` y serializa orderId/stageId/items/shipping/contact/tags. Si no encuentra, _v3:active_order = '{}'."
    - "Error path: si reader throws/timeout, escribe `_v3:crm_context_status='error'` + `_v3:crm_context=''` + `_v3:active_order='{}'` ANTES de proceder al step 2 (NO bloquea agente — agente ve crm_context_status='error' y degrada gracefully via template `error_carga_pedido`)"
    - "Observability: emite eventos `pipeline_decision:crm_reader_completed` (status=ok/empty) o `pipeline_decision:crm_reader_failed` (status=error) — clonar pattern de recompra-preload-context.ts"
    - "Observability merge pattern: stepCollector inside step.run + __obs return + outer collector.mergeFrom + final 'observability-flush' step (RESEARCH §A.5 Phase 42.1 canon)"
    - "Function exportada como `pwConfirmationPreloadAndInvokeFunctions = [pwConfirmationPreloadAndInvoke]`"
    - "Registrada en `src/app/api/inngest/route.ts` via `...pwConfirmationPreloadAndInvokeFunctions` spread en el array de `serve({...}).functions`"
    - "npm run typecheck no introduce errors nuevos"
  artifacts:
    - path: "src/inngest/events.ts"
      provides: "Type definition para evento 'pw-confirmation/preload-and-invoke'"
      contains: "pw-confirmation/preload-and-invoke"
    - path: "src/inngest/functions/pw-confirmation-preload-and-invoke.ts"
      provides: "2-step Inngest function: reader bloqueante (step 1) + invoke agent (step 2). Patron NUEVO en codebase."
      contains: "pw-confirmation-preload-and-invoke"
      min_lines: 250
    - path: "src/app/api/inngest/route.ts"
      provides: "Function registration spread"
      contains: "pwConfirmationPreloadAndInvokeFunctions"
  key_links:
    - from: "src/inngest/functions/pw-confirmation-preload-and-invoke.ts step 1"
      to: "src/lib/agents/crm-reader (processReaderMessage) + SessionManager.updateCapturedData"
      via: "BLOCKING reader call + merge-safe persist"
      pattern: "processReaderMessage"
    - from: "src/inngest/functions/pw-confirmation-preload-and-invoke.ts step 2"
      to: "src/lib/agents/engine/v3-production-runner.ts (V3ProductionRunner with agentModule='somnio-pw-confirmation')"
      via: "instantiate runner + processMessage"
      pattern: "agentModule.*somnio-pw-confirmation"
    - from: "src/app/api/inngest/route.ts"
      to: "src/inngest/functions/pw-confirmation-preload-and-invoke.ts"
      via: "import + spread"
      pattern: "pwConfirmationPreloadAndInvokeFunctions"
---

<objective>
Wave 4 — Crear la Inngest function `pw-confirmation-preload-and-invoke` que implementa el patron NUEVO **CRM Reader BLOQUEANTE** (D-05).

Purpose: D-05 lockea: el agente DEBE esperar al reader antes de la primera respuesta. RESEARCH §B.1 analiza 3 opciones y recomienda Opcion C: 2-step Inngest function. Webhook responde 200 inmediato (Plan 11 lo dispara), Inngest 2-step corre reader → persiste contexto en sesion → invoca agente con sesion ya populada (sin polling, sin race).

**Diferencia clave vs recompra-preload-context.ts** (precedente):
- Recompra es non-blocking: webhook envia saludo INSTANT, Inngest enriquece sesion en background, recompra agent usa polling helper para esperar.
- PW es BLOQUEANTE: webhook NO envia nada, Inngest hace 2 steps (reader → agent), agent ya tiene contexto sin polling.

Output: 3 cambios:
1. **Type def del evento** en `src/inngest/events.ts` (1 entry).
2. **Inngest function file** nuevo (~250+ lineas, copiando shape de recompra-preload-context.ts pero con step 2 nuevo).
3. **Registration en route.ts** (1 import + 1 spread).

Dependencias: Plans 03 (config con agent_id), 04 (constants — INNGEST_EVENT_PRELOAD_AND_INVOKE + READER_TIMEOUT_MS), 06 (extractActiveOrder helper en state.ts).

**Pitfalls criticos** (RESEARCH §J):
- **#5 AbortSignal**: usar AbortController en step 1, NOT signal directo del processReaderMessage.
- **#9 Concurrency per-sessionId**: garantiza que 2 mensajes del cliente en <5s no disparen 2 instances de la function (segundo es deduplicado por concurrency limit 1).
- **#10 Idempotency**: step.run garantiza que si Inngest reintenta, step 1 retorna serializado y NO re-llama reader. Step 2 tampoco re-invoca agente si step.run completed.
- **#3 Cold lambda**: el agentRegistry pre-warm (Plan 03) y el `import('@/lib/agents/somnio-pw-confirmation')` dynamic en step 2 garantizan que el modulo cargue antes de invocar agente.

NO hay feature flag en este standalone (D-02: aislamiento via routing rules — sin regla activa = sin trafico).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md §D-05 (CRM reader BLOQUEANTE), §D-08 (prompt al reader)
@.planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §B.1 (Opcion C diseno detallado), §B.2 (prompt sugerido al reader), §J (Pitfalls 5, 9, 10, 3)
@.planning/standalone/somnio-recompra-crm-reader/03-PLAN.md — patron Inngest function recompra (precedente DIRECTO)
@src/inngest/functions/recompra-preload-context.ts — recompra Inngest function (clonar shape, agregar step 2)
@src/inngest/events.ts — donde agregar type def
@src/app/api/inngest/route.ts — donde registrar
@src/lib/agents/crm-reader/index.ts — processReaderMessage signature
@src/lib/agents/session-manager.ts — updateCapturedData merge-safe helper
@src/lib/agents/engine/v3-production-runner.ts — V3ProductionRunner con agentModule (Plan 11 agrega branch para 'somnio-pw-confirmation')
@src/lib/observability — ObservabilityCollector + runWithCollector
@src/lib/agents/somnio-pw-confirmation/constants.ts (Plan 04 — READER_TIMEOUT_MS, INNGEST_EVENT_PRELOAD_AND_INVOKE)
@src/lib/agents/somnio-pw-confirmation/state.ts (Plan 06 — extractActiveOrder helper)

<interfaces>
<!-- Event payload shape -->
type PwConfirmationPreloadAndInvokeEvents = {
  'pw-confirmation/preload-and-invoke': {
    data: {
      sessionId: string
      contactId: string
      conversationId: string
      workspaceId: string
      messageContent: string
      messageId: string
      messageTimestamp: string
      phone: string
      invoker: 'somnio-sales-v3-pw-confirmation'  // literal
    }
  }
}

<!-- processReaderMessage (existing) -->
async function processReaderMessage(input: {
  workspaceId: string
  messages: Array<{role:'user'|'assistant', content:string}>
  invoker?: string
  abortSignal?: AbortSignal
}): Promise<{ text: string, toolCalls: any[], steps: number, agentId: 'crm-reader' }>

<!-- V3ProductionRunner (existing — Plan 11 adds 'somnio-pw-confirmation' branch) -->
new V3ProductionRunner(adapters, { workspaceId, agentModule: 'somnio-pw-confirmation' })
  .processMessage({ sessionId, conversationId, contactId, message, workspaceId, history, phoneNumber, messageTimestamp })
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Agregar type def del evento + crear Inngest function file (2-step)</name>
  <read_first>
    - src/inngest/events.ts LINEAS COMPLETAS (verificar shape para agregar nueva entry)
    - src/inngest/functions/recompra-preload-context.ts LINEAS COMPLETAS (~275 lineas — patron base)
    - src/lib/agents/crm-reader/index.ts (processReaderMessage signature)
    - src/lib/agents/session-manager.ts lineas 390-420 (updateCapturedData)
    - src/lib/agents/engine/v3-production-runner.ts lineas 100-200 (V3ProductionRunner usage pattern)
    - src/lib/observability/index.ts (exports)
    - src/lib/agents/somnio-pw-confirmation/constants.ts (Plan 04)
    - src/lib/agents/somnio-pw-confirmation/state.ts (Plan 06 — extractActiveOrder)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §B.1 + §B.2 (diseno detallado)
  </read_first>
  <action>
    **Edit 1 — `src/inngest/events.ts`**: agregar type definition para el nuevo evento.

    Agregar (siguiendo el patron existente para `RecompraPreloadEvents` o similar):

    ```typescript
    export type PwConfirmationPreloadAndInvokeEvents = {
      'pw-confirmation/preload-and-invoke': {
        data: {
          sessionId: string
          contactId: string
          conversationId: string
          workspaceId: string
          messageContent: string
          messageId: string
          messageTimestamp: string
          phone: string
          invoker: 'somnio-sales-v3-pw-confirmation'
        }
      }
    }
    ```

    Y agregar `PwConfirmationPreloadAndInvokeEvents` al union global `Events` (si existe — verificar shape exacto del events.ts en el repo).

    **Edit 2 — Crear `src/inngest/functions/pw-confirmation-preload-and-invoke.ts`**:

    Estructura del archivo (clonar `recompra-preload-context.ts` shape pero con 2 step.run en vez de 1):

    ```typescript
    /**
     * PW Confirmation: Preload CRM Context (BLOCKING) + Invoke Agent
     *
     * Phase: somnio-sales-v3-pw-confirmation (standalone)
     * Trigger: event 'pw-confirmation/preload-and-invoke' dispatched by webhook-processor
     *          when routerDecidedAgentId === 'somnio-sales-v3-pw-confirmation'.
     *
     * Pattern: 2-step orchestration (D-05 + RESEARCH §B.1 Opcion C)
     *   Step 1 'call-reader-and-persist': invoke crm-reader BLOCKING with 25s timeout,
     *           write _v3:crm_context + _v3:crm_context_status + _v3:active_order JSON to session.
     *   Step 2 'invoke-agent': instantiate V3ProductionRunner with agentModule='somnio-pw-confirmation',
     *           call processMessage with session already populated. Agent does NOT poll — context
     *           is guaranteed present (or marked error) by step 1.
     *
     * NO feature flag (D-02 — isolation via routing rules; absence of active rule = no traffic).
     * Idempotent: step.run serializes both steps; Inngest retry does NOT re-invoke either.
     * Observability: outer collector + step __obs returns + final 'observability-flush' step.
     */

    import { inngest } from '../client'
    import { createModuleLogger } from '@/lib/audit/logger'
    import {
      isObservabilityEnabled,
      ObservabilityCollector,
      runWithCollector,
    } from '@/lib/observability'

    const logger = createModuleLogger('pw-confirmation-preload-and-invoke')

    const READER_TIMEOUT_MS = 25_000
    const AGENT_ID = 'somnio-sales-v3-pw-confirmation' as const

    /**
     * Fixed reader prompt (RESEARCH §B.2 LOCKED — verbatim, do NOT modify).
     * Asks reader to: read contact, list orders, filter to entry stages,
     * pick most recent, dump structured paragraph.
     */
    function buildPwReaderPrompt(contactId: string, conversationId: string): string {
      return `Prepara contexto del pedido activo del contacto ${contactId} en workspace.

    Pasos:
    1. Lee el contacto via contactsGet({contactId: '${contactId}'}). Captura nombre, telefono, email, tags, address, city, department.
    2. Lista los pedidos del contacto via ordersList({contactId: '${contactId}', limit: 20}).
    3. Filtra a los pedidos cuyo stage_name es uno de: 'NUEVO PAG WEB', 'FALTA INFO', 'FALTA CONFIRMAR'. Si hay 0: responde literalmente "SIN_PEDIDO_ACTIVO".
    4. Si hay 1 o mas: selecciona el mas reciente por created_at DESC. Lee detalle via ordersGet({orderId: 'X'}).
    5. Devuelve un parrafo en espanol con:
       - ID y nombre del pedido + stage_name + created_at.
       - Items (titulo + cantidad + unitPrice) y total_value.
       - shipping_address + shipping_city + shipping_department (si existen, indicar "FALTA" si no).
       - Datos del contacto (nombre, telefono, email).
       - Tags activos del contacto.
       - Lista de campos FALTANTES para envio: nombre, apellido, telefono, direccion, ciudad, departamento — indica cuales faltan.
    Formato plano, sin listas markdown — va a ser inyectado en otro prompt de bot.`
    }

    /**
     * Helper: extract structured ActiveOrderPayload from reader.toolCalls / reader.steps[*].toolResults.
     * Looks for last 'ordersGet' tool call result, serializes orderId, stageId, items, shipping, contact, tags.
     * Returns JSON string (or '{}' if not found).
     */
    function extractActiveOrderJson(reader: { toolCalls?: any[]; steps?: any[] }): string {
      try {
        // toolCalls structure varies by AI SDK version; check both shapes.
        const allCalls: any[] = [
          ...(reader.toolCalls ?? []),
          ...(Array.isArray(reader.steps)
            ? reader.steps.flatMap((s) => s.toolCalls ?? s.toolResults ?? [])
            : []),
        ]
        // Find LAST ordersGet call (most specific order detail).
        const ordersGetCalls = allCalls.filter(
          (c) => c.toolName === 'ordersGet' || c.name === 'ordersGet',
        )
        if (ordersGetCalls.length === 0) return '{}'
        const lastCall = ordersGetCalls[ordersGetCalls.length - 1]
        const result = lastCall.result ?? lastCall.output ?? lastCall.response
        if (!result || typeof result !== 'object') return '{}'

        // Serialize relevant fields. Shape may vary; defensive access.
        const order = result.order ?? result
        const payload = {
          orderId: order.id,
          stageId: order.stage_id ?? order.stageId,
          stageName: order.stage_name ?? order.stageName,
          pipelineId: order.pipeline_id ?? order.pipelineId,
          totalValue: order.total_value ?? order.totalValue ?? 0,
          items: (order.items ?? order.products ?? []).map((it: any) => ({
            titulo: it.titulo ?? it.title ?? it.name,
            cantidad: it.cantidad ?? it.quantity ?? 1,
            unitPrice: it.unitPrice ?? it.unit_price ?? it.price ?? 0,
          })),
          shippingAddress: order.shipping_address ?? order.shippingAddress ?? null,
          shippingCity: order.shipping_city ?? order.shippingCity ?? null,
          shippingDepartment: order.shipping_department ?? order.shippingDepartment ?? null,
          customerName: result.contact?.name ?? null,
          customerPhone: result.contact?.phone ?? null,
          customerEmail: result.contact?.email ?? null,
          tags: result.contact?.tags ?? [],
        }
        return JSON.stringify(payload)
      } catch (err) {
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'extractActiveOrderJson failed, returning empty')
        return '{}'
      }
    }

    export const pwConfirmationPreloadAndInvoke = inngest.createFunction(
      {
        id: 'pw-confirmation-preload-and-invoke',
        name: 'PW Confirmation: Preload CRM (blocking) + Invoke Agent',
        retries: 1,
        concurrency: [{ key: 'event.data.sessionId', limit: 1 }],
      },
      { event: 'pw-confirmation/preload-and-invoke' },
      async ({ event, step }) => {
        const { sessionId, contactId, conversationId, workspaceId, messageContent, messageId, messageTimestamp, phone, invoker } = event.data

        // Outer collector for cross-step aggregation.
        const collector = isObservabilityEnabled()
          ? new ObservabilityCollector({
              conversationId,
              workspaceId,
              agentId: AGENT_ID,
              turnStartedAt: new Date(),
              triggerKind: 'system_event',
            })
          : null

        // ============================================================
        // STEP 1 — Call reader BLOCKING + persist context
        // ============================================================
        const step1Result = await step.run('call-reader-and-persist', async () => {
          const stepCollector = collector
            ? new ObservabilityCollector({
                conversationId,
                workspaceId,
                agentId: 'crm-reader',
                turnStartedAt: collector.turnStartedAt,
                triggerKind: 'system_event',
              })
            : null

          const run = async () => {
            const startedAt = Date.now()
            const { processReaderMessage } = await import('@/lib/agents/crm-reader')
            const { SessionManager } = await import('@/lib/agents/session-manager')
            const sm = new SessionManager()

            const abortController = new AbortController()
            const timeoutHandle = setTimeout(() => abortController.abort(), READER_TIMEOUT_MS)

            try {
              const reader = await processReaderMessage({
                workspaceId,
                invoker,
                messages: [{ role: 'user', content: buildPwReaderPrompt(contactId, conversationId) }],
                abortSignal: abortController.signal,
              })
              const durationMs = Date.now() - startedAt
              const text = reader.text?.trim() ?? ''
              const status: 'ok' | 'empty' = text.length > 0 ? 'ok' : 'empty'
              const activeOrderJson = extractActiveOrderJson(reader)

              await sm.updateCapturedData(sessionId, {
                '_v3:crm_context': text,
                '_v3:crm_context_status': status,
                '_v3:active_order': activeOrderJson,
              })

              return {
                status,
                durationMs,
                textLength: text.length,
                toolCallCount: reader.toolCalls?.length ?? 0,
                steps: reader.steps,
                hasActiveOrder: activeOrderJson !== '{}',
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              const durationMs = Date.now() - startedAt
              logger.error({ err: msg, sessionId, contactId, durationMs }, 'reader failed, writing error marker')

              try {
                await sm.updateCapturedData(sessionId, {
                  '_v3:crm_context': '',
                  '_v3:crm_context_status': 'error',
                  '_v3:active_order': '{}',
                })
              } catch (writeErr) {
                logger.error({ err: writeErr instanceof Error ? writeErr.message : String(writeErr) }, 'failed to write error marker')
              }

              return { status: 'error' as const, durationMs, error: msg.slice(0, 500) }
            } finally {
              clearTimeout(timeoutHandle)
            }
          }

          const result = stepCollector ? await runWithCollector(stepCollector, run) : await run()
          return {
            readerResult: result,
            __obs: stepCollector ? { events: stepCollector.events, queries: stepCollector.queries, aiCalls: stepCollector.aiCalls } : null,
          }
        })

        if (collector && step1Result.__obs) collector.mergeFrom(step1Result.__obs)

        // Emit step 1 observability events (outside step.run scope).
        const r1 = step1Result.readerResult
        if (r1.status === 'ok' || r1.status === 'empty') {
          collector?.recordEvent('pipeline_decision', 'crm_reader_completed', {
            agent: AGENT_ID, sessionId, contactId,
            durationMs: r1.durationMs,
            toolCallCount: 'toolCallCount' in r1 ? r1.toolCallCount : 0,
            steps: 'steps' in r1 ? r1.steps : 0,
            textLength: 'textLength' in r1 ? r1.textLength : 0,
            hasActiveOrder: 'hasActiveOrder' in r1 ? r1.hasActiveOrder : false,
            status: r1.status,
          })
        } else {
          collector?.recordEvent('pipeline_decision', 'crm_reader_failed', {
            agent: AGENT_ID, sessionId, contactId,
            durationMs: r1.durationMs,
            error: 'error' in r1 ? r1.error : 'unknown',
          })
        }

        // ============================================================
        // STEP 2 — Invoke agent (V3ProductionRunner with agentModule='somnio-pw-confirmation')
        // ============================================================
        const step2Result = await step.run('invoke-agent', async () => {
          const stepCollector = collector
            ? new ObservabilityCollector({
                conversationId,
                workspaceId,
                agentId: AGENT_ID,
                turnStartedAt: collector.turnStartedAt,
                triggerKind: 'user_message',
              })
            : null

          const run = async () => {
            const { V3ProductionRunner } = await import('@/lib/agents/engine/v3-production-runner')
            const { adapters } = await import('@/lib/agents/engine-adapters/production')
            // Pre-warm side-effect import (anti-B-001).
            await import('@/lib/agents/somnio-pw-confirmation')

            const runner = new V3ProductionRunner(adapters, {
              workspaceId,
              agentModule: 'somnio-pw-confirmation',
            })

            const output = await runner.processMessage({
              sessionId,
              conversationId,
              contactId,
              message: messageContent,
              workspaceId,
              history: [], // engine reads from session if needed; empty is OK for first turn
              phoneNumber: phone,
              messageTimestamp,
            })

            return { output }
          }

          const result = stepCollector ? await runWithCollector(stepCollector, run) : await run()
          return {
            agentResult: result,
            __obs: stepCollector ? { events: stepCollector.events, queries: stepCollector.queries, aiCalls: stepCollector.aiCalls } : null,
          }
        })

        if (collector && step2Result.__obs) collector.mergeFrom(step2Result.__obs)

        // ============================================================
        // FINAL — Flush observability collector
        // ============================================================
        if (collector) {
          await step.run('observability-flush', async () => {
            await collector.flush()
          })
        }

        return {
          step1: step1Result.readerResult,
          step2: step2Result.agentResult,
        }
      },
    )

    export const pwConfirmationPreloadAndInvokeFunctions = [pwConfirmationPreloadAndInvoke]
    ```

    **Edit 3 — `src/app/api/inngest/route.ts`**: agregar import + spread.

    Import:
    ```typescript
    import { pwConfirmationPreloadAndInvokeFunctions } from '@/inngest/functions/pw-confirmation-preload-and-invoke'
    ```

    Spread en functions array (cerca de `...recompraPreloadContextFunctions`):
    ```typescript
    ...pwConfirmationPreloadAndInvokeFunctions,  // Standalone: somnio-sales-v3-pw-confirmation (D-05 BLOCKING reader)
    ```

    Tambien agregar entrada al JSDoc bloque "Functions served":
    ```
    - pw-confirmation-preload-and-invoke: 2-step (reader BLOCKING → invoke agent) for somnio-sales-v3-pw-confirmation (Standalone: somnio-sales-v3-pw-confirmation, D-05)
    ```

    **Verificar typecheck:**
    ```bash
    npm run typecheck 2>&1 | tee /tmp/tc-09.log
    ! grep -E "(pw-confirmation-preload-and-invoke|app/api/inngest/route|inngest/events)" /tmp/tc-09.log | grep -q "error TS"
    ```

    **Commit atomico:**
    ```bash
    git add src/inngest/events.ts src/inngest/functions/pw-confirmation-preload-and-invoke.ts src/app/api/inngest/route.ts
    git commit -m "feat(somnio-sales-v3-pw-confirmation): add Inngest function pw-confirmation-preload-and-invoke (2-step reader BLOCKING + invoke agent — D-05)"
    ```

    NO push.
  </action>
  <verify>
    <automated>test -f src/inngest/functions/pw-confirmation-preload-and-invoke.ts</automated>
    <automated>grep -q "id: 'pw-confirmation-preload-and-invoke'" src/inngest/functions/pw-confirmation-preload-and-invoke.ts</automated>
    <automated>grep -q "retries: 1" src/inngest/functions/pw-confirmation-preload-and-invoke.ts</automated>
    <automated>grep -q "concurrency: \[{ key: 'event.data.sessionId', limit: 1 }\]" src/inngest/functions/pw-confirmation-preload-and-invoke.ts</automated>
    <automated>grep -q "event: 'pw-confirmation/preload-and-invoke'" src/inngest/functions/pw-confirmation-preload-and-invoke.ts</automated>
    <automated>grep -q "READER_TIMEOUT_MS = 25_000" src/inngest/functions/pw-confirmation-preload-and-invoke.ts</automated>
    <automated>grep -q "step.run('call-reader-and-persist'" src/inngest/functions/pw-confirmation-preload-and-invoke.ts</automated>
    <automated>grep -q "step.run('invoke-agent'" src/inngest/functions/pw-confirmation-preload-and-invoke.ts</automated>
    <automated>grep -q "AbortController" src/inngest/functions/pw-confirmation-preload-and-invoke.ts</automated>
    <automated>grep -q "_v3:crm_context_status" src/inngest/functions/pw-confirmation-preload-and-invoke.ts</automated>
    <automated>grep -q "_v3:active_order" src/inngest/functions/pw-confirmation-preload-and-invoke.ts</automated>
    <automated>grep -q "extractActiveOrderJson" src/inngest/functions/pw-confirmation-preload-and-invoke.ts</automated>
    <automated>grep -q "agentModule: 'somnio-pw-confirmation'" src/inngest/functions/pw-confirmation-preload-and-invoke.ts</automated>
    <automated>grep -q "crm_reader_completed" src/inngest/functions/pw-confirmation-preload-and-invoke.ts</automated>
    <automated>grep -q "crm_reader_failed" src/inngest/functions/pw-confirmation-preload-and-invoke.ts</automated>
    <automated>grep -q "observability-flush" src/inngest/functions/pw-confirmation-preload-and-invoke.ts</automated>
    <automated>grep -q "mergeFrom" src/inngest/functions/pw-confirmation-preload-and-invoke.ts</automated>
    <automated>grep -q "export const pwConfirmationPreloadAndInvokeFunctions" src/inngest/functions/pw-confirmation-preload-and-invoke.ts</automated>
    <automated>grep -q "pw-confirmation/preload-and-invoke" src/inngest/events.ts</automated>
    <automated>grep -q "pwConfirmationPreloadAndInvokeFunctions" src/app/api/inngest/route.ts</automated>
    <automated>grep -q "\\.\\.\\.pwConfirmationPreloadAndInvokeFunctions" src/app/api/inngest/route.ts</automated>
    <automated>npm run typecheck 2>&1 | tee /tmp/tc-09.log; ! grep -E "(pw-confirmation-preload-and-invoke|app/api/inngest/route|inngest/events)" /tmp/tc-09.log | grep -q "error TS"</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(somnio-sales-v3-pw-confirmation): add Inngest function pw-confirmation-preload-and-invoke"</automated>
  </verify>
  <acceptance_criteria>
    - 3 archivos editados/creados.
    - Function id literal `'pw-confirmation-preload-and-invoke'`, retries 1, concurrency per-sessionId limit 1.
    - 2 step.run blocks: 'call-reader-and-persist' + 'invoke-agent' + final 'observability-flush'.
    - Reader call con AbortController 25s.
    - Persiste 3 keys en session: _v3:crm_context, _v3:crm_context_status, _v3:active_order.
    - extractActiveOrderJson helper present (Open Q3).
    - Error path escribe marker antes de proceder a step 2 (degradacion graceful).
    - Step 2 invoca V3ProductionRunner con agentModule='somnio-pw-confirmation'.
    - Pre-warm import de '@/lib/agents/somnio-pw-confirmation' dentro del step 2 (anti-B-001).
    - Observability merge pattern (stepCollector + __obs + mergeFrom).
    - Eventos: crm_reader_completed (ok/empty) o crm_reader_failed (error).
    - Function registrada en route.ts via spread.
    - typecheck OK.
    - Commit atomico.
  </acceptance_criteria>
  <done>
    - Plan 11 (engine + somnio-pw-confirmation-agent.ts) puede ser invocado por la function — el branch de v3-production-runner agrega el case `'somnio-pw-confirmation'`.
    - Plan 11 webhook-processor branch dispatcha el evento `'pw-confirmation/preload-and-invoke'` cuando el routing decide el agent_id PW.
    - Plan 12 (tests) puede testear el handler unitario (mock processReaderMessage + V3ProductionRunner).
  </done>
</task>

</tasks>

<verification>
- 3 archivos editados/creados.
- Patron Inngest 2-step (D-05 BLOQUEANTE) implementado.
- Open Q3 resuelto (text + JSON estructurado en _v3:active_order).
- Pitfalls 3, 5, 9, 10 mitigados.
- typecheck OK.
- 1 commit atomico, NO pusheado.
</verification>

<success_criteria>
- Plan 11 puede dispatchar el evento desde webhook-processor branch.
- Plan 11 puede agregar el branch en V3ProductionRunner.
- El reader corre BLOQUEANTE + el agente arranca con _v3:crm_context populated (sin polling).
- Si reader falla, agente recibe `_v3:crm_context_status='error'` y degrada via template `error_carga_pedido`.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-sales-v3-pw-confirmation/09-SUMMARY.md` documenting:
- Commit hash.
- LoC del Inngest function file.
- Diff de events.ts + route.ts.
- Confirmacion: pattern 2-step (reader → agent) implementado.
- Confirmacion: extractActiveOrderJson helper para Open Q3.
- typecheck output.
</output>
</content>
</invoke>
/**
 * PW Confirmation: Preload CRM Context (BLOCKING) + Invoke Agent
 *
 * Phase: somnio-sales-v3-pw-confirmation (standalone)
 * Trigger: event 'pw-confirmation/preload-and-invoke' dispatched by
 *          webhook-processor.ts when routerDecidedAgentId ===
 *          'somnio-sales-v3-pw-confirmation' (Plan 11 branch).
 *
 * Pattern: 2-step orchestration (D-05 + RESEARCH §B.1 Opcion C)
 *   Step 1 'call-reader-and-persist': invoke crm-reader BLOCKING with 25s
 *           AbortController timeout, write `_v3:crm_context` +
 *           `_v3:crm_context_status` + `_v3:active_order` (JSON estructurado)
 *           into session_state.datos_capturados via SessionManager.updateCapturedData.
 *   Step 2 'invoke-agent': instantiate V3ProductionRunner with
 *           agentModule='somnio-pw-confirmation' and call processMessage with
 *           the session already populated. Agent does NOT poll — context is
 *           guaranteed present (or marked 'error') by step 1 before step 2 runs.
 *
 * Diferencia clave vs recompra-preload-context.ts (precedente non-blocking):
 *   - Recompra: webhook envia saludo INSTANT, Inngest enriquece sesion en
 *     background, agente recompra usa polling helper para esperar.
 *   - PW (esta funcion): webhook NO envia nada, Inngest hace 2 steps secuenciales
 *     (reader → agent), agente arranca con contexto ya en sesion (sin polling).
 *
 * NO feature flag (D-02 — aislamiento via routing rules; sin regla activa
 * que mencione el agent_id = sin trafico = aislamiento total).
 *
 * Idempotent: step.run serializa ambos steps; Inngest retry NO re-invoca
 * ni el reader ni el agente si el step ya completo (returned value cached).
 *
 * Concurrency: per-sessionId limit 1 — segundo mensaje del cliente en <5s
 * queda deduplicado (espera al primero, NO arranca otra instancia paralela).
 *
 * Observability: outer collector + inner stepCollectors + __obs returns +
 * outer.mergeFrom + final 'observability-flush' step
 * (RESEARCH §A.5 — Phase 42.1 canon, anti lambda-boundary memoization).
 *
 * Cold lambda mitigation: pre-warm `import('@/lib/agents/somnio-pw-confirmation')`
 * inside step 2 (anti-B-001 LEARNING agent-lifecycle-router) — registers the
 * config in agentRegistry before the runner reads it.
 */

import { inngest } from '../client'
import { createModuleLogger } from '@/lib/audit/logger'
import {
  isObservabilityEnabled,
  ObservabilityCollector,
  runWithCollector,
} from '@/lib/observability'
import type { AgentId } from '@/lib/observability/types'

const logger = createModuleLogger('pw-confirmation-preload-and-invoke')

/**
 * Inner timeout para CRM reader call (Pitfall 5 — AbortController, NOT
 * el signal directo de processReaderMessage). 25s alineado con
 * READER_TIMEOUT_MS de constants.ts del agente. D-05 asume 5-30s
 * aceptable post-purchase (cliente ya esta en confirmacion).
 */
const READER_TIMEOUT_MS = 25_000

/**
 * Agent ID (literal). LOCKED por D-01 / agent-scope.md.
 * Cast a AgentId-where-needed (no esta aun en la union de observability/types
 * — se aceptara via cast hasta que se agregue formalmente).
 */
const AGENT_ID = 'somnio-sales-v3-pw-confirmation' as const

/**
 * Fixed reader prompt (RESEARCH §B.2 LOCKED — verbatim, NO modificar).
 *
 * Pide al reader:
 * - Leer contacto (nombre, telefono, email, tags, address, city, department)
 * - Listar pedidos del contacto
 * - Filtrar a stages relevantes ('NUEVO PAG WEB', 'FALTA INFO', 'FALTA CONFIRMAR')
 * - Si 0 → responder literalmente "SIN_PEDIDO_ACTIVO"
 * - Si 1+ → seleccionar mas reciente por created_at DESC
 * - Devolver parrafo plano con: orderId/items/total/shipping/contacto/tags +
 *   lista de campos faltantes para envio
 *
 * Formato plano (no markdown) — el output va inyectado en otro prompt de bot.
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
Formato plano, sin listas markdown — va a ser inyectado en otro prompt de bot.

(conversationId de referencia: ${conversationId})`
}

/**
 * Helper: extract structured ActiveOrderPayload from reader output.
 *
 * Open Q3 resuelto: el reader devuelve text + tool calls. Este helper recorre
 * `reader.toolCalls` (flat structure de processReaderMessage) buscando el
 * ULTIMO `ordersGet` call (el detalle del pedido seleccionado), y serializa
 * los campos relevantes que `extractActiveOrder()` (state.ts) espera consumir.
 *
 * Defensivo: si no hay `ordersGet` call → retorna '{}'. Si shape no coincide
 * → retorna '{}'. NO throws — degradacion graceful (el agente vera
 * `_v3:active_order='{}'` y `extractActiveOrder()` retornara null,
 * forzando handoff humano via D-21 trigger).
 *
 * Retorna JSON.stringify del payload (string), o '{}' si no se pudo construir.
 */
function extractActiveOrderJson(reader: {
  text?: string
  toolCalls?: Array<{ name: string; input: unknown; output: unknown } | { toolName?: string; result?: unknown; output?: unknown }>
  steps?: number | unknown[]
}): string {
  try {
    // processReaderMessage flatten shape: { name, input, output }.
    // Defensive against future shape drift (toolName, result, response).
    const allCalls: Array<Record<string, unknown>> = []
    for (const call of reader.toolCalls ?? []) {
      allCalls.push(call as Record<string, unknown>)
    }
    // Steps may be a number (count) or an array; only iterate when array.
    if (Array.isArray(reader.steps)) {
      for (const step of reader.steps as Array<Record<string, unknown>>) {
        const stepCalls = (step.toolCalls as unknown[] | undefined) ?? []
        const stepResults = (step.toolResults as unknown[] | undefined) ?? []
        for (const c of stepCalls) allCalls.push(c as Record<string, unknown>)
        for (const r of stepResults) allCalls.push(r as Record<string, unknown>)
      }
    }

    // Find LAST ordersGet call (most specific order detail).
    const ordersGetCalls = allCalls.filter((c) => {
      const name = (c.name as string | undefined) ?? (c.toolName as string | undefined)
      return name === 'ordersGet' || name === 'orders_get'
    })
    if (ordersGetCalls.length === 0) return '{}'
    const lastCall = ordersGetCalls[ordersGetCalls.length - 1]
    const result =
      (lastCall.output as Record<string, unknown> | undefined) ??
      (lastCall.result as Record<string, unknown> | undefined) ??
      (lastCall.response as Record<string, unknown> | undefined)
    if (!result || typeof result !== 'object') return '{}'

    // Reader tool may wrap the order under `.order` or return it flat.
    const order = ((result.order as Record<string, unknown> | undefined) ??
      result) as Record<string, unknown>
    const contact = (result.contact as Record<string, unknown> | undefined) ?? {}

    const itemsRaw =
      (order.items as unknown[] | undefined) ??
      (order.products as unknown[] | undefined) ??
      []
    const items = itemsRaw.map((it) => {
      const itObj = it as Record<string, unknown>
      return {
        titulo:
          (itObj.titulo as string | undefined) ??
          (itObj.title as string | undefined) ??
          (itObj.name as string | undefined) ??
          '',
        cantidad:
          (itObj.cantidad as number | undefined) ??
          (itObj.quantity as number | undefined) ??
          1,
        unitPrice:
          (itObj.unitPrice as number | undefined) ??
          (itObj.unit_price as number | undefined) ??
          (itObj.price as number | undefined) ??
          0,
      }
    })

    const tagsRaw = (contact.tags as unknown[] | undefined) ?? []
    const tags = tagsRaw
      .map((t) => {
        if (typeof t === 'string') return t
        const tObj = t as Record<string, unknown>
        return (
          (tObj.name as string | undefined) ??
          (tObj.tag_name as string | undefined) ??
          ''
        )
      })
      .filter((t) => t.length > 0)

    const payload = {
      orderId:
        (order.id as string | undefined) ??
        (order.orderId as string | undefined) ??
        '',
      stageId:
        (order.stage_id as string | undefined) ??
        (order.stageId as string | undefined) ??
        '',
      stageName:
        (order.stage_name as string | undefined) ??
        (order.stageName as string | undefined) ??
        '',
      pipelineId:
        (order.pipeline_id as string | undefined) ??
        (order.pipelineId as string | undefined) ??
        '',
      totalValue:
        (order.total_value as number | undefined) ??
        (order.totalValue as number | undefined) ??
        0,
      items,
      shippingAddress:
        (order.shipping_address as string | null | undefined) ??
        (order.shippingAddress as string | null | undefined) ??
        null,
      shippingCity:
        (order.shipping_city as string | null | undefined) ??
        (order.shippingCity as string | null | undefined) ??
        null,
      shippingDepartment:
        (order.shipping_department as string | null | undefined) ??
        (order.shippingDepartment as string | null | undefined) ??
        null,
      customerName:
        (contact.name as string | null | undefined) ??
        (contact.full_name as string | null | undefined) ??
        null,
      customerPhone: (contact.phone as string | null | undefined) ?? null,
      customerEmail: (contact.email as string | null | undefined) ?? null,
      tags,
    }
    return JSON.stringify(payload)
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'extractActiveOrderJson failed, returning empty',
    )
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
    const {
      sessionId,
      contactId,
      conversationId,
      workspaceId,
      messageContent,
      messageId,
      messageTimestamp,
      phone,
      invoker,
    } = event.data

    // ---- Outer collector for cross-step aggregation ----
    // Use real conversationId so debug panel picks up this turn under the
    // same conversation as the agent's downstream turns.
    // Outer collector identidad: 'crm-reader' (es lo que arranca primero
    // y la mayor parte del trabajo del dispatcher es la lectura). El
    // step 2 stepCollector usa AGENT_ID como identidad inner.
    const collector = isObservabilityEnabled()
      ? new ObservabilityCollector({
          conversationId,
          workspaceId,
          agentId: 'crm-reader',
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

        // Inner 25s timeout via AbortController (Pitfall 5).
        const abortController = new AbortController()
        const timeoutHandle = setTimeout(
          () => abortController.abort(),
          READER_TIMEOUT_MS,
        )

        try {
          const reader = await processReaderMessage({
            workspaceId,
            invoker,
            messages: [
              {
                role: 'user',
                content: buildPwReaderPrompt(contactId, conversationId),
              },
            ],
            abortSignal: abortController.signal,
          })
          const durationMs = Date.now() - startedAt
          const text = reader.text?.trim() ?? ''
          const status: 'ok' | 'empty' = text.length > 0 ? 'ok' : 'empty'
          const activeOrderJson = extractActiveOrderJson(reader)

          // Merge-safe write — SessionManager.updateCapturedData does
          // get-then-merge, so co-existing keys (`_v3:agent_module`, etc.)
          // remain intact.
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
          logger.error(
            { err: msg, sessionId, contactId, durationMs },
            'reader failed, writing error marker before proceeding to step 2',
          )

          // Pitfall 4 — ALWAYS write error marker before returning, so
          // step 2 sees `_v3:crm_context_status='error'` and degrades
          // gracefully via template `error_carga_pedido`.
          try {
            await sm.updateCapturedData(sessionId, {
              '_v3:crm_context': '',
              '_v3:crm_context_status': 'error',
              '_v3:active_order': '{}',
            })
          } catch (writeErr) {
            logger.error(
              {
                sessionId,
                err:
                  writeErr instanceof Error
                    ? writeErr.message
                    : String(writeErr),
              },
              'failed to write error marker (last-resort swallow)',
            )
          }

          return {
            status: 'error' as const,
            durationMs,
            error: msg.slice(0, 500),
          }
        } finally {
          clearTimeout(timeoutHandle)
        }
      }

      const result = stepCollector
        ? await runWithCollector(stepCollector, run)
        : await run()

      return {
        readerResult: result,
        __obs: stepCollector
          ? {
              events: stepCollector.events,
              queries: stepCollector.queries,
              aiCalls: stepCollector.aiCalls,
            }
          : null,
      }
    })

    // ---- Observability merge (__obs survives step.run replays) ----
    if (collector && step1Result.__obs) {
      collector.mergeFrom(step1Result.__obs)
    }

    // ---- Step 1 observability events (emitted in outer scope, NOT inside step.run) ----
    const r1 = step1Result.readerResult
    if (r1.status === 'ok' || r1.status === 'empty') {
      collector?.recordEvent('pipeline_decision', 'crm_reader_completed', {
        agent: AGENT_ID,
        sessionId,
        contactId,
        durationMs: r1.durationMs,
        toolCallCount: 'toolCallCount' in r1 ? r1.toolCallCount : 0,
        steps: 'steps' in r1 ? r1.steps : 0,
        textLength: 'textLength' in r1 ? r1.textLength : 0,
        hasActiveOrder: 'hasActiveOrder' in r1 ? r1.hasActiveOrder : false,
        status: r1.status,
      })
    } else {
      collector?.recordEvent('pipeline_decision', 'crm_reader_failed', {
        agent: AGENT_ID,
        sessionId,
        contactId,
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
            // AGENT_ID no esta aun en la union AgentId — cast hasta que
            // Plan futuro lo agregue formalmente.
            agentId: AGENT_ID as unknown as AgentId,
            turnStartedAt: collector.turnStartedAt,
            triggerKind: 'user_message',
          })
        : null

      const run = async () => {
        const { V3ProductionRunner } = await import(
          '@/lib/agents/engine/v3-production-runner'
        )
        const { createProductionAdapters } = await import(
          '@/lib/agents/engine-adapters/production'
        )
        // Pre-warm side-effect import (anti-B-001 LEARNING agent-lifecycle-router):
        // registra config en agentRegistry antes de que el runner lo lea.
        await import('@/lib/agents/somnio-pw-confirmation')

        const adapters = createProductionAdapters({
          workspaceId,
          conversationId,
          phoneNumber: phone,
          contactId,
          // agentId routes timer adapter; Plan 11 wires V3 timer for the
          // pw-confirmation agent. For now we let the default ProductionTimerAdapter
          // handle timers — the agent module branch (Plan 11) overrides as needed.
          agentId: AGENT_ID,
        })

        const runner = new V3ProductionRunner(adapters, {
          workspaceId,
          // agentModule literal not yet in the EngineConfig union (Plan 11
          // adds the case in v3-production-runner.ts and extends the union).
          // Cast preserves typecheck until the union widens.
          agentModule: AGENT_ID as unknown as 'somnio-v3',
        })

        const output = await runner.processMessage({
          sessionId,
          conversationId,
          contactId,
          message: messageContent,
          workspaceId,
          history: [], // engine reads from session if needed; empty OK for first turn
          phoneNumber: phone,
          messageTimestamp,
        })

        return {
          success: output.success,
          messagesSent: output.messagesSent ?? 0,
          orderCreated: output.orderCreated ?? false,
          newMode: output.newMode,
          messageId,
        }
      }

      const result = stepCollector
        ? await runWithCollector(stepCollector, run)
        : await run()

      return {
        agentResult: result,
        __obs: stepCollector
          ? {
              events: stepCollector.events,
              queries: stepCollector.queries,
              aiCalls: stepCollector.aiCalls,
            }
          : null,
      }
    })

    if (collector && step2Result.__obs) {
      collector.mergeFrom(step2Result.__obs)
    }

    // ============================================================
    // FINAL — Flush observability collector as last step
    // (Phase 42.1 Plan 07 canon: flush in its own step.run)
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

/**
 * Array export — mirrors recompraPreloadContextFunctions, godentistReminderFunctions, etc.
 * Allows route.ts to spread without care for single-vs-multi function shape.
 */
export const pwConfirmationPreloadAndInvokeFunctions = [
  pwConfirmationPreloadAndInvoke,
]

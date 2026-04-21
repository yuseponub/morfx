---
phase: somnio-recompra-crm-reader
plan: 03
type: execute
wave: 2
depends_on: [01, 02]
files_modified:
  - src/inngest/functions/recompra-preload-context.ts
  - src/app/api/inngest/route.ts
  - src/inngest/functions/__tests__/recompra-preload-context.test.ts
autonomous: true

must_haves:
  truths:
    - "Nueva Inngest function `recompra-preload-context` existe en `src/inngest/functions/recompra-preload-context.ts`"
    - "Function tiene id `'recompra-preload-context'`, retries=1, concurrency key `event.data.sessionId` limit 1"
    - "Function trigger `{ event: 'recompra/preload-context' }` (match al schema de Plan 02)"
    - "Function early-returns `{status:'skipped', reason:'feature_flag_off'}` si `getPlatformConfig('somnio_recompra_crm_reader_enabled', false)` devuelve false"
    - "Function early-returns `{status:'skipped', reason:'already_processed'}` si session_state ya tiene `_v3:crm_context_status` (D-15 idempotency)"
    - "Function llama `processReaderMessage({workspaceId, invoker, messages:[{role:'user', content: buildReaderPrompt(contactId)}], abortSignal})` con AbortController 12s"
    - "Function escribe via `SessionManager.updateCapturedData(sessionId, { '_v3:crm_context': text, '_v3:crm_context_status': 'ok'|'empty'|'error' })` (merge-safe, Pitfall 2)"
    - "Function sigue el patron observability merge (__obs return + collector.mergeFrom + observability-flush step) (Pitfall mandatory RESEARCH §Shared Patterns)"
    - "Function emite `pipeline_decision:crm_reader_completed` O `pipeline_decision:crm_reader_failed` con metrics (durationMs, toolCallCount, steps, textLength, status/error)"
    - "Error-path DEBE escribir `_v3:crm_context_status='error'` + `_v3:crm_context=''` al state antes de re-throw (Pitfall 4)"
    - "La funcion esta registrada en `src/app/api/inngest/route.ts` via `...recompraPreloadContextFunctions` (array export pattern)"
    - "Unit test existe y cubre: (a) flag off → skipped, (b) session already has status → skipped idempotent, (c) reader success → updateCapturedData con status='ok', (d) reader throws → status='error' escrito + recordEvent('crm_reader_failed')"
  artifacts:
    - path: "src/inngest/functions/recompra-preload-context.ts"
      provides: "Background worker function que enriquece session state con contexto CRM"
      contains: "recompra-preload-context"
      min_lines: 150
    - path: "src/app/api/inngest/route.ts"
      provides: "Function registration entry (serve() functions array)"
      contains: "recompraPreloadContextFunctions"
    - path: "src/inngest/functions/__tests__/recompra-preload-context.test.ts"
      provides: "Unit test cubriendo feature flag, idempotency, success, failure paths"
      contains: "recompra-preload-context"
  key_links:
    - from: "src/inngest/functions/recompra-preload-context.ts"
      to: "processReaderMessage (@/lib/agents/crm-reader)"
      via: "dynamic import + call con AbortSignal.timeout(12_000)"
      pattern: "processReaderMessage\\("
    - from: "src/inngest/functions/recompra-preload-context.ts"
      to: "SessionManager.updateCapturedData (@/lib/agents/session-manager)"
      via: "merge-safe write of _v3:crm_context + _v3:crm_context_status"
      pattern: "updateCapturedData\\(sessionId,\\s*\\{"
    - from: "src/inngest/functions/recompra-preload-context.ts"
      to: "getPlatformConfig (@/lib/domain/platform-config)"
      via: "feature flag check at function entry"
      pattern: "getPlatformConfig<boolean>\\('somnio_recompra_crm_reader_enabled'"
    - from: "src/app/api/inngest/route.ts"
      to: "src/inngest/functions/recompra-preload-context.ts"
      via: "import + spread in serve().functions array"
      pattern: "\\.\\.\\.recompraPreloadContextFunctions"
---

<objective>
Wave 2 — Crear la Inngest function `recompra-preload-context` que consume el event registrado en Plan 02, invoca `processReaderMessage` con timeout 12s, persiste el resultado en `session_state.datos_capturados` via merge-safe, y emite observability events (D-16).

Purpose: Este es el CORE de la integracion. La function es el unico sitio donde corre el reader en produccion para este caso de uso. Incorpora los 9 pitfalls de RESEARCH.md:
- Pitfall 2 (merge-safe write via `SessionManager.updateCapturedData`)
- Pitfall 4 (marker de error escrito ANTES de throw)
- Pitfall 5 (AbortSignal 12s inner via AbortController)
- Pitfall 6 (flag via `getPlatformConfig`, no env var)
- Pitfall 8 (event tipado — ya en Plan 02)
- RESEARCH §Shared Pattern Observability Merge (step.run `__obs` return + outer `collector.mergeFrom`)
- D-15 idempotency (early-return si `_v3:crm_context_status` ya existe)
- D-16 observability (5 eventos definidos — esta function emite 2: completed/failed)

Output: 1 file nuevo (Inngest function) + 1 edit (route.ts registration) + 1 test file.

**Regla 6:** La function tiene defense-in-depth feature flag check — incluso si Plan 04 se deploya sin guard al dispatch, aqui early-return si flag=false. Cero side-effects en produccion hasta flip manual del flag (Plan 07).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-recompra-crm-reader/CONTEXT.md — D-04 a D-15 (todas las decisiones de la Inngest function)
@.planning/standalone/somnio-recompra-crm-reader/RESEARCH.md §Ejemplo 1 (Inngest function skeleton completo), §Pitfalls 1-9, §Shared Patterns (observability merge + merge-safe write + dynamic imports), §Security Domain
@.planning/standalone/somnio-recompra-crm-reader/PATTERNS.md §Wave 2 — New Inngest Function + Route Registration
@src/inngest/functions/agent-production.ts — observability merge pattern canon (lines 294-367, 466-489)
@src/inngest/functions/crm-bot-expire-proposals.ts — skeleton minimo de createFunction
@src/lib/agents/crm-reader/index.ts — processReaderMessage signature (ya con abortSignal post-Plan 02)
@src/lib/agents/session-manager.ts — updateCapturedData (line 402-414) merge-safe helper
@src/lib/domain/platform-config.ts — getPlatformConfig helper
@src/lib/observability — ObservabilityCollector, runWithCollector, isObservabilityEnabled
@src/__tests__/integration/crm-bots/reader.test.ts — vitest patron de mocking (para el test file)

<interfaces>
<!-- Event payload shape (from Plan 02 src/inngest/events.ts) -->
// type RecompraPreloadEvents['recompra/preload-context']['data'] = {
//   sessionId: string
//   contactId: string
//   workspaceId: string
//   invoker: 'somnio-recompra-v1'
// }

<!-- processReaderMessage signature (post Plan 02) -->
// async function processReaderMessage(input: {
//   workspaceId: string
//   messages: ReaderMessage[]
//   invoker?: string
//   abortSignal?: AbortSignal
// }): Promise<{ text: string, toolCalls: [...], steps: number, agentId: 'crm-reader' }>

<!-- SessionManager.updateCapturedData (from src/lib/agents/session-manager.ts:402-414) -->
async updateCapturedData(
  sessionId: string,
  newData: Record<string, string>
): Promise<void>
// Merge-safe: lee state.datos_capturados, spread con newData, escribe.

<!-- getPlatformConfig (from src/lib/domain/platform-config.ts:96) -->
async function getPlatformConfig<T>(key: string, fallback: T): Promise<T>

<!-- Observability collector merge pattern (canonical — src/inngest/functions/agent-production.ts:294-367) -->
// 1. Outer collector creado ANTES del step.run
// 2. Inner step.run crea stepCollector (con mismos conversationId/workspaceId/agentId)
// 3. Inner corre runWithCollector(stepCollector, run)
// 4. step.run retorna { readerResult, __obs: { events, queries, aiCalls } | null }
// 5. Outer: if (collector && stepResult.__obs) collector.mergeFrom(stepResult.__obs)
// 6. Final step: step.run('observability-flush', async () => await collector.flush())
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear `src/inngest/functions/recompra-preload-context.ts` (Inngest function completa)</name>
  <read_first>
    - .planning/standalone/somnio-recompra-crm-reader/RESEARCH.md §Ejemplo 1 (skeleton completo — copiar estructura verbatim)
    - src/inngest/functions/agent-production.ts lines 294-491 (observability merge pattern canon)
    - src/inngest/functions/crm-bot-expire-proposals.ts (entero — 76 lineas — skeleton minimo createFunction)
    - src/lib/agents/session-manager.ts lines 390-420 (getState signature + updateCapturedData)
    - src/lib/domain/platform-config.ts lines 90-160 (getPlatformConfig signature)
    - src/lib/observability/index.ts (ObservabilityCollector + runWithCollector exports)
    - src/lib/audit/logger.ts (createModuleLogger — para el pino logger)
  </read_first>
  <action>
    Crear el archivo `src/inngest/functions/recompra-preload-context.ts` con contenido completo basado en RESEARCH.md §Ejemplo 1, adaptado con los LOCKS de esta fase:

    - Event name: `'recompra/preload-context'` (literal, match Plan 02 schema)
    - Feature flag key: `'somnio_recompra_crm_reader_enabled'` (literal, match Plan 01 migration)
    - Timeout: 12_000ms via AbortController (LOCK per RESEARCH Open Q 1)
    - Concurrency key: `event.data.sessionId` limit 1 (D-15 + Open Q 6)
    - Retries: 1 (RESEARCH bullet 6 — reader cobra tokens, no amplificar fallos)
    - Marker status values: `'ok' | 'empty' | 'error'` (LOCK)

    **Contenido literal del archivo (copiar y adaptar):**

    ```typescript
    /**
     * Recompra: Preload CRM Context via Reader
     *
     * Phase: somnio-recompra-crm-reader (standalone)
     * Trigger: event 'recompra/preload-context' dispatched by webhook-processor
     *          after V3ProductionRunner creates a new recompra session.
     *
     * Responsibility:
     * - Call crm-reader agent with fixed D-08 prompt template.
     * - Merge result.text into session_state.datos_capturados under `_v3:crm_context`.
     * - Write marker `_v3:crm_context_status` = 'ok' | 'empty' | 'error' for poll consumer.
     *
     * Idempotent: early-return if status marker already present (D-15).
     * Feature flag: platform_config['somnio_recompra_crm_reader_enabled'] (default false, Regla 6).
     * Timeout: 12s inner AbortController (Pitfall 5).
     * Observability: follows step.run __obs merge pattern (Phase 42.1 Plan 07 canon).
     */

    import { inngest } from '../client'
    import { createModuleLogger } from '@/lib/audit/logger'
    import {
      isObservabilityEnabled,
      ObservabilityCollector,
      runWithCollector,
    } from '@/lib/observability'

    const logger = createModuleLogger('recompra-preload-context')

    const READER_TIMEOUT_MS = 12_000
    const FEATURE_FLAG_KEY = 'somnio_recompra_crm_reader_enabled'

    /**
     * Fixed prompt template (CONTEXT.md D-08 — verbatim, do NOT modify).
     * The reader's system prompt is locked internally; this is the only user-turn message.
     */
    function buildReaderPrompt(contactId: string): string {
      return `Prepara contexto de recompra para el contacto ${contactId} del workspace actual.
    Devuelve un parrafo coherente en espanol con:
    1) Ultimo pedido entregado: items comprados (nombre + cantidad) y fecha de entrega.
    2) Tags activos del contacto.
    3) Numero total de pedidos del contacto.
    4) Direccion y ciudad mas recientes confirmadas.
    Si algun dato no existe, indicalo literalmente (no inventes).
    Formato plano, sin listas markdown — va a ser inyectado en otro prompt de bot.`
    }

    export const recompraPreloadContext = inngest.createFunction(
      {
        id: 'recompra-preload-context',
        name: 'Recompra: Preload CRM Context via Reader',
        retries: 1,
        concurrency: [{ key: 'event.data.sessionId', limit: 1 }],
      },
      { event: 'recompra/preload-context' },
      async ({ event, step }) => {
        const { sessionId, contactId, workspaceId, invoker } = event.data

        // ---- Feature flag (defense-in-depth; webhook-processor also checks, Plan 04) ----
        const { getPlatformConfig } = await import('@/lib/domain/platform-config')
        const enabled = await getPlatformConfig<boolean>(FEATURE_FLAG_KEY, false)
        if (!enabled) {
          logger.info(
            { sessionId, contactId, workspaceId },
            'feature flag off, skipping reader preload',
          )
          return { status: 'skipped' as const, reason: 'feature_flag_off' as const }
        }

        // ---- Idempotency (D-15, Open Q 6) — short-circuit if already processed ----
        const { SessionManager } = await import('@/lib/agents/session-manager')
        const sm = new SessionManager()
        try {
          const existingState = await sm.getState(sessionId)
          const existingStatus = existingState.datos_capturados?.['_v3:crm_context_status']
          if (
            existingStatus === 'ok' ||
            existingStatus === 'empty' ||
            existingStatus === 'error'
          ) {
            logger.info(
              { sessionId, existingStatus },
              'crm_context_status already present, short-circuit (idempotent)',
            )
            return {
              status: 'skipped' as const,
              reason: 'already_processed' as const,
              existingStatus,
            }
          }
        } catch (getStateErr) {
          // If session not found (race with session create), proceed — the reader will attempt write
          // which may or may not persist. Log and continue (fail-open to not block preload).
          logger.warn(
            { sessionId, err: getStateErr instanceof Error ? getStateErr.message : String(getStateErr) },
            'could not pre-fetch session state, proceeding to call reader',
          )
        }

        // ---- Observability setup (outer collector for cross-step aggregation) ----
        const collector = isObservabilityEnabled()
          ? new ObservabilityCollector({
              conversationId: `recompra-preload-${sessionId}`,
              workspaceId,
              agentId: 'crm-reader',
              turnStartedAt: new Date(),
              triggerKind: 'system_event',
            })
          : null

        // ---- Call reader + persist (wrapped in step.run for replay safety) ----
        const stepResult = await step.run('call-reader-and-persist', async () => {
          const stepCollector = collector
            ? new ObservabilityCollector({
                conversationId: collector.conversationId,
                workspaceId,
                agentId: 'crm-reader',
                turnStartedAt: collector.turnStartedAt,
                triggerKind: 'system_event',
              })
            : null

          const run = async () => {
            const startedAt = Date.now()
            const { processReaderMessage } = await import('@/lib/agents/crm-reader')

            // Inner 12s timeout via AbortController (Pitfall 5)
            const abortController = new AbortController()
            const timeoutHandle = setTimeout(() => abortController.abort(), READER_TIMEOUT_MS)

            try {
              const reader = await processReaderMessage({
                workspaceId,
                invoker,
                messages: [{ role: 'user', content: buildReaderPrompt(contactId) }],
                abortSignal: abortController.signal,
              })
              const durationMs = Date.now() - startedAt
              const text = reader.text?.trim() ?? ''
              const status: 'ok' | 'empty' = text.length > 0 ? 'ok' : 'empty'

              // Merge-safe write (Pitfall 2) — SessionManager.updateCapturedData does get-then-merge.
              const smInner = new SessionManager()
              await smInner.updateCapturedData(sessionId, {
                '_v3:crm_context': text,
                '_v3:crm_context_status': status,
              })

              return {
                status,
                durationMs,
                textLength: text.length,
                toolCallCount: reader.toolCalls?.length ?? 0,
                steps: reader.steps,
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              const durationMs = Date.now() - startedAt
              logger.error(
                { err: msg, sessionId, contactId, durationMs },
                'reader call failed, writing error marker',
              )

              // Pitfall 4 — ALWAYS write error marker before returning/throwing,
              // so the poll consumer can stop waiting immediately.
              try {
                const smInner = new SessionManager()
                await smInner.updateCapturedData(sessionId, {
                  '_v3:crm_context': '',
                  '_v3:crm_context_status': 'error',
                })
              } catch (writeErr) {
                logger.error(
                  {
                    sessionId,
                    err: writeErr instanceof Error ? writeErr.message : String(writeErr),
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

        const result = stepResult.readerResult

        // ---- Observability merge (__obs survives step.run replays) ----
        if (collector && stepResult.__obs) {
          collector.mergeFrom(stepResult.__obs)
        }

        // ---- D-16 observability events (emitted in outer scope, NOT inside step.run) ----
        if (result.status === 'ok' || result.status === 'empty') {
          collector?.recordEvent('pipeline_decision', 'crm_reader_completed', {
            agent: 'somnio-recompra-v1',
            sessionId,
            contactId,
            durationMs: result.durationMs,
            toolCallCount: 'toolCallCount' in result ? result.toolCallCount : 0,
            steps: 'steps' in result ? result.steps : 0,
            textLength: 'textLength' in result ? result.textLength : 0,
            status: result.status,
          })
        } else {
          collector?.recordEvent('pipeline_decision', 'crm_reader_failed', {
            agent: 'somnio-recompra-v1',
            sessionId,
            contactId,
            durationMs: result.durationMs,
            error: 'error' in result ? result.error : 'unknown',
          })
        }

        // ---- Flush collector as last step (Phase 42.1 Plan 07 pattern) ----
        if (collector) {
          await step.run('observability-flush', async () => {
            await collector.flush()
          })
        }

        return result
      },
    )

    /**
     * Array export — mirrors agentProductionFunctions, godentistReminderFunctions, etc.
     * Allows route.ts to spread without care for single-vs-multi function shape.
     */
    export const recompraPreloadContextFunctions = [recompraPreloadContext]
    ```

    NOTAS CRITICAS:
    - NO inventes otros eventos de observability. Los 2 que emite esta function son `crm_reader_completed` y `crm_reader_failed` (D-16 dos de cinco). `crm_reader_dispatched` lo emite webhook-processor (Plan 04). `crm_context_used` y `crm_context_missing_after_wait` los emite el agent (Plan 05).
    - NO uses `adapters.storage.saveState(sessionId, { datos_capturados: {...} })` — eso es full-replace (Pitfall 2). SIEMPRE `SessionManager.updateCapturedData` helper.
    - El `buildReaderPrompt` DEBE ser verbatim de D-08. NO parafrasear, NO reformatear — el comprehension de Plan 05 + los tests asumen ese texto exacto.
    - Los dynamic imports (`await import('@/lib/...')`) son intencionales (RESEARCH §Shared Patterns — dynamic imports para circular deps y cold start).
    - En el catch del reader, el error marker se escribe en un nested try/catch — si tambien ese falla, se loggea pero NO se throwa (ultimo recurso). El return del run() siempre retorna status='error'.
    - NO agregar `retries: 2` ni cambiar `retries: 1` — decision lockeada (RESEARCH bullet 6).
    - NO cambiar `concurrency: [{ key: 'event.data.sessionId', limit: 1 }]` — dedupe es D-15 + Open Q 6.
  </action>
  <verify>
    <automated>test -f src/inngest/functions/recompra-preload-context.ts</automated>
    <automated>grep -q "id: 'recompra-preload-context'" src/inngest/functions/recompra-preload-context.ts</automated>
    <automated>grep -q "retries: 1" src/inngest/functions/recompra-preload-context.ts</automated>
    <automated>grep -q "concurrency: \[{ key: 'event.data.sessionId', limit: 1 }\]" src/inngest/functions/recompra-preload-context.ts</automated>
    <automated>grep -q "event: 'recompra/preload-context'" src/inngest/functions/recompra-preload-context.ts</automated>
    <automated>grep -q "somnio_recompra_crm_reader_enabled" src/inngest/functions/recompra-preload-context.ts</automated>
    <automated>grep -q "READER_TIMEOUT_MS = 12_000" src/inngest/functions/recompra-preload-context.ts</automated>
    <automated>grep -q "updateCapturedData" src/inngest/functions/recompra-preload-context.ts</automated>
    <automated>grep -q "_v3:crm_context_status" src/inngest/functions/recompra-preload-context.ts</automated>
    <automated>grep -q "AbortController" src/inngest/functions/recompra-preload-context.ts</automated>
    <automated>grep -q "crm_reader_completed" src/inngest/functions/recompra-preload-context.ts</automated>
    <automated>grep -q "crm_reader_failed" src/inngest/functions/recompra-preload-context.ts</automated>
    <automated>grep -q "already_processed" src/inngest/functions/recompra-preload-context.ts</automated>
    <automated>grep -q "feature_flag_off" src/inngest/functions/recompra-preload-context.ts</automated>
    <automated>grep -q "mergeFrom(stepResult.__obs)" src/inngest/functions/recompra-preload-context.ts</automated>
    <automated>grep -q "observability-flush" src/inngest/functions/recompra-preload-context.ts</automated>
    <automated>grep -q "export const recompraPreloadContextFunctions" src/inngest/functions/recompra-preload-context.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | tee /tmp/tsc-p03t1.log; ! grep -E "src/inngest/functions/recompra-preload-context" /tmp/tsc-p03t1.log | grep "error TS" || echo "no new tsc errors"</automated>
  </verify>
  <acceptance_criteria>
    - Archivo `src/inngest/functions/recompra-preload-context.ts` existe con >=150 lineas.
    - Function config exacto: `id='recompra-preload-context'`, `retries: 1`, `concurrency: [{ key: 'event.data.sessionId', limit: 1 }]`, trigger `{ event: 'recompra/preload-context' }`.
    - Feature flag check literal `getPlatformConfig<boolean>('somnio_recompra_crm_reader_enabled', false)` antes de cualquier trabajo.
    - Idempotency check via `SessionManager.getState(sessionId)` + check de `existingStatus in ['ok','empty','error']`.
    - `processReaderMessage` invocado con `abortSignal: abortController.signal` donde `abortController` tiene timeout 12000ms.
    - Persistencia via `SessionManager.updateCapturedData(sessionId, { '_v3:crm_context': text, '_v3:crm_context_status': status })`.
    - Path `status='ok'` cuando `text.length > 0`, `'empty'` cuando `text=''`, `'error'` en catch.
    - Error marker escrito en nested try/catch antes del return con `status='error'` (Pitfall 4).
    - Observability: outer `collector` + inner `stepCollector` + `__obs` return + `mergeFrom` + final `observability-flush` step.
    - Eventos emitidos: `pipeline_decision:crm_reader_completed` (status ok|empty) O `pipeline_decision:crm_reader_failed` (status error) con metrics correctos.
    - `recompraPreloadContextFunctions = [recompraPreloadContext]` exportado.
    - `npx tsc --noEmit` sin errores nuevos asociados al archivo.
    - `buildReaderPrompt` contiene exactamente el texto D-08 (4 items numerados, "espanol" sin tilde, "parrafo coherente", "sin listas markdown").
  </acceptance_criteria>
  <done>
    - Commit atomico con mensaje `feat(somnio-recompra-crm-reader): add Inngest function recompra-preload-context with reader + merge-safe persist + observability merge`.
    - Sin push a Vercel todavia (push sigue Plan 04 que es el dispatch; antes de Plan 04 la function existe pero nadie le envia eventos).
  </done>
</task>

<task type="auto">
  <name>Task 2: Registrar function en route.ts + crear unit test</name>
  <read_first>
    - src/app/api/inngest/route.ts (entero — 70 lineas)
    - src/__tests__/integration/crm-bots/reader.test.ts (patron de test — vitest setup + mocking)
    - .planning/standalone/somnio-recompra-crm-reader/PATTERNS.md §Wave 2 — route registration + test skeleton
    - src/inngest/functions/recompra-preload-context.ts (creado en Task 1 — para extract del export a testear)
  </read_first>
  <action>
    **Edit 1 — `src/app/api/inngest/route.ts`:**

    Agregar import (mantener orden alfabetico cerca del agrupamiento existente):

    ```typescript
    import { recompraPreloadContextFunctions } from '@/inngest/functions/recompra-preload-context'
    ```

    Agregar spread al array de `functions` en `serve({...})`. Ubicar cerca del final junto a otros spreads (el orden del array NO importa a Inngest, pero por consistencia con el patron del archivo, agregar DESPUES de `...mobilePushFunctions` y ANTES de los single-exports como `taskOverdueCron`):

    ```typescript
    functions: [
      ...agentTimerFunctions,
      ...agentProductionFunctions,
      ...automationFunctions,
      ...robotOrchestratorFunctions,
      ...godentistReminderFunctions,
      ...v3TimerFunctions,
      ...smsDeliveryFunctions,
      ...mobilePushFunctions,
      ...recompraPreloadContextFunctions,   // ★ NEW
      taskOverdueCron,
      closeStaleSessionsCron,
      observabilityPurgeCron,
      enviaStatusPollingCron,
      crmBotExpireProposalsCron,
    ],
    ```

    Tambien agregar entrada al bloque JSDoc de "Functions served" (el bloque de comentario antes de `serve()`):

    ```
    - recompra-preload-context: Triggered by 'recompra/preload-context' event after webhook-processor creates a new recompra session; calls crm-reader via AI SDK, persists `_v3:crm_context` into session_state (Standalone: somnio-recompra-crm-reader)
    ```

    **Edit 2 — Crear `src/inngest/functions/__tests__/recompra-preload-context.test.ts`:**

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest'

    // Mocks — define ANTES de import del modulo bajo test (vi.mock hoisting).
    const mockProcessReaderMessage = vi.fn()
    const mockUpdateCapturedData = vi.fn()
    const mockGetState = vi.fn()
    const mockGetPlatformConfig = vi.fn()

    vi.mock('@/lib/agents/crm-reader', () => ({
      processReaderMessage: mockProcessReaderMessage,
    }))

    vi.mock('@/lib/agents/session-manager', () => ({
      SessionManager: vi.fn().mockImplementation(() => ({
        updateCapturedData: mockUpdateCapturedData,
        getState: mockGetState,
      })),
    }))

    vi.mock('@/lib/domain/platform-config', () => ({
      getPlatformConfig: mockGetPlatformConfig,
    }))

    vi.mock('@/lib/observability', () => ({
      isObservabilityEnabled: () => false,
      ObservabilityCollector: vi.fn(),
      runWithCollector: vi.fn(),
    }))

    // Minimal inngest mock — we test the handler body, NOT the createFunction wiring.
    vi.mock('../../client', () => ({
      inngest: {
        createFunction: (config: unknown, _trigger: unknown, handler: unknown) => ({
          config,
          handler,
        }),
      },
    }))

    const mockStepRun = vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn())
    const mockStep = { run: mockStepRun }

    const baseEvent = {
      data: {
        sessionId: 'session-123',
        contactId: 'contact-456',
        workspaceId: 'workspace-789',
        invoker: 'somnio-recompra-v1' as const,
      },
    }

    // Import AFTER mocks.
    let recompraPreloadContext: { config: unknown; handler: (arg: { event: typeof baseEvent; step: typeof mockStep }) => Promise<unknown> }

    beforeEach(async () => {
      vi.clearAllMocks()
      mockStepRun.mockImplementation(async (_name, fn) => fn())
      const mod = await import('../recompra-preload-context')
      recompraPreloadContext = mod.recompraPreloadContext as unknown as typeof recompraPreloadContext
    })

    describe('recompra-preload-context Inngest function', () => {
      it('short-circuits with skipped/feature_flag_off when platform_config=false', async () => {
        mockGetPlatformConfig.mockResolvedValue(false)

        const result = await recompraPreloadContext.handler({ event: baseEvent, step: mockStep })

        expect(result).toEqual({ status: 'skipped', reason: 'feature_flag_off' })
        expect(mockProcessReaderMessage).not.toHaveBeenCalled()
        expect(mockUpdateCapturedData).not.toHaveBeenCalled()
      })

      it('short-circuits with skipped/already_processed when _v3:crm_context_status already present (D-15)', async () => {
        mockGetPlatformConfig.mockResolvedValue(true)
        mockGetState.mockResolvedValue({
          datos_capturados: { '_v3:crm_context_status': 'ok', '_v3:crm_context': 'prev' },
        })

        const result = await recompraPreloadContext.handler({ event: baseEvent, step: mockStep })

        expect(result).toMatchObject({ status: 'skipped', reason: 'already_processed' })
        expect(mockProcessReaderMessage).not.toHaveBeenCalled()
        expect(mockUpdateCapturedData).not.toHaveBeenCalled()
      })

      it('calls reader and writes status=ok on success', async () => {
        mockGetPlatformConfig.mockResolvedValue(true)
        mockGetState.mockResolvedValue({ datos_capturados: {} })
        mockProcessReaderMessage.mockResolvedValue({
          text: 'Ultimo pedido: 2x Somnio entregado 2026-04-10. Tags: VIP. 3 pedidos total. Direccion: Cra 10 #20-30, Bogota.',
          toolCalls: [{ name: 'contacts_get' }, { name: 'orders_list' }, { name: 'tags_list' }],
          steps: 3,
          agentId: 'crm-reader',
        })

        const result = await recompraPreloadContext.handler({ event: baseEvent, step: mockStep })

        expect(mockProcessReaderMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            workspaceId: 'workspace-789',
            invoker: 'somnio-recompra-v1',
            messages: [
              expect.objectContaining({
                role: 'user',
                content: expect.stringContaining('Prepara contexto de recompra para el contacto contact-456'),
              }),
            ],
            abortSignal: expect.any(AbortSignal),
          }),
        )
        expect(mockUpdateCapturedData).toHaveBeenCalledWith(
          'session-123',
          expect.objectContaining({
            '_v3:crm_context': expect.stringContaining('Ultimo pedido'),
            '_v3:crm_context_status': 'ok',
          }),
        )
        expect(result).toMatchObject({ status: 'ok' })
      })

      it('writes status=empty when reader returns empty text', async () => {
        mockGetPlatformConfig.mockResolvedValue(true)
        mockGetState.mockResolvedValue({ datos_capturados: {} })
        mockProcessReaderMessage.mockResolvedValue({
          text: '',
          toolCalls: [],
          steps: 1,
          agentId: 'crm-reader',
        })

        const result = await recompraPreloadContext.handler({ event: baseEvent, step: mockStep })

        expect(mockUpdateCapturedData).toHaveBeenCalledWith(
          'session-123',
          expect.objectContaining({ '_v3:crm_context_status': 'empty', '_v3:crm_context': '' }),
        )
        expect(result).toMatchObject({ status: 'empty' })
      })

      it('writes status=error marker BEFORE returning when reader throws (Pitfall 4)', async () => {
        mockGetPlatformConfig.mockResolvedValue(true)
        mockGetState.mockResolvedValue({ datos_capturados: {} })
        mockProcessReaderMessage.mockRejectedValue(new Error('Anthropic 5xx upstream'))

        const result = await recompraPreloadContext.handler({ event: baseEvent, step: mockStep })

        expect(mockUpdateCapturedData).toHaveBeenCalledWith(
          'session-123',
          expect.objectContaining({ '_v3:crm_context_status': 'error', '_v3:crm_context': '' }),
        )
        expect(result).toMatchObject({ status: 'error' })
        expect((result as { error?: string }).error).toContain('Anthropic 5xx')
      })
    })
    ```

    Correr el test:
    ```bash
    npm run test -- src/inngest/functions/__tests__/recompra-preload-context.test.ts
    ```

    Expected: 5 tests PASS.

    NOTAS CRITICAS:
    - El test mockea `createFunction` para extraer el `handler` y testearlo directo — esto NO prueba el Inngest runtime, pero SI la logica de control de flujo (que es lo que nos importa).
    - Los 5 tests cubren: flag off, idempotency, success ok, success empty, failure error — las 5 ramas principales de control.
    - NO importar el archivo test no existente fuera de los mocks.
    - `mockStepRun.mockImplementation(async (_name, fn) => fn())` ejecuta el callback inline — simula step.run sin replays, suficiente para unit test.
  </action>
  <verify>
    <automated>grep -q "recompraPreloadContextFunctions" src/app/api/inngest/route.ts</automated>
    <automated>grep -q "import { recompraPreloadContextFunctions }" src/app/api/inngest/route.ts</automated>
    <automated>grep -q "\\.\\.\\.recompraPreloadContextFunctions" src/app/api/inngest/route.ts</automated>
    <automated>test -f src/inngest/functions/__tests__/recompra-preload-context.test.ts</automated>
    <automated>npm run test -- src/inngest/functions/__tests__/recompra-preload-context.test.ts 2>&1 | tee /tmp/test-p03t2.log; grep -qE "(Tests\\s+5 passed|passed, 0 failed|5/5 passed)" /tmp/test-p03t2.log || grep -q "5 passed" /tmp/test-p03t2.log</automated>
    <automated>npx tsc --noEmit 2>&1 | tee /tmp/tsc-p03t2.log; ! grep -E "src/app/api/inngest/route|src/inngest/functions/__tests__/recompra-preload" /tmp/tsc-p03t2.log | grep "error TS" || echo "no new tsc errors"</automated>
  </verify>
  <acceptance_criteria>
    - `src/app/api/inngest/route.ts` tiene el import `recompraPreloadContextFunctions` y el spread en el array de `functions` de `serve()`.
    - JSDoc del bloque "Functions served" menciona `recompra-preload-context`.
    - `src/inngest/functions/__tests__/recompra-preload-context.test.ts` existe y tiene >=5 `it(...)` tests.
    - Los 5 tests cubren: feature flag off / idempotency skipped / reader success ok / reader success empty / reader throws error.
    - `npm run test -- src/inngest/functions/__tests__/recompra-preload-context.test.ts` ejecuta los 5 y TODOS pasan.
    - El test del error-path verifica que `updateCapturedData` fue llamado con `status='error'` ANTES de que el handler retorne (Pitfall 4).
    - `npx tsc --noEmit` clean sobre los archivos nuevos/modificados.
  </acceptance_criteria>
  <done>
    - Commit atomico con mensaje `feat(somnio-recompra-crm-reader): register recompra-preload-context Inngest function + unit test`.
    - Push a Vercel deferido hasta Plan 04 (dispatch) para pushear wave 2+3 juntos si posible — pero OK tambien aislado ya que esta function solo corre cuando recibe eventos (nadie la despacha aun).
  </done>
</task>

</tasks>

<verification>
- `src/inngest/functions/recompra-preload-context.ts` existe con toda la logica (feature flag, idempotency, reader call con abortSignal 12s, merge-safe persist, error marker, observability merge pattern, 2 eventos D-16).
- `src/app/api/inngest/route.ts` registra la function via spread.
- Unit test pasa 5/5.
- TypeScript clean en todos los archivos nuevos.
- `buildReaderPrompt` contiene el texto D-08 verbatim.
- Marker values literales: `'ok' | 'empty' | 'error'` consistentes en test + implementacion.
- Feature flag key literal: `'somnio_recompra_crm_reader_enabled'` match Plan 01 migration.
- Event name literal: `'recompra/preload-context'` match Plan 02 schema.
</verification>

<success_criteria>
- Inngest Cloud detecta y registra la nueva function al siguiente sync (post-deploy de Plan 04).
- Al recibir un event `recompra/preload-context`, la function:
  1. Retorna `skipped/feature_flag_off` si flag=false (cero side effects).
  2. Retorna `skipped/already_processed` si reimport (idempotente).
  3. Llama al reader con timeout 12s + escribe resultado merge-safe al session state.
  4. En caso de error del reader, escribe marker `status='error'` antes de responder.
  5. Emite observability events correctos + flush via outer collector.
- Plan 04 puede despachar eventos a esta function con type safety (gracias a Plan 02).
- Plan 05 puede leer el marker `_v3:crm_context_status` con confianza (fue escrito aqui).
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-recompra-crm-reader/03-SUMMARY.md` documenting:
- Commit hashes de Task 1 + Task 2
- Lineas de codigo del nuevo archivo (~>=150)
- Output de `npm run test -- .../__tests__/recompra-preload-context.test.ts` (5/5 passed copiado verbatim)
- Checklist: 9 pitfalls mapeados a secciones del codigo (con numeros de linea del archivo creado post-ejecucion)
- Decisiones locked aplicadas: event name literal, flag key literal, timeout=12000, retries=1, concurrency key=sessionId/limit=1, marker status values
- Notas de si hubo alguna sub-desviacion (ej. si `isObservabilityEnabled()` no estaba importable y se uso workaround)
</output>

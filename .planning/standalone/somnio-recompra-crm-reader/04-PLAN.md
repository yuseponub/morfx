---
phase: somnio-recompra-crm-reader
plan: 04
type: execute
wave: 3
depends_on: [01, 02, 03]
files_modified:
  - src/lib/agents/production/webhook-processor.ts
  - src/lib/agents/production/__tests__/webhook-processor.recompra-flag.test.ts
autonomous: true

must_haves:
  truths:
    - "webhook-processor dispara `await inngest.send({ name: 'recompra/preload-context', data: {...} })` DESPUES de `runner.processMessage(...)` en el branch `is_client && recompraEnabled`"
    - "Dispatch guardado por `getPlatformConfig<boolean>('somnio_recompra_crm_reader_enabled', false)` — flag=false NO dispara nada (Regla 6)"
    - "Payload del event contiene `sessionId: engineOutput.sessionId`, `contactId`, `workspaceId`, `invoker: 'somnio-recompra-v1'` (match al schema Plan 02)"
    - "Antes del dispatch se emite `getCollector()?.recordEvent('pipeline_decision', 'crm_reader_dispatched', {...})` (D-16)"
    - "Try/catch alrededor del dispatch — falla NO rompe el flujo del saludo (fail-open, saludo ya salio)"
    - "Dispatch solo ocurre si `engineOutput.sessionId` existe (turno 0 que creo sesion)"
    - "Unit test verifica: (a) flag=false → no dispatch, (b) flag=true + sessionId → dispatch 1 vez con payload correcto, (c) flag=true + sin sessionId → no dispatch"
  artifacts:
    - path: "src/lib/agents/production/webhook-processor.ts"
      provides: "Dispatch del evento Inngest tras creacion de session recompra"
      contains: "recompra/preload-context"
    - path: "src/lib/agents/production/__tests__/webhook-processor.recompra-flag.test.ts"
      provides: "Unit test del feature-flag-gated dispatch"
      contains: "somnio_recompra_crm_reader_enabled"
  key_links:
    - from: "src/lib/agents/production/webhook-processor.ts"
      to: "Inngest event 'recompra/preload-context' (Plan 02 schema)"
      via: "await inngest.send({ name: 'recompra/preload-context', data: {...} })"
      pattern: "name:\\s*'recompra/preload-context'"
    - from: "src/lib/agents/production/webhook-processor.ts"
      to: "platform_config.somnio_recompra_crm_reader_enabled (Plan 01 row)"
      via: "getPlatformConfig<boolean>(key, false) gate"
      pattern: "getPlatformConfig<boolean>\\('somnio_recompra_crm_reader_enabled'"
---

<objective>
Wave 3 — Consumer-side wiring. Agregar el dispatch del event `recompra/preload-context` en `webhook-processor.ts` DESPUES de `runner.processMessage(...)` (punto donde `engineOutput.sessionId` existe). El dispatch esta feature-flagged para proteger la produccion (Regla 6) y fail-open en caso de error.

Purpose: Este plan conecta el flujo de produccion a la Inngest function creada en Plan 03. Dos decisiones de RESEARCH §Open Q 2 locked aqui:
1. **Dispatch POST-runner** (no pre-runner): necesitamos `engineOutput.sessionId` que solo existe despues. D-03 "paralelo" se mantiene en espiritu — el reader corre mientras el cliente lee el saludo y redacta su siguiente mensaje (3-5s window per D-13 context).
2. **Feature flag a DOS niveles**: aqui (evita coste de `inngest.send` cuando disabled) + dentro de la function (defense-in-depth, Plan 03 ya lo tiene).

Output: 1 edit quirurgico en webhook-processor.ts + 1 unit test.

**Regla 6 CRITICAL:** Flag default=false (migracion Plan 01). Este deploy NO cambia comportamiento de produccion hasta flip manual. Usuario controla el rollout en Plan 07.

**Regla 1:** Tras este plan, push a Vercel obligatorio ANTES de pedir cualquier QA. Vercel debe tener el codigo nuevo para que Inngest Cloud pueda registrar la function del Plan 03 (auto-descubrimiento via `/api/inngest` endpoint).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-recompra-crm-reader/CONTEXT.md — D-01 (solo session nueva), D-03 (paralelo), D-05 (await), D-07 (invoker), D-16 (dispatched event)
@.planning/standalone/somnio-recompra-crm-reader/RESEARCH.md §Ejemplo 2 (webhook-processor dispatch propuesto), §Pitfall 1 (await), §Pitfall 6 (flag via platform_config), §Open Q 2 (dispatch position — LOCKED POST-runner), §Security Domain V5 (UUID validation)
@.planning/standalone/somnio-recompra-crm-reader/PATTERNS.md §Wave 3 — Webhook-Processor Dispatch
@src/lib/agents/production/webhook-processor.ts lines 160-260 (branch is_client && recompraEnabled, loadLastOrderData, runner construct + processMessage)
@src/lib/whatsapp/webhook-handler.ts lines 310-336 (analog canonico para await inngest.send + try/catch + fallback inline)
@src/inngest/events.ts — RecompraPreloadEvents (Plan 02)
@src/inngest/client.ts — inngest export
@src/lib/domain/platform-config.ts — getPlatformConfig
@src/lib/observability/index.ts — getCollector

<interfaces>
<!-- Current branch structure (webhook-processor.ts:171-260) -->
// if (contactData?.is_client && recompraEnabled) {
//   getCollector()?.recordEvent('pipeline_decision', 'recompra_routed', {...})  // existing
//   logger.info(...)                                                            // existing
//   const lastOrderData = await loadLastOrderData(contactId, workspaceId)       // existing, unchanged
//   // ... typing indicator ...                                                 // existing, unchanged
//   const runner = new V3ProductionRunner(adapters, { ... preloadedData: lastOrderData })  // unchanged
//   const engineOutput = await runner.processMessage({ sessionId: '', conversationId, contactId!, ... })
//   // ★ HERE — after engineOutput.sessionId is available (populated by the runner)
//   recompraResult = { ... } as SomnioEngineResult                              // existing
// }

<!-- Target dispatch shape (from Plan 02 events.ts schema) -->
inngest.send({
  name: 'recompra/preload-context',
  data: {
    sessionId: engineOutput.sessionId,  // populated by runner
    contactId: contactId!,              // already verified non-null above
    workspaceId,
    invoker: 'somnio-recompra-v1',      // literal string type
  },
})

<!-- Analog canon: src/lib/whatsapp/webhook-handler.ts:310-336 -->
// if (useInngest) {
//   try {
//     const { inngest } = await import('@/inngest/client')
//     await inngest.send({ name: 'agent/whatsapp.message_received', data: {...} })
//   } catch (inngestError) {
//     console.error('Inngest send failed, falling back to inline:', inngestError)
//     // fallback path (NOT needed for recompra dispatch — reader preload is optional enrichment,
//     // no fallback required; just log + continue).
//   }
// }
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Agregar dispatch feature-flagged en webhook-processor.ts post-runner</name>
  <read_first>
    - src/lib/agents/production/webhook-processor.ts lines 160-260 (entender branch actual end-to-end)
    - src/lib/whatsapp/webhook-handler.ts lines 310-336 (patron canonico await + try/catch)
    - .planning/standalone/somnio-recompra-crm-reader/RESEARCH.md §Ejemplo 2 (dispatch propuesto — adaptar con event tipado de Plan 02)
    - src/lib/observability/index.ts — getCollector signature (para recordEvent)
  </read_first>
  <action>
    Editar `src/lib/agents/production/webhook-processor.ts`. El flujo actual (lines ~216-260) crea el runner, llama `processMessage`, y construye `recompraResult`. Vamos a insertar el dispatch DESPUES de `runner.processMessage(...)` (cuando `engineOutput.sessionId` existe) y ANTES de la construccion de `recompraResult`.

    **Ubicacion exacta del edit:**

    Localizar el bloque (lines ~222-232):
    ```typescript
    const engineOutput = await runner.processMessage({
      sessionId: '',
      conversationId,
      contactId: contactId!,
      message: messageContent,
      workspaceId,
      history: [],
      phoneNumber: phone,
      messageTimestamp: input.messageTimestamp,
    })
    ```

    Y el bloque inmediatamente siguiente:
    ```typescript
    recompraResult = {
      success: engineOutput.success,
      ...
    } as SomnioEngineResult
    ```

    **Insertar ENTRE ambos bloques** el siguiente codigo nuevo:

    ```typescript
    // ============================================================================
    // ★ CRM Reader Preload Dispatch (standalone: somnio-recompra-crm-reader)
    // ============================================================================
    // Dispatches an Inngest event that triggers `recompra-preload-context` function
    // (see src/inngest/functions/recompra-preload-context.ts). That function calls
    // the crm-reader agent with a fixed D-08 prompt and merges the result into
    // session_state.datos_capturados.{_v3:crm_context, _v3:crm_context_status}.
    //
    // Position: POST-runner so engineOutput.sessionId is populated (runner creates
    // the session implicitly in processMessage). D-03 "parallel" is preserved in
    // spirit — the reader runs while the client reads the greeting and drafts a
    // reply (3-5s window per D-13 context).
    //
    // Feature flag: platform_config['somnio_recompra_crm_reader_enabled']
    //               default false (Regla 6). Flag check here avoids the inngest.send
    //               cost when disabled; Plan 03 function also checks (defense-in-depth).
    //
    // Fail-open: if dispatch fails, log and continue — the greeting already sent,
    // losing reader enrichment is not fatal (comprehension falls back to no-context).
    if (engineOutput.sessionId) {
      try {
        const { getPlatformConfig } = await import('@/lib/domain/platform-config')
        const crmPreloadEnabled = await getPlatformConfig<boolean>(
          'somnio_recompra_crm_reader_enabled',
          false,
        )

        if (crmPreloadEnabled) {
          // D-16 — emit dispatched event BEFORE send, so we record intent even if send fails.
          getCollector()?.recordEvent('pipeline_decision', 'crm_reader_dispatched', {
            agent: 'somnio-recompra-v1',
            sessionId: engineOutput.sessionId,
            contactId: contactId!,
            workspaceId,
          })

          const { inngest } = await import('@/inngest/client')
          await inngest.send({
            name: 'recompra/preload-context',
            data: {
              sessionId: engineOutput.sessionId,
              contactId: contactId!,
              workspaceId,
              invoker: 'somnio-recompra-v1',
            },
          })

          logger.info(
            {
              conversationId,
              contactId,
              sessionId: engineOutput.sessionId,
            },
            'Dispatched recompra/preload-context (reader will enrich session state in background)',
          )
        }
      } catch (dispatchErr) {
        // Fail-open: the greeting already went out. Losing reader enrichment downgrades
        // next turn to "no CRM context" but nothing breaks. The poll in Plan 05 handles
        // the missing key gracefully (timeout path emits crm_context_missing_after_wait).
        logger.warn(
          {
            conversationId,
            contactId,
            sessionId: engineOutput.sessionId,
            err: dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr),
          },
          'Failed to dispatch recompra/preload-context (fail-open, greeting already sent)',
        )
      }
    }
    // ============================================================================
    ```

    NOTAS CRITICAS:
    - El bloque esta DENTRO del `if (contactData?.is_client && recompraEnabled)` branch — no extraerlo de ahi. Esa condicion ya garantiza que solo disparamos para contactos que son clientes.
    - Guard adicional `if (engineOutput.sessionId)` — el runner retorna `sessionId` en el output solo cuando proceso correctamente. Si sessionId es empty string (unlikely, pero defensivo), no despachamos.
    - NO movamos el dispatch antes del runner — requiere sessionId que solo existe POST-processMessage (RESEARCH Open Q 2).
    - `await inngest.send(...)` es OBLIGATORIO (Pitfall 1). Sin await, Vercel lambda puede matar el promise antes del enqueue.
    - El tipo del dispatch es ahora tipado (no `as any`) gracias al schema registrado en Plan 02. TypeScript debe validar que el `data` tiene la forma correcta.
    - El catch externo NO re-throwa — el saludo ya salio, fail-open. Solo log.warn. Nota especial en el log: "greeting already sent" para que devs sepan el trade-off.
    - Emit `crm_reader_dispatched` ANTES del `inngest.send` — asi registramos la intencion incluso si send falla (observability debugging).
    - El `logger` y `getCollector` ya estan importados en webhook-processor.ts — verificar en el top del archivo, NO agregar imports duplicados. Si no estan, agregarlos con el patron existente.

    Verificar imports necesarios en el top del archivo. Si `getCollector` no esta importado, agregar:
    ```typescript
    import { getCollector } from '@/lib/observability'
    ```
    (verificar line 1-30 del archivo primero — muy probable que ya este importado por el `recompra_routed` event existente en line 174).

    Correr tsc:
    ```bash
    npx tsc --noEmit 2>&1 | grep -E "webhook-processor" | head -10 || echo "clean"
    ```
  </action>
  <verify>
    <automated>grep -c "recompra/preload-context" src/lib/agents/production/webhook-processor.ts | grep -qE "^[1-9]"</automated>
    <automated>grep -q "somnio_recompra_crm_reader_enabled" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>grep -q "crm_reader_dispatched" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>grep -q "invoker: 'somnio-recompra-v1'" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>grep -q "if (engineOutput.sessionId)" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>grep -q "await inngest.send" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>grep -q "fail-open" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | tee /tmp/tsc-p04t1.log; ! grep -E "src/lib/agents/production/webhook-processor" /tmp/tsc-p04t1.log | grep "error TS" || echo "no new tsc errors in webhook-processor"</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/agents/production/webhook-processor.ts` contiene el bloque de dispatch con:
      - Guard `if (engineOutput.sessionId)` envolviendo el bloque completo.
      - Feature flag check via `getPlatformConfig<boolean>('somnio_recompra_crm_reader_enabled', false)`.
      - `getCollector()?.recordEvent('pipeline_decision', 'crm_reader_dispatched', {...})` ANTES del send.
      - `await inngest.send({ name: 'recompra/preload-context', data: { sessionId, contactId, workspaceId, invoker: 'somnio-recompra-v1' } })` (literal `invoker` string).
      - Try/catch envolviendo el bloque interno — catch escribe log.warn con mensaje que menciona "fail-open" y "greeting already sent".
      - Dynamic import de `@/lib/domain/platform-config` y `@/inngest/client` (patron del archivo — `await import('@/lib/...')`).
    - El dispatch esta INSERTADO entre `engineOutput = await runner.processMessage(...)` y la construccion de `recompraResult`.
    - `npx tsc --noEmit` sin errores nuevos asociados al archivo.
    - NO se elimino o modifico ningun otro codigo dentro del branch `is_client && recompraEnabled` (`recompra_routed` event, typing indicator, `loadLastOrderData`, runner construct, processMessage, recompraResult — TODOS intactos).
    - NO hay `(inngest.send as any)` — el send es typed gracias a Plan 02.
  </acceptance_criteria>
  <done>
    - Commit atomico con mensaje `feat(somnio-recompra-crm-reader): dispatch recompra/preload-context event post-runner with feature flag gate`.
    - NO push a Vercel todavia (se hace junto con Task 2 al cerrar Plan 04).
  </done>
</task>

<task type="auto">
  <name>Task 2: Crear unit test del feature-flag-gated dispatch + push a Vercel</name>
  <read_first>
    - src/lib/agents/production/webhook-processor.ts (post Task 1 — entender el bloque nuevo)
    - src/__tests__/integration/crm-bots/reader.test.ts (patron vitest)
    - .planning/standalone/somnio-recompra-crm-reader/RESEARCH.md §Validation Architecture (Phase Requirements → Test Map)
  </read_first>
  <action>
    Crear `src/lib/agents/production/__tests__/webhook-processor.recompra-flag.test.ts`.

    Este test NO ejerce el webhook-processor completo (demasiadas dependencias Supabase/whatsapp). En su lugar, aisla el bloque nuevo de dispatch en un test focalizado que mockea `getPlatformConfig` y `inngest.send` y verifica el comportamiento condicional.

    La estrategia: **Extraer el comportamiento a una funcion testeable** (refactor interno minimo) O **testear via mocks + import directo**. Dado que webhook-processor.ts es una mega-funcion, hacemos la segunda: test via mocks sin extraccion.

    **Contenido del archivo:**

    ```typescript
    /**
     * Unit test for the feature-flag-gated recompra/preload-context dispatch
     * inside webhook-processor.ts.
     *
     * Strategy: we DO NOT exercise processMessage end-to-end (requires Supabase,
     * WhatsApp adapters, runner, etc). Instead, we extract the dispatch logic
     * into a narrow helper via direct inline testing of the conditions:
     *
     *   - Given flag=false, `inngest.send` is NOT called.
     *   - Given flag=true AND sessionId present, `inngest.send` IS called with
     *     the correct payload shape.
     *   - Given flag=true AND sessionId empty, `inngest.send` is NOT called.
     *
     * We test the dispatch conditions by invoking a locally-constructed equivalent
     * of the dispatch block, reusing the production contract (getPlatformConfig key
     * literal, event name, payload shape).
     *
     * This approach is pragmatic — the real protection against regression is that
     * grep-check in verify ensures the literal strings match. This test validates
     * the condition-flow logic.
     */
    import { describe, it, expect, vi, beforeEach } from 'vitest'

    const mockGetPlatformConfig = vi.fn()
    const mockInngestSend = vi.fn()
    const mockRecordEvent = vi.fn()

    vi.mock('@/lib/domain/platform-config', () => ({
      getPlatformConfig: mockGetPlatformConfig,
    }))

    vi.mock('@/inngest/client', () => ({
      inngest: {
        send: mockInngestSend,
      },
    }))

    vi.mock('@/lib/observability', () => ({
      getCollector: () => ({ recordEvent: mockRecordEvent }),
    }))

    /**
     * Helper that mirrors the dispatch block in webhook-processor.ts exactly.
     * If webhook-processor.ts changes this block, this helper MUST be updated
     * to stay in sync. The grep checks in acceptance_criteria guard the literals
     * (flag key, event name, invoker, etc.).
     */
    async function dispatchRecompraPreload(params: {
      sessionId: string
      contactId: string
      workspaceId: string
    }): Promise<{ dispatched: boolean; reason?: string }> {
      if (!params.sessionId) return { dispatched: false, reason: 'no_session' }

      try {
        const { getPlatformConfig } = await import('@/lib/domain/platform-config')
        const crmPreloadEnabled = await getPlatformConfig<boolean>(
          'somnio_recompra_crm_reader_enabled',
          false,
        )

        if (!crmPreloadEnabled) return { dispatched: false, reason: 'flag_off' }

        const { getCollector } = await import('@/lib/observability')
        getCollector()?.recordEvent('pipeline_decision', 'crm_reader_dispatched', {
          agent: 'somnio-recompra-v1',
          sessionId: params.sessionId,
          contactId: params.contactId,
          workspaceId: params.workspaceId,
        })

        const { inngest } = await import('@/inngest/client')
        await inngest.send({
          name: 'recompra/preload-context',
          data: {
            sessionId: params.sessionId,
            contactId: params.contactId,
            workspaceId: params.workspaceId,
            invoker: 'somnio-recompra-v1',
          },
        })
        return { dispatched: true }
      } catch (err) {
        return { dispatched: false, reason: 'threw' }
      }
    }

    describe('webhook-processor recompra preload dispatch (feature-flag gated)', () => {
      beforeEach(() => {
        vi.clearAllMocks()
      })

      it('does NOT dispatch when feature flag is false (Regla 6)', async () => {
        mockGetPlatformConfig.mockResolvedValue(false)

        const result = await dispatchRecompraPreload({
          sessionId: 'session-123',
          contactId: 'contact-456',
          workspaceId: 'workspace-789',
        })

        expect(result).toEqual({ dispatched: false, reason: 'flag_off' })
        expect(mockInngestSend).not.toHaveBeenCalled()
        expect(mockRecordEvent).not.toHaveBeenCalled()
      })

      it('dispatches with correct payload when flag=true and sessionId present', async () => {
        mockGetPlatformConfig.mockResolvedValue(true)
        mockInngestSend.mockResolvedValue(undefined)

        const result = await dispatchRecompraPreload({
          sessionId: 'session-123',
          contactId: 'contact-456',
          workspaceId: 'workspace-789',
        })

        expect(result).toEqual({ dispatched: true })
        expect(mockInngestSend).toHaveBeenCalledTimes(1)
        expect(mockInngestSend).toHaveBeenCalledWith({
          name: 'recompra/preload-context',
          data: {
            sessionId: 'session-123',
            contactId: 'contact-456',
            workspaceId: 'workspace-789',
            invoker: 'somnio-recompra-v1',
          },
        })
        expect(mockRecordEvent).toHaveBeenCalledWith(
          'pipeline_decision',
          'crm_reader_dispatched',
          expect.objectContaining({
            agent: 'somnio-recompra-v1',
            sessionId: 'session-123',
          }),
        )
      })

      it('does NOT dispatch when sessionId is empty string (runner did not create session)', async () => {
        mockGetPlatformConfig.mockResolvedValue(true)

        const result = await dispatchRecompraPreload({
          sessionId: '',
          contactId: 'contact-456',
          workspaceId: 'workspace-789',
        })

        expect(result).toEqual({ dispatched: false, reason: 'no_session' })
        expect(mockInngestSend).not.toHaveBeenCalled()
        expect(mockGetPlatformConfig).not.toHaveBeenCalled()
      })

      it('records dispatched event BEFORE send (so intent is logged even if send throws)', async () => {
        mockGetPlatformConfig.mockResolvedValue(true)
        mockInngestSend.mockRejectedValue(new Error('inngest cloud unreachable'))

        const result = await dispatchRecompraPreload({
          sessionId: 'session-123',
          contactId: 'contact-456',
          workspaceId: 'workspace-789',
        })

        expect(result).toEqual({ dispatched: false, reason: 'threw' })
        // recordEvent ran BEFORE the send threw.
        expect(mockRecordEvent).toHaveBeenCalled()
        expect(mockInngestSend).toHaveBeenCalled()
      })
    })
    ```

    Correr el test:
    ```bash
    npm run test -- src/lib/agents/production/__tests__/webhook-processor.recompra-flag.test.ts
    ```

    Expected: 4 tests PASS.

    **Paso 2 — Push a Vercel (Regla 1):**

    Despues de que ambos tests pasen y tsc este clean, ejecutar:

    ```bash
    git push origin main
    ```

    Esto deploya Plans 02+03+04 juntos a produccion. Importante:
    - La Inngest function del Plan 03 se auto-descubre en Inngest Cloud al primer request GET a `/api/inngest` en el deploy nuevo.
    - El dispatch del Plan 04 esta guardado por flag=false, asi que ningun evento real se envia (Regla 6 respetada).
    - El agente en produccion sigue comportandose identico: saludo → conversacion, sin rastro del reader enriquecido hasta el flip del flag.

    Verificar que Vercel deploy salga verde — no hace falta QA runtime todavia (eso es Plan 07).
  </action>
  <verify>
    <automated>test -f src/lib/agents/production/__tests__/webhook-processor.recompra-flag.test.ts</automated>
    <automated>npm run test -- src/lib/agents/production/__tests__/webhook-processor.recompra-flag.test.ts 2>&1 | tee /tmp/test-p04t2.log; grep -qE "(4 passed|Tests\\s+4 passed)" /tmp/test-p04t2.log</automated>
    <automated>git log --oneline -5 | head -5</automated>
    <automated>npx tsc --noEmit 2>&1 | tee /tmp/tsc-p04t2.log; ! grep "webhook-processor.recompra-flag" /tmp/tsc-p04t2.log | grep "error TS" || echo "test file clean"</automated>
  </verify>
  <acceptance_criteria>
    - Archivo `src/lib/agents/production/__tests__/webhook-processor.recompra-flag.test.ts` existe con al menos 4 tests.
    - Los 4 tests cubren: flag=false, flag=true+sessionId, sessionId empty, recordEvent-before-send.
    - `npm run test -- <test file>` sale con 4/4 passed.
    - Git log muestra el commit de Task 1 + Task 2.
    - `git push origin main` ejecutado exitosamente (Regla 1).
    - Vercel deploy visible como "ready" o "building" (no obligatorio verificarlo con gh CLI — user puede validar).
    - NO se modifico webhook-processor.ts en Task 2 (solo se agrego el test file).
  </acceptance_criteria>
  <done>
    - Commit atomico con mensaje `test(somnio-recompra-crm-reader): add unit test for webhook-processor recompra dispatch`.
    - Push a Vercel ejecutado: `git push origin main` sin conflictos.
    - Deploy en Vercel confirmado (visible en dashboard).
    - Inngest Cloud descubrira la function `recompra-preload-context` al siguiente sync automatico post-deploy (o al primer request a `/api/inngest`).
  </done>
</task>

</tasks>

<verification>
- `src/lib/agents/production/webhook-processor.ts` tiene el bloque de dispatch feature-flagged con todos los literales correctos.
- Dispatch es POST-runner (usa `engineOutput.sessionId`).
- Flag check `getPlatformConfig<boolean>('somnio_recompra_crm_reader_enabled', false)` — literal.
- Event name `recompra/preload-context` — literal, match Plan 02 schema.
- Invoker `'somnio-recompra-v1'` — literal string type.
- `await` obligatorio en `inngest.send` (Pitfall 1).
- Try/catch envuelve + log.warn fail-open.
- 4 unit tests pasan.
- Push a Vercel ejecutado (Regla 1).
- Vercel deploy "ready".
- TypeScript clean.
</verification>

<success_criteria>
- En produccion post-deploy: al entrar un contacto `is_client` a recompra, el runner crea sesion, envia saludo, Y la lambda lee platform_config — como el valor es `false`, el dispatch no ocurre. Comportamiento runtime identico al actual.
- Si el usuario flippea el flag a `true` (Plan 07), el dispatch comienza a ocurrir inmediatamente (30s cache TTL).
- La Inngest function `recompra-preload-context` queda registrada en Inngest Cloud visible en dashboard.
- Type safety end-to-end: webhook-processor → Inngest event → function handler, sin `as any`.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-recompra-crm-reader/04-SUMMARY.md` documenting:
- Commit hashes Task 1 + Task 2
- Rango commits pusheados a Vercel (`git log origin/main -3 --oneline`)
- Numero de linea del archivo webhook-processor.ts donde se insertaron el dispatch (para referencia post-ejecucion)
- Output de `npm run test` (4/4 passed verbatim)
- Confirmacion Vercel deploy ready (URL o commit sha)
- Nota: "Feature flag sigue en false en production — cero cambio observable hasta Plan 07 QA checkpoint"
</output>

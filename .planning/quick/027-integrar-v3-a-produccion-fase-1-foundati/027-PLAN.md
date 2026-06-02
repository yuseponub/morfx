---
phase: quick-027
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260315_v3_acciones_ejecutadas_column.sql
  - src/lib/agents/engine/v3-production-runner.ts
  - src/lib/agents/production/webhook-processor.ts
autonomous: false

must_haves:
  truths:
    - "V3 agent processes messages in production when conversational_agent_id='somnio-sales-v3'"
    - "V1 agent continues working unchanged when conversational_agent_id='somnio-sales-v1'"
    - "acciones_ejecutadas column exists in session_state and defaults to empty array"
    - "V3 state serialization/deserialization works with production session_state JSONB"
    - "No-repetition filter applies to v3 templates when USE_NO_REPETITION=true"
    - "Orders are created correctly including ofiInter and cedulaRecoge"
  artifacts:
    - path: "supabase/migrations/20260315_v3_acciones_ejecutadas_column.sql"
      provides: "acciones_ejecutadas JSONB column on session_state"
      contains: "ALTER TABLE"
    - path: "src/lib/agents/engine/v3-production-runner.ts"
      provides: "V3ProductionRunner class — thin I/O runner for v3"
      exports: ["V3ProductionRunner"]
    - path: "src/lib/agents/production/webhook-processor.ts"
      provides: "Agent routing by conversational_agent_id"
      contains: "somnio-sales-v3"
  key_links:
    - from: "src/lib/agents/production/webhook-processor.ts"
      to: "src/lib/agents/engine/v3-production-runner.ts"
      via: "dynamic import + new V3ProductionRunner()"
      pattern: "V3ProductionRunner"
    - from: "src/lib/agents/engine/v3-production-runner.ts"
      to: "src/lib/agents/somnio-v3/somnio-v3-agent.ts"
      via: "import processMessage"
      pattern: "processMessage"
    - from: "src/lib/agents/engine/v3-production-runner.ts"
      to: "src/lib/agents/engine/types.ts"
      via: "uses EngineAdapters and returns EngineOutput"
      pattern: "EngineAdapters.*EngineOutput"
---

<objective>
Integrar v3 a produccion - Fase 1 Foundation: migracion SQL para acciones_ejecutadas, V3ProductionRunner como thin I/O runner, y routing en webhook-processor.ts por conversational_agent_id.

Purpose: Permitir que el agente v3 (ya funcional en sandbox) procese mensajes reales de WhatsApp, mientras v1 sigue activo como default. El switch es por configuracion (conversational_agent_id en workspace_agent_config), cero deploy para cambiar.

Output: 3 archivos (1 migracion SQL, 1 archivo nuevo TypeScript, 1 archivo modificado) que habilitan v3 en produccion sin afectar v1.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v3-production-integration/CONTEXT.md

@src/lib/agents/engine/types.ts
@src/lib/agents/somnio-v3/types.ts
@src/lib/agents/somnio-v3/somnio-v3-agent.ts
@src/lib/agents/somnio-v3/state.ts
@src/lib/agents/engine/unified-engine.ts
@src/lib/agents/engine-adapters/production/index.ts
@src/lib/agents/production/webhook-processor.ts
@src/lib/agents/production/agent-config.ts
@src/lib/agents/somnio/no-repetition-filter.ts
@src/lib/agents/errors.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migracion SQL — acciones_ejecutadas column</name>
  <files>supabase/migrations/20260315_v3_acciones_ejecutadas_column.sql</files>
  <action>
    Crear archivo de migracion idempotente:
    ```sql
    -- V3 Production Integration: acciones_ejecutadas column
    -- Stores the array of AccionRegistrada objects for v3 agent sessions.
    -- Used by V3ProductionRunner to persist/restore acciones between turns.

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'session_state'
        AND column_name = 'acciones_ejecutadas'
      ) THEN
        ALTER TABLE session_state ADD COLUMN acciones_ejecutadas JSONB DEFAULT '[]';
      END IF;
    END $$;
    ```

    Usar IF NOT EXISTS para idempotencia. Default '[]' (array JSON vacio).

    IMPORTANTE: Despues de crear este archivo, NO continuar con las tareas 2 y 3.
    Mostrar al usuario el archivo de migracion y pedir que lo aplique en produccion (Supabase SQL Editor).
  </action>
  <verify>Archivo existe en supabase/migrations/ con sintaxis SQL correcta</verify>
  <done>Archivo de migracion creado. Usuario confirma que lo aplico en produccion.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Checkpoint: Aplicar migracion en produccion</name>
  <action>
    Antes de continuar con el codigo, la migracion SQL DEBE aplicarse en produccion.

    Regla 5 de CLAUDE.md: "TODA migracion de base de datos DEBE aplicarse en produccion ANTES de pushear codigo que la usa."
  </action>
  <how-to-verify>
    1. Ir a Supabase Dashboard → SQL Editor
    2. Pegar el contenido de `supabase/migrations/20260315_v3_acciones_ejecutadas_column.sql`
    3. Ejecutar
    4. Verificar: `SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'session_state' AND column_name = 'acciones_ejecutadas';`
    5. Debe mostrar: column_name=acciones_ejecutadas, data_type=jsonb, column_default='[]'::jsonb
  </how-to-verify>
  <resume-signal>Confirmar "migracion aplicada" para continuar con Tasks 2 y 3</resume-signal>
</task>

<task type="auto">
  <name>Task 2: V3ProductionRunner — thin I/O runner para v3</name>
  <files>src/lib/agents/engine/v3-production-runner.ts</files>
  <action>
    Crear `V3ProductionRunner` — clase equivalente a `UnifiedEngine` pero para v3.
    Usar UnifiedEngine como referencia de patron (version conflict retry, adapter calls, assistant turn recording).

    **Constructor:**
    - Recibe `EngineAdapters` y `EngineConfig` (mismos tipos que UnifiedEngine)
    - NO instancia ningun agente — v3 usa `processMessage()` como funcion pura

    **processMessage(input: EngineInput, retryCount = 0): Promise<EngineOutput>:**

    1. **Session:** Obtener session via storage adapter (mismo patron que UnifiedEngine lineas 55-57):
       - Si `input.sessionId` no vacio: `getSession(input.sessionId)`
       - Si vacio: `getOrCreateSession(input.conversationId, input.contactId)`

    2. **History:** Si `input.history.length > 0` usar directamente, si no `getHistory(session.id)`

    3. **Construir V3AgentInput** mapeando session → input plano:
       ```typescript
       const turnNumber = input.turnNumber ?? (history.length + 1)
       const accionesEjecutadas = session.state.acciones_ejecutadas ??
         (() => {
           try {
             const raw = (session.state.datos_capturados ?? {})['_v3:accionesEjecutadas']
             return raw ? JSON.parse(raw) : []
           } catch { return [] }
         })()

       const v3Input: V3AgentInput = {
         message: input.message,
         history,
         currentMode: session.current_mode,
         intentsVistos: session.state.intents_vistos ?? [],
         templatesEnviados: session.state.templates_enviados ?? [],
         datosCapturados: session.state.datos_capturados ?? {},
         packSeleccionado: session.state.pack_seleccionado as string | null,
         accionesEjecutadas,
         turnNumber,
         workspaceId: this.config.workspaceId,
         // systemEvent: undefined (solo para timers, no mensajes de usuario)
       }
       ```

       NOTA: `acciones_ejecutadas` se lee primero de la columna dedicada nueva (`session.state.acciones_ejecutadas`), con fallback a `_v3:accionesEjecutadas` en datos_capturados (backward compat con sessions existentes del sandbox).

    4. **Llamar v3 processMessage:**
       ```typescript
       import { processMessage } from '../somnio-v3/somnio-v3-agent'
       const output = await processMessage(v3Input)
       ```

    5. **Storage — save state:** Persistir todo el estado v3 de vuelta:
       ```typescript
       await adapters.storage.saveState(session.id, {
         datos_capturados: output.datosCapturados,
         templates_enviados: output.templatesEnviados,
         intents_vistos: output.intentsVistos,
         pack_seleccionado: output.packSeleccionado,
         acciones_ejecutadas: output.accionesEjecutadas,
       })
       ```

    6. **Storage — update mode** (con optimistic locking):
       ```typescript
       if (output.newMode && output.newMode !== session.current_mode) {
         await adapters.storage.updateMode(session.id, session.version, output.newMode)
       }
       ```

    7. **Storage — add user turn:**
       ```typescript
       await adapters.storage.addTurn({
         sessionId: session.id,
         turnNumber,
         role: 'user',
         content: input.message,
         intentDetected: output.intentInfo?.intent,
         confidence: output.intentInfo?.confidence,
         tokensUsed: output.totalTokens,
       })
       ```

    8. **Storage — add intent seen:**
       ```typescript
       if (output.intentInfo?.intent) {
         await adapters.storage.addIntentSeen(session.id, output.intentInfo.intent)
       }
       ```

    9. **Storage — handoff:**
       ```typescript
       if (output.newMode === 'handoff') {
         await adapters.storage.handoff(session.id, session.version)
       }
       ```

    10. **Timer — lifecycle hooks + signals:**
        ```typescript
        // Customer message event (para cancelar timers activos)
        if (adapters.timer.onCustomerMessage) {
          await adapters.timer.onCustomerMessage(session.id, input.conversationId, input.message)
        }

        // Mode transition
        if (output.newMode && output.newMode !== session.current_mode && adapters.timer.onModeTransition) {
          await adapters.timer.onModeTransition(session.id, session.current_mode, output.newMode, input.conversationId)
        }

        // Timer signals del sales-track
        for (const signal of output.timerSignals) {
          adapters.timer.signal(signal)
        }
        ```

    11. **Orders — create if needed:**
        ```typescript
        let orderResult: { success: boolean; orderId?: string; contactId?: string } | undefined
        if (output.shouldCreateOrder && output.orderData) {
          const isOfiInter = output.datosCapturados['_v3:ofiInter'] === 'true'
          const cedulaRecoge = output.datosCapturados.cedula_recoge

          orderResult = await adapters.orders.createOrder({
            datosCapturados: output.orderData.datosCapturados,
            packSeleccionado: output.orderData.packSeleccionado,
            workspaceId: this.config.workspaceId,
            sessionId: session.id,
            valorOverride: output.orderData.valorOverride,
            isOfiInter,
            cedulaRecoge,
          })
        }
        ```

    12. **Messaging — send templates (con no-rep filter):**
        Los templates de v3 ya vienen compuestos del response-track. NO hacer block composition extra.

        ```typescript
        let messagesSent = 0
        let sentMessageContents: string[] = []

        if (output.templates && output.templates.length > 0) {
          let templatesToSend = output.templates

          // No-repetition filter (si USE_NO_REPETITION=true)
          if (process.env.USE_NO_REPETITION === 'true') {
            const { NoRepetitionFilter } = await import('../somnio/no-repetition-filter')
            const { buildOutboundRegistry } = await import('../somnio/outbound-registry')

            const registry = await buildOutboundRegistry(
              input.conversationId,
              this.config.workspaceId
            )

            const noRepFilter = new NoRepetitionFilter()
            const filterResult = await noRepFilter.filter(
              templatesToSend.map(t => ({
                templateId: t.templateId,
                content: t.content,
                contentType: t.contentType,
                priority: t.priority,
              })),
              registry,
              output.templatesEnviados
            )

            templatesToSend = filterResult.kept.map(k =>
              output.templates!.find(t => t.templateId === k.templateId)!
            ).filter(Boolean)
          }

          if (templatesToSend.length > 0) {
            const sendResult = await adapters.messaging.send({
              sessionId: session.id,
              conversationId: input.conversationId,
              messages: templatesToSend.map(t => t.content),
              templates: templatesToSend.map(t => ({
                id: t.templateId,
                content: t.content,
                contentType: t.contentType,
                delaySeconds: 0,
              })),
              intent: output.intentInfo?.intent,
              workspaceId: this.config.workspaceId,
              contactId: input.contactId,
              phoneNumber: input.phoneNumber,
              triggerTimestamp: input.messageTimestamp,
            })
            messagesSent = sendResult.messagesSent
            sentMessageContents = templatesToSend
              .slice(0, sendResult.messagesSent)
              .map(t => t.content)

            // Post-send: append sent template IDs to templates_enviados
            const sentTemplateIds = templatesToSend
              .slice(0, sendResult.messagesSent)
              .map(t => t.templateId)
              .filter((id): id is string => id != null && id.length > 0)

            if (sentTemplateIds.length > 0) {
              const updatedTemplatesEnviados = [...output.templatesEnviados, ...sentTemplateIds]
              await adapters.storage.saveState(session.id, {
                templates_enviados: updatedTemplatesEnviados,
              })
            }

            // Handle interruption — pending templates
            if (sendResult.interrupted) {
              const sentIndex = sendResult.interruptedAtIndex ?? sendResult.messagesSent
              if (sendResult.messagesSent === 0) {
                if (adapters.storage.clearPendingTemplates) {
                  await adapters.storage.clearPendingTemplates(session.id)
                }
              } else {
                const unsent = templatesToSend.slice(sentIndex)
                if (unsent.length > 0 && adapters.storage.savePendingTemplates) {
                  await adapters.storage.savePendingTemplates(session.id, unsent)
                }
              }
            } else {
              // Clear stale pending
              if (adapters.storage.clearPendingTemplates) {
                await adapters.storage.clearPendingTemplates(session.id)
              }
            }
          }
        } else if (output.messages.length > 0) {
          // Fallback: plain messages (sin templates)
          const sendResult = await adapters.messaging.send({
            sessionId: session.id,
            conversationId: input.conversationId,
            messages: output.messages,
            workspaceId: this.config.workspaceId,
            contactId: input.contactId,
            phoneNumber: input.phoneNumber,
          })
          messagesSent = sendResult.messagesSent
          sentMessageContents = output.messages
        }
        ```

    13. **Assistant turn recording** (post-envio):
        ```typescript
        const assistantContent = sentMessageContents
          .filter(m => m.trim().length > 0)
          .join('\n')
        if (assistantContent.trim()) {
          try {
            await adapters.storage.addTurn({
              sessionId: session.id,
              turnNumber: turnNumber + 1,
              role: 'assistant',
              content: assistantContent,
            })
          } catch (turnError) {
            console.error('[V3-RUNNER] Failed to save assistant turn:', turnError)
          }
        }
        ```

    14. **Debug adapter** — record intent, tokens, classification, sales track, response track:
        ```typescript
        adapters.debug.recordIntent(output.intentInfo)
        adapters.debug.recordTokens({
          turnNumber,
          tokensUsed: output.totalTokens,
          timestamp: new Date().toISOString(),
        })
        if (output.classificationInfo) adapters.debug.recordClassification(output.classificationInfo)
        if (output.salesTrackInfo) adapters.debug.recordOrchestration(output.salesTrackInfo)
        adapters.debug.recordTimerSignals(output.timerSignals)
        ```

    15. **Version conflict retry** (mismo patron que UnifiedEngine):
        ```typescript
        catch (error) {
          if (error instanceof VersionConflictError && retryCount < 3) {
            console.warn(`[V3-RUNNER] Version conflict, retrying (${retryCount + 1}/3)`)
            return this.processMessage(input, retryCount + 1)
          }
          // ... error handling
        }
        ```

    16. **Return EngineOutput** compatible con webhook-processor:
        ```typescript
        return {
          success: output.success,
          messages: output.messages,
          newMode: output.newMode,
          tokensUsed: output.totalTokens,
          sessionId: session.id,
          messagesSent,
          response: sentMessageContents.join('\n'),
          orderCreated: orderResult?.success,
          orderId: orderResult?.orderId,
          contactId: orderResult?.contactId ?? input.contactId,
          error: output.success ? undefined : {
            code: 'V3_AGENT_ERROR',
            message: 'V3 agent processing failed',
          },
        }
        ```

    **Logging:** Usar console.log con prefijo `[V3-RUNNER]` para todas las trazas (consistente con `[ENGINE]` del UnifiedEngine).

    **NO hacer:**
    - Block composition (v3 response-track ya lo hace)
    - Minifrase generation (v3 no lo usa)
    - MessageClassifier (v3 usa comprehension + sales-track para silence)
    - forceIntent (v3 usa systemEvent)
  </action>
  <verify>`npx tsc --noEmit` compila sin errores. El archivo exporta `V3ProductionRunner` con metodo `processMessage(input: EngineInput): Promise<EngineOutput>`</verify>
  <done>V3ProductionRunner creado, compila limpio, implementa todos los adapter calls necesarios (storage, timer, messaging, orders, debug), no-rep filter, version conflict retry, y retorna EngineOutput compatible.</done>
</task>

<task type="auto">
  <name>Task 3: Routing en webhook-processor.ts por conversational_agent_id</name>
  <files>src/lib/agents/production/webhook-processor.ts</files>
  <action>
    Modificar `processMessageWithAgent()` en webhook-processor.ts para rutear por `conversational_agent_id`.

    **Cambio en seccion 6 (lineas ~174-205) — reemplazar el bloque de import + engine:**

    Antes:
    ```typescript
    await import('../somnio')
    const { UnifiedEngine } = await import('../engine/unified-engine')
    const { createProductionAdapters } = await import('../engine-adapters/production')
    const agentConfig = await getWorkspaceAgentConfig(workspaceId)
    const adapters = createProductionAdapters({ ... })
    const engine = new UnifiedEngine(adapters, { workspaceId })
    const engineOutput = await engine.processMessage({ ... })
    ```

    Despues:
    ```typescript
    const agentConfig = await getWorkspaceAgentConfig(workspaceId)
    const agentId = agentConfig?.conversational_agent_id ?? 'somnio-sales-v1'

    const { createProductionAdapters } = await import('../engine-adapters/production')
    const adapters = createProductionAdapters({
      workspaceId,
      conversationId,
      phoneNumber: phone,
      responseSpeed: agentConfig?.response_speed,
    })

    let engineOutput: EngineOutput

    if (agentId === 'somnio-sales-v3') {
      // V3 path — uses V3ProductionRunner
      // Import v3 agent barrel (triggers module initialization)
      await import('../somnio-v3')
      const { V3ProductionRunner } = await import('../engine/v3-production-runner')
      const runner = new V3ProductionRunner(adapters, { workspaceId })

      engineOutput = await runner.processMessage({
        sessionId: '',
        conversationId,
        contactId: contactId!,
        message: messageContent,
        workspaceId,
        history: [],
        phoneNumber: phone,
        messageTimestamp: input.messageTimestamp,
      })

      logger.info({ conversationId, agentId }, 'V3 agent processing complete')
    } else {
      // V1 path — unchanged (default)
      await import('../somnio')
      const { UnifiedEngine } = await import('../engine/unified-engine')
      const engine = new UnifiedEngine(adapters, { workspaceId })

      engineOutput = await engine.processMessage({
        sessionId: '',
        conversationId,
        contactId: contactId!,
        message: messageContent,
        workspaceId,
        history: [],
        phoneNumber: phone,
        messageTimestamp: input.messageTimestamp,
      })
    }
    ```

    **IMPORTANTE:**
    - Mover `getWorkspaceAgentConfig()` ANTES del try block (ya se llama ahi para responseSpeed, ahora tambien se necesita para agentId)
    - El `agentConfig` ya se usaba para `response_speed` — ahora tambien para `conversational_agent_id`
    - TODA la logica post-processing (sent_by_agent, WPP tag, handoff, processed_by_agent) queda IDENTICA — solo cambia el engine/runner usado
    - El bloque try/catch/finally no cambia estructura, solo el contenido del try
    - No agregar import de `V3ProductionRunner` al top del archivo — usar dynamic import (igual que UnifiedEngine)

    **NO tocar:**
    - Pasos 1-5 (check enabled, skip tags, conversation lookup, contact creation, typing start)
    - Pasos 7-12 (typing stop, sent_by_agent, contact sync, WPP tag, handoff, processed_by_agent)
    - Funciones helper (autoCreateContact, conversationHasAnyTag)
  </action>
  <verify>`npx tsc --noEmit` compila sin errores. El routing por agentId funciona leyendo el campo existente `conversational_agent_id` de workspace_agent_config (default 'somnio-sales-v1').</verify>
  <done>webhook-processor.ts rutea por conversational_agent_id: v1 usa UnifiedEngine (sin cambios), v3 usa V3ProductionRunner. La logica post-processing es identica para ambos paths.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — cero errores de tipo
2. Migracion SQL es idempotente (puede ejecutarse multiples veces sin error)
3. V3ProductionRunner importa y usa los tipos correctos (V3AgentInput, V3AgentOutput, EngineInput, EngineOutput)
4. webhook-processor.ts mantiene TODA la logica post-processing identica para v1 y v3
5. Default sigue siendo v1 (conversational_agent_id ?? 'somnio-sales-v1') — v3 solo se activa explicitamente
6. No se modifico unified-engine.ts, somnio-v3/**, ni ningun otro archivo fuera del scope
</verification>

<success_criteria>
- Migracion SQL aplicada en produccion, columna acciones_ejecutadas existe en session_state
- V3ProductionRunner compila y exporta clase con processMessage(): Promise<EngineOutput>
- webhook-processor.ts discrimina por agentId y usa el runner correcto
- npx tsc --noEmit pasa limpio
- V1 no se ve afectado (codigo default path sin cambios)
- Push a Vercel deployable (v3 inactivo por default hasta cambiar config)
</success_criteria>

<output>
After completion, create `.planning/quick/027-integrar-v3-a-produccion-fase-1-foundati/027-SUMMARY.md`
</output>

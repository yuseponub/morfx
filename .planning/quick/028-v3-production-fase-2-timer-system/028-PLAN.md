---
phase: standalone
plan: 028
type: execute
wave: 1
depends_on: [027]
files_modified:
  - src/inngest/events.ts
  - src/lib/agents/somnio-v3/constants.ts
  - src/lib/agents/engine-adapters/production/v3-timer.ts
  - src/lib/agents/engine-adapters/production/index.ts
  - src/inngest/functions/agent-timers-v3.ts
  - src/app/api/inngest/route.ts
autonomous: true

must_haves:
  truths:
    - "V3 timer signals from sales-track translate to Inngest events"
    - "Timer expiration triggers v3 processMessage with systemEvent"
    - "Customer messages cancel active v3 timers via waitForEvent"
    - "Timer durations respect workspace timer_preset (real/rapido/instantaneo)"
    - "V1 timer system remains completely untouched"
  artifacts:
    - path: "src/inngest/events.ts"
      provides: "V3 timer event types in AllAgentEvents"
      contains: "agent/v3.timer.started"
    - path: "src/lib/agents/somnio-v3/constants.ts"
      provides: "V3_TIMER_DURATIONS mapping"
      contains: "V3_TIMER_DURATIONS"
    - path: "src/lib/agents/engine-adapters/production/v3-timer.ts"
      provides: "V3ProductionTimerAdapter class"
      exports: ["V3ProductionTimerAdapter"]
    - path: "src/inngest/functions/agent-timers-v3.ts"
      provides: "Generic v3 timer Inngest function"
      exports: ["v3TimerFunctions"]
  key_links:
    - from: "v3-timer.ts (adapter)"
      to: "inngest/events.ts"
      via: "inngest.send agent/v3.timer.started"
      pattern: "agent/v3\\.timer\\.started"
    - from: "agent-timers-v3.ts"
      to: "v3-production-runner.ts"
      via: "V3ProductionRunner.processMessage with systemEvent"
      pattern: "systemEvent.*timer_expired"
    - from: "route.ts"
      to: "agent-timers-v3.ts"
      via: "v3TimerFunctions spread in serve()"
      pattern: "v3TimerFunctions"
---

<objective>
Implementar el sistema de timers v3 para produccion: eventos Inngest, adapter de timer, funcion Inngest generica, y duraciones por nivel.

Purpose: Fase 2 de la integracion v3 a produccion. Sin timers, el agente v3 no puede retomar conversaciones cuando el cliente deja de responder (L0-L8). Es critico para paridad con sandbox.

Output: V3ProductionTimerAdapter que traduce timer signals a Inngest events + funcion Inngest generica que ejecuta v3 processMessage con systemEvent al expirar.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v3-production-integration/CONTEXT.md

Key reference files:
@src/inngest/events.ts — Current event types (add V3 events here)
@src/inngest/functions/agent-timers.ts — V1 timer pattern reference (DO NOT MODIFY)
@src/lib/agents/engine-adapters/production/timer.ts — V1 timer adapter reference (DO NOT MODIFY)
@src/lib/agents/engine-adapters/production/index.ts — Production adapter factory (modify for v3 routing)
@src/lib/agents/engine/v3-production-runner.ts — V3 runner (created in quick-027, call from timer)
@src/lib/agents/somnio-v3/types.ts — TimerSignal type definition
@src/lib/agents/somnio-v3/constants.ts — V3 constants (add V3_TIMER_DURATIONS here)
@src/lib/sandbox/ingest-timer.ts — Sandbox timer presets (TIMER_PRESETS source of truth for durations)
@src/app/api/inngest/route.ts — Inngest serve route (register new functions)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Registrar eventos V3 en events.ts + V3_TIMER_DURATIONS en constants.ts</name>
  <files>
    src/inngest/events.ts
    src/lib/agents/somnio-v3/constants.ts
  </files>
  <action>
    **events.ts — Agregar V3TimerEvents al final, antes de AllAgentEvents:**

    Crear type `V3TimerEvents` con 2 eventos:

    1. `'agent/v3.timer.started'`:
       ```typescript
       data: {
         sessionId: string
         conversationId: string
         workspaceId: string
         level: number          // 0-8
         timerDurationMs: number // duration from V3_TIMER_DURATIONS
         phoneNumber: string
         contactId: string
       }
       ```

    2. `'agent/v3.timer.cancelled'`:
       ```typescript
       data: {
         sessionId: string
         reason: string          // 'customer_replied' | 'ingest_complete' | etc
       }
       ```

    Actualizar `AllAgentEvents` para incluir V3TimerEvents:
    ```typescript
    export type AllAgentEvents = AgentEvents & IngestEvents & AutomationEvents & RobotEvents & GodentistEvents & V3TimerEvents
    ```

    **constants.ts — Agregar V3_TIMER_DURATIONS al final:**

    Mapping independiente de v1. 3 presets x 9 niveles. Valores en SEGUNDOS (como TIMER_PRESETS del sandbox):

    ```typescript
    export const V3_TIMER_DURATIONS: Record<string, Record<number, number>> = {
      real:         { 0: 600, 1: 360, 2: 120, 3: 600, 4: 600, 5: 90, 6: 360, 7: 120, 8: 120 },
      rapido:       { 0:  60, 1:  30, 2:  10, 3:  60, 4:  60, 5:   9, 6:  30, 7:  10, 8:  10 },
      instantaneo:  { 0:   2, 1:   2, 2:   1, 3:   2, 4:   2, 5:   1, 6:   2, 7:   1, 8:   1 },
    }
    ```

    Estos valores son IDENTICOS a `TIMER_PRESETS` en `src/lib/sandbox/ingest-timer.ts` linea 44. Deben coincidir exactamente para paridad sandbox-produccion.

    NO importar nada de sandbox — zero imports en constants.ts (regla existente).
  </action>
  <verify>
    `npx tsc --noEmit` pasa sin errores.
    Los nuevos eventos son accesibles via `AllAgentEvents`.
    `V3_TIMER_DURATIONS` exportado correctamente.
  </verify>
  <done>
    - `agent/v3.timer.started` y `agent/v3.timer.cancelled` registrados en events.ts
    - `AllAgentEvents` incluye `V3TimerEvents`
    - `V3_TIMER_DURATIONS` en constants.ts con 3 presets y 9 niveles cada uno
    - Valores coinciden exactamente con sandbox TIMER_PRESETS
  </done>
</task>

<task type="auto">
  <name>Task 2: V3ProductionTimerAdapter + wiring en factory</name>
  <files>
    src/lib/agents/engine-adapters/production/v3-timer.ts
    src/lib/agents/engine-adapters/production/index.ts
  </files>
  <action>
    **v3-timer.ts — Crear V3ProductionTimerAdapter:**

    Implementa `TimerAdapter` interface (de `../../engine/types`). A diferencia del v1 adapter que usa lifecycle hooks (onModeTransition, onIngestStarted, etc.), el v3 adapter traduce timer SIGNALS directamente a eventos Inngest.

    ```typescript
    import type { TimerAdapter, AgentSessionLike } from '../../engine/types'
    import type { TimerSignal } from '@/lib/agents/somnio-v3/types'  // V3 TimerSignal, NOT sandbox/types
    import { V3_TIMER_DURATIONS } from '../../somnio-v3/constants'
    import { createModuleLogger } from '@/lib/audit/logger'
    ```

    Constructor: `(workspaceId: string, conversationId: string, phoneNumber: string, contactId: string)`

    **signal(signal: TimerSignal):**
    - Este es el metodo CLAVE. V3 sales-track emite signals, el runner llama adapter.timer.signal().
    - En v1 este metodo es no-op. En v3, traduce signals a eventos Inngest.
    - Si `signal.type === 'start'` y `signal.level` existe:
      1. Obtener preset via `getWorkspaceAgentConfig(this.workspaceId)` → `timer_preset` (default 'real')
      2. Parsear level string ('L0'-'L8') a numero (0-8): `parseInt(signal.level.replace('L', ''))`
      3. Lookup duration: `V3_TIMER_DURATIONS[preset][levelNum] * 1000` (convertir segundos a ms)
      4. `await inngest.send({ name: 'agent/v3.timer.started', data: { sessionId, conversationId, workspaceId, level: levelNum, timerDurationMs, phoneNumber, contactId } })`
    - Si `signal.type === 'cancel'`:
      1. No emitir `agent/v3.timer.cancelled` — la cancelacion funciona via `agent/customer.message` que es el waitForEvent match.
      2. Solo log para debugging.
    - Si `signal.type === 'reevaluate'`: log only, no action needed en produccion.
    - IMPORTANTE: signal() es sync en la interface (`void`). Usar fire-and-forget pattern con `.catch()` para el inngest.send async. Patron identico a como lo hace el v1 adapter NO — v1 usa async lifecycle hooks. Aqui necesitamos hacer el async en signal(). Solucion: guardar la promise internamente y exponer un `flush()` opcional, O cambiar a un patron donde el runner llama un metodo async separado. MEJOR SOLUCION: hacer signal() sync pero que internamente lance el async sin await (fire-and-forget con catch para logging). Esto es seguro porque Inngest events son idempotentes y el runner no depende del resultado.

    **getLastSignal():** Return undefined. No se acumula en produccion.

    **onCustomerMessage(sessionId, conversationId, content):**
    - Emitir `agent/customer.message` — REUSAR evento v1. Este evento cancela TODOS los waitForEvent (tanto v1 como v3) que matchean por sessionId.
    - Patron identico a `ProductionTimerAdapter.onCustomerMessage()`.
    - inngest.send con name: 'agent/customer.message'.

    **Los demas lifecycle hooks (onModeTransition, onIngestStarted, onIngestCompleted, onSilenceDetected):**
    - NO implementar. V3 no usa lifecycle hooks — todo va via timer signals.
    - Dejar undefined (la interface los marca opcionales con `?`).

    **Preset cache:** Cachear `timer_preset` por instancia, igual que v1 adapter.

    **index.ts — Modificar createProductionAdapters:**

    Agregar parametro opcional `agentId?: string` a `CreateProductionAdaptersParams`.

    En la funcion, rutear el timer adapter:
    ```typescript
    if (params.agentId === 'somnio-sales-v3') {
      timer = new V3ProductionTimerAdapter(
        params.workspaceId,
        params.conversationId,
        params.phoneNumber ?? '',
        params.contactId ?? '',
      )
    } else {
      timer = new ProductionTimerAdapter(params.workspaceId)
    }
    ```

    Agregar `contactId?: string` a `CreateProductionAdaptersParams`.

    Agregar import de V3ProductionTimerAdapter.
    Agregar re-export: `export { V3ProductionTimerAdapter } from './v3-timer'`
  </action>
  <verify>
    `npx tsc --noEmit` pasa sin errores.
    `createProductionAdapters({ ..., agentId: 'somnio-sales-v3' })` retorna V3ProductionTimerAdapter como timer adapter.
    `createProductionAdapters({ ... })` sin agentId sigue retornando ProductionTimerAdapter (v1 default).
  </verify>
  <done>
    - V3ProductionTimerAdapter creado en `v3-timer.ts`
    - signal() traduce V3 timer signals a `agent/v3.timer.started` eventos Inngest
    - onCustomerMessage() reutiliza `agent/customer.message` (shared v1/v3)
    - Factory en index.ts rutea por agentId: v3 usa V3ProductionTimerAdapter, v1 usa ProductionTimerAdapter
    - V1 production path sin cambios (zero regression)
  </done>
</task>

<task type="auto">
  <name>Task 3: agent-timers-v3.ts + registrar en Inngest serve route</name>
  <files>
    src/inngest/functions/agent-timers-v3.ts
    src/app/api/inngest/route.ts
  </files>
  <action>
    **agent-timers-v3.ts — Crear funcion generica de timer v3:**

    UNA sola funcion para todos los niveles (L0-L8). Diferencia clave con v1: v1 tiene 5 funciones que evaluan nivel con TIMER_LEVELS[].evaluate(). V3 tiene 1 funcion que pasa systemEvent directamente al pipeline.

    ```typescript
    import { inngest } from '../client'
    import { createModuleLogger } from '@/lib/audit/logger'
    import { createAdminClient } from '@/lib/supabase/admin'

    const logger = createModuleLogger('agent-timers-v3')
    ```

    **v3Timer function:**
    ```typescript
    export const v3Timer = inngest.createFunction(
      {
        id: 'v3-timer',
        name: 'V3 Agent Timer',
        retries: 3,
        concurrency: [{ key: 'event.data.sessionId', limit: 1 }],
      },
      { event: 'agent/v3.timer.started' },
      async ({ event, step }) => { ... }
    )
    ```

    Concurrency 1 por sessionId — evita multiples timers del mismo nivel corriendo en paralelo para la misma sesion.

    **Flow dentro del handler:**

    1. Extraer: `{ sessionId, conversationId, workspaceId, level, timerDurationMs, phoneNumber, contactId }`
    2. Log: timer started con level y duration
    3. Settle (5s sleep) — CRITICO: mismo patron que TODOS los timers v1. Previene que el agent/customer.message emitido en el mismo request cancele inmediatamente el timer.
       ```typescript
       await step.sleep('settle', '5s')
       ```
    4. waitForEvent:
       ```typescript
       const reply = await step.waitForEvent('wait-for-reply', {
         event: 'agent/customer.message',
         timeout: `${timerDurationMs}ms`,
         match: 'data.sessionId',
       })
       ```
    5. Si reply: return `{ status: 'responded', action: 'customer_replied' }`
    6. Si timeout: ejecutar timer en step.run('execute-timer', async () => { ... })

    **execute-timer step (dentro de step.run):**

    a. Verificar agente sigue enabled:
    ```typescript
    const supabase = createAdminClient()
    const { data: conv } = await supabase
      .from('conversations')
      .select('is_agent_enabled')
      .eq('id', conversationId)
      .single()
    if (conv?.is_agent_enabled === false) {
      return { status: 'skipped', action: 'agent_disabled' }
    }
    ```

    b. Leer session via SessionManager:
    ```typescript
    const { SessionManager } = await import('@/lib/agents/session-manager')
    const sm = new SessionManager()
    const session = await sm.getSession(sessionId)
    ```

    c. Construir V3AgentInput con systemEvent:
    ```typescript
    const rawState = session.state as any
    const accionesEjecutadas = rawState.acciones_ejecutadas ?? (() => {
      try { return JSON.parse((session.state.datos_capturados ?? {})['_v3:accionesEjecutadas'] ?? '[]') }
      catch { return [] }
    })()
    const intentsVistos = (session.state.intents_vistos ?? []).map(
      (r: any) => typeof r === 'string' ? r : r.intent
    )

    const v3Input: V3AgentInput = {
      message: '',  // No customer message for timer
      history: [],  // Production reads from DB inside processMessage
      currentMode: session.current_mode,
      intentsVistos,
      templatesEnviados: session.state.templates_enviados ?? [],
      datosCapturados: session.state.datos_capturados ?? {},
      packSeleccionado: session.state.pack_seleccionado as string | null,
      accionesEjecutadas,
      turnNumber: 0,  // Timer turns don't increment turn counter
      workspaceId,
      systemEvent: { type: 'timer_expired', level: level as 0|1|2|3|4|5|6|7|8 },
    }
    ```

    d. Llamar v3 processMessage:
    ```typescript
    const { processMessage } = await import('@/lib/agents/somnio-v3/somnio-v3-agent')
    const output = await processMessage(v3Input)
    ```

    e. Enviar templates via WhatsApp (reusar helpers de agent-timers.ts pero COPIAR, no importar — mantener independencia):
    - Copiar las funciones helper `getWhatsAppApiKey()`, `getConversationPhone()`, `sendWhatsAppMessage()` al inicio del archivo. Son 3 funciones utilitarias simples. NO importar de agent-timers.ts para evitar acoplamiento v1/v3.
    - Para cada template en output.templates (o output.messages como fallback):
      ```typescript
      const { sendTextMessage } = await import('@/lib/whatsapp/api')
      // send each message with char delay
      ```
    - Insertar mensajes en DB como outbound (mismo patron que agent-timers.ts sendWhatsAppMessage helper).
    - Actualizar conversations.last_message_at.

    f. Guardar state updates:
    ```typescript
    const { SessionManager: SM } = await import('@/lib/agents/session-manager')
    const sessionManager = new SM()
    // Update state
    await supabase.from('session_state').update({
      datos_capturados: output.datosCapturados,
      templates_enviados: output.templatesEnviados,
      pack_seleccionado: output.packSeleccionado,
      acciones_ejecutadas: output.accionesEjecutadas,
    }).eq('session_id', sessionId)
    // Update mode if changed
    if (output.newMode && output.newMode !== session.current_mode) {
      await supabase.from('agent_sessions').update({
        current_mode: output.newMode,
      }).eq('id', sessionId)
    }
    ```

    g. Si shouldCreateOrder, crear orden via domain:
    ```typescript
    if (output.shouldCreateOrder && output.orderData) {
      const { createProductionAdapters } = await import('@/lib/agents/engine-adapters/production')
      const adapters = createProductionAdapters({
        workspaceId, conversationId, phoneNumber,
        agentId: 'somnio-sales-v3',
      })
      const isOfiInter = output.datosCapturados['_v3:ofiInter'] === 'true'
      await adapters.orders.createOrder({
        datosCapturados: output.orderData.datosCapturados,
        packSeleccionado: output.orderData.packSeleccionado,
        workspaceId, sessionId,
        valorOverride: output.orderData.valorOverride,
        isOfiInter,
        cedulaRecoge: output.datosCapturados.cedula_recoge,
      })
    }
    ```

    h. Return result:
    ```typescript
    return {
      status: 'timeout',
      action: `timer_L${level}_expired`,
      messagesSent: sentCount,
      newMode: output.newMode,
      shouldCreateOrder: output.shouldCreateOrder,
    }
    ```

    **Export:**
    ```typescript
    export const v3TimerFunctions = [v3Timer]
    ```

    **route.ts — Registrar v3 timer functions:**

    Agregar import:
    ```typescript
    import { v3TimerFunctions } from '@/inngest/functions/agent-timers-v3'
    ```

    Agregar al array de functions:
    ```typescript
    functions: [
      ...agentTimerFunctions,
      ...agentProductionFunctions,
      ...automationFunctions,
      ...robotOrchestratorFunctions,
      ...godentistReminderFunctions,
      ...v3TimerFunctions,  // V3 timer system
      taskOverdueCron,
    ],
    ```

    Actualizar JSDoc comment para incluir v3-timer description.
  </action>
  <verify>
    `npx tsc --noEmit` pasa sin errores.
    `v3TimerFunctions` exportado y registrado en serve route.
    La funcion usa concurrency key por sessionId.
    El settle de 5s esta presente antes del waitForEvent.
  </verify>
  <done>
    - `agent-timers-v3.ts` creado con 1 funcion generica `v3Timer`
    - Trigger: `agent/v3.timer.started` → settle 5s → waitForEvent customer.message → timeout → v3 processMessage con systemEvent
    - Concurrency 1 por sessionId
    - Templates enviados via WhatsApp + guardados en DB
    - State updates persistidos despues de timer expiration
    - Order creation si shouldCreateOrder=true
    - Registrado en `route.ts` serve function array
    - V1 timer functions intactas (zero regression)
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — zero type errors
2. Grep: `agent/v3.timer.started` aparece en events.ts, v3-timer.ts, agent-timers-v3.ts
3. Grep: `V3_TIMER_DURATIONS` aparece en constants.ts y v3-timer.ts
4. Grep: `v3TimerFunctions` aparece en agent-timers-v3.ts y route.ts
5. V1 files sin cambios: agent-timers.ts, timer.ts, unified-engine.ts (git diff confirma zero changes)
6. createProductionAdapters sin agentId sigue retornando ProductionTimerAdapter (v1 default)
</verification>

<success_criteria>
- V3 timer event types registrados en Inngest type system
- V3_TIMER_DURATIONS con 3 presets x 9 niveles, valores identicos a sandbox TIMER_PRESETS
- V3ProductionTimerAdapter traduce signal() → inngest.send(agent/v3.timer.started)
- Factory rutea timer adapter por agentId (v3 vs default v1)
- 1 funcion Inngest generica maneja L0-L8 via systemEvent
- Registrado en Inngest serve route
- `npx tsc --noEmit` limpio
- V1 sistema de timers completamente intacto
</success_criteria>

<output>
After completion, create `.planning/quick/028-v3-production-fase-2-timer-system/028-SUMMARY.md`
</output>

# Refactor: Sandbox Timer System → State-Driven

## Motivacion

Despues del refactor two-track (tt-01, tt-02) y la eliminacion de ingest (quick-012), el pipeline v3 es state-driven: sales track decide QUE HACER, response track decide QUE DECIR, y el pipeline coordina timers.

Pero el **sandbox** sigue usando el patron viejo: un simulador de timers del lado del cliente (`IngestTimerSimulator`) que evalua niveles, decide acciones, inyecta mensajes hardcodeados, cambia modes directamente, y encadena timers manualmente. Esto contradice la arquitectura y causa bugs (intent "otro" contaminando intentsVistos, promos no enviadas via response track).

## Problema actual

### El sandbox tiene 2 sistemas de timer paralelos:

1. **IngestTimerSimulator** (ingest-timer.ts) — timer principal L0-L4
   - Evalua niveles con su propia logica (TIMER_LEVELS[].evaluate())
   - Decide acciones al expirar (buildAction() → send_message, transition_mode, create_order)
   - Cambia el mode directamente en el frontend (setState)
   - Encadena timers manualmente (L2 → triggerPromos → startTimerForLevel(3))
   - Inyecta mensajes hardcodeados (no de templates DB)

2. **Silence timer** (sandbox-layout.tsx líneas 411-456) — retoma por silencio
   - Timer separado con su propio countdown
   - Inyecta retake messages hardcodeados (SILENCE_RETAKE_FULL, SILENCE_RETAKE_SHORT)
   - Lógica de dedup de retake en el frontend

### Flujo actual (roto):

```
Timer L2 expira (frontend)
  → IngestTimerSimulator.buildAction() = { type: 'transition_mode', targetMode: 'ofrecer_promos' }
  → sandbox-layout cambia mode directamente: setState({ currentMode: 'ofrecer_promos' })
  → sandbox-layout llama /api/sandbox/process con forceIntent: 'ofrecer_promos'
  → Pipeline traduce forceIntent → systemEvent: { timer_expired, level: 2 }
  → Comprehension se salta → intent.primary = 'otro' (contamina intentsVistos)
  → Sales track busca transicion para timer_expired:2
  → Response track busca templates... pero frontend ya cambio el mode
```

### Flujo correcto (state-driven):

```
Timer countdown expira (frontend — solo countdown, cero logica)
  → sandbox-layout llama /api/sandbox/process con systemEvent: { timer_expired, level: 2 }
  → Pipeline procesa normalmente:
    → C3 merge (sin datos nuevos, changes.hasNewData = false)
    → Sales track: systemEvent timer_expired:2 → transicion → ofrecer_promos
    → Response track: salesAction ofrecer_promos → templates de DB
  → Pipeline retorna: messages + newState + timerSignals
  → Sandbox: muestra mensajes, actualiza state, arranca siguiente timer si hay signal
```

## Objetivo

1. Sandbox timer = **solo countdown** (start, tick, expire — cero logica de evaluacion/decision)
2. Al expirar: enviar `systemEvent` al pipeline (no forceIntent, no buildAction)
3. Pipeline decide todo (via sales track + response track)
4. Retoma de silencio = mismo flujo (systemEvent, no timer separado)
5. Eliminar forceIntent adapter del pipeline
6. Eliminar mensajes hardcodeados del frontend

## Archivos a modificar

### 1. `src/lib/sandbox/ingest-timer.ts` → Simplificar a countdown puro

**Eliminar:**
- TIMER_LEVELS array completo (evaluacion de niveles)
- TIMER_ALL_FIELDS, FIELD_LABELS (mensajes hardcodeados)
- evaluateLevel() method
- reevaluateLevel() method
- buildAction() y TimerAction concept
- setContextProvider() y contextProvider

**Mantener/Refactorizar:**
- IngestTimerSimulator class → renombrar a `TimerCountdown` o mantener nombre
- start(level, durationMs) — arranca countdown
- stop() — detiene countdown
- pause() / resume() — pausa/reanuda
- getState() — estado actual
- destroy() — cleanup
- onTick callback
- onExpire callback: ahora solo retorna `(level: number) => void` (sin action)

**Resultado:** ~100 lineas en vez de ~448. Solo hace countdown.

```typescript
export class TimerCountdown {
  constructor(
    onTick: (remainingMs: number, level: number) => void,
    onExpire: (level: number) => void,  // solo level, sin action
  )

  start(level: number, durationMs: number): void
  stop(): void
  pause(): void
  resume(): void
  getState(): TimerState
  destroy(): void
}
```

**TIMER_PRESETS y TIMER_DEFAULTS se mantienen** — el sandbox necesita saber duraciones para cada nivel. Pero la logica de QUE nivel aplicar ya no vive aqui.

### 2. `src/lib/sandbox/types.ts` → Limpiar tipos de timer

**Eliminar:**
- TimerAction interface (ya no hay actions del lado del cliente)
- TimerEvalContext interface (ya no hay evaluacion del lado del cliente)
- TimerLevelConfig interface (ya no hay level definitions del lado del cliente)

**Mantener:**
- TimerState (para display del countdown)
- TimerConfig (duraciones por nivel)
- TimerPreset
- SilenceTimerState → eliminar (se unifica con timer principal via level='silence')

### 3. `src/app/(dashboard)/sandbox/components/sandbox-layout.tsx` → Refactor mayor

**3a. Timer expiration handler (lineas 157-298) → Simplificar**

**ANTES (handleTimerExpire):**
```typescript
// 100+ lineas de: inyectar mensaje, cambiar mode, triggerPromos, triggerOrderCreation, chain timers
```

**DESPUES:**
```typescript
const handleTimerExpire = useCallback((level: number) => {
  // Timer expiró — enviar al pipeline como system event
  const processTimerExpiry = async () => {
    const currentState = stateRef.current
    const history = messagesRef.current.map(m => ({ role: m.role, content: m.content }))
    const currentDebugTurns = debugTurnsRef.current

    try {
      setIsTyping(true)
      const response = await fetch('/api/sandbox/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `[timer expired: level ${level}]`,
          state: currentState,
          history,
          turnNumber: currentDebugTurns.length + 1,
          systemEvent: { type: 'timer_expired', level },
          agentId: agentIdRef.current,
        }),
      })
      const result = await response.json()
      setIsTyping(false)

      // Mostrar mensajes del pipeline (vienen de response track, no hardcodeados)
      if (result.success && result.messages?.length > 0) {
        for (const msg of result.messages) {
          const assistantMsg: SandboxMessage = {
            id: `msg-${Date.now()}-timer-${Math.random().toString(36).slice(2, 7)}`,
            role: 'assistant' as const,
            content: msg,
            timestamp: new Date().toISOString(),
          }
          setMessages(prev => [...prev, assistantMsg])
          await new Promise(r => setTimeout(r, 2000))
        }
      }

      // Actualizar state y debug
      if (result.newState) setState(result.newState)
      if (result.debugTurn) {
        setDebugTurns(prev => [...prev, result.debugTurn])
        setTotalTokens(prev => prev + (result.debugTurn.tokens?.tokensUsed ?? 0))
      }

      // Procesar timer signal del pipeline para siguiente timer
      processTimerSignal(result.timerSignal)
    } catch (err) {
      setIsTyping(false)
      console.error(`[Timer L${level}] Error:`, err)
    }
  }

  // Reset display
  setTimerState({ active: false, level: null, levelName: '', remainingMs: 0, paused: false })
  setTimeout(() => processTimerExpiry(), 200)
}, [])
```

**3b. Timer signal processing (lineas 562-602) → Simplificar**

**ANTES:**
```typescript
// evaluateLevel(), reevaluateLevel(), buildEvalContext... 40 lineas de logica
```

**DESPUES:**
```typescript
function processTimerSignal(signal?: { type: string; level?: string; reason?: string }) {
  if (!signal || !timerEnabledRef.current) return

  if (signal.type === 'start' && signal.level) {
    // Pipeline dice: arranca timer de nivel X
    const levelNum = parseLevelNumber(signal.level) // 'L0' → 0, 'L1' → 1, etc.
    if (levelNum !== null) {
      const durationS = timerConfig.levels[levelNum] ?? TIMER_DEFAULTS.levels[levelNum]
      timerRef.current?.start(levelNum, durationS * 1000)
    } else if (signal.level === 'silence') {
      // Retoma — usar timer de silencio con duracion configurada
      startSilenceCountdown()
    }
  } else if (signal.type === 'reevaluate' && signal.level) {
    const levelNum = parseLevelNumber(signal.level)
    if (levelNum !== null) {
      const durationS = timerConfig.levels[levelNum] ?? TIMER_DEFAULTS.levels[levelNum]
      timerRef.current?.start(levelNum, durationS * 1000) // restart con nueva duracion
    }
  } else if (signal.type === 'cancel') {
    timerRef.current?.stop()
    setTimerState({ active: false, level: null, levelName: '', remainingMs: 0, paused: false })
  }
}
```

**3c. Silence timer (lineas 394-456) → Unificar con timer principal**

**ELIMINAR** el sistema de silence timer separado:
- cancelSilenceTimer, startSilenceTimer
- silenceTimerState, silenceIntervalRef, silenceTimeoutRef
- silenceDurationRef, retakeTemplateRef
- SILENCE_RETAKE_FULL, SILENCE_RETAKE_SHORT imports

**REEMPLAZAR** con: cuando pipeline retorna timerSignal `{ start, silence }`, el sandbox arranca un countdown de silencio. Al expirar, envía `systemEvent: { type: 'silence_expired' }` al pipeline. El pipeline decide si enviar retake message.

NOTA: Esto requiere agregar `silence_expired` como SystemEvent en el pipeline (ver seccion 5).

**Alternativa minima (si no queremos tocar el pipeline de silencio):**
Mantener el silence timer pero sin mensajes hardcodeados. Al expirar, enviar al pipeline con systemEvent y dejar que response track genere el retake. Esto es mas trabajo en el pipeline pero mas limpio.

**Recomendacion:** Alternativa minima por ahora. El silence timer sigue existiendo como countdown separado en el sandbox, pero al expirar envía al pipeline en vez de inyectar mensajes hardcodeados. El pipeline ya tiene el catch-all que genera `{ start, silence }` — solo falta el handler para cuando ese silence timer expira.

**3d. Timer initialization (lineas 306-342) → Simplificar**

**ELIMINAR:**
- setContextProvider() — ya no hay evaluacion del lado del cliente
- TIMER_LEVELS import

**MANTENER:**
- Inicializacion del countdown (ahora mas simple)

### 4. `src/app/api/sandbox/process/route.ts` → Aceptar systemEvent

**Agregar** `systemEvent` al body parsing:
```typescript
const { message, state, history, turnNumber, crmAgents, workspaceId, forceIntent, systemEvent, agentId } = body as {
  // ...existing...
  systemEvent?: { type: string; level?: number }
}
```

**Pasar** al V3Engine:
```typescript
const v3Result = await v3Engine.processMessage({
  message,
  state,
  history: history ?? [],
  turnNumber: turnNumber ?? 1,
  workspaceId: workspaceId ?? 'sandbox-workspace',
  forceIntent,  // mantener para backward compat temporal
  systemEvent,  // nuevo
})
```

### 5. `src/lib/agents/somnio-v3/engine-v3.ts` → Pasar systemEvent

**Agregar** systemEvent al V3EngineInput:
```typescript
export interface V3EngineInput {
  // ...existing...
  forceIntent?: string  // deprecated, mantener para backward compat
  systemEvent?: { type: string; level?: number }
}
```

**Pasar** al processMessage:
```typescript
const output = await processMessage({
  // ...existing...
  forceIntent: input.forceIntent,
  systemEvent: input.systemEvent as any,  // cast to SystemEvent
})
```

### 6. `src/lib/agents/somnio-v3/somnio-v3-agent.ts` → Limpiar forceIntent adapter

**Fase 1 (este refactor):** Mantener forceIntent adapter pero priorizar systemEvent directo:
```typescript
// systemEvent directo tiene prioridad sobre forceIntent
let systemEvent: SystemEvent | undefined = input.systemEvent
if (!systemEvent && input.forceIntent) {
  // Legacy fallback — adapter para backward compat
  switch (input.forceIntent) { ... }
}
```

**Fase 2 (futuro cleanup):** Eliminar forceIntent completamente cuando sandbox ya no lo use.

### 7. Pipeline: handler para silence timer expiry

**Agregar** `silence_expired` como SystemEvent en types.ts:
```typescript
export type SystemEvent =
  | { type: 'timer_expired'; level: 2 | 3 | 4 }
  | { type: 'silence_expired' }  // NUEVO
  | { type: 'ingest_complete'; result: 'datos_completos' | 'ciudad_sin_direccion' }
  | { type: 'readiness_check'; ready_for: 'promos' | 'confirmacion' }
```

**Agregar** transicion en transitions.ts para `silence_expired`:
- En todas las fases: silence_expired → response track genera retake message
- O mas simple: en somnio-v3-agent.ts, si systemEvent es silence_expired, forzar un template de retake

**Alternativa mas simple:** NO agregar silence_expired como SystemEvent. Cuando el silence timer expira en el sandbox, enviar un mensaje normal `[retoma]` con un nuevo forceIntent `retoma` que se mapea a un template de retake en response track. Esto evita tocar transitions.ts.

**Recomendacion:** Agregar `timer_expired` con level 0 y level 1 para retomas normales (L0 = sin datos, L1 = datos parciales ya existen). Para silencio de ack, agregar level 5 o un tipo separado. Pero todo esto ya se maneja en produccion via Inngest — el sandbox solo necesita simular el efecto. La forma mas simple: al expirar silence, enviar `systemEvent: { type: 'timer_expired', level: 0 }` y dejar que el pipeline genere el mensaje de retoma via la transicion existente de timer_expired.

## Tabla de timer signals → countdown mapping

| Pipeline signal | Sandbox action |
|-----------------|----------------|
| `{ start, L0 }` | Start countdown: timerConfig.levels[0] seconds |
| `{ start, L1 }` | Start countdown: timerConfig.levels[1] seconds |
| `{ reevaluate, L2 }` | Restart countdown: timerConfig.levels[2] seconds |
| `{ start, L3 }` | Start countdown: timerConfig.levels[3] seconds |
| `{ start, L4 }` | Start countdown: timerConfig.levels[4] seconds |
| `{ start, silence }` | Start silence countdown: silenceDurationMs |
| `{ cancel }` | Stop countdown |

| Countdown expires | Sandbox sends to pipeline |
|-------------------|---------------------------|
| Level 0 | `systemEvent: { type: 'timer_expired', level: 0 }` (NUEVO — agregar a SystemEvent union) |
| Level 1 | `systemEvent: { type: 'timer_expired', level: 1 }` (NUEVO — agregar a SystemEvent union) |
| Level 2 | `systemEvent: { type: 'timer_expired', level: 2 }` |
| Level 3 | `systemEvent: { type: 'timer_expired', level: 3 }` |
| Level 4 | `systemEvent: { type: 'timer_expired', level: 4 }` |
| Silence | `systemEvent: { type: 'timer_expired', level: 0 }` (reusa retoma) |

NOTA: Actualmente `timer_expired.level` solo acepta `2 | 3 | 4`. Hay que expandir a `0 | 1 | 2 | 3 | 4` para los niveles de retoma.

## Transiciones necesarias para timer_expired L0 y L1

Agregar en transitions.ts:
- `timer_expired:0` en phase `capturing_data` → accion `pedir_datos` (retoma sin datos)
- `timer_expired:1` en phase `capturing_data` → accion `pedir_datos` (retoma datos parciales, extraContext con campos faltantes)

Estas transiciones generan los mensajes que antes eran hardcodeados en ingest-timer.ts:
- L0: "Quedamos pendientes a tus datos..." → ahora sale del template `pedir_datos`
- L1: "Para poder despachar tu producto nos faltaria:..." → ahora sale del template `pedir_datos` con campos_faltantes

## Scope

### Cambiar:
- `src/lib/sandbox/ingest-timer.ts` — simplificar a countdown puro
- `src/lib/sandbox/types.ts` — limpiar tipos
- `src/app/(dashboard)/sandbox/components/sandbox-layout.tsx` — refactor timer handler
- `src/app/api/sandbox/process/route.ts` — aceptar systemEvent
- `src/lib/agents/somnio-v3/engine-v3.ts` — pasar systemEvent
- `src/lib/agents/somnio-v3/somnio-v3-agent.ts` — priorizar systemEvent sobre forceIntent
- `src/lib/agents/somnio-v3/types.ts` — expandir timer_expired levels a 0-4
- `src/lib/agents/somnio-v3/transitions.ts` — agregar transiciones L0, L1
- `src/app/(dashboard)/sandbox/components/debug-panel/debug-v3.tsx` — actualizar seccion Ingest & Timers

### NO tocar:
- `src/lib/agents/engine/unified-engine.ts` (produccion, no cambia)
- `src/lib/agents/engine-adapters/` (produccion, no cambia)
- `src/lib/agents/somnio-v3/sales-track.ts` (ya absorbio ingest en quick-012)
- `src/lib/agents/somnio-v3/response-track.ts` (ya genera templates por accion)

## Riesgo

- BAJO para sandbox (feature flag USE_SOMNIO_V3 aisla cambios)
- ZERO para produccion (engine-adapter.ts no se toca)
- Timer presets (real/rapido/instantaneo) se mantienen — solo cambia quien decide
- forceIntent se mantiene como fallback temporal para v1/v2 engines

## Orden de ejecucion sugerido

1. **Task 1:** Expandir SystemEvent + agregar transiciones L0/L1 en transitions.ts
2. **Task 2:** API route + engine-v3 aceptan systemEvent directo
3. **Task 3:** Simplificar IngestTimerSimulator a countdown puro
4. **Task 4:** Refactorizar sandbox-layout: timer expiry → systemEvent, unificar silence
5. **Task 5:** Cleanup: eliminar tipos obsoletos, actualizar debug panel

Nota: Task 1-2 son backward compatible (forceIntent sigue funcionando). Task 3-4 son el cambio breaking en el sandbox. Task 5 es cleanup.

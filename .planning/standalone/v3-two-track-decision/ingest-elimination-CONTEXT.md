# Eliminacion de Ingest + Timers Unificados en Sales Track

## Motivacion

Despues del refactor two-track (tt-01, tt-02), ingest perdio su responsabilidad principal (el silent cut). Lo que queda es un middleman que:
1. Redescubre cambios de estado que C3 (mergeAnalysis) ya conoce
2. Decide timers L1/L2 (decision que pertenece a sales track)
3. Emite system events que sales track consume

Ademas, `silenceDetected` es un concepto legacy que contradice la filosofia two-track ("silencio = ausencia de output"). Causa un bug real: en captura + datos parciales se activan 2 timers simultaneos (L1 de ingest + retoma de silenceDetected).

## Objetivo

- Eliminar ingest.ts como modulo decisor
- Mover TODOS los timers a sales track (L0-L4 + retoma)
- C3 (mergeAnalysis) reporta que cambio como metadata, no como decision
- Eliminar `silenceDetected` del pipeline
- Pipeline catch-all: si 0 mensajes y 0 timers → timer de retoma

## Pipeline actual vs propuesto

### Actual (6 pasos, timers en 3 lugares)
```
C2 (Claude) → C3 (merge) → C5 (gates) → Ingest (detect + decide timers) → Guards → Sales Track → Response Track
                                           ↑ timers L1/L2                    ↑ timers L0,L3,L4    ↑ silenceDetected (pipeline)
```

### Propuesto (5 pasos, timers en 1 lugar)
```
C2 (Claude) → C3 (merge + changes) → C5 (gates) → Guards → Sales Track (ALL decisions) → Response Track
                                                              ↑ timers L0-L4 + retoma
```

## Archivos a modificar

### 1. `src/lib/agents/somnio-v3/state.ts` — mergeAnalysis retorna cambios

**Cambio:** `mergeAnalysis()` retorna `{ state, changes }` en vez de solo `state`.

```typescript
export interface StateChanges {
  newFields: string[]           // campos que pasaron de null a valor
  filled: number                // total campos criticos llenos
  criticalComplete: boolean     // todos los criticos llenos
  ciudadJustArrived: boolean    // ciudad paso de null a valor
  hasNewData: boolean           // al menos 1 campo nuevo
}

export function mergeAnalysis(
  state: AgentState,
  analysis: MessageAnalysis
): { state: AgentState; changes: StateChanges }
```

La info ya se calcula internamente en mergeAnalysis (lineas 83-88 iteran dataKeys y aplican valores). Solo hay que trackear cuales cambiaron:

```typescript
const newFields: string[] = []
for (const key of dataKeys) {
  const value = fields[key]
  if (value !== null && value !== undefined && value.trim() !== '') {
    if (updated.datos[key] === null || updated.datos[key]?.trim() === '') {
      newFields.push(key)
    }
    updated.datos[key] = value
  }
}
```

Y al final:
```typescript
const criticalFields = state.ofiInter ? CRITICAL_FIELDS_OFI_INTER : CRITICAL_FIELDS_NORMAL
const filled = criticalFields.filter(f => updated.datos[f]?.trim()).length
return {
  state: updated,
  changes: {
    newFields,
    filled,
    criticalComplete: filled === criticalFields.length && datosExtrasOk(updated),
    ciudadJustArrived: newFields.includes('ciudad'),
    hasNewData: newFields.length > 0,
  }
}
```

### 2. `src/lib/agents/somnio-v3/sales-track.ts` — absorbe toda la logica de ingest

**Input nuevo:**
```typescript
export function resolveSalesTrack(input: {
  phase: Phase
  intent: string
  isAcknowledgment: boolean
  sentiment: string
  state: AgentState
  gates: Gates
  changes: StateChanges        // ← nuevo (de C3)
  category: string             // ← nuevo (classification.category)
  systemEvent?: SystemEvent
}): SalesTrackOutput
```

**Logica nueva antes de las 5 condiciones actuales (entre system events y acks):**

```typescript
// --- Estado: auto-triggers por cambios de datos ---

// Ofi inter detection: ciudad llego sin direccion (solo modo normal)
if (!state.ofiInter && changes.ciudadJustArrived && !state.datos.direccion && !state.datos.barrio) {
  return {
    accion: 'ask_ofi_inter',
    reason: 'Ciudad sin direccion → preguntar ofi inter',
  }
}

// Datos completos auto-trigger (criticos + extras ok, promos no mostradas)
if (changes.criticalComplete && !promosMostradas(state)) {
  const ev: SystemEvent = { type: 'ingest_complete', result: 'datos_completos' }
  const key = systemEventToKey(ev)
  const match = resolveTransition(phase, key, state, gates)
  if (match) {
    return {
      accion: match.action,
      enterCaptura: match.output.enterCaptura,
      timerSignal: match.output.timerSignal
        ?? { type: 'cancel', reason: 'datos completos → system event' },
      reason: match.output.reason,
    }
  }
}

// --- Timers de datos (L1/L2) durante captura ---
// Solo si estamos en captura Y llego data nueva
if (state.enCapturaSilenciosa && changes.hasNewData) {
  // No retornar aqui — seguir al lookup de transiciones normal
  // Pero registrar el timer signal para incluirlo en el output
  if (changes.criticalComplete) {
    dataTimerSignal = { type: 'reevaluate', level: 'L2', reason: `criticos completos (${changes.filled} campos)` }
  } else if (changes.filled > 0) {
    dataTimerSignal = { type: 'start', level: 'L1', reason: `datos parciales (${changes.filled} campos)` }
  }
}
```

**Timer de retoma — NO va en sales track.** Va como catch-all en el pipeline (ver seccion 4). Sales track no sabe si response track producira mensajes, asi que no puede decidir retoma.

**Eliminar `ingestSystemEvent` del input** — ya no existe. Los system events de datos se detectan directamente de `changes`.

### 3. `src/lib/agents/somnio-v3/somnio-v3-agent.ts` — pipeline simplificado

**Quitar:**
- Import de `evaluateIngest` de `./ingest`
- Linea 123: `const ingestResult = evaluateIngest(...)`
- Lineas 125-127: push de ingestResult.timerSignal
- `ingestSystemEvent` del input de resolveSalesTrack
- `silenceDetected` de TODOS los returns (3 lugares: lineas 157, 253, 309)
- `ingestInfo` de los returns (o mantener para debug con datos derivados)
- El `prevState` ya no se necesita (C3 changes lo reemplaza)

**Agregar:**
- `const { state: mergedState, changes } = mergeAnalysis(state, analysis)` (en vez de `const mergedState = mergeAnalysis(...)`)
- Pasar `changes` y `category: analysis.classification.category` a resolveSalesTrack
- **Catch-all despues de response track:**

```typescript
// RETOMA CATCH-ALL: si el bot calla y nadie vigila, activar retoma
if (responseResult.messages.length === 0 && timerSignals.length === 0) {
  timerSignals.push({ type: 'start', level: 'silence', reason: 'silencio sin timer activo' })
}
```

**Quitar `silenceDetected` del V3AgentOutput:**
- Linea 253: ya no existe
- El campo sigue en la interfaz V3AgentOutput para backward compat pero siempre es `false`
- O mejor: eliminarlo y actualizar los consumidores

### 4. `src/lib/agents/somnio-v3/types.ts` — limpiar tipos

- Quitar `IngestAction` type (ya no hay ingest)
- Quitar `IngestResult` interface (ya no hay ingest)
- Agregar `StateChanges` interface (o importar de state.ts)
- `silenceDetected` en V3AgentOutput: cambiar a opcional o eliminar
- Actualizar `SalesTrackOutput` para aceptar data timer signal
- Quitar `ingestSystemEvent` de donde aplique

### 5. `src/lib/agents/somnio-v3/ingest.ts` — eliminar o vaciar

**Opcion A (eliminar):** Borrar el archivo. Ningun import lo referencia despues de los cambios.

**Opcion B (mantener como stub):** Dejar un comentario explicando que la logica se movio a C3 + sales track. Util para git blame.

Recomendacion: Opcion A. Git history preserva el archivo.

### 6. Consumidores de `silenceDetected` — actualizar

**`src/lib/agents/engine/unified-engine.ts` (linea 174):**
```typescript
// ANTES:
if (agentOutput.silenceDetected && this.adapters.timer.onSilenceDetected) {
  await this.adapters.timer.onSilenceDetected(...)
}

// DESPUES:
// Ya no se necesita. El timer de retoma llega como timerSignal normal.
// El adapter de timer ya procesa timerSignals con level='silence'.
// Verificar que el sandbox timer adapter y production timer adapter
// manejen timerSignal { type: 'start', level: 'silence' } correctamente.
```

**IMPORTANTE:** Verificar como el timer adapter actual maneja `level: 'silence'`:
- `src/lib/agents/engine-adapters/sandbox/timer.ts` — tiene onSilenceDetected, necesita tambien manejar silence en timerSignals
- `src/lib/agents/engine-adapters/production/timer.ts` — igual
- `src/app/(dashboard)/sandbox/components/sandbox-layout.tsx` (linea 600) — usa `result.silenceDetected` para `startSilenceTimer()`

**Dos caminos para los adapters:**

**Camino A (minimo, recomendado):** Mantener `silenceDetected` en el output pero derivarlo del catch-all:
```typescript
// En somnio-v3-agent.ts, despues del catch-all:
const hasSilenceTimer = timerSignals.some(s => s.level === 'silence')
// ... en el return:
silenceDetected: hasSilenceTimer,
```
Asi los consumidores (unified engine, sandbox) no cambian. Es un campo derivado, no una decision.

**Camino B (limpio, mas trabajo):** Eliminar `silenceDetected` y hacer que los timer adapters procesen `level: 'silence'` como señal de retoma. Requiere cambios en:
- unified-engine.ts
- sandbox/timer.ts
- production/timer.ts
- sandbox-layout.tsx
- engine-adapter.ts (produccion)

Recomendacion: **Camino A** para este quick fix. Camino B como cleanup futuro. El campo `silenceDetected` se vuelve derivado (no decisor) — es un adapter pattern, no un hack.

### 7. `src/lib/agents/somnio-v3/engine-v3.ts` — actualizar debug mapping

- Quitar mapping de `ingestInfo` (o derivar de changes)
- El debug panel ya no muestra ingest como paso separado (se fusiono con sales track en el debug cleanup anterior)

### 8. Debug panel — ya actualizado (quick-011)

El debug panel ya muestra Sales Track y Response Track. No necesita cambios adicionales. El campo `ingestDetails` en DebugTurn se vuelve opcional/deprecated.

## Datos disponibles para sales track (resumen)

Despues del refactor, sales track recibe:

```typescript
{
  phase: Phase                    // de derivePhase()
  intent: string                  // de comprehension
  isAcknowledgment: boolean       // de comprehension
  sentiment: string               // de comprehension
  category: string                // de comprehension (datos/pregunta/mixto/irrelevante)
  state: AgentState               // de C3 (mergedState)
  gates: Gates                    // de C5 (datosOk, datosCompletos, packElegido)
  changes: StateChanges           // de C3 (newFields, filled, criticalComplete, ciudadJustArrived)
  systemEvent?: SystemEvent       // de input (timer expired)
}
```

Y retorna:

```typescript
{
  accion?: TipoAccion
  enterCaptura?: boolean
  timerSignal?: TimerSignal       // puede ser L0-L4 (de transitions) o L1/L2 (de data changes)
  reason: string
}
```

## Tabla de timers unificada (todos en sales track)

| Timer | Cuando | Signal |
|-------|--------|--------|
| L0 | pedir_datos transition | `{ start, L0 }` via transitions.ts |
| L1 | primer dato en captura | `{ start, L1 }` via changes.filled > 0 |
| L2 | criticos completos en captura | `{ reevaluate, L2 }` via changes.criticalComplete |
| L3 | ofrecer_promos transition | `{ start, L3 }` via transitions.ts |
| L4 | mostrar_confirmacion transition | `{ start, L4 }` via transitions.ts |
| Retoma | 0 mensajes + 0 timers (catch-all) | `{ start, silence }` via pipeline |
| Cancel | orden creada, rechazo, etc | `{ cancel }` via transitions.ts |

## Casos de prueba (sandbox)

1. **Datos en captura** — enviar "Jose Romero" despues de pedir datos
   - ESPERADO: 1 timer (L1 datos parciales), NO retoma
   - Sales track: sin accion, timerSignal L1
   - Pipeline: 0 mensajes pero timerSignals.length > 0 → no agrega retoma

2. **Ack en captura** — enviar "ok" durante captura
   - ESPERADO: silencio natural, 1 timer retoma (catch-all)
   - Sales track: sin accion, sin timer
   - Pipeline: 0 mensajes, 0 timers → agrega retoma

3. **Ack fuera de captura** — enviar "ok" en conversacion
   - ESPERADO: silencio natural, 1 timer retoma
   - Sales track: sin accion, sin timer
   - Pipeline: 0 mensajes, 0 timers → agrega retoma

4. **Datos completos auto-trigger** — ultimo campo llega
   - ESPERADO: ofrecer_promos automatico, cancel timer
   - Sales track: changes.criticalComplete → transition datos_completos → ofrecer_promos

5. **Ciudad sin direccion** — enviar ciudad sin direccion
   - ESPERADO: ask_ofi_inter
   - Sales track: changes.ciudadJustArrived + !direccion → ask_ofi_inter

6. **"2" en captura (THE BUG)** — seleccion pack con datos ok
   - ESPERADO: mostrar_confirmacion, timer L4
   - Sales track: transition seleccion_pack + datosOk → mostrar_confirmacion

7. **"cuanto cuesta?" en captura** — intent informacional
   - ESPERADO: respuesta con precio, sin timer extra
   - Sales track: sin accion (no hay transition para precio)
   - Response track: precio ∈ INFORMATIONAL_INTENTS → template

8. **Timer expired** — L3 expira
   - ESPERADO: crear_orden
   - Sales track: systemEvent timer_expired:3 → transition → crear_orden

## Scope

- Archivos core: state.ts, sales-track.ts, somnio-v3-agent.ts, types.ts
- Eliminar: ingest.ts
- Adapters: cambio minimo (silenceDetected derivado, no decisor)
- Debug: engine-v3.ts mapping update
- NO tocar: engine-adapter.ts (produccion), response-track.ts, transitions.ts, guards.ts, comprehension.ts
- Backward compatible: sesiones viejas sin `changes` siguen funcionando (changes se computa cada turno)

## Riesgo

- BAJO para sandbox (feature flag USE_SOMNIO_V3 aisla cambios)
- ZERO para produccion (engine-adapter.ts no se toca)
- El refactor es sobre codigo que acabamos de escribir (tt-01, tt-02) — fresh en memoria

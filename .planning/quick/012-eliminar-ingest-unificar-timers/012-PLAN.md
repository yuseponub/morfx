---
phase: quick-012
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v3/state.ts
  - src/lib/agents/somnio-v3/types.ts
  - src/lib/agents/somnio-v3/sales-track.ts
  - src/lib/agents/somnio-v3/somnio-v3-agent.ts
  - src/lib/agents/somnio-v3/engine-v3.ts
  - src/lib/agents/somnio-v3/engine-adapter.ts
  - src/lib/agents/somnio-v3/ingest.ts
autonomous: true

must_haves:
  truths:
    - "Todos los timers (L0-L4, retoma) se deciden en un solo lugar (sales track + pipeline catch-all)"
    - "ingest.ts eliminado — no existe como modulo"
    - "silenceDetected se deriva de timerSignals (backward compat), no se decide en pipeline"
    - "C3 (mergeAnalysis) retorna {state, changes} con metadata de campos nuevos"
    - "Pipeline catch-all: 0 mensajes + 0 timers = timer de retoma"
    - "Consumidores (unified engine, sandbox, engine-adapter) siguen funcionando sin cambios de interfaz"
  artifacts:
    - path: "src/lib/agents/somnio-v3/state.ts"
      provides: "mergeAnalysis con StateChanges"
      contains: "StateChanges"
    - path: "src/lib/agents/somnio-v3/sales-track.ts"
      provides: "Toda logica de datos (ofi inter, datos completos, timers L1/L2)"
      contains: "changes.ciudadJustArrived"
    - path: "src/lib/agents/somnio-v3/somnio-v3-agent.ts"
      provides: "Pipeline sin ingest, con catch-all de retoma"
  key_links:
    - from: "state.ts mergeAnalysis"
      to: "somnio-v3-agent.ts"
      via: "destructured return {state, changes}"
      pattern: "const \\{ state.*changes \\} = mergeAnalysis"
    - from: "somnio-v3-agent.ts"
      to: "sales-track.ts"
      via: "changes param"
      pattern: "changes,"
    - from: "somnio-v3-agent.ts catch-all"
      to: "timerSignals"
      via: "push silence timer when 0 messages + 0 timers"
      pattern: "responseResult.messages.length === 0 && timerSignals.length === 0"
---

<objective>
Eliminar ingest.ts como modulo decisor y unificar TODOS los timers en sales track + pipeline catch-all.

Purpose: Simplificar el pipeline de 6 pasos a 5, eliminando un middleman que redescubre cambios que C3 ya conoce. Fijar el bug de 2 timers simultaneos (L1 de ingest + retoma de silenceDetected) en captura + datos parciales.

Output: Pipeline limpio: C2 -> C3 (merge + changes) -> C5 (gates) -> Guards -> Sales Track (ALL decisions) -> Response Track. ingest.ts eliminado.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/012-eliminar-ingest-unificar-timers/012-CONTEXT.md (CONTEXT completo con todos los detalles de implementacion)
@src/lib/agents/somnio-v3/state.ts
@src/lib/agents/somnio-v3/types.ts
@src/lib/agents/somnio-v3/sales-track.ts
@src/lib/agents/somnio-v3/somnio-v3-agent.ts
@src/lib/agents/somnio-v3/ingest.ts
@src/lib/agents/somnio-v3/engine-v3.ts
@src/lib/agents/somnio-v3/engine-adapter.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: StateChanges en mergeAnalysis + limpiar tipos</name>
  <files>
    src/lib/agents/somnio-v3/state.ts
    src/lib/agents/somnio-v3/types.ts
  </files>
  <action>
**state.ts — mergeAnalysis retorna {state, changes}:**

1. Agregar interfaz `StateChanges` al inicio del archivo (exportada):
```typescript
export interface StateChanges {
  newFields: string[]           // campos que pasaron de null/vacio a valor
  filled: number                // total campos criticos llenos
  criticalComplete: boolean     // todos los criticos llenos + extras ok
  ciudadJustArrived: boolean    // ciudad paso de null a valor
  hasNewData: boolean           // al menos 1 campo nuevo
}
```

2. Modificar `mergeAnalysis()` signature: retorna `{ state: AgentState; changes: StateChanges }` en vez de `AgentState`.

3. Dentro del loop de dataKeys (lineas 83-88), trackear campos nuevos:
```typescript
const newFields: string[] = []
for (const key of dataKeys) {
  const value = fields[key]
  if (value !== null && value !== undefined && value.trim() !== '') {
    // Track if this is a NEW field (was null/empty, now has value)
    if (updated.datos[key] === null || !updated.datos[key]?.trim()) {
      newFields.push(key)
    }
    updated.datos[key] = value
  }
}
```

4. Al final de mergeAnalysis, calcular y retornar changes:
```typescript
const criticalFields = state.ofiInter ? CRITICAL_FIELDS_OFI_INTER : CRITICAL_FIELDS_NORMAL
const filled = criticalFields.filter(f => {
  const val = updated.datos[f as keyof DatosCliente]
  return val !== null && val.trim() !== ''
}).length

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

Nota: `datosExtrasOk` ya es funcion exportada en el mismo archivo. Usarla directamente.

**types.ts — limpiar tipos de ingest:**

1. Eliminar `IngestAction` type (linea 99)
2. Eliminar `IngestResult` interface (lineas 101-106)
3. Mantener TODO lo demas intacto — `V3AgentOutput.silenceDetected` se queda (backward compat, se derivara)
4. Mantener `V3AgentOutput.ingestInfo` como opcional (se eliminara del output pero el tipo no rompe nada)
5. En `AccionRegistrada.origen`, cambiar `'ingest'` por `'auto_trigger'` ya que ingest ya no existe como concepto:
   ```typescript
   origen: 'bot' | 'timer' | 'auto_trigger'
   ```
   (Ya dice 'auto_trigger' en la union, solo quitar 'ingest')

NO quitar `'ingest'` de la union de AccionRegistrada.origen todavia — hay sesiones en produccion con ese valor. Mantener backward compat.
  </action>
  <verify>
`npx tsc --noEmit 2>&1 | head -30` — puede haber errores esperados en somnio-v3-agent.ts (porque mergeAnalysis cambio de firma). Verificar que state.ts y types.ts compilan sin error propio.
  </verify>
  <done>
mergeAnalysis retorna `{state, changes}` con StateChanges. IngestAction e IngestResult eliminados de types.ts. El resto del pipeline aun no actualizado (errores de tipo esperados en agent.ts).
  </done>
</task>

<task type="auto">
  <name>Task 2: Sales track absorbe logica de ingest + pipeline simplificado</name>
  <files>
    src/lib/agents/somnio-v3/sales-track.ts
    src/lib/agents/somnio-v3/somnio-v3-agent.ts
  </files>
  <action>
**sales-track.ts — absorber logica de datos:**

1. Importar `StateChanges` de `./state` y agregar imports necesarios: `hasAction` de `./state`, `resolveTransition`, `systemEventToKey` de `./transitions`.

2. Actualizar input de `resolveSalesTrack`:
```typescript
export function resolveSalesTrack(input: {
  phase: Phase
  intent: string
  isAcknowledgment: boolean
  sentiment: string
  state: AgentState
  gates: Gates
  changes: StateChanges        // NUEVO (de C3)
  category: string             // NUEVO (classification.category)
  systemEvent?: SystemEvent
  // ELIMINADO: ingestSystemEvent
}): SalesTrackOutput
```

3. Agregar helper `promosMostradas` (copiar de ingest.ts):
```typescript
function promosMostradas(state: AgentState): boolean {
  return hasAction(state.accionesEjecutadas, 'ofrecer_promos') ||
    state.templatesMostrados.some(t =>
      t.includes('ofrecer_promos') || t.includes('promociones')
    )
}
```

4. Agregar logica de datos DESPUES del bloque de system events (seccion 1) y ANTES de la seccion de ingestSystemEvent (seccion 2). Reemplazar la seccion 2 (ingestSystemEvent) con:

```typescript
// ------------------------------------------------------------------
// 2. Auto-triggers por cambios de datos (absorbe logica de ingest)
// ------------------------------------------------------------------

// Ofi inter detection: ciudad llego sin direccion (solo modo normal)
if (!state.ofiInter && changes.ciudadJustArrived && !state.datos.direccion && !state.datos.barrio) {
  const key = systemEventToKey({ type: 'ingest_complete', result: 'ciudad_sin_direccion' })
  const match = resolveTransition(phase, key, state, gates)
  if (match) {
    return {
      accion: match.action,
      enterCaptura: match.output.enterCaptura,
      timerSignal: match.output.timerSignal,
      reason: match.output.reason,
    }
  }
  // Fallback if no transition found
  return {
    accion: 'ask_ofi_inter',
    reason: 'Ciudad sin direccion -> preguntar ofi inter',
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
        ?? { type: 'cancel', reason: 'datos completos -> system event' },
      reason: match.output.reason,
    }
  }
}

// Timer signals de datos (L1/L2) durante captura
let dataTimerSignal: TimerSignal | undefined
if (state.enCapturaSilenciosa && changes.hasNewData) {
  if (changes.criticalComplete) {
    dataTimerSignal = { type: 'reevaluate', level: 'L2', reason: `criticos completos (${changes.filled} campos)` }
  } else if (changes.filled > 0) {
    dataTimerSignal = { type: 'start', level: 'L1', reason: `datos parciales (${changes.filled} campos)` }
  }
}
```

5. Importar `TimerSignal` y `SystemEvent` en los imports de types.

6. Propagar `dataTimerSignal` — si el flujo llega al return final (seccion 5 fallback), incluirlo:
```typescript
return {
  reason: 'No transition - response track handles informational',
  timerSignal: dataTimerSignal,
}
```
Y en los otros returns que no tienen timerSignal propio, pasar `dataTimerSignal` como fallback:
- Seccion 3 (ack routing): mantener sin cambio (acks no generan data timers)
- Seccion 4 (intent lookup): si match tiene timerSignal usar ese, si no usar dataTimerSignal:
```typescript
if (match) {
  return {
    accion: match.action,
    enterCaptura: match.output.enterCaptura,
    timerSignal: match.output.timerSignal ?? dataTimerSignal,
    reason: match.output.reason,
  }
}
```

**somnio-v3-agent.ts — pipeline simplificado:**

1. Quitar import de `evaluateIngest` de `./ingest`.
2. Quitar import de `IngestResult` si lo hay.
3. Quitar `const prevState = { ...state, datos: { ...state.datos } }` (linea 49).

4. Cambiar linea 113 de:
```typescript
const mergedState = mergeAnalysis(state, analysis)
```
a:
```typescript
const { state: mergedState, changes } = mergeAnalysis(state, analysis)
```

5. Eliminar bloque de ingest (lineas 122-127):
```typescript
// ELIMINAR:
const ingestResult = evaluateIngest(analysis, mergedState, gates, prevState)
if (ingestResult.timerSignal) {
  timerSignals.push(ingestResult.timerSignal)
}
```

6. En el guard check (linea 133), quitar `!ingestResult.systemEvent`:
```typescript
// ANTES:
if (!systemEvent && !ingestResult.systemEvent) {
// DESPUES:
if (!systemEvent) {
```

7. Actualizar llamada a resolveSalesTrack:
```typescript
const salesResult = resolveSalesTrack({
  phase,
  intent: analysis.intent.primary,
  isAcknowledgment: analysis.classification.is_acknowledgment,
  sentiment: analysis.classification.sentiment,
  state: mergedState,
  gates,
  changes,                                    // NUEVO
  category: analysis.classification.category,  // NUEVO
  systemEvent,
  // ELIMINADO: ingestSystemEvent
})
```

8. Agregar catch-all DESPUES de response track (despues de linea ~233, antes del bloque "NATURAL SILENCE"):
```typescript
// RETOMA CATCH-ALL: si 0 mensajes producidos y nadie vigila, activar retoma
if (responseResult.messages.length === 0 && timerSignals.length === 0) {
  timerSignals.push({ type: 'start', level: 'silence', reason: 'silencio sin timer activo' })
}
```
IMPORTANTE: Este catch-all va ANTES del bloque "NATURAL SILENCE" return y ANTES del bloque "Build output" return, para que aplique a ambos paths.

9. Derivar `silenceDetected` de timerSignals en TODOS los returns:
```typescript
silenceDetected: timerSignals.some(s => s.level === 'silence'),
```
Reemplazar las 3 ocurrencias actuales:
- Linea 157: `silenceDetected: false` -> `silenceDetected: timerSignals.some(s => s.level === 'silence')`
- Linea 253: `silenceDetected: !salesResult.accion` -> `silenceDetected: timerSignals.some(s => s.level === 'silence')`
- Linea 309: `silenceDetected: false` -> `silenceDetected: timerSignals.some(s => s.level === 'silence')`

10. Quitar `ingestInfo` de los 2 returns que lo tienen (lineas ~277-282, ~342-347). O mejor: derivarlo de changes para backward compat de debug:
```typescript
ingestInfo: {
  action: 'respond',
  systemEvent: changes.criticalComplete ? { type: 'ingest_complete', result: 'datos_completos' } : undefined,
},
```
Esto mantiene el debug panel funcional. Alternativa mas limpia: simplemente no incluir `ingestInfo` (es opcional en el tipo).

11. En la linea de registro de accion (linea ~219), cambiar `ingestResult.systemEvent` reference:
```typescript
// ANTES:
origen: systemEvent ? 'timer'
      : ingestResult.systemEvent ? 'ingest'
      : 'bot',
// DESPUES:
origen: systemEvent ? 'timer' : 'bot',
```
  </action>
  <verify>
`npx tsc --noEmit 2>&1 | head -30` — debe compilar sin errores (o solo errores no relacionados a estos archivos). Verificar que no hay imports rotos de `./ingest` en ningun archivo.
  </verify>
  <done>
Sales track contiene toda la logica de datos (ofi inter, datos completos, L1/L2). Pipeline simplificado: C2 -> C3 -> C5 -> Guards -> Sales Track -> Response Track. Catch-all de retoma activo. silenceDetected derivado.
  </done>
</task>

<task type="auto">
  <name>Task 3: Eliminar ingest.ts + actualizar engine debug + verificar</name>
  <files>
    src/lib/agents/somnio-v3/ingest.ts
    src/lib/agents/somnio-v3/engine-v3.ts
    src/lib/agents/somnio-v3/engine-adapter.ts
  </files>
  <action>
1. **Eliminar `src/lib/agents/somnio-v3/ingest.ts`** — borrar el archivo completo.

2. **engine-v3.ts** — actualizar debug mapping:
   - Lineas 108-111: El `ingestDetails` mapping usa `output.ingestInfo`. Si Task 2 elimino `ingestInfo` del output, este campo sera undefined (safe — es opcional en DebugTurn). Si Task 2 lo mantuvo derivado, funciona igual.
   - No se necesitan cambios si ingestInfo se mantuvo como campo opcional derivado.
   - Si `ingestInfo` fue eliminado del output, quitar las lineas 108-111 del debug mapping tambien.

3. **engine-adapter.ts** — verificar que `silenceDetected` y `ingestInfo` siguen fluyendo:
   - `silenceDetected` (linea 149): sigue funcionando — ahora derivado de timerSignals en el output.
   - `ingestDetails` mapping (lineas 172-178): si ingestInfo fue eliminado, sera undefined (campo opcional).
   - NO hacer cambios en engine-adapter.ts — los tipos ya lo soportan como opcional.

4. **Verificar que no hay otros imports de `./ingest`:**
   - Buscar en todo `src/` por `from './ingest'` o `from "../ingest"` — no debe haber ninguno.
   - Buscar `evaluateIngest` — no debe aparecer en ningun archivo excepto el eliminado.

5. **Verificacion final completa:**
   - `npx tsc --noEmit` — 0 errores
   - Grep por `from.*ingest` en somnio-v3/ — solo debe aparecer en comprehension imports (comprehension-schema), no en ingest
   - Grep por `IngestResult|IngestAction|evaluateIngest` — 0 resultados
  </action>
  <verify>
```bash
npx tsc --noEmit
grep -r "from.*ingest" src/lib/agents/somnio-v3/ --include="*.ts" | grep -v comprehension | grep -v node_modules
grep -r "IngestResult\|IngestAction\|evaluateIngest" src/lib/agents/somnio-v3/ --include="*.ts"
```
Todos deben dar 0 resultados (excepto tsc que debe dar 0 errores).
  </verify>
  <done>
ingest.ts eliminado. 0 imports rotos. Pipeline completo compilando. Engine adapters (sandbox + produccion) funcionan con silenceDetected derivado y sin ingestInfo.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` compila sin errores
2. No existen imports de `./ingest` en ningun archivo v3
3. `IngestResult`, `IngestAction`, `evaluateIngest` no aparecen en codebase
4. `silenceDetected` sigue presente en V3AgentOutput (backward compat) pero derivado de timerSignals
5. mergeAnalysis retorna `{state, changes}` con StateChanges
6. Sales track tiene toda la logica de datos: ofi inter, datos completos, L1/L2
7. Pipeline catch-all genera timer de retoma cuando 0 mensajes + 0 timers
</verification>

<success_criteria>
- Pipeline simplificado de 6 a 5 pasos (sin ingest middleman)
- Todos los timers centralizados: L0-L4 en sales track via transitions, retoma en catch-all
- Bug de 2 timers simultaneos eliminado (ya no hay L1 de ingest + silenceDetected separado)
- Backward compat: silenceDetected sigue en output, consumidores no cambian
- Compilacion limpia sin errores de tipo
</success_criteria>

<output>
After completion, create `.planning/quick/012-eliminar-ingest-unificar-timers/012-SUMMARY.md`
</output>

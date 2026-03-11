# Quick 021: Consistencia datosCriticos vs datosCompletos

## Problema

Los nombres de variables de "datos" son inconsistentes y engañosos en el agente v3:

| Variable actual | Qué chequea realmente | Problema |
|---|---|---|
| `gates.datosOk` | Solo 6 campos críticos | Nombre ambiguo — "ok" no dice qué nivel |
| `gates.datosCompletos` | Críticos + barrio (sin correo) | **Nunca se usa** — código muerto |
| `changes.criticalComplete` | Críticos + barrio (sin correo) | Nombre dice "critical" pero incluye extras |
| `datosExtrasOk()` | Solo barrio (OR negación) | No incluye correo, y es redundante con datosCompletos |
| `datosCriticosOk()` | Los 6 críticos | Este nombre SÍ es correcto |

Problemas concretos:
1. **Correo no está en ningún gate** — nunca se valida como parte de "datos completos"
2. `criticalComplete` es mentira — incluye extras (barrio), no solo críticos
3. `datosExtrasOk()` solo chequea barrio, ignora correo
4. `gates.datosCompletos` se computa pero **nadie lo lee** — dead code
5. El auto-trigger `datos_completos` se dispara con `criticalComplete` que en realidad es "críticos + barrio" — no es "completos" de verdad

## Decisión del usuario

Dos niveles claros con flujo definido:

### Nivel 1: `datosCriticos`
Los 6 campos mínimos viables para crear orden:
- Normal: nombre, apellido, telefono, direccion, ciudad, departamento
- OfiInter: nombre, apellido, telefono, ciudad, departamento (sin direccion)

**Al completarse → start L2 timer (2 min de gracia para extras)**

### Nivel 2: `datosCompletos`
datosCriticos + (correo OR negación_correo) + (barrio OR negación_barrio)

**Al completarse → ofrecer_promos de inmediato (sin esperar timer)**

### Campos que NO bloquean nada
- `indicaciones_extra`: siempre opcional, bonus, nunca entra en gates
- ofiInter: NO se mezcla en la fórmula de datosCompletos — tiene sus propios CRITICAL_FIELDS_OFI_INTER

### Flujo en captura silenciosa
```
captura silenciosa
    │
    ├── datosCriticos JUST completed (pero no completos)
    │     → start L2 timer (2 min de gracia para extras)
    │     → sigue en captura
    │
    ├── datosCompletos JUST completed
    │     → auto:datos_completos → ofrecer_promos de una
    │
    └── L2 expira (solo tiene críticos, no completos)
          → ofrecer_promos de todas formas
```

### Transiciones por intent
Las transiciones por intent (`quiero_comprar`, `confirmar`, `seleccion_pack`) siguen usando `datosCriticos` como condición. Si el cliente pide comprar y tiene lo mínimo, se avanza.

## Cambios requeridos

### Archivo 1: `types.ts`
- Rename `Gates.datosOk` → `Gates.datosCriticos`
- `Gates.datosCompletos` ya existe pero cambiar su semántica (ahora incluye correo)

### Archivo 2: `state.ts`

**computeGates():**
```ts
{
  datosCriticos: datosCriticosOk(state),      // rename de datosOk
  datosCompletos: datosCriticosOk(state) && extrasOk(state),  // ahora incluye correo
  packElegido: state.pack !== null,
}
```

**Eliminar `datosExtrasOk()`** — reemplazar por lógica inline en computeGates o función privada que chequee correo + barrio.

Nueva lógica de extras (reemplaza datosExtrasOk):
```ts
function extrasOk(state: AgentState): boolean {
  const correoOk = (state.datos.correo !== null && state.datos.correo.trim() !== '') || state.negaciones.correo
  const barrioOk = (state.datos.barrio !== null && state.datos.barrio.trim() !== '') || state.negaciones.barrio
  return correoOk && barrioOk
}
```

Nota: ofiInter NO se mezcla aquí — el modo ofiInter ya tiene CRITICAL_FIELDS_OFI_INTER que excluye direccion. El barrio en ofiInter sigue siendo extra y se maneja igual.

**StateChanges:**
```ts
interface StateChanges {
  newFields: string[]
  filled: number
  hasNewData: boolean
  ciudadJustArrived: boolean
  datosCriticosJustCompleted: boolean   // antes: NO existía separado
  datosCompletosJustCompleted: boolean  // antes: criticalComplete (nombre engañoso)
}
```

**mergeAnalysis()** — ajustar cálculo de changes al final:
```ts
// Necesitamos saber si ANTES del merge los criticos/completos ya estaban ok
// para detectar "just completed" (transición de false → true)
const criticosBefore = datosCriticosOk(state)    // state ANTES del merge
const completosBefore = datosCriticosOk(state) && extrasOk(state)

// ... merge ...

const criticosAfter = datosCriticosOk(updated)
const completosAfter = datosCriticosOk(updated) && extrasOk(updated)

changes: {
  datosCriticosJustCompleted: !criticosBefore && criticosAfter,
  datosCompletosJustCompleted: !completosBefore && completosAfter,
}
```

**camposFaltantes()** — sin cambio (ya incluye barrio desde quick-020). Considerar agregar correo también para consistencia con datosCompletos.

**Eliminar `datosExtrasOk()` export** — ya no se usa fuera de state.ts

**Actualizar comentario** de Capa 5 (línea 5): `compute datosCriticos/datosCompletos/packElegido`

### Archivo 3: `sales-track.ts`

**Sección 2 (auto-triggers por cambios de datos):**
```ts
// Timer signal basado en cambios de datos durante captura
let dataTimerSignal: TimerSignal | undefined
if (state.enCapturaSilenciosa && changes.hasNewData) {
  if (changes.datosCriticosJustCompleted && !changes.datosCompletosJustCompleted) {
    // Críticos completos, faltan extras → L2 (2 min gracia)
    dataTimerSignal = { type: 'start', level: 'L2', reason: 'criticos completos, esperando extras' }
  } else if (changes.filled > 0 && !changes.datosCriticosJustCompleted) {
    // Datos parciales → L1
    dataTimerSignal = { type: 'start', level: 'L1', reason: `datos parciales (${changes.filled} campos)` }
  }
}

// Auto-trigger: datosCompletos → ofrecer_promos de una
if (changes.datosCompletosJustCompleted && !promosMostradas(state)) {
  → auto:datos_completos → ofrecer_promos
}
```

Nota: `changes.criticalComplete` ya no existe — reemplazado por los dos nuevos campos.

### Archivo 4: `transitions.ts`

**Rename en conditions:**
- Todas las `gates.datosOk` → `gates.datosCriticos`
- Todas las `!gates.datosOk` → `!gates.datosCriticos`
- Comentarios: actualizar "datosOk" → "datosCriticos" en las líneas de reason

**Líneas afectadas:** 72, 80, 83, 86, 90, 93, 96, 100, 103, 111, 114, 117, 121, 124, 128, 132, 135, 152, 155, 170, 180

## Código muerto a eliminar

1. `datosExtrasOk()` como función exportada — reemplazar por lógica privada en computeGates
2. `changes.criticalComplete` — reemplazado por `datosCriticosJustCompleted` + `datosCompletosJustCompleted`
3. Cualquier referencia a `datosExtrasOk` en comentarios

## Archivos NO afectados

- `somnio-v3-agent.ts` — no usa gates directamente, solo pasa a sales-track
- `response-track.ts` — usa `camposFaltantes()` que no cambia
- `guards.ts` — no usa gates de datos
- `comprehension.ts` — no usa gates
- `constants.ts` — CRITICAL_FIELDS no cambian
- `phase.ts` — no usa gates
- `engine-v3.ts` — solo pasa gates al debug, sin lógica propia

## Verificación

1. Buscar que NO quede ninguna referencia a `datosOk` (excepto v2 legacy)
2. Buscar que NO quede ninguna referencia a `datosExtrasOk`
3. Buscar que NO quede ninguna referencia a `criticalComplete`
4. `gates.datosCompletos` ahora SÍ se usa (en auto-trigger logic indirectamente via changes)
5. TypeScript compile sin errores

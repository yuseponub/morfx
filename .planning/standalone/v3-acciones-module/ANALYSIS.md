# Bot v3 — Migracion de Waterfall a State Machine basado en Acciones

**Fecha:** 2026-03-06
**Status:** Decisiones D1-D4 resueltas. Pendiente: D5 (forceIntent), edge cases.

## Problema

El decision engine actual (R0-R9) es un waterfall de prioridad: reglas ordenadas donde la primera que matchea gana. Esto genera:

1. **Ambiguedad por prioridad** — R5c y R7 hacen lo mismo en ciertas condiciones. Si cambias el orden de una, rompes otra.
2. **Reglas duplicadas** — R5+R5b+R5c, R6+R6b, R7+R7b son variantes del mismo intent en diferentes estados.
3. **Registro de acciones inconsistente** — 3 puntos de escritura, solo 3 de 9 acciones se registran, `crear_orden` se lee pero nunca se escribe.
4. **Conceptos mezclados** — intentsVistos, accionesEjecutadas y forceIntent mezclan intent del cliente, accion del bot y senal del sistema.

## Solucion: State Machine basado en Acciones

Migrar de "que regla gana?" a "en que fase estoy y que significa este intent aqui?".

### Arquitectura nueva

```
[Guards] → [Derivar fase de acciones] → [Tabla de transiciones (fase + intent → accion)]
```

1. **Guards** (cross-cutting, corren primero): baja confianza, escape intents
2. **Fase derivada**: la ultima accion significativa determina la fase actual
3. **Tabla de transiciones**: declarativa, sin ambiguedad — cada (fase, intent) tiene exactamente una salida
4. **Fallback**: responder duda segun intent (equivalente a R9 actual)

### Fases derivadas de acciones

```
ultima accion significativa → fase actual
──────────────────────────────────────────
ninguna                     → initial
pedir_datos                 → capturing_data
ofrecer_promos              → promos_shown
mostrar_confirmacion        → confirming
crear_orden                 → order_created
handoff/rechazar/no_interesa → closed
```

### Tabla de transiciones (reemplaza R2-R8)

```
fase             + intent           → accion
─────────────────────────────────────────────────────
initial          + quiero_comprar   → pedir_datos (si faltan) o ofrecer_promos (si tiene)
capturing_data   + datos_completos  → ofrecer_promos (auto) o mostrar_confirmacion (si tiene pack)
promos_shown     + seleccion_pack   → mostrar_confirmacion (si datos ok) o pedir_datos
confirming       + confirmar        → crear_orden
ANY              + escape           → handoff
ANY              + no_interesa      → no_interesa (cerrar)
ANY              + rechazar         → rechazar (cerrar)
ANY              + acknowledgment   → silence
```

### Mapeo de reglas actuales a nueva arquitectura

| Regla actual | Se convierte en | Razon |
|---|---|---|
| R0 (baja confianza) | Guard | Cross-cutting, corre antes de todo |
| R1 (escape) | Guard | Cross-cutting, corre antes de todo |
| R2 (no_interesa) | Transicion ANY → closed | Una entrada en la tabla |
| R3 (acknowledgment) | Transicion ANY → silence | Una entrada |
| R4 (rechazar) | Transicion ANY → closed | Se fusiona con R2 como "exit transitions" |
| R5 + R5b + R5c | UNA transicion de `confirmar` | La fase determina que hacer |
| R6 + R6b | UNA transicion de `seleccion_pack` | Idem |
| R7 + R7b | UNA transicion de `quiero_comprar` | Idem |
| R8 (auto-resumen) | Auto-transicion | Se deriva del estado, no es una regla |
| R9 (default) | Fallback por fase | Cada fase puede tener su propio default |

**De 13 reglas (R0-R9 + sub-reglas) → 2 guards + ~6 transiciones + 1 fallback.**

---

## Decisiones Resueltas

### D1: Que se registra como accion — RESUELTO

**Criterio:** Todo lo que es una decision del bot que produce un output observable.

| Accion | Gate para decision engine | Trazabilidad |
|---|---|---|
| `ofrecer_promos` | Si (gates en transiciones) | Si |
| `mostrar_confirmacion` | Si (gates en transiciones) | Si |
| `pedir_datos` | Si (no repetir) | Si |
| `crear_orden` | Si (fase order_created) | Si |
| `handoff` | Si (bot puede retomar) | Si |
| `ask_ofi_inter` | Si (cambia flujo datos) | Si |
| `silence` | Si (con subtipo, potencial gate) | Si |
| `rechazar` | No directo, pero marca closed | Si |
| `no_interesa` | No directo, pero marca closed | Si |

**NO son acciones** (ya cubiertos por intentsVistos):
- `responder_duda` — default R9, el intent ya queda registrado
- `saludo` — default R9, sin gate necesario

**Total: 9 acciones.**

### D2: Estructura del registro — RESUELTO

**Opcion B: Array de objetos con metadata** para trazabilidad completa.

```typescript
interface AccionRegistrada {
  tipo: TipoAccion
  turno: number
  origen: 'bot' | 'timer' | 'auto_trigger' | 'ingest'
}
```

Se mantiene consulta rapida con helper: `hasAction(acciones, 'ofrecer_promos')`.

### D3: Un solo punto de registro — RESUELTO

Un unico punto en `somnio-v3-agent.ts` despues de que la respuesta se compone exitosamente. Eliminar los 3 puntos actuales (agent pre-compose, response.ts mostradoUpdates, agent post-compose).

### D4: Relacion acciones <-> modo — RESUELTO

**Modo se DERIVA de acciones** (como computeMode hoy, pero correcto). La fase es la "ultima accion significativa", no un campo separado. Eliminar `computeMode()` y reemplazar con `derivePhase(acciones)`.

### D5: Que hacer con forceIntent — RESUELTO

**Decision: Reemplazar forceIntent con System Events.**

forceIntent se elimina. En su lugar, timer e ingest emiten eventos tipados que el state machine maneja igual que intents del cliente:

```typescript
type SystemEvent =
  | { type: 'timer_expired'; level: 2 | 3 | 4 }
  | { type: 'ingest_complete'; result: 'datos_completos' | 'ciudad_sin_direccion' }

// La tabla de transiciones maneja ambos:
// (fase + intent_del_cliente) → accion
// (fase + evento_del_sistema) → accion
```

Transiciones de system events:
```
fase: capturing_data + ingest_complete(datos_completos, !pack)  → ofrecer_promos (origen: ingest)
fase: capturing_data + ingest_complete(datos_completos, +pack)  → mostrar_confirmacion (origen: ingest)
fase: capturing_data + ingest_complete(ciudad_sin_direccion)    → ask_ofi_inter (origen: ingest)
fase: capturing_data + timer_expired(L2)                        → ofrecer_promos (origen: timer)
fase: promos_shown   + timer_expired(L3)                        → crear_orden (origen: timer)
fase: confirming     + timer_expired(L4)                        → crear_orden (origen: timer)
```

Beneficios:
- No hay intents falsos — eventos del sistema son ciudadanos de primera clase
- Misma tabla de transiciones, misma logica de registro de acciones
- Trazabilidad clara: cada accion sabe si fue por intent, timer o ingest

### D6: Condiciones en transiciones — RESUELTO

**Decision: Opcion 3 — Ingest mejorado como unico dueño de "readiness".**

El decision engine queda PURO: solo (fase + intent/event) → accion, sin guards de datosOk.
Toda la logica de "estamos listos para avanzar?" vive en ingest.

Ingest mejorado no solo detecta transiciones (false→true) sino estado actual:
```
Despues de cada mensaje:
  Si datosOk + packElegido + !resumen_mostrado → emit: readiness_check → mostrar_confirmacion
  Si datosOk + !packElegido + !promos_mostradas → emit: readiness_check → ofrecer_promos
```

Esto elimina los guards de datosOk en seleccion_pack y quiero_comprar.
El decision engine solo responde al intent (ej: seleccion_pack → guardar pack + ack).
Ingest detecta que ahora hay readiness y emite el system event para avanzar.

Separacion de responsabilidades:
- **Comprehension** → que dijo el cliente
- **Decision engine** → que hacer con lo que dijo (fase + intent, sin condiciones)
- **Ingest** → estamos listos para avanzar? Si si, emite system event

### D7: Retroceso de fases — RESUELTO

**Decision: Accion `cambio` para manejar retrocesos.**

No hay transiciones de retroceso. Si un intent "de avance" llega en una fase posterior
a donde normalmente ocurre, se trata como un cambio:

```typescript
// seleccion_pack normalmente en initial/promos_shown. Si llega en confirming → cambio
{ fase: 'confirming', on: 'seleccion_pack', accion: 'cambio' },
{ fase: 'confirming', on: 'datos',          accion: 'cambio' },
```

La accion `cambio`:
- Actualiza el state (nuevo pack, nueva direccion, etc.)
- Registra `{ tipo: 'cambio', turno: N, origen: 'bot', detalle: 'pack: 2x→3x' }`
- Ingest recalcula readiness y re-emite el event correspondiente

Una sola accion cubre todos los retrocesos. Son casos raros, no necesitan transiciones dedicadas.

### D8: Reactivacion despues de closed — ABIERTO (no bloquea estructura)

Fase `closed` es generica (handoff, rechazar, no_interesa todos terminan ahi).
Comportamiento de reactivacion es decision de negocio futura.

```typescript
// Por ahora: mensaje en fase closed → fallback generico
{ fase: 'closed', on: '*', accion: 'fallback' },
```

La estructura soporta cualquier decision futura sin cambios arquitectonicos.

---

## Archivos Afectados

| Archivo | Que cambiaria |
|---|---|
| `types.ts` | Nuevo tipo AccionRegistrada, TipoAccion, Phase, SystemEvent |
| `decision.ts` | Reescribir: guards + tabla transiciones puras (reemplaza R0-R9) |
| `somnio-v3-agent.ts` | Punto unico de registro, eliminar duplicados, eliminar computeMode |
| `response.ts` | Eliminar mostradoUpdates |
| `ingest.ts` | Readiness checks + emitir system events (no solo transiciones) |
| `state.ts` | Serializar/deserializar nuevo formato |
| `engine-v3.ts` | Adaptar output, manejar system events en vez de forceIntent |
| `sandbox-layout.tsx` | Timer emite system events en vez de forceIntent |
| `agent-timers.ts` | Emitir system events en vez de forceIntent |
| `constants.ts` | Definir acciones validas y tabla de transiciones |
| **NUEVO** `guards.ts` | R0, R1 extraidos |
| **NUEVO** `transitions.ts` | Tabla declarativa de transiciones (intents + events) |
| **NUEVO** `phase.ts` | derivePhase() desde acciones |

---

*Pendiente: resolver D7 (retroceso de fases) y D8 (reactivacion despues de closed)*

# v3 Two-Track Decision Engine — Context Document

## Bug que origino este refactor

En modo captura (`enCapturaSilenciosa=true`), cuando el usuario dice "2" para seleccionar pack:
- Comprehension clasifica: intent=`seleccion_pack`, category=`datos`
- Ingest ve category=`datos` en captura → retorna `action: 'silent'`
- El pipeline corta en linea 129 de `somnio-v3-agent.ts` — **nunca llega al Decision Engine**
- El Decision Engine tiene la transicion correcta (`seleccion_pack + datosOk → mostrar_confirmacion`) pero nunca se ejecuta

**Causa raiz**: El ingest decide silence/respond basandose solo en `category`, ignorando el `intent`. El Decision Engine tiene `NEVER_SILENCE_INTENTS` pero solo aplica a acknowledgments — y de todas formas nunca se ejecuta porque ingest ya corto.

## Problema arquitectonico

El pipeline actual es **lineal con corte prematuro**:

```
C2(Claude) → C3(merge) → C4(ingest) ──→ CORTA → return silent
                                    ↓
                              C5(gates) → C6(decision) → C7(response)
```

Dos concerns mezclados en un solo pipeline:
1. **Flujo de venta** (state machine): captura → promos → confirmacion → orden
2. **Respuestas informativas** (stateless): precio, envio, contenido, etc.

`NEVER_SILENCE_INTENTS` es un parche que crece cada vez que se descubre un intent que "no deberia silenciarse." Es fragil por definicion.

## Arquitectura nueva: Two-Track Decision

### Principio

Separar **QUE HACER** (sales track) de **QUE DECIR** (response track):

```
Mensaje → C2(Claude) → C3(merge) → C5(gates)
                                       ↓
                          ┌────────────┴────────────┐
                          ▼                          ▼
                   SALES TRACK                RESPONSE TRACK
                   (state machine)            (template engine)
                   Solo produce:              Lee:
                   - acciones registradas      - acciones del sales track
                   - flags (enterCaptura)      - intent del comprehension
                   - timer signals             - state actual
                   NO produce mensajes         Produce TODOS los mensajes
                          │                          │
                          ▼                          ▼
                   Estado actualizado          Templates a enviar
```

### Sales Track (state machine pura)

Input: `(phase, intent, category, gates, state)`
Output: `{ accion?: TipoAccion, enterCaptura?: boolean, timerSignal?: TimerSignal }`

**NO produce templateIntents, NO produce mensajes, NO conoce templates.**

Es la tabla de transiciones actual pero sin `templateIntents` ni `extraContext` en el resolve. Solo decide:
- ¿Avanzar el embudo? → registrar accion (`ofrecer_promos`, `mostrar_confirmacion`, `crear_orden`, etc.)
- ¿Cambiar modo captura? → `enterCaptura: true/false`
- ¿Timer signal? → start/cancel/reevaluate

### Response Track (template engine)

Input: `(accion del sales track, intent, state, workspaceId)`
Output: `{ messages: ProcessedMessage[], templateIdsSent: string[] }`

Lee dos fuentes para decidir que decir:
1. **Accion del sales track** → template de venta (ej: `ofrecer_promos → promociones`, `mostrar_confirmacion → resumen_2x`)
2. **Intent informativo** → template informativo (ej: `precio → precio`, `envio → envio`)

Ambas fuentes producen output independientemente. Si hay accion + intent informativo, se envian ambos.

### El silencio es natural

No existe `action: 'silence'` como decision explicita. El silencio es la **ausencia de output**:
- Sales track no tiene accion → no hay template de venta
- Intent no es informativo → no hay template informativo
- 0 templates = nada que enviar = silencio

**NEVER_SILENCE_INTENTS desaparece** porque no hay decision de silencio que sobreescribir.

### Escenarios validados

| Escenario | Sales Track | Response Track | Resultado |
|-----------|-------------|----------------|-----------|
| "Jose Romero, cra 38..." en captura | sin accion (acumula datos) | intent=datos → no informativo | Silencio natural |
| datosCompletos se activa | accion: `ofrecer_promos` | ve accion → template promos | Muestra promos |
| "2" despues de promos | accion: `mostrar_confirmacion` | ve accion + pack=2x → resumen_2x | Muestra confirmacion |
| "cuanto cuesta?" en captura | sin accion (no hay avance) | intent=precio → template precio | Responde precio, captura sigue |
| "el de 2x y cuanto demora?" | accion: `mostrar_confirmacion` | accion → resumen + secondary=envio → envio | Ambos |
| "ok" generico en captura | sin accion | intent=otro → no informativo | Silencio natural |
| "si" en confirming (ack positivo) | accion: `crear_orden` | ve accion → template confirmacion_orden | Crea orden |
| "no me interesa" | accion: `no_interesa` | ve accion → template no_interesa | Despedida |

## Intents informativos vs intents de flujo

### Intents informativos (Response Track los responde)

Estos intents producen templates informativos sin afectar el flujo de venta:
- `saludo`, `precio`, `promociones`, `contenido`, `como_se_toma`
- `pago`, `envio`, `registro_sanitario`, `ubicacion`, `efectos`, `efectividad`

### Intents de flujo (Sales Track los procesa)

Estos intents pueden triggear acciones en el embudo de venta:
- `quiero_comprar`, `seleccion_pack`, `confirmar`, `datos`
- `rechazar`, `no_interesa`

### Intents de escape (Guards, pre-ambos-tracks)

Estos se manejan en guards antes de cualquier track:
- `asesor`, `queja`, `cancelar`

### Intent fallback

- `otro` → no es informativo, no triggerea accion → silencio natural (o handoff si baja confianza via guard R0)

## Que pasa con el Ingest

El ingest **deja de decidir silence/respond**. Se convierte en un emisor de signals:

1. **System events** — `ingest_complete:datos_completos`, `ingest_complete:ciudad_sin_direccion` (auto-triggers que alimentan al sales track)
2. **Timer signals** — L1/L2 reevaluate basado en prevState vs state (logica temporal que necesita comparar estados)

Siempre retorna `action: 'respond'`. El pipeline nunca se corta prematuramente.

## Que pasa con los Guards

Sin cambios. Los guards (R0: baja confianza, R1: escape intents) siguen corriendo **antes** de ambos tracks. Son validacion de input, no logica de negocio.

## Sales Track — Transiciones

La tabla de transiciones actual se simplifica. Cada entry produce solo accion + flags, sin templateIntents:

### Any-phase
| On | Condition | Accion | Flags |
|----|-----------|--------|-------|
| `no_interesa` | — | `no_interesa` | timer: cancel |
| `rechazar` | — | `rechazar` | timer: cancel |
| `seleccion_pack` | datosOk | `mostrar_confirmacion` | timer: start L4 |
| `seleccion_pack` | !datosOk | `pedir_datos` | enterCaptura: true, timer: start L0 |
| `confirmar` | datosOk + packElegido | `crear_orden` | timer: cancel |
| `confirmar` | !packElegido | `ofrecer_promos` | timer: start L3 |
| `confirmar` | !datosOk | `pedir_datos` | enterCaptura: true |

### Phase-specific
| Phase | On | Condition | Accion | Flags |
|-------|----|-----------|--------|-------|
| `initial` | `quiero_comprar` | !datosOk | `pedir_datos` | enterCaptura: true, timer: start L0 |
| `initial` | `quiero_comprar` | datosOk | `ofrecer_promos` | timer: start L3 |
| `capturing_data` | `quiero_comprar` | datosOk | `ofrecer_promos` | timer: start L3 |
| `capturing_data` | `quiero_comprar` | !datosOk | `pedir_datos` | enterCaptura: true, timer: start L0 |
| `confirming` | `seleccion_pack` | — | `cambio` | timer: start L4 |
| `confirming` | `datos` | — | `cambio` | timer: start L4 |
| `confirming` | `acknowledgment_positive` | — | `crear_orden` | timer: cancel |
| `promos_shown` | `acknowledgment` | !packElegido | ninguna (fall through) | — |
| `closed` | `*` | — | ninguna | — |

### System events (del ingest)
| Phase | On | Condition | Accion | Flags |
|-------|----|-----------|--------|-------|
| `capturing_data` | `ingest_complete:datos_completos` | !packElegido | `ofrecer_promos` | timer: start L3 |
| `capturing_data` | `ingest_complete:datos_completos` | packElegido | `mostrar_confirmacion` | — |
| `*` | `ingest_complete:ciudad_sin_direccion` | — | `ask_ofi_inter` | — |
| `*` | `readiness_check:promos` | — | `ofrecer_promos` | timer: start L3 |
| `*` | `readiness_check:confirmacion` | — | `mostrar_confirmacion` | timer: start L4 |
| `capturing_data` | `timer_expired:2` | — | `ofrecer_promos` | enterCaptura: false, timer: start L3 |
| `promos_shown` | `timer_expired:3` | — | `crear_orden` | timer: cancel |
| `confirming` | `timer_expired:4` | — | `crear_orden` | timer: cancel |

### Acknowledgment routing
| Phase | On | Condition | Accion |
|-------|----|-----------|--------|
| `confirming` | ack positivo | — | `crear_orden` |
| `promos_shown` | ack | !packElegido | ninguna (fall through a response track) |
| `*` | ack | — | ninguna (silencio natural — sin accion + ack no es informativo) |

## Response Track — Mapeo accion → templates

Cuando el sales track produce una accion, el response track mapea a templates:

| Accion | Template intents | Context builder |
|--------|------------------|-----------------|
| `ofrecer_promos` | `['promociones']` | — |
| `mostrar_confirmacion` | `['resumen_{pack}']` | `buildResumenContext(state)` |
| `pedir_datos` | `['pedir_datos']` | `{ campos_faltantes }` |
| `crear_orden` | `['confirmacion_orden']` | `buildResumenContext(state)` |
| `no_interesa` | `['no_interesa']` | — |
| `rechazar` | `['rechazar']` | — |
| `ask_ofi_inter` | `['ask_ofi_inter']` | — |
| `cambio` | `['resumen_{pack}']` | `buildResumenContext(state)` |

El response track tambien mapea **intents informativos** a templates (ya existe en `V3_TO_V1_INTENT_MAP`):

| Intent | Template intents |
|--------|------------------|
| `saludo` | `['hola']` |
| `precio` | `['precio']` |
| `contenido` | `['contenido_envase']` |
| `como_se_toma` | `['como_se_toma']` |
| `pago` | `['modopago']` |
| `envio` | `['envio']` |
| `registro_sanitario` | `['invima']` |
| `ubicacion` | `['ubicacion']` |
| `efectos` | `['contraindicaciones']` |
| `efectividad` | `['sisirve']` |

### Composicion cuando ambos tracks producen output

Prioridad: templates de venta (CORE) primero, informativos (COMPLEMENTARIA) despues.
El block-composer existente ya maneja prioridades y cap de 3 templates.

## Archivos a modificar

### Nuevos archivos
- `src/lib/agents/somnio-v3/sales-track.ts` — State machine pura. Input: (phase, intent, category, gates, state, systemEvent). Output: { accion?, enterCaptura?, timerSignal? }
- `src/lib/agents/somnio-v3/response-track.ts` — Template engine. Input: (salesAction, intent, state, workspaceId). Output: ResponseResult

### Archivos a modificar
- `src/lib/agents/somnio-v3/somnio-v3-agent.ts` — Pipeline principal: eliminar bloque silent (lineas 129-160), llamar sales-track → response-track en vez de decide → composeResponse
- `src/lib/agents/somnio-v3/ingest.ts` — Eliminar retornos `action: 'silent'`, siempre retornar `action: 'respond'`. Mantener system events y timer signals
- `src/lib/agents/somnio-v3/types.ts` — Nuevo tipo `SalesTrackOutput`. Eliminar `'silent'` de `IngestAction`. Limpiar `Decision` (ya no necesita templateIntents, extraContext)
- `src/lib/agents/somnio-v3/constants.ts` — Eliminar `NEVER_SILENCE_INTENTS`. Agregar `INFORMATIONAL_INTENTS` set

### Archivos que se pueden eliminar o simplificar
- `src/lib/agents/somnio-v3/decision.ts` — Se reemplaza por `sales-track.ts`. La funcion `transitionToDecision()` se simplifica (ya no mapea templateIntents)
- `src/lib/agents/somnio-v3/response.ts` — Se reemplaza/extiende por `response-track.ts` que combina accion + intent informativo

### Archivos sin cambios
- `src/lib/agents/somnio-v3/comprehension.ts` — Sin cambios
- `src/lib/agents/somnio-v3/comprehension-schema.ts` — Sin cambios
- `src/lib/agents/somnio-v3/state.ts` — Sin cambios (merge, gates, serialize/deserialize)
- `src/lib/agents/somnio-v3/phase.ts` — Sin cambios
- `src/lib/agents/somnio-v3/guards.ts` — Sin cambios
- `src/lib/agents/somnio-v3/engine-adapter.ts` — Sin cambios (produccion, no tocamos)
- `src/lib/agents/somnio-v3/engine-v3.ts` — Posible cambio menor si V3AgentOutput cambia

### Debug panel
- `src/app/(dashboard)/sandbox/components/debug-panel/debug-v3.tsx` — Actualizar PipelineSection para mostrar sales track + response track como pasos separados

## Scope

**Solo bot v3 sandbox.** El agente en produccion (engine-adapter.ts) NO se toca. El feature flag existente `USE_SOMNIO_V3` aisla los cambios.

## Restricciones

- Zero cambios al comprehension (C2) — Claude no necesita saber sobre two-track
- Zero cambios a la DB
- Zero cambios al engine-adapter (produccion)
- Backward compatible: `engine-v3.ts` (sandbox) sigue funcionando con la misma interfaz `V3AgentOutput`

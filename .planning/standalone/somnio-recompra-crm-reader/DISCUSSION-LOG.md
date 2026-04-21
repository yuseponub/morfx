# Standalone: Somnio Recompra + CRM Reader Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Standalone:** somnio-recompra-crm-reader
**Areas discussed:** Prompt al reader, Forma del output, Fallback (evolucion a async), Mecanismo async, Edge case race, Ubicacion

---

## Area 0 — Seleccion de areas grises (multiSelect)

| Opcion | Descripcion | Selected |
|--------|-------------|----------|
| Prompt al reader | Prompt fijo estructurado vs. abierto vs. multi-turno | ✓ |
| Forma del output | Blob texto vs. parseo toolCalls vs. hibrido | ✓ |
| Fallback si falla | Red de seguridad actual vs. retry vs. vacio | ✓ |
| Cuando invocar | Solo al inicio vs. mid-conversacion | ✓ (resuelto inline) |

**User's choice:** Primeras 3 areas seleccionadas para deep-dive. "Cuando invocar" resuelta en el selector: **solo al inicio, luego configuramos si se necesita algo mas**.
**Notes:** Usuario pidio revisar la infraestructura del crm-reader para ver si algunas dudas se resolvian con lo que ya existe.

---

## Area 1 — Prompt al reader

| Opcion | Descripcion | Selected |
|--------|-------------|----------|
| Estructurado fijo | Prompt template con 4 puntos fijos: ultimo pedido, tags, total pedidos, direccion | ✓ |
| Abierto "dame todo" | Reader decide profundidad libremente | |
| Multi-turno system+user | Messages separados | |

**User's choice:** Estructurado fijo (Recomendado).
**Notes:** Garantiza predictibilidad del output; el reader tiene que producir parrafo con la misma forma cada vez.

---

## Area 2 — Forma del output

| Opcion | Descripcion | Selected |
|--------|-------------|----------|
| Blob texto en `_v3:crm_context` | result.text completo en una key del session state | ✓ |
| Parseo estructurado toolCalls | Extraer a keys separadas (ultimo_pedido_items, tags, etc.) | |
| Hibrido texto+JSON | Guardar ambos | |

**User's choice:** Blob de texto en `_v3:crm_context` (Recomendado).
**Notes:** YAGNI sobre parseo estructurado; se agrega si luego hace falta logica determinista.

---

## Area 3 — Fallback (original) → evoluciono a diseño async

**Pregunta original:** ¿Que hacer si el reader falla/timeout antes del primer mensaje?

| Opcion | Descripcion | Selected |
|--------|-------------|----------|
| Red de seguridad `loadLastOrderData` actual | Caer al query simple si el reader falla | |
| Reintentar 1 vez, luego red | Retry inmediato + fallback | |
| Sin red — arrancar vacio | Sesion sin datos | |

**User's response (freeform):** "hay que esperar al reader, aunque en somnio recompra se activa es una vez el cliente da intencion de compra, antes solo se saluda y el nombre se saca del nombre de contacto"

**Follow-up del usuario:** "o bueno, mejor que si saque la info con el simple saludo, pero que el nombre si lo saque del contacto para que no tenga que esperar la info; para luego cuando de intencion de compra ya tener la info ahi cargada"

**Decision capturada:** Cambio de diseño — de sincronico-con-fallback a **async/paralelo con enriquecimiento progresivo**. El saludo usa `contact.name` (rapido), el reader corre en paralelo, turno 1+ (intencion de compra) ya tiene contexto rico.

---

## Area 4 — Mecanismo async (derivada del cambio de diseño)

| Opcion | Descripcion | Selected |
|--------|-------------|----------|
| Nueva funcion Inngest | `await inngest.send()` + nueva function que corre reader y escribe session state | ✓ |
| Promise con timeout en webhook | Lanzar promise sin await, esperar antes de salir | |
| Inline con timeout 2s | Promise.race reader vs. timeout 2s | |

**User's choice:** Nueva funcion Inngest (Recomendado).
**Notes:** Unica forma correcta en Vercel serverless (MEMORY rule). Fire-and-forget no sobrevive.

---

## Area 5 — Edge case race (turno 1+ antes de que termine el reader)

| Opcion | Descripcion | Selected |
|--------|-------------|----------|
| Poll 500ms hasta 3s | Esperar backoff corto si contexto no esta listo | ✓ |
| Seguir sin contexto | Proceder sin esperar | |
| Bloquear sin timeout | Await hasta completar | |

**User's choice:** Poll con backoff corto (Recomendado).
**Notes:** Max 3s, si excede: seguir sin el contexto rico.

---

## Area 6 — Ubicacion del phase

| Opcion | Descripcion | Selected |
|--------|-------------|----------|
| Nuevo standalone `somnio-recompra-crm-reader` | Extension separable | ✓ |
| Plan 05+ en `somnio-recompra/` existente | Extender el bot base | |
| Decimal phase 44.2 bajo Phase 44 | Extension del milestone CRM Bots | |

**User's choice:** Nuevo standalone (Recomendado).
**Notes:** El somnio-recompra existente esta cerrado con VERIFICATION.md; esta integracion es separable.

---

## Claude's Discretion

- Timeout exacto del reader call en la Inngest function (10-15s razonable).
- Shape interno del Inngest event payload.
- Mecanismo concreto del poll (interval vs. sleep loop).
- Manejo si el reader retorna texto vacio / "no encontrado".
- Donde exactamente se inyecta `_v3:crm_context` en el comprehension-prompt.

## Deferred Ideas

- Invocacion mid-conversacion del reader (para consultas especificas del cliente).
- TTL / invalidacion de `_v3:crm_context`.
- Parseo estructurado de toolCalls a keys separadas.
- Optimizacion de tokens del bloque de contexto (truncado/compresion).
- Tests de integracion E2E (plan-phase decide cobertura).
- Ideas previas del somnio-recompra CONTEXT: precios especiales, Ofi Inter, historial visible — siguen diferidas.

---

*Audit log — phase somnio-recompra-crm-reader*

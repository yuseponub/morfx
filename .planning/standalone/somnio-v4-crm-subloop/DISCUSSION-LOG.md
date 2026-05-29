# somnio-v4-crm-subloop — Discussion Log

> **Audit trail only.** Decisiones canónicas en CONTEXT.md — este log preserva alternativas y evidencia.

**Date:** 2026-05-29
**Phase:** somnio-v4-crm-subloop (standalone #2 de 3)
**Areas discussed:** Trigger+alcance, Capa 1 (grounding), Capa 2 (guards), Capa 3+activación, Flujo confirmación
**Método:** evidence-based — 2 investigaciones de código (Explore) con evidencia verbatim antes de cada decisión.

---

## Área 1 — Trigger + alcance

| Opción | Selección |
|--------|-----------|
| Alcance: Big-bang las 5 mutations | ✓ |
| Alcance: solo mutaciones de pedido | |
| Alcance: incremental createOrder | |
| Trigger: determinista detecta→escala | (se profundizó, ver abajo) |
| Trigger: siempre sub-loop si intención CRM | |
| Inline: eliminar (big-bang dormant) | ✓ |
| Inline: coexistir tras flag | |

**Profundización del trigger (usuario pidió explorar):** El usuario eligió que el **sub-loop (LLM) decida+ejecute
con guards + contexto completo** porque el determinista "muchas veces falla en triggerearse". Evidencia clave
(investigación #2): ninguna señal CRM existe post-comprehension; el punto correcto del gate es post-sales-track.
Filosofía acordada: gate preciso (recall) + LLM grounded rescata extracción fallida + guards red final. NO
"prender siempre y que filtren las guards". `cancelar` → se queda handoff. Activación ADITIVA (templates siguen).

## Área 2 — Capa 1 (Grounding)

| Pregunta | Opciones | Selección |
|----------|----------|-----------|
| Fuente | crm-query-tools directo / crm-reader bloqueante | **Dos vistas:** query-tools (DB) + ledger/acciones (memoria agente) |
| Timing | lazy / preload por-turno / preload sesión+refetch | Cargar 1ª vez + guardar accesible (explorado → cache `_v4` + fresh antes de createOrder) |
| Contenido | pedido / historial / contacto / mensaje crudo | **Los 4** ✓ |

**Notas:** Idea del usuario de dos ground truths (DB + memoria del agente) con discrepancia como señal.
Staleness por edición humana en CRM → DIFERIDO (se resuelve desde el lado CRM con invalidación de cache).

## Área 3 — Capa 2 (Guards)

| Pregunta | Selección |
|----------|-----------|
| 3a createOrder con pedido activo existente | **Rechazar + devolver existente** (`already_exists`) — recomendación Claude, aceptada |
| 3b CAS + whitelist | moveOrderToStage en scope (confirmación); CAS as-is; whitelist solo →CONFIRMADO desde pre-confirmación |

**Notas:** Usuario corrigió que moveOrderToStage SÍ se activa en confirmación de compra (no solo cancelar).
Whitelist deriva de scope: cancelar-fuera + confirmación→CONFIRMADO.

## Área 4 — Capa 3 + activación

| Pregunta | Selección |
|----------|-----------|
| 4a origen de crmActions | `'rag'` ✓ (confirmado salvo objeción) |
| 4b feature flag | Sin flag, big-bang en dormant ✓ (confirmado salvo objeción) |

## Flujo de confirmación (cambio determinista)

| Opción | Selección |
|--------|-----------|
| Adelantar createOrder (acepto cambio de flujo) | ✓ |
| Crear+mover mismo turno de confirmación | |
| Crear directo en CONFIRMADO | |

**Evidencia:** `transitions.ts:261-264` — hoy `confirmar→crear_orden` (pedido se crea EN la confirmación).
**Decisión:** adelantar createOrder a datos+pack (mostrar_confirmacion, primer stage); `confirmar→moveOrderToStage(CONFIRMADO)`.
**Desviación consciente aceptada:** altera decisión determinista + crea pedidos sin confirmar (lead capture). Usuario lo asume.

## Claude's Discretion
- Forma de threadear grounding al SubLoopContext; mecánica de update del snapshot `_v4`; paso del hint determinista al prompt.

## Deferred Ideas
- Invalidación de cache desde CRM (edición humana); whitelist configurable por workspace; observabilidad CRM completa; híbrido template+RAG (#3).

# CONTEXT — somnio-v4-crm-subloop

**Gathered:** 2026-05-29
**Status:** Ready for research
**Agent:** somnio-sales-v4 (DORMANT en prod — Regla 6 satisfecha)
**Sequence:** standalone #2 de 3 (ver memoria `somnio_v4_architecture_roadmap`). Prerequisito #1 (`somnio-v4-turn-ledger`) ya SHIPPED + merged a main.

---

<domain>
## Phase Boundary

Consolidar **todo el CRM de v4 al sub-loop orquestador**, reemplazando el camino determinista
inline (`executeInvocations` + `createOrder` del runner) por ejecución vía el sub-loop grounded,
con 3 capas de seguridad (grounding / tool guards / ledger). El sub-loop (LLM grounded) **decide y
ejecuta** las mutaciones; los guards son la red final.

**En scope:** createOrder, updateOrder (envío), updateContact (email), addOrderNote, moveOrderToStage
(confirmación → CONFIRMADO). Grounding de dos vistas. Guards (idempotencia createOrder + CAS + whitelist).
Poblar `crmActions[]` del ledger desde el sub-loop.

**Fuera de scope:** `cancelar` (sigue handoff humano). Capa 3 de observabilidad CRM "completa" más allá
del ledger. Invalidación de cache por edición humana en el CRM (se resuelve después desde el lado CRM).
Turno híbrido template+RAG (standalone #3).
</domain>

<decisions>
## Implementation Decisions

### Área 1 — Trigger + alcance de la activación
- **D-01:** El **gate de activación** del sub-loop CRM vive **post-sales-track** (`somnio-v4-agent.ts:441-481`),
  el único punto donde se conocen `salesResult.accion` Y `changes.newFields` (evidencia PREGUNTA E:
  ninguna señal CRM existe post-comprehension). **NO se mueve a comprehension** — perdería activación.
- **D-02:** El gate es **determinista pero deliberadamente amplio** (wiggle room, alto recall):
  unión de `salesResult.accion ∈ CRM-actions` ∨ `changes.newFields ∩ {direccion,ciudad,depto,barrio,correo}`
  ∨ `classification.category='datos'` (esta última como **red anti-falso-negativo** contra extracción fallida).
  Errar hacia activar; el sub-loop devuelve "nada que hacer" como salida válida y barata.
- **D-03:** Filosofía: **gate preciso (recall) + sub-loop grounded que rescata la extracción fallida (precisión)
  + guards como red final.** NO es "prender siempre y que las guards filtren" (rechazado por el usuario).
- **D-04:** Dentro del sub-loop, el **LLM grounded decide+ejecuta** la mutación (no re-decisión determinista
  mecánica). Razón usuario: el determinista "muchas veces falla en triggerearse". El falso negativo (update
  que no pasa) es el enemigo; el falso positivo lo salvan los guards.
- **D-05:** **Aditivo, no excluyente:** `resolveResponseTrack` (`:606`) sigue corriendo y enviando sus
  templates (sales + informativos) el mismo turno. El sub-loop CRM es **solo el camino de mutación**,
  concurrente con el track conversacional (evidencia PREGUNTA D: caminos independientes).
- **D-06:** **Big-bang:** se ELIMINA `executeInvocations` inline (`invocations.ts`) + el `createOrder` del
  runner (`v4-production-runner.ts:1132`). El sub-loop `crm_mutation` es el ÚNICO camino CRM. v4 DORMANT lo permite.
- **D-07:** `cancelar` **se queda en handoff** (guard R1, `guards.ts:36-46`) — fuera de scope. `moveOrderToStage`
  a CANCELADO NO se activa en este standalone.

### Área 2 — Capa 1: Grounding (dos vistas)
- **D-08:** **Dos ground truths:**
  - **Vista A (verdad DB):** `crm-query-tools` (`getActiveOrderByPhone`/`getOrderById`) — estado autoritativo.
  - **Vista B (memoria del agente):** `crmActions[]` del ledger (persistido en `turn_ledger_dims`, standalone #1)
    + `accionesEjecutadas` — qué hizo ESTE agente turno a turno. Gratis desde session_state.
  - Las **discrepancias A↔B son señal** (ej. B dice "moví a CONFIRMADO" pero A no → cambio externo).
- **D-09:** **Contenido del grounding:** pedido activo (id, stage, creado-cuándo, items, valor, dirección actual)
  + historial de cambios (`order_stage_history` + notas) + contacto (id, email/teléfono, tags) + **mensaje crudo**
  del cliente (para que el LLM re-lea y capture lo que la extracción determinista se perdió).
- **D-10:** **Cache/freshness:** snapshot de Vista A en `session_state` bajo **clave propia `_v4`** (NO las legacy
  `_v3:crm_context`/`_v3:active_order` — CLAUDE.md D-21 prohíbe a query-tools escribirlas). Se carga la 1ª vez que
  el gate prende; el **ledger actualiza el snapshot** tras cada mutación propia exitosa; **re-query fresco a DB
  ANTES de `createOrder`** (anti-duplicado, clase Doralba); **CAS en moveOrderToStage** como red de ejecución.
- **D-11:** Grounding es **lazy** (solo cuando el gate prende), no preload por-turno. "Pedido activo existe"
  es **contexto para decidir crear-vs-actualizar**, NO condición de disparo del gate.

### Área 3 — Capa 2: Tool guards
- **D-12 (3a):** `createOrder` con pedido activo existente (stage no-terminal) → el guard **rechaza y devuelve
  el pedido existente** (`already_exists`); el turno continúa sobre ese pedido (el LLM grounded elige updateOrder
  o nada). Backstop duro: idempotency key reusando tabla `crm_mutation_idempotency_keys` (ya existe).
- **D-13 (3b):** `moveOrderToStage` **SÍ está en scope** — se activa en la **confirmación de compra**.
  - **CAS:** mantener el existente (`orders.ts:633`, flag `crm_stage_integrity_cas_enabled`).
  - **Whitelist:** **solo → CONFIRMADO desde stages pre-confirmación** (primer stage / FALTA CONFIRMAR / FALTA INFO).
    Bloquea cualquier otro destino (deriva de D-07 cancelar-fuera + D-15 confirmación→CONFIRMADO).

### Área 4 — Capa 3: Ledger + activación
- **D-14 (4a):** El sub-loop puebla `crmActions[]` del ledger con `{tool, args, result, code?, origen:'rag', stageAtTime?}`.
  `origen` pasa de `'determinista'` a `'rag'` (ahora ejecuta el sub-loop). Es exactamente el shape diseñado en #1.
- **D-16 (4b):** **Sin feature flag.** Big-bang confiando en v4 DORMANT (0 workspaces) + greps Regla 6
  (cambios solo en archivos somnio-v4-specific). Rollback = no activar v4.

### Flujo de confirmación (cambio determinista ACEPTADO)
- **D-15:** **`createOrder` se ADELANTA**: dispara cuando hay datos+pack listos (`mostrar_confirmacion` /
  `seleccion_pack`+datosCriticos), el pedido **nace en el primer stage del pipeline** ANTES de confirmar.
  La transición R5 (`transitions.ts:261-264`, hoy `confirmar→crear_orden`) cambia a **`confirmar→moveOrderToStage(CONFIRMADO)`**.
  - **Consecuencia aceptada:** se crean pedidos para clientes que ven el resumen pero NO confirman (lead capture);
    quedan en primer stage. El usuario lo asume a propósito.
  - **Desviación consciente:** esto **SÍ altera una decisión determinista** (qué acción produce cada transición),
    saliendo del principio original del roadmap ("el ledger/CRM-subloop NO altera qué sales-action se elige").
    Documentado y aceptado explícitamente por el usuario en discuss 2026-05-29.

### Claude's Discretion
- Forma exacta de inyectar el grounding al `SubLoopContext` (campo nuevo tipado fuerte).
- Mecánica de actualizar el snapshot `_v4` desde el resultado de la mutación.
- Cómo se pasa la "instrucción/hint determinista" (qué mutación sugiere el state-machine) al prompt del sub-loop.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before researching/planning.**

### Roadmap + prerequisito
- `.planning/standalone/somnio-v4-turn-ledger/` — standalone #1 (ledger) SHIPPED. Define `TurnLedger`,
  `CrmActionRegistrada` (`somnio-v4/types.ts:369-380`), `commitTurn` (`somnio-v4/state.ts`), `turn_ledger_dims`.
- Memoria `somnio_v4_architecture_roadmap` — secuencia 3 standalones + las 3 capas de seguridad.
- `src/lib/agents/somnio-v4/ARCHITECTURE.md` — arquitectura v4 (ya corrige crm_mutation muerto en #1).

### Pipeline v4 (puntos de inserción/eliminación)
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` — pipeline; gate post-sales-track `:441-481`; `isCrmMutation:225`;
  decisión createOrder `:571-603`.
- `src/lib/agents/somnio-v4/invocations.ts` — `executeInvocations` a ELIMINAR (D-06); señales CRM `:141-280`.
- `src/lib/agents/somnio-v4/transitions.ts` — R5 `confirmar→crear_orden` `:261-264` (a CAMBIAR por D-15);
  `mostrar_confirmacion` `:240-246`.
- `src/lib/agents/somnio-v4/sales-track.ts` + `response-track.ts` (`resolveSalesActionTemplates:255`) — track de templates aditivo.
- `src/lib/agents/engine/v4-production-runner.ts:1132` — `createOrder` del runner a ELIMINAR (D-06).

### Sub-loop (donde vive la nueva ejecución)
- `src/lib/agents/somnio-v4/sub-loop/tools.ts:52-62` — toolset `crm_mutation` (5 mutations ya cableadas).
- `src/lib/agents/somnio-v4/sub-loop/index.ts`, `escalation.ts`, `output-schema.ts`, `prompt.ts`.
- `src/lib/agents/somnio-v4/sub-loop/index.ts` + `INTERRUPTION-PARITY.md` — paridad prod↔sandbox (los CKPT del sub-loop).

### Grounding + guards (domain + shared tools)
- `src/lib/agents/shared/crm-query-tools/` — Vista A del grounding.
- `src/lib/agents/shared/crm-mutation-tools/` — tools de ejecución + tabla `crm_mutation_idempotency_keys`.
- `src/lib/domain/orders.ts` — `createOrder:222-322` (sin idempotencia hoy), `moveOrderToStage:594-679` (CAS `:633`).
- `src/lib/agents/somnio-v4/state.ts` + `types.ts` — ledger `crmActions[]` (Vista B + escritura D-14).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `crm_mutation` toolset ya cableado en `sub-loop/tools.ts:52-62` (createOrder/updateOrder/moveOrderToStage/addOrderNote/updateContact + getActiveOrderByPhone + kb_search) — solo nunca se alcanza (isCrmMutation=false).
- `crm_mutation_idempotency_keys` table + idempotency-eligible createOrder (crm-mutation-tools) — reusar para D-12.
- CAS en `domain.moveOrderToStage` (`orders.ts:633`, flag `crm_stage_integrity_cas_enabled`) — reusar para D-13.
- Ledger `crmActions[]` shape (`types.ts:369-380`) ya diseñado para recibir `origen:'rag'` — destino de D-14.
- Patrón env-var de stage UUID (CANCELADO en `invocations.ts:54-56`) — reusar para CONFIRMADO UUID.

### Established Patterns
- Pipeline secuencial: comprehension → mergeAnalysis → gates → guards → sales-track → (hoy invocations) → response-track → commitTurn.
- Stage inicial de createOrder = primer stage del pipeline si no se pasa stageId (`orders.ts:222-259`).

### Integration Points
- Gate nuevo entre sales-track (`:441`) y response-track (`:606`), reemplazando `executeInvocations` (`:467`).
- `SubLoopContext` (`sub-loop/index.ts:77-84`) hoy NO recibe estado CRM — hay que threadearle el grounding.
</code_context>

<specifics>
## Specific Ideas
- Dos ground truths (DB + memoria-del-agente) con discrepancia como señal — idea del usuario, núcleo del grounding.
- Gate "medio abierto" en sales-action para wiggle room — preferencia explícita del usuario.
- Cache `_v4` actualizado por el propio ledger; re-query solo antes de createOrder.
</specifics>

<deferred>
## Deferred Ideas
- **Invalidación de cache por edición humana en el CRM** (humano mueve stage con sesión activa → invalidar/recargar
  el snapshot `_v4`). Se resuelve después desde el lado del CRM. NO en este standalone.
- **Whitelist de transiciones configurable por workspace** — por ahora hardcode → CONFIRMADO; configurable = futuro.
- **Observabilidad CRM "completa"** (más allá del ledger) — standalone futuro / Capa 3 ampliada.
- **Turno híbrido template+RAG** — standalone #3.
</deferred>

---

## ⚠ Riesgos a investigar en research-phase (consecuencias de D-15)
- **Automatizaciones disparadas por creación temprana:** crear el pedido en primer stage ANTES de confirmar puede
  disparar automations de Somnio que asumían "pedido = confirmado". Research DEBE auditar triggers sobre el primer stage.
- **Templates vs createOrder adelantado:** hoy `crear_orden` dispara templates `confirmacion_orden_*`. Si createOrder
  se adelanta, ¿qué template va en `mostrar_confirmacion` vs en `confirmar`? Mapear el nuevo orden de templates.
- **UUID de CONFIRMADO + primer stage del pipeline Somnio:** resolver config-driven (no hardcode de nombres).
- **Paridad sub-loop prod↔sandbox** (INTERRUPTION-PARITY) al cambiar el flujo de ejecución CRM.
- **Pedidos "fantasma"** sin confirmar: ¿se limpian/expiran? ¿impacto en métricas/Kanban?

---

*Phase: somnio-v4-crm-subloop (standalone)*
*Context gathered: 2026-05-29*

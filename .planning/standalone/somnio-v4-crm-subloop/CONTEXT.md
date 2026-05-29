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

### Rediseño del lifecycle de creación de pedidos (cambio determinista ACEPTADO — refinado 2026-05-29)
> ⚠ SCOPE EXPANDIDO: esto ya no es solo "mover CRM al sub-loop" — rediseña CUÁNDO/CÓMO nace el pedido
> en la state-machine v4. Toca decisiones deterministas de lleno. Usuario lo asumió explícitamente.

- **D-15 (revisado):** **createOrder se ADELANTA a `datos críticos` (datos+nopack)** — el pedido nace
  **inmediatamente** como **cascarón** (contacto + dirección, SIN producto/pack) en stage **NUEVO PEDIDO**
  (`6be952b0…`, no el primer stage genérico — elegido para NO disparar la automation `order.created`
  que matchea solo NUEVO PAG WEB; ver Riesgos). Engancha donde `datosCriticosJustCompleted` se vuelve true
  (`sales-track.ts:82` ya lo detecta).
- **D-17:** **selección de pack → `updateOrder`** (enriquece el cascarón con producto/valor/promo).
- **D-18:** **`confirmar` → `moveOrderToStage(CONFIRMADO)`** (`4770a36e…`). La transición R5
  (`transitions.ts:261-264`, hoy `confirmar→crear_orden`) cambia: ya no crea (el pedido existe), mueve stage.
- **D-19:** **Timers L3/L4 se DESACOPLAN: conservan el MENSAJE, eliminan el CREATE.**
  - L3 (`promos_shown`+`timer_expired:3`, `transitions.ts:337-339`, hoy `crear_orden_sin_promo`): pasa a
    **solo enviar** el template recordatorio (`pendiente_promo`, response-track:316), SIN crear (ya existe).
  - L4 (`confirming`+`timer_expired:4`, `:346-348`, hoy `crear_orden_sin_confirmar`): pasa a **solo enviar**
    su template recordatorio, SIN crear.
  - Requiere desacoplar acción→(create+template) en acciones nuevas tipo `recordar_*` que solo mapean a template.
  - Esto **reemplaza los dos "ingests" por timer** que el usuario describió (esperar 600s y crear) — ya no
    crean porque el pedido nace temprano; solo recuerdan.
- **D-20 (consecuencia aceptada):** quedan **pedidos-cascarón sin producto en NUEVO PEDIDO** (clientes que
  dieron datos pero nunca eligieron pack y se callaron). Antes esos clientes no generaban pedido. Lead capture
  puro. Higiene CRM de estos cascarones → DIFERIDO (ver Deferred).
- **Desviación consciente:** D-15..D-19 alteran decisiones deterministas (qué acción produce cada transición +
  cuándo nace el pedido), saliendo del principio original del roadmap. Aceptado explícitamente por el usuario
  en discuss 2026-05-29.

### Decisiones cerradas en research-phase (2026-05-29)
- **D-21 (config gap):** El grounding Vista A (`getActiveOrderByPhone`) hoy retorna `config_not_set` para Somnio
  (tablas `crm_query_tools_config`/`crm_query_tools_active_stages` vacías). **Resolución: el operador configura
  los active-stages en `/agentes/crm-tools`** (opción A — usa UI existente, cero código nuevo). Acción manual
  pre-activación de v4.
- **D-22 (sandbox parity):** En el engine de sandbox (`engine-v4.ts`) las mutaciones CRM se **SIMULAN** (no tocan
  DB), análogo al caveat de RAG-send. No-op/log para testing.
- **D-23 (blocker research #1 — sub-loop output):** `LoopOutcomeSchema` (`sub-loop/output-schema.ts:35-93`) NO
  tiene campos de acción CRM → hay que extenderlo. **Resolución (planner-internal):** derivar `crmActions[]`
  de `rawResult.steps[].toolResults` del AI SDK (el parsing ya existe en `index.ts:163-177` para el debug),
  mapeando `MutationResult.status` → `{success|failed|cas_reject}`. Ground-truth, no auto-reporte del LLM.
- **D-24 (blocker research #2 — contact resolution):** `createOrder` necesita `contactId`+`pipelineId` (UUIDs)
  que hoy resuelve el runner vía `ProductionOrdersAdapter.findOrCreateContact` — que D-06 elimina. NO existe
  `resolveOrCreateContact` en domain. **Resolución:** construir helper v4 que componga
  `searchContacts(phone) → createContact(...)` (ambos Regla-3-clean). En camino crítico de createOrder.

### Decisiones cerradas en research SUPLEMENTARIO (rediseño lifecycle, 2026-05-29)
- **D-25 (SUP-1 — enriquecer cascarón con pack):** `crm-mutation-tools.updateOrder` hoy EXCLUYE `products`
  ("V1.1 deferred", `orders.ts:7-9`). **Resolución: extender `updateOrder.inputSchema` con `items[]` opcional**
  (módulo COMPARTIDO, pero 0 consumidores en prod D-08 → aditivo, Regla-6-safe por opcionalidad). Es la feature
  V1.1 que este standalone necesita para meter el pack al cascarón en el paso 2 del lifecycle (D-17).
- **D-26 (S1 — señal de creación temprana, CORRIGE supuesto previo):** la señal NO es `sales-track.ts:82`
  (eso solo elige nivel de timer). Es **`changes.datosCriticosJustCompleted`** (edge-trigger `!antes && después`,
  `state.ts:201`), disponible en el gate CRM (`somnio-v4-agent.ts:~467`). Hook del side-effect ahí + **triple
  idempotencia**: edge `datosCriticosJustCompleted` + `hasPriorOrder` (`:572-574`) + re-query DB/idempotency key.
  Aditivo, NO rompe `ofrecer_promos` (D-05).
- **S4 RESUELTO (no era blocker):** cascarón sin pack es seguro — `domain.createOrder` products opcional
  (`orders.ts:289`), tool `createOrder` items opcional (`:86-96`); el único bloqueo (production adapter `:63`)
  lo elimina D-06. Cero cambios a domain compartido para el cascarón.
- **S3 RESUELTO:** desacople L3/L4 — crear símbolos nuevos `recordar_promo`/`recordar_confirmacion` que mapean
  a los mismos templates pero NO entran en `CREATE_ORDER_ACTIONS` (`constants.ts:198-200`) → `isCreateOrder=false`
  en el timer path (`somnio-v4-agent.ts:925-928`), mata el create y mantiene el template. 6 consumers enumerados.
- **S5 RESUELTO:** sandbox ya es no-op CRM; seam de simulación = flag `simulate` por-contexto en `buildSubLoopTools`
  (`tools.ts:8-12`), 100% v4-scoped. Documentar caveat CRM en INTERRUPTION-PARITY.md §6.

### Pendiente planner-internal (no requiere decisión usuario)
- Default de `orders.total_value` (query `information_schema` en plan-time; afecta solo display $0-vs-null).
- Naming final de símbolos `recordar_promo`/`recordar_confirmacion` + `confirmar_orden` (D-18) y si entran a `SIGNIFICANT_ACTIONS`.

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
- **Higiene de pedidos-cascarón** (D-20): clientes que dieron datos pero nunca eligieron pack quedan como pedido
  sin producto en NUEVO PEDIDO. Tag "sin pack" / limpieza / expiry → DIFERIDO (higiene CRM, no del agente).
- **Observabilidad CRM "completa"** (más allá del ledger) — standalone futuro / Capa 3 ampliada.
- **Turno híbrido template+RAG** — standalone #3.
</deferred>

---

## Riesgos — estado tras research-phase (2026-05-29)

### ✅ Resueltos / verificados live
- **Automations por creación temprana:** la única automation `order.created` ("template final ultima":
  3 WhatsApp + SMS, `71c4f524…`) matchea **solo NUEVO PAG WEB** (`42da9d61…`). Naciendo en **NUEVO PEDIDO**
  (`6be952b0…`, D-15) NO se dispara. Verificado `automation-runner.ts:95-101` + DB live.
- **UUIDs de stages:** CONFIRMADO=`4770a36e…`, NUEVO PEDIDO=`6be952b0…` verificados live. Reusar env-bridge
  (`SOMNIO_CANCELED_STAGE_UUID` patrón, `invocations.ts:64`) para CONFIRMADO.
- **Sandbox parity:** D-22 simular (no-op).

### ⚠ Pendientes para research suplementario (rediseño D-15..D-19)
- **Enganche del createOrder temprano:** dónde exactamente en transitions/sales-track engancha el create al
  volverse `datosCriticosJustCompleted` true, sin romper `ofrecer_promos` (`transitions.ts:191,212`).
- **updateOrder-en-pack:** enganchar updateOrder en `seleccion_pack`+datosCriticos (`transitions.ts:242`,
  hoy `mostrar_confirmacion`). Qué template va dónde con el nuevo orden.
- **Desacople L3/L4:** crear acciones `recordar_*` que solo mapeen a template (response-track) sin entrar a
  CREATE_ORDER_ACTIONS. Verificar que el pedido-cascarón ya existe cuando dispara el timer.
- **Camino del cascarón sin pack:** qué pasa si el cliente nunca elige pack (createOrder cascarón sin items/valor
  — ¿el adapter/domain createOrder lo permite sin packSeleccionado?).
- **Paridad sub-loop prod↔sandbox** (INTERRUPTION-PARITY) al cambiar el flujo de ejecución CRM.

---

*Phase: somnio-v4-crm-subloop (standalone)*
*Context gathered: 2026-05-29*

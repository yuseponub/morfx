# DISCUSSION-LOG — somnio-v4-turn-ledger

**Date:** 2026-05-28
**Mode:** discuss-phase (capturado conversacionalmente, en curso)

---

## Decisiones LOCKED

- **D-01** — Approach = **Unified Turn Ledger** (Opción 2). NO bolt-on, NO event-sourcing.
- **D-02** — Cognición intra-turno (`mergeAnalysis → mergedState → decisiones`) queda
  **intacta**. El ledger es capa de **efectos al final**, no un gate previo. Cero cambio
  a qué sales-action/template se elige en este standalone.
- **D-03** — El ledger captura: `comprehension` (intents+confidence), `atendido[]`
  (template_intent / sales_action / kb_topic / handoff / silence), `crmActions[]`,
  `modeTransition`, `messagesSent`.
- **D-04** — `crmActions` shape = `{tool, args, result, code?, origen, stageAtTime?}`,
  diseñado para recibir el sub-loop orquestador del standalone #2 (no solo el camino
  determinista de hoy).
- **D-05** — La rama RAG debe registrar su efecto (`kb_topic` con sourceTopic +
  responseConfidence + turno + texto). Hoy no registra nada durable — este es el hueco
  central que cierra el standalone.
- **D-06** — Las dims nuevas se leen en turnos **FUTUROS** (deserialize al inicio del
  turno), nunca intra-turno → cero behavior change al flujo determinista. (El híbrido B
  agregará lectura intra-turno de estado commiteado de turnos previos.)
- **D-07** — Commit = frontera transaccional, alinea con interrupción sin cambiar el
  mecanismo (serialize al final; interrupt antes del commit → descartar + re-run;
  carryState Path B = estado commiteado de msg1).
- **D-08** — 3 capas de seguridad CRM (grounding / tool guards / observabilidad)
  **DEFERIDAS** al standalone #2. El ledger solo no debe cerrar esa puerta.
- **D-09** — v4 DORMANT → Regla 6 satisfecha; tocar solo archivos somnio-v4-specific.
- **D-10** — Actualizar `somnio-v4/ARCHITECTURE.md` (Regla 4) + corregir descripción
  desactualizada de `crm_mutation`.
- **D-11** (Q-01 resuelto) — **`TurnLedger` tipo explícito + `commitTurn()` único.** NO
  la versión liviana. Es lo único que cierra el ciclo estructuralmente: imposible que una
  rama "olvide" registrar (el bug actual del RAG). "No parches."
- **D-12** — **"Single commit" = único punto de PERSISTENCIA, NO mutaciones diferidas.**
  El working state (`AgentState`) muta **vivo en memoria** durante el turno (`mergeAnalysis`
  → datos/intentsVistos/pack/turnCount; las decisiones `sales-track`/`response-track` lo
  leen vivo). El ledger **refleja** los efectos pero NO gobierna la cognición (no es un
  gate previo a decidir). `commitTurn` serializa **una sola vez al final**: working state
  final + dims de efecto del ledger → `session`. Interrupt antes del commit → descartar
  todo (incl. `turnCount++`) + re-run. Nada se persiste hasta el commit, por eso lo
  interno puede mutar intra-turno Y ser parte del commit único sin conflicto.

## Decisiones LOCKED (post-research)

- **D-13** (Q-02 resuelto) — **UNA columna JSONB `turn_ledger_dims`** en `session_state`
  (objeto que aloja todas las dims: `atendido[]`, `crmActions[]`, etc.). NO columnas
  separadas. Razón: JSONB es **completamente queryable** (containment `@>` + índice GIN —
  no se necesitan columnas separadas para query), y sabemos que #2/#3 agregarán dims →
  una columna objeto = cero migraciones futuras (solo código). **+ Queryability analítica
  real vía observability:** `commitTurn` emite cada entrada del ledger también como evento
  `agent_observability_events` (`kb_topic_registered`, `crm_action_recorded`) — ese es el
  almacén cross-sesión hecho para querys/agregación. `session_state` = coherencia per-sesión
  (blob); observability = analytics. Migración idempotente patrón `20260316000000`. Regla 5.
- **D-14** (Q-04 resuelto) — **Extender el `state-tab` existente** con secciones "KB Topics
  Atendidos" + "CRM Actions" (mismo patrón badge que "Acciones Ejecutadas"). NO tab nuevo
  (evita el invariante `TAB_ICONS` exhaustivo). Tab "Ledger" con timeline por-turno =
  follow-up opcional si se quiere secuencia turno-a-turno.
- **D-15** (Q-03 + silence resueltos) — `atendido[]` **unificado con discriminador `kind`**
  (`template_intent | sales_action | kb_topic | handoff | silence`). **SÍ se registra
  `{kind:'silence'}`** — un silencio deliberado es información del turno, barato de anotar.
- **D-16** (Q-05) — Backward-compat: deserialize con default graceful (`{}` / `[]`) idéntico
  al patrón de `accionesEjecutadas` (`state.ts:357-383`). Campo OPCIONAL en `SessionState`
  interface (aditivo, type-safe, Regla 6 OK por opcionalidad — evita el `as any`).
- **D-17** (split persist/observability — resuelve BLOCKER-2 del plan-checker) — `TurnLedger`
  es el **registro completo en memoria** del turno: `comprehension` (intent+confidence),
  `atendido[]`, `crmActions[]`, `modeTransition` (from→to), `messagesSent`. `commitTurn`
  hace DOS cosas: (a) **persiste a `session_state.turn_ledger_dims` SOLO el subset de
  coherencia** que el turno siguiente necesita = `{ atendido, crmActions }`; (b) **emite el
  ledger COMPLETO a `agent_observability_events`** (`kb_topic_registered`, `crm_action_recorded`,
  + summary del turno con modeTransition + confidence + messagesSent). Así NINGÚN campo es
  fantasma: `modeTransition` / confidence / messagesSent se **consumen** en el emit a
  observability (almacén analítico, D-13), no se persisten en session_state porque la
  cognición del turno siguiente no los necesita (el modo actual ya está en `newMode`). El
  tipo `TurnLedger` ≠ `TurnLedgerDims` (lo persistido) — la diferencia es intencional y
  documentada, no scope reduction.

## Anti-objetivos (NO hacer aquí)

- NO mover CRM/createOrder al sub-loop (standalone #2).
- NO implementar las 3 capas de seguridad CRM (standalone #2).
- NO combinar template+RAG en un turno (standalone #3 / B).
- NO cambiar decisiones deterministas (sales-track / response-track selección).
- NO tocar el módulo de interrupción ni su mecanismo.

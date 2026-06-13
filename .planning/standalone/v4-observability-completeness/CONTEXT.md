# v4-observability-completeness — Context

**Gathered:** 2026-06-13
**Status:** Ready for research
**Type:** Standalone

<domain>
## Phase Boundary

Completar la **observabilidad** del agente `somnio-sales-v4` para sus subsistemas NUEVOS (restart loop / interrupción, CRM gate, RAG sub-loop, error path) de modo que **cualquier turno — incluida cualquier falla — sea 100% reconstruible desde `agent_observability_events`**, sin depender de los `console.error` de Vercel.

**Motivación (evidencia real):** En la investigación del 2026-06-13, el turno `1b561aaf` falló con `V4_AGENT_ERROR` y pudimos ubicar *dónde* (entre `sales_track_result` y `response_track_result`) pero **no *qué***, porque:
- El runner (`v4-production-runner.ts:597-600`) retorna un mensaje **hardcodeado** `'V4 agent processing failed'` y **descarta el `output.errorMessage` real** (que el agente sí arma en `somnio-v4-agent.ts:1021` como `errMsg :: errStack`). Nunca llega a observabilidad NI al chat (ambas superficies muestran el genérico).
- El **CRM gate** (`runCrmGate`, `somnio-v4-agent.ts:594`) no emite NINGÚN evento — fue uno de los 2 sospechosos del throw y es mudo.
- Los eventos del pipeline (comprehension/sales/response) **no llevan `restartIteration`**, así que no se puede separar iter 1 vs iter 2 del restart Path A.
- El RAG sub-loop solo emite `subloop_completed` (outcome) — no se ve qué topic KB recuperó, similarity, ni por qué dio `no_match` vs `generated` (la inconsistencia real percibida por el usuario).

**ALCANCE: puramente ADITIVO (Regla 6).** Cero cambio de comportamiento del agente. Solo `recordEvent` + threadear `restartIteration`. Cada call de logging envuelto para que NO pueda tirar excepción al pipeline. El agente sigue corriendo idéntico en prod; solo "ilumina" lo que ya hace.

**NO es esta fase:** arreglar los bugs de fondo (sub-loop lento, handoff silencioso, zombie por turno de 70s). Eso es follow-up — esta fase es la **instrumentación que permite diagnosticarlos con certeza**.
</domain>

<decisions>
## Implementation Decisions

### D-01 — Captura del error path (cierra el agujero negro)
- **Observability:** emitir un evento NUEVO en el error path que incluya: el `errorMessage` REAL (de `somnio-v4-agent.ts:1014-1021`), **stack truncado (3-5 frames)**, y **EN QUÉ STAGE reventó** (comprehension / guards / sales-track / crm-gate / response-track / sub-loop-slot / send).
- **Chat del operador:** el runner (`v4-production-runner.ts:599`) debe propagar un `error.message` **específico y limpio** (ej. `V4_AGENT_ERROR @ crm-gate: <motivo corto>`) en vez del hardcodeado `'V4 agent processing failed'` — **SIN stack** (el operador no quiere stack en la conversación). El formato del chat es `[ERROR AGENTE] {code}: {message}`, así que mejorar `error.message` mejora el chat de un solo cambio.
- **PII:** cualquier mensaje de usuario embebido en el error se trunca/redacta (reusar el patrón existente — phone last 4, body truncado ~200 chars; ver crm-mutation-tools observability).
- **Una sola fuente:** el mismo fix de la línea 599 alimenta observability Y chat (las 2 superficies que hoy muestran el genérico).

### D-02 — Granularidad: SPINE COMPLETO UNIFORME
- Introducir `stage_entered` / `stage_completed` / `stage_errored` de forma **uniforme en TODO el pipeline v4**: comprehension → guards → sales-track → CRM gate → response-track → slot resolver (sub-loop por slot) → send.
- (Elección del usuario sobre la alternativa "dirigido a fallas" — Regla 0: calidad sobre eficiencia. Cobertura total aunque genere más eventos por turno.)
- Subsistemas que HOY son mudos y deben quedar cubiertos por el spine + eventos propios:
  - **CRM gate:** enter / exit / error / decisión (si prendió o no + por qué).
  - **RAG sub-loop:** por paso — tooling call + resultado, **KB retrieval (qué topic recuperó + similarity + confidence)**, generation, compliance, y error por paso. Esto es lo que explica el flip `generated` ↔ `no_match`.

### D-03 — Tagging de iteración de restart
- Threadear `restartIteration` (el contador que ya vive en `RestartContext`) a **TODOS** los eventos del pipeline (campo uniforme en el payload), no solo a los eventos de drain. Permite separar iter 1 / iter 2 / iter N de un restart Path A en CUALQUIER evento.

### D-04 — Superficie (esta ronda)
- **Solo capa de datos:** emitir los eventos a `agent_observability_events`. La lectura/diagnóstico se hace con los scripts read-only ya creados (`scripts/_v4-drill-turn.mjs`, `_v4-recent.mjs`, `_v4-window.mjs`, `_v4-probe-events.mjs`).
- Extender el **debug panel del sandbox** (tab nuevo o ampliar el existente) = **follow-up separado** (deferred).

### Claude's Discretion
- Nombres exactos de los nuevos labels de evento (siguiendo la convención `category::label` existente; `pipeline_decision` como category por defecto).
- Forma exacta del helper del spine (`recordStage(...)` envuelto en try/catch no-throw) — research/plan deciden.
- Número exacto de frames del stack truncado (3-5).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before researching or planning.**

### Mecanismo v4 (fuente de verdad del pipeline a instrumentar)
- `src/lib/agents/somnio-v4/core/turn-orchestrator.ts` — restart loop (`runTurn`), Path A/B, `restartIteration`, send-loop. Donde vive el contador de iteración a threadear (D-03).
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` — pipeline del turno: comprehension, guards, sales-track (:566), **CRM gate `runCrmGate` (:594, hoy mudo)**, response-track (:618), slot resolver / sub-loop (:678+), catch externo (:1014-1021, errorMessage real).
- `src/lib/agents/somnio-v4/sub-loop/index.ts` — RAG sub-loop (tooling, KB retrieval, generation, compliance, outcome).
- `src/lib/agents/engine/v4-production-runner.ts` — **:597-600 el agujero del `V4_AGENT_ERROR` hardcodeado** (D-01). También :564 `V4_ENGINE_ERROR`.
- `src/lib/agents/somnio-v4/core/checkpoint-gate.ts` + `drain.ts` — eventos de interrupción/drain que YA llevan `restartIteration` (modelo a replicar).

### Observabilidad (infra a usar — NO reinventar)
- `src/lib/observability/collector.ts` §`recordEvent` (:153) — firma del emisor de eventos.
- `src/lib/observability/context.ts` §`getCollector` (:82) — acceso al collector (puede ser null → no-throw).
- `src/lib/agents/interruption-system-v2/observability.ts` — `emitLockEvent` (patrón dual: recordEvent + console.log con prefijo), 11 labels de lock.

### PII redaction (patrón a reusar)
- `src/lib/agents/shared/crm-mutation-tools/helpers.ts` — redacción (phone last 4, email local-part, body truncado). CLAUDE.md documenta el contrato.

### Reglas del proyecto
- `CLAUDE.md` Regla 6 (proteger agente en prod — esta fase es aditiva, cero behavior change) + Regla 3 (no createAdminClient fuera de domain; el collector ya abstrae esto).

### Evidencia de la investigación (turnos reales)
- Turno fallido `1b561aaf-f0e0-4c44-a783-d0d9f22d7431` (V4_AGENT_ERROR en iter 2 del restart).
- Turnos `2b99c592` (path_a + handoff mudo + zombie) y `3188763b` (path_b + zombie) — la observabilidad incompleta que motiva esta fase.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getCollector()?.recordEvent(category, label, payload)` — emisor de eventos ya usado en todo v4. El `?.` ya hace no-throw si el collector es null.
- `emitLockEvent` (interruption-system-v2) — patrón de emisión dual (DB + console) con prefijo; modelo para el spine.
- `RestartContext.restartIteration` (core) — el contador ya existe; solo hay que propagarlo al payload de los eventos.
- Redacción PII de crm-mutation-tools — reusar, no reescribir.

### Established Patterns
- Convención `category::label` (ej. `pipeline_decision::subloop_completed`). Mantener.
- Eventos de drain YA llevan `restart_iteration` en el payload → replicar ese campo en el resto.

### Integration Points
- Cada stage del pipeline en `somnio-v4-agent.ts` + `sub-loop/index.ts` + `turn-orchestrator.ts` (send-loop) recibe un `recordStage`/evento.
- El runner `v4-production-runner.ts:597-600` es el único punto donde el error se aplana — fix de propagación ahí.

### Constraint (Regla 6)
- Cada call de logging DEBE envolverse para no propagar excepción al pipeline (un fallo de observabilidad NUNCA puede tumbar un turno productivo).
</code_context>

<specifics>
## Specific Ideas
- El usuario pegó lo que ve el operador HOY en el chat: `[ERROR AGENTE] V4_AGENT_ERROR: V4 agent processing failed` + 2× `V4_ZOMBIE_LAMBDA_EXIT: [interruption-v2] zombie lambda — lost lock at ckpt_0_post_acquire`. Confirma que el genérico llega al operador → D-01 lo vuelve específico.
- El usuario notó que "en observability no sabe cómo se ve exacto" → research debe mapear el estado actual de AMBAS superficies (DB + chat) por cada tipo de error antes de diseñar los eventos nuevos.
</specifics>

<deferred>
## Deferred Ideas
- **UI del sandbox debug panel** para ver el trace v4 en vivo (tab nuevo o ampliar) — D-04 lo deja para follow-up.
- **Fix de los bugs de fondo** que esta observabilidad va a iluminar: sub-loop lento (~19s × 2 iters), handoff silencioso en `no_match`, turno de 70s que habilita el zombie. Standalone(s) follow-up con causa raíz confirmada por esta instrumentación.
- **Mejorar el render del error al operador** más allá del reason limpio (ej. botón de "ver detalle" con stage) — fuera de scope de datos.
</deferred>

---

*Standalone: v4-observability-completeness*
*Context gathered: 2026-06-13*

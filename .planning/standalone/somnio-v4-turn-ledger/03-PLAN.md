---
phase: somnio-v4-turn-ledger
plan: 03
type: execute
wave: 3
depends_on: [01, 02]
files_modified:
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts
  - src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts
autonomous: true
requirements: [D-02, D-03, D-05, D-06, D-07, D-12, D-15, D-17]
must_haves:
  truths:
    - "Cada uno de los 7 commit-paths reales (R1,R2,R3,R4,R5,R6,R10) construye un TurnLedger COMPLETO (incl. modeTransition + messagesSent) y pasa por commitTurn"
    - "La rama RAG (mapOutcome generated) registra atendido kind:'kb_topic' con topic/confidence/texto DESDE outcome.* (cierra el bug central D-05)"
    - "El ledger construido puebla modeTransition (modo previo del state → newMode) y messagesSent (D-17) — no quedan campos sin poblar"
    - "El silencio natural (R2) registra atendido kind:'silence' (D-15)"
    - "Los 3 interrupt/error paths (R7,R8,R9) NO commitean (descartan turno, D-07)"
    - "Ningún código intra-turno LEE turnLedgerDims — las dims solo se escriben (las lecturas son en turnos futuros vía deserialize, D-06)"
    - "Las decisiones deterministas no cambian (commitTurn solo refleja efectos al final)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/somnio-v4-agent.ts"
      provides: "construcción de TurnLedger COMPLETO (modeTransition+messagesSent) + commitTurn en los 7 return-paths; mapOutcome registra kb_topic desde outcome"
      contains: "commitTurn"
    - path: "src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts"
      provides: "tests RAG/silence/template/decisiones-intactas/modeTransition/no-intra-read (archivo NUEVO)"
      contains: "kb_topic"
  key_links:
    - from: "mapOutcomeToAgentOutput (outcome.status==='generated')"
      to: "atendido kind:'kb_topic'"
      via: "outcome.sourceTopic / outcome.responseConfidence / outcome.responseText"
      pattern: "kind: 'kb_topic'"
    - from: "processUserMessage return-paths"
      to: "commitTurn(mergedState, ledger)"
      via: "reemplaza serializeState directo"
      pattern: "commitTurn\\("
---

<objective>
Construir el `TurnLedger` COMPLETO dentro del agente (incl. `modeTransition` + `messagesSent`,
D-17) y enrutar los 7 commit-paths reales por `commitTurn`, incluyendo el FIX CENTRAL (D-05):
la rama RAG registra `kb_topic` desde `outcome.*` (hoy serializa solo `state` y pierde
sourceTopic/responseConfidence/responseText).

D-17 en este plan: el ledger que se construye es el registro COMPLETO. `commitTurn` persiste
solo `{atendido,crmActions}` (Plan 01) pero el ledger DEBE poblar `modeTransition` (modo previo
del state vs `newMode`) y `messagesSent` para que Plan 04 (emit a observability) los consuma.
Construir el ledger sin esos campos los dejaría fantasma — exactamente el BLOCKER que D-17 resuelve.

Purpose: Cerrar el ciclo — todo turno que envía deja un registro canónico (kb_topic incluido).
Output: `somnio-v4-agent.ts` con ledger COMPLETO acumulado + commitTurn en R1,R2,R3,R4,R5,R6,R10.

CRÍTICO (D-02/D-06/D-12): NO se cambia ninguna decisión determinista. El working state
sigue mutando vivo y las decisiones (sales-track/response-track) lo leen igual que hoy.
El ledger se computa DESPUÉS de decidir y NADIE lo lee intra-turno (D-06 — solo se escribe;
la lectura de dims es en turnos FUTUROS vía deserialize). Los interrupt/error paths
(R7=CKPT-1, R8=CKPT-2, R9=catch) NO commitean — devuelven `input.*` crudo (D-07).
Este plan se pushea SOLO si Plan 02 confirmó la migración en prod (Regla 5).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-turn-ledger/RESEARCH.md
@.planning/standalone/somnio-v4-turn-ledger/DISCUSSION-LOG.md
@.planning/standalone/somnio-v4-turn-ledger/01-SUMMARY.md
@.planning/standalone/somnio-v4-turn-ledger/02-SUMMARY.md

<interfaces>
<!-- Mapa COMPLETO del camino de escritura (research §Q-03b). Usar directo, no explorar. -->
7 commit-paths REALES (commitTurn) — somnio-v4-agent.ts:
- R1 Guard R0/R1 blocked (handoff): serialize :274, return :275-309 → atendido kind:'handoff'
- R2 Natural silence: serialize :575, return :576-623 → atendido kind:'silence' (D-15: SÍ se registra)
- R3 Has-messages (happy path): serialize :627, return :629-688. acciones push :551-558, templates :561-565.
  → atendido kind:'template_intent'/'sales_action'; crmActions desde acciones con crmAction:true (origen 'determinista')
- R4 mapOutcome no_match→handoff: :919-928 → atendido kind:'handoff'
- R5 mapOutcome generated (RAG): :947-956 → atendido kind:'kb_topic' DESDE outcome.* ← BUG CENTRAL D-05
- R6 mapOutcome template: :973-982 → atendido kind:'template_intent'
- R10 processSystemEvent (timer): serialize :784, return :790-827. acciones push :768-775. → crmActions origen 'timer'

3 NO-commit paths (descartan turno, D-07 — NO tocar su lógica de return):
- R7 CKPT-1 interrupt: return input.* crudo :142-154
- R8 CKPT-2 interrupt: return input.* crudo :340-352
- R9 catch error: return input.* crudo :693-709

modeTransition (D-17): el modo previo vive en el state al inicio del turno; `newMode` es el modo
resultante tras las decisiones. Construir `modeTransition: { from: <modo previo>, to: newMode }`
en el ledger de cada commit-path (si no hay cambio, from===to — sigue siendo información válida).
messagesSent (D-17): número de templates/mensajes emitidos en el turno (length de templates enviados).

mapOutcomeToAgentOutput firma (:844-857): recibe { outcome: LoopOutcome, state, analysis, ... }.
`const serialized = serializeState(state)` en :858 → reemplazar por commitTurn(state, ledger)
donde ledger.atendido se construye según outcome.status y ledger.modeTransition/messagesSent se pueblan.

LoopOutcome.status==='generated' (output-schema.ts) carga: responseText, sourceTopic, responseConfidence (non-null garantizado por invariantCheck del sub-loop; ya hay null-guards defensivos en :935).

V4AgentOutput debe incluir turnLedgerDims (campo agregado en Plan 01). El baseOutput de
mapOutcome (:860-886) debe sumar `turnLedgerDims: <commitTurn>.turnLedgerDims`.

AccionRegistrada con flag crmAction:true (push en :551-558 / :768-775) — de ahí se derivan
los crmActions del ledger. Hoy el flag es {tipo,turno,origen,crmAction:true} sin tool/args/result.
Para crmActions registrar lo disponible HOY (origen determinista/timer, result inferido del
push exitoso = 'success'); el shape D-04 completo (tool/args/result real/code) lo llena el
orquestador del #2 — aquí registrar lo que el camino determinista expone sin inventar datos.

TESTS — archivo NUEVO. `__tests__/somnio-v4-agent.test.ts` NO existe hoy (el directorio tiene
comprehension-gemini, comprehension-schema, engine-v4-lock, escalation, invocations, smoke-rag-a,
smoke-rag-b, transitions). Este plan lo CREA. Espejar el harness de invocación del agente que
vive en `engine-v4-lock.test.ts` (seeds de input/state, mocks de sub-loop, aserciones sobre el
output del agente) para construir los casos de este plan.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Construir TurnLedger COMPLETO en processUserMessage + commitTurn en R1,R2,R3,R5,R6 (fix RAG D-05, modeTransition+messagesSent D-17)</name>
  <files>src/lib/agents/somnio-v4/somnio-v4-agent.ts, src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts</files>
  <behavior>
    - Test `RAG ledger`: cuando mapOutcome recibe outcome.status==='generated' con sourceTopic='apnea', responseConfidence=0.85, responseText='...', el output.turnLedgerDims.atendido contiene `{kind:'kb_topic', topic:'apnea', confidence:0.85, texto:'...', turno:N}`.
    - Test `silence ledger`: el path de silencio natural (R2) produce output.turnLedgerDims.atendido con `{kind:'silence'}`.
    - Test `template ledger`: R6 (mapOutcome template) produce atendido `{kind:'template_intent', intent, templateIds:[outcome.responseTemplate]}`.
    - Test `ledger COMPLETO modeTransition+messagesSent`: el ledger construido (capturado vía un spy/mock de commitTurn o vía un harness que exponga el ledger pasado) tiene `modeTransition: {from, to}` poblado (to === newMode) y `messagesSent` === número de templates enviados. Asegura que NO quedan fantasma (D-17 / BLOCKER-2).
    - Test `decisiones intactas`: el intent elegido / sales-action / templates enviados son idénticos con y sin ledger (el ledger no altera la decisión — D-02). Comparar contra snapshot/expectativa previa.
    - Test `no intra-turn read`: confirmar (vía grep en el test o aserción estructural) que dentro de processUserMessage / mapOutcome NO se LEE turnLedgerDims antes del return — las dims solo se escriben (D-06). Implementación: `expect(agentSource).not.toMatch(/turnLedgerDims\s*[.\[]/)` sobre el cuerpo de las funciones de decisión, o un comentario-gate verificable; ver también el grep en verify.
  </behavior>
  <action>
    CREAR el archivo NUEVO `src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts` (NO existe hoy). Espejar el harness de invocación del agente de `engine-v4-lock.test.ts` (seeds + mocks de sub-loop + aserciones de output).

    En `src/lib/agents/somnio-v4/somnio-v4-agent.ts`, construir el ledger COMPLETO como acumulador
    en memoria DESPUÉS de las decisiones (D-12) y fundirlo vía commitTurn en cada return real.
    El ledger SIEMPRE puebla `comprehension`, `atendido`, `crmActions`, `modeTransition`
    ({from: modo previo del state, to: newMode}) y `messagesSent` (length de templates enviados) — D-17:
    ningún campo queda sin poblar; Plan 04 los emite a observability.

    1. **mapOutcomeToAgentOutput (:844)** — reemplazar `const serialized = serializeState(state)` (:858) por construir el `atendido` según `outcome.status`, poblar modeTransition+messagesSent, y llamar `commitTurn(state, ledger)`:
       - status 'generated' (R5, :947): `atendido: [{ kind:'kb_topic', topic: outcome.sourceTopic, confidence: outcome.responseConfidence, texto: outcome.responseText, turno: state.turnCount }]` ← CIERRA D-05. messagesSent=1 (el texto generado).
       - status 'no_match' handoff (R4, :919): `atendido: [{ kind:'handoff', reason: outcome.reason }]`. (NO tocar el branch interrupt :911-918 → ese es R7-equivalente del sub-loop, propaga errorMessage, NO commitea con ledger nuevo — mantener su return tal cual.)
       - status 'template' (R6, :973): `atendido: [{ kind:'template_intent', intent: analysis.intent.primary, templateIds: [outcome.responseTemplate] }]`. messagesSent=1.
       - El baseOutput suma `turnLedgerDims: <commitTurn result>.turnLedgerDims`. comprehension del ledger = { intent: analysis.intent.primary, secondary, confidence }. modeTransition = { from: <modo previo>, to: newMode }.
       Defensive null branches (generated_null, template_null) → atendido handoff con reason.

    2. **R1 Guard blocked (:274)** — construir ledger con `atendido: [{kind:'handoff', reason}]`, modeTransition+messagesSent (0), reemplazar serializeState por commitTurn.

    3. **R2 Natural silence (:575)** — construir ledger con `atendido: [{kind:'silence'}]` (D-15), messagesSent=0, modeTransition poblado, commitTurn.

    4. **R3 Has-messages happy path (:627)** — construir atendido desde lo que se hizo: por cada template mostrado → `{kind:'template_intent'}` o `{kind:'sales_action'}` según corresponda; por cada acción con crmAction:true (push :551-558) → un `crmActions` entry `{tool: <derivable o tipo>, args:{}, result:'success', origen:'determinista', stageAtTime?}` (registrar lo disponible HOY sin inventar; el shape completo lo llena #2). messagesSent = length de templates enviados (:561-565). commitTurn(mergedState, ledger).

    5. Todos los return-paths suman `turnLedgerDims` al output (campo del Plan 01).

    NO mover ninguna decisión. NO tocar R7/R8/R9 (interrupt/error returns crudos). NO leer
    turnLedgerDims intra-turno (D-06 — solo se escribe; lectura en turnos futuros = Plan 04 restore + #3).
    Escribir los 6 tests descritos en el NUEVO `__tests__/somnio-v4-agent.test.ts`.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts && test -z "$(grep -nE 'turnLedgerDims\s*[.\[]' src/lib/agents/somnio-v4/somnio-v4-agent.ts)" && echo "D-06 no intra-turn read OK"</automated>
  </verify>
  <done>Archivo somnio-v4-agent.test.ts CREADO; tests verdes. mapOutcome generated registra kb_topic desde outcome.* (D-05 cerrado); silence registra kind:'silence'; template registra template_intent; el ledger puebla modeTransition+messagesSent (D-17, no fantasma); las decisiones deterministas no cambian; ningún acceso a turnLedgerDims dentro del agente (D-06); R7/R8/R9 sin tocar.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: commitTurn en R10 (timer / processSystemEvent) + crmActions timer</name>
  <files>src/lib/agents/somnio-v4/somnio-v4-agent.ts, src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts</files>
  <behavior>
    - Test `timer ledger`: processSystemEvent que ejecuta una acción CRM por timer produce output.turnLedgerDims.crmActions con un entry origen:'timer'.
    - Test `timer atendido`: el timer que dispara templates/acciones registra el atendido correspondiente (sales_action/template_intent) y el ledger puebla modeTransition+messagesSent (D-17).
  </behavior>
  <action>
    En `processSystemEvent` (R10, serialize :784, return :790-827, acciones push :768-775):
    construir el ledger COMPLETO del turno-timer (atendido según templates/acciones disparadas;
    crmActions con `origen:'timer'` por cada acción crmAction:true; modeTransition+messagesSent poblados).
    Reemplazar serializeState por commitTurn(state, ledger). Sumar turnLedgerDims al output.
    Espejar la lógica de R3 pero con origen 'timer'. Agregar los 2 tests al archivo creado en Task 1.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts</automated>
  </verify>
  <done>R10 pasa por commitTurn; crmActions del timer llevan origen:'timer'; ledger puebla modeTransition+messagesSent; tests verdes; los 7 commit-paths (R1,R2,R3,R4,R5,R6,R10) ahora usan commitTurn.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| outcome RAG → ledger.atendido.kb_topic | texto/confidence generados por el modelo, persistidos |
| acciones determinista/timer → crmActions | datos de mutación CRM (pueden incluir refs a contacto/pedido) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ag-01 | Tampering (cambia decisión) | construcción del ledger intra-turno | mitigate | Ledger se computa DESPUÉS de decidir; test `decisiones intactas` + test `no intra-turn read` (Task 1) verifican D-02/D-06 |
| T-ag-02 | Repudiation (efecto sin registro) | rama RAG perdía sourceTopic | mitigate | mapOutcome generated registra kb_topic desde outcome.* (cierra D-05) |
| T-ag-03 | Information disclosure | texto/args en ledger | transfer | Truncación + redacción mínima ya viven en commitTurn (Plan 01); observabilidad CRM completa diferida al #2 (D-08) |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/somnio-v4/__tests__/` verde (suite completa v4, incl. los 2 archivos nuevos).
- `grep -c "commitTurn(" src/lib/agents/somnio-v4/somnio-v4-agent.ts` ≥ 5 (los return-paths reales; mapOutcome agrupa R4/R5/R6).
- `grep -n "kind: 'kb_topic'" src/lib/agents/somnio-v4/somnio-v4-agent.ts` → presente en la rama generated.
- `grep -n "modeTransition" src/lib/agents/somnio-v4/somnio-v4-agent.ts` → poblado en los commit-paths (D-17, no fantasma).
- D-06: `test -z "$(grep -nE 'turnLedgerDims\s*[.\[]' src/lib/agents/somnio-v4/somnio-v4-agent.ts)"` → 0 lecturas intra-turno.
- R7/R8/R9 sin cambios: `git diff` no toca los returns crudos de :142-154, :340-352, :693-709.
- Push a Vercel SOLO tras confirmación de migración (Plan 02).
</verification>

<success_criteria>
Los 7 commit-paths reales usan commitTurn; la rama RAG registra kb_topic desde outcome.*
(D-05 cerrado); el ledger puebla modeTransition+messagesSent (D-17, ningún campo fantasma);
silence se registra (D-15); crmActions llevan origen determinista/timer; las decisiones
deterministas son idénticas (D-02); ningún acceso a turnLedgerDims intra-turno (D-06);
R7/R8/R9 intactos (D-07). Suite v4 verde.
</success_criteria>

<output>
Crear `.planning/standalone/somnio-v4-turn-ledger/03-SUMMARY.md`.
Commits atómicos en español:
- `feat(v4-ledger): TurnLedger completo (modeTransition+messagesSent) + commitTurn en agente, fix rama RAG registra kb_topic (D-05/D-17)`
- `feat(v4-ledger): commitTurn en path timer con crmActions origen timer`
Push a Vercel tras confirmar migración (Regla 5 — Plan 02).
</output>
</content>
</invoke>

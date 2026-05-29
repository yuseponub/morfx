---
phase: somnio-v4-turn-ledger
plan: 04
type: execute
wave: 4
depends_on: [01, 02, 03]
files_modified:
  - src/lib/agents/engine/v4-production-runner.ts
  - src/lib/agents/somnio-v4/engine-v4.ts
  - src/lib/sandbox/types.ts
requirements: [D-04, D-07, D-08, D-13, D-17]
must_haves:
  truths:
    - "El runner restaura turn_ledger_dims de la columna al construir V4AgentInput y lo persiste en saveState PATH B"
    - "El sandbox engine-v4 replica restore/persist/carryState de las dims (paridad P4)"
    - "carryState (Path B reprocess) incluye las dims → un reprocess no re-registra ni pierde efectos (P3, sin double-increment)"
    - "Path A (interrupt zero-sends) NO persiste las dims (descarta turno, P6) — verificado semánticamente sobre el bloque if (wasInterruptedWithZeroSends), NO por número de línea"
    - "El runner emite el ledger COMPLETO a agent_observability_events: kb_topic_registered + crm_action_recorded + un summary del turno con modeTransition + confidence + messagesSent (D-17b) — ningún campo del TurnLedger queda muerto"
  artifacts:
    - path: "src/lib/agents/engine/v4-production-runner.ts"
      provides: "restore + persist PATH B + carryState de turn_ledger_dims; emit observability (incl. modeTransition/messagesSent del ledger COMPLETO)"
      contains: "turn_ledger_dims"
    - path: "src/lib/agents/somnio-v4/engine-v4.ts"
      provides: "paridad sandbox restore/persist/carryState dims"
      contains: "turnLedgerDims"
    - path: "src/lib/sandbox/types.ts"
      provides: "turnLedgerDims en SandboxState"
      contains: "turnLedgerDims"
  key_links:
    - from: "v4-production-runner saveState PATH B"
      to: "session_state.turn_ledger_dims"
      via: "saveState({ turn_ledger_dims: output.turnLedgerDims })"
      pattern: "turn_ledger_dims:"
    - from: "carryState (runner + engine)"
      to: "iteración Path B reprocess"
      via: "incluye turnLedgerDims del output previo"
      pattern: "turnLedgerDims:"
---

<objective>
Cablear las dims del ledger end-to-end en el runner de producción Y el engine de sandbox
(paridad obligatoria P4), incluyendo carryState (P3) y la exclusión de Path A (P6), y emitir
el ledger COMPLETO como eventos de observabilidad para queryability cross-sesión (D-13/D-17b).

D-17b en este plan: el TurnLedger es el registro COMPLETO. `session_state.turn_ledger_dims`
persiste SOLO `{atendido, crmActions}` (Plan 01). El resto del ledger (modeTransition +
confidence del comprehension + messagesSent) NO se pierde: se EMITE a observability aquí, en
el emit del Task 3. Así cada campo poblado en Plan 03 se consume — ninguno queda fantasma.

Purpose: Persistir las dims first-class (como acciones_ejecutadas) + tener el almacén
analítico (observability) separado del blob per-sesión.
Output: runner + engine-v4 + SandboxState threading; el runner emite el ledger COMPLETO.

CRÍTICO:
- Paridad P4: TODO cambio de persistencia/restore/carryState se replica en `v4-production-runner.ts` Y `engine-v4.ts` (ver INTERRUPTION-PARITY.md). Greps de paridad como gate.
- P3 carryState: dims en carryState (runner ~:859-866, engine ~:456-463) o reprocess Path B pierde/re-registra efectos. NO double-increment (turnCount vive en mergeAnalysis; el ledger NO incrementa).
- P6 Path A: el saveState de Path A (bloque `if (wasInterruptedWithZeroSends) { ... }`, runner ~:944-957) NO incluye dims; solo PATH B normal (~:967-972). Gate semántico (sobre el bloque), NO anclado a líneas.
- NO tocar interruption-system-v2. El ledger es ortogonal al lock.
- Push a Vercel SOLO tras confirmar migración (Plan 02, Regla 5).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-turn-ledger/RESEARCH.md
@.planning/standalone/somnio-v4-turn-ledger/01-SUMMARY.md
@.planning/standalone/somnio-v4-turn-ledger/03-SUMMARY.md
@src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md

<interfaces>
<!-- Puntos de threading EXACTOS (verificados por grep). Usar directo. -->

v4-production-runner.ts:
- Restore acciones_ejecutadas: lee `rawState.acciones_ejecutadas` (:304), fallback _v3: key. → AGREGAR lectura paralela de `rawState.turn_ledger_dims` (default {atendido:[],crmActions:[]}).
- seed object (:327-334) carga accionesEjecutadas. → AGREGAR turnLedgerDims al seed.
- V4AgentInput build (:350) pasa seed.accionesEjecutadas. → AGREGAR turnLedgerDims.
- carryState type (:161-166) tiene accionesEjecutadas. → AGREGAR turnLedgerDims al type.
- carryState assignment Path B (:859-866) carga output.accionesEjecutadas (:864). → AGREGAR output.turnLedgerDims.
- carryState assignment seed-reprocess (:695-700). → AGREGAR turnLedgerDims.
- PATH A saveState: vive dentro del bloque `if (wasInterruptedWithZeroSends) { ... }` (~:944-957; persiste intents_vistos/pendingUserMessage/pack/acciones). → NO AGREGAR dims aquí (P6: Path A descarta turno).
- PATH B saveState (rama `else`, ~:967-972): acciones_ejecutadas (~:971). → AGREGAR `turn_ledger_dims: output.turnLedgerDims`.

engine-v4.ts (sandbox, paridad):
- seedState (:270-278) carga accionesEjecutadas (:278). → AGREGAR turnLedgerDims.
- carryState assignment (:456-462) carga output.accionesEjecutadas (:462). → AGREGAR.
- newState (:494-500) carga output.accionesEjecutadas (:500). → AGREGAR turnLedgerDims.
- DebugTurn build (:519-589) → alimentar dims para que el debug panel (Plan 05) las lea.

sandbox/types.ts: SandboxState tiene accionesEjecutadas:257. → AGREGAR `turnLedgerDims?: TurnLedgerDims`.

Observability: patrón de emisión de eventos pipeline_decision/agent_observability_events
ya usado por crm-mutation-tools (3 eventos) y otros agentes. El runner emite (post-commit, PATH B)
el ledger COMPLETO. NOTA D-17: `commitTurn` solo retorna el subset persistido {atendido,crmActions};
para emitir el ledger COMPLETO (con modeTransition/confidence/messagesSent), el runner necesita
acceso a esos campos. El output del agente (V4AgentOutput) ya carga turnLedgerDims (subset). Para
modeTransition/messagesSent/comprehension: el Plan 03 los puebla en el ledger; el runner los obtiene
del output del agente — añadir en Plan 03 que V4AgentOutput exponga un `turnLedgerSummary?: { modeTransition?; confidence; messagesSent }` (campo adicional liviano del output, NO persistido) para que el runner lo emita. Si Plan 03 ya threadeó esos campos al output, reusar; si no, el ejecutor de Plan 04 debe pedirlos al output del agente (NO recalcular). Emitir desde el runner post-commit (tiene el collector/observability adapter) es más limpio que desde commitTurn puro (state.ts no debe tener side-effects de I/O). Preferir emit en runner.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Threading turn_ledger_dims en v4-production-runner (restore + PATH B persist + carryState, NO Path A)</name>
  <files>src/lib/agents/engine/v4-production-runner.ts</files>
  <action>
    1. Restore: tras leer acciones_ejecutadas (~:304), leer `const sessionTurnLedgerDims = (rawState.turn_ledger_dims as TurnLedgerDims | undefined) ?? { atendido: [], crmActions: [] }` (default graceful — sesiones legacy sin columna o con `{}`).
    2. seed (:327-334): agregar `turnLedgerDims` al objeto seed (default desde session; carryState lo override en reprocess).
    3. V4AgentInput build (:350): pasar `turnLedgerDims: seed.turnLedgerDims`.
    4. carryState type (:161-166): agregar `turnLedgerDims: TurnLedgerDims`.
    5. carryState assignments (:695-700 seed-reprocess y :859-866 Path B): cargar `turnLedgerDims: output.turnLedgerDims` (P3 — el reprocess hereda el ledger de iter previa, no lo pierde ni double-registra).
    6. PATH B saveState (rama `else`, ~:967-972): agregar `turn_ledger_dims: output.turnLedgerDims`.
    7. PATH A saveState (bloque `if (wasInterruptedWithZeroSends) { ... }`, ~:944-957): NO agregar dims (P6 — Path A descarta turno; persistirlas registraría efectos de un turno no-enviado).
    Importar TurnLedgerDims desde somnio-v4/types. NO introducir createAdminClient nuevo.
  </action>
  <verify>
    <automated>grep -n "turn_ledger_dims\|turnLedgerDims" src/lib/agents/engine/v4-production-runner.ts && test "$(awk '/if \(wasInterruptedWithZeroSends\) \{/{f=1} f{print; if(/} else {/)exit}' src/lib/agents/engine/v4-production-runner.ts | grep -c 'turn_ledger_dims')" = "0" && echo "P6 Path A sin dims OK" && npx tsc --noEmit 2>&1 | grep "v4-production-runner" || echo "ok"</automated>
  </verify>
  <done>Runner restaura dims con default graceful, las pasa a V4AgentInput, las incluye en carryState (ambos sitios), las persiste en PATH B saveState, y NO en el bloque if(wasInterruptedWithZeroSends) (P6, verificado semánticamente sobre el bloque — no por línea). Compila.</done>
</task>

<task type="auto">
  <name>Task 2: Paridad sandbox — engine-v4 + SandboxState (restore/persist/carryState/DebugTurn)</name>
  <files>src/lib/agents/somnio-v4/engine-v4.ts, src/lib/sandbox/types.ts</files>
  <action>
    Paridad P4 (espejo exacto del Task 1):
    1. `src/lib/sandbox/types.ts` SandboxState: agregar `turnLedgerDims?: TurnLedgerDims` (junto a accionesEjecutadas:257, tipado FUERTE con TurnLedgerDims — W-3: el state-tab del Plan 05 lee este campo, NO el de SessionState que está tipado unknown[]; el narrowing por `a.kind === 'kb_topic'` debe funcionar sin unknown).
    2. `engine-v4.ts` seedState (:270-278): cargar `turnLedgerDims: seedState.turnLedgerDims ?? { atendido: [], crmActions: [] }`.
    3. carryState (:456-462): cargar `turnLedgerDims: output.turnLedgerDims` (P3).
    4. newState (:494-500): cargar `turnLedgerDims: output.turnLedgerDims`.
    5. DebugTurn build (:519-589): incluir las dims en el payload para que el Plan 05 (debug panel) las renderice (ej. `stateAfter` ya es newState → las dims llegan vía SandboxState; verificar que `stateAfter: newState` (:552) las propaga).
    NO tocar la lógica de Path A/B ni el restart loop (paridad de mecanismo, no de cambios nuevos).
  </action>
  <verify>
    <automated>grep -n "turnLedgerDims" src/lib/agents/somnio-v4/engine-v4.ts && grep -n "turnLedgerDims" src/lib/sandbox/types.ts && npx tsc --noEmit 2>&1 | grep -E "engine-v4|sandbox/types" || echo "ok"</automated>
  </verify>
  <done>SandboxState tiene turnLedgerDims tipado FUERTE (TurnLedgerDims); engine-v4 lo restaura, lo carga en carryState + newState, y lo propaga a DebugTurn (vía newState). Compila. Paridad con runner.</done>
</task>

<task type="auto">
  <name>Task 3: Emitir el ledger COMPLETO a observabilidad (kb_topic_registered + crm_action_recorded + summary del turno con modeTransition/confidence/messagesSent)</name>
  <files>src/lib/agents/engine/v4-production-runner.ts</files>
  <action>
    Post-commit (PATH B, después del saveState ~:967-972 exitoso), emitir a observability
    (mismo collector/adapter que ya usa el runner para pipeline_decision) el ledger COMPLETO
    (D-13/D-17b — almacén analítico cross-sesión separado del blob per-sesión; aquí se CONSUMEN
    los campos del TurnLedger que NO se persisten en session_state, evitando que queden fantasma):
    - Por cada `output.turnLedgerDims.atendido` con `kind:'kb_topic'` → evento `kb_topic_registered` con payload `{ topic, confidence, turno }` (NO incluir `texto` completo — ya está truncado en el blob; aquí solo metadata queryable).
    - Por cada `output.turnLedgerDims.crmActions` → evento `crm_action_recorded` con payload `{ tool, result, origen, code? }` (args redactados — la observabilidad CRM completa se difiere al #2, D-08).
    - UN evento `turn_ledger_committed` (summary del turno) con payload `{ modeTransition, confidence, messagesSent, intent }` tomado del `turnLedgerSummary` que Plan 03 expone en el output del agente (D-17b). ESTE evento es el que consume modeTransition/confidence/messagesSent — sin él esos campos quedarían muertos.
    Solo en PATH B (no Path A — turno descartado). Usar el patrón de emisión existente del runner
    (in-memory collector que sobrevive vía return de step.run si aplica — ver memoria
    inngest_observability_merge). NO emitir desde state.ts (mantener commitTurn puro, sin I/O).
    Si el runner ya tiene un helper de emisión (recordEvent / emit pipeline_decision), reusarlo.
    Si `turnLedgerSummary` no llega en el output (Plan 03 no lo threadeó), PARAR y reportar — NO recalcular modeTransition en el runner (la fuente de verdad es el agente).
  </action>
  <verify>
    <automated>grep -n "kb_topic_registered\|crm_action_recorded\|turn_ledger_committed" src/lib/agents/engine/v4-production-runner.ts && grep -n "modeTransition\|messagesSent" src/lib/agents/engine/v4-production-runner.ts && npx tsc --noEmit 2>&1 | grep "v4-production-runner" || echo "ok"</automated>
  </verify>
  <done>El runner emite kb_topic_registered por cada kb_topic, crm_action_recorded por cada crmAction, y turn_ledger_committed (summary con modeTransition/confidence/messagesSent — D-17b), solo en PATH B, con payload metadata (sin texto completo, args redactados). Ningún campo del TurnLedger queda fantasma. Compila.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| output.turnLedgerDims → saveState | datos del turno cruzan a persistencia DB |
| carryState → reprocess iteration | estado heredado entre iteraciones del mismo lambda |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-run-01 | Tampering (double-register) | Path B reprocess re-registra efectos | mitigate | dims en carryState (P3) → reprocess hereda, no re-registra; turnCount sigue en mergeAnalysis (no double-increment) |
| T-run-02 | Repudiation (efecto de turno descartado) | Path A persiste dims | mitigate | Path A saveState (bloque if wasInterruptedWithZeroSends) NO incluye dims (P6); gate semántico sobre el bloque |
| T-run-03 | Tampering (regresión paridad) | runner vs sandbox divergen | mitigate | Greps de paridad en ambos archivos (verify); INTERRUPTION-PARITY.md checklist |
| T-run-04 | Information disclosure | args CRM en observability | mitigate | crm_action_recorded payload sin args (solo tool/result/origen); texto no se emite |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/somnio-v4/__tests__/` verde (carryState test incluido si existe; si no, agregar en Plan 05).
- Paridad: `grep -c "turnLedgerDims" src/lib/agents/engine/v4-production-runner.ts` ≥ 4 Y `grep -c "turnLedgerDims" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 3.
- P6 (semántico, NO por línea): `awk '/if \(wasInterruptedWithZeroSends\) \{/{f=1} f{print; if(/} else {/)exit}' v4-production-runner.ts | grep -c 'turn_ledger_dims'` → 0 (las dims NO aparecen en el bloque Path A).
- `grep "kb_topic_registered\|crm_action_recorded\|turn_ledger_committed"` presente en runner (emit del ledger COMPLETO, D-17b).
- NO se toca `src/lib/agents/interruption-system-v2/` (`git diff --name-only | grep interruption-system-v2` → 0).
- Push a Vercel SOLO tras confirmar migración (Plan 02).
</verification>

<success_criteria>
Runner y sandbox restauran/persisten/carryState las dims en paridad; carryState incluye dims
(reprocess no pierde ni re-registra, P3); Path A NO persiste (P6, verificado semánticamente sobre
el bloque if(wasInterruptedWithZeroSends)); commitTurn no muta frontera transaccional; el runner
emite el ledger COMPLETO (kb_topic_registered + crm_action_recorded + turn_ledger_committed con
modeTransition/confidence/messagesSent — D-17b, ningún campo fantasma). interruption-system-v2 intacto.
</success_criteria>

<output>
Crear `.planning/standalone/somnio-v4-turn-ledger/04-SUMMARY.md`.
Commits atómicos en español:
- `feat(v4-ledger): threading turn_ledger_dims en runner (restore/PATH B persist/carryState, no Path A)`
- `feat(v4-ledger): paridad sandbox engine-v4 + SandboxState dims`
- `feat(v4-ledger): emit ledger completo a observability (kb_topic_registered + crm_action_recorded + turn_ledger_committed D-17b)`
Push a Vercel tras confirmar migración (Regla 5).
</output>
</content>
</invoke>

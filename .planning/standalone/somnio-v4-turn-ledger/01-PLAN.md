---
phase: somnio-v4-turn-ledger
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v4/types.ts
  - src/lib/agents/somnio-v4/state.ts
  - src/lib/agents/types.ts
autonomous: true
requirements: [D-03, D-04, D-11, D-12, D-15, D-16]
must_haves:
  truths:
    - "Existe un tipo TurnLedger explícito con atendido[] (discriminated union por kind), crmActions[], comprehension, modeTransition, messagesSent"
    - "commitTurn(workingState, ledger) serializa el working state COMPLETO + las dims del ledger en un solo punto"
    - "Una sesión sin dims (legacy) deserializa con default graceful ([] / {}) sin romper"
    - "SessionState tiene turn_ledger_dims opcional (sin as any)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/types.ts"
      provides: "TurnLedger, Atendido union, CrmActionRegistrada, TurnLedgerDims; campos en V4AgentInput/V4AgentOutput"
      contains: "interface TurnLedger"
    - path: "src/lib/agents/somnio-v4/state.ts"
      provides: "commitTurn() + serialize/deserialize de turn_ledger_dims"
      contains: "export function commitTurn"
    - path: "src/lib/agents/types.ts"
      provides: "campo opcional turn_ledger_dims en SessionState"
      contains: "turn_ledger_dims"
  key_links:
    - from: "src/lib/agents/somnio-v4/state.ts commitTurn"
      to: "serializeState"
      via: "wrap (commitTurn llama serializeState y añade dims)"
      pattern: "commitTurn.*serializeState"
---

<objective>
Definir los TIPOS del Turn Ledger y el punto de commit único (`commitTurn`), más el
contrato de persistencia (campo opcional en `SessionState`). Es la fundación: todo lo
demás (mapOutcome, runner, sandbox, debug panel) consume estos tipos.

Purpose: Cerrar estructuralmente el ciclo (D-11/D-12) — un solo tipo de registro de
efectos y un solo punto de serialización, imposible que una rama "olvide" registrar.
Output: `TurnLedger` + `commitTurn` + `TurnLedgerDims` + campo opcional en `SessionState`.

NO se cambia ninguna decisión determinista (D-02/D-06). El ledger es capa de efectos.
NO se toca el módulo de interrupción. NO se persiste todavía a DB (eso es Plan 02 migración + Plan 03 threading).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-turn-ledger/CONTEXT.md
@.planning/standalone/somnio-v4-turn-ledger/DISCUSSION-LOG.md
@.planning/standalone/somnio-v4-turn-ledger/RESEARCH.md

<interfaces>
<!-- Contratos existentes a espejar. NO explorar el codebase: usar estos directamente. -->

Patrón a espejar exactamente — `accionesEjecutadas` first-class (de state.ts:287-392):
- serializeState retorna `{ datosCapturados, packSeleccionado, intentsVistos, templatesEnviados, accionesEjecutadas }` (state.ts:287-321)
- deserializeState recibe `accionesEjecutadas: AccionRegistrada[] = []` como ÚLTIMO param con default (state.ts:331), restore con fallback graceful (state.ts:357-383)

AccionRegistrada / TipoAccion ya existen en types.ts (TipoAccion: ofrecer_promos | mostrar_confirmacion | pedir_datos | crear_orden | crear_orden_sin_promo | crear_orden_sin_confirmar | handoff | ...).

StateChanges (state.ts:34-42) = modelo conceptual de "delta del turno" a imitar para TurnLedger (objeto plano de efectos).

Invocation / SystemEvent (types.ts:382-397, :329-331) = precedente de discriminated union con `kind`/`type`.

SessionState interface (src/lib/agents/types.ts:281-300) NO tiene acciones_ejecutadas (se lee con `as any` en el runner). NO repetir esa deuda: agregar campo opcional.

LoopOutcome (sub-loop/output-schema.ts:35-154) — status 'generated' carga `sourceTopic` / `responseConfidence` / `responseText` (estos son los campos que la rama RAG pierde hoy; el ledger los registrará en Plan 03).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Definir tipos TurnLedger + Atendido union + CrmActionRegistrada + TurnLedgerDims</name>
  <files>src/lib/agents/somnio-v4/types.ts</files>
  <behavior>
    - `Atendido` es discriminated union por `kind` con 5 variantes: `template_intent` {intent, templateIds}, `sales_action` {accion: TipoAccion, templateIds}, `kb_topic` {topic, confidence, texto, turno}, `handoff` {reason}, `silence` {} (D-15: silence SÍ se registra).
    - `CrmActionRegistrada` shape EXACTO D-04: `{ tool: string; args: Record<string, unknown>; result: 'success'|'failed'|'cas_reject'; code?: string; origen: 'determinista'|'rag'|'timer'; stageAtTime?: string }` (diseñado para recibir el sub-loop orquestador del #2).
    - `TurnLedger` (acumulador en memoria, modelo StateChanges) = `{ comprehension: { intent, secondary?, confidence }; atendido: Atendido[]; crmActions: CrmActionRegistrada[]; modeTransition?: { from: string; to: string }; messagesSent: number }`.
    - `TurnLedgerDims` (la forma persistida en la columna jsonb) = `{ atendido: Atendido[]; crmActions: CrmActionRegistrada[] }` (la parte durable del ledger; comprehension ya fluye vía intentsVistos, modeTransition/messagesSent son por-turno).
  </behavior>
  <action>
    En `src/lib/agents/somnio-v4/types.ts` agregar (cerca de los tipos de estado, NO romper nada existente):
    1. `export type Atendido = | { kind: 'template_intent'; intent: string; templateIds: string[] } | { kind: 'sales_action'; accion: TipoAccion; templateIds: string[] } | { kind: 'kb_topic'; topic: string; confidence: number; texto: string; turno: number } | { kind: 'handoff'; reason: string } | { kind: 'silence' }`.
    2. `export interface CrmActionRegistrada { tool: string; args: Record<string, unknown>; result: 'success' | 'failed' | 'cas_reject'; code?: string; origen: 'determinista' | 'rag' | 'timer'; stageAtTime?: string }` (D-04 verbatim — NO simplificar; diseñado para el orquestador del #2 aunque hoy solo lo llene el camino determinista).
    3. `export interface TurnLedgerDims { atendido: Atendido[]; crmActions: CrmActionRegistrada[] }` (la parte PERSISTIDA del ledger).
    4. `export interface TurnLedger { comprehension: { intent: string; secondary?: string; confidence: number }; atendido: Atendido[]; crmActions: CrmActionRegistrada[]; modeTransition?: { from: string; to: string }; messagesSent: number }`.
    5. En `V4AgentInput` (types.ts:142): agregar `turnLedgerDims?: TurnLedgerDims` (opcional, backward-compat con sandbox/tests).
    6. En `V4AgentOutput` (types.ts:190): agregar `turnLedgerDims: TurnLedgerDims` (campo persistible, junto a accionesEjecutadas:221).
    Comentar cada bloque referenciando D-03/D-04/D-15. NO agregar `silence` como AccionRegistrada — `silence` es solo un `Atendido`.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "somnio-v4/(types|state)" || echo "no type errors in v4 types"</automated>
  </verify>
  <done>Compila. TurnLedger/Atendido/CrmActionRegistrada/TurnLedgerDims exportados; Atendido tiene exactamente 5 variantes incl. silence; CrmActionRegistrada matchea D-04 verbatim; V4AgentInput tiene turnLedgerDims opcional y V4AgentOutput lo tiene requerido.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: commitTurn() + serialize/deserialize de turn_ledger_dims (con tests roundtrip)</name>
  <files>src/lib/agents/somnio-v4/state.ts, src/lib/agents/somnio-v4/__tests__/state.test.ts</files>
  <behavior>
    - Test `commitTurn roundtrip`: dado un workingState + un TurnLedger con un atendido kb_topic y un crmAction success, `commitTurn` retorna un objeto que incluye TODO lo de serializeState MÁS `turnLedgerDims: { atendido, crmActions }`.
    - Test `deserialize legacy graceful`: `deserializeState(...)` SIN el nuevo param → `turnLedgerDims` no rompe; el AgentState resultante es idéntico al actual (espejo del test de accionesEjecutadas backward-compat existente).
    - Test `texto truncation`: un atendido kb_topic con `texto` > límite se trunca antes de persistir (cap ~500 chars, criterio del debug-payload) — el ledger no infla el jsonb.
  </behavior>
  <action>
    En `src/lib/agents/somnio-v4/state.ts`:
    1. `export function commitTurn(workingState: AgentState, ledger: TurnLedger): { datosCapturados; packSeleccionado; intentsVistos; templatesEnviados; accionesEjecutadas; turnLedgerDims: TurnLedgerDims }` — llama `serializeState(workingState)` (NO reimplementar) y le agrega `turnLedgerDims: { atendido: <truncado>, crmActions: ledger.crmActions }`. Esto cumple D-11/D-12: único punto que funde working state + efectos.
    2. Truncar `texto` de cada `{kind:'kb_topic'}` a 500 chars antes de incluirlo (Security V5 / no inflar jsonb). Helper local `truncateTexto(s, max=500)`.
    3. Considerar redacción mínima de phone/email en `crmActions.args` (criterio: si una key es `phone`/`telefono` dejar last-4, `email`/`correo` enmascarar local-part). NOTA: la observabilidad CRM completa se difiere al #2 (D-08); aquí solo redacción mínima defensiva, sin construir infra.
    4. Extender `deserializeState` agregando un param NUEVO al final con default: `turnLedgerDims: TurnLedgerDims = { atendido: [], crmActions: [] }`. NO devolverlo dentro de AgentState (AgentState es working state; el ledger se restaura como input separado — ver Plan 03 runner). El default graceful cubre sesiones legacy (D-16). El deserialize de las dims es trivial (pasthrough con default) — espejar el patrón de accionesEjecutadas (state.ts:331,357-383) pero sin el parsing de formato viejo (no hay formato legacy de dims).
    5. Escribir los 3 tests descritos en `__tests__/state.test.ts` espejando los tests existentes de `accionesEjecutadas` en ese mismo archivo.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/state.test.ts</automated>
  </verify>
  <done>Los 3 tests pasan. commitTurn llama serializeState y añade turnLedgerDims; texto se trunca a 500; deserialize sin dims usa default graceful; suite state.test.ts verde completa.</done>
</task>

<task type="auto">
  <name>Task 3: Campo opcional turn_ledger_dims en SessionState (sin as any)</name>
  <files>src/lib/agents/types.ts</files>
  <action>
    En `src/lib/agents/types.ts` interface `SessionState` (líneas ~281-300) agregar campo OPCIONAL aditivo:
    `turn_ledger_dims?: { atendido: unknown[]; crmActions: unknown[] }` (o referenciar TurnLedgerDims si no genera ciclo de import — preferible `unknown[]` para evitar import cross-módulo desde el tipo compartido; el runner v4 castea a TurnLedgerDims al leer).
    Razón (P5 del research): el runner lee `acciones_ejecutadas` con `as any` porque NO está en SessionState. Para las dims NO repetimos esa deuda. Es aditivo: ningún agente no-v4 lo lee (Regla 6 OK por opcionalidad, A3 del research).
    Comentar referenciando D-16 + que es v4-only + Regla 6 por opcionalidad.
  </action>
  <verify>
    <automated>grep -n "turn_ledger_dims" src/lib/agents/types.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "types.ts" || echo "ok"</automated>
  </verify>
  <done>SessionState tiene turn_ledger_dims opcional. Compila. Ningún cambio rompe a v3/godentist/recompra/pw-confirmation (campo opcional, nadie lo lee).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| modelo RAG → ledger.atendido.texto | output del LLM (texto generado) se persiste en jsonb — no confiable en tamaño |
| crmActions.args → ledger persistido | puede contener phone/email (PII) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ledger-01 | Denial (jsonb bloat) | commitTurn texto persist | mitigate | Truncar `texto` a 500 chars en commitTurn antes de persistir (Task 2) |
| T-ledger-02 | Information disclosure (PII) | crmActions.args persist | mitigate | Redacción mínima phone last-4 / email masked en commitTurn; observabilidad CRM completa diferida al #2 (D-08) |
| T-ledger-03 | Tampering (regresión v3+) | SessionState compartido | accept | Campo opcional aditivo; greps Regla 6 en Plan 05 confirman 0 lecturas no-v4 |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/somnio-v4/__tests__/state.test.ts` verde.
- `npx tsc --noEmit` sin errores nuevos en somnio-v4.
- `grep -n "commitTurn" src/lib/agents/somnio-v4/state.ts` → commitTurn llama serializeState (wrap, no reimplementación).
- `grep -n "turn_ledger_dims" src/lib/agents/types.ts` → campo opcional presente.
</verification>

<success_criteria>
TurnLedger/Atendido/CrmActionRegistrada/TurnLedgerDims definidos; commitTurn es el único wrap de serializeState que añade dims; texto truncado; deserialize backward-compat graceful; SessionState con campo opcional sin as any. Cero cambio de comportamiento determinista (solo tipos + serialización). NADA se persiste a DB todavía (eso requiere migración Plan 02).
</success_criteria>

<output>
Crear `.planning/standalone/somnio-v4-turn-ledger/01-SUMMARY.md`.
Commit atómico en español: `feat(v4-ledger): tipos TurnLedger + commitTurn + campo opcional en SessionState`
</output>

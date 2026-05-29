---
phase: somnio-v4-turn-ledger
plan: 05
type: execute
wave: 5
depends_on: [01, 02, 03, 04]
files_modified:
  - src/app/(dashboard)/sandbox/components/debug-panel/state-tab.tsx
  - src/lib/agents/somnio-v4/__tests__/state.test.ts
  - src/lib/agents/somnio-v4/ARCHITECTURE.md
must_haves:
  truths:
    - "El state-tab existente muestra 'KB Topics Atendidos' + 'CRM Actions' (mismo patrón badge que Acciones Ejecutadas)"
    - "NO se agrega tab nuevo (TAB_ICONS intacto)"
    - "Test carryState confirma que un reprocess Path B no pierde el ledger"
    - "Los greps de Regla 6 dan los resultados esperados (0 impacto no-v4)"
    - "ARCHITECTURE.md documenta el ledger y corrige la descripción desactualizada de crm_mutation"
  artifacts:
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/state-tab.tsx"
      provides: "secciones KB Topics Atendidos + CRM Actions"
      contains: "KB Topics"
    - path: "src/lib/agents/somnio-v4/ARCHITECTURE.md"
      provides: "doc del ledger + corrección crm_mutation"
      contains: "Turn Ledger"
  key_links:
    - from: "state-tab.tsx"
      to: "SandboxState.turnLedgerDims"
      via: "render badges de atendido + crmActions"
      pattern: "turnLedgerDims"
---

<objective>
Surfacing visual del ledger (D-14: extender state-tab, NO tab nuevo), test de carryState
(P3 cerrado con verificación), gate Regla 6 (greps §Q-08) y documentación (D-10).

Purpose: "state visual real" + cerrar el standalone con la suite verde, Regla 6 verificada y docs sincronizados (Regla 4).
Output: state-tab extendido + test carryState + ARCHITECTURE.md actualizado.

D-14: extender el `state-tab` existente. NO agregar id al `DebugPanelTabId` union ni icono al
`TAB_ICONS` (eso forzaría el invariante exhaustivo). Tab "Ledger" dedicado con timeline =
follow-up opcional, fuera de scope.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-turn-ledger/RESEARCH.md
@.planning/standalone/somnio-v4-turn-ledger/DISCUSSION-LOG.md
@.planning/standalone/somnio-v4-turn-ledger/04-SUMMARY.md
@src/lib/agents/somnio-v4/ARCHITECTURE.md

<interfaces>
<!-- Patrón de render a copiar -->
state-tab.tsx:73-90 renderiza "Acciones Ejecutadas" como badges desde SandboxState.accionesEjecutadas.
→ Replicar dos secciones nuevas leyendo SandboxState.turnLedgerDims (agregado en Plan 04):
  - "KB Topics Atendidos": badge por cada atendido kind:'kb_topic' → `{topic} ({confidence})`.
  - "CRM Actions": badge/fila por cada crmActions → `{tool} · {result} · {origen}`.
SandboxState.turnLedgerDims es opcional → guard `?? { atendido: [], crmActions: [] }`.

TAB_ICONS (tab-bar.tsx:24-35) = Record<DebugPanelTabId> EXHAUSTIVO. NO tocar (D-14).

ARCHITECTURE.md (somnio-v4/) describe crm_mutation como vivo, pero isCrmMutation está
hardcoded false en somnio-v4-agent.ts:172 (muerto). Corregir (D-10).

Greps Regla 6 (research §Q-08), baseline 0:
1. grep -rln "somnio-v4|turn-ledger|TurnLedger|commitTurn|turn_ledger_dims" en agentes no-v4 → 0
2. git diff --name-only confinado a archivos v4 + runner + sandbox types + debug-panel + types.ts + migración + docs
3. grep -E "DROP|ALTER COLUMN|RENAME" migración → 0
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extender state-tab con KB Topics Atendidos + CRM Actions</name>
  <files>src/app/(dashboard)/sandbox/components/debug-panel/state-tab.tsx</files>
  <action>
    Tras la sección "Acciones Ejecutadas" (state-tab.tsx:73-90), agregar dos secciones nuevas
    leyendo `state.turnLedgerDims ?? { atendido: [], crmActions: [] }` (campo del Plan 04):
    1. "KB Topics Atendidos": iterar `dims.atendido.filter(a => a.kind === 'kb_topic')`, render badge
       `{topic} — {(confidence*100).toFixed(0)}%`. Si vacío, no renderizar la sección (o "—").
    2. "CRM Actions": iterar `dims.crmActions`, render fila/badge `{tool} · {result} · {origen}`
       (color por result: success verde, failed/cas_reject rojo — mismo patrón visual del tab).
    Reusar exactamente el componente badge/estilo de "Acciones Ejecutadas" (D-14: mismo patrón).
    NO agregar tab nuevo. NO tocar TAB_ICONS, debug-tabs, panel-container, ni el union DebugPanelTabId.
  </action>
  <verify>
    <automated>grep -n "turnLedgerDims\|KB Topics\|CRM Actions" "src/app/(dashboard)/sandbox/components/debug-panel/state-tab.tsx" && ! git diff --name-only | grep -E "tab-bar.tsx|debug-tabs.tsx" && npx tsc --noEmit 2>&1 | grep "state-tab" || echo "ok"</automated>
  </verify>
  <done>state-tab muestra KB Topics Atendidos + CRM Actions con el patrón badge existente; TAB_ICONS/tab-bar/debug-tabs intactos; compila.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Test carryState incluye dims (Path B reprocess no pierde ledger)</name>
  <files>src/lib/agents/somnio-v4/__tests__/state.test.ts</files>
  <behavior>
    - Test `carryState preserva ledger`: simular dos iteraciones (iter-1 registra un kb_topic; iter-2 reprocess Path B parte de carryState) → el ledger de iter-2 contiene el kb_topic de iter-1 + lo nuevo, sin double-registrar ni perder. (Unit a nivel de commitTurn + merge de carryState dims; si requiere el runner, marcar como integration con un harness mínimo.)
    - Test `turnCount no double-increment`: confirmar que el ledger no incrementa turnCount (vive en mergeAnalysis).
  </behavior>
  <action>
    Agregar a `state.test.ts` los 2 tests descritos, espejando los tests existentes de
    accionesEjecutadas + carryState ya presentes en la suite v4 (el patrón de Path B reprocess
    ya tiene tests para acciones — espejar). Verificar que las dims se heredan vía carryState
    (P3) y que turnCount no se double-incrementa.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/</automated>
  </verify>
  <done>Suite v4 completa verde incluyendo los 2 tests nuevos de carryState; el reprocess Path B preserva el ledger sin double-register.</done>
</task>

<task type="auto">
  <name>Task 3: Gate Regla 6 (greps §Q-08) + suite no-v4 verde</name>
  <files>src/lib/agents/somnio-v4/ARCHITECTURE.md</files>
  <action>
    Ejecutar los greps de Regla 6 (§Q-08) y confirmar resultados esperados. Documentar el
    resultado en el SUMMARY (no es un archivo de código — esta tarea es verificación + se
    aprovecha para tocar ARCHITECTURE.md en Task 4; aquí solo correr gates). Si algún grep
    falla (impacto no-v4 detectado), DETENER y reportar antes de continuar.
    Greps:
    1. `grep -rln "somnio-v4\|turn-ledger\|TurnLedger\|commitTurn\|turn_ledger_dims" src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/` → 0.
    2. Confinamiento de cambios (git diff --name-only filtrado).
    3. `grep -E "DROP|ALTER COLUMN|RENAME" supabase/migrations/*turn_ledger*` → 0.
    4. Suite no-v4: correr tests de al menos un agente no-v4 (ej. recompra) → verde.
  </action>
  <verify>
    <automated>test -z "$(grep -rln 'somnio-v4\|TurnLedger\|commitTurn\|turn_ledger_dims' src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/ 2>/dev/null)" && test -z "$(grep -E 'DROP|ALTER COLUMN|RENAME' supabase/migrations/*turn_ledger* 2>/dev/null)" && echo "Regla 6 OK"</automated>
  </verify>
  <done>Grep #1 = 0 matches en agentes no-v4; grep #3 = 0; cambios confinados a archivos v4/runner/sandbox/debug/types/migración/docs; suite no-v4 verde.</done>
</task>

<task type="auto">
  <name>Task 4: Actualizar ARCHITECTURE.md (ledger + corrección crm_mutation)</name>
  <files>src/lib/agents/somnio-v4/ARCHITECTURE.md</files>
  <action>
    Regla 4 + D-10:
    1. Agregar sección "Turn Ledger" documentando: qué captura (comprehension/atendido[]/crmActions[]/
       modeTransition/messagesSent), el principio de commit único (commitTurn wrap de serializeState),
       la columna `turn_ledger_dims`, los 7 commit-paths reales vs 3 no-commit (interrupt/error D-07),
       que las dims se leen en turnos FUTUROS (D-06), y la emisión a observability (kb_topic_registered/crm_action_recorded).
    2. Corregir la descripción desactualizada de `crm_mutation`: hoy el doc lo pinta vivo, pero
       `isCrmMutation` está hardcoded `false` en `somnio-v4-agent.ts:172` (muerto). Anotar que
       la consolidación CRM al sub-loop es el standalone #2 y que el ledger ya anticipa su shape (D-04/D-08).
  </action>
  <verify>
    <automated>grep -n "Turn Ledger\|turn_ledger_dims\|isCrmMutation\|hardcoded false\|standalone #2" src/lib/agents/somnio-v4/ARCHITECTURE.md && echo "docs OK"</automated>
  </verify>
  <done>ARCHITECTURE.md tiene sección Turn Ledger + la descripción de crm_mutation corregida (marcada muerta, isCrmMutation=false, consolidación = #2).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| SandboxState.turnLedgerDims → UI | datos del ledger renderizados en debug panel (solo operador) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ui-01 | Information disclosure | texto kb_topic / args CRM en UI | accept | Debug panel solo visible a operador autenticado en /sandbox; texto ya truncado; args redactados en commitTurn |
| T-ui-02 | Tampering (regresión tabs) | agregar tab rompe TAB_ICONS | mitigate | D-14: extender state-tab, NO tab nuevo; verify confirma tab-bar/debug-tabs intactos |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/somnio-v4/__tests__/` verde (suite completa incl. carryState).
- Suite de al menos un agente no-v4 verde (Regla 6).
- Greps §Q-08: #1=0, #3=0, cambios confinados.
- state-tab muestra KB Topics + CRM Actions; tab-bar/debug-tabs/TAB_ICONS intactos.
- ARCHITECTURE.md actualizado (Turn Ledger + crm_mutation corregido).
</verification>

<success_criteria>
state-tab extendido (sin tab nuevo, D-14); carryState test confirma P3; greps Regla 6 verdes
(0 impacto no-v4); ARCHITECTURE.md sincronizado (D-10). Standalone listo: "state visual real"
+ base para el híbrido B (#3) + shape CRM listo para el orquestador (#2).
</success_criteria>

<output>
Crear `.planning/standalone/somnio-v4-turn-ledger/05-SUMMARY.md`.
Commits atómicos en español:
- `feat(v4-ledger): state-tab muestra KB Topics Atendidos + CRM Actions (D-14)`
- `test(v4-ledger): carryState preserva ledger en reprocess Path B (P3) + sin double-increment`
- `docs(v4-ledger): ARCHITECTURE.md documenta Turn Ledger + corrige crm_mutation muerto (D-10)`
Push a Vercel tras confirmar migración (Regla 5 — Plan 02).
</output>

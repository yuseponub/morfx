---
phase: agent-godentist-fb-ig
plan: 04
type: execute
wave: 2
depends_on: [02, 03]
files_modified:
  - src/lib/agents/godentist-fb-ig/lead-capture.ts
  - src/lib/agents/godentist-fb-ig/sales-track.ts
autonomous: true
requirements: [GFB-04, GFB-01]

must_haves:
  truths:
    - "Existe `src/lib/agents/godentist-fb-ig/lead-capture.ts` exportando `resolveLeadCapture(input): LeadCaptureDecision | null` como pure function (sin I/O ni side effects)"
    - "Existe `src/lib/agents/godentist-fb-ig/sales-track.ts` adapted del godentist con (a) agent name swap en eventos getCollector, (b) hook lead-capture insertado entre el early-return de timer_expired y el bloque 'Auto-triggers by data changes' (~lineas 67-80)"
    - "El hook lead-capture llama `resolveLeadCapture({ turnCount: state.turnCount, intent, state, gates })` y si retorna decision != null, emite `pipeline_decision.lead_capture_triggered` event y retorna {accion, timerSignal, reason} bypassing transitions table"
    - "Cuando turnCount===1 + intent==='datos' + gates.datosCriticos===false: helper retorna {accion: 'pedir_datos_parcial', timerSignal: ..., reason: ...}"
    - "Cuando turnCount===0, turnCount>=2, intent !== 'datos', gates.datosCriticos===true && gates.fechaElegida===false, o camposFaltantes vacio: helper retorna null (passthrough a sales-track normal)"
    - "TypeScript compila sin errores: lead-capture.ts importa Gates + AgentState + TipoAccion + TimerSignal de './types' y camposFaltantes de './state'"
    - "Cero imports de createAdminClient o @supabase/supabase-js en estos 2 archivos (Regla 3)"
  artifacts:
    - path: "src/lib/agents/godentist-fb-ig/lead-capture.ts"
      provides: "resolveLeadCapture pure helper + LeadCaptureDecision interface"
      contains: "resolveLeadCapture"
      min_lines: 25
    - path: "src/lib/agents/godentist-fb-ig/sales-track.ts"
      provides: "resolveSalesTrack del sibling con lead-capture hook (D-09)"
      contains: "resolveLeadCapture"
  key_links:
    - from: "src/lib/agents/godentist-fb-ig/sales-track.ts"
      to: "src/lib/agents/godentist-fb-ig/lead-capture.ts"
      via: "import resolveLeadCapture from './lead-capture' + invocacion en hook entre timer_expired return y auto-triggers"
      pattern: "resolveLeadCapture"
    - from: "src/lib/agents/godentist-fb-ig/lead-capture.ts"
      to: "src/lib/agents/godentist-fb-ig/state.ts (camposFaltantes)"
      via: "import { camposFaltantes } from './state' + invocacion para calcular lista de faltantes"
      pattern: "camposFaltantes"
    - from: "src/lib/agents/godentist-fb-ig/sales-track.ts"
      to: "src/lib/agents/godentist-fb-ig/response-track.ts (case 'pedir_datos_parcial')"
      via: "sales-track retorna accion='pedir_datos_parcial' -> response-track ya tiene case que llama camposFaltantes(state) y construye extraContext"
      pattern: "pedir_datos_parcial"
---

<objective>
Wave 2 — Crear el helper `lead-capture.ts` (NUEVO, ~30 LOC, puro testeable) + adaptar `sales-track.ts` del godentist con el hook lead-capture en el lugar correcto. Esta plan completa la pieza UNICA de logica nueva del sibling (D-09).

Purpose: El lead capture turn 1 (D-09) es el unico comportamiento nuevo del sibling vs godentist. Vivir como helper puro separado permite testing aislado (Plan 06 lead-capture.test.ts) y mantiene `transitions.ts` clonado verbatim (Plan 02). El hook en sales-track va exactamente entre el early-return de `timer_expired` y el bloque "Auto-triggers by data changes".

**Pitfall 5 — off-by-one CRITICO:** El helper chequea `turnCount === 1`, NO `=== 0` ni `>= 1`. Razon: `mergeAnalysis` (state.ts:161) incrementa `turnCount` ANTES de que `resolveSalesTrack` corra. El primer mensaje del cliente entra con turnCount=0, sale de mergeAnalysis con turnCount=1.

Output: 2 archivos en `src/lib/agents/godentist-fb-ig/` — el modulo queda completo (junto con Wave 1 Plans 02 + 03).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-godentist-fb-ig/CONTEXT.md
@.planning/standalone/agent-godentist-fb-ig/RESEARCH.md
@.planning/standalone/agent-godentist-fb-ig/02-SUMMARY.md
@.planning/standalone/agent-godentist-fb-ig/03-SUMMARY.md
@CLAUDE.md
@src/lib/agents/godentist/sales-track.ts
@src/lib/agents/godentist-fb-ig/types.ts
@src/lib/agents/godentist-fb-ig/state.ts
@src/lib/agents/godentist-fb-ig/constants.ts

<interfaces>
<!-- Helper signature LOCKED por RESEARCH.md §Lead Capture Parser Design -->
// export interface LeadCaptureDecision { accion: TipoAccion; timerSignal?: TimerSignal; reason: string }
// export function resolveLeadCapture(input: { turnCount, intent, state, gates }): LeadCaptureDecision | null

<!-- Decision rules (D-09) -->
// turnCount !== 1: return null
// intent !== 'datos': return null
// gates.datosCriticos === true: return null (passthrough)
// camposFaltantes(state).length === 0: return null
// else: return { accion: 'pedir_datos_parcial', timerSignal, reason }

<!-- Hook insertion point: entre timer_expired early-return y auto-triggers block (sales-track.ts ~67-80) -->
</interfaces>

<security_relevant>
**Workspace isolation:** lead-capture.ts es pure function (sin I/O). sales-track.ts NO accede a Supabase. Cero leakage cross-workspace.

**Habeas Data:** Lead-capture trigger ocurre cuando cliente envia datos. Consentimiento implicito (D-06): el saludo D-05 incluye disclaimer Habeas Data inline.

**Pitfall 5 (off-by-one):** Si helper chequea `=== 0`, NUNCA dispara. Si chequea `>= 1`, dispara tambien turn 2+. Plan 06 lead-capture.test.ts cubre los casos boundary.
</security_relevant>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Crear lead-capture.ts (NUEVO helper puro testeable)</name>
  <read_first>
    - src/lib/agents/godentist-fb-ig/types.ts (verificar export de TipoAccion, TimerSignal, AgentState, Gates)
    - src/lib/agents/godentist-fb-ig/state.ts (verificar export de camposFaltantes en linea ~217)
    - src/lib/agents/godentist-fb-ig/constants.ts (verificar GD_INTENTS includes 'datos')
    - .planning/standalone/agent-godentist-fb-ig/RESEARCH.md §Lead Capture Parser Design (full section)
    - .planning/standalone/agent-godentist-fb-ig/CONTEXT.md §D-09 (lead capture rules)
    - .planning/standalone/agent-godentist-fb-ig/RESEARCH.md §Common Pitfalls §5 (off-by-one CRITICO turnCount === 1)
  </read_first>
  <behavior>
    - Test 1: turnCount=0, intent='datos', state vacio, gates.datosCriticos=false → returns null (turnCount no === 1)
    - Test 2: turnCount=1, intent='datos', state con nombre+telefono parciales, gates.datosCriticos=false → returns LeadCaptureDecision con accion='pedir_datos_parcial'
    - Test 3: turnCount=1, intent='saludo', state vacio, gates.datosCriticos=false → returns null (intent !== 'datos')
    - Test 4: turnCount=1, intent='datos', gates.datosCriticos=true, gates.fechaElegida=false → returns null (passthrough — sales-track normal va a pedir_fecha)
    - Test 5: turnCount=2, intent='datos', state con datos parciales → returns null (turn 2+ ignored)
    - Test 6: turnCount=1, intent='datos', state con TODOS los campos completos → camposFaltantes() retorna [] → returns null (edge case)
    - Test 7: turnCount=1, intent='datos', state con SOLO nombre → reason menciona "telefono" o "sede"
    - Test 8: turnCount=1, intent='datos', state con SOLO telefono → reason menciona "nombre"
  </behavior>
  <action>
**Paso 1 — Crear `src/lib/agents/godentist-fb-ig/lead-capture.ts` con el contenido literal (basado en RESEARCH.md §Lead Capture Parser Design):**

Copiar el siguiente bloque verbatim al nuevo archivo:

```typescript
// Standalone: agent-godentist-fb-ig (Wave 2 Plan 04, Task 1).
// Pure helper for D-09 lead-capture decision logic.
// No I/O, no side effects, fully testable.

import type { AgentState, Gates, TipoAccion, TimerSignal } from './types'
import { camposFaltantes } from './state'

/**
 * Lead capture decision for first-turn FB/IG conversations.
 *
 * D-09: when the customer's first response (turn 1) contains personal data
 * (intent='datos' classified by Haiku), bypass the normal transition table
 * and route directly to `pedir_datos_parcial` with `{{campos_faltantes}}`
 * computed from the current state.
 *
 * Returns null when lead-capture should NOT trigger (subsequent turns,
 * non-data intents, or when datos criticos already complete).
 *
 * Pure function — no I/O, no side effects, fully testable.
 *
 * IMPORTANT — Pitfall 5 (off-by-one):
 * turnCount comes from state AFTER mergeAnalysis incremented it. The first
 * message from the customer enters with turnCount=0, exits mergeAnalysis with
 * turnCount=1, lands in resolveSalesTrack with turnCount=1.
 * That is why we check `=== 1`, NOT `=== 0` or `>= 1`.
 */
export interface LeadCaptureDecision {
  accion: TipoAccion
  timerSignal?: TimerSignal
  reason: string
}

export function resolveLeadCapture(input: {
  turnCount: number
  intent: string
  state: AgentState
  gates: Gates
}): LeadCaptureDecision | null {
  const { turnCount, intent, state, gates } = input

  // Lead capture solo dispara en turn 1 (primer mensaje del cliente post-saludo).
  if (turnCount !== 1) return null

  // Solo si Haiku clasifica como 'datos' (cliente envio info personal)
  if (intent !== 'datos') return null

  // Si datos criticos completos + fecha falta -> dejar que sales-track normal
  // dispare pedir_fecha (no pedir_datos_parcial con [] vacio).
  if (gates.datosCriticos && !gates.fechaElegida) return null

  // Si datos criticos completos + fecha -> mostrar_disponibilidad (sales-track normal)
  if (gates.datosCriticos && gates.fechaElegida) return null

  // Si datos criticos NO completos -> pedir_datos_parcial con campos faltantes.
  const faltantes = camposFaltantes(state)
  if (faltantes.length === 0) return null  // edge case: nada que pedir

  return {
    accion: 'pedir_datos_parcial' as TipoAccion,
    timerSignal: { type: 'start', level: 'L1', reason: `lead capture turn 1: ${faltantes.length} campos faltantes` },
    reason: `Lead capture FB/IG: cliente envio datos parciales en turn 1, faltan ${faltantes.join(', ')}`,
  }
}
```

**Paso 2 — Validar que TypeScript compila:**

```bash
npx tsc --noEmit 2>&1 | grep "godentist-fb-ig/lead-capture" | head -5
```

Esperado: 0 errores. Si hay error de import, verificar que `types.ts` exporta `Gates`, `TipoAccion`, `TimerSignal` (vienen del godentist clone — Plan 02 verbatim).

**Paso 3 — Commit:**

```bash
git add src/lib/agents/godentist-fb-ig/lead-capture.ts
git commit -m "feat(agent-godentist-fb-ig): add lead-capture.ts pure helper (D-09)"
```

NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/godentist-fb-ig/lead-capture.ts</automated>
    <automated>grep -q "Pure helper for D-09 lead-capture decision logic" src/lib/agents/godentist-fb-ig/lead-capture.ts</automated>
    <automated>grep -q "export function resolveLeadCapture" src/lib/agents/godentist-fb-ig/lead-capture.ts</automated>
    <automated>grep -q "export interface LeadCaptureDecision" src/lib/agents/godentist-fb-ig/lead-capture.ts</automated>
    <automated>grep -q "if (turnCount !== 1) return null" src/lib/agents/godentist-fb-ig/lead-capture.ts</automated>
    <automated>grep -q "if (intent !== 'datos') return null" src/lib/agents/godentist-fb-ig/lead-capture.ts</automated>
    <automated>grep -q "camposFaltantes" src/lib/agents/godentist-fb-ig/lead-capture.ts</automated>
    <automated>grep -q "pedir_datos_parcial" src/lib/agents/godentist-fb-ig/lead-capture.ts</automated>
    <automated>! grep -E "createAdminClient|@supabase/supabase-js" src/lib/agents/godentist-fb-ig/lead-capture.ts</automated>
    <automated>! grep -E "fetch\(|http\." src/lib/agents/godentist-fb-ig/lead-capture.ts</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(agent-godentist-fb-ig): add lead-capture.ts pure helper"</automated>
  </verify>
  <acceptance_criteria>
    - `lead-capture.ts` existe con `export function resolveLeadCapture` y `export interface LeadCaptureDecision`.
    - El cuerpo de `resolveLeadCapture` chequea `turnCount !== 1` PRIMERO (Pitfall 5 protection).
    - Importa `camposFaltantes` de `./state` y `Gates`, `AgentState`, `TipoAccion`, `TimerSignal` de `./types`.
    - Cero I/O: ni `fetch`, ni `http`, ni Supabase imports.
    - Comentario explicativo de Pitfall 5 (off-by-one) presente en JSDoc.
    - Commit atomico exacto. NO push.
  </acceptance_criteria>
  <done>
    - lead-capture.ts pure helper listo para test (Plan 06 lead-capture.test.ts) e integration (Task 2 sales-track hook).
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Adaptar sales-track.ts del godentist + integrar hook lead-capture</name>
  <read_first>
    - src/lib/agents/godentist/sales-track.ts (file completo, ~133 LOC — focus en lineas 51, 67-80, 90, 111)
    - src/lib/agents/godentist-fb-ig/lead-capture.ts (creado en Task 1)
    - .planning/standalone/agent-godentist-fb-ig/RESEARCH.md §Lead Capture Parser Design §Sales-track hook + §File Inventory row 9
    - .planning/standalone/agent-godentist-fb-ig/CONTEXT.md §D-09
  </read_first>
  <action>
**Paso 1 — Clonar `sales-track.ts` desde godentist:**

```bash
cp src/lib/agents/godentist/sales-track.ts src/lib/agents/godentist-fb-ig/sales-track.ts
```

Agregar header (lineas 1-4):
```typescript
// Adapted from src/lib/agents/godentist/sales-track.ts (Standalone: agent-godentist-fb-ig, Wave 2 Plan 04 Task 2).
// Changes: (a) agent name swap in 3 getCollector events. (b) lead-capture hook (D-09)
// inserted between timer_expired early-return and "Auto-triggers by data changes" block.
// Hook calls resolveLeadCapture and short-circuits to pedir_datos_parcial when triggered.
```

**Paso 2 — Cambios textuales deterministicos:**

(a) **Cambiar TODAS las ocurrencias de `agent: 'godentist'` -> `agent: 'godentist-fb-ig'`** (esperado 3 matches en eventos getCollector — lineas aproximadas 51, 90, 111 del godentist source).

(b) **Agregar import del helper en la cabecera** (despues del header, antes de los imports existentes):

```typescript
import { resolveLeadCapture } from './lead-capture'
```

Si `camposFaltantes` no esta importado en sales-track.ts (depende del godentist source — verificar con grep), agregarlo:

```typescript
import { camposFaltantes } from './state'
```

(c) **Insertar el bloque hook** entre el early-return de `timer_expired` (~linea 67-68 del godentist source) y el bloque "Auto-triggers by data changes" (~linea 80).

Localizar el patron en sales-track.ts (buscar el comentario "timer_expired" o "Auto-triggers"). Insertar JUSTO ENTRE estos dos bloques el siguiente codigo:

```typescript
// ------------------------------------------------------------------
// 1.5 LEAD CAPTURE turn 1 (D-09 godentist-fb-ig sibling)
// Antes de auto-triggers y tabla de transitions, verificar si este
// es el primer turno post-saludo con datos parciales del cliente.
// Solo dispara cuando turnCount === 1 + intent === 'datos' + datos
// criticos NO completos. Otros casos pasan al sales-track normal.
// ------------------------------------------------------------------
const leadCaptureDecision = resolveLeadCapture({
  turnCount: state.turnCount,
  intent,
  state,
  gates,
})
if (leadCaptureDecision) {
  getCollector()?.recordEvent('pipeline_decision', 'lead_capture_triggered', {
    agent: 'godentist-fb-ig',
    intent,
    accion: leadCaptureDecision.accion,
    reason: leadCaptureDecision.reason,
    camposFaltantes: camposFaltantes(state),
  })
  return {
    accion: leadCaptureDecision.accion,
    timerSignal: leadCaptureDecision.timerSignal,
    reason: leadCaptureDecision.reason,
  }
}
```

**Verificar imports despues:**

```bash
grep -n "camposFaltantes\|resolveLeadCapture" src/lib/agents/godentist-fb-ig/sales-track.ts
# Esperado: minimo 3 matches: 1 import resolveLeadCapture + 1 invocacion + 1 uso de camposFaltantes en evento
```

**Paso 3 — Validar que TypeScript compila el sibling completo:**

```bash
npx tsc --noEmit 2>&1 | grep "godentist-fb-ig/" | head -10
```

Esperado: 0 errores en TODO el directorio sibling. Si aparecen errores, debug:
- Imports cruzados a `./somnio-pw-confirmation` (mal copia) -> buscar y reparar.
- `Cannot find module './lead-capture'` -> verificar Task 1.
- Type mismatch en `LeadCaptureDecision.accion` -> verificar que `TipoAccion` incluye `'pedir_datos_parcial'`.

**Paso 4 — Verificar el hook esta en el lugar correcto:**

```bash
grep -n "lead_capture_triggered\|Auto-triggers\|timer_expired" src/lib/agents/godentist-fb-ig/sales-track.ts
```

Esperado: la linea de `lead_capture_triggered` aparece DESPUES de la linea de `timer_expired` y ANTES de la linea de `Auto-triggers` o equivalente.

**Paso 5 — Commit:**

```bash
git add src/lib/agents/godentist-fb-ig/sales-track.ts
git commit -m "feat(agent-godentist-fb-ig): adapt sales-track.ts + integrate lead-capture hook (D-09)"
```

NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/godentist-fb-ig/sales-track.ts</automated>
    <automated>grep -q "Adapted from src/lib/agents/godentist/sales-track.ts" src/lib/agents/godentist-fb-ig/sales-track.ts</automated>
    <automated>grep -q "import { resolveLeadCapture } from './lead-capture'" src/lib/agents/godentist-fb-ig/sales-track.ts</automated>
    <automated>grep -c "resolveLeadCapture" src/lib/agents/godentist-fb-ig/sales-track.ts | awk '$1 >= 2 { exit 0 } { exit 1 }'</automated>
    <automated>grep -q "lead_capture_triggered" src/lib/agents/godentist-fb-ig/sales-track.ts</automated>
    <automated>grep -c "agent: 'godentist-fb-ig'" src/lib/agents/godentist-fb-ig/sales-track.ts | awk '$1 >= 3 { exit 0 } { exit 1 }'</automated>
    <automated>! grep -E "agent: 'godentist'(\s|,|})" src/lib/agents/godentist-fb-ig/sales-track.ts</automated>
    <automated>! grep -E "createAdminClient|@supabase/supabase-js" src/lib/agents/godentist-fb-ig/sales-track.ts</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(agent-godentist-fb-ig): adapt sales-track.ts + integrate lead-capture hook"</automated>
  </verify>
  <acceptance_criteria>
    - `sales-track.ts` existe con cabecera "Adapted from src/lib/agents/godentist/sales-track.ts".
    - Import `resolveLeadCapture` desde `./lead-capture` presente.
    - Bloque hook lead-capture invoca `resolveLeadCapture(...)` y emite event `pipeline_decision.lead_capture_triggered` con agent: 'godentist-fb-ig'.
    - Hook posicionado ANTES de "Auto-triggers" y DESPUES de "timer_expired" early-return.
    - 3 ocurrencias de `agent: 'godentist-fb-ig'` minimo (eventos getCollector renombrados).
    - 0 ocurrencias de `agent: 'godentist'` (sin sufijo).
    - Cero `createAdminClient` (Regla 3).
    - Commit atomico exacto. NO push.
  </acceptance_criteria>
  <done>
    - sales-track.ts adapted con hook lead-capture wired.
    - El modulo `src/lib/agents/godentist-fb-ig/` queda completo (Plans 02+03+04).
    - Plan 05 (registration sites) puede agregar `import '@/lib/agents/godentist-fb-ig'` en webhook-processor.ts y page.tsx.
    - Plan 06 (tests) puede mockear el modulo entero y testear el flujo end-to-end.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Sibling code → state.ts (in-memory) | Pure helpers, zero I/O |
| Sibling code → Observability collector | Eventos `lead_capture_triggered` separados de godentist |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gfb-04-01 | Tampering | Off-by-one en turnCount check | mitigate | Comentario explicito de Pitfall 5 en JSDoc + Plan 06 boundary tests obligatorios |
| T-gfb-04-02 | Information Disclosure | Evento `lead_capture_triggered` payload incluye camposFaltantes | accept | Lista de field NAMES (nombre, telefono, sede), NO values; sin PII |
| T-gfb-04-03 | Denial of Service | Hook lead-capture corre en cada turn (incluso turn 2+) | mitigate | Early return en `turnCount !== 1` evita CPU innecesario; benchmark Plan 06 valida |
</threat_model>

<verification>
- 2 archivos en src/lib/agents/godentist-fb-ig/: lead-capture.ts (nuevo) + sales-track.ts (adapted con hook).
- TypeScript compila el modulo completo sin errores: `npx tsc --noEmit 2>&1 | grep "godentist-fb-ig" | wc -l` retorna 0.
- Cero `createAdminClient` en TODO el directorio sibling: `grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/godentist-fb-ig/` retorna 0 matches.
- Cero `GODENTIST_AGENT_ID` (sin sufijo) en sibling: `grep -rn "GODENTIST_AGENT_ID\b" src/lib/agents/godentist-fb-ig/` retorna 0 matches (anti-regresion D-08).
- 2 commits atomicos en git local. NO push.
</verification>

<success_criteria>
- Plan 05 (registration sites) puede importar `import '@/lib/agents/godentist-fb-ig'` en webhook-processor + page.tsx + v3-production-runner — el side-effect dispara `agentRegistry.register(godentistFbIgConfig)` correctamente.
- Plan 06 (tests) puede mockear `comprehend()` retornando intent='datos' + slots, mockear TemplateManager retornando template `pedir_datos_parcial`, y validar que el bot output incluye `{{campos_faltantes}}` interpolado correctamente.
- El sibling es funcional end-to-end: comprende mensaje cliente → state machine → sales-track con hook → response-track con `pedir_datos_parcial` → template lookup en `agent_templates` (despues de Plan 07 migration apply).
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-godentist-fb-ig/04-SUMMARY.md` documenting:
- Commit hashes de Task 1 (lead-capture.ts) y Task 2 (sales-track.ts).
- LOC count del lead-capture.ts (~50 LOC esperado).
- Confirmacion del hook posicionado correctamente (linea aproximada del hook insertado).
- Status del modulo: Plans 02+03+04 completos. El sibling es funcional offline. Falta registracion (Plan 05), tests (Plan 06), templates (Plan 07).
- Confirmacion final: `npx tsc --noEmit | grep "godentist-fb-ig" | wc -l` = 0.
</output>

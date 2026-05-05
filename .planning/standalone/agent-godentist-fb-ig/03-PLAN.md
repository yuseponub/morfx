---
phase: agent-godentist-fb-ig
plan: 03
type: execute
wave: 1
depends_on: [01]
files_modified:
  - src/lib/agents/godentist-fb-ig/config.ts
  - src/lib/agents/godentist-fb-ig/comprehension-prompt.ts
  - src/lib/agents/godentist-fb-ig/comprehension.ts
  - src/lib/agents/godentist-fb-ig/response-track.ts
  - src/lib/agents/godentist-fb-ig/godentist-fb-ig-agent.ts
  - src/lib/agents/godentist-fb-ig/index.ts
autonomous: true
requirements: [GFB-01]

must_haves:
  truths:
    - "Existen 6 archivos adapted en src/lib/agents/godentist-fb-ig/ con cambios deterministicos vs el godentist source: config.ts, comprehension-prompt.ts, comprehension.ts, response-track.ts, godentist-fb-ig-agent.ts, index.ts"
    - "config.ts exporta GODENTIST_FB_IG_AGENT_ID = 'godentist-fb-ig' as const + godentistFbIgConfig (AgentConfig) con name 'GoDentist Valoraciones — FB/IG (Lead Capture)' y descripcion del sibling"
    - "response-track.ts importa GODENTIST_FB_IG_AGENT_ID (NO GODENTIST_AGENT_ID) y lo pasa a templateManager.getTemplatesForIntents en TODOS los call sites (anti-regresion D-08, Pitfall 1)"
    - "comprehension.ts emite eventos con agent: 'godentist-fb-ig' (NO 'godentist') y usa runWithPurpose('godentist_fb_ig_comprehension', ...)"
    - "godentist-fb-ig-agent.ts emite TODOS los eventos getCollector()?.recordEvent con agent: 'godentist-fb-ig' (NO 'godentist') — minimo 9 ocurrencias renombradas"
    - "comprehension-prompt.ts agrega 1-2 ejemplos de lead-capture al system prompt (D-11) sin modificar lista de intents ni schema"
    - "index.ts auto-registra el config via agentRegistry.register(godentistFbIgConfig) y re-exporta processMessage + GODENTIST_FB_IG_AGENT_ID"
    - "Cero referencias a 'GODENTIST_AGENT_ID' en src/lib/agents/godentist-fb-ig/ (anti-regresion grep, Pitfall 1)"
    - "Cero imports de createAdminClient o @supabase/supabase-js (Regla 3) — validable via grep recursivo"
    - "TypeScript compila estos 6 archivos sin errores nuevos cuando combinados con Plan 02 (skeleton). Plan 04 (lead-capture wiring en sales-track) completa el modulo"
  artifacts:
    - path: "src/lib/agents/godentist-fb-ig/config.ts"
      provides: "GODENTIST_FB_IG_AGENT_ID literal + godentistFbIgConfig (AgentConfig)"
      contains: "GODENTIST_FB_IG_AGENT_ID = 'godentist-fb-ig' as const"
    - path: "src/lib/agents/godentist-fb-ig/comprehension-prompt.ts"
      provides: "buildSystemPrompt + lead-capture examples"
      contains: "lead capture"
    - path: "src/lib/agents/godentist-fb-ig/comprehension.ts"
      provides: "comprehend function — Haiku call con observability event 'agent: godentist-fb-ig'"
      contains: "godentist-fb-ig"
    - path: "src/lib/agents/godentist-fb-ig/response-track.ts"
      provides: "resolveResponseTrack — usa GODENTIST_FB_IG_AGENT_ID para template lookup (anti-regresion D-08)"
      contains: "GODENTIST_FB_IG_AGENT_ID"
    - path: "src/lib/agents/godentist-fb-ig/godentist-fb-ig-agent.ts"
      provides: "processMessage entry point del sibling"
      contains: "godentist-fb-ig"
    - path: "src/lib/agents/godentist-fb-ig/index.ts"
      provides: "Self-register + re-export public API"
      contains: "agentRegistry.register"
  key_links:
    - from: "src/lib/agents/godentist-fb-ig/index.ts"
      to: "src/lib/agents/registry.ts (agentRegistry)"
      via: "side-effect import — auto-register el config en module load"
      pattern: "agentRegistry.register"
    - from: "src/lib/agents/godentist-fb-ig/response-track.ts"
      to: "src/lib/agents/somnio/template-manager.ts (TemplateManager)"
      via: "templateManager.getTemplatesForIntents(GODENTIST_FB_IG_AGENT_ID, ...)"
      pattern: "GODENTIST_FB_IG_AGENT_ID"
    - from: "src/lib/agents/godentist-fb-ig/comprehension.ts"
      to: "Anthropic Haiku via runWithPurpose('godentist_fb_ig_comprehension', ...)"
      via: "instrumented anthropic client"
      pattern: "godentist_fb_ig_comprehension"
---

<objective>
Wave 1 (parallel with Plan 02) — Adaptar los 6 archivos del godentist que requieren cambios para el sibling: agent ID, observability event names, comprehension prompt examples, template lookup constant, self-register module entry.

Purpose: El godentist tiene logica idiomatica que necesita renombrarse al sibling: el `GODENTIST_AGENT_ID` constant, los eventos de observability con `agent: 'godentist'`, el log prefix `[GoDentist]`, y la entry de `processMessage` exportada. Adicionalmente el comprehension prompt necesita 2 ejemplos de lead-capture (D-11) para reforzar la clasificacion del primer turno post-saludo como `intent='datos'`.

**Anti-regresion CRITICA (D-08, Pitfall 1):** El sibling DEBE usar `GODENTIST_FB_IG_AGENT_ID` (NO `GODENTIST_AGENT_ID`) en TODOS los call sites de `templateManager.getTemplatesForIntents` en response-track.ts. Si copia rapida deja `GODENTIST_AGENT_ID`, el sibling lee templates del catalogo del godentist (regresion `cdc06d9` revertida en somnio-recompra).

Output: 6 archivos adapted en `src/lib/agents/godentist-fb-ig/` listos para que Plan 04 wire el lead-capture helper en sales-track.ts.

**No-deps con Plan 02:** Cero overlap de files_modified. Plan 02 hace skeleton verbatim, Plan 03 hace adapted files. Ambos parten de Wave 0 SUMMARY GO.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-godentist-fb-ig/CONTEXT.md
@.planning/standalone/agent-godentist-fb-ig/RESEARCH.md
@.planning/standalone/agent-godentist-fb-ig/01-SUMMARY.md
@CLAUDE.md
@src/lib/agents/godentist/config.ts
@src/lib/agents/godentist/comprehension-prompt.ts
@src/lib/agents/godentist/comprehension.ts
@src/lib/agents/godentist/response-track.ts
@src/lib/agents/godentist/godentist-agent.ts
@src/lib/agents/godentist/index.ts
@src/lib/agents/somnio-pw-confirmation/index.ts
@src/lib/agents/somnio-pw-confirmation/config.ts

<interfaces>
<!-- Sibling agent identity LOCKED por D-03 -->
GODENTIST_FB_IG_AGENT_ID = 'godentist-fb-ig' as const

<!-- Observability event names — replace 'godentist' with 'godentist-fb-ig' -->
COMPREHENSION_PURPOSE = 'godentist_fb_ig_comprehension'  // godentist usa 'godentist_comprehension'

<!-- Template lookup constant — anti-regresion D-08 -->
TEMPLATE_LOOKUP = GODENTIST_FB_IG_AGENT_ID  // godentist usa GODENTIST_AGENT_ID

<!-- Log prefix -->
LOG_PREFIX = '[GoDentist FB/IG]'  // godentist usa '[GoDentist]'

<!-- Saludo D-05 (locked verbatim, NO se usa en code — vive en migration SQL Plan 07) -->
// El saludo no aparece en codigo — solo en agent_templates DB row (Plan 07).
</interfaces>

<security_relevant>
**Workspace isolation:** comprehension.ts y response-track.ts NO acceden a Supabase directo. response-track.ts usa TemplateManager (que ya filtra por workspace_id). comprehension.ts hace POST a Anthropic API (sin PII en payload mas alla del mensaje del cliente).

**Habeas Data:** El comprehension prompt include un ejemplo "María López, 3001234567" — datos sinteticos no reales. Aceptable.

**Pitfall 1 (CRITICA):** Si response-track.ts deja `GODENTIST_AGENT_ID`, el sibling LEE templates del godentist y el saludo D-05 nunca se renderiza. Cliente FB/IG ve saludo conversacional viejo en vez de lead-capture. Tests obligatorios en Plan 06 cubren este caso.
</security_relevant>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Adaptar config.ts + index.ts (sibling identity + self-register)</name>
  <read_first>
    - src/lib/agents/godentist/config.ts (file completo, ~75 LOC — copiar estructura)
    - src/lib/agents/godentist/index.ts (file completo, ~18 LOC)
    - src/lib/agents/somnio-pw-confirmation/config.ts (~24 LOC — referencia pattern para sibling-config)
    - src/lib/agents/somnio-pw-confirmation/index.ts (~29 LOC — referencia pattern self-register)
    - .planning/standalone/agent-godentist-fb-ig/RESEARCH.md §Pattern 1 + §Pattern 2 + §File Inventory rows 1, 16
    - .planning/standalone/agent-godentist-fb-ig/CONTEXT.md §D-03 (agent ID + dir) + §D-13 (state machine sin cambios)
  </read_first>
  <action>
**Paso 1 — Crear `src/lib/agents/godentist-fb-ig/config.ts`** clonando la estructura de `godentist/config.ts` con los siguientes cambios deterministicos:

Cambios textuales obligatorios:
- `GODENTIST_AGENT_ID = 'godentist'` → `GODENTIST_FB_IG_AGENT_ID = 'godentist-fb-ig' as const`
- `godentistConfig` → `godentistFbIgConfig`
- `id: GODENTIST_AGENT_ID` → `id: GODENTIST_FB_IG_AGENT_ID`
- `name: 'GoDentist Valoraciones'` → `name: 'GoDentist Valoraciones — FB/IG (Lead Capture)'`
- `description` reemplazar por: `'Sibling de GoDentist para conversaciones FB Messenger / Instagram Direct. Saludo lead-capture (pide nombre+celular upfront + Habeas Data inline). Resto del pipeline idéntico a godentist (4 sedes + 23 servicios + Dentos availability).'`

**Resto del archivo verbatim del godentist/config.ts:** intentDetector, orchestrator, tools, states, initialState, validTransitions, confidenceThresholds, tokenBudget — TODOS estos campos clonados verbatim (D-13: state machine sin cambios; D-12: modelo Haiku igual).

**Header del archivo (lineas 1-3):**
```typescript
// Adapted from src/lib/agents/godentist/config.ts (Standalone: agent-godentist-fb-ig, Wave 1 Plan 03).
// Changes: GODENTIST_AGENT_ID -> GODENTIST_FB_IG_AGENT_ID, name + description for sibling.
// All other fields clonados verbatim (D-12 Haiku, D-13 state machine sin cambios).
```

**Paso 2 — Crear `src/lib/agents/godentist-fb-ig/index.ts`** clonando la estructura de `somnio-pw-confirmation/index.ts:18-29`:

```typescript
/**
 * GoDentist FB/IG Sibling Agent — Module Entry Point
 *
 * Self-registers in the agent registry on import (side-effect).
 *
 * Imported by:
 * - src/app/(dashboard)/agentes/routing/editor/page.tsx (dropdown population — Wave 3 Plan 05)
 * - src/lib/agents/production/webhook-processor.ts (pre-warm cold lambdas — Wave 3 Plan 05)
 * - src/lib/agents/engine/v3-production-runner.ts (dynamic import — Wave 3 Plan 05)
 *
 * Separate agent from godentist — both can coexist (D-04).
 */

import { agentRegistry } from '../registry'
import { godentistFbIgConfig, GODENTIST_FB_IG_AGENT_ID } from './config'

// Self-register on module import
agentRegistry.register(godentistFbIgConfig)

// Re-export public API
export { GODENTIST_FB_IG_AGENT_ID } from './config'
export { processMessage } from './godentist-fb-ig-agent'
export type { V3AgentInput, V3AgentOutput, TipoAccion } from './types'
```

Hacer commit atomico:
```bash
git add src/lib/agents/godentist-fb-ig/config.ts src/lib/agents/godentist-fb-ig/index.ts
git commit -m "feat(agent-godentist-fb-ig): add config.ts + index.ts (sibling identity + self-register)"
```

NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/godentist-fb-ig/config.ts</automated>
    <automated>test -f src/lib/agents/godentist-fb-ig/index.ts</automated>
    <automated>grep -c "GODENTIST_FB_IG_AGENT_ID = 'godentist-fb-ig' as const" src/lib/agents/godentist-fb-ig/config.ts | awk '$1 == 1 { exit 0 } { exit 1 }'</automated>
    <automated>grep -c "godentistFbIgConfig" src/lib/agents/godentist-fb-ig/config.ts | awk '$1 >= 2 { exit 0 } { exit 1 }'</automated>
    <automated>grep -q "GoDentist Valoraciones — FB/IG" src/lib/agents/godentist-fb-ig/config.ts</automated>
    <automated>grep -q "Habeas Data" src/lib/agents/godentist-fb-ig/config.ts</automated>
    <automated>grep -c "agentRegistry.register" src/lib/agents/godentist-fb-ig/index.ts | awk '$1 == 1 { exit 0 } { exit 1 }'</automated>
    <automated>grep -q "export { GODENTIST_FB_IG_AGENT_ID }" src/lib/agents/godentist-fb-ig/index.ts</automated>
    <automated>grep -q "export { processMessage } from './godentist-fb-ig-agent'" src/lib/agents/godentist-fb-ig/index.ts</automated>
    <automated>! grep -E "GODENTIST_AGENT_ID\b" src/lib/agents/godentist-fb-ig/config.ts</automated>
    <automated>! grep -E "GODENTIST_AGENT_ID\b" src/lib/agents/godentist-fb-ig/index.ts</automated>
    <automated>! grep -E "createAdminClient|@supabase/supabase-js" src/lib/agents/godentist-fb-ig/config.ts src/lib/agents/godentist-fb-ig/index.ts</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(agent-godentist-fb-ig): add config.ts + index.ts"</automated>
  </verify>
  <acceptance_criteria>
    - `config.ts` exporta `GODENTIST_FB_IG_AGENT_ID = 'godentist-fb-ig' as const` (literal exacto, 1 match grep).
    - `config.ts` exporta `godentistFbIgConfig` con `id: GODENTIST_FB_IG_AGENT_ID`, name con sufijo "FB/IG (Lead Capture)", descripcion con "Habeas Data inline".
    - `config.ts` reusa `validTransitions`, `confidenceThresholds`, `tokenBudget`, `tools`, `states` del godentist verbatim (D-13).
    - Cero `GODENTIST_AGENT_ID` (sin sufijo FB_IG) en config.ts e index.ts.
    - `index.ts` invoca `agentRegistry.register(godentistFbIgConfig)` y re-exporta `processMessage`, `GODENTIST_FB_IG_AGENT_ID`, types.
    - Cero `createAdminClient` (Regla 3).
    - Commit atomico exacto. NO push.
  </acceptance_criteria>
  <done>
    - config.ts + index.ts adapted listos. Sibling identidad locked.
    - Plan 04 (lead-capture) puede importar GODENTIST_FB_IG_AGENT_ID y godentistFbIgConfig.
    - Plan 05 (registration sites) puede agregar `import '@/lib/agents/godentist-fb-ig'` para auto-register en cold lambdas.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Adaptar comprehension-prompt.ts + comprehension.ts (lead-capture examples + observability event renames)</name>
  <read_first>
    - src/lib/agents/godentist/comprehension-prompt.ts (file completo, ~152 LOC)
    - src/lib/agents/godentist/comprehension.ts (file completo, ~145 LOC — leer lineas 60-100 para localizar runWithPurpose y getCollector calls)
    - .planning/standalone/agent-godentist-fb-ig/RESEARCH.md §File Inventory rows 4 y 6 + §Pattern 3 + §Don't Hand-Roll
    - .planning/standalone/agent-godentist-fb-ig/CONTEXT.md §D-09 (lead capture) + §D-11 (prompt 1-2 ejemplos extra) + §D-12 (Haiku igual)
  </read_first>
  <action>
**Paso 1 — Clonar `comprehension-prompt.ts` desde godentist y adaptar (D-11):**

```bash
cp src/lib/agents/godentist/comprehension-prompt.ts src/lib/agents/godentist-fb-ig/comprehension-prompt.ts
```

Agregar header (lineas 1-3):
```typescript
// Adapted from src/lib/agents/godentist/comprehension-prompt.ts (Standalone: agent-godentist-fb-ig, Wave 1 Plan 03).
// Change: 1-2 lead-capture examples appended to system prompt (D-11).
// NO modifications to GD_INTENTS list, schema, or other prompt structure.
```

**Modificacion D-11:** Localizar la seccion del prompt donde estan los ejemplos de clasificacion (suele ser un bloque con texto tipo "EJEMPLOS:" o "Ejemplos de clasificacion:" o estar al final del system prompt antes del `dataSection`). Insertar 2 ejemplos nuevos al final de esa seccion (antes del cierre del template literal):

```
EJEMPLO LEAD CAPTURE (turno 1 post-saludo FB/IG):
Mensaje cliente: "María López, 3001234567"
Clasificacion:
  primary = datos
  secondary = ninguno
  confidence = 95
  slots.extracted_fields.nombre = "María López"
  slots.extracted_fields.telefono = "573001234567"
  slots.extracted_fields.sede_preferida = null
  reasoning = "Cliente envió nombre completo + celular como respuesta directa al saludo lead-capture"

EJEMPLO LEAD CAPTURE (turno 1 con datos completos):
Mensaje cliente: "Soy Juan Pérez, 3019876543, prefiero sede Cabecera"
Clasificacion:
  primary = datos
  secondary = ninguno
  confidence = 95
  slots.extracted_fields.nombre = "Juan Pérez"
  slots.extracted_fields.telefono = "573019876543"
  slots.extracted_fields.sede_preferida = "cabecera"
  reasoning = "Cliente envió nombre + celular + sede en un solo mensaje (datos críticos completos)"
```

NO modificar la lista de intents (`GD_INTENTS` ya tiene `datos`). NO modificar el schema (D-11 explicito).

**Paso 2 — Clonar `comprehension.ts` desde godentist y adaptar:**

```bash
cp src/lib/agents/godentist/comprehension.ts src/lib/agents/godentist-fb-ig/comprehension.ts
```

Agregar header (lineas 1-3):
```typescript
// Adapted from src/lib/agents/godentist/comprehension.ts (Standalone: agent-godentist-fb-ig, Wave 1 Plan 03).
// Changes: agent name swap in observability events (godentist -> godentist-fb-ig).
// NO change to model (Haiku per D-12) or schema parsing logic.
```

**Cambios textuales deterministicos en `comprehension.ts`:**

(a) `runWithPurpose('godentist_comprehension', ...)` → `runWithPurpose('godentist_fb_ig_comprehension', ...)` (1 match esperado, alrededor de linea 68 del godentist).

(b) `getCollector()?.recordEvent('comprehension', 'result', { agent: 'godentist', ... })` → `getCollector()?.recordEvent('comprehension', 'result', { agent: 'godentist-fb-ig', ... })` (1 match esperado, alrededor de linea 93 del godentist).

(c) Cualquier otro string literal `'godentist'` que aparezca como agent identifier en logs o eventos → `'godentist-fb-ig'`. Ejecutar:
```bash
grep -n "'godentist'" src/lib/agents/godentist-fb-ig/comprehension.ts
```
Cambiar TODAS las ocurrencias de `'godentist'` (sin sufijo) a `'godentist-fb-ig'` cuando se refieran al agent name. NO cambiar imports relativos (`./constants`, `./types`, etc.).

**Paso 3 — Validar TypeScript:**
```bash
npx tsc --noEmit 2>&1 | grep "godentist-fb-ig/comprehension" | head -10
```
Esperado: 0 errores en estos archivos. Si aparecen errores de import (`./somnio-pw-confirmation-agent` o similar), revisar — NO debe haber referencias cruzadas accidentales.

**Paso 4 — Commit:**
```bash
git add src/lib/agents/godentist-fb-ig/comprehension-prompt.ts src/lib/agents/godentist-fb-ig/comprehension.ts
git commit -m "feat(agent-godentist-fb-ig): adapt comprehension-prompt.ts (D-11 lead-capture examples) + comprehension.ts (event rename)"
```

NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/godentist-fb-ig/comprehension-prompt.ts</automated>
    <automated>test -f src/lib/agents/godentist-fb-ig/comprehension.ts</automated>
    <automated>grep -q "Adapted from src/lib/agents/godentist/comprehension-prompt.ts" src/lib/agents/godentist-fb-ig/comprehension-prompt.ts</automated>
    <automated>grep -q "Adapted from src/lib/agents/godentist/comprehension.ts" src/lib/agents/godentist-fb-ig/comprehension.ts</automated>
    <automated>grep -qi "lead capture" src/lib/agents/godentist-fb-ig/comprehension-prompt.ts</automated>
    <automated>grep -q "María López" src/lib/agents/godentist-fb-ig/comprehension-prompt.ts</automated>
    <automated>grep -q "Juan Pérez" src/lib/agents/godentist-fb-ig/comprehension-prompt.ts</automated>
    <automated>grep -q "godentist_fb_ig_comprehension" src/lib/agents/godentist-fb-ig/comprehension.ts</automated>
    <automated>grep -q "agent: 'godentist-fb-ig'" src/lib/agents/godentist-fb-ig/comprehension.ts</automated>
    <automated>! grep -E "agent: 'godentist'[^-]" src/lib/agents/godentist-fb-ig/comprehension.ts</automated>
    <automated>! grep -E "runWithPurpose\('godentist_comprehension'" src/lib/agents/godentist-fb-ig/comprehension.ts</automated>
    <automated>! grep -E "createAdminClient|@supabase/supabase-js" src/lib/agents/godentist-fb-ig/comprehension-prompt.ts src/lib/agents/godentist-fb-ig/comprehension.ts</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(agent-godentist-fb-ig): adapt comprehension-prompt.ts"</automated>
  </verify>
  <acceptance_criteria>
    - `comprehension-prompt.ts` agrega 2 ejemplos lead-capture mencionando "María López" + "Juan Pérez" + "lead capture" (case-insensitive).
    - `comprehension-prompt.ts` NO modifica la lista de intents ni el schema (verificable: las constantes de intents siguen siendo importadas de `./constants`).
    - `comprehension.ts` contiene `'godentist_fb_ig_comprehension'` (purpose tag) y `agent: 'godentist-fb-ig'` (event payload).
    - `comprehension.ts` NO contiene `agent: 'godentist'` (sin sufijo) ni `'godentist_comprehension'` (sin sufijo).
    - Cero `createAdminClient` en estos 2 archivos.
    - Commit atomico exacto. NO push.
  </acceptance_criteria>
  <done>
    - comprehension-prompt.ts + comprehension.ts adapted listos.
    - Plan 04 + Plan 06 (tests) pueden importar `comprehend` del sibling.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Adaptar response-track.ts + godentist-fb-ig-agent.ts (anti-regresion D-08 + agent name swaps)</name>
  <read_first>
    - src/lib/agents/godentist/response-track.ts (file completo, ~628 LOC — focus en lineas 25, 200-205, 280, 334-341, 505-510)
    - src/lib/agents/godentist/godentist-agent.ts (file completo, ~533 LOC — focus en getCollector calls + log prefix linea 501)
    - .planning/standalone/agent-godentist-fb-ig/RESEARCH.md §Pattern 3 + §Common Pitfalls §1 (cdc06d9 regresion CRITICA) + §File Inventory rows 10 y 14 + §Code Examples §5 + §6
    - .planning/standalone/agent-godentist-fb-ig/CONTEXT.md §D-08 (catalog independiente) + §D-09 (lead capture)
  </read_first>
  <action>
**Paso 1 — Clonar `response-track.ts` desde godentist:**

```bash
cp src/lib/agents/godentist/response-track.ts src/lib/agents/godentist-fb-ig/response-track.ts
```

Agregar header (lineas 1-4):
```typescript
// Adapted from src/lib/agents/godentist/response-track.ts (Standalone: agent-godentist-fb-ig, Wave 1 Plan 03).
// CRITICAL anti-regression D-08 (Pitfall 1, regression cdc06d9): TEMPLATE_LOOKUP_AGENT_ID
// MUST be GODENTIST_FB_IG_AGENT_ID, NOT GODENTIST_AGENT_ID. Otherwise sibling reads
// templates from godentist catalog and saludo D-05 never renders.
```

**Cambios textuales deterministicos:**

(a) **Linea ~25 (import del config):**
```diff
- import { GODENTIST_AGENT_ID } from './config'
+ import { GODENTIST_FB_IG_AGENT_ID } from './config'
```

(b) **Lineas ~201 y ~507 (templateManager.getTemplatesForIntents calls):**
```diff
- const selectionMap = await templateManager.getTemplatesForIntents(
-   GODENTIST_AGENT_ID,
+ const selectionMap = await templateManager.getTemplatesForIntents(
+   GODENTIST_FB_IG_AGENT_ID,
    allIntents,
    intentsVistos,
    state.templatesMostrados,
  )
```

(c) **Eventos `getCollector()?.recordEvent`** (alrededor de lineas 182, 277): cambiar `agent: 'godentist'` → `agent: 'godentist-fb-ig'`.

**Verificar despues de los cambios:**
```bash
# Sanity check (anti-regresion D-08, Pitfall 1)
grep -c "GODENTIST_AGENT_ID\b" src/lib/agents/godentist-fb-ig/response-track.ts  # esperado: 0
grep -c "GODENTIST_FB_IG_AGENT_ID" src/lib/agents/godentist-fb-ig/response-track.ts  # esperado: >=3 (1 import + 2 calls)
grep -c "agent: 'godentist-fb-ig'" src/lib/agents/godentist-fb-ig/response-track.ts  # esperado: >=2
grep -c "agent: 'godentist'" src/lib/agents/godentist-fb-ig/response-track.ts | awk '$1 == 0 { exit 0 } { exit 1 }'  # esperado: 0 ocurrencias del godentist puro
```

**Paso 2 — Clonar `godentist-agent.ts` como `godentist-fb-ig-agent.ts`:**

```bash
cp src/lib/agents/godentist/godentist-agent.ts src/lib/agents/godentist-fb-ig/godentist-fb-ig-agent.ts
```

Agregar header (lineas 1-4):
```typescript
// Adapted from src/lib/agents/godentist/godentist-agent.ts (Standalone: agent-godentist-fb-ig, Wave 1 Plan 03).
// Changes: agent name swap in ALL getCollector()?.recordEvent calls (godentist -> godentist-fb-ig).
// log prefix '[GoDentist]' -> '[GoDentist FB/IG]'.
// processMessage entry point — re-exported from index.ts.
```

**Cambios textuales deterministicos:**

(a) Cambiar TODAS las ocurrencias de `agent: 'godentist'` → `agent: 'godentist-fb-ig'` (esperado minimo 9 ocurrencias en eventos getCollector — lineas aproximadas 75, 197, 240, 247, 303, 320, 347, 372, 403 del godentist source).

(b) Cambiar `console.error('[GoDentist] Error processing message:'` → `console.error('[GoDentist FB/IG] Error processing message:'` (linea ~501 del godentist source).

(c) Cambiar cualquier otro `[GoDentist]` (sin sufijo) en logs/console a `[GoDentist FB/IG]`. Ejecutar:
```bash
grep -n "'\[GoDentist\]" src/lib/agents/godentist-fb-ig/godentist-fb-ig-agent.ts
```
Cambiar TODAS las ocurrencias.

(d) Cambiar `'godentist'` (sin sufijo) que aparezca como agent identifier:
```bash
grep -nE "agent: 'godentist'(\s|,|})" src/lib/agents/godentist-fb-ig/godentist-fb-ig-agent.ts
```
Esperado post-cambios: 0 matches.

**Paso 3 — Validar TypeScript:**
```bash
npx tsc --noEmit 2>&1 | grep -E "godentist-fb-ig/(response-track|godentist-fb-ig-agent)" | head -10
```
Esperado: 0 errores. Errores tolerables aqui: imports relativos a `./sales-track` (Plan 04 lo crea) — los errores deben desaparecer al cierre de Plan 04.

**Paso 4 — Commit:**
```bash
git add src/lib/agents/godentist-fb-ig/response-track.ts src/lib/agents/godentist-fb-ig/godentist-fb-ig-agent.ts
git commit -m "feat(agent-godentist-fb-ig): adapt response-track.ts (D-08 anti-regression) + godentist-fb-ig-agent.ts (event renames)"
```

NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/godentist-fb-ig/response-track.ts</automated>
    <automated>test -f src/lib/agents/godentist-fb-ig/godentist-fb-ig-agent.ts</automated>
    <automated>grep -q "Adapted from src/lib/agents/godentist/response-track.ts" src/lib/agents/godentist-fb-ig/response-track.ts</automated>
    <automated>grep -q "anti-regression D-08" src/lib/agents/godentist-fb-ig/response-track.ts</automated>
    <automated>grep -c "GODENTIST_FB_IG_AGENT_ID" src/lib/agents/godentist-fb-ig/response-track.ts | awk '$1 >= 3 { exit 0 } { exit 1 }'</automated>
    <automated>! grep -E "GODENTIST_AGENT_ID\b" src/lib/agents/godentist-fb-ig/response-track.ts</automated>
    <automated>grep -c "agent: 'godentist-fb-ig'" src/lib/agents/godentist-fb-ig/response-track.ts | awk '$1 >= 2 { exit 0 } { exit 1 }'</automated>
    <automated>! grep -E "agent: 'godentist'(\s|,|})" src/lib/agents/godentist-fb-ig/response-track.ts</automated>
    <automated>grep -c "agent: 'godentist-fb-ig'" src/lib/agents/godentist-fb-ig/godentist-fb-ig-agent.ts | awk '$1 >= 9 { exit 0 } { exit 1 }'</automated>
    <automated>! grep -E "agent: 'godentist'(\s|,|})" src/lib/agents/godentist-fb-ig/godentist-fb-ig-agent.ts</automated>
    <automated>grep -q "\[GoDentist FB/IG\]" src/lib/agents/godentist-fb-ig/godentist-fb-ig-agent.ts</automated>
    <automated>! grep -E "\[GoDentist\] Error" src/lib/agents/godentist-fb-ig/godentist-fb-ig-agent.ts</automated>
    <automated>! grep -E "createAdminClient|@supabase/supabase-js" src/lib/agents/godentist-fb-ig/response-track.ts src/lib/agents/godentist-fb-ig/godentist-fb-ig-agent.ts</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(agent-godentist-fb-ig): adapt response-track.ts (D-08 anti-regression)"</automated>
  </verify>
  <acceptance_criteria>
    - `response-track.ts` contiene >=3 ocurrencias de `GODENTIST_FB_IG_AGENT_ID` (1 import + 2 templateManager calls minimo) y CERO ocurrencias de `GODENTIST_AGENT_ID` (anti-regresion D-08, Pitfall 1).
    - `response-track.ts` events emiten `agent: 'godentist-fb-ig'` (>=2 ocurrencias) y CERO `agent: 'godentist'`.
    - `godentist-fb-ig-agent.ts` events emiten `agent: 'godentist-fb-ig'` (>=9 ocurrencias) y CERO `agent: 'godentist'` (con sufijo de comma/space/brace).
    - `godentist-fb-ig-agent.ts` logs usan `[GoDentist FB/IG]` y CERO `[GoDentist]` puro.
    - Cero `createAdminClient` o `@supabase/supabase-js` (Regla 3) en estos 2 archivos.
    - Commit atomico exacto. NO push.
  </acceptance_criteria>
  <done>
    - response-track.ts + godentist-fb-ig-agent.ts adapted listos.
    - Anti-regresion D-08 verificada via grep — Plan 06 anadira test asserciones.
    - Plan 04 (sales-track) puede ser el ultimo archivo del modulo, completando el sibling.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Sibling agent → TemplateManager (Supabase agent_templates) | Lookup por agent_id; el sibling DEBE usar 'godentist-fb-ig' (anti-regresion D-08) |
| Sibling agent → Anthropic Haiku (comprehension) | POST con mensaje del cliente; sin PII en payload mas alla del mensaje |
| Sibling agent → Observability collector | recordEvent con agent: 'godentist-fb-ig' — separable del godentist en queries |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gfb-03-01 | Tampering | response-track.ts using GODENTIST_AGENT_ID by mistake | mitigate | Anti-regresion grep en acceptance_criteria + Plan 06 tests + Plan 09 verification grep (3 capas de proteccion) |
| T-gfb-03-02 | Information Disclosure | comprehension prompt incluye ejemplo "María López, 3001234567" | accept | Datos sinteticos no reales; el prompt es Haiku-only y no se loggea con PII de clientes reales |
| T-gfb-03-03 | Spoofing | Eventos observability con agent: 'godentist-fb-ig' confunden con godentist | mitigate | String literal distinto verificable; queries de `agent_observability_events WHERE agent='godentist-fb-ig'` los aislan |
| T-gfb-03-04 | Repudiation | Sin auditoria de quien adapto los archivos | accept | Git history + commit messages cubren auditoria |
</threat_model>

<verification>
- 6 archivos adapted en src/lib/agents/godentist-fb-ig/ (config.ts, comprehension-prompt.ts, comprehension.ts, response-track.ts, godentist-fb-ig-agent.ts, index.ts).
- Anti-regresion D-08: 0 GODENTIST_AGENT_ID en sibling directory + >=3 GODENTIST_FB_IG_AGENT_ID en response-track.ts.
- Event names: >=9 `agent: 'godentist-fb-ig'` en godentist-fb-ig-agent.ts; 0 `agent: 'godentist'` (sin sufijo).
- Lead-capture examples documentados en comprehension-prompt.ts (María López + Juan Pérez).
- 3 commits atomicos en git local. NO push.
- Cero `createAdminClient` o `@supabase/supabase-js` en TODO el sibling directory (Regla 3) — verificar al cierre con grep recursivo.
</verification>

<success_criteria>
- Plan 04 (lead-capture helper + sales-track wiring) puede importar `GODENTIST_FB_IG_AGENT_ID` y compilar contra el modulo casi-completo.
- Plan 05 (registration sites) puede agregar `import '@/lib/agents/godentist-fb-ig'` en webhook-processor.ts y page.tsx — el side-effect dispara `agentRegistry.register(godentistFbIgConfig)`.
- Plan 06 (tests) puede mockear TemplateManager y verificar que se invoca con `'godentist-fb-ig'` (anti-regresion D-08).
- Plan 09 (verification) puede correr el grep `grep -rn "GODENTIST_AGENT_ID" src/lib/agents/godentist-fb-ig/` y confirmar 0 matches.
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-godentist-fb-ig/03-SUMMARY.md` documenting:
- Commit hashes de Tasks 1, 2, 3.
- Lista de los 6 archivos adapted con tipo de cambio (config swap / event rename / import swap / examples added).
- Confirmacion de anti-regresion D-08 (`grep -c "GODENTIST_AGENT_ID\b" src/lib/agents/godentist-fb-ig/` = 0).
- Status del modulo: skeleton Plan 02 + adapted Plan 03 = casi-completo. Falta Plan 04 sales-track + lead-capture helper.
- Conteo de eventos `agent: 'godentist-fb-ig'` en agent file (>=9 esperado).
</output>

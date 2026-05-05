---
phase: agent-godentist-fb-ig
plan: 02
type: execute
wave: 1
depends_on: [01]
files_modified:
  - src/lib/agents/godentist-fb-ig/constants.ts
  - src/lib/agents/godentist-fb-ig/types.ts
  - src/lib/agents/godentist-fb-ig/comprehension-schema.ts
  - src/lib/agents/godentist-fb-ig/state.ts
  - src/lib/agents/godentist-fb-ig/transitions.ts
  - src/lib/agents/godentist-fb-ig/guards.ts
  - src/lib/agents/godentist-fb-ig/phase.ts
  - src/lib/agents/godentist-fb-ig/dentos-availability.ts
autonomous: true
requirements: [GFB-01]

must_haves:
  truths:
    - "Existen 8 archivos clonados verbatim del godentist en src/lib/agents/godentist-fb-ig/ (constants.ts, types.ts, comprehension-schema.ts, state.ts, transitions.ts, guards.ts, phase.ts, dentos-availability.ts)"
    - "Cada archivo es byte-identico al godentist source (excepto cabecera de comentario que identifica al sibling)"
    - "Cero referencias a 'godentist-fb-ig' o GODENTIST_FB_IG_AGENT_ID en estos 8 archivos — son archivos verbatim sin agent-id-specific logic (Q3 confirmado: dentos-availability.ts es agent-agnostic, hardcodea string 'godentist-valoraciones' literal que sirve a ambos agentes)"
    - "TypeScript compila sin errores nuevos: tsc --noEmit no agrega errors en estos 8 archivos"
    - "Cero imports de createAdminClient o @supabase/supabase-js en estos 8 archivos (Regla 3)"
  artifacts:
    - path: "src/lib/agents/godentist-fb-ig/constants.ts"
      provides: "GD_INTENTS (23), INFORMATIONAL_INTENTS (11), ESCAPE_INTENTS (4), CRITICAL_FIELDS, SEDES, SEDE_ALIASES, ACTION_TEMPLATE_MAP, SIGNIFICANT_ACTIONS, HORARIOS_GENERALES_SEDE, FESTIVOS_COLOMBIA_2026, isNonWorkingDay, GD_TIMER_DURATIONS"
      contains: "GD_INTENTS"
    - path: "src/lib/agents/godentist-fb-ig/types.ts"
      provides: "AgentState, V3AgentInput, V3AgentOutput, TipoAccion, Phase, TimerSignal, Gates"
      contains: "V3AgentInput"
    - path: "src/lib/agents/godentist-fb-ig/comprehension-schema.ts"
      provides: "MessageAnalysisSchema (zod) — input/output del Haiku call"
      contains: "MessageAnalysisSchema"
    - path: "src/lib/agents/godentist-fb-ig/state.ts"
      provides: "createInitialState, mergeAnalysis, computeGates, camposFaltantes, serializeState, deserializeState, hasAction, buildResumenContext"
      contains: "camposFaltantes"
    - path: "src/lib/agents/godentist-fb-ig/transitions.ts"
      provides: "TRANSITIONS array + resolveTransition function — state machine declarativa por (phase, intent)"
      contains: "TRANSITIONS"
    - path: "src/lib/agents/godentist-fb-ig/guards.ts"
      provides: "checkGuards (R0/R1) — low confidence + escape intents"
      contains: "checkGuards"
    - path: "src/lib/agents/godentist-fb-ig/phase.ts"
      provides: "derivePhase function — scanea acciones recientes y mapea a Phase enum"
      contains: "derivePhase"
    - path: "src/lib/agents/godentist-fb-ig/dentos-availability.ts"
      provides: "checkDentosAvailability — POST a robot Railway con workspaceId='godentist-valoraciones' literal"
      contains: "godentist-valoraciones"
  key_links:
    - from: "src/lib/agents/godentist-fb-ig/comprehension-schema.ts"
      to: "src/lib/agents/godentist-fb-ig/constants.ts"
      via: "import GD_INTENTS, SERVICIOS for zod enum"
      pattern: "import.*from.*constants"
    - from: "src/lib/agents/godentist-fb-ig/state.ts"
      to: "src/lib/agents/godentist-fb-ig/constants.ts"
      via: "import CRITICAL_FIELDS for camposFaltantes calc"
      pattern: "CRITICAL_FIELDS"
    - from: "src/lib/agents/godentist-fb-ig/transitions.ts"
      to: "src/lib/agents/godentist-fb-ig/types.ts + constants.ts"
      via: "import TipoAccion, Phase, GD_INTENTS, ACTION_TEMPLATE_MAP"
      pattern: "import.*TipoAccion"
---

<objective>
Wave 1 (parallel with Plan 03) — Clonar verbatim los 8 archivos del godentist que NO requieren cambios para el sibling. Estos archivos son agent-agnostic: contienen logica de state machine, schemas, helpers y constantes reusables.

Purpose: Establecer la base del modulo `src/lib/agents/godentist-fb-ig/` con los 8 archivos byte-identicos al godentist. Aislamiento total (D-04 + D-08): cualquier cambio futuro al godentist NO se filtrara al sibling porque el sibling tiene su propia copia.

Output: 8 archivos en `src/lib/agents/godentist-fb-ig/` listos para que Plan 03 (adapted files) y Plan 04 (lead-capture) los importen.

**No-deps:** Este plan corre en paralelo con Plan 03 (ambos parten de Wave 0 SUMMARY GO). Cero overlap de files_modified entre plans 02 y 03.

**Q3 confirmado en Wave 0:** `dentos-availability.ts` se clona VERBATIM sin ajustes — el robot Railway acepta `workspaceId: 'godentist-valoraciones'` literal y NO discrimina por agent_id.
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
@src/lib/agents/godentist/constants.ts
@src/lib/agents/godentist/types.ts
@src/lib/agents/godentist/comprehension-schema.ts
@src/lib/agents/godentist/state.ts
@src/lib/agents/godentist/transitions.ts
@src/lib/agents/godentist/guards.ts
@src/lib/agents/godentist/phase.ts
@src/lib/agents/godentist/dentos-availability.ts

<interfaces>
<!-- Source files to clone verbatim — RESEARCH.md File Inventory rows 2, 3, 5, 7, 8, 11, 12, 13 -->
SOURCE_BASE = 'src/lib/agents/godentist/'
TARGET_BASE = 'src/lib/agents/godentist-fb-ig/'

<!-- Files clone verbatim (8 total) — NO content changes -->
CLONE_FILES = [
  'constants.ts',          // GD_INTENTS, CRITICAL_FIELDS, SEDES, etc.
  'types.ts',              // AgentState, V3AgentInput/Output, TipoAccion, Phase
  'comprehension-schema.ts', // MessageAnalysisSchema (zod)
  'state.ts',              // mergeAnalysis, computeGates, camposFaltantes
  'transitions.ts',        // TRANSITIONS[] + resolveTransition
  'guards.ts',             // checkGuards (R0/R1)
  'phase.ts',              // derivePhase
  'dentos-availability.ts',// robot Railway POST (Q3 RESUELTA: workspace string hardcoded)
]
</interfaces>

<security_relevant>
**Workspace isolation:** Estos archivos NO acceden a DB. state.ts es serializer puro. dentos-availability.ts hablan al robot Railway (no a Supabase). Regla 3 satisfecha trivialmente.

**Habeas Data:** No relevante en este plan — sin acceso a datos personales.
</security_relevant>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Clonar verbatim los 4 archivos pequenos (types.ts, comprehension-schema.ts, guards.ts, phase.ts)</name>
  <read_first>
    - src/lib/agents/godentist/types.ts (file completo)
    - src/lib/agents/godentist/comprehension-schema.ts (file completo)
    - src/lib/agents/godentist/guards.ts (file completo)
    - src/lib/agents/godentist/phase.ts (file completo)
    - .planning/standalone/agent-godentist-fb-ig/RESEARCH.md §File Inventory rows 3, 5, 11, 12
  </read_first>
  <action>
Crear el directorio `src/lib/agents/godentist-fb-ig/` si no existe (mkdir -p). Clonar cada uno de los 4 archivos pequenos byte-identico desde el godentist:

```bash
mkdir -p src/lib/agents/godentist-fb-ig
cp src/lib/agents/godentist/types.ts src/lib/agents/godentist-fb-ig/types.ts
cp src/lib/agents/godentist/comprehension-schema.ts src/lib/agents/godentist-fb-ig/comprehension-schema.ts
cp src/lib/agents/godentist/guards.ts src/lib/agents/godentist-fb-ig/guards.ts
cp src/lib/agents/godentist/phase.ts src/lib/agents/godentist-fb-ig/phase.ts
```

**NO modificar el contenido de estos archivos.** Son verbatim. Los imports relativos (`./constants`, `./types`) ya resuelven correctamente al directorio del sibling porque cp preserva los paths relativos.

Despues de copiar, agregar UNA linea de comentario al header de cada archivo (encima del codigo existente) que identifique el sibling:

Para types.ts insertar al principio (linea 1):
```typescript
// Cloned verbatim from src/lib/agents/godentist/types.ts (Standalone: agent-godentist-fb-ig, Wave 1 Plan 02).
// DO NOT modify — keep in sync with godentist via clone, not divergent edits (D-04, D-08).
```

Repetir el mismo patron de cabecera para los otros 3 archivos (comprehension-schema.ts, guards.ts, phase.ts).

**Verificar que los imports relativos siguen resolviendo correctamente:**
```bash
npx tsc --noEmit 2>&1 | grep "godentist-fb-ig" | head -20
```

Esperado: 0 errores en estos 4 archivos. Si hay errores de "cannot find module ./constants", significa que los archivos referenciados (constants.ts, etc.) aun no existen — eso esta bien (vienen en Task 2 y Plan 03). El compile final pasara solo cuando todos los files esten en su lugar.

Hacer commit atomico:
```bash
git add src/lib/agents/godentist-fb-ig/types.ts src/lib/agents/godentist-fb-ig/comprehension-schema.ts src/lib/agents/godentist-fb-ig/guards.ts src/lib/agents/godentist-fb-ig/phase.ts
git commit -m "feat(agent-godentist-fb-ig): clone verbatim types.ts, comprehension-schema.ts, guards.ts, phase.ts (Plan 02 Task 1)"
```

NO push (Wave 1 queda local hasta Plan 08 push collective).
  </action>
  <verify>
    <automated>test -f src/lib/agents/godentist-fb-ig/types.ts</automated>
    <automated>test -f src/lib/agents/godentist-fb-ig/comprehension-schema.ts</automated>
    <automated>test -f src/lib/agents/godentist-fb-ig/guards.ts</automated>
    <automated>test -f src/lib/agents/godentist-fb-ig/phase.ts</automated>
    <automated>grep -q "Cloned verbatim from src/lib/agents/godentist" src/lib/agents/godentist-fb-ig/types.ts</automated>
    <automated>grep -q "Cloned verbatim from src/lib/agents/godentist" src/lib/agents/godentist-fb-ig/comprehension-schema.ts</automated>
    <automated>grep -q "Cloned verbatim from src/lib/agents/godentist" src/lib/agents/godentist-fb-ig/guards.ts</automated>
    <automated>grep -q "Cloned verbatim from src/lib/agents/godentist" src/lib/agents/godentist-fb-ig/phase.ts</automated>
    <automated>! grep -E "createAdminClient|@supabase/supabase-js" src/lib/agents/godentist-fb-ig/types.ts src/lib/agents/godentist-fb-ig/comprehension-schema.ts src/lib/agents/godentist-fb-ig/guards.ts src/lib/agents/godentist-fb-ig/phase.ts</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(agent-godentist-fb-ig): clone verbatim types.ts, comprehension-schema.ts, guards.ts, phase.ts"</automated>
  </verify>
  <acceptance_criteria>
    - 4 archivos existen en `src/lib/agents/godentist-fb-ig/` (types.ts, comprehension-schema.ts, guards.ts, phase.ts).
    - Cada uno tiene cabecera "Cloned verbatim from src/lib/agents/godentist/<file>.ts (Standalone: agent-godentist-fb-ig, Wave 1 Plan 02)".
    - Cero referencias a `createAdminClient` o `@supabase/supabase-js` (Regla 3).
    - Diff vs godentist source es solo el header de cabecera (verificable: `diff <(tail -n +3 src/lib/agents/godentist-fb-ig/types.ts) src/lib/agents/godentist/types.ts` retorna vacio).
    - Commit atomico exacto. NO push.
  </acceptance_criteria>
  <done>
    - 4 archivos verbatim listos en sibling directory.
    - Commit en git local.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Clonar verbatim los 4 archivos grandes (constants.ts, state.ts, transitions.ts, dentos-availability.ts)</name>
  <read_first>
    - src/lib/agents/godentist/constants.ts (file completo, ~258 LOC)
    - src/lib/agents/godentist/state.ts (file completo, ~388 LOC — verificar camposFaltantes en linea ~215)
    - src/lib/agents/godentist/transitions.ts (file completo, ~974 LOC)
    - src/lib/agents/godentist/dentos-availability.ts (file completo — verificar workspaceId literal en linea 50)
    - .planning/standalone/agent-godentist-fb-ig/RESEARCH.md §File Inventory rows 2, 7, 8, 13 + Pitfall 1 (regresion catalogo)
  </read_first>
  <action>
Clonar los 4 archivos grandes verbatim:

```bash
cp src/lib/agents/godentist/constants.ts src/lib/agents/godentist-fb-ig/constants.ts
cp src/lib/agents/godentist/state.ts src/lib/agents/godentist-fb-ig/state.ts
cp src/lib/agents/godentist/transitions.ts src/lib/agents/godentist-fb-ig/transitions.ts
cp src/lib/agents/godentist/dentos-availability.ts src/lib/agents/godentist-fb-ig/dentos-availability.ts
```

**NO modificar el contenido.** Son verbatim. Agregar la misma cabecera de "Cloned verbatim from..." que en Task 1 (encima del codigo existente, lineas 1-2 del archivo nuevo):

```typescript
// Cloned verbatim from src/lib/agents/godentist/<file>.ts (Standalone: agent-godentist-fb-ig, Wave 1 Plan 02).
// DO NOT modify — keep in sync with godentist via clone, not divergent edits (D-04, D-08).
```

**Validaciones especificas:**

1. **constants.ts** debe contener `GD_INTENTS`, `INFORMATIONAL_INTENTS`, `ESCAPE_INTENTS`, `CRITICAL_FIELDS`, `SEDES`, `SEDE_ALIASES`, `ACTION_TEMPLATE_MAP`, `SIGNIFICANT_ACTIONS`, `HORARIOS_GENERALES_SEDE`, `FESTIVOS_COLOMBIA_2026`, `GD_TIMER_DURATIONS`. Estos son referenciados por Plan 03 archivos adapted y Plan 04 lead-capture helper.

2. **state.ts** debe exportar `camposFaltantes` (referenciado por Plan 04 lead-capture). Verificar via grep:
```bash
grep -n "export function camposFaltantes" src/lib/agents/godentist-fb-ig/state.ts
```
Esperado: 1 match (alrededor de linea 215+2 cabecera = ~217).

3. **dentos-availability.ts** debe contener literal `workspaceId: 'godentist-valoraciones'` (Q3 RESUELTA en Wave 0 — el robot Railway acepta esta string para AMBOS agentes). NO modificar este string.
```bash
grep -n "workspaceId.*godentist-valoraciones" src/lib/agents/godentist-fb-ig/dentos-availability.ts
```
Esperado: 1 match (alrededor de linea 50+2 cabecera = ~52).

4. **transitions.ts** clonado verbatim — la logica del lead capture vive en sales-track.ts (Plan 04), NO en transitions.ts. NO insertar logica nueva aqui (D-09 + Pitfall 5 documentan que la logica imperativa va en sales-track hook, no en la tabla declarativa).

Hacer commit atomico:
```bash
git add src/lib/agents/godentist-fb-ig/constants.ts src/lib/agents/godentist-fb-ig/state.ts src/lib/agents/godentist-fb-ig/transitions.ts src/lib/agents/godentist-fb-ig/dentos-availability.ts
git commit -m "feat(agent-godentist-fb-ig): clone verbatim constants.ts, state.ts, transitions.ts, dentos-availability.ts (Plan 02 Task 2)"
```

NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/godentist-fb-ig/constants.ts</automated>
    <automated>test -f src/lib/agents/godentist-fb-ig/state.ts</automated>
    <automated>test -f src/lib/agents/godentist-fb-ig/transitions.ts</automated>
    <automated>test -f src/lib/agents/godentist-fb-ig/dentos-availability.ts</automated>
    <automated>grep -q "GD_INTENTS" src/lib/agents/godentist-fb-ig/constants.ts</automated>
    <automated>grep -q "CRITICAL_FIELDS" src/lib/agents/godentist-fb-ig/constants.ts</automated>
    <automated>grep -q "ACTION_TEMPLATE_MAP" src/lib/agents/godentist-fb-ig/constants.ts</automated>
    <automated>grep -q "export function camposFaltantes" src/lib/agents/godentist-fb-ig/state.ts</automated>
    <automated>grep -q "godentist-valoraciones" src/lib/agents/godentist-fb-ig/dentos-availability.ts</automated>
    <automated>grep -q "TRANSITIONS" src/lib/agents/godentist-fb-ig/transitions.ts</automated>
    <automated>grep -q "Cloned verbatim from src/lib/agents/godentist" src/lib/agents/godentist-fb-ig/constants.ts</automated>
    <automated>grep -q "Cloned verbatim from src/lib/agents/godentist" src/lib/agents/godentist-fb-ig/state.ts</automated>
    <automated>grep -q "Cloned verbatim from src/lib/agents/godentist" src/lib/agents/godentist-fb-ig/transitions.ts</automated>
    <automated>grep -q "Cloned verbatim from src/lib/agents/godentist" src/lib/agents/godentist-fb-ig/dentos-availability.ts</automated>
    <automated>! grep -rE "createAdminClient|@supabase/supabase-js" src/lib/agents/godentist-fb-ig/</automated>
    <automated>diff <(tail -n +3 src/lib/agents/godentist-fb-ig/constants.ts) src/lib/agents/godentist/constants.ts</automated>
    <automated>diff <(tail -n +3 src/lib/agents/godentist-fb-ig/state.ts) src/lib/agents/godentist/state.ts</automated>
    <automated>diff <(tail -n +3 src/lib/agents/godentist-fb-ig/transitions.ts) src/lib/agents/godentist/transitions.ts</automated>
    <automated>diff <(tail -n +3 src/lib/agents/godentist-fb-ig/dentos-availability.ts) src/lib/agents/godentist/dentos-availability.ts</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(agent-godentist-fb-ig): clone verbatim constants.ts, state.ts, transitions.ts, dentos-availability.ts"</automated>
  </verify>
  <acceptance_criteria>
    - 4 archivos grandes existen en sibling directory.
    - Cada uno tiene cabecera "Cloned verbatim from src/lib/agents/godentist/...".
    - `diff <(tail -n +3 sibling) godentist` retorna vacio para los 4 (byte-identico modulo cabecera).
    - constants.ts contiene GD_INTENTS, CRITICAL_FIELDS, ACTION_TEMPLATE_MAP.
    - state.ts contiene `export function camposFaltantes`.
    - dentos-availability.ts contiene literal `'godentist-valoraciones'` (Q3 sin ajuste).
    - Cero `createAdminClient` o `@supabase/supabase-js` (Regla 3) en TODO el directorio sibling.
    - Commit atomico exacto. NO push.
  </acceptance_criteria>
  <done>
    - 8 archivos verbatim totales en sibling directory (4 de Task 1 + 4 de Task 2).
    - Module skeleton listo para que Plan 03 agregue los archivos adapted.
    - Commit en git local.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Sibling code → Supabase | NONE en estos archivos — todos son in-memory helpers o robot Railway POST |
| Sibling code → Robot Railway | dentos-availability.ts usa hardcoded credentials JROMERO/123456 (mismo que godentist; aceptable porque robot esta detras de auth y solo expone availability lookups) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gfb-02-01 | Information Disclosure | dentos-availability.ts hardcoded credentials | accept | Mismo patron que godentist en prod (riesgo aceptado pre-existente); rotation via standalone separado si se requiere |
| T-gfb-02-02 | Tampering | Clone verbatim sin modificacion | mitigate | diff check obligatorio (acceptance_criteria) confirma byte-identidad; cualquier divergencia silenciosa rechazada |
| T-gfb-02-03 | Spoofing | Clone files import from sibling directory | mitigate | Imports relativos resuelven al sibling directory; NO referencia cruzada a godentist (verificable en Plan 09 verification) |
</threat_model>

<verification>
- 8 archivos en src/lib/agents/godentist-fb-ig/ (clone verbatim).
- Cada archivo tiene cabecera "Cloned verbatim from..." (lineas 1-2).
- diff modulo cabecera = vacio para los 4 archivos grandes (constants, state, transitions, dentos-availability).
- 0 imports de createAdminClient o @supabase/supabase-js.
- 2 commits atomicos en git local. NO push.
</verification>

<success_criteria>
- Plan 03 (adapted files) puede importar de `./constants`, `./state`, `./transitions`, `./guards`, `./phase`, `./types`, `./comprehension-schema` y resolver correctamente al sibling directory.
- Plan 04 (lead-capture helper) puede importar `camposFaltantes` y `Gates` del sibling.
- Cero deriva del godentist hasta que el usuario decida explicitamente modificar uno de estos 8 archivos en un standalone futuro.
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-godentist-fb-ig/02-SUMMARY.md` documenting:
- Commit hashes de Task 1 y Task 2.
- Lista de los 8 archivos clonados con tamanos LOC.
- Confirmacion de diff vacio (modulo cabecera) vs godentist source.
- Confirmacion de 0 createAdminClient en sibling directory.
- Statu del modulo: skeleton verbatim listo, falta Wave 1 Plan 03 (adapted files) y Wave 2 Plan 04 (lead-capture).
</output>

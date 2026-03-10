---
phase: quick-019
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v3/types.ts
  - src/lib/agents/somnio-v3/constants.ts
  - src/lib/agents/somnio-v3/transitions.ts
  - src/lib/agents/somnio-v3/response-track.ts
  - supabase/migrations/20260310000001_retoma_datos_templates.sql
autonomous: true

must_haves:
  truths:
    - "Timer L0 en capturing_data envia template retoma_datos (sin variables)"
    - "Timer L1 en capturing_data envia template retoma_datos_parciales con campos faltantes legibles"
    - "No-repetition filter no bloquea L0/L1 porque usan intents diferentes a pedir_datos"
    - "retoma_datos y retoma_datos_parciales NO cambian phase (no estan en SIGNIFICANT_ACTIONS)"
  artifacts:
    - path: "supabase/migrations/20260310000001_retoma_datos_templates.sql"
      provides: "Two DB templates for retoma_datos and retoma_datos_parciales intents"
    - path: "src/lib/agents/somnio-v3/response-track.ts"
      provides: "Case for retoma_datos_parciales with FIELD_LABELS map"
  key_links:
    - from: "transitions.ts"
      to: "response-track.ts"
      via: "action field flows to resolveSalesActionTemplates"
      pattern: "action: 'retoma_datos'"
    - from: "response-track.ts"
      to: "constants.ts"
      via: "ACTION_TEMPLATE_MAP default case"
      pattern: "ACTION_TEMPLATE_MAP\\[action\\]"
---

<objective>
Fix timer L0 and L1 in capturing_data phase sending no message because pedir_datos template
is blocked by no-repetition filter. Create two new actions (retoma_datos, retoma_datos_parciales)
with dedicated templates that bypass the hardcoded pedir_datos case.

Purpose: Users who go silent during data capture must receive a follow-up message.
Output: Working L0/L1 timer retomas with distinct templates.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/agents/somnio-v3/types.ts
@src/lib/agents/somnio-v3/constants.ts
@src/lib/agents/somnio-v3/transitions.ts
@src/lib/agents/somnio-v3/response-track.ts
@src/lib/agents/somnio-v3/state.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migration - retoma_datos templates</name>
  <files>supabase/migrations/20260310000001_retoma_datos_templates.sql</files>
  <action>
Create migration inserting two templates into agent_templates table for agent_id='somnio-sales-v1'.
Follow the exact pattern from 20260310000000_retoma_inicial_template.sql.

Template 1 — intent 'retoma_datos' (L0 - no data yet):
- content: "Quedamos pendientes a tus datos, o si tienes alguna pregunta acerca del producto no dudes en hacerla"
- visit_type values: same set as retoma_inicial (primera_vez, recurrente, retoma)
- content_type: 'texto', priority: 'core'

Template 2 — intent 'retoma_datos_parciales' (L1 - partial data):
- content: "Para poder despachar tu producto nos faltaria:\n{{campos_faltantes}}\nQuedamos pendientes"
- visit_type values: same set as retoma_inicial
- content_type: 'texto', priority: 'core'

Also add both intents to V3_TO_V1_INTENT_MAP in the migration comments for traceability.
  </action>
  <verify>Read the migration file and confirm both INSERT statements exist with correct agent_id, intents, and content.</verify>
  <done>Migration file exists with two templates ready to apply.</done>
</task>

<task type="auto">
  <name>Task 2: Wire new actions in types, constants, transitions, response-track</name>
  <files>
    src/lib/agents/somnio-v3/types.ts
    src/lib/agents/somnio-v3/constants.ts
    src/lib/agents/somnio-v3/transitions.ts
    src/lib/agents/somnio-v3/response-track.ts
  </files>
  <action>
**types.ts** (line ~220, TipoAccion union):
Add `| 'retoma_datos'` and `| 'retoma_datos_parciales'` to TipoAccion union type.

**constants.ts**:
1. ACTION_TEMPLATE_MAP — add entries:
   - `retoma_datos: ['retoma_datos']`
   - `retoma_datos_parciales: ['retoma_datos_parciales']`
2. V3_TO_V1_INTENT_MAP — add entries:
   - `retoma_datos: ['retoma_datos']` (same name, no v1 mapping needed — template uses v3 intent directly)
   - `retoma_datos_parciales: ['retoma_datos_parciales']`
3. Do NOT add to SIGNIFICANT_ACTIONS — these retomas must NOT change phase.

**transitions.ts** (lines ~194 and ~201):
- Line ~194: Change `action: 'pedir_datos'` to `action: 'retoma_datos'`
  Update comment to: `// Timer expired L0 -> retoma_datos (retoma sin datos)`
  Update reason to: `'Timer L0 expired -> retoma datos (proximo dato reactiva timer)'`
- Line ~201: Change `action: 'pedir_datos'` to `action: 'retoma_datos_parciales'`
  Update comment to: `// Timer expired L1 -> retoma_datos_parciales`
  Update reason to: `'Timer L1 expired -> retoma datos parciales (proximo dato reactiva timer)'`

**response-track.ts**:
Add a case for `retoma_datos_parciales` in `resolveSalesActionTemplates` switch (before the `default` case).
This case needs to pass campos_faltantes with HUMAN-READABLE labels as extraContext.

Add a FIELD_LABELS constant map at the top of the file (after imports):
```ts
const FIELD_LABELS: Record<string, string> = {
  nombre: 'Nombre',
  apellido: 'Apellido',
  telefono: 'Telefono',
  ciudad: 'Ciudad',
  departamento: 'Departamento',
  direccion: 'Direccion completa',
  barrio: 'Barrio',
  correo: 'Correo electronico',
  cedula_recoge: 'Cedula',
}
```

The case:
```ts
case 'retoma_datos_parciales': {
  const faltantes = camposFaltantes(state)
  const labels = faltantes.map(f => FIELD_LABELS[f] ?? f)
  return {
    intents: ['retoma_datos_parciales'],
    extraContext: { campos_faltantes: labels.map(l => `- ${l}`).join('\n') },
  }
}
```

Do NOT add a case for `retoma_datos` — it should fall through to `default` which uses ACTION_TEMPLATE_MAP (static template, no variables).

Do NOT modify the existing `case 'pedir_datos'` — it still handles quiero_comprar/confirmar flows.
  </action>
  <verify>
1. `npx tsc --noEmit` — no type errors
2. Grep transitions.ts for 'retoma_datos' — confirms L0 and L1 use new actions
3. Grep constants.ts for 'retoma_datos' — confirms ACTION_TEMPLATE_MAP and V3_TO_V1_INTENT_MAP entries
4. Grep response-track.ts for 'retoma_datos_parciales' — confirms case exists with FIELD_LABELS
5. Grep constants.ts SIGNIFICANT_ACTIONS — confirms retoma_datos NOT present
  </verify>
  <done>
- TipoAccion includes retoma_datos and retoma_datos_parciales
- L0 transition fires retoma_datos, L1 fires retoma_datos_parciales
- retoma_datos goes through ACTION_TEMPLATE_MAP default (static template)
- retoma_datos_parciales has explicit case with human-readable campos_faltantes
- Neither action is in SIGNIFICANT_ACTIONS
- TypeScript compiles clean
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes
2. Migration file has two INSERT statements with correct intents
3. L0/L1 transitions use new action names
4. response-track handles retoma_datos_parciales with labeled fields
5. retoma_datos falls through to ACTION_TEMPLATE_MAP default
6. SIGNIFICANT_ACTIONS unchanged
</verification>

<success_criteria>
- Timer L0 in capturing_data triggers retoma_datos action -> static template sent
- Timer L1 in capturing_data triggers retoma_datos_parciales -> template with human-readable campos_faltantes
- No-repetition filter does NOT block these (different intents from pedir_datos)
- Phase does NOT change on retoma_datos/retoma_datos_parciales (not in SIGNIFICANT_ACTIONS)
- Existing pedir_datos flow for quiero_comprar/confirmar unchanged
</success_criteria>

<output>
After completion, create `.planning/quick/019-retoma-datos-l0-l1-templates/019-SUMMARY.md`
</output>

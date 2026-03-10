---
phase: quick-017
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v3/types.ts
  - src/lib/agents/somnio-v3/transitions.ts
  - src/lib/agents/somnio-v3/constants.ts
  - supabase/migrations/20260310000000_retoma_inicial_template.sql
autonomous: true

must_haves:
  truths:
    - "Timer L5 expires in initial phase -> agent sends retoma_inicial template ('Deseas adquirir el tuyo?') instead of pedir_datos template"
    - "Phase does NOT change after retoma action (stays initial)"
  artifacts:
    - path: "src/lib/agents/somnio-v3/types.ts"
      provides: "'retoma' in TipoAccion union"
      contains: "'retoma'"
    - path: "src/lib/agents/somnio-v3/constants.ts"
      provides: "retoma -> retoma_inicial mapping in ACTION_TEMPLATE_MAP and V3_TO_V1_INTENT_MAP"
      contains: "retoma_inicial"
    - path: "src/lib/agents/somnio-v3/transitions.ts"
      provides: "L5 initial transition uses action: 'retoma'"
      contains: "action: 'retoma'"
    - path: "supabase/migrations/20260310000000_retoma_inicial_template.sql"
      provides: "DB template record for retoma_inicial intent"
      contains: "retoma_inicial"
  key_links:
    - from: "transitions.ts L5 initial"
      to: "response-track.ts resolveSalesActionTemplates"
      via: "action: 'retoma' -> default case -> ACTION_TEMPLATE_MAP['retoma'] -> ['retoma_inicial']"
      pattern: "retoma.*retoma_inicial"
    - from: "response-track.ts"
      to: "V3_TO_V1_INTENT_MAP"
      via: "v3 intent 'retoma_inicial' maps to v1 DB key 'retoma_inicial'"
      pattern: "retoma_inicial"
---

<objective>
Fix Timer L5 in initial phase sending wrong template. Currently uses `action: 'pedir_datos'` which
resolves to "dame tus datos" template. Must send "Deseas adquirir el tuyo?" (retoma_inicial) instead.

Purpose: L5 timer in initial phase is a re-engagement nudge, not a data capture request. The wrong
template confuses clients who haven't expressed purchase intent yet.

Output: New 'retoma' action type wired end-to-end from transition -> response track -> DB template.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/agents/somnio-v3/types.ts
@src/lib/agents/somnio-v3/transitions.ts
@src/lib/agents/somnio-v3/constants.ts
@src/lib/agents/somnio-v3/response-track.ts
@src/lib/agents/somnio-v3/phase.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add 'retoma' action type and wire constants</name>
  <files>
    src/lib/agents/somnio-v3/types.ts
    src/lib/agents/somnio-v3/constants.ts
    src/lib/agents/somnio-v3/transitions.ts
  </files>
  <action>
    1. In `types.ts`, add `'retoma'` to the `TipoAccion` union type (after 'cambio').

    2. In `constants.ts`:
       - Add `retoma: ['retoma_inicial']` to `ACTION_TEMPLATE_MAP`
       - Add `retoma_inicial: ['retoma_inicial']` to `V3_TO_V1_INTENT_MAP` (v3 intent maps to same v1 DB key)
       - Do NOT add 'retoma' to `SIGNIFICANT_ACTIONS` — retoma should NOT change phase (stays 'initial')

    3. In `transitions.ts`, change the L5 initial transition (line ~277):
       - FROM: `action: 'pedir_datos'`
       - TO: `action: 'retoma'`
       - Keep everything else the same (phase, on, resolve function with templateIntents: ['retoma_inicial'])

    WHY 'retoma' not 'pedir_datos': The response-track `resolveSalesActionTemplates` has a hardcoded
    `case 'pedir_datos'` that returns `['pedir_datos']` intents, IGNORING templateIntents from the
    transition. A new action type 'retoma' falls to the `default` case which uses `ACTION_TEMPLATE_MAP`,
    correctly resolving to `['retoma_inicial']`.

    WHY NOT in SIGNIFICANT_ACTIONS: 'retoma' is a re-engagement nudge. It should not change the derived
    phase. The conversation stays in 'initial' so subsequent interactions work correctly.
  </action>
  <verify>
    Run `npx tsc --noEmit` — no type errors.
    Grep for `action: 'retoma'` in transitions.ts — found on L5 initial entry.
    Grep for `retoma` in constants.ts — found in both ACTION_TEMPLATE_MAP and V3_TO_V1_INTENT_MAP.
    Grep for `'retoma'` in SIGNIFICANT_ACTIONS — NOT found (must not be significant).
  </verify>
  <done>
    TipoAccion includes 'retoma', L5 initial transition uses action: 'retoma', ACTION_TEMPLATE_MAP
    maps retoma -> ['retoma_inicial'], V3_TO_V1_INTENT_MAP maps retoma_inicial -> ['retoma_inicial'],
    'retoma' is NOT in SIGNIFICANT_ACTIONS. TypeScript compiles clean.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create DB migration for retoma_inicial template</name>
  <files>supabase/migrations/20260310000000_retoma_inicial_template.sql</files>
  <action>
    Create migration file that inserts the retoma_inicial template into agent_templates.

    Use this exact INSERT pattern (matching existing seed format):
    ```sql
    -- Template: retoma_inicial (L5 timer re-engagement in initial phase)
    INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
    ('somnio-sales-v1', 'retoma_inicial', 'primera_vez', 0, 'texto', '¿Deseas adquirir el tuyo? 😊', 0),
    ('somnio-sales-v1', 'retoma_inicial', 'siguientes', 0, 'texto', '¿Deseas adquirir el tuyo? 😊', 0);
    ```

    Use agent_id = 'somnio-sales-v1' because v3 falls back to v1 templates (no v3-specific templates
    exist in DB). The TemplateManager tries v3 first, finds nothing, then falls back to v1.

    Include BOTH visit_type variants (primera_vez and siguientes) since L5 can fire regardless of
    visit history.

    IMPORTANT: This migration must be applied to production BEFORE pushing the code changes.
  </action>
  <verify>
    File exists at `supabase/migrations/20260310000000_retoma_inicial_template.sql`.
    SQL is valid (INSERT INTO agent_templates with correct columns).
    Uses agent_id 'somnio-sales-v1' and intent 'retoma_inicial'.
  </verify>
  <done>
    Migration file created. Ready for user to apply to production DB before code deploy.
    PAUSE and ask user to run migration before pushing code.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes — no type errors from new TipoAccion value
2. Trace the full path manually:
   - L5 expires in initial -> transition resolves action='retoma', templateIntents=['retoma_inicial']
   - Sales track returns accion='retoma'
   - Response track: resolveSalesActionTemplates('retoma', state) -> default case -> ACTION_TEMPLATE_MAP['retoma'] -> ['retoma_inicial']
   - V3_TO_V1_INTENT_MAP['retoma_inicial'] -> ['retoma_inicial']
   - TemplateManager looks up intent='retoma_inicial' in DB -> finds the record -> sends message
3. derivePhase: 'retoma' is NOT in SIGNIFICANT_ACTIONS -> phase stays 'initial' (correct)
4. Migration applies cleanly (no conflicts with existing data)
</verification>

<success_criteria>
- Timer L5 in initial phase triggers 'retoma' action (not 'pedir_datos')
- Response track resolves 'retoma' to 'retoma_inicial' template via ACTION_TEMPLATE_MAP
- DB has retoma_inicial template with re-engagement message
- Phase derivation ignores 'retoma' (stays 'initial')
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/017-accion-retoma-l5-initial-template-retoma/017-SUMMARY.md`
</output>

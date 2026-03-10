---
phase: quick-018
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v3/transitions.ts
autonomous: true

must_haves:
  truths:
    - "TransitionOutput interface only has reason, timerSignal?, enterCaptura?"
    - "No templateIntents or extraContext in any transition resolve function"
    - "getResumenIntent helper function removed"
    - "buildResumenContext import removed, camposFaltantes import kept"
    - "TypeScript compiles without errors"
  artifacts:
    - path: "src/lib/agents/somnio-v3/transitions.ts"
      provides: "Clean TransitionOutput without dead fields"
      contains: "reason: string"
  key_links:
    - from: "src/lib/agents/somnio-v3/transitions.ts"
      to: "src/lib/agents/somnio-v3/sales-track.ts"
      via: "TransitionOutput used by sales-track (reason, timerSignal, enterCaptura)"
      pattern: "reason|timerSignal|enterCaptura"
---

<objective>
Remove dead `templateIntents` and `extraContext` fields from TransitionOutput and all TRANSITIONS entries in transitions.ts.

Purpose: These fields are dead code in v3 two-track architecture. Sales-track only uses reason/timerSignal/enterCaptura. Response-track resolves templates independently via resolveSalesActionTemplates().
Output: Clean transitions.ts with no dead fields.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/agents/somnio-v3/transitions.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove dead templateIntents/extraContext from transitions.ts</name>
  <files>src/lib/agents/somnio-v3/transitions.ts</files>
  <action>
  Edit `src/lib/agents/somnio-v3/transitions.ts` with these changes:

  1. **TransitionOutput interface** (lines 21-27): Remove `templateIntents: string[]` and `extraContext?: Record<string, string>`. Keep `timerSignal?`, `enterCaptura?`, `reason`.

  2. **Remove `getResumenIntent` helper** (lines 29-32): Delete the entire function.

  3. **Import line** (line 11): Remove `buildResumenContext` from the import. KEEP `camposFaltantes` because it is still used in the `reason` string on line 149 (`reason: \`Pack=${state.pack} pero faltan: ${camposFaltantes(state).join(', ')}\``).
     Result: `import { camposFaltantes } from './state'`

  4. **Every `resolve` function in TRANSITIONS array**: Remove all `templateIntents: [...]` lines and all `extraContext: { ... }` lines. There are 25 entries with templateIntents and ~10 with extraContext.

  5. **Line 234 special case** (`const missing = camposFaltantes(state)`): This variable was only used in `templateIntents` and `extraContext` lines in that block. After removal, delete the `const missing` declaration and simplify the resolve to return the object directly (no intermediate variable needed). The `reason` on line 238 is a plain string that does not use `missing`.

  IMPORTANT: Do NOT touch any `reason`, `timerSignal`, or `enterCaptura` fields. Do NOT modify files outside transitions.ts. The `templateIntents` in types.ts and somnio-v3-agent.ts are DIFFERENT (response-track output, not TransitionOutput) and must NOT be changed.
  </action>
  <verify>
  Run all three:
  - `npx tsc --noEmit` passes with zero errors
  - `grep -c templateIntents src/lib/agents/somnio-v3/transitions.ts` returns 0
  - `grep -c extraContext src/lib/agents/somnio-v3/transitions.ts` returns 0
  - `grep -c getResumenIntent src/lib/agents/somnio-v3/transitions.ts` returns 0
  - `grep -c buildResumenContext src/lib/agents/somnio-v3/transitions.ts` returns 0
  - `grep camposFaltantes src/lib/agents/somnio-v3/transitions.ts` still shows the import and line 149 usage
  </verify>
  <done>TransitionOutput has only {reason, timerSignal?, enterCaptura?}. All 25 transition entries have no templateIntents or extraContext. TypeScript compiles clean.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes
- `grep -c 'templateIntents\|extraContext\|getResumenIntent\|buildResumenContext' src/lib/agents/somnio-v3/transitions.ts` returns 0
- `grep camposFaltantes src/lib/agents/somnio-v3/transitions.ts` returns 2 hits (import + reason usage)
</verification>

<success_criteria>
- TransitionOutput interface has exactly 3 fields: reason, timerSignal?, enterCaptura?
- Zero occurrences of templateIntents, extraContext, getResumenIntent, buildResumenContext in transitions.ts
- camposFaltantes still imported and used in reason string
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/018-eliminar-templateintents-decorativos-transitions/018-SUMMARY.md`
</output>

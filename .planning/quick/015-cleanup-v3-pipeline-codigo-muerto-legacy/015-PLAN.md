---
phase: quick-015
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v3/decision.ts        # DELETE
  - src/lib/agents/somnio-v3/response.ts         # DELETE
  - src/lib/agents/somnio-v3/engine-adapter.ts   # DELETE
  - src/lib/agents/somnio-v3/constants.ts
  - src/lib/agents/somnio-v3/state.ts
  - src/lib/agents/somnio-v3/types.ts
  - src/lib/agents/somnio-v3/transitions.ts
  - src/lib/agents/somnio-v3/sales-track.ts
  - src/lib/agents/somnio-v3/engine-v3.ts
  - src/lib/agents/somnio-v3/somnio-v3-agent.ts
autonomous: true

must_haves:
  truths:
    - "No dead files remain in somnio-v3 directory"
    - "No unused exports in constants.ts or state.ts"
    - "ingest_complete renamed to auto everywhere"
    - "readiness_check fully removed"
    - "No hardcoded fallbacks that duplicate transition table"
    - "TypeScript compiles with zero errors"
  artifacts:
    - path: "src/lib/agents/somnio-v3/decision.ts"
      provides: "DELETED — replaced by sales-track.ts"
    - path: "src/lib/agents/somnio-v3/response.ts"
      provides: "DELETED — replaced by response-track.ts"
    - path: "src/lib/agents/somnio-v3/engine-adapter.ts"
      provides: "DELETED — never integrated"
    - path: "src/lib/agents/somnio-v3/types.ts"
      provides: "Clean types without ingestInfo, ingest origin, readiness_check"
    - path: "src/lib/agents/somnio-v3/transitions.ts"
      provides: "Transition table with auto: keys, no readiness_check, timerSignal on mostrar_confirmacion"
  key_links:
    - from: "sales-track.ts"
      to: "transitions.ts"
      via: "systemEventToKey with 'auto' type"
      pattern: "type: 'auto'"
    - from: "engine-v3.ts"
      to: "types.ts"
      via: "V3AgentOutput without ingestInfo"
      pattern: "output\\.ingestInfo"
---

<objective>
Remove dead code, unused exports, and legacy naming from the v3 pipeline.

Purpose: Reduce cognitive load and prevent confusion from stale code paths. The two-track
architecture (sales-track + response-track) fully replaced decision.ts/response.ts, and
ingest logic was absorbed into sales-track auto-triggers. This cleanup removes all residue.

Output: Clean v3 pipeline with no dead files, no unused exports, renamed ingest_complete->auto,
and no orphan transitions.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/agents/somnio-v3/types.ts
@src/lib/agents/somnio-v3/constants.ts
@src/lib/agents/somnio-v3/state.ts
@src/lib/agents/somnio-v3/transitions.ts
@src/lib/agents/somnio-v3/sales-track.ts
@src/lib/agents/somnio-v3/engine-v3.ts
@src/lib/agents/somnio-v3/somnio-v3-agent.ts
@src/lib/agents/somnio-v3/guards.ts
@src/lib/sandbox/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete dead files + clean constants.ts and state.ts</name>
  <files>
    src/lib/agents/somnio-v3/decision.ts
    src/lib/agents/somnio-v3/response.ts
    src/lib/agents/somnio-v3/engine-adapter.ts
    src/lib/agents/somnio-v3/constants.ts
    src/lib/agents/somnio-v3/state.ts
  </files>
  <action>
    **1a. Delete 3 dead files:**
    - `rm src/lib/agents/somnio-v3/decision.ts` (166 lines, replaced by sales-track.ts)
    - `rm src/lib/agents/somnio-v3/response.ts` (152 lines, replaced by response-track.ts)
    - `rm src/lib/agents/somnio-v3/engine-adapter.ts` (198 lines, never integrated)

    **1b. Clean constants.ts — delete these unused exports:**
    - `V3Intent` type (line ~43) — only self-referenced, no external imports
    - `NEVER_SILENCE_INTENTS` (lines ~55-71) — deprecated, only decision.ts used it (now deleted)
    - `ALL_DATA_FIELDS` (lines ~114-126) — not imported anywhere
    - `ACK_PATTERNS` (lines ~180-206) — not imported anywhere (comprehension uses Claude, not regex)
    - `OFI_INTER_PATTERNS` (lines ~212-221) — not imported anywhere
    - `TIPO_ACCION` (lines ~233-236) — not imported anywhere (TipoAccion type in types.ts is the source of truth)

    KEEP everything else: V3_INTENTS, ESCAPE_INTENTS, INFORMATIONAL_INTENTS, ACTION_TEMPLATE_MAP,
    CRITICAL_FIELDS_NORMAL, CRITICAL_FIELDS_OFI_INTER, PACK_PRICES, V3_TO_V1_INTENT_MAP,
    V3_META_PREFIX, SIGNIFICANT_ACTIONS, LOW_CONFIDENCE_THRESHOLD

    **1c. Clean state.ts — delete 2 unused functions:**
    - `tieneDatosParciales()` (line ~203-205) — not imported anywhere outside state.ts
    - `camposLlenos()` (lines ~221-227) — not imported anywhere outside state.ts

    KEEP: createInitialState, mergeAnalysis, computeGates, datosCriticosOk, datosExtrasOk,
    camposFaltantes, buildResumenContext, serializeState, deserializeState, hasAction
  </action>
  <verify>
    `npx tsc --noEmit 2>&1 | head -30` — should show no errors related to deleted files/exports.
    Grep for imports of deleted items: `grep -r "decision.ts\|response.ts\|engine-adapter" src/lib/agents/somnio-v3/ --include="*.ts"` returns nothing.
    `grep -r "NEVER_SILENCE_INTENTS\|ACK_PATTERNS\|OFI_INTER_PATTERNS\|ALL_DATA_FIELDS\|TIPO_ACCION\b\|tieneDatosParciales\|camposLlenos\|V3Intent" src/ --include="*.ts"` returns nothing.
  </verify>
  <done>3 dead files deleted, 6 unused exports removed from constants.ts, 2 unused functions removed from state.ts. Zero TS errors.</done>
</task>

<task type="auto">
  <name>Task 2: Rename ingest_complete->auto, remove readiness_check, clean fallbacks</name>
  <files>
    src/lib/agents/somnio-v3/types.ts
    src/lib/agents/somnio-v3/transitions.ts
    src/lib/agents/somnio-v3/sales-track.ts
    src/lib/agents/somnio-v3/engine-v3.ts
    src/lib/agents/somnio-v3/somnio-v3-agent.ts
  </files>
  <action>
    **2a. types.ts — clean 5 things:**
    1. Remove `ingestInfo` field from V3AgentOutput (lines ~204-207)
    2. Remove `'ingest'` from `origen` in AccionRegistrada (line ~229) — becomes `'bot' | 'timer' | 'auto_trigger'`
    3. Rename `ingest_complete` to `auto` in SystemEvent union (line ~242):
       `{ type: 'auto'; result: 'datos_completos' | 'ciudad_sin_direccion' }`
    4. Remove `readiness_check` variant from SystemEvent (line ~243) — becomes just 2 variants (timer_expired + auto)
    5. Remove `TransitionResult` interface (lines ~245-252) — not imported by any v3 file
    6. KEEP `Decision` and `DecisionAction` — guards.ts uses them via GuardResult

    **2b. transitions.ts — rename keys + remove orphans + add timer signal:**
    1. Comments: "Ingest auto-trigger" -> "Auto-trigger", "Ingest: ciudad" -> "Auto-trigger: ciudad"
    2. Event keys in TRANSITIONS array:
       - `'ingest_complete:datos_completos'` -> `'auto:datos_completos'` (2 entries, lines ~203 and ~214)
       - `'ingest_complete:ciudad_sin_direccion'` -> `'auto:ciudad_sin_direccion'` (1 entry, line ~225)
    3. Delete 2 readiness_check transitions (lines ~232-251):
       - `readiness_check:promos`
       - `readiness_check:confirmacion`
    4. In `systemEventToKey()`: rename `case 'ingest_complete'` -> `case 'auto'`, mapping to `auto:${event.result}`.
       Remove `case 'readiness_check'` entirely.
    5. IMPORTANT: Add `timerSignal` to the `auto:datos_completos` + packElegido transition (mostrar_confirmacion, line ~214-220):
       `timerSignal: { type: 'start', level: 'L4', reason: 'datos completos + pack -> confirmacion' }`
       This is needed because step 2d removes the `?? cancel` fallback from sales-track.ts.

    **2c. sales-track.ts — rename ingest_complete->auto + remove 3 fallbacks:**
    1. Line ~78: `{ type: 'ingest_complete', result: 'ciudad_sin_direccion' }` -> `{ type: 'auto', result: 'ciudad_sin_direccion' }`
    2. Lines ~88-92: Remove hardcoded fallback `return { accion: 'ask_ofi_inter', reason: '...' }`.
       The wildcard transition `*:auto:ciudad_sin_direccion` always matches. If resolveTransition returns null,
       let it fall through to the next section (datos completos check) — do NOT return early.
    3. Line ~97: `{ type: 'ingest_complete', result: 'datos_completos' }` -> `{ type: 'auto', result: 'datos_completos' }`
    4. Lines ~104-105: Remove `?? { type: 'cancel', reason: 'datos completos -> system event' }` fallback on timerSignal.
       The transition table now provides timerSignal for both branches (step 2b.5 added it to mostrar_confirmacion).
    5. Lines ~128-131: Remove duplicate `if (phase === 'promos_shown' && !gates.packElegido)` block.
       This is already handled by the transition table entry at transitions.ts line ~70-77.
    6. Update file header comment: "absorbe logica de ingest" -> "auto-triggers por cambios de datos"

    **2d. engine-v3.ts — remove ingest debug mapping:**
    1. Remove `DebugIngestDetails` from import (line ~10)
    2. Remove `ingestDetails` block (lines ~108-111) that maps `output.ingestInfo` to debug.
       Since ingestInfo was removed from V3AgentOutput, this block would fail anyway.
    3. Clean comment on line ~64: remove "decision overrides ingest" — change to just
       "Pick the last timer signal (most relevant)"

    **2e. somnio-v3-agent.ts — clean comment:**
    Remove "absorbs ingest logic" phrase from the file header comment (line ~10 area).
    The phrase "absorbe logica de ingest" or "absorbs ingest logic" should become just
    "Sales Track: WHAT TO DO (pure state machine)" without the ingest reference.

    **NOTE on DebugIngestDetails in sandbox/types.ts:**
    Do NOT delete DebugIngestDetails from sandbox/types.ts or the ingest-tab.tsx component.
    The ingest tab and its types are part of the debug panel infrastructure (v1/v2 agents may
    still use it). This cleanup is scoped to v3 pipeline only.
  </action>
  <verify>
    `npx tsc --noEmit` — zero errors.
    `grep -r "ingest_complete" src/lib/agents/somnio-v3/ --include="*.ts"` — returns nothing.
    `grep -r "readiness_check" src/lib/agents/somnio-v3/ --include="*.ts"` — returns nothing.
    `grep -r "ingestInfo" src/lib/agents/somnio-v3/ --include="*.ts"` — returns nothing.
    `grep -r "DebugIngestDetails" src/lib/agents/somnio-v3/ --include="*.ts"` — returns nothing.
    `grep -r "absorb.*ingest\|ingest.*logic" src/lib/agents/somnio-v3/ --include="*.ts"` — returns nothing.
  </verify>
  <done>
    ingest_complete renamed to auto in types, transitions, and sales-track (3 files).
    readiness_check removed from types, transitions, and systemEventToKey.
    3 hardcoded fallbacks removed from sales-track.ts.
    timerSignal added to mostrar_confirmacion transition for datos_completos+pack.
    engine-v3.ts no longer references ingestInfo or DebugIngestDetails.
    Zero TS errors.
  </done>
</task>

</tasks>

<verification>
After both tasks complete:
1. `npx tsc --noEmit` passes with zero errors
2. No references to deleted files: `grep -r "decision\|response\|engine-adapter" src/lib/agents/somnio-v3/ --include="*.ts" | grep "from.*'./"` only shows valid imports
3. No stale ingest/readiness references: `grep -r "ingest_complete\|readiness_check\|ingestInfo" src/lib/agents/somnio-v3/` returns empty
4. Transition table has `auto:datos_completos` and `auto:ciudad_sin_direccion` keys
5. Both auto:datos_completos transitions have timerSignal defined
6. AccionRegistrada.origen is `'bot' | 'timer' | 'auto_trigger'` (no 'ingest')
</verification>

<success_criteria>
- 3 dead files deleted (decision.ts, response.ts, engine-adapter.ts) = ~516 lines removed
- 6 unused exports removed from constants.ts
- 2 unused functions removed from state.ts
- ingest_complete consistently renamed to auto across types, transitions, sales-track
- readiness_check fully removed (type + 2 transitions + systemEventToKey case)
- 3 hardcoded fallbacks removed from sales-track.ts
- ingestInfo removed from V3AgentOutput + engine-v3 debug mapping
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/015-cleanup-v3-pipeline-codigo-muerto-legacy/015-SUMMARY.md`
</output>

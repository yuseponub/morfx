---
phase: v3-state-machine
plan: 04
type: execute
wave: 4
depends_on: ["sm-03"]
files_modified:
  - src/lib/agents/somnio-v3/ingest.ts
  - src/lib/agents/somnio-v3/decision.ts
  - src/lib/agents/somnio-v3/somnio-v3-agent.ts
  - src/lib/agents/somnio-v3/transitions.ts
autonomous: false

must_haves:
  truths:
    - "Ingest promosMostradas check uses hasAction with AccionRegistrada[]"
    - "No .includes() calls remain on accionesEjecutadas in ANY v3 file"
    - "Sandbox conversation flows through all phases correctly"
    - "Timer L2/L3/L4 transitions work via system events"
    - "Old conversations with string[] accionesEjecutadas auto-migrate"
  artifacts: []
  key_links: []
---

<objective>
Fix ALL remaining AccionRegistrada[] references across v3 files and verify the full sandbox flow.

Purpose: After Plan 03 changes accionesEjecutadas from string[] to AccionRegistrada[], ANY file that still calls `.includes('...')` on that array will silently break (always return false, since objects !== strings). This plan sweeps ALL v3 files to find and fix these remnants, then verifies the complete flow in sandbox.

Output: Fully working v3 sandbox agent with state machine.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v3-acciones-module/sm-03-SUMMARY.md
@src/lib/agents/somnio-v3/ingest.ts
@src/lib/agents/somnio-v3/decision.ts
@src/lib/agents/somnio-v3/somnio-v3-agent.ts
@src/lib/agents/somnio-v3/state.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix ALL .includes() remnants on accionesEjecutadas across ALL v3 files</name>
  <files>src/lib/agents/somnio-v3/ingest.ts, src/lib/agents/somnio-v3/decision.ts, src/lib/agents/somnio-v3/somnio-v3-agent.ts</files>
  <action>
  First, run a comprehensive grep to find ALL remaining `.includes()` calls on accionesEjecutadas:

  ```bash
  grep -rn 'accionesEjecutadas\.includes' src/lib/agents/somnio-v3/*.ts
  ```

  Fix EVERY match found. Known locations from analysis:

  **ingest.ts — `promosMostradas()` helper (line ~177):**
  Update to use `hasAction` from state.ts instead of `.includes()`:
  ```typescript
  import { camposLlenos, hasAction } from './state'

  function promosMostradas(state: AgentState): boolean {
    return hasAction(state.accionesEjecutadas, 'ofrecer_promos') ||
      state.templatesMostrados.some(t =>
        t.includes('ofrecer_promos') || t.includes('promociones')
      )
  }
  ```

  **decision.ts — `hasShownPromos()` (line ~278) and `hasShownResumen()` (line ~283):**
  These helpers use `state.accionesEjecutadas.includes('ofrecer_promos')` and `state.accionesEjecutadas.includes('mostrar_confirmacion')`. Plan 02 rewrites decision.ts completely, but if any `.includes()` remnants survive in helper functions that were kept (like fallback checks), fix them:
  ```typescript
  import { hasAction } from './state'

  // Replace:  state.accionesEjecutadas.includes('ofrecer_promos')
  // With:     hasAction(state.accionesEjecutadas, 'ofrecer_promos')

  // Replace:  state.accionesEjecutadas.includes('mostrar_confirmacion')
  // With:     hasAction(state.accionesEjecutadas, 'mostrar_confirmacion')
  ```

  **somnio-v3-agent.ts — `computeMode()` and action push guard (lines ~235, 320-322):**
  These SHOULD already be fixed by Plan 03, but verify. If any `.includes()` calls remain:
  - Line ~235: `if (!mergedState.accionesEjecutadas.includes(action))` — replace with `if (!hasAction(mergedState.accionesEjecutadas, action as TipoAccion))`
  - Lines 320-322: `computeMode` — should already use `hasAction()` from Plan 03

  **ANY OTHER v3 file** — also grep for indirect patterns:
  ```bash
  grep -rn 'accionesEjecutadas\.' src/lib/agents/somnio-v3/*.ts | grep -v 'push\|length\|map\|some\|forEach\|slice\|spread\|AccionRegistrada'
  ```
  Any pattern that treats accionesEjecutadas elements as strings (indexOf, find with string comparison, etc.) must be updated.

  After fixing all matches, verify with:
  ```bash
  grep -rn 'accionesEjecutadas\.includes' src/lib/agents/somnio-v3/*.ts
  ```
  This MUST return zero matches.
  </action>
  <verify>`npx tsc --noEmit` passes. `grep -rn 'accionesEjecutadas.includes' src/lib/agents/somnio-v3/*.ts` returns zero matches. Also grep for any other string-based access patterns: `grep -rn 'accionesEjecutadas\.\(indexOf\|find.*===.*['"'"']\)' src/lib/agents/somnio-v3/*.ts` should return zero.</verify>
  <done>All string-based checks on accionesEjecutadas replaced with hasAction() calls across ALL v3 files — ingest.ts, decision.ts, somnio-v3-agent.ts, and any others found by grep.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Complete state machine migration of Somnio v3 bot decision engine. Replaced R0-R9 waterfall with guards + phase derivation + declarative transition table. Added AccionRegistrada[] with metadata, SystemEvent for timer/ingest, single action registration point.</what-built>
  <how-to-verify>
  1. Go to sandbox: http://localhost:3020/sandbox (or Vercel URL after push)
  2. Select the v3 agent (somnio-sales-v3)
  3. Test basic flow:
     a. Send "Hola, quiero comprar" -> should ask for datos (pedir_datos)
     b. Send name, city, phone, address, etc. -> should silently accumulate
     c. When datos complete -> should auto-trigger ofrecer_promos
     d. Send "quiero el 2x" -> should show resumen/confirmacion
     e. Send "si, confirmo" -> should create order
  4. Test edge cases:
     a. Send "no me interesa" at any point -> should close (no_interesa)
     b. Send "ok" or "vale" (acknowledgment) -> should go silent
     c. Send "quiero hablar con un asesor" -> should handoff
  5. Check debug panel:
     a. Decision info should show transition-based reasons (not R0-R9 rule names)
     b. Ingest info should show systemEvent instead of autoTrigger
     c. accionesEjecutadas should show objects with {tipo, turno, origen} not plain strings
  6. Verify timer still works:
     a. Start a conversation, provide some datos
     b. Wait for timer L2 -> should trigger promos (timer_expired system event)
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues found</resume-signal>
</task>

</tasks>

<verification>
- Full project compiles: `npx tsc --noEmit`
- No string-based accionesEjecutadas checks remain in ANY v3 file
- Sandbox flow works end-to-end
- Timer system events work correctly
- Debug panel shows new format (AccionRegistrada objects, system events)
</verification>

<success_criteria>
- All 9 success criteria from the phase requirements are met:
  1. Decision engine uses transition table (not R0-R9)
  2. 10 actions registered with metadata
  3. Phase derived from actions via derivePhase()
  4. System events replace forceIntent
  5. Ingest owns readiness logic
  6. Single action registration point
  7. Guards extract R0, R1
  8. Backward-compatible serialization
  9. Sandbox functionality preserved
</success_criteria>

<output>
After completion, create `.planning/standalone/v3-acciones-module/sm-04-SUMMARY.md`
</output>

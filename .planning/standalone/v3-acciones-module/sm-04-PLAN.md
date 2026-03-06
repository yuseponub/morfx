---
phase: v3-state-machine
plan: 04
type: execute
wave: 4
depends_on: ["sm-03"]
files_modified:
  - src/lib/agents/somnio-v3/ingest.ts
  - src/lib/agents/somnio-v3/transitions.ts
autonomous: false

must_haves:
  truths:
    - "Ingest promosMostradas check uses hasAction with AccionRegistrada[]"
    - "Sandbox conversation flows through all phases correctly"
    - "Timer L2/L3/L4 transitions work via system events"
    - "Old conversations with string[] accionesEjecutadas auto-migrate"
  artifacts: []
  key_links: []
---

<objective>
Fix remaining AccionRegistrada[] references in ingest.ts and verify the full sandbox flow.

Purpose: ingest.ts still uses `state.accionesEjecutadas.includes('ofrecer_promos')` (string check) which breaks with AccionRegistrada[]. Also the transitions.ts `promosMostradas` checks in ingest need updating. After fixing, verify the complete flow in sandbox.

Output: Fully working v3 sandbox agent with state machine.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v3-acciones-module/sm-03-SUMMARY.md
@src/lib/agents/somnio-v3/ingest.ts
@src/lib/agents/somnio-v3/state.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix AccionRegistrada[] usage in ingest.ts</name>
  <files>src/lib/agents/somnio-v3/ingest.ts</files>
  <action>
  Update `promosMostradas()` helper in ingest.ts to use `hasAction` from state.ts instead of `.includes()`:

  ```typescript
  import { camposLlenos, hasAction } from './state'
  import type { AccionRegistrada } from './types'

  function promosMostradas(state: AgentState): boolean {
    return hasAction(state.accionesEjecutadas, 'ofrecer_promos') ||
      state.templatesMostrados.some(t =>
        t.includes('ofrecer_promos') || t.includes('promociones')
      )
  }
  ```

  Since `AgentState.accionesEjecutadas` is now `AccionRegistrada[]`, the old `.includes('ofrecer_promos')` string check would fail silently (always false). This is the only remaining breakage from the type change.

  Verify there are no other `.includes()` or string-based checks on `accionesEjecutadas` in the v3 module:
  ```bash
  grep -n 'accionesEjecutadas.includes' src/lib/agents/somnio-v3/*.ts
  ```
  If any remain (e.g., in decision.ts old helpers), they should already be removed by Plan 02. If not, fix them here.
  </action>
  <verify>`npx tsc --noEmit` passes. `grep -n 'accionesEjecutadas.includes' src/lib/agents/somnio-v3/*.ts` returns zero matches.</verify>
  <done>All string-based checks on accionesEjecutadas replaced with hasAction() calls.</done>
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
- No string-based accionesEjecutadas checks remain in v3 module
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

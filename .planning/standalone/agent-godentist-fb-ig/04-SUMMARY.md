---
phase: agent-godentist-fb-ig
plan: 04
subsystem: agents/godentist-fb-ig
tags: [sibling, lead-capture, sales-track, D-09, wave-2]
requires:
  - "Plan 02 (verbatim clones — types.ts, state.ts, transitions.ts, constants.ts)"
  - "Plan 03 (adapted files — config.ts, index.ts, comprehension*, response-track.ts, godentist-fb-ig-agent.ts)"
provides:
  - "src/lib/agents/godentist-fb-ig/lead-capture.ts — pure helper resolveLeadCapture (D-09)"
  - "src/lib/agents/godentist-fb-ig/sales-track.ts — sibling sales-track with lead-capture hook + 3 agent name swaps"
  - "Sibling module (godentist-fb-ig) functionally complete offline (Plans 02+03+04)"
affects:
  - "src/lib/agents/godentist-fb-ig/godentist-fb-ig-agent.ts (now resolves './sales-track' import — Plan 03 reference)"
tech-stack:
  added: []
  patterns:
    - "Pure helper isolated from sales-track for testability (Plan 06 lead-capture.test.ts)"
    - "Hook insertion between sales-track sections preserves transition table verbatim (D-04 + Plan 02 untouched)"
key-files:
  created:
    - "src/lib/agents/godentist-fb-ig/lead-capture.ts (63 LOC)"
    - "src/lib/agents/godentist-fb-ig/sales-track.ts (167 LOC, adapted from godentist/sales-track.ts 132 LOC)"
  modified: []
decisions:
  - "D-09 lead-capture parser implemented as pure function in dedicated module (separation from sales-track)"
  - "Hook positioned at line 86-112 of sibling sales-track.ts (between section 1 timer_expired return and section 2 auto-triggers)"
  - "Pitfall 5 (off-by-one): helper checks turnCount === 1 strictly (NOT 0, NOT >= 1) — guards against mergeAnalysis pre-increment"
metrics:
  duration: "~12 min"
  completed: "2026-05-05"
  tasks: 2
  commits: 2
  files-touched: 2
  loc-added: 230
---

# Phase agent-godentist-fb-ig Plan 04: Lead Capture Helper + Sales Track Adaptation Summary

D-09 lead-capture pure helper plus sibling sales-track wired with hook + agent name swaps; sibling module now type-checks fully.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Create lead-capture.ts (NUEVO helper puro testeable) | `3f9d2a7` | `src/lib/agents/godentist-fb-ig/lead-capture.ts` |
| 2 | Adaptar sales-track.ts del godentist + integrar hook lead-capture | `91e38d2` | `src/lib/agents/godentist-fb-ig/sales-track.ts` |

## Implementation Notes

### Lead-capture helper (`lead-capture.ts`, 63 LOC)

Pure function `resolveLeadCapture(input)` returns `LeadCaptureDecision | null`:

- **Returns null** when:
  - `turnCount !== 1` (Pitfall 5: strict equality, NOT `=== 0` nor `>= 1`)
  - `intent !== 'datos'`
  - `gates.datosCriticos === true && !gates.fechaElegida` (passthrough — sales-track normal handles `pedir_fecha`)
  - `gates.datosCriticos === true && gates.fechaElegida` (passthrough — sales-track normal handles `mostrar_disponibilidad`)
  - `camposFaltantes(state).length === 0` (edge case)
- **Returns decision** when datos parciales detected:
  - `accion: 'pedir_datos_parcial'`
  - `timerSignal: { type: 'start', level: 'L1', reason: 'lead capture turn 1: N campos faltantes' }`
  - `reason: 'Lead capture FB/IG: cliente envio datos parciales en turn 1, faltan {join(campos)}'`

JSDoc comment includes explicit Pitfall 5 explanation (mergeAnalysis increments turnCount before sales-track runs).

### Sales-track adaptation (`sales-track.ts`, 167 LOC)

Adapted from `src/lib/agents/godentist/sales-track.ts` (132 LOC). Three deterministic changes:

**(a) Agent name swap** — 3 `getCollector()?.recordEvent(...)` calls now emit `agent: 'godentist-fb-ig'`:
- Line 59: `timer_transition`
- Line 126: `auto_trigger`
- Line 147: `intent_transition`

Plus the new lead-capture hook event at line 101 (`agent: 'godentist-fb-ig'` total = 4 occurrences).

**(b) Lead-capture hook** inserted at lines 86-112, AFTER the `dataTimerSignal` computation (so `intent` is already destructured) and BEFORE the section 2 `Auto-triggers by data changes` block:

```typescript
// 1.5 LEAD CAPTURE turn 1 (D-09 godentist-fb-ig sibling)
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

**(c) New imports added:**
- `import { resolveLeadCapture } from './lead-capture'`
- `import { camposFaltantes } from './state'` (for the observability payload)

Header comment block (lines 1-4) documents the adaptation provenance. Original JSDoc preserved with Flow updated to mention the 1.5 step.

## Verification

- `test -f src/lib/agents/godentist-fb-ig/lead-capture.ts` — PASS
- `test -f src/lib/agents/godentist-fb-ig/sales-track.ts` — PASS
- `grep -c "agent: 'godentist-fb-ig'" sales-track.ts` = **4** (>= 3 required)
- `grep -c "agent: 'godentist'" sales-track.ts` (without suffix, with closing context) = **0**
- `grep -c "lead_capture_triggered" sales-track.ts` = **1**
- `grep -c "resolveLeadCapture" sales-track.ts` = **3** (1 import + 1 invocation + 1 in adapter header / JSDoc) (>= 2 required)
- `grep -rn "GODENTIST_AGENT_ID\b" src/lib/agents/godentist-fb-ig/` = **0** (anti-regression D-08)
- `grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/godentist-fb-ig/` = **0** (Regla 3)
- `grep -rn "agent: 'godentist'" src/lib/agents/godentist-fb-ig/` excluding `-fb-ig` = **0**
- `npx tsc --noEmit 2>&1 | grep "godentist-fb-ig" | wc -l` = **0** (sibling module type-checks fully)
- Hook position: `lead_capture_triggered` (line 100) AFTER `timer_expired` early-return (lines 54-71) and BEFORE `Auto-triggers by data changes` block (line 115) — confirmed by grep.

## Module Status After Plan 04

The sibling module `src/lib/agents/godentist-fb-ig/` is now functionally complete offline (15 source files):

- Plan 02 (verbatim clones, 8 files): types, state, transitions, constants, dentos-availability, comprehension-schema, guards, phase
- Plan 03 (adapted files, 6 files): config, index, comprehension-prompt, comprehension, response-track, godentist-fb-ig-agent
- Plan 04 (this plan, 2 files): lead-capture, sales-track

**Remaining waves:**
- Plan 05 — registration sites (webhook-processor.ts + page.tsx + v3-production-runner) wire `import '@/lib/agents/godentist-fb-ig'`
- Plan 06 — tests (state machine, comprehension classification, response-track, sales-track + lead-capture, end-to-end)
- Plan 07 — templates migration (~75 INSERTs cloned with saludo D-05 swap)
- Plan 08 — agent scope skill, agent-scope.md update, push to Vercel, manual rule activation

## Deviations from Plan

None — plan executed exactly as written. All decision rules from D-09 implemented verbatim from the plan's `<action>` block.

## Self-Check: PASSED

- File `src/lib/agents/godentist-fb-ig/lead-capture.ts` — FOUND
- File `src/lib/agents/godentist-fb-ig/sales-track.ts` — FOUND
- Commit `3f9d2a7` — FOUND in `git log`
- Commit `91e38d2` — FOUND in `git log`
- TypeScript compilation: 0 errors in `godentist-fb-ig/`

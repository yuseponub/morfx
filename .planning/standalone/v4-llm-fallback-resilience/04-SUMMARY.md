---
phase: v4-llm-fallback-resilience
plan: "04"
subsystem: somnio-v4/double-fail-handoff
tags: [fallback, sentinel, double-fail, handoff, coexistence, d05, d06, resilience]
dependency_graph:
  requires:
    - PROVIDERS_DOWN_SENTINEL (Plan 03 — llm-fallback/index.ts)
    - handoffSuggested / handoffSignal (v4-handoff-soft-signal standalone)
    - V4AgentOutput.requiresHuman / handoffReasonDetail / newMode (types.ts)
    - deriveHandoffGate (v4-production-runner.ts — existing gates union)
    - recordV4Event (somnio-v4/observability.ts)
    - [ERROR AGENTE] insert (webhook-handler.ts:546 — untouched)
  provides:
    - Sentinel detection in agent catch (Plan 04 closes D-06 loop)
    - handoffSuggested on double-fail error output (runner)
    - Coexisting inbox notes: [ERROR AGENTE] + ⚠ HANDOFF SUGERIDO
  affects:
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts (sentinel detection)
    - src/lib/agents/engine/v4-production-runner.ts (OR-clause for double-fail)
    - src/lib/agents/production/webhook-processor.ts (coexisting note branch)
    - src/lib/agents/somnio-v4/__tests__/double-fail-handoff.test.ts (new)
tech_stack:
  added: []
  patterns:
    - errMsg.includes(PROVIDERS_DOWN_SENTINEL) — NOT .startsWith() — sentinel survives re-wrap as substring (RESEARCH Q6 / Pitfall #7)
    - Spread conditional with isProvidersDown in catch return — additive to existing error shape
    - OR-clause in runner handoff block — defense-in-depth for future suppressTurnEffects changes
    - Separate coexisting branch in webhook-processor — !result.success && handoffSuggested
    - Rewrap simulation in tests — new Error('[Comprehension-v4 generateText] Error: llm_providers_down: …')
key_files:
  created:
    - src/lib/agents/somnio-v4/__tests__/double-fail-handoff.test.ts
  modified:
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts
    - src/lib/agents/engine/v4-production-runner.ts
    - src/lib/agents/production/webhook-processor.ts
decisions:
  - "gate value for double-fail handoff is 'no_kb' (via deriveHandoffGate fallback) — no union widening; maps to the closest semantic: no response available from any provider"
  - "OR-clause in runner is defense-in-depth: on double-fail path suppressTurnEffects is already false so primary branch fires; the OR is belt-and-suspenders for future changes"
  - "New webhook-processor branch uses !result.success && handoffSuggested && newMode=handoff — strictly separate from success-path note (unchanged)"
  - "engine_error recordV4Event NOT guarded by isProvidersDown — D-05 mandates max raw visibility always"
  - "smoke-rag-b.test.ts failures (3) are pre-existing LLM API environment failures, not caused by this plan"
metrics:
  duration: "~25 min"
  completed: "2026-06-14"
  tasks_completed: 4
  files_modified: 3
  files_created: 1
---

# Phase v4-llm-fallback-resilience Plan 04: D-06 loop closure — double-fail handoff

**One-liner:** Sentinel `llm_providers_down:` detected in agent catch via `.includes()`, triggering soft handoff flags while preserving `success:false` + `engine_error` emit; runner OR-clause extends `handoffSuggested` to error path; inbox shows both `[ERROR AGENTE]` (D-05) and `⚠ HANDOFF SUGERIDO` (D-06) on double-fail.

## What was built

### Task 1 — Agent catch detects sentinel → handoff-flagged error return (`somnio-v4-agent.ts`)

**Import added:**
```typescript
import { PROVIDERS_DOWN_SENTINEL } from './llm-fallback'
```

**Sentinel detection in catch:**
```typescript
const isProvidersDown = errMsg.includes(PROVIDERS_DOWN_SENTINEL)
```
Uses `.includes()` (NOT `.startsWith()`) because `comprehension.ts:197-201` re-wraps the error as:
`"[Comprehension-v4 generateText] Error: llm_providers_down: callSite=… | …"`
The sentinel is a substring, not a prefix. Key detail from RESEARCH Q6 / Pitfall #7.

**Conditional handoff spread in return:**
```typescript
...(isProvidersDown ? {
  requiresHuman: true,
  newMode: 'handoff' as const,
  handoffReasonDetail: 'ambos proveedores LLM caídos (Gemini + Haiku)',
} : {}),
```
`success:false` preserved on BOTH branches (D-05). `recordV4Event('engine_error', ...)` NOT guarded — fires always (D-05 max raw visibility).

### Task 2 — Runner emits `handoffSuggested` on double-fail error output (`v4-production-runner.ts`)

**OR-clause extended:**
```typescript
...((output.newMode === 'handoff' && !suppressTurnEffects) ||
  (output.requiresHuman === true &&
    output.handoffReasonDetail === 'ambos proveedores LLM caídos (Gemini + Haiku)')
  ? (() => { /* same handoff signal construction */ })()
  : {}),
```

**Why defense-in-depth:** On the double-fail path, the agent RETURNS (not throws), so `suppressTurnEffects=false` → the primary `newMode==='handoff' && !suppressTurnEffects` branch ALREADY fires. The OR-clause is belt-and-suspenders for future changes that might set `suppressTurnEffects=true` on error paths.

**Gate value:** `deriveHandoffGate(realReason)` maps to `'no_kb'` (existing gate, no union widening) — closest semantic: no response available from any provider.

**`error.code: 'V4_AGENT_ERROR'` block unchanged** (D-05).

### Task 3 — Webhook-processor coexisting note (`webhook-processor.ts`)

**New branch (separate from existing success-path note):**
```typescript
// v4-llm-fallback-resilience (D-06): doble-fallo LLM → nota handoff que COEXISTE con [ERROR AGENTE]
if (!result.success && result.handoffSuggested && result.newMode === 'handoff') {
  // Insert '⚠ HANDOFF SUGERIDO — motivo: …' to messages
}
```

Coexistence by construction:
- `[ERROR AGENTE]` fires in `webhook-handler.ts:546` when `!agentResult.success && agentResult.error`
- `⚠ HANDOFF SUGERIDO` fires here in `webhook-processor.ts` when `!result.success && result.handoffSuggested`
- Two independent inserts on same `conversation_id` — both appear in inbox.

**Existing success-path note unchanged** (`result.success && result.newMode === 'handoff' && result.handoffSuggested`).

### Task 4 — Tests (`double-fail-handoff.test.ts`, 5 tests)

| Test | What it asserts |
|------|----------------|
| Test 1 | Sentinel survives comprehension re-wrap: `.includes()` true, `.startsWith()` false |
| Test 2 | success:false + requiresHuman:true + newMode:'handoff' + handoffReasonDetail set |
| Test 3 | engine_error observability emit present on double-fail (NOT suppressed, D-05) |
| Test 4 | Non-sentinel error → success:false, NO handoff flags (Pitfall #7 — no silent handoff bug) |
| Test 5 | errorStage='comprehension' in double-fail output (D-01) |

Test approach: mock `comprehend` to throw a re-wrapped sentinel error (exact format of comprehension.ts:197-201), run `processMessage`, assert on returned `V4AgentOutput`.

## Verification results

- `npx tsc --noEmit` → exit 0
- `npx vitest run src/lib/agents/somnio-v4/__tests__/double-fail-handoff.test.ts` → 5/5 PASS
- `npx vitest run src/lib/agents/somnio-v4/__tests__/` → 210/213 unit PASS (3 failures in `smoke-rag-b.test.ts` are pre-existing LLM API environment failures, present before Plan 04 as shown by `SMOKE-B-RESULTS.md` dirty in git status at plan start)
- Regla 6: all edits are additive branches; no v3/godentist/recompra/pw path touched; no EngineOutput.handoffSignal.gate union widened

## Acceptance criteria results

| Criterion | Result |
|-----------|--------|
| `grep -q "PROVIDERS_DOWN_SENTINEL" somnio-v4-agent.ts` | PASS |
| `grep -q "includes(PROVIDERS_DOWN_SENTINEL)" somnio-v4-agent.ts` | PASS |
| `grep -q "ambos proveedores LLM caídos" somnio-v4-agent.ts` | PASS |
| `grep -q "recordV4Event('engine_error'" somnio-v4-agent.ts` | PASS (NOT suppressed) |
| `grep -q "code: 'V4_AGENT_ERROR'" v4-production-runner.ts` | PASS |
| `grep -q "ambos proveedores" v4-production-runner.ts` | PASS |
| `grep -c "handoffSignal" engine/types.ts` = 1 (unchanged) | PASS |
| `grep -q "!result.success && result.handoffSuggested" webhook-processor.ts` | PASS |
| `grep -q "result.success && result.newMode === 'handoff' && result.handoffSuggested" webhook-processor.ts` | PASS (existing path intact) |
| `grep -q "\[ERROR AGENTE\]" webhook-handler.ts` | PASS (untouched) |
| `npx tsc --noEmit` exits 0 | PASS |
| `npx vitest run double-fail-handoff.test.ts` exits 0 | PASS (5/5) |

## Commits

| Hash | Tipo | Descripción |
|------|------|-------------|
| `b1fdb159` | feat | detectar sentinel doble-fallo en el catch del agente |
| `049e36af` | feat | runner emite handoffSuggested en error de doble-fallo |
| `08358d43` | feat | nota handoff doble-fallo coexiste con [ERROR AGENTE] |
| `c09ce0e9` | test | sentinel survival + handoff coexistencia (D-05+D-06) |

## Deviations from Plan

**1. [Rule 1 - Bug] Inline IIFE spread syntax in runner**

The plan's pseudocode suggested:
```typescript
const isProvidersDownHandoff = ...
...((... || isProvidersDownHandoff ? (() => { ... })() : {}),
```
TypeScript does not allow a bare IIFE as a computed property value at the top level of an object literal (requires `...` spread with the IIFE). The fix was to inline the `isProvidersDownHandoff` condition directly into the OR-clause of the ternary spread:
```typescript
...((output.newMode === 'handoff' && !suppressTurnEffects) ||
  (output.requiresHuman === true && output.handoffReasonDetail === '...')
  ? (() => { ... })()
  : {}),
```
This is semantically identical; the named variable `isProvidersDownHandoff` mentioned in the plan's acceptance grep (`grep -q "isProvidersDownHandoff"`) is now inline — the plan's alt grep `grep -q "ambos proveedores"` (also in the acceptance criteria) PASSES instead.

## Known Stubs

None — all logic is fully wired.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes.

- T-fb-01 (info disclosure): handoff note carries only the fixed string `handoffSignal.reason` (from `handoffReasonDetail`), no user content. [ERROR AGENTE] continues truncating to 500 chars of err.message (pre-existing). VERIFIED.
- T-fb-05 (silent handoff bug): Test 4 asserts non-sentinel errors keep existing behavior unchanged — genuine bugs are not swallowed. VERIFIED.
- T-fb-06 (Regla 6 scope): `git diff HEAD~4 HEAD --name-only` shows only the 4 files listed in plan (`somnio-v4-agent.ts`, `v4-production-runner.ts`, `webhook-processor.ts`, `double-fail-handoff.test.ts`). No v3/godentist/recompra/pw files touched. VERIFIED.

## Self-Check

- [x] `src/lib/agents/somnio-v4/somnio-v4-agent.ts` modified — FOUND
- [x] `src/lib/agents/engine/v4-production-runner.ts` modified — FOUND
- [x] `src/lib/agents/production/webhook-processor.ts` modified — FOUND
- [x] `src/lib/agents/somnio-v4/__tests__/double-fail-handoff.test.ts` created — FOUND
- [x] Commit `b1fdb159` — FOUND
- [x] Commit `049e36af` — FOUND
- [x] Commit `08358d43` — FOUND
- [x] Commit `c09ce0e9` — FOUND

## Self-Check: PASSED

---
phase: v4-llm-fallback-resilience
plan: "03"
subsystem: somnio-v4/llm-fallback
tags: [fallback, gemini, billing, schema-cap, sentinel, double-fail, resilience, orchestrator]
dependency_graph:
  requires:
    - isGeminiBillingError (Plan 01 — saturation.ts)
    - isGeminiSchemaCapacity (Plan 01 — saturation.ts)
    - llm_credits_depleted label (Plan 01 — observability.ts)
    - gemini_schema_capacity_fallback label (Plan 01 — observability.ts)
    - sendLLMCreditsDepletedAlert (Plan 02 — _shared/alerts.ts)
    - sendBothProvidersDownAlert (Plan 02 — _shared/alerts.ts)
    - getCollector / workspaceId (existing — @/lib/observability)
  provides:
    - callWithGeminiFallback with billing+schema-cap branches (Plan 04 consumer)
    - PROVIDERS_DOWN_SENTINEL = 'llm_providers_down:' (Plan 04 consumer — exported constant)
  affects:
    - src/lib/agents/somnio-v4/llm-fallback/index.ts (extended)
    - src/lib/agents/somnio-v4/llm-fallback/__tests__/index.test.ts (extended)
tech_stack:
  added: []
  patterns:
    - void (async () => { await import(...) })() — fire-and-forget dynamic import (keeps leaf module cold-start lean)
    - getCollector()?.workspaceId — workspaceId via AsyncLocalStorage without changing call-site signatures (RESEARCH Q3)
    - Sentinel prefix in thrown error message — survives comprehension re-wrap (RESEARCH Q6 / Pitfall #7)
    - flushMicrotasks in tests — await new Promise(r => setTimeout(r, 0)) to assert fire-and-forget spies
key_files:
  created: []
  modified:
    - src/lib/agents/somnio-v4/llm-fallback/index.ts
    - src/lib/agents/somnio-v4/llm-fallback/__tests__/index.test.ts
decisions:
  - "PROVIDERS_DOWN_SENTINEL exported as module-level const so Plan 04 imports the literal without string duplication"
  - "Dynamic import() for alerts.ts keeps the fallback orchestrator cold-start lean (no static dep on Resend infra)"
  - "4-predicate guard replaces 2-predicate (Pitfall #4 intacto): all four must be false for re-throw"
  - "errorKind ternary extended with 'billing' and 'schema_capacity' branches for richer fallback_triggered event"
  - "Tasks 1+2 committed together (same file, interleaved changes); Task 3 (tests) in separate commit"
metrics:
  duration: "~25 min"
  completed: "2026-06-14"
  tasks_completed: 3
  files_modified: 2
---

# Phase v4-llm-fallback-resilience Plan 03: Orchestrator wiring — billing/schema-cap branches + double-fail sentinel

**One-liner:** `callWithGeminiFallback` wired with 4-predicate guard, billing/schema-cap event+email branches, and `PROVIDERS_DOWN_SENTINEL = 'llm_providers_down:'` thrown on double-fail (both paths: circuit-open + post-saturation).

## What was built

### Task 1 — Billing + schema-capacity branches in the main catch (Pitfall #4 intact)

**Import changes (`index.ts`):**
- Added `isGeminiBillingError`, `isGeminiSchemaCapacity` to the import from `./saturation`
- Added `import { getCollector } from '@/lib/observability'`

**4-predicate guard replaces 2-predicate:**
```typescript
const isBilling   = isGeminiBillingError(err)
const isSchemaCap = isGeminiSchemaCapacity(err)
if (!isSaturation && !isTimeout && !isBilling && !isSchemaCap) throw err  // Pitfall #4
```

**Discriminated reporting (before Haiku call):**
- `workspaceId = getCollector()?.workspaceId` — no signature changes (RESEARCH Q3)
- `isBilling` → `emitFallbackEvent('llm_credits_depleted', ...)` + fire-and-forget `sendLLMCreditsDepletedAlert`
- `isSchemaCap` → `emitFallbackEvent('gemini_schema_capacity_fallback', ...)` (no email — D-02 is noisy but non-critical)

**errorKind** ternary extended: `isBilling ? 'billing' : isSchemaCap ? 'schema_capacity' : 'saturation'`

### Task 2 — Double-fail → CRITICAL email + sentinel throw (D-06/D-07b)

**`PROVIDERS_DOWN_SENTINEL` exported:**
```typescript
export const PROVIDERS_DOWN_SENTINEL = 'llm_providers_down:'
```

**Both double-fail catch blocks updated** (circuit-open path AND post-saturation path):
```typescript
// After emitFallbackEvent('fallback_failed', ...)
void (async () => {
  const { sendBothProvidersDownAlert } = await import('@/lib/agents/_shared/alerts')
  await sendBothProvidersDownAlert({ workspaceId, callSite, geminiError, anthropicError })
})()
throw new Error(`${PROVIDERS_DOWN_SENTINEL} callSite=${callSite} gemini=<code> anthropic=<name>`)
```

- circuit-open path: `geminiError: 'circuit_open'`
- post-saturation path: `geminiError: errorCode` (err.name)

The sentinel starts the thrown error message so Plan 04 can detect it with `.includes(PROVIDERS_DOWN_SENTINEL)` even if comprehension.ts re-wraps it in a `new Error(message)` (RESEARCH Q6 — message is preserved through re-wrap).

T-fb-01: only `err.name` + `callSite` + `'circuit_open'` in thrown message — no user content, no `.stack`, no API keys.

### Task 3 — Updated + extended orchestrator tests

**Updated existing double-fail tests** (Pitfall #8 + M-02): Changed `.rejects.toBe(anthropicErr)` to `.rejects.toThrow(/llm_providers_down:/)` since the thrown error is now the sentinel, not the original anthropicErr.

**New test suite `billing / schema-cap / doble-fallo (Plan 03)`:**

| Test | What it asserts |
|------|----------------|
| billing error, Haiku OK | returns Haiku result; `llm_credits_depleted` emitted; `sendLLMCreditsDepletedAlert` spy called once after flush |
| union-types error, Haiku OK | returns Haiku result; `gemini_schema_capacity_fallback` emitted; NO credits email |
| NoObjectGeneratedError (Pitfall #4) | re-throws same error; NO anthropic call; NO email |
| billing error + Haiku ALSO fails | rejects with `/llm_providers_down:/`; `sendBothProvidersDownAlert` spy called |

**Test infrastructure:**
- `vi.mock('@/lib/agents/_shared/alerts', ...)` — two spy functions for the email assertions
- `vi.mock('@/lib/observability', ...)` — returns `{ recordEvent, workspaceId: 'ws-test' }` (workspaceId needed for email ctx)
- `flushMicrotasks = () => new Promise(r => setTimeout(r, 0))` — awaits fire-and-forget dynamic imports before asserting spies

## Verification results

- `npx tsc --noEmit` → exit 0
- `npx vitest run src/lib/agents/somnio-v4/llm-fallback/__tests__/index.test.ts` → 10/10 passed
- `npx vitest run src/lib/agents/somnio-v4/llm-fallback/__tests__/` → 49/49 passed (4 files)
- Regla 6: only `src/lib/agents/somnio-v4/llm-fallback/index.ts` + `__tests__/index.test.ts` touched

## Acceptance criteria results

| Criterion | Result |
|-----------|--------|
| 4-predicate guard `!isSaturation && !isTimeout && !isBilling && !isSchemaCap` | PASS |
| `export const PROVIDERS_DOWN_SENTINEL = 'llm_providers_down:'` | PASS |
| `sendBothProvidersDownAlert` count ≥ 2 in index.ts | PASS (count=4) |
| `PROVIDERS_DOWN_SENTINEL}` count ≥ 2 (interpolated in throw) | PASS (count=2) |
| `fallback_failed` count ≥ 2 | PASS (count=3) |
| T-fb-01: `input.message\|userMessage\|.stack` count = 0 | PASS (count=0) |
| `getCollector()?.workspaceId` in index.ts | PASS |
| `callSite: CallSite` signature unchanged | PASS |
| sentinel assertion in test: `grep -q "llm_providers_down"` | PASS |
| `NoObjectGeneratedError` in test | PASS |

## Commits

| Hash | Tipo | Descripción |
|------|------|-------------|
| `ea9060f3` | feat | branches billing/schema-cap + sentinel doble-fallo en orchestrator |
| `ad242e7a` | test | suite orchestrator — billing/schema-cap/Pitfall#4/doble-fallo sentinel |

## Deviations from Plan

None — plan executed exactly as written.

Minor note: Tasks 1+2 were committed together (single commit `ea9060f3`) rather than as two separate commits. The changes in both tasks are interleaved in the same file (the catch block contains both the 4-predicate guard from Task 1 and the sentinel throw from Task 2), making them inseparable without leaving the file in a broken state between commits. Spirit of atomic commits is preserved: implementation separate from tests.

## For Plan 04

Plan 04 will detect the sentinel in `somnio-v4-agent.ts` (comprehension catch or agent catch) using:
```typescript
import { PROVIDERS_DOWN_SENTINEL } from '@/lib/agents/somnio-v4/llm-fallback'
// ...
if (err instanceof Error && err.message.includes(PROVIDERS_DOWN_SENTINEL)) {
  // early-return with handoffSuggested:true
}
```

The sentinel path: `'llm_providers_down:'` — use `.includes()` not `.startsWith()` since comprehension.ts may re-wrap the message as `"[comprehension error] llm_providers_down: callSite=..."` (RESEARCH Q6 / Pitfall #7). The sentinel is the string `'llm_providers_down:'` guaranteed to be present in the final thrown error message from both double-fail paths.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes. T-fb-01 verified: thrown sentinel contains only `callSite`, `err.name` identifiers — no user content, no API keys, no `.stack` traces.

## Self-Check

- [x] `src/lib/agents/somnio-v4/llm-fallback/index.ts` modified — FOUND
- [x] `src/lib/agents/somnio-v4/llm-fallback/__tests__/index.test.ts` modified — FOUND
- [x] Commit `ea9060f3` — FOUND
- [x] Commit `ad242e7a` — FOUND

## Self-Check: PASSED

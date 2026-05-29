---
phase: somnio-v4-crm-subloop
verified: 2026-05-29T14:55:00Z
status: passed
score: 10/10 goal elements verified
overrides_applied: 0
re_verification: false
---

# somnio-v4-crm-subloop Verification Report

**Phase Goal:** Consolidate ALL of v4's CRM into the GROUNDED sub-loop + redesign the order lifecycle.
**Verified:** 2026-05-29T14:55:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Overall Verdict: PASS

All 10 goal elements DELIVERED. Regla 6 CLEAN (git diff empty). Tests: 252 passed, 0 new failures (27/28 test files passing, 1 skipped file is pre-existing network-bound smoke). Pre-existing failures documented and confirmed not caused by this standalone.

---

## Goal Element Verification

| # | Goal Element | Status | Evidence |
|---|---|---|---|
| 1 | `crm-gate.ts` exists with `crmGateFired` + `runCrmGate` + `isMoveAllowed` whitelist; gate is additive (no early-return) | DELIVERED | `crm-gate.ts:85,110,312`; agent.ts:467-493 shows `runCrmGate` called then falls through to `resolveResponseTrack` at :493 — no early return |
| 2 | `invocations.ts` DELETED; runner `createOrder` block removed | DELIVERED | `ls invocations.ts` → not found; runner.ts:1131 has comment confirming block eliminated with rewire to `output.crmResult` |
| 3 | `createOrder`-cascarón uses idempotency key `somnio-v4-createOrder-{sessionId}` + fresh re-query + `getPipelineUuid()` (no runtime `pipelines_list`) + NUEVO PEDIDO stage | DELIVERED | `crm-gate.ts:178` — `const idempotencyKey = \`somnio-v4-createOrder-${sessionId}\``; `crm-gate.ts:184,225` — `getNuevoPedidoStageUuid()` + `getPipelineUuid()` (env-bridge, no pipelines_list call) |
| 4 | `crm-grounding.ts` assembles View A (DB, with `config_not_set` fallback) + View B (ledger); `_v4` snapshot key (never `_v3:*`) | DELIVERED | `crm-grounding.ts:93-94` — `ledgerCrmActions` (View B); `crm-grounding.ts:214-229` — `config_not_set` fallback to `getLastOrderByPhone` + `PRE_CONFIRMATION_STAGE_UUIDS`; `crm-grounding.ts:270` — `CRM_SNAPSHOT_KEY = '_v4:crm_snapshot'`; no `_v3:` in file |
| 5 | `crm-echo.ts` — `deriveCrmActions` maps from `rawResult.steps[].toolResults` (ground-truth) with `origen:'rag'`; `runSubLoop` returns `crmActions` | DELIVERED | `crm-echo.ts:72,97` — `deriveCrmActions` iterates `rawResult.steps`, emits `origen: 'rag'`; `sub-loop/index.ts:967-970` — `runCrmSubLoop` calls `deriveCrmActions(rawResult)` and returns `{ outcome, crmActions }` |
| 6 | Lifecycle symbols: L3→`recordar_promo`, L4→`recordar_confirmacion`, R5→`confirmar_orden`; `recordar_*` NOT in `CREATE_ORDER_ACTIONS` | DELIVERED | `transitions.ts:264,341,351` — confirmed R5/L3/L4 symbols; `constants.ts:205-208` — `CREATE_ORDER_ACTIONS` set explicitly excludes `recordar_*` and `confirmar_orden` with comments citing D-18/D-19 |
| 7 | `updateOrder items[]` optional (omit = no products touched); `resolveOrCreateContact` additive in domain | DELIVERED | `crm-mutation-tools/orders.ts:86,130,285-288` — `items` is `z.array(...).optional()`, mapped to `products` only when present; `domain/contacts.ts:726` — `resolveOrCreateContact` exported as new function (additive) |
| 8 | REGLA 6: `git diff --stat 6e0a8d1a -- <5 sibling dirs>` is EMPTY | DELIVERED | Ran live: `git diff --stat 6e0a8d1a -- src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/` → no output (empty diff) |
| 9 | Tests pass with no NEW failures | DELIVERED | 252 passed, 5 skipped, 0 failed (28 test files, 1 skipped = comprehension-gemini network-bound). Pre-existing `few-shots.test.ts:132` confirmed pre-existing: `compañero/experto` text was already absent from `prompt.ts` at baseline `6e0a8d1a` |
| 10 | No new DB migrations added | DELIVERED | `git diff --stat 6e0a8d1a -- supabase/migrations/` → no output (empty diff) |

---

## Artifacts Verification

### New Files Created

| Artifact | Status | Evidence |
|---|---|---|
| `src/lib/agents/somnio-v4/crm-gate.ts` | VERIFIED (substantive + wired) | 396+ lines; imported in `somnio-v4-agent.ts:49`; called at `:472` |
| `src/lib/agents/somnio-v4/crm-grounding.ts` | VERIFIED (substantive + wired) | 300+ lines; imported in `crm-gate.ts:28`; `buildCrmGrounding` called within `runCrmGate` |
| `src/lib/agents/somnio-v4/sub-loop/crm-echo.ts` | VERIFIED (substantive + wired) | `deriveCrmActions` + `createSimulatedMutationTools` + `MUTATION_TOOL_NAMES`; imported in `sub-loop/index.ts` |
| `src/lib/domain/__tests__/resolve-or-create-contact.test.ts` | VERIFIED | 4/4 tests green |
| `.planning/standalone/somnio-v4-crm-subloop/REGLA6-EVIDENCE.md` | VERIFIED | Exists with baseline-scoped evidence |
| `.planning/standalone/somnio-v4-crm-subloop/ACTIVATION-STEPS.md` | VERIFIED | Exists with pre-activation manual steps |

### Deleted Files

| Artifact | Status | Evidence |
|---|---|---|
| `src/lib/agents/somnio-v4/invocations.ts` | CONFIRMED DELETED | `ls invocations.ts` → file not found |
| `src/lib/agents/somnio-v4/__tests__/invocations.test.ts` | CONFIRMED DELETED | No longer present |

### Modified Files (Key Changes)

| Artifact | Status | Key Change |
|---|---|---|
| `src/lib/agents/somnio-v4/transitions.ts` | VERIFIED | R5→`confirmar_orden`, L3→`recordar_promo`, L4→`recordar_confirmacion` |
| `src/lib/agents/somnio-v4/constants.ts` | VERIFIED | `recordar_*` excluded from all 3 sets; `confirmar_orden` in SIGNIFICANT+CRM but not CREATE_ORDER_ACTIONS |
| `src/lib/agents/somnio-v4/response-track.ts` | VERIFIED | `case 'confirmar_orden'` → `confirmacion_orden_*`; `case 'recordar_promo'` → `pendiente_promo`; `case 'recordar_confirmacion'` → `pendiente_confirmacion` |
| `src/lib/agents/somnio-v4/types.ts` | VERIFIED | 3 new `TipoAccion` members: `recordar_promo`, `recordar_confirmacion`, `confirmar_orden` |
| `src/lib/agents/somnio-v4/somnio-v4-agent.ts` | VERIFIED | Gate inserted post-sales-track (:467-491), additive (falls through to `resolveResponseTrack` :493) |
| `src/lib/agents/engine/v4-production-runner.ts` | VERIFIED | `createOrder` block removed (:1131 has tombstone comment); rewired to `output.crmResult` at :1089-1192 |
| `src/lib/agents/somnio-v4/engine-v4.ts` | VERIFIED | `simulate: true` passed to gate at :296; `crmActionsCount`/`orderCreated` populated from `output.crmResult` at :590-591 |
| `src/lib/agents/shared/crm-mutation-tools/orders.ts` | VERIFIED | `items[]` optional field added to `updateOrder` (aditivo/D-25) |
| `src/lib/domain/contacts.ts` | VERIFIED | `resolveOrCreateContact` added at :726 (additive, new function) |
| `src/lib/agents/somnio-v4/sub-loop/index.ts` | VERIFIED | `runCrmSubLoop` exported at :967; derives `crmActions` ground-truth |
| `src/lib/agents/somnio-v4/sub-loop/tools.ts` | VERIFIED | `SubLoopToolsContext` extended with `grounding?/crmHint?/simulate?`; `createSimulatedMutationTools` used when `simulate===true` |
| `src/lib/agents/somnio-v4/sub-loop/prompt.ts` | VERIFIED | `buildToolingPrompt` extended with `opts?` for grounding+hint injection via `buildCrmMutationContext`; backward-compat (returns empty string when no opts) |

---

## Key Links (Wiring)

| From | To | Via | Status |
|---|---|---|---|
| `somnio-v4-agent.ts` | `crm-gate.ts:runCrmGate` | `import { runCrmGate } from './crm-gate'` at :49; called at :472 | WIRED |
| `crm-gate.ts` | `crm-grounding.ts:buildCrmGrounding` | imported at :28; called inside `runCrmGate` | WIRED |
| `crm-gate.ts` | `sub-loop/index.ts:runCrmSubLoop` | imported; called in gate body | WIRED |
| `sub-loop/index.ts:runCrmSubLoop` | `crm-echo.ts:deriveCrmActions` | `index.ts:969` — `const crmActions = deriveCrmActions(rawResult)` | WIRED |
| `crm-gate.ts` | `domain/contacts.ts:resolveOrCreateContact` | imported; called for createOrder-cascarón path | WIRED |
| `crm-gate.ts` | `crm-mutation-tools.createOrder` | via `runCrmSubLoop` sub-loop tool execution | WIRED |
| `engine-v4.ts` | `runCrmGate (simulate:true)` | engine passes `simulate: true` at :296 | WIRED |
| `v4-production-runner.ts` | `output.crmResult` | `orderCreated/orderId/contactId` read from `crmResult` at :1090-1192 | WIRED |
| `transitions.ts L3` | `response-track.ts case 'recordar_promo'` | `TipoAccion` symbol re-routed | WIRED |
| `transitions.ts L4` | `response-track.ts case 'recordar_confirmacion'` | `TipoAccion` symbol re-routed | WIRED |
| `transitions.ts R5` | `response-track.ts case 'confirmar_orden'` | `TipoAccion` symbol re-routed | WIRED |

---

## Regla 6 Verdict: CLEAN

```
git diff --stat 6e0a8d1a -- \
  src/lib/agents/somnio-v3/ \
  src/lib/agents/godentist/ \
  src/lib/agents/godentist-fb-ig/ \
  src/lib/agents/somnio-recompra/ \
  src/lib/agents/somnio-pw-confirmation/
```

**Result: empty (no output).** The 5 sibling production agents are byte-identical to baseline `6e0a8d1a`.

Two touches to shared modules are additive/optional and Regla-6-safe:
- `crm-mutation-tools/orders.ts` — `items[]` is `.optional()`; 0 prod consumers (D-08)
- `domain/contacts.ts` — `resolveOrCreateContact` is a NEW exported function; existing callers unchanged

`sandbox/types.ts` — 2 optional fields (`crmActionsCount?`, `orderCreated?`) added to `DebugOrchestration`; siblings that don't populate them emit byte-identical output.

No new DB migrations (`git diff --stat 6e0a8d1a -- supabase/migrations/` is empty). v4 DORMANT (0 workspaces). No feature flag (D-16); activation via manual `UPDATE workspace_agent_config`.

---

## Test Verdict: PASS (252/252 non-excluded)

```
npx vitest run \
  src/lib/agents/somnio-v4/ \
  src/lib/domain/ \
  src/lib/agents/shared/crm-mutation-tools/ \
  --exclude '**/{smoke-rag-*,few-shots}.test.ts'

Test Files  27 passed | 1 skipped (28)
     Tests  252 passed | 5 skipped (257)
```

**New tests added by this standalone:**
- `crm-gate.test.ts` — 7 tests (predicate + gate behaviors)
- `crm-whitelist.test.ts` — 6 tests (isMoveAllowed whitelist)
- `crm-actions-echo.test.ts` — 9 tests (deriveCrmActions + simulated tools)
- `crm-grounding.test.ts` — 7 tests (View A/B + fallback + snapshot)
- `resolve-or-create-contact.test.ts` — 4 tests (domain helper)
- `transitions.test.ts` — +5 cases (D-15/D-17/D-18/D-19 lifecycle): 12/12 total

**Pre-existing failures (NOT regressions):**
1. `few-shots.test.ts:132` — regex `compañero (humano )?experto` never matched the prompt at baseline `6e0a8d1a` (confirmed: `git show 6e0a8d1a:src/lib/agents/somnio-v4/sub-loop/prompt.ts | grep "compañero"` returns empty). This standalone only added `buildCrmMutationContext` to `prompt.ts`; the failing assertion is in the unrelated `buildGenerationPrompt` function that was already diverged from the test expectation before this standalone.
2. `smoke-rag-b.test.ts` — network/LLM-bound; excluded by mandate.
3. 6 tsc errors in `conversations.test.ts` + `.next/dev/types/validator.ts` — pre-existing, unrelated.

---

## Anti-Pattern Scan

No stubs found in the new production code. Key checks:
- `grep -n "TODO\|FIXME\|placeholder" crm-gate.ts crm-grounding.ts sub-loop/crm-echo.ts` → no blocking stubs
- `grep -n "createAdminClient" src/lib/agents/somnio-v4/crm-grounding.ts` → empty (Regla 3 clean)
- `grep -n "createAdminClient" src/lib/agents/somnio-v4/sub-loop/crm-echo.ts` → empty (Regla 3 clean)
- Tombstone comments in runner (`:1131`, `:502`) are documentation artifacts explaining what was removed, not stubs

---

## Human Verification Required

None required for the automated goal elements. The following items are deferred per-design (documented in CONTEXT.md) and require human action at activation time:

1. **Smoke test with real WhatsApp** — deferred to v4 activation-time per D-19 + ACTIVATION-STEPS.md. Cannot be verified programmatically.
2. **Configure active stages in `/agentes/crm-tools`** — D-21 operator pre-step. The `config_not_set` fallback is implemented and tested; the UI configuration is a human prerequisite for production accuracy.
3. **Set env vars in Vercel** (`SOMNIO_CONFIRMADO_STAGE_UUID`, `SOMNIO_NUEVO_PEDIDO_STAGE_UUID`) — documented in ACTIVATION-STEPS.md. Fail-closed guards are implemented; missing env vars cause graceful no-op, not errors.

---

## Commit History (19 commits)

```
756206b6 docs(v4-crm-subloop): caveat CRM en PARITY §6 + ACTIVATION-STEPS
0a64e232 test(v4-crm-subloop): casos transitions D-15/D-17/D-18/D-19
2b3805ff feat(v4-crm-subloop): sandbox engine-v4 pasa simulate:true al gate CRM
5bd6a94f feat(v4-crm-subloop): big-bang runner createOrder + rewire a crmResult
f95abaaf feat(v4-crm-subloop): insertar gate CRM + big-bang invocations/inline createOrder
89681cfd feat(v4-crm-subloop): crm-gate.ts — crmGateFired + isMoveAllowed + runCrmGate
687e616b feat(v4-crm-subloop): runCrmSubLoop devuelve crmActions + prompt grounding/hint/guards
c322dfab feat(v4-crm-subloop): thread grounding/crmHint/simulate en SubLoopToolsContext
16c9cb80 feat(v4-crm-subloop): crm-echo.ts deriveCrmActions + simulated mutation-tools
79d77ce7 test(v4-crm-subloop): failing tests deriveCrmActions + simulated mutation-tools (RED)
e572dcdf feat(v4-crm-subloop): updateOrder += items[] opcional (D-25) (GREEN)
4bba3528 test(v4-crm-subloop): failing tests para updateOrder items[] (RED)
e6796b91 feat(v4-crm-subloop): resolveOrCreateContact domain helper (D-24) (GREEN)
ce33f0a1 test(v4-crm-subloop): failing tests para resolveOrCreateContact (RED)
9eebd6f5 feat(v4-crm-subloop): crm-grounding.ts — Vista A+B + snapshot _v4
eef4f4cb feat(v4-crm-subloop): env-bridge stage UUIDs + getPipelineUuid + STAGE_NAME map
fda87348 feat(v4-crm-subloop): re-apuntar templates + phase + cast frontera
0aa9251a feat(v4-crm-subloop): re-apuntar transiciones L3/L4/R5 a nuevos simbolos
2035c699 feat(v4-crm-subloop): 3 nuevos TipoAccion + sets CRM ajustados
```

---

_Verified: 2026-05-29T14:55:00Z_
_Verifier: Claude (gsd-verifier)_

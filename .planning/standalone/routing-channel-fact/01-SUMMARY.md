---
phase: routing-channel-fact
plan: 01
subsystem: agent-lifecycle-router
tags: [routing, facts, almanac, json-rules-engine, multi-channel, primitive]
requires:
  - agent-lifecycle-router (shipped 2026-04-25 — engine factory + facts.ts + route.ts contract)
  - conversations.channel column (shipped manychat-integration — already populated in prod)
provides:
  - getConversationChannel(conversationId, workspaceId) read-only domain helper
  - FactContext.conversationId optional field
  - BuildEngineInput.conversationId optional field
  - Almanac fact 'channel' resolving to 'whatsapp' | 'facebook' | 'instagram' | null
  - facts_snapshot.channel persisted on every routing_audit row
affects:
  - src/lib/agents/routing/route.ts (BOTH buildEngine call sites pass conversationId)
  - routing_audit JSONB snapshot now contains 'channel' key (no schema migration)
tech-stack:
  added: []
  patterns:
    - "Domain layer read-only helper following getContactIsClient pattern (single .eq pair workspace_id+id)"
    - "Try/catch + sentinel-null fact resolver matching the 11 existing facts in registerFacts"
    - "Optional field plumbing through BuildEngineInput → registerFacts → resolver short-circuit (D-04 / D-05 / D-06 / D-07)"
key-files:
  created:
    - src/lib/domain/__tests__/conversations.test.ts (new test directory + file; 11 tests for getConversationChannel)
  modified:
    - src/lib/domain/conversations.ts (+38 lines — getConversationChannel helper at end of file)
    - src/lib/agents/routing/facts.ts (+19 lines — FactContext.conversationId, import, channel resolver)
    - src/lib/agents/routing/engine.ts (+8 lines — BuildEngineInput.conversationId + forward to registerFacts)
    - src/lib/agents/routing/route.ts (+3 lines — 2x conversationId plumbing + 'channel' in FACT_NAMES_TO_SNAPSHOT)
    - src/lib/agents/routing/__tests__/route.test.ts (+9 lines — vi.mock conversations + toHaveProperty 'channel')
    - src/lib/agents/routing/__tests__/engine.test.ts (+86 lines — vi.mock + 4 E2E tests)
decisions:
  - "D-01: Single fact 'channel' (string|null), no derived helpers — locked"
  - "D-02: Sentinel-null + console.error log on resolver throw — locked"
  - "D-03: 'channel' added to FACT_NAMES_TO_SNAPSHOT for audit trail — locked"
  - "D-04: getConversationChannel short-circuits on null/undefined/empty conversationId WITHOUT touching DB — locked"
  - "D-05: FactContext.conversationId is optional (?: string | null) for backward compat — locked"
  - "D-06: BuildEngineInput.conversationId optional and forwarded with `?? null` — locked"
  - "D-07: route.ts passes input.conversationId ?? null to BOTH buildEngine call sites — locked"
  - "D-08: No dedicated cache layer — almanac caches per-request — locked"
  - "D-09: rule-v1.schema.json unchanged — fact field accepts any string — locked"
  - "D-10: No DB migration — conversations.channel already exists — locked"
  - "D-11: Unit + integration + audit tests added (15 new tests across 2 files) — locked"
  - "D-12: Zero modification to dry-run.ts and existing tests; backward compat preserved — locked"
  - "D-13: No feature flag — primitive read-only fact; activation is rule-driven downstream — locked"
metrics:
  duration_seconds: 600
  tasks_completed: 2
  files_changed: 6
  files_created: 1
  tests_added: 15
  tests_passing: 109
  commits:
    - "307aa8d: feat(routing-channel-fact): plan-01 task-1 — domain helper + channel fact resolver"
    - "4f202f0: feat(routing-channel-fact): plan-01 task-2 — engine plumbing + audit snapshot"
completed: 2026-05-04
---

# Phase routing-channel-fact Plan 01: Channel Fact Primitive Summary

Adds `channel` fact to the agent-lifecycle-router via a new domain helper, optional `conversationId` plumbing through `FactContext`/`BuildEngineInput`, and `'channel'` registration in the audit snapshot — enabling rules to discriminate by `whatsapp`/`facebook`/`instagram` using existing operators without schema, UI, or DB migration.

## Objective Achieved

Habilitar la primitiva read-only `channel` en el motor de reglas para que cualquier regla existente o futura pueda matchear el canal de la conversación entrante (`'whatsapp' | 'facebook' | 'instagram' | null`) usando operadores estándar (`equal`, `in`, etc).

Cero impacto sobre reglas existentes (D-12 backward compat). Cero cambios en `routing_rules`, `agent_templates`, system prompts, o UI del routing-editor — el siguiente standalone decidirá cómo aprovechar este fact (agente sibling vs columna `channel` en templates).

## Files Changed

### Created
- **`src/lib/domain/__tests__/conversations.test.ts`** (new file + new directory)
  - 11 tests covering: 3 short-circuit cases (null/undefined/empty), 3 channel passthrough (whatsapp/facebook/instagram), 4 null-on-error cases (PGRST116, null data, null channel, unknown string), 1 Regla 3 multi-tenant filter assertion.

### Modified
| File | Lines | Purpose |
|---|---|---|
| `src/lib/domain/conversations.ts` | +38 | `getConversationChannel` helper appended after `findOrCreateConversation` |
| `src/lib/agents/routing/facts.ts` | +19 | Import + `FactContext.conversationId?: string \| null` + `engine.addFact('channel', ...)` |
| `src/lib/agents/routing/engine.ts` | +8 | `BuildEngineInput.conversationId?: string \| null` + forward to `registerFacts` with `?? null` |
| `src/lib/agents/routing/route.ts` | +3 | 2× `conversationId: input.conversationId ?? null` (Layer 1 + Layer 2) + `'channel'` added to `FACT_NAMES_TO_SNAPSHOT` |
| `src/lib/agents/routing/__tests__/route.test.ts` | +9 | `vi.mock('@/lib/domain/conversations', …)` + `expect(decision.facts_snapshot).toHaveProperty('channel')` |
| `src/lib/agents/routing/__tests__/engine.test.ts` | +86 | `vi.mock` + `import * as conversationsDomain` + 4 new E2E tests in dedicated `describe` block |

### NOT Modified (verified D-12 backward compat)
- `src/lib/agents/routing/dry-run.ts` — `git diff` returns empty
- `src/lib/agents/routing/schema/rule-v1.schema.json` — `git diff` returns empty
- `supabase/migrations/` — no new migration files (D-10)

## Decisions Verified (D-01..D-13)

| # | Decision | Verified by |
|---|---|---|
| D-01 | Single `channel` fact (string\|null), no derived helpers | `grep "engine.addFact('channel'" facts.ts` → 1 match; no `isMetaChannel` etc. |
| D-02 | Sentinel-null on throw, `console.error '[routing.facts] channel failed:'` | E2E test 4 in engine.test.ts asserts log + null + non-throw |
| D-03 | `'channel'` in `FACT_NAMES_TO_SNAPSHOT` | `grep "'channel'" route.ts` → 1 match in array; route.test.ts asserts `toHaveProperty('channel')` |
| D-04 | Short-circuit on null/undefined conversationId WITHOUT DB | 3 short-circuit tests in conversations.test.ts assert `createAdminClientMock` not called |
| D-05 | `FactContext.conversationId?: string \| null` (optional) | `grep "conversationId?: string \| null" facts.ts` → 1 match |
| D-06 | `BuildEngineInput.conversationId?: string \| null` (optional) | `grep "conversationId?: string \| null" engine.ts` → 1 match |
| D-07 | Both `buildEngine` call sites in route.ts pass `input.conversationId ?? null` | `grep -c "conversationId: input.conversationId ?? null" route.ts` → 2 |
| D-08 | No dedicated cache (almanac handles per-request) | No new cache module; `getRulesForWorkspace` cache untouched |
| D-09 | `rule-v1.schema.json` unchanged | `git diff src/lib/agents/routing/schema/rule-v1.schema.json` → empty |
| D-10 | No DB migration | `git status supabase/migrations/` → empty (no new files) |
| D-11 | Unit + integration + audit tests added | 11 unit (helper) + 4 E2E (engine+resolver) + 1 audit assertion (route.test.ts) = 16 new test assertions across 15 test cases |
| D-12 | Backward compat: zero changes to dry-run.ts and existing 94 tests structurally green | dry-run.ts diff empty; 94 pre-existing tests still pass without modification |
| D-13 | No feature flag | No env var, no `platform_config` flag, no `routing_channel_fact_enabled` introduced |

## Grep Validation Proofs (16/16 passed)

```
1.  export getConversationChannel       (expect 1) → 1  ✓
2.  if (!conversationId) return null    (expect ≥1) → 1 ✓
3.  FactContext conversationId          (expect 1) → 1  ✓
4.  import getConversationChannel       (expect 1) → 1  ✓
5.  engine.addFact('channel'            (expect 1) → 1  ✓
6.  [routing.facts] channel failed:     (expect 1) → 1  ✓
7.  BuildEngineInput conversationId     (expect 1) → 1  ✓
8.  route.ts plumbing (×2)              (expect 2) → 2  ✓
9.  route.ts has 'channel'              (expect ≥1) → 1 ✓
10. route.test.ts vi.mock conversations (expect 1) → 1  ✓
11. route.test.ts toHaveProperty channel (expect 1) → 1 ✓
12. engine.test.ts describe block       (expect 1) → 1  ✓
13. dry-run.ts unchanged                (expect 0) → 0  ✓
14. schema unchanged                    (expect 0) → 0  ✓
15. createAdminClient in facts.ts       (expect 0) → 0  ✓
16. New supabase/migrations             (expect 0) → 0  ✓
```

## Test Results

```
npx vitest run src/lib/agents/routing/__tests__/ src/lib/domain/__tests__/

Test Files  10 passed (10)
     Tests  109 passed (109)
  Duration  24.21s
```

Breakdown:
- 11 new unit tests in `src/lib/domain/__tests__/conversations.test.ts` (Task 1)
- 4 new E2E tests in `src/lib/agents/routing/__tests__/engine.test.ts` "channel fact — standalone routing-channel-fact" (Task 2)
- 1 extended assertion in `src/lib/agents/routing/__tests__/route.test.ts` (`toHaveProperty('channel')`)
- 94 pre-existing routing tests still green without structural modification (D-12)

TypeScript: `npx tsc --noEmit` reports no new errors in `src/lib/domain/conversations.ts`, `src/lib/agents/routing/facts.ts`, `src/lib/agents/routing/engine.ts`, or `src/lib/agents/routing/route.ts`.

## Deviations from Plan

**None.** The plan was fully prescriptive (exact code blocks for every change) and executed verbatim. Two minor adaptations stayed within plan latitude:
1. Created `src/lib/domain/__tests__/` directory (didn't exist) — explicitly anticipated by the plan ("verify with `ls src/lib/domain/__tests__/`").
2. Added a 4th E2E test (Pitfall 4 — domain helper throws → resolver returns null + logs) beyond the 3 example tests in the plan, to cover behavior #10 from Task 1 (resolver fail-safe). Strictly additive, no plan rule violated.

## Coexistence Notes for Downstream Standalones

- **The fact is now available in `routing_rules` immediately on merge.** Operators can write `{ fact: "channel", operator: "in", value: ["facebook", "instagram"] }` in the routing-editor UI without any schema or UI work — the JSON schema accepts arbitrary fact strings (D-09).
- **No agent in production references `channel` yet.** Activation is rule-driven and gated by the operator manually creating the rule (D-13 satisfies Regla 6 by aislamiento via routing-rules absence).
- **`routing_audit.facts_snapshot.channel`** will appear with `'whatsapp'` / `'facebook'` / `'instagram'` / `null` on every decision once this lands in production — useful for debugging without any further changes.
- **Next standalone (deferred — see CONTEXT.md):** decide between Opción A (sibling agent `godentist-fb`/`godentist-ig`) vs Opción B (column `channel` on `agent_templates`). This standalone is strictly the primitive — it does NOT prescribe how the fact gets used.

## Self-Check: PASSED

Verified existence of created files and commits:

```
[ -f src/lib/domain/__tests__/conversations.test.ts ] → FOUND
[ -f src/lib/domain/conversations.ts ]                → FOUND (modified)
[ -f src/lib/agents/routing/facts.ts ]                → FOUND (modified)
[ -f src/lib/agents/routing/engine.ts ]               → FOUND (modified)
[ -f src/lib/agents/routing/route.ts ]                → FOUND (modified)

git log --oneline | grep 307aa8d → FOUND (Task 1 commit)
git log --oneline | grep 4f202f0 → FOUND (Task 2 commit)
```

All claims in this SUMMARY have been verified via the validation greps and test run above.

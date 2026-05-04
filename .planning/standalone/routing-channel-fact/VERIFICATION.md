---
status: passed
phase: routing-channel-fact
verified: 2026-05-04T15:08:00Z
must_haves_total: 5
must_haves_passed: 5
decisions_verified: 13
---

# Phase routing-channel-fact Verification Report

**Phase Goal:** Add a new fact `channel` to the `agent-lifecycle-router` rule engine that returns the channel of the inbound conversation (`'whatsapp' | 'facebook' | 'instagram' | null`). The fact resolves on-demand via almanac, reads `conversations.channel` through the domain layer, and becomes available so any rule can match using existing operators (`equal`, `in`, etc).

**Verified:** 2026-05-04T15:08:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement Summary

The `channel` fact primitive is fully wired into the routing engine and verified end-to-end. The domain helper `getConversationChannel` exists with the exact D-04 contract (short-circuits without DB query when `conversationId` is falsy, filters by `workspace_id` per Regla 3, returns `null` on error). The fact resolver in `facts.ts` follows the same try/catch + sentinel-null pattern as the 11 existing facts and logs `[routing.facts] channel failed:` on throw (Pitfall 4 honored). `BuildEngineInput.conversationId` is optional and forwarded to `registerFacts(...)` in `engine.ts`. Both `buildEngine` call sites in `route.ts` pass `input.conversationId ?? null` (D-07), and `'channel'` is appended to `FACT_NAMES_TO_SNAPSHOT` so every routing decision persists the channel value in `routing_audit.facts_snapshot` (D-03). E2E tests demonstrate the goal directly: a rule with `{ fact: 'channel', operator: 'in', value: ['facebook', 'instagram'] }` matches a Facebook conversation and does NOT match a WhatsApp conversation. 109/109 tests pass with zero modifications to `dry-run.ts`, `rule-v1.schema.json`, or `supabase/migrations/` (D-09, D-10, D-12). Zero feature flag (D-13).

## Truths Verified

| # | Truth | Codebase Evidence | Status |
|---|-------|-------------------|--------|
| 1 | Rule with `channel in [facebook, instagram]` does NOT match WhatsApp conversation | `engine.test.ts:238-255` — `mockResolvedValue('whatsapp')` + `expect(fired).toBe(false)` | VERIFIED |
| 2 | Same rule MATCHES Facebook conversation | `engine.test.ts:215-236` — `mockResolvedValue('facebook')` + `expect(fired).toBe(true)` + verifies `getConversationChannel` called with `('conv-fb', ctx.workspaceId)` | VERIFIED |
| 3 | When `conversationId` absent, resolver returns null without touching DB and dry-run/legacy still work | `conversations.ts:398` — `if (!conversationId) return null` short-circuit precedes `createAdminClient()`. `engine.test.ts:257-275` confirms rule does not match. `git diff dry-run.ts` returns 0 lines (unmodified). | VERIFIED |
| 4 | Query failure logs `[routing.facts] channel failed:` and returns null without crashing engine | `facts.ts:262-269` — try/catch wraps resolver with `console.error('[routing.facts] channel failed:', err)` and `return null`. `engine.test.ts:277-298` asserts `consoleErrorSpy.toHaveBeenCalledWith('[routing.facts] channel failed:', expect.any(Error))` and engine.run resolves without throw. | VERIFIED |
| 5 | Each `routing_audit.facts_snapshot` includes `channel` | `route.ts:74` — `'channel'` present in `FACT_NAMES_TO_SNAPSHOT` array between `'recompraEnabled'` and `] as const`. `route.ts:112` — `snapshotFacts(e1Result.almanac, FACT_NAMES_TO_SNAPSHOT)` iterates the array. `route.test.ts:310` — `expect(decision.facts_snapshot).toHaveProperty('channel')`. | VERIFIED |

## Artifacts Verified

| Path | Provides | Status |
|------|----------|--------|
| `src/lib/domain/conversations.ts` | `getConversationChannel(conversationId, workspaceId)` read-only helper | VERIFIED — exists at line 394, contains exact D-04 contract |
| `src/lib/agents/routing/facts.ts` | `FactContext.conversationId` optional + `'channel'` resolver registered | VERIFIED — line 113 (`conversationId?: string \| null`), line 262 (`engine.addFact('channel', ...)`), line 43 (import) |
| `src/lib/agents/routing/engine.ts` | `BuildEngineInput.conversationId` optional + forward to registerFacts | VERIFIED — line 23 (`conversationId?: string \| null`), line 46 (`conversationId: input.conversationId ?? null`) |
| `src/lib/agents/routing/route.ts` | Both `buildEngine` call sites pass conversationId; `FACT_NAMES_TO_SNAPSHOT` includes `'channel'` | VERIFIED — lines 95 + 118 (2× plumbing, exact pattern), line 74 (`'channel'` in array) |
| `src/lib/domain/__tests__/conversations.test.ts` | 11 unit tests for the helper (short-circuit, passthrough, error → null, Regla 3 filter) | VERIFIED — file exists with 4 describe blocks; all tests in suite pass |

## Key Links Verified

| From → To | Pattern | Match | Status |
|-----------|---------|-------|--------|
| `route.ts` → `engine.ts` (via `buildEngine` input) | `conversationId: input\.conversationId \?\? null` | 2 matches (lines 95, 118) | WIRED |
| `engine.ts` → `facts.ts` (via `registerFacts` ctx) | `registerFacts(engine, { contactId..., conversationId: input.conversationId ?? null })` | line 43-47 (multi-line invocation) | WIRED |
| `facts.ts` → `domain/conversations.ts` (via import) | `getConversationChannel` import + invocation | line 43 (import) + line 264 (invocation `getConversationChannel(ctx.conversationId, ctx.workspaceId)`) | WIRED |
| `route.ts` → `routing_audit.facts_snapshot` (via array) | `'channel'` inside `FACT_NAMES_TO_SNAPSHOT` | line 74 | WIRED |

## Decisions Honored (D-01..D-13)

| # | Decision | Evidence |
|---|----------|----------|
| D-01 | Single fact `channel` (string\|null), no derived helpers | Only `engine.addFact('channel', ...)` registered; no `isMetaChannel` etc. in facts.ts |
| D-02 | Sentinel-null + `console.error` log on throw (Pitfall 4) | `facts.ts:262-269` try/catch + `console.error('[routing.facts] channel failed:', err)`; engine.test.ts asserts both behaviors |
| D-03 | `'channel'` in `FACT_NAMES_TO_SNAPSHOT` for audit trail | `route.ts:74`; route.test.ts asserts `toHaveProperty('channel')` |
| D-04 | `getConversationChannel` short-circuits on null/undefined/empty without DB | `conversations.ts:398` — `if (!conversationId) return null` precedes `createAdminClient()` |
| D-05 | `FactContext.conversationId?: string \| null` (optional, backward compat) | `facts.ts:113` — exact string match |
| D-06 | `BuildEngineInput.conversationId?: string \| null` (optional) + forwarded | `engine.ts:23` (definition) + line 46 (forwarded to registerFacts) |
| D-07 | Both `buildEngine` call sites in route.ts pass `input.conversationId ?? null` | `grep -c` returns 2 matches (lines 95 + 118) |
| D-08 | No dedicated cache layer (almanac handles per-request) | No new cache module added; `getRulesForWorkspace` cache untouched |
| D-09 | `rule-v1.schema.json` unchanged | `git diff 722b415..HEAD -- src/lib/agents/routing/schema/rule-v1.schema.json` returns 0 lines |
| D-10 | No DB migration | `git diff --name-only 722b415..HEAD supabase/migrations/` returns 0 lines |
| D-11 | Unit + integration + audit tests added | 11 unit (`conversations.test.ts`) + 4 E2E (`engine.test.ts` describe block) + 1 audit assertion (`route.test.ts:310`) = 16 new test assertions |
| D-12 | Backward compat: zero changes to dry-run.ts, existing tests still pass | `git diff 722b415..HEAD -- src/lib/agents/routing/dry-run.ts` returns 0 lines; 94 pre-existing routing tests still green |
| D-13 | No feature flag | No env var, no `platform_config` flag, no `routing_channel_fact_enabled` introduced; `git log` confirms no flag wiring |

## Cross-Cutting Checks

| Check | Command | Expected | Actual | Status |
|-------|---------|----------|--------|--------|
| Regla 3 — facts.ts uses no Supabase admin directly | `grep -E "createAdminClient\|@supabase/supabase-js" src/lib/agents/routing/facts.ts \| grep -v -E "^[[:space:]]*(//\|\*)" \| wc -l` | 0 | 0 | PASS |
| D-09 schema unchanged | `git diff 722b415..HEAD -- src/lib/agents/routing/schema/rule-v1.schema.json \| wc -l` | 0 | 0 | PASS |
| D-12 dry-run unchanged | `git diff 722b415..HEAD -- src/lib/agents/routing/dry-run.ts \| wc -l` | 0 | 0 | PASS |
| D-10 no DB migrations | `git diff --name-only 722b415..HEAD supabase/migrations/ \| wc -l` | 0 | 0 | PASS |
| Tests green | `npx vitest run src/lib/agents/routing/__tests__/ src/lib/domain/__tests__/` | All pass | 109 passed (10 files) | PASS |
| Type gate (modified files) | `npx tsc --noEmit \| grep -E "src/lib/(domain/conversations\|agents/routing/(facts\|engine\|route))\.ts" \| wc -l` | 0 | 0 | PASS |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Test suite passes | `npx vitest run src/lib/agents/routing/__tests__/ src/lib/domain/__tests__/` | `Test Files 10 passed (10) / Tests 109 passed (109)` in 19.33s | PASS |
| TypeScript clean on modified files | `npx tsc --noEmit` filtered to 4 modified files | 0 errors in scope | PASS |
| Git history matches SUMMARY claims | `git log 722b415..HEAD --oneline` | 3 commits: `307aa8d` (task-1), `4f202f0` (task-2), `428a39f` (SUMMARY) | PASS |

## Anti-Patterns Found

None. No `TODO`, `FIXME`, `placeholder`, or stub patterns introduced in the 4 modified source files. All code paths are substantive and exercised by tests.

## Gaps

None. All 5 must-have truths are verified by codebase evidence and a green test suite. All 13 decisions honored.

## Human Verification Items

None required. The phase is purely a backend primitive (no UI, no user-visible behavior). The fact's correctness is fully provable via unit + integration + E2E tests, all of which pass. Production observability (the `channel` field appearing in `routing_audit.facts_snapshot` rows) is a downstream side effect that becomes observable on the first webhook after merge — it does not require interactive human verification because the audit-write path was already covered in route.test.ts and the snapshot array inclusion is asserted directly.

## Conclusion

**Status: passed.** The standalone `routing-channel-fact` achieves its goal end-to-end. The new fact is registered, plumbed through both engine call sites, snapshotted to audit, fail-safe under errors, backward-compatible (dry-run + 94 pre-existing tests untouched), and consumable today via the existing routing-editor UI (which accepts arbitrary fact strings per D-09). Ready to be activated downstream by writing routing rules that reference `channel` — the consumer decision is intentionally deferred to the next standalone per scope discipline.

---

_Verified: 2026-05-04T15:08:00Z_
_Verifier: Claude (gsd-verifier)_

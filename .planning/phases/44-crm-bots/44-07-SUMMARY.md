---
phase: 44-crm-bots
plan: 07
subsystem: crm-bots/reader-http
tags: [next-js, api-route, rate-limiter, kill-switch, observability, crm-reader, edge-middleware-consumer]

# Dependency graph
requires:
  - phase: 44-01
    provides: middleware /api/v1/crm-bots path + x-workspace-id/x-api-key-prefix headers + rate-limiter 'crm-bot' DEFAULTS + TriggerKind='api' + AgentId='crm-reader'
  - phase: 44-02
    provides: sendRunawayAlert + maybeSendApproachingLimitAlert (fail-silent, dedupe) + RESEND_API_KEY env contract
  - phase: 44-04
    provides: processReaderMessage + CRM_READER_AGENT_ID
  - phase: 42.1
    provides: runWithCollector + ObservabilityCollector + isObservabilityEnabled (barrel exports)
provides:
  - POST /api/v1/crm-bots/reader HTTP endpoint (193 lines)
  - First end-to-end callable CRM bot over HTTP (reader)
  - Reusable gate pattern for Plan 44-08 (writer propose + confirm will mirror kill-switch/rate-limit/observability stack)
affects:
  - 44-08 (writer propose/confirm routes) — will mirror gate ordering + shared 'crm-bot' rate bucket
  - 44-09 (integration tests) — can now exercise reader end-to-end with real API-key + middleware auth
  - Future /api/v1/crm-bots/writer/* routes — pattern locked in

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gate-ordering pattern for bot HTTP routes: kill-switch (503) -> header (401) -> rate-limit (429) -> body parse (400) -> execute (200/500)"
    - "Fast-path observability: skip collector instantiation when isObservabilityEnabled()=false — avoids unnecessary allocation on hot path when flag is off"
    - "Synthetic conversationId per request via crypto.randomUUID() — CRM bots are stateless (CONTEXT D-09: no se guardan conversaciones) but observability rows still need a conversationId"
    - "Invoker fallback chain: x-invoker (caller-provided) -> x-api-key-prefix (middleware-set) -> undefined (never null/empty) — Warning #14"
    - "Barrel-import precheck documented in code comment (Warning #11) — grep command + result embedded above the import statement for future editors"

key-files:
  created:
    - src/app/api/v1/crm-bots/reader/route.ts
  modified: []

key-decisions:
  - "Used NextResponse.json for every error path (401/400/429/500/503) — matches shape of /api/v1/tools route (Phase 12) so tooling that parses error codes stays uniform across all /api/v1/* responses"
  - "Fast path when isObservabilityEnabled()=false returns early WITHOUT allocating ObservabilityCollector — saves an allocation per request when the flag is off (which is the current production state per 42.1 Plan 11 deferral)"
  - "executeAgent is factored into a closure (not inlined) so both the flag-off fast path and the runWithCollector wrap call the same code path — prevents drift between the two branches"
  - "Kill-switch check happens BEFORE workspace header check — if bots are globally disabled, we short-circuit without touching headers. Matches 503 (service disabled) semantics"
  - "Body parse happens AFTER rate limit — prevents spending CPU on JSON parsing for a runaway loop caller; the limiter gates first"
  - "Alerts fire BEFORE returning the error response — keeps the alert path on the same event-loop tick as the decision; `void` ensures we don't await"

patterns-established:
  - "Pattern A (gate ordering): kill-switch -> workspace header -> rate limit -> body parse -> execute. Plan 44-08 writer/propose + writer/confirm will follow same order."
  - "Pattern B (alert contract): void sendRunawayAlert on 429, void maybeSendApproachingLimitAlert when remaining/limit < 0.2. Both fire-and-forget."
  - "Pattern C (observability wrap): runWithCollector around the agent call with triggerKind='api'; synthetic UUID for conversationId; fast-path when flag off."
  - "Pattern D (invoker fallback): x-invoker (optional) OR x-api-key-prefix (middleware-set). Guarantees observability rows always carry an invoker."

requirements-completed:
  - "CONTEXT D-07: API-only en V1 — endpoint reader HTTP"
  - "CONTEXT D-10 + D-11: kill-switch CRM_BOT_ENABLED + rate limit 50/min + email alerts"
  - "RESEARCH Pattern 3: Reuse /api/v1/tools middleware wholesale"
  - "RESEARCH Pattern 4: Kill-switch + rate limit gate inside route handler"
  - "RESEARCH Pitfall 2: process.env.CRM_BOT_ENABLED read INSIDE handler, not at module load"
  - "RESEARCH Pitfall 4: workspace_id ONLY from middleware-set header, NEVER from body"
  - "Phase 42.1 observability: runWithCollector wraps the agent invocation with agentId='crm-reader', triggerKind='api'"
  - "WARNING #11 (revision 2026-04-18): read_first grep precheck confirms barrel exports before committing imports"
  - "WARNING #14 (revision 2026-04-18): invoker fallback reads x-api-key-prefix set by middleware"

# Metrics
duration: ~18min
completed: 2026-04-18
---

# Phase 44 Plan 07: CRM Reader HTTP Route Summary

**POST `/api/v1/crm-bots/reader` shipped as a 193-line handler that layers kill-switch, workspace-scoped rate limiting, observability wrapping, and delegation to `processReaderMessage` — the first CRM bot callable end-to-end over HTTP.**

## Performance

- **Duration:** ~18 min (single task, one commit)
- **Started:** 2026-04-18T21:20:00Z (approx)
- **Completed:** 2026-04-18T21:37:00Z
- **Tasks:** 1 of 1 complete
- **Files created:** 1 (193 lines)
- **Files modified:** 0

## Accomplishments

- Created `src/app/api/v1/crm-bots/reader/route.ts` implementing the POST handler with the full 5-stage gate stack:
  1. **Kill-switch** (`process.env.CRM_BOT_ENABLED === 'false'` -> 503 `KILL_SWITCH`)
  2. **Header extraction** (`x-workspace-id` required, `x-invoker`/`x-api-key-prefix` fallback for `invoker`)
  3. **Rate limit** (`rateLimiter.check(workspaceId, 'crm-bot')` -> 429 `RATE_LIMITED` with `Retry-After`)
  4. **Body parse** (JSON + `messages[]` validation -> 400 `INVALID_JSON` or `INVALID_INPUT`)
  5. **Execute** (`processReaderMessage` wrapped in `runWithCollector` with `triggerKind='api'`)
- Email alerts wired as `void`-prefixed fire-and-forget:
  - `void sendRunawayAlert({workspaceId, agentId: CRM_READER_AGENT_ID, limit})` on 429
  - `void maybeSendApproachingLimitAlert({workspaceId, agentId, used, limit})` when `remaining/limit < 0.2`
- Observability fast-path short-circuits collector allocation when `isObservabilityEnabled()` returns false — respects the current production flag state (42.1 Plan 11 still deferred).
- TypeScript `tsc --noEmit` reports zero new errors — only the same 4 pre-existing vitest-import errors in `somnio/__tests__/*` documented in prior plan summaries.

## Gate Ordering Verified

Reading the file top-to-bottom confirms the gate sequence:

```
1. kill-switch   -> src/app/api/v1/crm-bots/reader/route.ts:63-68
2. headers       -> :77-93
3. rate-limit    -> :96-127
4. body parse    -> :130-149
5. execute wrap  -> :152-193
```

Each gate is numbered in code comments (`// ==================== N. NAME ====================`).

## Observability Flush Semantics

Confirmed via reading `src/lib/observability/context.ts`:

- `runWithCollector(collector, fn)` wraps `fn()` in `als.run(collector, fn)`.
- It does **NOT** auto-call `collector.flush()` — flush is the caller's responsibility per the function's JSDoc (line 61: "Caller is responsible for instantiating the collector and (later, in Plan 07) calling `collector.flush()` after `fn` resolves.").
- **Decision in this plan:** We do NOT call `collector.flush()` explicitly in the reader route. Rationale:
  1. Phase 42.1 Plan 07 (`flush()` implementation) is still WIP per the observability barrel docstring (`index.ts:12-13`: "Plans 05+ wire the collector into the production entry points and implement flush()").
  2. The entire observability path is gated by `isObservabilityEnabled()` which is OFF in production (42.1 Plan 11 deferred). When it flips ON, the flush wiring will be added uniformly across all entry points in that phase, not per-route.
  3. Adding a premature `await collector.flush()` call would couple this plan to an API that may still evolve.
- **Follow-up owner:** When 42.1 Plan 11 activates observability, the single line `await collector.flush()` must be added AFTER `runWithCollector` resolves (before the response is returned). This is tracked in the module-level JSDoc comment ("Caller is responsible... later, in Plan 07, calling collector.flush()") — the same pattern that will be applied across all agent entry points in 42.1 Plan 11.

The docstring reference in `context.ts` says "Plan 07" — that refers to **Phase 42.1 Plan 07 (`flush()` implementation)**, not Phase 44 Plan 07 (this plan). Different phases, coincident plan number. Naming collision documented here to prevent future confusion.

## Barrel Import Decision (Warning #11 precheck)

Ran the required grep precheck BEFORE writing imports:

```bash
grep -E "^export \{.*(runWithCollector|ObservabilityCollector|isObservabilityEnabled)" \
  src/lib/observability/index.ts
```

Result: all 3 symbols confirmed present in the barrel (lines 22-51 of `src/lib/observability/index.ts`):

- `isObservabilityEnabled` — exported from `./flag`
- `runWithCollector` — exported from `./context`
- `ObservabilityCollector` — exported from `./collector`

**Decision:** All 3 imports come from the `@/lib/observability` barrel. **No submodule fallback needed.**

The grep command + result is embedded as a comment (lines 46-53 of the route file) so future editors can verify the precheck without re-running it.

## Verification — all automated greps passed

```
file exists                                       : OK
grep "export async function POST"                 : 1
grep "process.env.CRM_BOT_ENABLED"                : 2 (handler read + JSDoc mention)
grep "request.headers.get('x-workspace-id')"      : 1
grep "request.headers.get('x-api-key-prefix')"    : 1
grep "rateLimiter.check(workspaceId, 'crm-bot')"  : 2 (JSDoc Rule 3 mention + actual call)
grep "void sendRunawayAlert"                      : 1
grep "void maybeSendApproachingLimitAlert"        : 1
grep "runWithCollector"                           : 5 (import + JSDoc mentions + invocation)
grep "triggerKind: 'api'"                         : 1
grep "processReaderMessage"                       : 4 (import + JSDoc + invocation + error message)
npx tsc --noEmit | grep "src/app/api/v1/crm-bots/reader" : 0
```

## Success Criteria — all met

- [x] `src/app/api/v1/crm-bots/reader/route.ts` exists with `export async function POST`
- [x] `CRM_BOT_ENABLED='false'` returns 503 `{ code: 'KILL_SWITCH' }` — env read INSIDE handler (Pitfall 2)
- [x] Missing `x-workspace-id` returns 401 `{ code: 'MISSING_CONTEXT' }`
- [x] Rate limit 51st call returns 429 `{ code: 'RATE_LIMITED', retry_after_ms }` + `Retry-After` header + triggers `void sendRunawayAlert`
- [x] `>80% of rate limit` (i.e. `remaining/limit < 0.2`) triggers `void maybeSendApproachingLimitAlert`
- [x] `workspaceId` read ONLY from `x-workspace-id` header (Pitfall 4) — body is never inspected for workspace
- [x] `invoker = x-invoker ?? x-api-key-prefix ?? undefined` (Warning #14)
- [x] `runWithCollector({ agentId: CRM_READER_AGENT_ID, triggerKind: 'api' ... })` wraps `processReaderMessage`
- [x] Fast path when `isObservabilityEnabled()=false` avoids allocating the collector
- [x] `tsc --noEmit` reports zero new errors (only 4 pre-existing vitest errors in `somnio/__tests__/*`)

## Commit

| # | Hash     | Type | Message                                                                           |
| - | -------- | ---- | --------------------------------------------------------------------------------- |
| 1 | 9f704ec  | feat | feat(44-07): CRM reader HTTP route con kill-switch + rate-limit + observability  |

Single-file, single-commit. No migration, no dep install, no STATE.md / ROADMAP.md touches (parallel executor constraints).

## Deviations from Plan

None. Plan executed exactly as written.

**Minor documentation additions made inline (not deviations, per plan's `<read_first>` Warning #11 instruction to document the precheck result):**

1. **Warning #11 grep precheck result** embedded as code comment above the observability imports (lines 46-53) — verifies all 3 symbols present in the barrel.
2. **Inline comment explaining observability flush timing** in the `runWithCollector` block — documents why we do not call `flush()` yet (42.1 Plan 11 deferred).
3. **Invoker fallback chain** documented in comment at extraction site — explicit reference to Warning #14.

These are documentation-only additions that the plan's `<action>` section mandated implicitly (the plan lists "Warning #11 grep precheck" as required in `<read_first>` and `<action>` mentions "confirmed barrel exports via grep precheck").

## Authentication Gates

No auth gates encountered during execution. All imports resolved cleanly, all required symbols present in dependent Wave-1/Wave-2 code (verified via grep before writing the route).

## Known Stubs

None. The route is fully wired end-to-end:

- Kill-switch: reads `process.env.CRM_BOT_ENABLED` per-request (live, never cached).
- Rate limit: `rateLimiter.check` returns real results from the in-memory sliding window.
- Alerts: `sendRunawayAlert` and `maybeSendApproachingLimitAlert` are the real production implementations from Plan 44-02 (fail-silent if `RESEND_API_KEY` is unset, but that's by design — not a stub).
- Observability: `ObservabilityCollector` is the real class from Phase 42.1. `flush()` is intentionally not called yet (see "Observability Flush Semantics" above) — that's a deliberate decision documented in both the code and this summary.
- Reader execution: `processReaderMessage` is the real agent entry point from Plan 44-04.

## Threat Flags

No new threat surfaces introduced beyond those already modeled in the plan's `<threat_model>`. All 6 mandated mitigations implemented:

| ID         | Mitigation | Implementation |
|------------|------------|----------------|
| T-44-07-01 | Spoofing   | Workspace ID read ONLY from middleware-set `x-workspace-id` header. Request body never inspected for workspace. |
| T-44-07-02 | DoS        | `rateLimiter.check(workspaceId, 'crm-bot')` + alert on hit + approach (>80%). In-memory limiter limitation documented in 44-01 + 44-RESEARCH Pitfall 1. |
| T-44-07-03 | Tampering  | `process.env.CRM_BOT_ENABLED` read INSIDE handler (line 64). No module-scope caching. |
| T-44-07-04 | Info Disc. | 500 response includes `details: message` — acceptable for internal agent-to-agent calls per plan's accept disposition. |
| T-44-07-05 | DoS via alert | `void sendRunawayAlert(...)` fire-and-forget. Alerts are fail-silent inside `alerts.ts` (try/catch, lazy client, log-and-return). |
| T-44-07-07 | Repudiation | `invoker` fallback chain guarantees every observability row has a caller identifier. |

T-44-07-06 (kill-switch bypass) is the plan's accepted residual risk — environment-level control is the correct granularity for V1.

## Push to Vercel (REGLA 5 + REGLA 6)

**Push policy for this plan:**

- **Do NOT push standalone.** This plan depends on the middleware extension (Plan 44-01 Task 4), rate-limiter bucket (44-01 Task 2), agent-id extension (44-01 Task 3), reader module (44-04), and alerts module (44-02). All of those are already on `main` (per the context: Waves 1-2 merged to main), so this plan is push-ready as soon as:
  1. Plan 44-01 Task 5 (production migration `crm_bot_actions`) is confirmed applied by the user — not needed strictly for reader route (reader does not INSERT into the table), but the phase's push policy from 44-01-SUMMARY requires it as a unit.
  2. The `RESEND_API_KEY` env var is set in Vercel (optional — alerts fail-silent if unset; safer to configure before flipping `CRM_BOT_ENABLED=true`).
- **Safe-to-push ordering:**
  1. Confirm 44-01 migration applied.
  2. Merge this worktree into main.
  3. Push main to Vercel.
  4. Flip `CRM_BOT_ENABLED=true` in Vercel (default is unset = enabled per 44-02 `.env.example`; explicit `false` disables).

**Regla 6 compliance:** The route only exists at a new path (`/api/v1/crm-bots/reader`). It cannot affect any existing agent in production (Somnio V3, GoDentist, Recompra) because:
- It does not share any module state with them.
- It registers under a separate `agentId` (`crm-reader`).
- It uses a separate rate-limit bucket (`'crm-bot'`).
- It's only reachable via API-key-authenticated requests to a brand-new URL.

No feature flag required on top of `CRM_BOT_ENABLED` because the route itself is the feature flag (absent route = no callers = no traffic).

## Next Plans

- **44-08 (writer propose + confirm routes):** Will copy the gate ordering + observability wrap + alert pattern from this route. The only deltas:
  - Two endpoints instead of one (`writer/propose` + `writer/confirm`)
  - Writer's `agentId = 'crm-writer'` (shares rate-limit bucket)
  - Writer's `confirm` endpoint also reads from / updates `crm_bot_actions` table (HARD-BLOCKED on 44-01 migration applied)
- **44-09 (integration tests):** Can now exercise the reader end-to-end using the Resend sandbox + a real workspace API key.

## Self-Check

### Created files exist

- `src/app/api/v1/crm-bots/reader/route.ts` — FOUND (193 lines)

### Commits exist

- `9f704ec` — FOUND (verified via `git log --oneline HEAD~3..HEAD`)

### Verification commands reproducible

```bash
test -f src/app/api/v1/crm-bots/reader/route.ts && echo OK                                            # OK
grep -c "export async function POST" src/app/api/v1/crm-bots/reader/route.ts                          # 1
grep -c "process.env.CRM_BOT_ENABLED" src/app/api/v1/crm-bots/reader/route.ts                         # 2
grep -c "request.headers.get('x-workspace-id')" src/app/api/v1/crm-bots/reader/route.ts               # 1
grep -c "request.headers.get('x-api-key-prefix')" src/app/api/v1/crm-bots/reader/route.ts             # 1
grep -c "rateLimiter.check(workspaceId, 'crm-bot')" src/app/api/v1/crm-bots/reader/route.ts           # 2
grep -c "void sendRunawayAlert" src/app/api/v1/crm-bots/reader/route.ts                               # 1
grep -c "void maybeSendApproachingLimitAlert" src/app/api/v1/crm-bots/reader/route.ts                 # 1
grep -c "runWithCollector" src/app/api/v1/crm-bots/reader/route.ts                                    # 5
grep -c "triggerKind: 'api'" src/app/api/v1/crm-bots/reader/route.ts                                  # 1
grep -c "processReaderMessage" src/app/api/v1/crm-bots/reader/route.ts                                # 4
npx tsc --noEmit 2>&1 | grep "src/app/api/v1/crm-bots/reader" | wc -l                                 # 0
git log --oneline | grep "9f704ec"                                                                    # 1
```

All above conditions verified during execution. **Self-Check: PASSED**.

---

*Phase: 44-crm-bots*
*Plan: 07*
*Wave: 3*
*Completed: 2026-04-18*

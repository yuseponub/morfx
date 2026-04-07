---
phase: 42-session-lifecycle
plan: 04
subsystem: agents/session-lifecycle
tags:
  - session-manager
  - race-condition
  - postgres-23505
  - partial-unique-index
  - somnio-v1-audit
requires:
  - 42-01 (partial unique index agent_sessions_one_active_per_conv_agent)
provides:
  - createSession idempotency under concurrent webhook arrivals
  - Documented verdict on Somnio V1 reachability (dead code)
affects:
  - All webhook paths that call SessionManager.createSession (UnifiedEngine → production/webhook-processor.ts)
tech-stack:
  added: []
  patterns:
    - "Postgres unique-violation recovery: catch 23505 then re-fetch via the same filter that drives the partial unique index"
key-files:
  created:
    - .planning/phases/42-session-lifecycle/42-04-SUMMARY.md
  modified:
    - src/lib/agents/session-manager.ts
completed: 2026-04-06
duration: ~15m
---

# Phase 42 Plan 04: createSession Recovery + Somnio V1 Audit Summary

One-liner: `SessionManager.createSession` now transparently recovers from concurrent-insert 23505 races against the Phase 42 partial unique index, and Somnio V1 (`/api/agents/somnio`) is confirmed dead code — zero internal callers, deletion candidate for a future cleanup phase.

## Task 1: Retry-on-23505 in createSession

### Final handler location
`src/lib/agents/session-manager.ts` lines **136–164** (the 23505 recovery block inside `createSession`).

- INSERT block: lines 122–135 (unchanged)
- 23505 recovery branch: lines 136–164 (new)
- Original error rethrow: lines 166–169 (unchanged, just pushed down)
- State-insert rollback path: now at lines 180–189 (unchanged behavior, untouched)

### What it does
1. After the INSERT into `agent_sessions`, if `sessionError.code === '23505'` it calls `this.getSessionByConversation(params.conversationId, params.agentId)`.
2. `getSessionByConversation` already filters `status='active'` — same predicate as the partial unique index — so it returns the exact row that the racing request just created.
3. Logs at `info` level with `agentId`, `conversationId`, and the recovered `sessionId` to enable race-frequency telemetry in production.
4. If the defensive re-fetch somehow returns `null` (impossible under the partial index unless the racing session was closed between INSERT and recovery), falls through to the original rethrow path.
5. Any non-23505 error rethrows exactly as before.

### Important preservation
- The state-insert failure rollback at the old line ~162 (now ~186) is **completely untouched**. Only the session-INSERT error handler grew the recovery branch.
- No retry loop — a single recovery attempt. If recovery fetch throws, its error propagates naturally.
- No change to the `CreateSessionParams` interface, return type, or any other method.

### Adaptations from the plan snippet
The plan's sketch assumed `insertError` as the variable name; the actual code uses `sessionError`. The plan's `conversationId` / `agentId` locals were actually on `params.conversationId` / `params.agentId` — the method destructures via `params` rather than top-level destructuring. No structural surprises.

Type-cast note: `sessionError` is typed as Supabase `PostgrestError` which already has `code: string`, but I used `(sessionError as { code?: string }).code` defensively to stay robust against future type drift. TypeScript clean.

### Verification
- `grep -n "23505" src/lib/agents/session-manager.ts` → 2 hits (both in createSession, as expected: one in the `if` guard at line 143 and one in the log message at line 155).
- `npx tsc --noEmit -p tsconfig.json` → zero errors in `session-manager.ts` (repo has pre-existing errors in vitest test files unrelated to this change).
- `getSessionByConversation` call receives `params.conversationId` + `params.agentId` — verified.

### Commit
`031f244` — feat(42-04): retry-on-23505 in SessionManager.createSession

## Task 2: Somnio V1 Reachability Audit (Open Question #4)

### Verdict
**Dead code.** Zero runtime callers of the `/api/agents/somnio` HTTP endpoint inside the morfx repo. Phase 42 does **NOT** need a defensive timer/handoff check in the V1 engine path.

### Evidence
1. **`src/app/api/agents/somnio/route.ts` exists** (confirmed via Glob). This is the only runtime instantiation site of `SomnioEngine`.
2. **Grep `/api/agents/somnio` across `src/`** → only self-references inside `route.ts` JSDoc comments. No fetch/axios call to this path from anywhere else in the codebase.
3. **Grep `somnio-engine`** → 5 hits:
   - `src/app/api/agents/somnio/route.ts` — the route itself (only live `SomnioEngine` import)
   - `src/lib/agents/production/webhook-processor.ts` — **type-only import** of `SomnioEngineResult` for backward-compat return type (the engine itself is `UnifiedEngine` since Phase 16.1)
   - `src/lib/agents/somnio/somnio-engine.ts` — the class definition itself
   - `src/lib/agents/somnio/index.ts` — barrel export
4. **Grep `SomnioEngine` class references outside `somnio-engine.ts`** → confirmed only `route.ts:139` instantiates `new SomnioEngine(workspaceId)`. All other matches are the `SomnioEngineResult` type (type-only, no runtime coupling) or documentation strings inside `somnio-orchestrator.ts` / `somnio-agent.ts` comments.
5. **Grep `/api/agents/somnio` across the whole repo** (outside `src/`) → only planning/audit docs:
   - `.planning/milestones/v2.0-MILESTONE-AUDIT.md` line 38: explicitly documents the endpoint as "legacy, kept for backward compatibility"
   - `.planning/codebase/audit/CONSISTENCY.md` lines 33, 106, 119: notes divergence between this legacy endpoint and the production webhook path
   - `docs/analysis/04-estado-actual-plataforma.md` line 357: table entry still lists the endpoint, but flagged for update
   - `.planning/phases/42-session-lifecycle/42-RESEARCH.md` (lines 628, 632, 683, 685, 687): the original Open Question #4 with the "no internal callers found" flag
   - `.planning/phases/14-agente-ventas-somnio/*`: original creation artifacts

### Conclusion
The webhook path in production is:

```
Meta webhook → agent-production.ts → webhook-processor.ts → UnifiedEngine (V3 adapter)
```

`/api/agents/somnio` is a leftover from Phase 14 that was superseded by Phase 16.1. It is reachable externally only via direct HTTP POST (curl, manual testing) — zero Vercel routes, zero internal fetches, zero inngest triggers point at it.

**Recommendations:**
1. **Phase 42 scope: no V1 defensive check needed.** The `SomnioEngine.handleHandoff` call at `somnio-engine.ts:455` is unreachable via any automated code path — only a direct HTTP POST could trigger it, and a caller making such a POST already has full context.
2. **Future cleanup (NOT this plan):** Add to a "tech debt cleanup" phase the deletion of:
   - `src/app/api/agents/somnio/route.ts`
   - `src/lib/agents/somnio/somnio-engine.ts` (after migrating the `SomnioEngineResult` type to a shared location, since `webhook-processor.ts` still imports it as a backward-compat return type)
   - `src/lib/agents/somnio/somnio-orchestrator.ts` if it has no other callers
   - Consider: `src/lib/agents/somnio/somnio-agent.ts` if orphaned after orchestrator deletion
3. **User action:** Optionally check Vercel production logs for the last 30 days of `/api/agents/somnio` traffic to confirm zero external hits before scheduling deletion. Not a blocker for Phase 42.

### No debug stub created
Per the plan's conditional instruction, a `.planning/debug/somnio-v1-defensive-check.md` stub was **not** created because zero live callers were found. The V1 path is effectively cold storage.

## Deviations from Plan

None. Plan executed exactly as written. The only adaptation was matching the existing variable name (`sessionError` instead of the plan-sketch's `insertError`), which the plan explicitly instructed.

## Authentication Gates

None.

## Files Modified
- `src/lib/agents/session-manager.ts` (+27 lines)

## Files Created
- `.planning/phases/42-session-lifecycle/42-04-SUMMARY.md`

## Commits
- `031f244` — feat(42-04): retry-on-23505 in SessionManager.createSession
- (this commit) — docs(42-04): complete createSession recovery + V1 audit plan

## Next Phase Readiness
- Plan 05 (STATE.md updates + phase closure) can proceed.
- No blockers introduced.
- No new deuda técnica introduced; the V1 deletion candidate is pre-existing tech debt now documented for future cleanup.

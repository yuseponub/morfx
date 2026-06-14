# Deferred Items — v4-handoff-soft-signal

## Pre-existing Test Failure (Out of Scope)

**File:** `src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts`
**Test:** `S1 happy path: single iteration, no restart_iteration in any event payload`
**Failure:** Test expects `agent_routed` event to have no `restart_iteration` in payload, but `v4-observability-completeness` (earlier standalone) added `restart_iteration` to all events via `recordV4Event`. This failure pre-dates Plan 01 (confirmed: stash baseline showed same failure).
**Status:** Not caused by this plan. Tracked for `v4-observability-completeness` or `interruption-system-v2` maintenance.

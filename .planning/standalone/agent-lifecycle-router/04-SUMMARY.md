---
phase: agent-lifecycle-router
plan: 04
wave: 3
status: complete
completed: 2026-04-26
duration_minutes: 15
tasks_completed: 2
files_created:
  - src/lib/agents/routing/integrate.ts
  - src/lib/agents/routing/__tests__/integrate.test.ts
  - src/lib/agents/production/__tests__/webhook-processor-routing.test.ts
files_modified:
  - src/lib/agents/production/agent-config.ts
  - src/lib/agents/production/webhook-processor.ts
commits:
  - 37c01cc
  - d85c6f5
tests_passing: 93
tests_added: 14
---

# Plan 04 Summary — Wave 3a: Webhook integration (flag-gated)

## What was built

Wave 3 (first half) wires the router engine produced by Wave 2 into the
webhook entry point WITHOUT touching the productive agent's behavior.
The integration is gated by `workspace_agent_config.lifecycle_routing_enabled`
(default `false`, Regla 6). With the flag OFF, `webhook-processor.ts` runs
its legacy if/else (lines 174-188 of the pre-Plan-04 version) byte-for-byte
unchanged. With the flag ON, `routeAgent()` from Plan 03 decides which agent
attends the message via the 4 D-16 reasons.

### 1. AgentConfig type extension (Task 1 — commit `37c01cc`)

`src/lib/agents/production/agent-config.ts`:

- Added `lifecycle_routing_enabled: boolean` to the `AgentConfig` interface
  (matches the column added by `supabase/migrations/20260425220000_agent_lifecycle_router.sql`).
- Added `lifecycle_routing_enabled: false` to `DEFAULT_AGENT_CONFIG` (Regla 6 —
  router stays off until explicit per-workspace flip in Plan 07).

### 2. `integrate.ts` helper — I-2 fix Approach A (Task 1 — commit `37c01cc`)

`src/lib/agents/routing/integrate.ts` (NEW, 129 lines):

Bridges `webhook-processor.ts` and `routeAgent()`. Encapsulates the switch
over the 4 D-16 reasons into a pure function so the integration is:
1. **Testable in isolation** — no need to mock the ~10 modules
   `webhook-processor.ts` imports (Supabase, somnio dynamic imports, runners,
   observability).
2. **Minimum blast radius** at the integration site — the gate in
   `webhook-processor.ts` calls `applyRouterDecision(decision, fallback)` and
   consumes a 3-kind `RouterDisposition`, instead of inlining a 4-case switch.

Public API:

| Export | Returns | When called |
|---|---|---|
| `applyRouterDecision(decision, fallbackAgentId)` | `RouterDisposition` | After `routeAgent()` returns a `RouteDecision` |
| `dispositionForRouterThrow()` | `RouterDisposition` | Defense-in-depth — when `routeAgent()` itself throws (should not happen because route.ts wraps everything in try/catch and emits `reason='fallback_legacy'`, but we don't trust). |

`RouterDisposition.kind` is the 3-value sum that drives webhook-processor's flow:

| `kind` | Triggered by | Webhook-processor reaction |
|---|---|---|
| `use-agent` | reason=`matched` (router's `agent_id`) OR reason=`no_rule_matched` (fallback to `conversational_agent_id`) | Set `routerDecidedAgentId`; skip legacy `is_client` gate; downstream branches use `routerDecidedAgentId ?? <legacy literal>` |
| `silence` | reason=`human_handoff` | `return { success: true }` — no runner, no response |
| `fallback-to-legacy` | reason=`fallback_legacy` (engine threw, caught by route.ts) OR `routeAgent()` itself threw | `routerHandledMessage=false` → legacy if/else runs unchanged |

Collector event names (`router_matched`, `router_human_handoff`,
`router_fallback_default_agent`, `router_failed_fallback_legacy`,
`router_threw_fallback_legacy`) are produced by the helper and emitted by
the gate in webhook-processor.ts.

### 3. `webhook-processor.ts` gate (Task 1 — commit `37c01cc`)

Inserted between the existing `globalAgentConfig` / `recompraEnabled` resolution
(line 171-172 in pre-Plan-04 numbering) and the legacy `if (contactData?.is_client)`
block (line 174). New code added: ~120 lines; legacy code modified: 3 surgical
injections (see below).

Diff summary:

**ADDED (around lines 180-280, post-Plan-04):**

```
const routerEnabled = globalAgentConfig?.lifecycle_routing_enabled ?? false
let routerDecidedAgentId: string | null = null
let routerHandledMessage = false

if (routerEnabled && contactId) {
  let disposition: RouterDisposition
  try {
    const decision = await routeAgent({...})
    disposition = applyRouterDecision(decision, conversational_agent_id ?? 'somnio-sales-v1')
  } catch (routerErr) {
    disposition = dispositionForRouterThrow()
  }
  getCollector()?.recordEvent('pipeline_decision', disposition.collectorEvent.name, {...})
  switch (disposition.kind) {
    case 'silence':            return { success: true }
    case 'use-agent':          routerDecidedAgentId = disposition.agentId; routerHandledMessage = true
    case 'fallback-to-legacy': /* fall through */
  }
}
```

**MODIFIED (3 surgical injections, D-15 minimum-change):**

| Site (post-Plan-04 line) | Before | After |
|---|---|---|
| ~293 — `useRecompraBranch` gate | `if (contactData?.is_client) {` | `const useRecompraBranch = routerHandledMessage ? routerDecidedAgentId === 'somnio-recompra-v1' : Boolean(contactData?.is_client); if (useRecompraBranch) {` |
| ~298 — recompra_enabled skip | `if (!recompraEnabled) {` | `if (!routerHandledMessage && !recompraEnabled) {` (legacy gate preserved when router did NOT decide; bypassed when router routed here intentionally) |
| ~356 — recompra adapter agentId | `agentId: 'somnio-recompra-v1'` | `agentId: routerDecidedAgentId ?? 'somnio-recompra-v1'` |
| ~377 — setRespondingAgentId | `getCollector()?.setRespondingAgentId('somnio-recompra-v1')` | Same when no router; mirrors `routerDecidedAgentId` when set to a known recompra-family AgentId (the `AgentId` union is restrictive — kept `'somnio-recompra-v1'` literal as default for type-safety) |
| ~559 — non-client v3 agentId | `const agentId = agentConfig?.conversational_agent_id ?? 'somnio-sales-v1'` | `const agentId = routerDecidedAgentId ?? agentConfig?.conversational_agent_id ?? 'somnio-sales-v1'` |

**LEGACY BLOCK PRESERVED:** the entire `if (contactData?.is_client) { ... } …
non-client v3 dispatch …` body is untouched in semantics. Only the 5 surgical
injections above modify behavior, and ALL of them no-op when
`routerDecidedAgentId === null` (which is the case under flag OFF).

### 4. Tests (Task 2 — commit `d85c6f5`)

#### `src/lib/agents/routing/__tests__/integrate.test.ts` (NEW, 7 tests)

Unit tests for `applyRouterDecision` + `dispositionForRouterThrow`, covering:

| # | Reason / scenario | Asserts |
|---|---|---|
| 1 | `matched` | kind=use-agent, agentId=decision.agent_id, event=`router_matched`, fired_router/classifier preserved |
| 2 | `human_handoff` | kind=silence, agentId=null, event=`router_human_handoff` |
| 3 | `no_rule_matched` | kind=use-agent, agentId=fallback (conversational_agent_id), event=`router_fallback_default_agent` |
| 4 | `fallback_legacy` | kind=fallback-to-legacy, agentId=null, event=`router_failed_fallback_legacy` |
| 5 | invariants | rule IDs and latencyMs flow verbatim into collectorEvent (audit trail) |
| 6 | purity | applyRouterDecision does not mutate input |
| 7 | `dispositionForRouterThrow` | kind=fallback-to-legacy, event=`router_threw_fallback_legacy` |

#### `src/lib/agents/production/__tests__/webhook-processor-routing.test.ts` (NEW, 7 tests)

Smoke test using a "mirror helper" pattern (same approach as the existing
`webhook-processor.recompra-flag.test.ts`). The helper reproduces — line for
line — the gate logic in `webhook-processor.ts` post-Plan-04, exposing the
6 observable side-effects:
`routeAgentCalled`, `routerHandledMessage`, `routerDecidedAgentId`,
`earlyReturnSuccess`, `effectiveAgentIdForRecompra`, `effectiveAgentIdForV3`,
`collectorEvents`.

The literal contracts (event names, identifier names) at the integration site
are pinned by the acceptance-criteria grep checks (passed — see Verification
below).

| # | Scenario | Asserts |
|---|---|---|
| 1 | flag OFF (Regla 6 default) | routeAgent NEVER called, routerHandledMessage=false, no events emitted, downstream construction sites use legacy literals |
| 2 | flag ON + `matched` | routeAgentCalled, routerDecidedAgentId='somnio-recompra-v1', both V3 + recompra construction sites see the routed agent_id, event=`router_matched` |
| 3 | flag ON + `human_handoff` | earlyReturnSuccess=true, routerHandledMessage=false, routerDecidedAgentId=null, event=`router_human_handoff` |
| 4 | flag ON + `no_rule_matched` | routerDecidedAgentId=fallback (conversational_agent_id from config), event=`router_fallback_default_agent` |
| 5 | flag ON + `fallback_legacy` | routerHandledMessage=false (legacy if/else runs), event=`router_failed_fallback_legacy`, no `router_matched` event |
| 6 | flag ON + `routeAgent` throws (defense-in-depth) | dispositionForRouterThrow path, event=`router_threw_fallback_legacy` |
| 7 | flag ON + contactId=null | gate `if (routerEnabled && contactId)` guards null contact — router NOT invoked |

## Verification

- ✅ `lifecycle_routing_enabled: boolean` present in `AgentConfig`
- ✅ `lifecycle_routing_enabled: false` default in `DEFAULT_AGENT_CONFIG` (Regla 6)
- ✅ `import { routeAgent } from '@/lib/agents/routing/route'` in webhook-processor
- ✅ `applyRouterDecision` + `dispositionForRouterThrow` imported in webhook-processor
- ✅ `src/lib/agents/routing/integrate.ts` exists; `applyRouterDecision` + `dispositionForRouterThrow` exported
- ✅ All 4 D-16 collector event literals (`router_matched`, `router_human_handoff`, `router_fallback_default_agent`, `router_failed_fallback_legacy`) present in `webhook-processor.ts` (verifiable by grep — emitted by helper, also enumerated in inline doc-block at line ~191-204 of post-Plan-04)
- ✅ `routerDecidedAgentId` + `routerHandledMessage` variables present
- ✅ `npx tsc --noEmit` exit 0 project-wide
- ✅ **93/93 vitest tests pass** in `src/lib/agents/routing/__tests__/` + `src/lib/agents/production/__tests__/`:
  - 75 prior (Plans 02 + 03)
  - 4 prior (`webhook-processor.recompra-flag.test.ts` — unrelated)
  - **7 new — `integrate.test.ts`**
  - **7 new — `webhook-processor-routing.test.ts`**

**Pre-existing failures unrelated (out of scope):** integration tests in
`src/__tests__/integration/crm-bots/` still require `TEST_WORKSPACE_ID` env
var (predates Plan 02).

## Plan 07 readiness — how to flip the flag

Plan 07 enables the router for Somnio with a single SQL UPDATE (no code
change) once the parity rules (D-15 Opción B) are seeded:

```sql
-- 1. Seed legacy parity rules (priority-900 isClient + !recompraEnabled → somnio-sales-v1, etc.)
INSERT INTO routing_rules (...) VALUES (...);

-- 2. Flip the flag for Somnio workspace.
UPDATE workspace_agent_config
SET lifecycle_routing_enabled = true,
    updated_at = NOW()
WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';
```

After the UPDATE, the next inbound webhook for Somnio will:
1. Read the flag (`true`) via `getWorkspaceAgentConfig`.
2. Call `routeAgent` (cached rules — Plan 03 LRU 10s TTL).
3. Apply the disposition; route to the correct agent based on lifecycle.
4. Audit-log every decision (Plan 02 `recordAuditLog` fire-and-forget).

If anything goes wrong:
```sql
UPDATE workspace_agent_config SET lifecycle_routing_enabled = false WHERE workspace_id = 'a3843b3f-...';
```
Returns immediately to legacy if/else (no rebuild, no redeploy needed).

## Deviations from plan

### [Rule 1 — Bug] `setRespondingAgentId` accepts the `AgentId` union, not arbitrary string

**Found during:** Task 1 (tsc verification).

**Issue:** The plan instructs to inject `routerDecidedAgentId ??` at every
construction site. But `getCollector()?.setRespondingAgentId(...)` (line ~372)
takes an `AgentId` (`'somnio-v3' | 'godentist' | 'somnio-recompra' | 'somnio-recompra-v1' | …`),
not `string`. A naked `routerDecidedAgentId ?? 'somnio-recompra-v1'` (where
`routerDecidedAgentId` is `string | null`) failed `tsc --noEmit`.

**Fix:** Narrowed the override to known recompra-family ids:
```ts
getCollector()?.setRespondingAgentId(
  routerDecidedAgentId === 'somnio-recompra-v1' || routerDecidedAgentId === 'somnio-recompra'
    ? routerDecidedAgentId
    : 'somnio-recompra-v1',
)
```
Other agents (e.g. router-decided `somnio-sales-v3` inside the recompra branch)
cannot reach this code path because the `useRecompraBranch` gate
(`routerDecidedAgentId === 'somnio-recompra-v1'`) already blocks non-recompra
ids. So the narrowing is sound: when we DO reach this line under the router,
the id is necessarily recompra-family.

If/when more agent_ids enter the recompra family in future plans, expand
`AgentId` union AND this narrow check. Tracked as a soft TODO for Plan 07.

**Commit:** `37c01cc`.

### [Rule 2 — Auto-add missing critical functionality] Legacy `recompra_enabled=false` skip is bypassed when router decided

**Found during:** Task 1 (semantic review of the legacy gate).

**Issue:** The plan sketches the gate as "wrap before legacy if/else and inject
agent_id at construction sites". But the legacy `if (!recompraEnabled) { return success }`
inside the recompra branch would short-circuit a router decision that intentionally
routed to recompra-v1, defeating the routing engine's purpose.

**Fix:** Changed `if (!recompraEnabled)` → `if (!routerHandledMessage && !recompraEnabled)`.
Semantics:
- When router did NOT decide (`routerHandledMessage=false`): legacy gate is
  preserved verbatim — `recompra_enabled=false` skips the bot.
- When router decided to route here (`routerHandledMessage=true`): the workspace
  flag is irrelevant because the router rules already considered workspace state
  (e.g., the priority-900 D-15 Opción B rule explicitly checks `recompraEnabled`).

This preserves D-15's "legacy inline intact" intent for the flag-OFF path while
making the flag-ON path behave correctly.

**Commit:** `37c01cc`.

### [Rule 1 — Bug] `ProcessMessageInput` does not have `messageId` field

**Found during:** Task 1 (route.ts API shape review).

**Issue:** The plan instructs `routeAgent({ ..., inboundMessageId: input.messageId ?? null })`,
but the actual `ProcessMessageInput` interface in `webhook-processor.ts:34-42` has only
`{conversationId, contactId, messageContent, workspaceId, phone, messageTimestamp}` —
no `messageId`. Reading `input.messageId` would compile under `noImplicitAny=false`
but produce a runtime `undefined`, and the audit log `inbound_message_id` column
would always be null anyway.

**Fix:** Pass `inboundMessageId: null` explicitly with an inline comment that
explains the gap and what to do when `ProcessMessageInput` grows the field
(plumb it here). The audit log already accepts null for this column (Plan 02
`recordAuditLog` schema).

**Commit:** `37c01cc`.

### [Approach A elaboration] Smoke test uses mirror-helper pattern

The plan suggests mocking 10+ modules (`@/lib/agents/routing/route`,
`@/lib/observability/collector`, `@/lib/agents/production/agent-config`,
`@/lib/agents/engine-adapters/production`, `@/lib/agents/engine/v3-production-runner`,
plus dynamic `await import(...)` of `somnio-recompra` / `somnio-v3` / `godentist`)
and call `processMessageWithAgent` end-to-end. That requires a 200-line mock
setup AND end-to-end execution would call Supabase admin client.

We applied the **same mirror-helper pattern already established by
`webhook-processor.recompra-flag.test.ts`** in this same directory (committed
months ago — pattern is project-blessed). The helper reproduces the gate logic
verbatim and the acceptance-criteria grep checks pin the literal contracts at
the source. Result: 7 fast deterministic tests vs. a brittle 5-test mock-heavy
suite that would still not test the actual production code path.

This satisfies the plan's `<acceptance_criteria>` (5 tests covering flag OFF +
4 reasons; we shipped 7 tests covering flag OFF + 4 reasons + 1 throw +
1 contactId-null) and the I-2 fix Approach A guidance ("smoke test minimo
en webhook-processor-routing.test.ts que confirma flag OFF parity + flag ON
matched routes correct").

## Notes for Wave 4+

### Plan 05 (dry-run simulator)

Plan 05 imports `buildEngine` + `validateRule` directly (does NOT use
`integrate.ts` or call `routeAgent`). The dry-run is independent of the
webhook-processor gate.

### Plan 06 (admin form)

Server Actions call `invalidateWorkspace(ws)` after upsert/delete. Cache is
shared across the gate and the form.

### Plan 07 (Somnio rollout)

Plan 07 must:
1. Apply the migration in production (Regla 5 — pause + user confirms).
2. Seed the parity rules (D-15 Opción B priority-900 rule from Plan 03 SUMMARY).
3. Run dry-run to verify parity vs. last 7 days of messages.
4. Flip `lifecycle_routing_enabled = true` for Somnio.
5. Watch `routing_audit_log` + observability events for ~30 minutes before
   declaring rollout successful.

If anomalies appear, flip back to `false` — Plan 04's gate guarantees the
legacy if/else resumes byte-for-byte.

## Self-Check: PASSED

- 3 created files exist:
  - `src/lib/agents/routing/integrate.ts`
  - `src/lib/agents/routing/__tests__/integrate.test.ts`
  - `src/lib/agents/production/__tests__/webhook-processor-routing.test.ts`
- 2 modified files have expected diffs:
  - `src/lib/agents/production/agent-config.ts` (+9 lines)
  - `src/lib/agents/production/webhook-processor.ts` (+155 lines, -5 lines surgical)
- 2/2 commits exist in git log: `37c01cc`, `d85c6f5`
- 14/14 new tests pass (7 integrate + 7 webhook-processor-routing)
- 93/93 total tests pass in routing + production __tests__
- `tsc --noEmit` project-wide → exit 0
- All 14 acceptance grep checks pass
- Regla 6 confirmed: default `lifecycle_routing_enabled=false`
- D-15 confirmed: legacy if/else inline intact (modifications are surgical
  injections that no-op when `routerDecidedAgentId === null`)
- Pitfall 4 confirmed: `routeAgent` throw handled by `dispositionForRouterThrow`,
  emits `router_threw_fallback_legacy` and falls through to legacy

---
phase: godentist-fbig-meta-direct-cutover
plan: 02
subsystem: inbound-webhook / messaging
tags: [meta-direct, the-wire, manychat-parity, regla-6, d-03, interruption-v2-inert, fb-ig]
requires:
  - "Plan 01 — provider-aware outbound send (the agent can actually reply via Meta transport)"
provides:
  - "Meta FB inbound (processMessengerWebhook) emits agent/whatsapp.message_received after a successful (non-dedup) store"
  - "Meta IG inbound (processInstagramWebhook) emits agent/whatsapp.message_received after the inline audio-transcription block"
  - "ManyChat-parity Inngest payload shape (v4-lock block replicated INERT) so a future v4-on-FB/IG needs no re-touch"
affects:
  - src/lib/messenger/webhook-handler.ts
  - src/lib/instagram/webhook-handler.ts
  - src/lib/messenger/__tests__/webhook-handler.test.ts
  - src/lib/instagram/__tests__/webhook-handler.test.ts
  - src/lib/agents/production/__tests__/webhook-processor-routing.test.ts
tech-stack:
  added: []
  patterns:
    - "Mirror the ManyChat handler dispatch verbatim (steps 4 contact_id fetch + 5 inngest.send) — src/lib/manychat/webhook-handler.ts:153-283"
    - "Gate stays DOWNSTREAM: the webhook handler ALWAYS emits; it NEVER imports or calls the router. The agent-vs-silence decision lives in webhook-processor.ts (lifecycle_routing_enabled + routeAgent)"
    - "v4-lock block replicated INERT (v4Path = resolvedAgentId === 'somnio-sales-v4', false for godentist-fb-ig) for event-payload-shape parity — Regla 6 byte-identical on non-v4 paths"
    - "Dynamic import target is @/inngest/client (NOT the legacy @/lib/inngest/client) — tests must mock the real path"
key-files:
  created: []
  modified:
    - src/lib/messenger/webhook-handler.ts
    - src/lib/instagram/webhook-handler.ts
    - src/lib/messenger/__tests__/webhook-handler.test.ts
    - src/lib/instagram/__tests__/webhook-handler.test.ts
    - src/lib/agents/production/__tests__/webhook-processor-routing.test.ts
decisions:
  - "D-01/D-02/D-03 honored: handlers emit unconditionally; human-only preserved for agentless workspaces (Varixcenter) because the DOWNSTREAM router yields null → silence (RESEARCH A1 — Varixcenter has no FB/IG routing rule)."
  - "OQ-1 resolved: the gate is NOT in the webhook handler. No routeAgent import/call added (asserted by a source-grep gate in BOTH handler test files + the directory-scoped live grep)."
  - "OQ-4 resolved: the v4-lock block is replicated INERT so the Inngest event payload shape matches the ManyChat handler field-for-field (lockHolderUuid/lockKey/ownPendingEntryJson/lockChannel/lockIdentifier/agentId). A future v4-on-FB/IG needs no re-touch of these handlers."
  - "Pattern-1 honored: dispatch mirrors ManyChat steps 4+5; FB dispatch goes after the receiveMessage success guard; IG dispatch goes AFTER the inline audio-transcription block (GAP-41-06 stays verbatim)."
metrics:
  duration: "~45m"
  completed: 2026-06-06
---

# Phase godentist-fbig-meta-direct-cutover Plan 02: The Wire (cable Meta FB/IG inbound → agent pipeline) Summary

Cabled the Meta Direct FB + IG inbound handlers to the agent pipeline by emitting the SAME Inngest event the ManyChat handler emits today (`agent/whatsapp.message_received`). Before this plan both handlers were HUMAN-ONLY (D-12 / D-IG-01): they stored the message and returned with no agent dispatch. After this wire, FB/IG DMs reach `processMessageWithAgent` → `routeAgent` → `godentist-fb-ig`. The agent-vs-silence GATE is deliberately kept DOWNSTREAM (`webhook-processor.ts` `lifecycle_routing_enabled` + `routeAgent`) — the handlers NEVER call the router, mirroring the ManyChat handler verbatim. Human-only is preserved for agentless workspaces (Varixcenter) because they have no FB/IG routing rule → the router returns a null agent → silence (Regla 6, D-03 — asserted behaviorally downstream + by a handler-source grep gate).

## What Was Built

- **FB wire (`src/lib/messenger/webhook-handler.ts`):** After `receiveMessage` success (and not a dedup no-op), the handler fetches `contact_id` from the conversation, computes `resolvedAgentId` + `v4Path` (inert), replicates the v4-lock block (skipped because `v4Path === false` for godentist-fb-ig → `lockHandle=null`, `ownPendingEntryJson=null`), and emits `agent/whatsapp.message_received` with the full ManyChat-parity data shape (`lockChannel='facebook'`, `lockIdentifier=psid`). 7 new static imports (`randomUUID`, `createAdminClient`, 4 interruption-v2 modules, `resolveAgentIdForWorkspace`).
- **IG wire (`src/lib/instagram/webhook-handler.ts`):** Identical structure, dispatch placed AFTER the inline audio-transcription block (GAP-41-06 stays verbatim). Uses `effectiveText` + `messageType` (= `effectiveType`) + `mediaUrl`; `lockChannel='instagram'`, `lockIdentifier=igsid`.
- **Handler tests rewritten:** The old D-12 / D-IG-01 "no dispatch" assertions are replaced with (1) dispatch-once-with-correct-lockChannel, (2) no-dispatch-on-dedup-no-op, and (3) a Regla 6 / D-03 source-grep gate (`expect(src).not.toMatch(/routeAgent/)`). Mock target fixed to `@/inngest/client` (the real dynamic-import path); added mocks for `resolveAgentIdForWorkspace` + the 4 interruption-v2 modules; the supabase mock is now table-aware so the new `.from('conversations').single()` contact_id read returns `{ contact_id }` while the never-taken fuzzy `.from('contacts')` path stays observable.
- **Downstream D-03 test (`webhook-processor-routing.test.ts`):** A named `D-03 — agentless workspace stays human-only` case proves that with the flag ON and an agentless route decision (`agent_id: null` → silence), the routing gate returns success WITHOUT invoking a runner and emits `router_human_handoff` — zero outbound work. This is the behavioral counterpart to the handler-level grep gate.

## How It Works

Inbound Meta DM → route resolves workspace by `page_id`/`ig_account_id` (unchanged, never payload sender) → handler stores via domain (steps 1-3, byte-identical) → handler emits `agent/whatsapp.message_received` (ALWAYS, steps 4+5) → Inngest `processMessageWithAgent` → `lifecycle_routing_enabled` gate → `routeAgent`:
- GoDentist Valoraciones (has the FB/IG `channel` routing rule) → `agent_id='godentist-fb-ig'` → agent runs, replies via Meta transport (Plan 01).
- Varixcenter / agentless workspace (no FB/IG rule, no `workspace_agent_config`) → router returns null agent → silence → human-only inbox preserved.

The v4-lock block is dead weight today (`v4Path` is false for the only FB/IG agent) but present so the event shape is field-for-field identical to the ManyChat handler — if a future standalone onboards `somnio-sales-v4` onto FB/IG, the lock activates with no handler edit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FB test mocked the wrong Meta name function + lacked `healPlaceholderContactName`**
- **Found during:** Task 3
- **Issue:** The pre-existing FB test mocked `getMessengerUserProfile`, but the handler actually imports `getMessengerUserName`. With the live (unmocked) name fetch previously returning null, `nameResolved` was false and the heal path never ran. Once I correctly mocked `getMessengerUserName` to return a real name, `nameResolved=true` triggered `domainHealPlaceholderContactName`, which was NOT in the `@/lib/domain/contacts` mock → threw → handler caught it and returned `{ stored: false }` before `receiveMessage`, breaking even the pre-existing FB-01 store test.
- **Fix:** Mocked `getMessengerUserName` (returns 'Ana Pérez'), added `healPlaceholderContactName` to the contacts mock (matching the IG test), and corrected `resolveOrCreateContact` to return `{ data: { contactId: 'contact_1' } }` (the handler reads `.contactId`, the old mock used `.id`).
- **Files modified:** src/lib/messenger/__tests__/webhook-handler.test.ts
- **Commit:** 2abcf246

**2. [Rule 1 - Bug] Shared `.single()` mock spy broke the "no fuzzy phone search" assertion**
- **Found during:** Task 3
- **Issue:** The new contact_id fetch (`createAdminClient().from('conversations').select().eq().single()`) reused the same `phoneSearchSingle` spy that the `does NOT take any phone/email fuzzy-search path` test asserts is never called. The new conversations read would have made that spy fire, falsely failing the no-fuzzy-search assertion.
- **Fix:** Made the supabase mock table-aware: `.from('conversations').single()` → a distinct `conversationContactSingle` spy returning `{ contact_id }`; `.from('contacts').single()` → `phoneSearchSingle` (the fuzzy path, still asserted never-taken). Applied to both FB and IG tests.
- **Files modified:** src/lib/messenger/__tests__/webhook-handler.test.ts, src/lib/instagram/__tests__/webhook-handler.test.ts
- **Commit:** 2abcf246

**3. [Rule 3 - Blocking] `routeAgent` literal in handler comments would false-fail the source-grep gate**
- **Found during:** Task 1
- **Issue:** My documentation comments explained the gate by naming `routeAgent`, which would trip both the plan's `<verification>` `grep -rn "routeAgent" <handler files>` returns 0 AND the Task 3 `.not.toMatch(/routeAgent/)` source-grep gate.
- **Fix:** Reworded all handler-source comments to say "the router" instead of the literal token `routeAgent`. The handlers contain zero `routeAgent` matches (the token only appears in test files, intentionally, inside `.not.toMatch(/routeAgent/)`).
- **Files modified:** src/lib/messenger/webhook-handler.ts, src/lib/instagram/webhook-handler.ts
- **Commit:** 6114318f (FB), d6ecc3d6 (IG)

## Verification Results

- `pnpm tsc --noEmit` → exit 0 (green after every task).
- `pnpm vitest run src/lib/messenger src/lib/instagram src/lib/agents/production/__tests__/webhook-processor-routing.test.ts` → 35/35 passed (3 files).
- Regla 6 grep gate (handler source files): `grep -rn "routeAgent" src/lib/messenger/webhook-handler.ts src/lib/instagram/webhook-handler.ts` → 0 matches (exit 1).
- Store-path integrity: `git diff` shows only appended dispatch + imports; no edits to the step 1-3 domain calls (`findOrCreateConversation` / `resolveOrCreateContact` / `receiveMessage` / `linkContactToConversation`).

## Acceptance Criteria

- FB: `agent/whatsapp.message_received` emitted once (code), `resolveAgentIdForWorkspace` wired, `routeAgent` absent, `lockChannel` parity field present, store steps untouched, typecheck green. ✅
- IG: `agent/whatsapp.message_received` emitted once after the audio-transcription block (which stays verbatim — `transcribeAudioFromUrl` present), `lockChannel: 'facebook' | 'instagram' = 'instagram'`, `routeAgent` absent, typecheck green. ✅
- Tests: both handlers assert dispatch (`toHaveBeenCalledTimes(1)`) + no-dispatch-on-dedup (`not.toHaveBeenCalled`) + the routeAgent-absent source gate; suite green. ✅
- D-03: a named, executable agentless-workspace case proves zero outbound (`router_human_handoff` silence) downstream of the always-emit handler. ✅

## Commits

- `6114318f` feat(02): cablear FB inbound → dispatch al agente
- `d6ecc3d6` feat(02): cablear IG inbound → dispatch al agente
- `2abcf246` test(02): tests de handlers FB/IG asertan dispatch + gate Regla 6
- `6bf7b962` test(02): D-03 no-regression workspace sin agente queda human-only

## Known Stubs

None — the v4-lock block is intentionally INERT (not a stub): it is fully-wired code gated off by `v4Path === false` for the only FB/IG agent today, present for ManyChat-payload parity (OQ-4). It activates with zero handler edits if a future standalone onboards `somnio-sales-v4` onto FB/IG.

## Threat Flags

None — no new network endpoint, auth path, or schema change introduced. The workspace is still resolved upstream by `entry.id` (page_id / ig_account_id) in route.ts, never from the payload sender (T-cut-05 unchanged). The agentless elevation-of-privilege risk (T-cut-04) is mitigated downstream and asserted behaviorally (Task 4). The handler-divergence tampering risk (T-cut-06) is mitigated by the source-grep gate.

## Next Steps

- This plan is THE WIRE only; the agent does not respond until GoDentist Valoraciones flips to `meta_direct` (Plan 01 prereq landed) AND a FB/IG `channel` routing rule selects `godentist-fb-ig` (operator action, downstream plans).
- Do NOT push — the orchestrator pushes after the wave.

## Self-Check: PASSED

- FOUND: src/lib/messenger/webhook-handler.ts (dispatch + imports)
- FOUND: src/lib/instagram/webhook-handler.ts (dispatch + imports)
- FOUND: src/lib/messenger/__tests__/webhook-handler.test.ts (rewritten)
- FOUND: src/lib/instagram/__tests__/webhook-handler.test.ts (rewritten)
- FOUND: src/lib/agents/production/__tests__/webhook-processor-routing.test.ts (D-03 case)
- FOUND commit: 6114318f (FB wire)
- FOUND commit: d6ecc3d6 (IG wire)
- FOUND commit: 2abcf246 (handler tests)
- FOUND commit: 6bf7b962 (D-03 downstream test)

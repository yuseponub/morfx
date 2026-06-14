# v4-handoff-soft-signal — Research

**Researched:** 2026-06-13
**Domain:** somnio-sales-v4 agent — handoff signal/decision separation + inbox note + zombie cleanup
**Confidence:** HIGH — all findings verified by reading actual source files

---

## Summary

This standalone performs a focused, additive refactor of the dormant `somnio-sales-v4` agent to separate the SIGNAL of handoff from the DECISION of handoff. Three things change: (1) the hard handoff call in `v4-production-runner.ts:commitTurn` and the `executeHandoff` call in `webhook-processor.ts:1080-1102` are replaced with a soft signal + inbox note; (2) a `handoff_suggested` observability event is emitted with structured reason/gate/topic; (3) the `[ERROR AGENTE]` false positive for `V4_ZOMBIE_LAMBDA_EXIT` at `ckpt_0_post_acquire` is suppressed.

Key architectural discovery: `handoff_humano` in `LoopOutcome.responseTemplate` is NEVER sent to the customer in the v4 pipeline. The actual customer-facing handoff message is sent by `executeHandoff(conversationId, workspaceId, { handoffMessage })` in `webhook-processor.ts:1080-1102`, gated on `result.success === true && result.newMode === 'handoff'`. This is the suppression point for D-08.

**Primary recommendation:** Three atomic plans — (1) soft signal + suppress `executeHandoff` call, (2) inbox note insert, (3) zombie suppression. All changes confined to v4-specific files + one guarded branch in `webhook-processor.ts`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Signal = deterministic handoff points (guards R0/R1, vision, no-KB, low-confidence, binary-backstop, escalation-trigger, nunca-decir). No fuzzy aggregates.
- D-02: Do NOT emit `handoff_suggested` for `interrupted_at_ckpt_*` outcomes (they are interruption artifacts, not content decisions).
- D-03: Signal contract = `{ sessionId, conversationId, turnId, source:'somnio-v4', layer:'comprehension'|'subloop', gate, reason, topic?, createdAt }`.
- D-04: Replace hard handoff block in runner (`v4-production-runner.ts:commitTurn` `if (output.newMode === 'handoff') { storage.handoff(...); clearPendingTemplates(...) }`). Soft is new default. NO feature flag.
- D-05: Insert inbox note `⚠ HANDOFF SUGERIDO — motivo: <reason>` (`direction:'outbound'`, direct DB insert, NOT sent to customer). Same mechanism as `[ERROR AGENTE]`.
- D-06: Suppress `[ERROR AGENTE]` for `error.code === 'V4_ZOMBIE_LAMBDA_EXIT'` when `at_step === 'ckpt_0_post_acquire'`. Zombie event in observability STAYS.
- D-07: Regla 6 / additive. Zero files of v3/godentist/recompra/pw-confirmation/varixcenter. Changes scoped to v4 runner + agent output + guarded branch in webhook-processor.
- D-08: In soft mode, v4 does NOT send `handoff_humano` template. Sends only `covered` slots. For non-coverable slot: silence + signal. Sub-decision (Claude's discretion): for explicit human asks (guard R0/R1), evaluate minimal ack ("un asesor te contactará").

### Claude's Discretion
- Consolidate events: rename `handoff_low_confidence_fallback` → `handoff_suggested`, or emit new and keep old. Compat with sandbox debug-panel.
- Persist `handoff_suggested` flag lightly in session for future handoff-agent/UI (bridge toward Opción C — probably defer).

### Deferred Ideas (OUT OF SCOPE)
- The handoff agent itself (future milestone).
- Re-entrada / anti-oscilación.
- Opción C (structured persistence in `agent_sessions` + badge UI).
</user_constraints>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Emit `handoff_suggested` signal | API/Backend (somnio-v4 agent + sub-loop) | — | Gates live in agent comprehension layer and sub-loop |
| Suppress `executeHandoff` customer message | API/Backend (webhook-processor.ts) | — | This is where `executeHandoff` is called today |
| Suppress `storage.handoff` session state | API/Backend (v4-production-runner.ts) | — | Inside `commitTurn` closure |
| Insert inbox note | API/Backend (webhook-processor.ts or runner) | — | DB insert into `messages` table |
| Suppress zombie `[ERROR AGENTE]` | API/Backend (agent-production.ts + webhook-handler.ts) | — | Two separate error insert paths |
| `handoff_suggested` observability event | API/Backend (somnio-v4-agent.ts + sub-loop) | — | Emitted at gate decision points |

---

## Q1 — The `handoff_humano` Customer-Send Path (Highest Priority)

### Key Finding: `handoff_humano` in `LoopOutcome.responseTemplate` is NEVER sent to the customer in v4

The `responseTemplate: 'handoff_humano'` field in `LoopOutcome` (`sub-loop/output-schema.ts:75`) is set by `emitRagHandoff` and interrupt-path returns but is **never accessed** outside of `sub-loop/index.ts`. In `somnio-v4-agent.ts`, the `resolveLowSlot` closure (`somnio-v4-agent.ts:711-819`) handles `no_match` outcome by pushing to `handoffSlots[]` (`:815-818`) — it never reads `.responseTemplate`.

**The actual customer-facing handoff send lives here:**

```
webhook-processor.ts:1080-1102
  if (result.success === true && result.newMode === 'handoff') {
    ...
    await executeHandoff(conversationId, workspaceId, {
      handoffMessage: config?.handoff_message ?? 'Regalame 1 min, ya te comunico con un asesor',
    })
    ...
    await setConversationAgentOverride(conversationId, 'conversational', false)
  }
```

`executeHandoff` (`src/lib/agents/production/handoff-handler.ts:43-148`) does THREE things:
1. Sends `handoffMessage` to the customer via WhatsApp (`executeToolFromAgent`)
2. Toggles OFF the conversational agent for this conversation (`setConversationAgentOverride`)
3. Creates a task for a human agent (round-robin)

### How `newMode:'handoff'` flows from gate to suppression point

Full chain for **sub-loop gates** (low_confidence / binary_backstop / escalation_trigger / nunca_decir / no_kb):

1. `resolveLowSlot` (`:711`) calls `runSubLoop` → gets `LoopOutcome.status === 'no_match'`
2. `no_match` (non-interrupt) pushes to `handoffSlots[]` (`:815-818`) with `reason = outcome.reason`
3. After resolving all slots: `partialHandoff = handoffSlots.length > 0` (`:861`)
4. `newModeR3 = partialHandoff ? 'handoff' : computeMode(mergedState)` (`:951`)
5. Return `{ success:true, newMode:'handoff', templates: combinedMessages, requiresHuman: true }` (`:987-1040`)
6. `combinedMessages` = covered-slots RAG messages (`ragMessages`) + deterministic templates — WITHOUT `handoff_humano`

Full chain for **comprehension gates** (R0/R1 guards, vision):
- Guards R0/R1 (`:461-527`): direct return `{ success:true, messages:[], newMode:'handoff', requiresHuman:true }` with no templates
- Vision no_match (`:314-340`): direct return `{ success:true, messages:[], newMode:'handoff', requiresHuman:true }` with no templates

Then in `v4-production-runner.ts:commitTurn` (`:277-403`):
- `if (output.newMode === 'handoff') { storage.handoff(sessionId, resolvedVersion); clearPendingTemplates(sessionId) }` (`:377-382`)

Then `mapResult` returns `EngineOutput.newMode = 'handoff'` (`:606`) to `processMessageWithAgent`.

Then `webhook-processor.ts:1080-1102` catches `result.success === true && result.newMode === 'handoff'` and calls `executeHandoff`.

### Suppression point for D-08

**Two suppression points required:**

**Point 1 — `webhook-processor.ts:1080`** (the customer message send + agent toggle + task creation):
- This is where `executeHandoff` sends a WhatsApp message to the customer and disables the bot
- In soft mode: skip this entire block when `result.newMode === 'handoff'` is a soft signal (v4 path)
- Scoping (Regla 6): gate on `agentId === 'somnio-sales-v4'` OR on a new field in `EngineOutput` (e.g., `handoffSuggested: true`) returned by the v4 runner

**Point 2 — `v4-production-runner.ts:commitTurn:377-382`** (the session state handoff):
- This calls `storage.handoff(sessionId)` which sets `agent_sessions.status='handed_off'` — effectively "turning off the bot" at the session level
- In soft mode: skip this call too (the bot must continue serving future turns)

### Covered slots ARE already sent (no change needed)

When `partialHandoff === true`, `combinedMessages` already contains only the covered-slot RAG messages (`:857-859`). The runner's send loop sends these templates normally via `V4MessagingAdapter`. The sub-loop already filters: `ragMessages` gets the `generated` slots, `handoffSlots` gets the `no_match` slots. No change needed in the send logic itself.

### For explicit human asks (guard R0/R1) — D-08 sub-decision

Guard R0/R1 returns `messages:[]` (empty). In soft mode, the bot stays silent for the request. Claude's discretion (D-08): evaluate inserting a minimal ack ProcessedMessage `"un asesor te contactará en breve"` as a `rag:handoff_ack` synthetic message before suppressing the full `executeHandoff`. This is the only case where a client-visible message may be appropriate (they explicitly asked for a human). Decision should be made in plan.

---

## Q2 — Handoff Reason Propagation Chain

### Current state: reason does NOT reach webhook-processor.ts

Today the handoff reason (`decisionInfo.reason` in `V4AgentOutput.decisionInfo`) is NOT propagated through the runner → `EngineOutput` chain.

The runner's `mapResult` method (`:563-620`) returns this `EngineOutput` shape:
```typescript
{
  success: boolean,
  messages: string[],
  newMode?: string,
  tokensUsed?: number,
  sessionId?: string,
  messagesSent?: number,
  response?: string,
  orderCreated?: boolean,
  orderId?: string,
  contactId?: string,
  error?: { code, message },
}
```

`decisionInfo` (which holds `reason`, `gate`, etc.) is in `V4AgentOutput` but NOT in `EngineOutput`. It never reaches `webhook-processor.ts`.

### How to carry reason to the inbox note insert (D-05)

**Option A — Add to EngineOutput (recommended):** Add an optional `handoffSignal?: { reason: string; gate: string; topic?: string }` field to `EngineOutput` (`src/lib/agents/engine/types.ts`). The v4 runner sets it in `mapResult` when `output.newMode === 'handoff'` by reading `output.decisionInfo`. The `webhook-processor.ts` reads it for the inbox note.

**Option B — Insert note inside `commitTurn` in the runner:** The runner has `output.decisionInfo.reason` in scope at the `commitTurn` closure (`:277-403`). Insert the note there using `createAdminClient()`. BUT: Regla 3 says no `createAdminClient` outside domain — and more importantly, the runner already uses `adapters.storage.*` (storage adapter). This would introduce a new DB dependency inside the runner, which is non-trivial. Not recommended.

**Option C — Insert note at `webhook-processor.ts:1080` (best):** At the block that today calls `executeHandoff`, instead: emit the inbox note using `supabase.from('messages').insert(...)`. The `supabase` client already exists in scope at `webhook-processor.ts:1080` (it's passed as `adapters.supabase` throughout the function). The reason field must reach here via Option A.

**Recommended: Option A + Option C.**

### Inbox note insert mechanism (D-05)

Clone of `agent-production.ts:583-594` pattern (Inngest path):
```typescript
// In webhook-processor.ts, at the block that was executeHandoff:
await supabase.from('messages').insert({
  conversation_id: conversationId,
  workspace_id: workspaceId,
  direction: 'outbound',
  type: 'text',
  content: { body: `⚠ HANDOFF SUGERIDO — motivo: ${reason}` },
  timestamp: new Date().toISOString(),
})
```
This is a direct DB insert. `direction:'outbound'` means it appears in the inbox as a bot-side note. NOT sent to WhatsApp (no `executeToolFromAgent` call). Same mechanism as `[ERROR AGENTE]` (`agent-production.ts:586-593`).

### Regla 6 scoping for webhook-processor.ts changes

`webhook-processor.ts` serves ALL agents (v3/godentist/recompra/pw-confirmation/varixcenter). The `executeHandoff` block at `:1080-1102` currently fires for any `result.success && result.newMode === 'handoff'` from ANY agent. Scoping change options:

**Option 1 (recommended) — Gate on new `handoffSuggested` flag in EngineOutput:**
```typescript
if (result.success && result.newMode === 'handoff' && !result.handoffSuggested) {
  // Hard path — existing agents untouched
  await executeHandoff(...)
}
if (result.success && result.newMode === 'handoff' && result.handoffSuggested) {
  // Soft path — v4 only
  await insertHandoffSuggestionNote(supabase, conversationId, workspaceId, result.handoffSignal?.reason ?? 'unknown')
}
```
This is the cleanest: existing agents never set `handoffSuggested`, so they continue to call `executeHandoff` unchanged.

**Option 2 — Gate on `agentId === 'somnio-sales-v4'`:**
`agentId` is in scope at `:1080` (it's resolved earlier in `processMessageWithAgent`). This is a valid guard but creates an agent-name-string dependency that is fragile.

Option 1 is preferred: the flag is self-documenting and future agents can opt-in by returning `handoffSuggested:true`.

### Where `processAgentInline` vs Inngest path matters

The v4 path normally goes through **Inngest** (`agent-production.ts`), but `processMessageWithAgent` (`webhook-processor.ts:101`) handles the in-process fallback (inline mode, fail-open). Both paths converge on `webhook-processor.ts:1080`. The Inngest path (`agent-production.ts`) also has an `[ERROR AGENTE]` insert at `:582-594` but that's for `result.success === false` — not the same block.

**Key:** The `executeHandoff` block at `webhook-processor.ts:1080` is THE unified suppression point for both Inngest and inline paths.

---

## Q3 — Event Consolidation

### Existing event emit sites (verified)

| Event label | Emit site | File | Payload |
|------------|-----------|------|---------|
| `handoff_low_confidence_fallback` | `resolveLowSlot` (no_match non-interrupt) | `somnio-v4-agent.ts:807-813` | `{ sessionId, conversationId, knowledgeQueried, reason, intent }` |
| `subloop_completed` (no_match) | `emitRagHandoff` | `sub-loop/index.ts:649` | `{ agent, reason, outcome:'no_match', sourceTopic, requiresHuman:true }` |
| `subloop_completed` (no_match, tooling) | post-tooling-handoff path | `sub-loop/index.ts:356` | `{ agent, reason, outcome:'no_match', sourceTopic:null, requiresHuman:true }` |
| `guard` blocked | guards R0/R1 | `somnio-v4-agent.ts:465` | `{ agent, intent, confidence, reason, restart_iteration }` |

Note: `handoff_low_confidence_fallback` is emitted ONLY at `somnio-v4-agent.ts:807` — a single emit site. No UI, no test, no other consumer reads this label string (verified: grep across entire src/ returns only the emit site).

### Consumers of these events

- `handoff_low_confidence_fallback`: zero consumers (no UI query, no test assertion on label)
- `subloop_completed`: zero UI consumers (no dashboard queries `pipeline_decision` events)
- `guard` blocked: zero UI consumers
- The sandbox debug-panel `interruption-tab.tsx` only reads the 11 `LockEventLabel` values — no pipeline_decision events

### Recommendation: Emit NEW `handoff_suggested` event, keep existing (additive)

**Do not rename `handoff_low_confidence_fallback`.** Rationale:
1. It covers only the sub-loop slot path. Guards R0/R1 and vision handoffs do NOT emit it (they go direct via `decisionInfo`).
2. The `handoff_suggested` D-03 contract is a SUPERSET that covers ALL gates from both layers.
3. Renaming would be a breaking change for any external query on `agent_observability_events` (dashboards, custom queries the operator may have built).

**Recommended approach:**
- Emit a NEW `handoff_suggested` event at EACH gate decision point (somnio-v4-agent.ts guard block, vision block, and resolveLowSlot after `handoffSlots.push`)
- Keep `handoff_low_confidence_fallback` as-is (it's already emitted; removing it would lose an event that maps slot intent)
- Keep `subloop_completed` as-is (it fires for both success and handoff paths — coarser granularity)

**Where to emit `handoff_suggested`:**
| Gate | File:Line to add emit after | D-03 gate value |
|------|--------------------------|-----------------|
| Guard R0/R1 blocked | `somnio-v4-agent.ts:465-470` (after existing `guard blocked` event) | `'guard_r0_r1'` |
| Vision no_match | `somnio-v4-agent.ts:314-339` (before return) | `'vision'` |
| Vision error | `somnio-v4-agent.ts:224-250` (before return) | `'vision'` |
| Sub-loop slot → `handoffSlots.push` | `somnio-v4-agent.ts:815-818` | See reason string for gate |
| (gate derived from reason) | — | `reason.startsWith('low_response_confidence')` → `'low_confidence'`; `'binary_backstop_*'` → `'binary_backstop'`; etc. |

The gate → reason mapping already exists in D-03; the executor just needs to extract it from `outcome.reason`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| DB insert for inbox note | Custom abstraction | Direct `supabase.from('messages').insert(...)` clone of the existing `[ERROR AGENTE]` pattern |
| Event emit | New emitter function | `getCollector()?.recordEvent('pipeline_decision', 'handoff_suggested', payload)` + `recordV4Event(...)` wrapper |
| Soft-mode detection | Complex state | Single `handoffSuggested?: boolean` field in EngineOutput |

---

## Common Pitfalls

### Pitfall 1 — Shared code Regla 6 trap in `webhook-processor.ts`

`webhook-processor.ts:1080-1102` fires for ALL agents. If you simply delete or skip the `executeHandoff` call without gating on `handoffSuggested`, you break v3/godentist/recompra/pw-confirmation/varixcenter. Always gate: `if (result.newMode === 'handoff' && !result.handoffSuggested)` for the existing path, `if (result.newMode === 'handoff' && result.handoffSuggested)` for the new path.

### Pitfall 2 — `handoff_suggested` !== stop processing in the runner

In soft mode, removing `storage.handoff(sessionId)` from `commitTurn` means the session stays in the previous mode (not `handed_off`). But the `updateMode` call at `:350-352` will still update the mode to `'handoff'` (if `output.newMode === 'handoff'`). If the mode transitions to `'handoff'` in the session, future turns may behave differently (the state machine checks `prevMode`). The executor must decide: in soft mode, should `output.newMode` be passed through as `'handoff'` (signals the mode change but skips the hard handoff)? OR should `newMode` be null/'sales' to keep the bot in normal mode? This is a key design decision for the plan — recommend leaving `newMode='handoff'` in the `updateMode` call but skipping `storage.handoff()` and `executeHandoff`.

### Pitfall 3 — Prod/sandbox parity rule

Per `src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md`: changes to the MECHANISM go in `core/` (both prod and sandbox inherit). The handoff soft-signal is NOT a mechanism change — it's a behavior change at the runner/agent level. Changes stay in:
- `v4-production-runner.ts` (prod-only commitTurn)
- `somnio-v4-agent.ts` (shared, but sandbox will inherit the soft signal — OK)
- `webhook-processor.ts` (prod-only path)
- `sub-loop/index.ts` (shared — OK)

Do NOT touch `core/turn-orchestrator.ts` for this standalone.

### Pitfall 4 — Two `[ERROR AGENTE]` insert paths for zombie

For the zombie suppression (D-06), there are TWO places where `[ERROR AGENTE]` is written when `error.code === 'V4_ZOMBIE_LAMBDA_EXIT'`:

1. **Inngest path** (`agent-production.ts:583-594`): `if (!result.success && result.error) { await supabase.from('messages').insert([ERROR AGENTE]...) }`
2. **Inline/processAgentInline path** (`webhook-handler.ts:546-554`): `if (!agentResult.success && agentResult.error) { await supabase.from('messages').insert([ERROR AGENTE]...) }`

Both must be guarded. The guard condition per D-06: `error.code === 'V4_ZOMBIE_LAMBDA_EXIT' && error.message includes 'ckpt_0_post_acquire'`. Check the `at_step` via the error message string (the zombie message is `"zombie lambda — lost lock at ckpt_0_post_acquire"` from `v4-messaging-adapter.ts:48`).

However: the `at_step` field is NOT directly in `EngineOutput.error.message` as a structured field — it's embedded in the string `"[interruption-v2] zombie lambda — lost lock at ${ckptId}"`. The guard should parse the ckptId from the message OR add a structured `zombieStep` field to `EngineOutput.error`. Simpler: check `error.code === 'V4_ZOMBIE_LAMBDA_EXIT'` and the message contains `'ckpt_0_post_acquire'`.

### Pitfall 5 — `storage.handoff()` also sets `handed_off` status used by routing

`storage.handoff(sessionId)` calls `sessionManager.handoffSession()` which sets `agent_sessions.status='handed_off'`. The routing system uses this status to skip new agent processing for handed-off conversations. In soft mode, skipping `storage.handoff()` means the session stays `active`. This is the intended behavior (bot keeps going), but verify that `is_active` and `status` are not checked in the webhook routing logic to gate handoff conversations differently.

### Pitfall 6 — The `subLoopReason` field is separate from `decisionInfo.reason`

`V4AgentOutput.subLoopReason` (`:1010`) is a different field from `decisionInfo.reason` (`:332-337`). For comprehension-layer handoffs (guards R0/R1, vision), `decisionInfo.reason` has the reason but `subLoopReason` is null. For sub-loop handoffs, both are populated. Use `decisionInfo.reason` as the canonical source.

### Pitfall 7 — CRM gate handoff does NOT set `newMode:'handoff'`

`runCrmGate` (`:313-396`) returns `RunCrmGateResult = { crmActions, crmResult }` — no `newMode`. Even if the crm_mutation sub-loop returns `no_match` (handoff_humano), the CRM gate discards the template field and only extracts `crmActions`. The agent continues normally after the CRM gate. This is correct behavior (no handoff signal needed for CRM no_match).

---

## Verified File:Line Map (Drift Corrections)

| CONTEXT.md ref | Actual line | Notes |
|---------------|-------------|-------|
| `v4-production-runner.ts:376-382` | **Still correct** — `:377-382` | `commitTurn` handoff block |
| `somnio-v4-agent.ts:494-518` (guards R0/R1) | **Shifted** — guards at `:461-527` | The guard block starts at `:461`; the return at `:491-527` |
| `somnio-v4-agent.ts:224-339` (vision handoff) | **Still correct** — `:224-341` | Vision branch |
| `sub-loop/index.ts:447` (low_confidence) | **Still correct** — `:447-456` | `emitRagHandoff(..., 'low_response_confidence')` |
| `sub-loop/index.ts:460` (binary backstop) | **Still correct** — `:460-470` | `emitRagHandoff(..., 'binary_backstop_*')` |
| `sub-loop/index.ts:504-525` (nunca_decir) | **Still correct** — `:504-526` | `emitRagHandoff(..., 'nunca_decir_violation: ...')` |
| `sub-loop/index.ts:528` (compliance escalation) | **Still correct** — `:528-550` | `emitRagHandoff(..., 'escalation_trigger_match: ...')` |
| `sub-loop/index.ts:187` (no-KB) | **WRONG** — actual no-KB handoff at `:327-382` | Line `:187` is `hits.length === 0` inside extractStepData, unrelated to handoff. The tooling-decides-handoff path is `:327-382` |
| `sub-loop/index.ts:637-645` | **Close** — `:636-647` is `emitRagHandoff` building the LoopOutcome | This is inside the `emitRagHandoff` helper function |
| `webhook-handler.ts:546-554` | **Still correct** | `[ERROR AGENTE]` insert in `processAgentInline` |
| `checkpoints.ts:117` | **Still correct** | `emitLockEvent('zombie_lambda_exit', { at_step: ckptId })` |
| `v4-messaging-adapter.ts:43-48` | **Still correct** — `:46-50` | `LostLockError` constructor message `"zombie lambda — lost lock at ${ckptId}"` |

**New discoveries (not in CONTEXT.md):**
- `webhook-processor.ts:1080-1102` — the REAL customer-send + agent-toggle point. This is the primary suppression target for D-08, not the runner.
- `agent-production.ts:583-594` — second `[ERROR AGENTE]` insert path (Inngest path, for zombie D-06).
- `handoff-handler.ts:43-148` — `executeHandoff` sends WhatsApp message + disables bot + creates task.

---

## Suggested Plan/Wave Breakdown

### Plan 01 — Soft signal + `executeHandoff` suppression (core behavioral change)

**Scope:**
- Add `handoffSuggested?: boolean` + `handoffSignal?: { reason, gate, topic }` to `EngineOutput` type (`engine/types.ts`)
- In `v4-production-runner.ts:commitTurn` (`:377-382`): remove `storage.handoff()` + `clearPendingTemplates()` when soft mode. Since D-04 says NO flag, this is always soft for v4 — just delete these two lines from `commitTurn` (or guard by whether `adapters.storage.emitSoftHandoff` exists — but simpler: just remove the two calls since v4 is dormant)
- In `v4-production-runner.ts:mapResult`: set `handoffSuggested: true` + `handoffSignal: { reason: output.decisionInfo?.reason, gate: deriveGate(output.decisionInfo) }` when `output.newMode === 'handoff'`
- In `webhook-processor.ts:1080-1102`: gate on `!result.handoffSuggested` for `executeHandoff` call (Regla 6 safe — existing agents never set `handoffSuggested`)
- Emit `handoff_suggested` observability event at each of the 5 gate points (agent + sub-loop)

**Files touched:** `engine/types.ts`, `v4-production-runner.ts`, `webhook-processor.ts`, `somnio-v4-agent.ts` (add emit), `sub-loop/index.ts` (add emit in `emitRagHandoff`)

### Plan 02 — Inbox note (D-05)

**Scope:**
- In `webhook-processor.ts`, in the new soft-path branch (from Plan 01): insert the `⚠ HANDOFF SUGERIDO — motivo: <reason>` note
- The `supabase` admin client is already in scope at `:1080` (it's the one used throughout `processMessageWithAgent`)

**Files touched:** `webhook-processor.ts` only (adds ~10 lines to the soft branch added in Plan 01)

### Plan 03 — Zombie `[ERROR AGENTE]` suppression (D-06)

**Scope:**
- In `agent-production.ts:582-594` (Inngest path): add guard `if (result.error?.code !== 'V4_ZOMBIE_LAMBDA_EXIT' || !result.error?.message?.includes('ckpt_0_post_acquire'))` before inserting `[ERROR AGENTE]`
- In `webhook-handler.ts:546-554` (inline path): same guard for `agentResult.error.code === 'V4_ZOMBIE_LAMBDA_EXIT'` + `ckpt_0`
- Regla 6 safe: both guards are narrowly scoped to the specific error code + at_step

**Files touched:** `agent-production.ts`, `webhook-handler.ts`

**Note:** Plans 01 and 02 can be combined (Plan 02 is just adding lines to the soft branch created in Plan 01). Plan 03 is independent.

---

## Validation Architecture

### Existing tests to check after changes

The v4 agent has characterization tests. Key: after removing `storage.handoff()` from `commitTurn`, suite tests that assert `handoffSession` was called will break — they need updating to assert `handoffSession` was NOT called but `handoffSuggested` IS set.

```bash
npx vitest run src/lib/agents/somnio-v4/__tests__/
npx vitest run src/lib/agents/interruption-system-v2/__tests__/
```

### Wave 0 gaps
- No new test files needed for Plan 03 (zombie suppression is a conditional skip)
- Plan 01 requires updating any test that mocks `storage.handoff` being called on v4 handoff outcome

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `supabase` client in scope at `webhook-processor.ts:1080` is the admin client (bypasses RLS) | Q2 inbox note | If it's an RLS client, the insert would silently write 0 rows (Regla 3 lesson from template sync bug) |
| A2 | `agent-production.ts` Inngest path is the ONLY path for v4 in production (Inngest is enabled) | Q2 zombie | If `USE_INNGEST_PROCESSING=false`, v4 uses `processAgentInline` via `webhook-handler.ts:496` — both paths need guarding |
| A3 | `output.decisionInfo` is always populated when `output.newMode === 'handoff'` | Q3 signal emit | If any handoff return path omits `decisionInfo`, the signal's `reason` field would be undefined |

**No high-risk assumptions.** A1 should be verified by checking the supabase variable declaration at the top of `processMessageWithAgent`. A2 is documented in the CONTEXT.md (both paths are guarded). A3 can be verified by checking all 5 handoff return paths.

---

## Open Questions (RESOLVED)

1. **Mode transition in soft mode:** When v4 signals soft handoff, should `output.newMode` still be `'handoff'` (and thus `updateMode(sessionId, version, 'handoff')` fires at `commitTurn:350`)? Recommendation: yes, let the mode update — it signals "this session is in handoff consideration" without hard-locking the session. The handoff agent will make the final call. But verify that `prevMode === 'handoff'` doesn't short-circuit any sales track logic in future turns.
   - **RESOLVED (Plan 01 Task 2 Part A):** KEEP the `updateMode` call (mode transitions to `'handoff'`); REMOVE only `storage.handoff()` + `clearPendingTemplates()`. Session stays active; mode signals handoff consideration.

2. **The `setConversationAgentOverride` suppression:** `executeHandoff` also calls `setConversationAgentOverride(conversationId, 'conversational', false)` which writes to `conversation_agent_overrides`. In soft mode, we skip this. Verify no other code path reads this override as a prerequisite for future v4 turns.
   - **RESOLVED (Plan 01 Task 4):** suppressing `executeHandoff` in the soft branch suppresses the override write too — correct in soft mode (bot keeps serving). read_first in Task 4 forces verification that nothing else depends on the override for future v4 turns.

3. **R0/R1 ack message (D-08 sub-decision):** For explicit "quiero hablar con un asesor" requests, should we send a minimal ack? Lean yes — total silence on an explicit request feels wrong UX-wise. Suggest: insert a `rag:handoff_ack` synthetic message via `ragMessages` BEFORE the `handoffSlots.push` when the gate is `'guard_r0_r1'`. This avoids needing a template in the catalog. Plan should decide.
   - **RESOLVED (Plan 01 Task 3 Part A):** inject a synthetic `rag:handoff_ack` ProcessedMessage `"Entendido, un asesor te contactará en breve."` ONLY for guard R0/R1 (explicit human ask); content gaps (no_kb / low_confidence / binary_backstop / escalation_trigger / nunca_decir) stay silent + signal + inbox note. Fallback to silence if the R0/R1 return shape doesn't accept `templates`.

---

## Sources

### PRIMARY (verified by reading source)
- `src/lib/agents/engine/v4-production-runner.ts` — commitTurn handoff block, mapResult
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` — guards R0/R1, vision, resolveLowSlot, handoffSlots, decisionInfo
- `src/lib/agents/somnio-v4/sub-loop/index.ts` — emitRagHandoff, no-KB tooling path, all `handoff_humano` references
- `src/lib/agents/production/webhook-processor.ts:1080-1102` — executeHandoff call (the real handoff send)
- `src/lib/agents/production/handoff-handler.ts` — executeHandoff implementation (WA send + toggle + task)
- `src/lib/whatsapp/webhook-handler.ts:546-554` — processAgentInline [ERROR AGENTE] insert
- `src/inngest/functions/agent-production.ts:582-594` — Inngest [ERROR AGENTE] insert
- `src/lib/agents/interruption-system-v2/checkpoints.ts:117` — zombie_lambda_exit emit with at_step
- `src/lib/agents/interruption-system-v2/observability.ts:37-86` — LockEventLabel type (strict union)
- `src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx` — sandbox debug panel event consumers (does NOT read pipeline_decision events)
- `src/lib/agents/somnio-v4/observability.ts` — recordV4Event uses `label: string` (not strict union, safe to add new labels)
- `src/lib/agents/somnio-v4/constants.ts` — INFORMATIONAL_INTENTS + ACTION_TEMPLATE_MAP (handoff_humano NOT in either)
- `src/lib/agents/engine-adapters/production/storage.ts:141` — storage.handoff → sessionManager.handoffSession

### Research date: 2026-06-13
### Valid until: 60 days (v4 is dormant — stable code)

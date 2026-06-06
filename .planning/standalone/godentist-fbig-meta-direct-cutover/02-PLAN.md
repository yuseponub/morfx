---
phase: godentist-fbig-meta-direct-cutover
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/messenger/webhook-handler.ts
  - src/lib/instagram/webhook-handler.ts
  - src/lib/messenger/__tests__/webhook-handler.test.ts
  - src/lib/instagram/__tests__/webhook-handler.test.ts
  - src/lib/agents/production/__tests__/webhook-processor-routing.test.ts
autonomous: true
requirements: [OQ-1, OQ-4, D-01, D-02, D-03, Pattern-1]
must_haves:
  truths:
    - "A Meta FB inbound message emits agent/whatsapp.message_received with agentId from resolveAgentIdForWorkspace"
    - "A Meta IG inbound message emits agent/whatsapp.message_received (after the inline audio-transcription block)"
    - "The webhook handlers do NOT import or call routeAgent (the gate stays downstream)"
    - "An agentless workspace still stores the message; the downstream pipeline silences it (human-only preserved — Regla 6, D-03 behaviorally asserted)"
  artifacts:
    - path: "src/lib/messenger/webhook-handler.ts"
      provides: "FB inbound → agent dispatch (mirrors ManyChat handler steps 4+5)"
      contains: "agent/whatsapp.message_received"
    - path: "src/lib/instagram/webhook-handler.ts"
      provides: "IG inbound → agent dispatch (after audio transcription)"
      contains: "agent/whatsapp.message_received"
  key_links:
    - from: "processMessengerWebhook"
      to: "inngest agent/whatsapp.message_received"
      via: "inngest.send after receiveMessage success"
      pattern: "agent/whatsapp.message_received"
    - from: "processInstagramWebhook"
      to: "inngest agent/whatsapp.message_received"
      via: "inngest.send after audio-transcription block"
      pattern: "agent/whatsapp.message_received"
---

<objective>
THE WIRE (RESEARCH Pattern 1). Cable the Meta Direct FB + IG inbound handlers to dispatch to the agent pipeline by emitting the SAME Inngest event the ManyChat handler emits today (`agent/whatsapp.message_received`). Today both handlers are HUMAN-ONLY (D-12 / D-IG-01): they store the message and return — no agent dispatch. After this wire, FB/IG DMs reach `processMessageWithAgent` → `routeAgent` → `godentist-fb-ig`.

**CRITICAL architectural rule (RESEARCH §Architectural Responsibility Map + OQ-1):** the gate is NOT in the webhook handler. Do NOT add a `routeAgent` call here. The handler ALWAYS emits the event; the downstream pipeline (`webhook-processor.ts:242` `lifecycle_routing_enabled` gate + `routeAgent` at L265) decides agent-vs-silence. This mirrors the ManyChat handler verbatim (it never calls routeAgent). Human-only is preserved for Varixcenter / agentless workspaces because they have NO FB/IG routing rule → `routeAgent` returns `agent_id:null` → silence (RESEARCH A1 confirmed: Varixcenter has NO workspace_agent_config row → no router → human-only). D-03 requires this no-regression to be asserted behaviorally downstream (Task 4).

Replicate the v4-lock block INERT for parity (v4Path=false for godentist-fb-ig) so the event payload shape matches the ManyChat handler exactly and a future v4-on-FB/IG needs no re-touch (RESEARCH OQ-4).

Purpose: make `godentist-fb-ig` respond via Meta transport.
Output: 2 additive dispatch blocks + updated handler tests + a downstream D-03 silence assertion.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-fbig-meta-direct-cutover/CONTEXT.md
@.planning/standalone/godentist-fbig-meta-direct-cutover/RESEARCH.md
@CLAUDE.md

<interfaces>
<!-- resolveAgentIdForWorkspace signature (registry-helpers.ts:36) -->
```typescript
export async function resolveAgentIdForWorkspace(workspaceId: string): Promise<AgentId>
// returns 'godentist' | 'somnio-v3' | 'somnio-sales-v4' | 'somnio-recompra' | 'somnio-v2' ...
// NOTE: it maps conversational_agent_id; for GoDentist Valoraciones it returns 'godentist'
// (the WhatsApp default). The FB/IG agent (godentist-fb-ig) is selected DOWNSTREAM by the
// channel routing rule, NOT by this resolver. The resolver value is only used here to gate
// the v4 lock (v4Path === 'somnio-sales-v4') and to pass agentId in the event payload — exactly
// like the ManyChat handler does.
```

<!-- The EXACT dispatch block to mirror, from src/lib/manychat/webhook-handler.ts:153-280 -->
<!-- Steps 4 (contact_id fetch) + the v4-lock block (181-245, inert) + step 5 (inngest.send). -->
<!-- The ManyChat handler imports these STATICALLY (lines 24-28). -->
```typescript
import { randomUUID } from 'crypto'
import { acquireLock } from '@/lib/agents/interruption-system-v2/lock'
import { pushToPending } from '@/lib/agents/interruption-system-v2/pending'
import { redis } from '@/lib/agents/interruption-system-v2/redis-client'
import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
import { resolveAgentIdForWorkspace } from '@/lib/agents/registry-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
```
The Inngest event data shape (manychat handler L251-276) — replicate field-for-field:
name: 'agent/whatsapp.message_received'
data: { conversationId, contactId, messageContent, workspaceId, phone, messageId, messageTimestamp, messageType, mediaUrl, mediaMimeType, lockHolderUuid, lockKey, ownPendingEntryJson, lockChannel, lockIdentifier, agentId }
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Wire Meta FB inbound → agent dispatch (mirror ManyChat handler steps 4+5, v4-lock inert)</name>
  <read_first>
    - src/lib/messenger/webhook-handler.ts (the file being modified — read full; the dispatch goes between L193 `!domainResult.success` guard and L195 D-12 human-only comment)
    - src/lib/manychat/webhook-handler.ts:153-283 (the verbatim source: step 4 contact_id fetch, v4-lock block 181-245, step 5 inngest.send 247-280)
    - src/lib/agents/registry-helpers.ts:36-53 (resolveAgentIdForWorkspace)
  </read_first>
  <behavior>
    - After receiveMessage SUCCESS and NOT a dedup no-op (the existing `messageId === ''` guard returns early), the handler fetches contact_id, computes resolvedAgentId + v4Path (inert), and emits `agent/whatsapp.message_received` with the full data shape (lockChannel='facebook', lockIdentifier=psid).
    - For godentist-fb-ig v4Path is false → the lock block is skipped → lockHandle=null, ownPendingEntryJson=null in the event.
    - The dedup no-op path (existing L186-188 `return { stored: false }`) does NOT dispatch.
    - No `routeAgent` import or call is added.
  </behavior>
  <action>
Add the static imports at the top of `src/lib/messenger/webhook-handler.ts` (these are the SAME 7 imports the ManyChat handler uses; `findOrCreateConversation`/`receiveMessage`/`DomainContext` already imported — add the rest):
```typescript
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { acquireLock } from '@/lib/agents/interruption-system-v2/lock'
import { pushToPending } from '@/lib/agents/interruption-system-v2/pending'
import { redis } from '@/lib/agents/interruption-system-v2/redis-client'
import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
import { resolveAgentIdForWorkspace } from '@/lib/agents/registry-helpers'
```

Then REPLACE the human-only tail (currently lines 195-197):
```typescript
    // D-12: human-only inbox — NO Inngest agent dispatch, NO v4 lock.
    console.log(`[messenger-webhook] Processed facebook message from PSID ${psid} page ${pageId}`)
    return { stored: true }
```
with the dispatch block (mirrors ManyChat handler 153-283; messageText/messageType/mediaUrl already computed earlier in this file — reuse them):
```typescript
    // ================================================================
    // Standalone: godentist-fbig-meta-direct-cutover (Plan 02) — THE WIRE.
    // Mirror the ManyChat handler dispatch (steps 4 + 5). The gate is
    // DOWNSTREAM (processMessageWithAgent → lifecycle_routing_enabled →
    // routeAgent). We NEVER call routeAgent here. Agentless workspaces
    // (Varixcenter) emit too, but routeAgent→null → silence (human-only
    // preserved byte-identical — Regla 6, D-01/D-02/D-03).
    // ================================================================
    // 4. Get contact_id from conversation for the agent event.
    const supabase = createAdminClient()
    const { data: convForContact } = await supabase
      .from('conversations')
      .select('contact_id')
      .eq('id', conversationId)
      .single()

    const resolvedAgentId = await resolveAgentIdForWorkspace(workspaceId)
    const v4Path = resolvedAgentId === 'somnio-sales-v4' // inert for godentist-fb-ig

    const lockChannel: 'facebook' | 'instagram' = 'facebook'
    const lockIdentifier = psid

    let lockHandle: { key: string; holderUuid: string; startedAt: string } | null = null
    let ownPendingEntryJson: string | null = null

    if (v4Path) {
      try {
        lockHandle = await acquireLock(workspaceId, lockChannel, lockIdentifier)
        const entryUuid = randomUUID()
        const pendingEntry = {
          entry_uuid: entryUuid,
          content: messageText,
          received_at: new Date().toISOString(),
          msg_id: waMessageId,
        }
        if (!lockHandle) {
          const push = await pushToPending(workspaceId, lockChannel, lockIdentifier, pendingEntry)
          await redis.set(`interrupt:${workspaceId}:${lockChannel}:${lockIdentifier}`, waMessageId, { ex: 60 })
          emitLockEvent('lock_acquire_failed_follower', {
            existing_holder_uuid: 'unknown', my_msg_id: waMessageId,
            key: `lock:${workspaceId}:${lockChannel}:${lockIdentifier}`,
          })
          emitLockEvent('interrupt_written', { msg_id: waMessageId, pending_list_length: push.pendingListLength })
          console.log(`[interruption-v2] follower path — no Inngest dispatch for FB msg ${waMessageId}`)
          return { stored: true }
        }
        const push = await pushToPending(workspaceId, lockChannel, lockIdentifier, pendingEntry)
        ownPendingEntryJson = push.exactJson
        emitLockEvent('lock_acquired', {
          holder_uuid: lockHandle.holderUuid, msg_id: waMessageId,
          key: lockHandle.key, ttl: 45, started_at: lockHandle.startedAt,
        })
      } catch (lockErr) {
        emitLockEvent('redis_unavailable_fallback_failed', {
          error_message: lockErr instanceof Error ? lockErr.message : String(lockErr),
        })
        lockHandle = null
        ownPendingEntryJson = null
      }
    }

    // 5. Emit Inngest event for agent processing (reuse the existing event).
    try {
      const { inngest } = await import('@/inngest/client')
      await (inngest.send as any)({
        name: 'agent/whatsapp.message_received',
        data: {
          conversationId,
          contactId: convForContact?.contact_id ?? null,
          messageContent: messageText,
          workspaceId,
          phone: phoneIdentifier,
          messageId: waMessageId,
          messageTimestamp,
          messageType,
          mediaUrl: mediaUrl ?? null,
          mediaMimeType: null,
          lockHolderUuid: lockHandle?.holderUuid ?? null,
          lockKey: lockHandle?.key ?? null,
          ownPendingEntryJson,
          lockChannel,
          lockIdentifier,
          agentId: resolvedAgentId,
        },
      })
    } catch (inngestError) {
      console.error('[messenger-webhook] Inngest send failed:', inngestError instanceof Error ? inngestError.message : inngestError)
    }

    console.log(`[messenger-webhook] Dispatched facebook message from PSID ${psid} page ${pageId}`)
    return { stored: true }
```
NOTE: `mediaUrl` in this handler is `string | undefined` (line 115); the event uses `mediaUrl ?? null`. `messageType` is already `'text' | mediaKind` (line 118). Do NOT modify steps 1-3 (store path) — append only.
  </action>
  <verify>
    <automated>pnpm tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "agent/whatsapp.message_received" src/lib/messenger/webhook-handler.ts` == 1
    - `grep -c "resolveAgentIdForWorkspace" src/lib/messenger/webhook-handler.ts` == 1
    - `grep -c "routeAgent" src/lib/messenger/webhook-handler.ts` == 0
    - `grep -c "lockChannel" src/lib/messenger/webhook-handler.ts` >= 1 (parity field present)
    - The store steps untouched: `grep -c "domainReceiveMessage\|receiveMessage" src/lib/messenger/webhook-handler.ts` >= 1
    - `pnpm tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>FB handler emits the agent event (full payload, v4-lock inert) after store; no routeAgent import; typecheck green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire Meta IG inbound → agent dispatch (after the inline audio-transcription block)</name>
  <read_first>
    - src/lib/instagram/webhook-handler.ts (the file being modified — read full; dispatch goes AFTER the audio-transcription block L264-277 and BEFORE the D-IG-01 human-only return L279-281)
    - src/lib/messenger/webhook-handler.ts (the FB wire just written — same shape, lockChannel='instagram')
  </read_first>
  <behavior>
    - After receiveMessage success + the existing inline audio-transcription block (lines 264-277 STAY), the handler fetches contact_id, computes resolvedAgentId + v4Path (inert), and emits `agent/whatsapp.message_received` with lockChannel='instagram', lockIdentifier=igsid, messageContent=effectiveText, messageType=effectiveType.
    - The dedup no-op (L248-250 return) does NOT dispatch.
    - No routeAgent import/call.
  </behavior>
  <action>
Add the same 7 static imports to the top of `src/lib/instagram/webhook-handler.ts` (findOrCreateConversation/receiveMessage/DomainContext already present — add randomUUID, createAdminClient, the 4 interruption-v2 imports, resolveAgentIdForWorkspace).

The audio-transcription block (L264-277) STAYS verbatim. REPLACE the human-only tail (currently L279-281):
```typescript
    // D-IG-01: human-only inbox — NO Inngest agent dispatch, NO v4 lock.
    console.log(`[instagram-webhook] Processed instagram message from IGSID ${igsid} account ${igAccountId}`)
    return { stored: true }
```
with the dispatch block (identical structure to the FB wire; IG uses `effectiveText` + `effectiveType` + `mediaUrl` which are already computed; lockChannel='instagram', identifier=igsid):
```typescript
    // ================================================================
    // Standalone: godentist-fbig-meta-direct-cutover (Plan 02) — THE WIRE (IG).
    // Mirrors the FB wire + ManyChat handler. Gate is DOWNSTREAM (never
    // routeAgent here). Agentless workspaces emit too → routeAgent→null →
    // silence (human-only preserved — Regla 6, D-01/D-02/D-03).
    // ================================================================
    const supabase = createAdminClient()
    const { data: convForContact } = await supabase
      .from('conversations')
      .select('contact_id')
      .eq('id', conversationId)
      .single()

    const resolvedAgentId = await resolveAgentIdForWorkspace(workspaceId)
    const v4Path = resolvedAgentId === 'somnio-sales-v4'

    const lockChannel: 'facebook' | 'instagram' = 'instagram'
    const lockIdentifier = igsid

    let lockHandle: { key: string; holderUuid: string; startedAt: string } | null = null
    let ownPendingEntryJson: string | null = null

    if (v4Path) {
      try {
        lockHandle = await acquireLock(workspaceId, lockChannel, lockIdentifier)
        const entryUuid = randomUUID()
        const pendingEntry = {
          entry_uuid: entryUuid,
          content: effectiveText,
          received_at: new Date().toISOString(),
          msg_id: waMessageId,
        }
        if (!lockHandle) {
          const push = await pushToPending(workspaceId, lockChannel, lockIdentifier, pendingEntry)
          await redis.set(`interrupt:${workspaceId}:${lockChannel}:${lockIdentifier}`, waMessageId, { ex: 60 })
          emitLockEvent('lock_acquire_failed_follower', {
            existing_holder_uuid: 'unknown', my_msg_id: waMessageId,
            key: `lock:${workspaceId}:${lockChannel}:${lockIdentifier}`,
          })
          emitLockEvent('interrupt_written', { msg_id: waMessageId, pending_list_length: push.pendingListLength })
          console.log(`[interruption-v2] follower path — no Inngest dispatch for IG msg ${waMessageId}`)
          return { stored: true }
        }
        const push = await pushToPending(workspaceId, lockChannel, lockIdentifier, pendingEntry)
        ownPendingEntryJson = push.exactJson
        emitLockEvent('lock_acquired', {
          holder_uuid: lockHandle.holderUuid, msg_id: waMessageId,
          key: lockHandle.key, ttl: 45, started_at: lockHandle.startedAt,
        })
      } catch (lockErr) {
        emitLockEvent('redis_unavailable_fallback_failed', {
          error_message: lockErr instanceof Error ? lockErr.message : String(lockErr),
        })
        lockHandle = null
        ownPendingEntryJson = null
      }
    }

    try {
      const { inngest } = await import('@/inngest/client')
      await (inngest.send as any)({
        name: 'agent/whatsapp.message_received',
        data: {
          conversationId,
          contactId: convForContact?.contact_id ?? null,
          messageContent: effectiveText,
          workspaceId,
          phone: phoneIdentifier,
          messageId: waMessageId,
          messageTimestamp,
          messageType,
          mediaUrl: mediaUrl ?? null,
          mediaMimeType: null,
          lockHolderUuid: lockHandle?.holderUuid ?? null,
          lockKey: lockHandle?.key ?? null,
          ownPendingEntryJson,
          lockChannel,
          lockIdentifier,
          agentId: resolvedAgentId,
        },
      })
    } catch (inngestError) {
      console.error('[instagram-webhook] Inngest send failed:', inngestError instanceof Error ? inngestError.message : inngestError)
    }

    console.log(`[instagram-webhook] Dispatched instagram message from IGSID ${igsid} account ${igAccountId}`)
    return { stored: true }
```
Do NOT touch steps 1-3 or the audio-transcription block (append only).
  </action>
  <verify>
    <automated>pnpm tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "agent/whatsapp.message_received" src/lib/instagram/webhook-handler.ts` == 1
    - `grep -c "resolveAgentIdForWorkspace" src/lib/instagram/webhook-handler.ts` == 1
    - `grep -c "routeAgent" src/lib/instagram/webhook-handler.ts` == 0
    - The audio-transcription block stays: `grep -c "transcribeAudioFromUrl" src/lib/instagram/webhook-handler.ts` == 1
    - `grep -c "lockChannel: 'facebook' | 'instagram' = 'instagram'" src/lib/instagram/webhook-handler.ts` == 1
    - `pnpm tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>IG handler emits the agent event after store + transcription; no routeAgent; typecheck green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Rewrite the two handler tests — assert dispatch when present + Regla 6 grep gate (D-03)</name>
  <read_first>
    - src/lib/messenger/__tests__/webhook-handler.test.ts (read full — currently asserts NO dispatch at L180-188; mocks `@/lib/inngest/client`)
    - src/lib/instagram/__tests__/webhook-handler.test.ts (read full — currently asserts NO dispatch at L232-239)
    - src/lib/manychat/webhook-handler.ts:247-276 (the event shape to assert against)
  </read_first>
  <behavior>
    - FB test: with all domain mocks resolving success (non-dedup), processMessengerWebhook calls inngest.send ONCE with name `'agent/whatsapp.message_received'` and data containing conversationId + messageId='m_inbound_xyz' + lockChannel='facebook'.
    - FB test: on a dedup no-op (receiveMessage returns data.messageId === ''), inngest.send is NOT called.
    - IG test: same — dispatch once with lockChannel='instagram'; no dispatch on dedup.
    - Both: resolveAgentIdForWorkspace + the 4 interruption-v2 modules are mocked so no live Redis/DB.
  </behavior>
  <action>
The two tests currently mock `@/lib/inngest/client` and assert `mockInngestSend` is NOT called (FB L186, IG L239). The new code imports `@/inngest/client` dynamically (`await import('@/inngest/client')`) — note the path is `@/inngest/client`, NOT `@/lib/inngest/client`. Update the vi.mock target accordingly so the spy intercepts the real import:
```typescript
vi.mock('@/inngest/client', () => ({ inngest: { send: vi.fn() } }))
import { inngest } from '@/inngest/client'
const mockInngestSend = inngest.send as ReturnType<typeof vi.fn>
```
Also mock the new dependencies so the handler runs without Redis/registry I/O:
```typescript
vi.mock('@/lib/agents/registry-helpers', () => ({ resolveAgentIdForWorkspace: vi.fn(async () => 'godentist') }))
vi.mock('@/lib/agents/interruption-system-v2/lock', () => ({ acquireLock: vi.fn(async () => null) }))
vi.mock('@/lib/agents/interruption-system-v2/pending', () => ({ pushToPending: vi.fn(async () => ({ exactJson: '{}', pendingListLength: 1 })) }))
vi.mock('@/lib/agents/interruption-system-v2/redis-client', () => ({ redis: { set: vi.fn(async () => 'OK') } }))
vi.mock('@/lib/agents/interruption-system-v2/observability', () => ({ emitLockEvent: vi.fn() }))
```
Ensure the existing `@/lib/supabase/admin` mock's chainable builder returns `{ data: { contact_id: 'contact_1' }, error: null }` from `.single()` for the contact_id fetch (the existing `phoneSearchSingle` returns null — that's fine, but the new contact_id read uses `.single()` on conversations; the no-op builder returning null is acceptable since the code does `convForContact?.contact_id ?? null`).

REPLACE the `D-12 human-only (no agent dispatch)` describe block (FB L180-188) with two cases:
```typescript
describe('processMessengerWebhook — Plan 02 wire (agent dispatch)', () => {
  it('emits agent/whatsapp.message_received once with the facebook lockChannel', async () => {
    const { processMessengerWebhook } = await import('@/lib/messenger/webhook-handler')
    await processMessengerWebhook(makeEvent(), WS_ID, PAGE_ID)
    expect(mockInngestSend).toHaveBeenCalledTimes(1)
    const arg = mockInngestSend.mock.calls[0][0] as { name: string; data: Record<string, unknown> }
    expect(arg.name).toBe('agent/whatsapp.message_received')
    expect(arg.data).toMatchObject({ conversationId: 'conv_fb_1', messageId: 'm_inbound_xyz', lockChannel: 'facebook' })
  })

  it('does NOT dispatch on a dedup no-op (receiveMessage messageId === "")', async () => {
    mockReceiveMessage.mockResolvedValueOnce({ success: true, data: { messageId: '' } })
    const { processMessengerWebhook } = await import('@/lib/messenger/webhook-handler')
    await processMessengerWebhook(makeEvent(), WS_ID, PAGE_ID)
    expect(mockInngestSend).not.toHaveBeenCalled()
  })
})
```
Do the IG equivalent (replace the `D-IG-01 human-only` block L232-239), asserting `lockChannel: 'instagram'`.

Add a Regla 6 / D-03 grep-style gate as a unit test in BOTH files (or one shared) using node fs to assert the handler source contains NO `routeAgent`:
```typescript
import { readFileSync } from 'fs'
it('D-03/Regla 6 — handler never imports or calls routeAgent (gate stays downstream)', () => {
  const src = readFileSync('src/lib/messenger/webhook-handler.ts', 'utf8')
  expect(src).not.toMatch(/routeAgent/)
})
```
(Use the correct path per file.) Update the file header comments to reflect the wire (no longer human-only).
  </action>
  <verify>
    <automated>pnpm vitest run src/lib/messenger/__tests__/webhook-handler.test.ts src/lib/instagram/__tests__/webhook-handler.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm vitest run src/lib/messenger/__tests__/webhook-handler.test.ts src/lib/instagram/__tests__/webhook-handler.test.ts` exits 0
    - Both test files assert dispatch: `grep -c "toHaveBeenCalledTimes(1)" src/lib/messenger/__tests__/webhook-handler.test.ts` >= 1
    - Both test files keep a no-dispatch-on-dedup case: `grep -c "not.toHaveBeenCalled" src/lib/messenger/__tests__/webhook-handler.test.ts` >= 1
    - Regla 6 source-grep gate present in the test (inside the `.not.toMatch` assertion): `grep -c "routeAgent" src/lib/messenger/__tests__/webhook-handler.test.ts` >= 1
    - Live Regla 6 gate scoped to the HANDLER SOURCE FILES only (NOT the test files, which intentionally mention routeAgent inside `.not.toMatch`): `grep -rn routeAgent src/lib/messenger/webhook-handler.ts src/lib/instagram/webhook-handler.ts` returns 0 matches. (This matches the `<verification>` block at the bottom of this plan — do NOT use the directory-wide `grep -rn "routeAgent" src/lib/messenger src/lib/instagram` form, which would falsely fail on the test file's `.not.toMatch(/routeAgent/)`.)
  </acceptance_criteria>
  <done>Both handler tests assert dispatch + no-dispatch-on-dedup + the routeAgent-absent gate; live gate scoped to handler source; suite green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: D-03 downstream no-regression — agentless workspace (routeAgent→agent_id:null) stays human-only (0 outbound)</name>
  <read_first>
    - src/lib/agents/production/__tests__/webhook-processor-routing.test.ts (read full — has a `simulateGate` helper + RouteDecision model; already covers flag-OFF parity + human_handoff silence at ~L216)
    - src/lib/agents/production/webhook-processor.ts:240-312 (the gate: lifecycle_routing_enabled → routeAgent → applyRouterDecision; `silence`/`human_handoff` returns success with NO runner)
    - src/lib/agents/routing/route.ts (RouteDecision shape — kind 'silence' | reason 'human_handoff' / null agent for agentless workspace)
  </read_first>
  <behavior>
    - D-03 (Varixcenter / agentless workspace): the handler ALWAYS emits the inbound event (Tasks 1-2), but downstream the router returns no agent (agentless workspace has no FB/IG routing rule → routeAgent yields a silence/null-agent decision). The pipeline MUST return success with NO runner invocation and NO outbound message — human-only preserved (Regla 6).
    - This is the behavioral counterpart to the handler-level grep gate in Task 3: it proves silence happens DOWNSTREAM, not in the handler.
  </behavior>
  <action>
Add ONE focused test to `src/lib/agents/production/__tests__/webhook-processor-routing.test.ts` (reuse the existing `simulateGate` helper + `RouteDecision` model — do not introduce live DB/Redis). Add it under a new describe block `D-03 — agentless workspace stays human-only (no regression)`:

```typescript
it('D-03 — flag ON + agentless workspace (routeAgent yields silence/null agent) → no runner, no outbound', async () => {
  // Varixcenter-shaped: lifecycle routing enabled, but no FB/IG rule → router silences.
  const decision: RouteDecision = {
    kind: 'silence',
    reason: 'human_handoff', // agentless workspace → no agent selected → silence
    // (use the SAME shape the existing human_handoff case at ~L216 uses; if the
    //  model exposes a null agent_id field for agentless, set agent_id: null too)
  }
  const outcome = await simulateGate({
    flagEnabled: true,
    contactId: 'contact_varix',
    routeAgentResult: decision,
  })
  expect(outcome.routeAgentCalled).toBe(true)
  // The gate returned success WITHOUT invoking a runner (human-only preserved).
  expect(outcome.runnerInvoked).toBeFalsy() // or: assert no outbound send was modeled
  // Reuse whatever the existing human_handoff case at ~L216 asserts for "no runner".
})
```

Match the helper's actual return field names (read the file first — the existing human_handoff case at ~L216 asserts the silence/no-runner outcome; reuse the SAME assertion form, e.g. `outcome.collectorEvents[0].name === 'router_human_handoff'` and the absence of a runner-invoked flag). The goal is a behavioral assertion that an agentless-workspace route decision yields ZERO outbound work. Do NOT duplicate the existing generic human_handoff test — frame this one explicitly as the agentless-workspace (Varixcenter) D-03 no-regression case via the test name + comment.

If the `simulateGate` model genuinely cannot represent an agentless/null-agent decision distinctly from the existing human_handoff case, then the existing ~L216 test already covers the silence path — in that case, ADD an explicit `it.skip`-free aliased test name documenting the agentless mapping and assert the same silence outcome, so D-03 has a named, executable assertion.
  </action>
  <verify>
    <automated>pnpm vitest run src/lib/agents/production/__tests__/webhook-processor-routing.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm vitest run src/lib/agents/production/__tests__/webhook-processor-routing.test.ts` exits 0
    - A named D-03 agentless case exists: `grep -c "D-03" src/lib/agents/production/__tests__/webhook-processor-routing.test.ts` >= 1
    - The case asserts no outbound/runner on the agentless silence path (reusing the existing silence assertion form).
  </acceptance_criteria>
  <done>A named, executable D-03 test proves an agentless workspace (routeAgent→silence/null agent) produces zero outbound — human-only preserved downstream of the always-emit handler.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Meta webhook → agent pipeline | Untrusted DM crosses into the agent dispatch; workspace resolved upstream by page_id/ig_account_id (route.ts), never payload sender |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cut-04 | Elevation of privilege | Agent dispatch for agentless workspace | mitigate | Handler emits unconditionally but downstream routeAgent→null → silence; no FB/IG rule for Varixcenter (A1) → human-only preserved (Task 4 behavioral assertion) |
| T-cut-05 | Spoofing | Cross-tenant via payload sender | accept | workspaceId resolved by entry.id in route.ts (unchanged); handler receives it as a param, never reads sender for routing |
| T-cut-06 | Tampering | routeAgent called in handler (divergence) | mitigate | Grep gate asserts no routeAgent in handler source files (D-03 / Pitfall 3) |
</threat_model>

<verification>
- `pnpm tsc --noEmit` exits 0
- `pnpm vitest run src/lib/messenger src/lib/instagram` exits 0
- `pnpm vitest run src/lib/agents/production/__tests__/webhook-processor-routing.test.ts` exits 0
- Regla 6 grep gate (scoped to handler SOURCE files): `grep -rn "routeAgent" src/lib/messenger/webhook-handler.ts src/lib/instagram/webhook-handler.ts` returns 0
- The store path (steps 1-3) byte-identical: `git diff` shows only appended dispatch + imports, no edits to findOrCreateConversation/resolveOrCreateContact/receiveMessage calls.
</verification>

<success_criteria>
- Both Meta handlers emit `agent/whatsapp.message_received` after a successful (non-dedup) store, with the full ManyChat-parity payload (v4-lock inert).
- Gate stays downstream (no routeAgent in handler source).
- Human-only preserved for agentless workspaces — asserted behaviorally downstream (Task 4) + by the handler-source grep gate.
- Tests green.
</success_criteria>

<output>
After completion, create `.planning/standalone/godentist-fbig-meta-direct-cutover/02-SUMMARY.md`
</output>
</content>

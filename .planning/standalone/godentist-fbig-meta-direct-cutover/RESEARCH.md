# Phase: godentist-fbig-meta-direct-cutover — Research

**Researched:** 2026-06-06
**Domain:** Internal codebase — Meta Direct FB/IG inbound→agent wiring + ManyChat decommission
**Confidence:** HIGH (every claim below is backed by a file:line I read this session)

## Summary

This is an **internal-codebase** standalone. The stack is fixed (Next.js 15, Supabase admin domain layer, Inngest, Meta Graph API). The work is two blocks:

**Block A** — wire the Meta Direct FB/IG inbound handlers (`processMessengerWebhook` / `processInstagramWebhook`) to dispatch to the agent pipeline by emitting the SAME Inngest event the ManyChat handler emits today (`agent/whatsapp.message_received`), and gate it so workspaces without a resolved FB/IG agent stay human-only byte-identical.

**Block B** — re-point the other 3 ManyChat workspaces off `manychat` and delete all ManyChat code/keys/env/migration value.

**Key architectural discovery (changes the plan shape):** the **gate is NOT in the webhook handler**. The ManyChat handler at `src/lib/manychat/webhook-handler.ts:247-280` does NOT call `routeAgent`. It blindly emits `agent/whatsapp.message_received`. The actual routing/gate lives **downstream** inside `processMessageWithAgent` (`src/lib/agents/production/webhook-processor.ts:242-336`), which runs `routeAgent` ONLY when `workspace_agent_config.lifecycle_routing_enabled === true` (line 242). So the new Meta-inbound dispatch should **mirror the ManyChat handler exactly**: just emit the event; the existing pipeline does the channel routing. The "human-only vs agent" gate for Varixcenter is achieved because Varixcenter has no FB/IG routing rule → `routeAgent` returns `agent_id: null` → `human_handoff` → silence.

**The single biggest hazard is OUTBOUND, not inbound.** Three send paths hard-require `settings.manychat_api_key` for FB/IG and `return` early if it's missing, BEFORE reaching the provider chokepoint in `domain/messages.ts`. When GoDentist flips to `meta_direct` and deletes its ManyChat key (D-06), the **agent messaging adapter** (`messaging.ts:184-187`) would return `messagesSent: 0` and the bot goes mute. These three paths must be patched to skip the key requirement when the provider is `meta_direct` (the web inbox action `src/app/actions/messages.ts:147-163` ALREADY does this correctly — copy that pattern).

**Primary recommendation:** Mirror the ManyChat dispatch block into both Meta handlers (additive, behind a `resolveAgentIdForWorkspace !== null`-style gate that mirrors the v4 lock gating already present), patch the 3 outbound key-resolution sites to be provider-aware, then decommission ManyChat in a strict sequence (re-point → enum-drop migration → delete code).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Gate is **auto by routing rule**. Meta inbound (FB/IG) → `routeAgent`/`resolveAgentIdForWorkspace` for `(workspace_id, channel)`. Agent ≠ null → dispatch; null → human-only (Varixcenter behavior). Zero new config. Same pattern as `godentist-fb-ig` D-14/D-15.
- **D-02:** **No separate feature flag.** Agent resolution IS the control. Varixcenter has no FB/IG agent rule → null → human-only byte-identical (Regla 6). Rollback = re-flip providers / disable routing rule (while pre-decommission code is alive — D-07).
- **D-03:** Human-only behavior of Varixcenter / any agentless workspace must be **byte-identical**. No-regression tests mandatory (grep + diff + behavioral: dispatch=0 when routeAgent=null).
- **D-04:** Cutover sequence: **connect Meta first, verify, then disconnect ManyChat.** 1) deploy wire (additive) → 2) connect FB+IG of Valoraciones → 3) flip providers msgr/ig → `meta_direct` (wa intact) → 4) subscribe page in Meta App + verify agent responds via Meta → 5) **immediately** disconnect page/IG in ManyChat. Brief overlap mitigated by dedup (D-05) + immediacy of step 5.
- **D-05:** During overlap, double-response mitigated by: (a) idempotency/dedup by message id in Meta path, (b) provider flip redirects OUTBOUND to Meta immediately, (c) immediate ManyChat disconnect after verify.
- **D-06:** Valoraciones cutover **deletes its ManyChat keys** (`manychat_api_key`, `manychat_webhook_secret` from that workspace's settings).
- **D-07:** **Full decommission confirmed.** After Valoraciones verified LIVE via Meta: re-point other 3 workspaces off `manychat`, delete all ManyChat code (webhook route, `src/lib/manychat/**`, settings UI, env `MANYCHAT_*`, provider option `'manychat'`). User accepts those 3 (dormant) lose FB/IG-via-ManyChat.
- **D-08:** **Safety checkpoint between A and B:** code deletion (Block B, hard to revert) happens **AFTER** Valoraciones cutover (Block A) is verified in prod. Before checkpoint, rollback = re-flip providers to `manychat` + reconnect ManyChat (code still alive). After checkpoint, manychat rollback no longer applies (deliberate point of no return).
- **D-09:** GoDentist (`36a74890`), Somnio (`a3843b3f`), Pruebas Morfx (`4b5d84dd`) re-pointed off `manychat`. **Destination value to confirm in research (OQ-8).** None has an FB/IG agent sending → OUTBOUND doesn't apply; the real effect is their inbound-via-ManyChat turns off.
- **D-10:** **Regla 6 on Somnio:** productive workspace. Its FB/IG is dormant (0 convs in 37d, no FB/IG rule) but the provider change touches a productive workspace → explicit verification that NO Somnio agent (sales-v3, recompra, pw-confirmation, v4) nor its WhatsApp is affected. WhatsApp NOT touched.

### Claude's Discretion
- Internal structure of the wire (where the gate lives in the Meta path, how the dispatch pattern is shared with the ManyChat handler before deletion) — research/planner decide, respecting that the ManyChat handler is deleted at the end.
- Order of file deletion in Block B (what to delete first to keep typecheck/build green per commit).

### Deferred Ideas (OUT OF SCOPE)
- Migrating the REAL FB/IG of GoDentist/Somnio/Pruebas to Meta Direct with connected pages (today they're just re-pointed/turned off because dormant).
- Bug `contact_id` null in FB/IG conversations (`normalizePhone('ig-/fb-...')`=null) → standalone `channel-contact-resolution`.
- Pending Phase 41 live media re-smokes (IG/FB) — separate from this standalone.
</user_constraints>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Meta FB/IG inbound receipt + HMAC + tenant routing | API route (`/api/webhooks/meta/route.ts`) | — | Already done; resolves workspace by page_id/ig_account_id |
| Store inbound message (conv/contact/message) | Domain layer (`domain/conversations`, `domain/contacts`, `domain/messages`) | Meta webhook handlers | Already done (Regla 3); handlers only orchestrate |
| **Agent dispatch decision (gate)** | **Inngest fn → `processMessageWithAgent` → `routeAgent`** | webhook handler (just emits event) | The handler does NOT decide; the pipeline does (`lifecycle_routing_enabled` gate) |
| Channel routing rule evaluation | `routing/route.ts` + `routing/facts.ts` (`channel` fact) | — | First-hit, channel-aware; already wired |
| Agent execution (godentist-fb-ig) | `webhook-processor.ts:820` branch → `V3ProductionRunner` | — | Already wired; no change |
| **Outbound provider decision** | **Domain `messages.ts` (`readMessengerProvider`/`readInstagramProvider`)** | meta-*-sender / manychat-sender | Single chokepoint; but key-resolution sites upstream must be provider-aware |
| Outbound key/credential resolution | `messaging.ts`, `messages-send-idempotent.ts`, `agent-timers-v3/v4.ts`, `actions/messages.ts` | — | 3 of 4 block on missing manychat key — MUST be patched |

---

## Phase Requirements → Research Support

(No formal REQ-IDs in CONTEXT; mapping the two blocks + 8 OQs instead — see `## Answers to Open Questions`.)

---

## Architecture Patterns

### Inbound→Agent Data Flow (current ManyChat path vs target Meta path)

```
                          INBOUND
  ManyChat (TODAY)                         Meta Direct (TARGET)
  ───────────────                          ────────────────────
  POST /api/webhooks/manychat              POST /api/webhooks/meta  (object='page'|'instagram')
        │                                        │  HMAC verify (already)
        │ resolveWorkspaceForManyChat            │  resolveByPageId / resolveByIgAccountId (already)
        ▼                                        ▼
  processManyChatWebhook                   processMessengerWebhook / processInstagramWebhook
   1 findOrCreateConversation               1 findOrCreateConversation        ← SAME (already)
   2 link contact                           2 resolveOrCreateContact + link   ← SAME (already)
   3 receiveMessage (domain, dedup on mid)  3 receiveMessage (domain, dedup)  ← SAME (already)
   4 get contact_id                         4 get contact_id                  ← ADD
   5 inngest.send('agent/whatsapp           5 inngest.send('agent/whatsapp    ← ADD (the wire)
      .message_received')                      .message_received')
        │                                        │
        └──────────────────┬─────────────────────┘
                           ▼
        Inngest fn whatsappAgentProcessor (agent-production.ts:51)
                           ▼  step 'process-message'
        processMessageWithAgent (webhook-processor.ts:101)
          • isAgentEnabledForConversation gate (line 113)
          • routerEnabled = lifecycle_routing_enabled (line 242)   ← THE GATE
          • routeAgent({contactId, workspaceId, conversationId})    (line 265)
              └─ channel fact (facts.ts:262) → routing rule → agent_id
          • disposition: silence (human_handoff) | use-agent | fallback-legacy
          • branch agentId==='godentist-fb-ig' (line 820) → V3ProductionRunner
                           ▼
                          OUTBOUND
        ProductionMessagingAdapter.send (messaging.ts:140)
          • getChannelCredentials → settings.manychat_api_key (line 52)  ← HAZARD
          • domain sendTextMessage (messages.ts:223)
              └─ readMessengerProvider / readInstagramProvider (CHOKEPOINT)
                  meta_direct → metaFacebookSender/metaInstagramSender (Meta creds)
                  manychat    → getChannelSender (manychat-sender)
```

### Pattern 1: Mirror the ManyChat dispatch block into the Meta handlers (THE WIRE)
**What:** Add steps 4 + 5 to `processMessengerWebhook` and `processInstagramWebhook`, copied from `src/lib/manychat/webhook-handler.ts:153-280`.
**When to use:** After step 3 (`receiveMessage`) succeeds and was NOT a dedup no-op.
**Where exactly:**
- `src/lib/messenger/webhook-handler.ts` — insert between line 193 (after the `!domainResult.success` guard) and line 195 (the `// D-12: human-only` comment). Replace the human-only comment + return with the dispatch block.
- `src/lib/instagram/webhook-handler.ts` — insert between line 255 (after the `!domainResult.success` guard) and the audio-transcription block at line 264. (Audio transcription stays — it's INLINE and independent of dispatch. The dispatch goes AFTER transcription, before line 279/280 human-only return.)

**Gate to replicate (mirror the ManyChat handler's v4-gating shape verbatim):**
```typescript
// Source: src/lib/manychat/webhook-handler.ts:181-280 (replicate verbatim shape)
import { resolveAgentIdForWorkspace } from '@/lib/agents/registry-helpers'  // STATIC import (REVISION B4)
// ... after receiveMessage success + contact_id fetch:

const resolvedAgentId = await resolveAgentIdForWorkspace(workspaceId)
const v4Path = resolvedAgentId === 'somnio-sales-v4'   // inert for godentist-fb-ig (v4Path=false)
// (v4 lock block stays verbatim from manychat handler lines 187-245 — inert for FB/IG today)

const lockChannel: 'facebook' | 'instagram' = 'facebook' // or 'instagram' in the IG handler
const lockIdentifier = psid // (= subscriberId/IGSID = external_subscriber_id, D-10)

// Emit the SAME event the ManyChat handler emits (lines 247-276):
const { inngest } = await import('@/inngest/client')
await (inngest.send as any)({
  name: 'agent/whatsapp.message_received',
  data: {
    conversationId,
    contactId: convForContact?.contact_id ?? null,
    messageContent: effectiveText,   // FB: messageText; IG: effectiveText
    workspaceId,
    phone: phoneIdentifier,
    messageId: waMessageId,
    messageTimestamp,
    messageType,                     // 'text' | mediaKind
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
```

**CRITICAL — do NOT add a `routeAgent` call in the handler.** The gate is downstream. The handler always emits; `processMessageWithAgent` decides via `lifecycle_routing_enabled` + `routeAgent`. This is exactly what the ManyChat handler does (it never calls routeAgent). Adding routeAgent in the handler would diverge from the proven path and double-resolve.

**Why human-only is preserved for Varixcenter (the actual mechanism):**
1. Varixcenter has NO FB/IG agent routing rule → `routeAgent` returns `{agent_id: null, reason: 'no_rule_matched'}` (route.ts:149).
2. `applyRouterDecision(no_rule_matched, defaultAgent)` → BUT for an agentless workspace the default `conversational_agent_id` is also not an FB/IG agent. **CAUTION (see Pitfall 1):** `no_rule_matched` falls back to the workspace's `conversational_agent_id`. If Varixcenter's `lifecycle_routing_enabled` is `false` (the default per Regla 6), the router block at webhook-processor.ts:246 NEVER runs → legacy if/else → `isAgentEnabledForConversation` (line 113) gates it. Confirm Varixcenter's `lifecycle_routing_enabled` AND `isAgentEnabledForConversation` both resolve to "no agent" (see OQ-1 + Open Questions).

### Pattern 2: Provider-aware outbound key resolution (THE HAZARD FIX)
**What:** Patch the 3 send paths that hard-require `manychat_api_key` so they skip it when the workspace provider for that channel is `meta_direct`.
**Reference (the CORRECT pattern, already in the web inbox action):**
```typescript
// Source: src/app/actions/messages.ts:147-163
const isMetaDirectFacebook =
  channel === 'facebook' && workspaceSettings?.messenger_provider === 'meta_direct'
const isMetaDirectInstagram =
  channel === 'instagram' && workspaceSettings?.instagram_provider === 'meta_direct'
if (!isMetaDirectFacebook && !isMetaDirectInstagram) {
  if (channel === 'facebook' || channel === 'instagram') {
    apiKey = workspaceSettings?.settings?.manychat_api_key
    if (!apiKey) return { error: 'API key de ManyChat no configurada' }
  } // ... else whatsapp
}
// meta_direct arm leaves apiKey undefined; the domain ignores it and resolves Meta creds.
```
**Apply to (file:line of the blocking check):**
1. `src/lib/agents/engine-adapters/production/messaging.ts:50-62` (`getChannelCredentials`) + the early-return at `messaging.ts:184-187`. **This is the AGENT path — highest priority.**
2. `src/lib/domain/messages-send-idempotent.ts:256-258` (mobile inbox reply).
3. `src/inngest/functions/agent-timers-v3.ts:58-65` AND `src/inngest/functions/agent-timers-v4.ts:71-78` (retake timers).

### Recommended Project Structure
No new files for Block A wiring (edit the 2 Meta handlers + 3 outbound sites). Block B is deletions + 1 migration (see Decommission Map).

### Anti-Patterns to Avoid
- **Calling `routeAgent` directly in the Meta webhook handler.** The proven path emits the event and lets `processMessageWithAgent` route. (manychat handler never calls routeAgent.)
- **Hardcoding `agentId='godentist-fb-ig'` in the dispatch.** Pass `agentId: resolvedAgentId` (from `resolveAgentIdForWorkspace`) like the manychat handler does — the downstream pipeline + routing rule decide the real agent.
- **Deleting `manychat-sender.ts` without first fixing `channels/registry.ts`.** The registry maps `facebook`/`instagram` → manychat senders and is imported by the domain send chokepoint's `manychat` else-branch. (See Decommission Map.)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Agent dispatch event | New event/runner | `inngest.send('agent/whatsapp.message_received')` (manychat handler L247-276) | Proven path; downstream pipeline + routing already consume it |
| Agent resolution gate | New flag/config | `resolveAgentIdForWorkspace` (registry-helpers.ts:36) + `lifecycle_routing_enabled` gate (webhook-processor.ts:242) | Already the control surface (D-01/D-02) |
| Channel-based routing | New conditional | `channel` fact (facts.ts:262) + existing routing rule (priority 100) | Rule already exists for godentist-fb-ig |
| Inbound dedup | New dedup table | `receiveMessage` idempotency on `wamid` (the `mid`) — handlers already check `messageId === ''` no-op | Already wired in both Meta handlers (msgr L186, ig L248) |
| Provider→sender selection | New branch | `readMessengerProvider`/`readInstagramProvider` chokepoint (messages.ts:77-107) | Single Regla-3 decision site |
| meta_direct key skip | New logic | Copy `src/app/actions/messages.ts:147-163` pattern | Already correct in the web inbox path |

**Key insight:** Almost everything needed already exists. Block A is ~30 lines of dispatch (copied) per handler + 3 provider-aware key patches. The risk is in what you DELETE (Block B), not what you add.

---

## Common Pitfalls

### Pitfall 1: `lifecycle_routing_enabled` may be OFF — the gate path differs
**What goes wrong:** D-01 assumes `routeAgent` always runs. But `routeAgent` runs ONLY when `workspace_agent_config.lifecycle_routing_enabled === true` (webhook-processor.ts:242). If GoDentist Valoraciones has it `false`, the channel routing rule is NEVER evaluated and the legacy if/else routes by `conversational_agent_id` — which for Valoraciones is likely `godentist` (WhatsApp), NOT `godentist-fb-ig`. Then FB/IG messages would route to the wrong agent or none.
**Why it happens:** The `godentist-fb-ig` activation (CLAUDE.md) explicitly requires `lifecycle_routing_enabled=true` for the routing rule to fire — the pre-check SQL in agent-scope.md confirms this. ManyChat works TODAY only because this flag is already true for Valoraciones (otherwise the sibling would never have responded).
**How to avoid:** **VERIFY in prod** that `workspace_agent_config.lifecycle_routing_enabled = true` for `f0241182-…` BEFORE cutover. The agent-scope.md SQL pre-check (CLAUDE.md godentist-fb-ig section) already documents this. If false, enable it (it's already the live mechanism for ManyChat). Add an explicit verification step in the plan.
**Warning signs:** FB/IG message arrives via Meta but agent stays silent OR `godentist` (not the sibling) responds.

### Pitfall 2: OUTBOUND mute after key deletion (the big one)
**What goes wrong:** D-06 deletes `manychat_api_key`. The agent adapter `messaging.ts:184-187` returns `messagesSent: 0` when `getChannelCredentials` returns null apiKey — and it returns null for FB/IG because it ALWAYS reads `manychat_api_key` (line 52) regardless of provider. Bot goes mute even though provider=meta_direct.
**Why it happens:** `getChannelCredentials` (messaging.ts:36-62) is NOT provider-aware. Same for `messages-send-idempotent.ts:257`, `agent-timers-v3.ts:59`, `agent-timers-v4.ts:72`.
**How to avoid:** Patch all 4 sites to be provider-aware (Pattern 2). **Order matters per D-04:** patch + deploy these BEFORE flipping providers/deleting keys, or flip providers but DON'T delete keys until the patch is live. Safest: deploy the wire + the provider-aware patches together (Block A), THEN cutover.
**Warning signs:** Inbound stored, agent runs, "Channel API key not configured" log, 0 messages sent.

### Pitfall 3: Regla 6 — byte-identical preservation
**What goes wrong:** Editing the shared Meta handlers / domain send paths / registry breaks Varixcenter (human-only FB/IG via Meta), Somnio, or WhatsApp.
**How to avoid:**
- Meta handler edits are ADDITIVE (append dispatch after store). The store steps (1-3) stay verbatim.
- The dispatch is gated only by emitting the event; human-only is preserved because Varixcenter has no FB/IG rule (routeAgent→null) AND/OR `isAgentEnabledForConversation`=false. **Grep-testable:** no `routeAgent` import added to the handlers; the gate stays downstream.
- WhatsApp is untouched: do NOT modify `readWhatsappProvider` or the whatsapp arm. Grep: `git diff` shows zero changes to whatsapp-provider lines.
- Provider-aware key patches must keep the `manychat` arm byte-identical (mirror messages.ts:147-163 which preserves it).
**Warning signs:** Varixcenter FB/IG starts auto-responding; Somnio WhatsApp behavior changes.

### Pitfall 4: Deleting `manychat-sender.ts` breaks `channels/registry.ts`
**What goes wrong:** `registry.ts:9,13-14` imports + maps `manychatFacebookSender`/`manychatInstagramSender`. The domain send chokepoint's `manychat` else-branch calls `getChannelSender(channel)` (messages.ts:277,304). Deleting the sender without rewiring breaks the build AND any workspace still on `manychat` (during the overlap before all 4 are re-pointed).
**How to avoid:** In Block B, the registry's `facebook`/`instagram` entries become unused only AFTER all 4 workspaces are off `manychat` (so the `manychat` branch is never taken). Delete order: (1) re-point all 4 workspaces, (2) verify no workspace has `manychat`, (3) remove the manychat else-branches from `messages.ts` send functions (they become dead), (4) remove `getChannelSender` calls / collapse `ChannelType` to whatsapp-only or repoint registry, (5) delete `manychat-sender.ts` + `manychat/**`.
**Warning signs:** typecheck fails on registry import; a still-`manychat` workspace errors on send.

### Pitfall 5: Double-response during connect-first/disconnect-later overlap (D-04/D-05)
**What goes wrong:** Between provider flip + Meta connect (step 3-4) and ManyChat disconnect (step 5), the SAME customer DM could arrive via BOTH ManyChat (`mc-<id>`) and Meta (`fb-<psid>`/`ig-<igsid>`).
**Why dedup does NOT catch it:** The two paths use DIFFERENT identifiers and DIFFERENT message ids. ManyChat dedups on `payload.message_id` and uses `mc-<subscriber_id>` conversations (manychat handler L83,129). Meta uses `fb-<psid>`/`ig-<igsid>` conversations and `message.mid` (msgr L84,171; ig L132,233). They create SEPARATE conversations → SEPARATE Inngest events → the per-conversation concurrency=1 (agent-production.ts:67-72) does NOT serialize across them. **So inbound dedup is insufficient during overlap (confirmed).**
**How to avoid:** Rely on D-04's sequence discipline: the provider flip (step 3) redirects OUTBOUND to Meta immediately, so even if ManyChat receives the DM, its agent reply would go through the SAME domain send → now meta_direct → Meta (not ManyChat). The real residual risk is ManyChat's OWN flow auto-replying (outside our code). Mitigation = **immediate** ManyChat disconnect (step 5) right after verify, ideally within the same maintenance minute. Accept the brief window per D-05.
**Warning signs:** Two near-identical bot replies; two conversations for the same person (`mc-` and `fb-`/`ig-`).

### Pitfall 6: `'use server'` files export only async functions
**What goes wrong:** If a plan adds a helper to `meta-onboarding.ts` or another `'use server'` file, a non-async export breaks the build.
**How to avoid:** Keep new helpers in non-`'use server'` modules (e.g., the webhook handlers are NOT server-action files — safe). Documented in additional_context.

---

## Code Examples

### The ManyChat dispatch snippet to replicate (verbatim source)
```typescript
// Source: src/lib/manychat/webhook-handler.ts:153-280 (steps 4 + 5; v4 lock block 181-245 stays inert)
// 4. Get contact_id from conversation for agent event
const { data: convForContact } = await supabase
  .from('conversations').select('contact_id').eq('id', conversationId).single()

const resolvedAgentId = await resolveAgentIdForWorkspace(workspaceId)
const v4Path = resolvedAgentId === 'somnio-sales-v4'   // false for godentist-fb-ig → block inert
// (lines 187-245: v4 lock acquire/follower — copy verbatim; inert when v4Path=false)

// 5. Emit Inngest event for agent processing (reuse existing event)
const { inngest } = await import('@/inngest/client')
await (inngest.send as any)({
  name: 'agent/whatsapp.message_received',
  data: { conversationId, contactId: convForContact?.contact_id ?? null,
    messageContent: messageText, workspaceId, phone: phoneIdentifier,
    messageId: waMessageId, messageTimestamp, messageType: 'text',
    mediaUrl: null, mediaMimeType: null,
    lockHolderUuid: lockHandle?.holderUuid ?? null, lockKey: lockHandle?.key ?? null,
    ownPendingEntryJson, lockChannel, lockIdentifier, agentId: resolvedAgentId },
})
```

### The provider-read chokepoint (already correct — do NOT change)
```typescript
// Source: src/lib/domain/messages.ts:77-107
async function readMessengerProvider(supabase, workspaceId): Promise<'manychat'|'meta_direct'> {
  const { data: ws } = await supabase.from('workspaces')
    .select('messenger_provider').eq('id', workspaceId).single()
  return ws?.messenger_provider === 'meta_direct' ? 'meta_direct' : 'manychat'
}
// Used in sendTextMessage facebook arm (messages.ts:260) + instagram arm (messages.ts:287).
// meta_direct → metaFacebookSender/metaInstagramSender (resolveByWorkspace creds);
// missing creds → return {success:false, error:'Credenciales Meta no configuradas'} (no crash).
```

### Negative-claim evidence: meta_direct without creds does NOT crash
```typescript
// Source: src/lib/domain/messages.ts:264-267 (facebook), 291-294 (instagram)
const creds = await resolveByWorkspace(ctx.workspaceId, 'facebook')
if (!creds?.accessToken || !creds.pageId) {
  return { success: false, error: 'Credenciales Meta no configuradas' }  // graceful
}
```

---

## Answers to Open Questions (OQ-1..OQ-8)

### OQ-1 — Gate / dispatch
**Answer:** `routeAgent`/`resolveAgentIdForWorkspace` DO resolve `godentist-fb-ig` via the `channel in [facebook,instagram]` rule — BUT **not inside the webhook handler**. Evidence:
- The ManyChat handler never calls `routeAgent`; it emits `agent/whatsapp.message_received` (`src/lib/manychat/webhook-handler.ts:247-276`).
- The Inngest fn `whatsappAgentProcessor` (`src/inngest/functions/agent-production.ts:51,74,441-444`) consumes that event and calls `processMessageWithAgent`.
- `processMessageWithAgent` runs `routeAgent` ONLY when `lifecycle_routing_enabled === true` (`webhook-processor.ts:242`, `routeAgent` call at line 265).
- `routeAgent` resolves the `channel` fact (`facts.ts:262-269` → `getConversationChannel` `conversations.ts:394`) and the routing rule emits `agent_id` (route.ts:122-151). `godentist-fb-ig` then dispatched at `webhook-processor.ts:820`.

**Exact gate (human-only vs agent):** Two layers, both must say "no agent" for human-only:
1. `isAgentEnabledForConversation` (webhook-processor.ts:113) — if no agent enabled, return success/silence.
2. `routeAgent` returns `agent_id: null` (`reason: no_rule_matched` route.ts:149) when no rule matches → `applyRouterDecision` → `silence` disposition → `return {success:true}` (webhook-processor.ts:305-311).

**Varixcenter → human-only:** Varixcenter has NO FB/IG agent routing rule (HANDOFF.md grounded facts). So `routeAgent` → null → silence. AND if its `lifecycle_routing_enabled=false`, `routeAgent` never runs and `isAgentEnabledForConversation`/legacy `conversational_agent_id` (not an FB/IG agent) gates it. Either way: human-only.

**`lifecycle_routing_enabled` for GoDentist Valoraciones:** Must be `true` for the channel rule to fire (it already is, because the sibling responds via ManyChat today — agent-scope.md SQL pre-check confirms the requirement). **Plan must add an explicit prod verification** (Pitfall 1). NOT verified destructively this session — flag in Open Questions.

**How the new Meta code should call the resolver / branch:** It should NOT branch on routeAgent. It should mirror the ManyChat handler: emit the event unconditionally with `agentId: resolveAgentIdForWorkspace(workspaceId)` and let the downstream pipeline gate. (The only branch in the handler is the inert v4-lock gate `v4Path === 'somnio-sales-v4'`.)

### OQ-2 — Sender / outbound
**Answer (confirmed, NOT hardcoded to ManyChat):** The agent's outbound goes through the provider chokepoint. Trace:
- Agent reply → `ProductionMessagingAdapter.send` (`messaging.ts:140`) → looks up conversation `channel` (line 180) → `domainSendTextMessage`/`domainSendMediaMessage` (lines 251,241).
- Domain `sendTextMessage` (`messages.ts:223`) facebook arm reads `readMessengerProvider` (line 260); instagram arm reads `readInstagramProvider` (line 287).
- `meta_direct` → `metaFacebookSender.sendText` (line 268) / `metaInstagramSender.sendText` (line 295) with creds from `resolveByWorkspace` (lines 264,291). `manychat` → `getChannelSender` (lines 277,304).

**So after flipping providers to `meta_direct`, replies WILL route via the Meta sender.** ✅

**BUT the hazard (OQ-2 caveat):** `messaging.ts:36-62` `getChannelCredentials` ALWAYS reads `settings.manychat_api_key` for FB/IG (line 52), regardless of provider, and `send()` returns `messagesSent:0` if it's null (lines 184-187). After D-06 key deletion, the agent never reaches the chokepoint. **Must patch `getChannelCredentials` to be provider-aware** (Pattern 2). Same issue in `messages-send-idempotent.ts:257`, `agent-timers-v3.ts:59`, `agent-timers-v4.ts:72`. The web inbox path (`actions/messages.ts:147`) is already correct.

### OQ-3 — 24h window
**Answer (confirmed):** FB/IG meta_direct = 24h window + optional `HUMAN_AGENT` tag, NO HSM templates.
- The window gate `resolveMessengerWindowSend` (`messenger/window-gate.ts`) governs ONLY meta_direct facebook/instagram (window-gate.ts:22). Inside 24h → RESPONSE (no tag); 24h–7d + feature granted → HUMAN_AGENT; else BLOCK.
- IG has NO templates → outside-window is block-only (`actions/messages.ts:186-187` comment + Pitfall 6 there).
- The agent (`godentist-fb-ig`) replies to INBOUND (always within 24h of the customer message). The agent send path (`messaging.ts` → `domain sendTextMessage`) does NOT pass any `tag` and does NOT use a template path for FB/IG — it sends plain text/image via `metaFacebookSender.sendText`/`sendImage`. **No HSM/template assumption exists in the agent FB/IG send path.** ✅
- `sendTemplateMessage` (messages.ts:146) is WhatsApp-only; FB/IG arms in `sendTextMessage`/`sendMediaMessage` never call it.

### OQ-4 — Interruption lock
**Answer:** The new Meta path does NOT need the lock infra to function — it's inert for `godentist-fb-ig` (v4Path=false). For parity:
- The ManyChat handler imports the v2 lock modules STATICALLY (manychat handler L24-27) and runs the lock block ONLY when `resolvedAgentId === 'somnio-sales-v4'` (L182,193). For `godentist-fb-ig`, `v4Path=false` → block skipped → `lockHandle=null`, `ownPendingEntryJson=null` (passed as null in the event).
- **Replicate inert (recommended) rather than omit:** copy the v4-gate block verbatim so a future v4-on-FB/IG works without re-touching the Meta handlers, and so the event payload shape matches exactly (the Inngest fn destructures these optional fields — agent-production.ts:96-117 — they're null-safe). Minimal-diff alternative: omit the lock block and pass the 6 lock fields as literal `null`. Either is byte-safe for godentist-fb-ig.
- **What the Meta path MUST replicate from ManyChat:** steps 4 (contact_id fetch) + 5 (inngest.send with the full data shape incl. `lockChannel`, `lockIdentifier`, `agentId`). **Can skip:** nothing functionally; the v4 lock acquire is inert but recommended for parity.

### OQ-5 — Dedup / idempotency
**Answer:**
- **ManyChat inbound dedup:** `receiveMessage` idempotency on `waMessageId = payload.message_id` (manychat handler L129); no-op detected via `messageId === ''` (L144). Conversation keyed `mc-<subscriber_id>` (L83).
- **Meta inbound dedup:** `receiveMessage` idempotency on `waMessageId = ev.message.mid` (msgr L171, ig L233); no-op via `messageId === ''` (msgr L186, ig L248). Conversations keyed `fb-<psid>` (msgr L84) / `ig-<igsid>` (ig L132). Echoes skipped at the route (route.ts:156,209 `!ev.message.is_echo`). Unknown page/ig_account → ack&drop (route.ts:148,201).
- **Overlap risk (D-04):** Dedup is per-(conversation, message-id). ManyChat and Meta create DIFFERENT conversations (`mc-` vs `fb-`/`ig-`) and use DIFFERENT message ids → **no cross-path dedup**. The per-conversation Inngest concurrency=1 (agent-production.ts:67) does NOT serialize across the two conversations. **So a DM arriving via both paths during overlap CAN double-process.** Mitigation is sequencing (provider flip redirects outbound to Meta immediately) + immediate ManyChat disconnect (Pitfall 5). The Meta dedup key (`message.mid`) is sufficient WITHIN the Meta path, not across providers.

### OQ-6 — Blast radius of ManyChat deletion
**Answer:** Grep-verified (`grep -rln -i manychat` + `MANYCHAT_`). See **Decommission Map** below for the full delete-vs-keep list with shared-code hazards.

### OQ-7 — Provider enum
**Answer:** `'manychat'` is a **CHECK constraint** (not a Postgres enum) on both columns:
- `messenger_provider TEXT NOT NULL DEFAULT 'manychat' CHECK (messenger_provider IN ('manychat','meta_direct'))` — `supabase/migrations/20260604120000_add_messenger_provider.sql:10-12`.
- `instagram_provider TEXT NOT NULL DEFAULT 'manychat' CHECK (instagram_provider IN ('manychat','meta_direct'))` — `supabase/migrations/20260605120000_add_instagram_provider.sql:12-14`.
- (`whatsapp_provider` similar in `20260602120000` — DO NOT touch.)

**Recommendation:** A migration to drop `'manychat'` from the CHECK + change DEFAULT to `'meta_direct'` is OPTIONAL but cleaner for "ManyChat out of codebase". **Sequencing (Regla 5 — apply in prod BEFORE deploy):** you CANNOT add the new CHECK while any row still has `messenger_provider='manychat'` (the ALTER would fail validation). So: (1) re-point all 4 workspaces' msgr+ig to `meta_direct` (OQ-8), (2) THEN run the migration that `DROP CONSTRAINT` + `ADD CONSTRAINT … CHECK (… IN ('meta_direct'))` + `ALTER COLUMN … SET DEFAULT 'meta_direct'`. Apply in prod, then deploy code. **Simplest safe alternative (recommended for v1):** leave the CHECK as-is (`IN ('manychat','meta_direct')`) — the value just becomes unused after re-pointing. Dropping it is cosmetic and adds migration risk; document as deferred. Decision for the planner/user.

### OQ-8 — Re-point the 3 dormant workspaces
**Answer:** Setting `messenger_provider`/`instagram_provider`='meta_direct' for a workspace with NO `workspace_meta_accounts` row is SAFE on outbound:
- On an outbound attempt, the domain reads `meta_direct` (messages.ts:260/287) → `resolveByWorkspace` returns no creds → `if (!creds?.accessToken || !creds.pageId) return { success:false, error:'Credenciales Meta no configuradas' }` (messages.ts:264-267, 291-294). **No crash, no throw — a graceful error string.**
- A human trying to reply from the inbox would get the error "Credenciales Meta no configuradas" (actions/messages.ts delegates to domain). That's acceptable — these 3 have no FB/IG agent and ~0 traffic (D-09).
- **Recommended destination value: `'meta_direct'`** for all three (GoDentist 36a74890, Somnio a3843b3f, Pruebas Morfx 4b5d84dd). Rationale: (a) it turns off the ManyChat inbound path (the goal — D-09), (b) it's the only OTHER allowed CHECK value, (c) no sender activates without a connected page so it's effectively "FB/IG disabled", (d) it lets us later drop `'manychat'` from the CHECK (OQ-7). There is no "neutral" value available under the current CHECK. **WhatsApp provider of all 3 stays untouched** (Regla 6, D-10).

---

## Decommission Map

### DELETE (Block B — after D-08 checkpoint)
| Path | Notes |
|------|-------|
| `src/app/api/webhooks/manychat/route.ts` | Inbound webhook endpoint. Uses `MANYCHAT_DEFAULT_WORKSPACE_ID`, `MANYCHAT_WEBHOOK_SECRET`. |
| `src/app/api/manychat/dynamic-reply/route.ts` | Reads/updates `manychat_pending_replies`. Legacy IG dynamic-content flow. |
| `src/lib/manychat/webhook-handler.ts` | `processManyChatWebhook`. **Shared imports check below.** |
| `src/lib/manychat/api.ts` | ManyChat REST client. Uses `MANYCHAT_API_URL`. |
| `src/lib/channels/manychat-sender.ts` | `manychatFacebookSender`/`manychatInstagramSender`. Uses `MANYCHAT_IG_REPLY_TAG_ID`. **Delete AFTER rewiring registry (Pitfall 4).** |
| `src/lib/channels/__tests__/meta-facebook-sender.test.ts` references | Keep file; remove manychat assertions if any (it tests meta sender — review). |
| Test files | `src/lib/messenger/__tests__/webhook-handler.test.ts`, `src/lib/instagram/__tests__/webhook-handler.test.ts` (update — they assert human-only NO dispatch; will change to assert dispatch), `src/lib/domain/__tests__/messenger-provider.test.ts`, `messages-instagram.test.ts` (use literal `'MANYCHAT_API_KEY'` string — harmless, but update to reflect provider-aware paths), `messenger-window.test.ts`, `v4-messaging-adapter.test.ts`. |
| Env vars | `MANYCHAT_DEFAULT_WORKSPACE_ID`, `MANYCHAT_WEBHOOK_SECRET`, `MANYCHAT_IG_REPLY_TAG_ID`, `MANYCHAT_API_KEY` (Vercel + `.env.local` + `.env.example`/`.env.test.example` if present). |
| `middleware.ts:55-59` | The `/api/manychat` bypass block (route is gone). |
| Per-workspace settings keys | `settings.manychat_api_key`, `settings.manychat_webhook_secret` (Valoraciones via D-06; the other 3 optionally cleaned). |
| `supabase/migrations/20260327150000_manychat_pending_replies.sql` table | The `manychat_pending_replies` table — only the deleted dynamic-reply route uses it. Drop via NEW migration (don't edit the old file). NO other reader (grep-confirmed: only `dynamic-reply/route.ts`). |
| `scripts/setup-godentist-manychat.sql`, `scripts/godentist-valoraciones-discovery-2.ts`, `scripts/_chk-manychat.ts` | Helper scripts — delete (optional). |

### KEEP (shared utilities the manychat handler imports — used elsewhere)
The manychat handler imports these — all SHARED, do NOT delete:
- `@/lib/domain/conversations` (`findOrCreateConversation`, `linkContactToConversation`) — used by Meta handlers too.
- `@/lib/domain/messages` (`receiveMessage`) — used everywhere.
- `@/lib/domain/types` (`DomainContext`).
- `@/lib/agents/interruption-system-v2/*` (lock/pending/redis/observability) — v4 infra.
- `@/lib/agents/registry-helpers` (`resolveAgentIdForWorkspace`) — the Meta wire will import this too.
- `@/lib/supabase/admin` (`createAdminClient`).

### REWIRE (don't delete — patch)
| Path:line | Change |
|-----------|--------|
| `src/lib/channels/registry.ts:9,11-15` | Remove manychat sender import + map entries. After all workspaces are off manychat, the `facebook`/`instagram` registry entries are dead. Either remove them (and the domain `manychat` else-branches that call `getChannelSender`) or collapse `ChannelType`. Order per Pitfall 4. |
| `src/lib/channels/types.ts:1-7` | Comment says "Facebook/Instagram via ManyChat" — update; `ChannelType` union may stay (`facebook`/`instagram` still valid channels, now meta_direct-only). |
| `src/lib/domain/messages.ts` (facebook arm 257-283, instagram arm 284-310; media arms ~422-470) | Remove the `manychat` else-branches once no workspace uses manychat. The `meta_direct` arms stay. |
| `src/lib/agents/engine-adapters/production/messaging.ts:36-62,184-187` | **Provider-aware patch (Block A — BEFORE cutover).** Stop hard-requiring manychat key for meta_direct. |
| `src/lib/domain/messages-send-idempotent.ts:256-258` | Provider-aware patch. |
| `src/inngest/functions/agent-timers-v3.ts:58-65`, `agent-timers-v4.ts:71-78` | Provider-aware patch. |
| `src/lib/meta/messenger-api.ts:82` | Comment ref to `manychatFacebookSender` (image-as-followup parity) — update comment after sender deletion. |
| `src/lib/whatsapp/types.ts:53`, `src/lib/domain/conversations.ts:52` | Comments referencing "ManyChat subscriber ID" for `external_subscriber_id` — update wording (the field is reused by Meta as PSID/IGSID; KEEP the field). |
| `src/app/actions/messages.ts` | Already provider-aware; only update comments referencing ManyChat. |
| `src/app/actions/meta-onboarding.ts:149` | Comment ("traffic stays on manychat until…") — update. |

### MIGRATION (OQ-7) — optional, Regla 5 sequencing
```sql
-- NEW migration, AFTER all 4 workspaces re-pointed to meta_direct (else ADD CHECK fails validation).
-- Apply in prod BEFORE deploying any code change. RECOMMENDED to DEFER unless user wants the value gone.
ALTER TABLE workspaces DROP CONSTRAINT workspaces_messenger_provider_check;
ALTER TABLE workspaces ADD  CONSTRAINT workspaces_messenger_provider_check CHECK (messenger_provider IN ('meta_direct'));
ALTER TABLE workspaces ALTER COLUMN messenger_provider SET DEFAULT 'meta_direct';
-- same for instagram_provider. whatsapp_provider UNTOUCHED.
-- + DROP TABLE manychat_pending_replies; (after dynamic-reply route deleted)
```

### RE-POINT (OQ-8) — Regla 5, before enum migration
```sql
-- Valoraciones is flipped in Block A cutover (D-04 step 3). The other 3 here (D-09):
UPDATE workspaces SET messenger_provider='meta_direct', instagram_provider='meta_direct'
WHERE id IN ('36a74890-…','a3843b3f-c337-4836-92b5-89c58bb98490','4b5d84dd-…');
-- whatsapp_provider untouched. Verify: SELECT id, messenger_provider, instagram_provider, whatsapp_provider FROM workspaces;
```
(Confirm the full UUIDs for GoDentist `36a74890` and Pruebas `4b5d84dd` from prod before running.)

---

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `workspaces.settings.manychat_api_key` + `manychat_webhook_secret` (4 workspaces); `workspaces.messenger_provider`/`instagram_provider`='manychat' (4 ws); `manychat_pending_replies` table (only read by dynamic-reply route) | Data migration: re-point providers (OQ-8) + delete keys (D-06); drop table |
| Live service config | **ManyChat dashboard** (external SaaS) — FB pages + IG accounts connected there for all 4 workspaces; ManyChat Flows + Dynamic Content blocks calling `/api/manychat/dynamic-reply` | Manual (operator): disconnect page/IG in ManyChat per workspace (D-04 step 5). NOT in git. |
| OS-registered state | None — no cron/task references manychat (grep clean for scheduler) | None |
| Secrets/env vars | `MANYCHAT_DEFAULT_WORKSPACE_ID`, `MANYCHAT_WEBHOOK_SECRET`, `MANYCHAT_IG_REPLY_TAG_ID`, `MANYCHAT_API_KEY` in Vercel + `.env.local` (`.env.example`/`.env.test.example` — verify) | Delete from Vercel env + local files (Block B) |
| Build artifacts | None — TS/Next, no compiled package carrying the name | None |
| **Meta App config** | The GoDentist FB page + IG account must be added to the Meta App with webhook fields `messages`/`messaging` subscribed (D-04 step 4) | Manual (operator) via connect actions + Meta App dashboard |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| FB/IG inbound + outbound via ManyChat proxy | Meta Direct Graph API (per-workspace `*_provider` flag) | Phase 40 (FB, 2026-06-04) + Phase 41 (IG, 2026-06-05) | Varixcenter already on meta_direct; this standalone moves GoDentist + decommissions ManyChat |
| Meta FB/IG inbound human-only (D-IG-01/D-12) | Meta FB/IG inbound → agent dispatch (gated) | THIS standalone | Removes the deliberate human-only omission for agent workspaces |

**Deprecated/outdated after this standalone:**
- ManyChat entirely (code, env, table, provider value).
- `manychat_pending_replies` IG dynamic-content flow (already effectively dead — IG meta_direct sends direct).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ✅ **VERIFIED 2026-06-06 (read-only prod):** GoDentist Valoraciones `lifecycle_routing_enabled=true`, `conversational_agent_id=godentist`. So the channel rule WILL fire → `godentist-fb-ig`. (Had it been false, FB/IG would have fallen back to `godentist` WhatsApp — confirming Pitfall 1, but the flag is ON.) Varixcenter / GoDentist (36a74890) / Pruebas have NO `workspace_agent_config` row → no router → human-only preserved (confirms D-03). Full UUIDs: GoDentist `36a74890-aad6-4804-838c-57904b1c9328`, Pruebas `4b5d84dd-1b46-4e8c-8acf-3869c037198f`, Somnio `a3843b3f-c337-4836-92b5-89c58bb98490`. | OQ-1 / Pitfall 1 | RESOLVED — no longer a risk. |
| A2 | `manychat_pending_replies` has no writer in the current codebase (only read/updated by dynamic-reply route); the IG send goes via `manychatInstagramSender` tag-trigger, not pending-replies | OQ-6 / Decommission | If a Flow elsewhere writes it out-of-band, dropping the table loses pending replies (acceptable — dormant). |
| A3 | No dedicated ManyChat settings UI exists (grep of `src/app`/`src/components` `.tsx` = 0); keys live in `workspaces.settings` JSONB edited via DB/onboarding only | OQ-6 | If a hidden UI exists, it must also be removed. grep-confirmed clean. |
| A4 | `isAgentEnabledForConversation` for Varixcenter resolves to "no agent" (human-only) independent of routing | OQ-1 | If Varixcenter has an agent enabled but no FB/IG rule, routeAgent=null → silence still holds, but verify. |

---

## Open Questions

1. **`lifecycle_routing_enabled` for GoDentist Valoraciones (A1).**
   - What we know: the rule + sibling exist; the agent responds via ManyChat today, which implies the flag is on.
   - What's unclear: not verified destructively this session.
   - Recommendation: add a prod SQL pre-check in the plan (the agent-scope.md godentist-fb-ig SQL already documents it): `SELECT lifecycle_routing_enabled FROM workspace_agent_config WHERE workspace_id='f0241182-…';` Expect `true`.

2. **Whether to drop `'manychat'` from the CHECK constraint (OQ-7).**
   - Recommendation: defer (cosmetic). Leave value unused; re-point is sufficient. If user wants it gone, sequence: re-point → migration → deploy.

3. **Test rewrites for the two Meta handlers.**
   - `messenger/__tests__/webhook-handler.test.ts` + `instagram/__tests__/webhook-handler.test.ts` currently assert NO dispatch (human-only). They must be updated to assert: (a) dispatch when an agent resolves, (b) NO dispatch / human-only behavior path preserved for agentless workspaces (D-03 behavioral test).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Meta Graph API (FB/IG) | Outbound meta_direct | ✓ (Phase 40/41 verified) | — | — |
| Inngest | Agent dispatch event | ✓ (in use) | — | — |
| Supabase admin (domain) | All mutations | ✓ | — | — |
| Upstash Redis (interruption-v2) | v4 lock (inert for godentist-fb-ig) | ✓ | — | Inert — godentist-fb-ig is v4Path=false |

**No blocking missing dependencies.** ManyChat external SaaS is being decommissioned (operator action), not a code dependency to install.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | `vitest.config.*` (repo root) |
| Quick run command | `pnpm vitest run <path>` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| Block A wire (FB) | dispatch emitted when agent resolves | unit | `pnpm vitest run src/lib/messenger/__tests__/webhook-handler.test.ts` | ✅ (update) |
| Block A wire (IG) | dispatch emitted when agent resolves | unit | `pnpm vitest run src/lib/instagram/__tests__/webhook-handler.test.ts` | ✅ (update) |
| D-03 human-only | NO dispatch when routeAgent=null / agentless ws | unit (behavioral) | same files, new cases | ❌ Wave 0 (add) |
| OQ-2 provider-aware send | meta_direct skips manychat key; manychat arm byte-identical | unit | `pnpm vitest run src/lib/domain/__tests__/messenger-provider.test.ts` | ✅ (extend) |
| Regla 6 grep | no `routeAgent` import in handlers; no whatsapp-arm diff | grep gate | `grep -rn "routeAgent" src/lib/messenger src/lib/instagram` = 0 | n/a |

### Sampling Rate
- Per task commit: `pnpm vitest run <touched test file>` + `pnpm tsc --noEmit`.
- Per wave merge: `pnpm vitest run src/lib/messenger src/lib/instagram src/lib/domain`.
- Phase gate: full `pnpm vitest run` green + live cutover verification.

### Wave 0 Gaps
- [ ] D-03 behavioral no-dispatch test cases (agentless workspace → 0 inngest.send).
- [ ] Provider-aware send tests for `messaging.ts`, `messages-send-idempotent.ts`, agent-timers (assert meta_direct path doesn't require manychat key).
- [ ] Regla 6 grep gate script (no routeAgent in handlers; whatsapp arm untouched).

---

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Meta HMAC X-Hub-Signature-256 (route.ts:103) — already enforced; ManyChat secret removed with route |
| V4 Access Control | yes | Tenant routing by page_id/ig_account_id ONLY, never payload sender (route.ts:147,200); workspace_id from creds, not input |
| V5 Input Validation | yes | Webhook payload parsed post-HMAC; echoes skipped; unknown tenant ack&drop |
| V6 Cryptography | yes | Page tokens AES-256-GCM at rest (meta-onboarding.ts:208) — unchanged |

### Known Threat Patterns
| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Cross-tenant leak via payload-supplied sender | Spoofing/Info disclosure | Route by entry.id only (route.ts:147,200) — preserved |
| Forged ManyChat webhook (after decommission) | Spoofing | Eliminated — route deleted |
| Double-response during overlap | Tampering/availability | Sequencing + immediate disconnect (D-04/D-05) |

---

## Sources

### Primary (HIGH — files read this session)
- `src/app/api/webhooks/meta/route.ts` (inbound dispatch points L157,210)
- `src/lib/manychat/webhook-handler.ts` (dispatch pattern L153-280)
- `src/lib/messenger/webhook-handler.ts`, `src/lib/instagram/webhook-handler.ts` (human-only today)
- `src/lib/agents/registry-helpers.ts` (resolveAgentIdForWorkspace L36)
- `src/lib/agents/routing/route.ts` (routeAgent L79), `src/lib/agents/routing/facts.ts` (channel fact L262)
- `src/lib/agents/production/webhook-processor.ts` (gate L242, routeAgent L265, godentist-fb-ig branch L820)
- `src/inngest/functions/agent-production.ts` (event consumer L51,441)
- `src/lib/domain/messages.ts` (provider chokepoint L77-107, send arms L257-310)
- `src/lib/agents/engine-adapters/production/messaging.ts` (agent send + key hazard L36-62,184-187)
- `src/lib/domain/messages-send-idempotent.ts` (L256-258), `src/inngest/functions/agent-timers-v3.ts`/`-v4.ts`
- `src/app/actions/messages.ts` (correct provider-aware pattern L147-201)
- `src/app/actions/meta-onboarding.ts` (connect actions, no provider flip L169-228)
- `src/lib/channels/registry.ts`, `types.ts`, `manychat-sender.ts`; `src/app/api/manychat/dynamic-reply/route.ts`; `src/lib/manychat/api.ts`; `middleware.ts:55-59`
- `supabase/migrations/20260604120000_add_messenger_provider.sql`, `20260605120000_add_instagram_provider.sql`
- grep: `manychat` / `MANYCHAT_` whole-repo blast radius

### Secondary
- CLAUDE.md §Godentist FB/IG Sibling Agent; Regla 5; Regla 6; .claude/rules/agent-scope.md
- CONTEXT.md (D-01..D-10), HANDOFF.md (grounded prod facts)

## Metadata

**Confidence breakdown:**
- Inbound wire / gate: HIGH — traced end-to-end with file:line.
- Outbound chokepoint + hazard: HIGH — read all 4 send paths.
- Decommission map: HIGH — grep-verified; shared imports identified.
- Migration/enum: HIGH — CHECK constraint confirmed in migration files.
- `lifecycle_routing_enabled` state for Valoraciones: MEDIUM — inferred (A1), needs prod verify.

**Research date:** 2026-06-06
**Valid until:** ~2026-07-06 (stable internal code; re-verify if webhook/routing files change)

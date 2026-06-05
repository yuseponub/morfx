# Phase 41: Instagram Direct - Research

**Researched:** 2026-06-05
**Domain:** Instagram Messaging via Meta Graph API (Messenger Platform / Instagram, connected through a Facebook Page)
**Confidence:** HIGH (the FB sibling is shipped + live-verified; IG diverges from FB in only a handful of well-documented places, each cited below)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-IG-01..09 — research HONORS these, does not relitigate)
- **D-IG-01:** Human inbox only (send/receive text + image by human agents). AI-agent routing on IG is DEFERRED. ROADMAP criterion #5 (agents) explicitly deferred.
- **D-IG-02:** New per-workspace column `instagram_provider` (`'meta_direct' | 'manychat'`), default `'manychat'`. SEPARATE from `messenger_provider` (NOT reused) — IG and FB migrate independently. Single provider decision in the domain layer (Regla 3). Requires a migration (Regla 5).
- **D-IG-03:** Regla 6 — the existing ManyChat IG path (`manychatInstagramSender`, `channel='instagram'`) and the `godentist-fb-ig` production agent stay BYTE-IDENTICAL. Only workspaces flipped to `instagram_provider='meta_direct'` use the new Meta path. `godentist-fb-ig` is NOT migrated.
- **D-IG-04:** Separate "Conectar Instagram" button (not auto-link). IG rides on the connected FB Page. Resolve `instagram_business_account` from the workspace's connected Page, store `ig_account_id` (+ username), reuse the Page Access Token. No IG account linked → clear Spanish error.
- **D-IG-05:** Create-or-get contact idempotently by `(ig_account_id, IGSID)`. No fuzzy phone/email match. Identifier prefix `ig-${IGSID}` (mirrors FB `fb-${psid}`). Name self-heal with placeholder prefix `'IG-'`.
- **D-IG-06:** Extend the SAME unified Meta webhook with a branch for `object === 'instagram'`. Route by `ig_account_id` via `resolveByIgAccountId` (sibling of `resolveByPageId`). One Meta app, one callback URL. IGSID stays a STRING.
- **D-IG-07:** Inbox shows an "Instagram" channel indicator (`channel='instagram'`).
- **D-IG-08:** New `metaInstagramSender` (sibling of `metaFacebookSender`). Text + image. Unsupported types → graceful error.
- **D-IG-09:** 24h window EXACTLY like Facebook. Inside → free text + image. Outside → reuse `messenger/window-gate.ts` decision (`HUMAN_AGENT` behind `META_HUMAN_AGENT_ENABLED`, currently OFF → block with Spanish message). No countdown timer (mirrors FB; deviates from ROADMAP criterion #4 deliberately).

### Claude's Discretion
- "Instagram" channel-indicator visual (reuse the facebook indicator styling).
- Whether the IG window-gate is the same `window-gate.ts` reused or an IG sibling — **research verdict: REUSE verbatim** (see §Architecture Patterns; IG window policy is identical to FB — same 24h session, same HUMAN_AGENT-only tag, same 7-day cap).
- Schema: extend `workspace_meta_accounts` with `ig_account_id` + `ig_username` — **research verdict: `ig_account_id` + `uq_meta_ig` + the index ALREADY EXIST from the Phase 37 migration; only `ig_username` (optional) + the `workspaces.instagram_provider` column are new** (see §Migration).
- Placeholder name prefix `'IG-'` for the self-heal — confirmed; `healPlaceholderContactName` already takes a `placeholderPrefix` param.

### Deferred Ideas (OUT OF SCOPE — ignore completely)
- AI agents responding on meta_direct Instagram (D-IG-01).
- 24h-window countdown timer in the inbox (D-IG-09).
- Migrating `godentist-fb-ig` to meta_direct IG (D-IG-03).
- Advanced message tags / marketing on IG.
- Fuzzy contact matching / auto-merge of IGSID contacts with phone/email.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IG-01 | Receive DMs via unified webhook | §Code Examples (IG webhook payload) + §Architecture (`route.ts` `object==='instagram'` branch + `resolveByIgAccountId`, already exists) |
| IG-02 | Send text + images via Graph API (replaces ManyChat) | §Code Examples (IG Send API `POST /{page_id}/messages`) + `metaInstagramSender` + `instagram` arm in `domain/messages.ts` |
| IG-03 | IGSID → contact resolution | §Code Examples (IG name edge `GET /{IGSID}?fields=name,username`) + `resolveOrCreateContact` by `ig-${IGSID}` + self-heal `'IG-'` |
| IG-04 | Inbox for Instagram conversations (human + agente) | §Architecture (`channel='instagram'` indicator, reuse existing inbox). Agent half deferred per D-IG-01 — V1 is human-only |
| IG-05 | Clear "ventana expirada" UX (hard 24h, no templates) | §Common Pitfalls (IG guardrails) + reuse `window-gate.ts` block message |
| MIG-02 | Per-workspace provider flag | §Migration (`workspaces.instagram_provider`) + `readInstagramProvider` chokepoint in `domain/messages.ts` |
</phase_requirements>

## Summary

Phase 41 is a **near-exact clone of the shipped Phase 40 (Facebook Messenger Direct)** with the Instagram identity swapped in. The decisive research finding: **Instagram messaging, when connected via a Facebook Page (the path D-IG-04 chose), is delivered and sent through the *Messenger Platform* — NOT the separate "Instagram API with Instagram Login".** This means almost everything is structurally identical to FB:

- **Send API:** `POST /{page_id}/messages` with the **Page Access Token** and `recipient: { id: IGSID }` — the SAME endpoint, token, and envelope as FB Messenger. [CITED: developers.facebook.com/docs/messenger-platform/instagram/features/send-message]
- **Webhook:** `object: 'instagram'`, delivered under `entry[].messaging[]` (Messenger-style, EXACTLY what D-IG-06 assumed — NOT `entry[].changes[]`). `sender.id` = IGSID (customer), `recipient.id` = the Instagram Professional account ID (IGID). [CITED: developers.facebook.com/docs/messenger-platform/instagram/features/webhook]
- **24h window + HUMAN_AGENT:** identical to FB — same 24h session, same single emittable tag `HUMAN_AGENT` (the only tag IG supports), same 7-day cap. `window-gate.ts` is reusable verbatim. [CITED: Manychat/Chatwoot HUMAN_AGENT docs, VERIFIED against FB sibling behavior]

The codebase is **even more prepared than CONTEXT assumed**: `resolveByIgAccountId`, the `ig_account_id` column, the `uq_meta_ig` UNIQUE constraint, the `idx_meta_accounts_ig` index, and `MetaChannel`/`ChannelType` including `'instagram'` ALL already exist (Phase 37 migration + Phase 40 credentials work). The only NEW database object is `workspaces.instagram_provider` (a one-line ALTER, sibling of `messenger_provider`).

The genuine IG≠FB divergences are narrow and all favorable:
1. **Name resolution is SIMPLER on IG.** FB needed the conversations-edge workaround because the direct `GET /{psid}` user-profile failed 100/33 without `pages_read_engagement` in the token. On IG, the direct `GET /{IGSID}?fields=name,username` **works with the Page token** given `instagram_basic` + `instagram_manage_messages` (both APPROVED). [CITED: developers.facebook.com/docs/messenger-platform/instagram/features/user-profile]
2. **Connection adds one resolve step.** The "Conectar Instagram" button must resolve `instagram_business_account` off the already-connected Page (`GET /{page_id}?fields=instagram_business_account{id,username}`) and reuse that Page's token. The IG webhook is delivered through the SAME Page `subscribed_apps` subscription — but the app must have `instagram` `messages` subscribed at the App-Dashboard level (one-time app config, not per-workspace code).
3. **No HSM templates on IG, ever** — outside-24h is block-only (already the FB behavior since `META_HUMAN_AGENT_ENABLED` is OFF).

**Primary recommendation:** Clone the eight FB sibling files file-for-file, swapping `page`→`instagram`, `psid`→`igsid`, `fb-`→`ig-`, `FB-`→`IG-`, `messenger_provider`→`instagram_provider`, and adding ONE connect step (resolve `instagram_business_account`). Reuse `window-gate.ts`, `healPlaceholderContactName`, the domain chokepoint pattern, `resolveByIgAccountId` (exists), and the entire connect chain verbatim. Ship the one-line `instagram_provider` migration to prod FIRST (Regla 5).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Inbound IG DM ingestion | API / Webhook (`route.ts`) | Domain (`receiveMessage`) | HMAC-verified webhook routes by `ig_account_id`; domain stores |
| IG→workspace routing | API (`resolveByIgAccountId`) | DB (`workspace_meta_accounts`) | Tenant isolation by `recipient.id` (IGID), never payload-supplied |
| Contact identity (IGSID) | Domain (`resolveOrCreateContact`) | — | `ig-${IGSID}` page-scoped identity; no fuzzy match (D-IG-05) |
| Name self-heal | Domain (`healPlaceholderContactName`) | API (IG name edge) | First-message race; channel-agnostic heal with `'IG-'` prefix |
| Provider decision | Domain (`readInstagramProvider`) | DB (`workspaces.instagram_provider`) | Single chokepoint (Regla 3), default manychat (Regla 6) |
| Outbound send | Domain (`sendTextMessage`/`sendMediaMessage` instagram arm) | Channel (`metaInstagramSender`) → Meta Send API | Send-or-DB chokepoint; sender is a thin Graph wrapper |
| 24h window gate | Domain/action (pure helper `window-gate.ts`) | — | Pure policy; no I/O; identical to FB |
| Connection / token | Server action (`connectInstagramAccount`) | Meta connect helpers + Domain (`upsertMetaAccount`) | Owner-gated; resolves IG account off Page; reuses Page token |
| Inbox UI | Frontend (existing inbox + channel indicator) | — | `channel='instagram'` indicator (D-IG-07) |

## Standard Stack

The stack is decided. This table documents the **exact Graph API surface** the IG path uses.

### Core (Meta Graph API v22.0 — pinned in `src/lib/meta/constants.ts`, REUSE the same constant)
| Operation | Endpoint / Edge | Token | Body / Fields | Confidence |
|-----------|-----------------|-------|---------------|------------|
| Send IG text | `POST /{page_id}/messages` | Page Access Token | `{ messaging_type, recipient:{id: IGSID}, message:{text} }` | HIGH [CITED: send-message doc] |
| Send IG image | `POST /{page_id}/messages` | Page Access Token | `{ messaging_type, recipient:{id: IGSID}, message:{attachment:{type:'image', payload:{url, is_reusable:true}}} }` | HIGH [CITED: send-message doc] |
| Resolve IG account off Page | `GET /{page_id}?fields=instagram_business_account{id,username}` | Page Access Token | returns `instagram_business_account.id` + `.username` | MEDIUM [CITED: graph-api page node; verify in smoke that this id == webhook `recipient.id`] |
| Resolve IGSID display name | `GET /{IGSID}?fields=name,username` | Page Access Token | returns `name`, `username`, `profile_pic`, `follower_count`, `is_verified_user` | HIGH [CITED: user-profile doc — needs `instagram_basic`+`instagram_manage_messages`, both APPROVED] |
| Subscribe Page for IG events | `POST /{page_id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks` (already called by FB connect) + app-level `instagram` `messages` field subscribed in App Dashboard | Page Access Token | `{ success: true }` | MEDIUM [CITED: instagram-platform/webhooks; verify delivery in smoke] |

### Supporting (reused infra — NO new libraries)
| Module | Reuse | Why |
|--------|-------|-----|
| `src/lib/meta/api.ts` `metaRequest` | verbatim | Bearer wrapper, never logs token, v22.0 base URL |
| `src/lib/meta/token.ts` `encryptToken`/`decryptToken` | verbatim | AES-256-GCM for Page token at rest |
| `src/lib/meta/constants.ts` `META_BASE_URL` | verbatim | SAME pinned v22.0 (do NOT introduce a new version) |
| `@/lib/domain/*` | verbatim | All mutations through domain (Regla 3) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff — why REJECTED |
|------------|-----------|-------------------------|
| Messenger Platform / Instagram (FB-Page path) | "Instagram API with Instagram Login" (`POST /{ig_user_id}/messages`, IG-specific token) | REJECTED — D-IG-04 locked the FB-Page path; that path reuses the existing Page token + connect chain. The Instagram-Login path would need a separate OAuth + token store + a different endpoint shape. The Page path is the FB-sibling clone. [CITED: two distinct APIs confirmed in search] |

**Installation:** No new packages. All Graph calls go through existing `metaRequest`.

**Version verification:** `META_GRAPH_API_VERSION = 'v22.0'` (constants.ts:7) — REUSE. v22.0 is the enforced minimum (per REQUIREMENTS.md, enforced since Sep 2025). Do NOT bump.

## Architecture Patterns

### System Architecture Diagram

```
INBOUND (IG DM arrives)
  Instagram user sends DM
        │
        ▼
  Meta delivers webhook → POST https://www.morfx.app/api/webhooks/meta   (www — apex 307-redirects, drops POST body)
        │
        ▼
  route.ts: read RAW body → verifyMetaHmac(body, X-Hub-Signature-256, META_APP_SECRET)
        │  (SAME HMAC verify as page/whatsapp — IG events are signed too)
        ▼
  branch on payload.object
        ├── 'whatsapp_business_account' → processWebhook        (UNTOUCHED)
        ├── 'page'                       → processMessengerWebhook (UNTOUCHED)
        └── 'instagram'  ◄── NEW BRANCH
              │  for each entry: pageId? NO — entry.id = IGID (the IG account)
              │  resolveByIgAccountId(entry.id)  ──► workspace + Page token   (unknown → ack 200 & drop)
              │  for each entry.messaging[]:
              │     skip if message.is_echo (our own outbound)
              ▼
        processInstagramWebhook(ev, workspaceId, igAccountId, accessToken)
              │  igsid = String(ev.sender.id)             (STRING — never Number-coerced)
              │  name = getInstagramUserName(token, igsid) → GET /{IGSID}?fields=name,username  (best-effort)
              ▼
        DOMAIN (Regla 3):
          findOrCreateConversation(channel='instagram', phone=`ig-${igsid}`, profileName if resolved)
          resolveOrCreateContact(phone=`ig-${igsid}`, name)        (no fuzzy match — D-IG-05)
          healPlaceholderContactName(placeholderPrefix='IG-')      (first-message race self-heal)
          receiveMessage(...)  → idempotent on mid → realtime + inbox
          (NO Inngest agent dispatch, NO v4 lock — D-IG-01 human-only)

OUTBOUND (human agent replies from inbox)
  Inbox compose → server action → domain.sendTextMessage / sendMediaMessage (channel='instagram')
        │
        ▼
  readInstagramProvider(workspaceId)   ── single chokepoint (Regla 3), default 'manychat'
        ├── 'manychat'    → getChannelSender('instagram') = manychatInstagramSender   (BYTE-IDENTICAL — Regla 6)
        └── 'meta_direct' ◄── NEW arm
              │  creds = resolveByWorkspace(workspaceId, 'instagram')   (creds from ctx, never input)
              │  window-gate decision (24h / HUMAN_AGENT behind META_HUMAN_AGENT_ENABLED=OFF → block)
              ▼
        metaInstagramSender.sendText / sendMedia(creds={accessToken, pageId}, igsid, ...)
              ▼
        POST /{page_id}/messages  (Page token, recipient:{id: igsid})  → { message_id, recipient_id }
              ▼
        store outbound message row + update conversation
```

### Recommended File Map (clone / reuse / write-new)

```
src/lib/instagram/
├── webhook-handler.ts      # WRITE-NEW (clone of messenger/webhook-handler.ts)
└── window-gate.ts          # DO NOT CREATE — reuse messenger/window-gate.ts verbatim

src/lib/meta/
├── instagram-api.ts        # WRITE-NEW (clone of meta/messenger-api.ts)
└── instagram-connect.ts    # WRITE-NEW (small — only resolveInstagramAccount; reuse the rest of messenger-connect.ts)

src/lib/channels/
└── meta-instagram-sender.ts  # WRITE-NEW (clone of channels/meta-facebook-sender.ts)

src/components/settings/
└── connect-instagram.tsx   # WRITE-NEW (clone of settings/connect-facebook.tsx)
```

### Pattern 1: Provider-flag chokepoint (Regla 3 + Regla 6)
**What:** Read the provider column ONCE in the domain layer; branch meta_direct vs manychat; default = legacy.
**When to use:** Both `sendTextMessage` and `sendMediaMessage`, `channel==='instagram'` arm.
**Example:** Clone `readMessengerProvider` (messages.ts:70-80) as `readInstagramProvider` reading `workspaces.instagram_provider`. Then in the `else if (channel === 'facebook')` block, add a sibling `else if (channel === 'instagram')` block that mirrors the facebook one exactly (the existing `else` Instagram-via-ManyChat fallback becomes the `manychat` arm of the new block).
```typescript
// Source: clone of src/lib/domain/messages.ts:70-80
async function readInstagramProvider(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceId: string
): Promise<'manychat' | 'meta_direct'> {
  const { data: ws } = await supabase
    .from('workspaces').select('instagram_provider').eq('id', workspaceId).single()
  return ws?.instagram_provider === 'meta_direct' ? 'meta_direct' : 'manychat'
}
```
**CRITICAL nuance:** Today the `instagram` channel falls into the final `else` branch of both send functions (the "Instagram via ManyChat — untouched" path). The NEW `instagram` arm must be inserted as a dedicated `else if (channel === 'instagram')` BEFORE that final `else`, and the `manychat` sub-arm inside it must be **byte-identical to the current `else` body** so Regla 6 holds. (See messages.ts:257-265 for sendText and :400-414 for sendMedia — the current Instagram ManyChat behavior to preserve.)

### Pattern 2: Webhook branch — entry.id is the IGID, not a pageId
**What:** The `object==='instagram'` branch resolves the workspace by `entry.id` (the Instagram account ID = the `recipient.id` of each messaging event), via `resolveByIgAccountId` (already exists).
**Divergence from FB:** In the `page` branch, `entry.id` is the **pageId** and routing uses `resolveByPageId`. In the `instagram` branch, `entry.id` is the **IGID** and routing uses `resolveByIgAccountId`. Same structure, different resolver + identity. [CITED: webhook doc — `recipient.id` = IGID]

### Pattern 3: Name resolution is SIMPLER on IG (direct edge works)
**What:** `getInstagramUserName(token, igsid)` = `GET /{IGSID}?fields=name,username` with the Page token. Best-effort, swallow errors, return null → fallback `IG-${igsid}`.
**Divergence from FB:** FB's `getMessengerUserName` had to use the **conversations edge** (`/{pageId}/conversations?platform=messenger&user_id={psid}&fields=participants`) because the direct `GET /{psid}` failed 100/33. On IG the **direct** edge works (with `instagram_basic`+`instagram_manage_messages`, both approved), so the IG handler is simpler. **Fallback option** if the direct edge ever fails: the IG conversations edge `GET /{ig_account_id}/conversations?platform=instagram&user_id={igsid}&fields=participants` (mirror the FB workaround) — keep it documented but the direct edge is the primary.

### Anti-Patterns to Avoid
- **Number-coercing the IGSID** — IGSID is a large numeric string that can exceed `Number.MAX_SAFE_INTEGER`. Keep it a STRING end-to-end (same Pitfall 5 as PSID). `String(ev.sender?.id ?? '')`.
- **Registering `metaInstagramSender` in the channel-keyed `senders` map** — that map MUST stay the byte-identical ManyChat path (`manychatInstagramSender`). The domain branch imports `metaInstagramSender` DIRECTLY, exactly like `metaFacebookSender` (which is NOT in the map).
- **Flipping the provider on connect** — `connectInstagramAccount` inserts the row `is_active` but MUST NOT touch `instagram_provider` (stays `manychat` until manual SQL cutover — Regla 6).
- **Treating IG outside-24h as recoverable via templates** — IG has NO HSM templates. Outside-24h is block-only (HUMAN_AGENT is the only path, and it's OFF here).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead (REUSE / CLONE) | Why |
|---------|-------------|------------------------------|-----|
| Workspace routing by IG account | new resolver | `resolveByIgAccountId` (credentials.ts:111-126) — **ALREADY EXISTS** | Phase 40 added it preemptively; `ig_account_id` column + index exist |
| 24h / HUMAN_AGENT decision | IG window logic | `resolveMessengerWindowSend` (window-gate.ts) — **REUSE VERBATIM** | IG window policy is identical to FB (24h session, HUMAN_AGENT-only, 7-day cap) |
| Name self-heal (first-msg race) | new heal func | `healPlaceholderContactName(ctx, {contactId, realName, placeholderPrefix:'IG-'})` — **REUSE** | Channel-agnostic; already takes `placeholderPrefix` (contacts.ts:782) |
| Page token acquisition | new OAuth | `exchangeForLongLivedUserToken` + `getPageToken` (messenger-connect.ts) — **REUSE** | IG rides on the SAME connected Page token; only ADD the IG-account resolve |
| Per-Page webhook subscribe | new subscribe | `subscribeMessengerPage` (messenger-connect.ts:243) — **REUSE** (already subscribes the Page) | IG events deliver through the same Page subscription |
| Credential persist | inline INSERT | `upsertMetaAccount` (meta-accounts.ts) — **REUSE**, pass `igAccountId` + `igUsername` | Sole write path (Regla 3); extend params |
| Token encryption | new crypto | `encryptToken` / `decryptToken` (token.ts) — **REUSE** | AES-256-GCM already wired |
| HMAC verify | new verifier | `verifyMetaHmac` (route.ts:37) — **REUSE** (IG events are signed too) | Same App Secret, same raw-body-first flow |
| Contact create-or-get | new resolver | `resolveOrCreateContact` (contacts.ts) — **REUSE** with `ig-${igsid}` | No fuzzy match (D-IG-05) — exact identifier |
| Channel sender contract | new interface | `ChannelSendResult` + the `metaFacebookSender` shape — **CLONE** | `creds:{accessToken, pageId}`, unwrap `message_id` |

**Key insight:** Phase 40 already paid the cost of building all the Meta infrastructure (connect chain, token encryption, HMAC, domain chokepoint, window-gate, self-heal, `resolveByIgAccountId`, the `ig_account_id` schema). Phase 41 is overwhelmingly **clone + reuse**, with a single genuinely-new connect sub-step (resolve `instagram_business_account` off the Page) and a single new migration column (`instagram_provider`).

## Common Pitfalls

### Pitfall 1: Assuming the IG webhook is `entry[].changes[]` (Page-feed style)
**What goes wrong:** Parsing IG DMs from `entry[].changes[]` like a page-feed/comment webhook → messages never found → zero inbound.
**Why it happens:** Instagram has TWO webhook shapes — comments/mentions arrive as `changes[]`, but **messaging arrives as `entry[].messaging[]`** (Messenger-style).
**How to avoid:** Parse `payload.object === 'instagram'` → `entry[].messaging[]` (NOT `changes`). Identical structure to the `page` branch. [CITED: webhook doc]
**Verification step:** Unit test the IG branch against the sample payload in §Code Examples; smoke-test confirms a real DM lands under `messaging[]`.

### Pitfall 2: Using the wrong identity for routing (`recipient.id` is the IGID, `sender.id` is the IGSID)
**What goes wrong:** Routing by `sender.id` (the customer) instead of `recipient.id` (your account) → cross-tenant leak or no-match.
**Why it happens:** FB muscle-memory; FB's `recipient.id` is the pageId.
**How to avoid:** Route by `entry.id` / `recipient.id` (= IGID) through `resolveByIgAccountId`. The customer is `sender.id` (= IGSID) = the outbound recipient. [CITED: webhook doc — `sender.id`=IGSID, `recipient.id`=IGID]
**Verification step:** Confirm in smoke that `entry.id` === the `instagram_business_account.id` resolved at connect time. **(This is the one MEDIUM-confidence linkage — verify it explicitly.)**

### Pitfall 3: Number-coercing the IGSID (same as PSID Pitfall 5)
**What goes wrong:** `Number(igsid)` truncates IDs > 2^53 → wrong/duplicate contacts, failed sends.
**How to avoid:** `String(ev.sender?.id ?? '')` everywhere; forward verbatim into `recipient.id`.
**Verification step:** `grep -n "Number(" src/lib/instagram/ src/lib/meta/instagram-api.ts` returns 0 matches against the IGSID.

### Pitfall 4: Regla 6 break — registering the Meta sender in the channel map, or altering the ManyChat IG arm
**What goes wrong:** `manychatInstagramSender` or `godentist-fb-ig` behavior changes → production IG traffic breaks.
**How to avoid:** `metaInstagramSender` is imported DIRECTLY by the domain branch, NOT added to `senders` in registry.ts. The `manychat` sub-arm of the new `instagram` block is byte-identical to the current final `else` body.
**Verification step (grep-verifiable):**
```bash
# metaInstagramSender NOT in the channel-keyed map:
grep -n "metaInstagramSender" src/lib/channels/registry.ts          # → 0 matches (expected)
# registry IG sender unchanged:
git diff --stat src/lib/channels/registry.ts src/lib/channels/manychat-sender.ts  # → no changes (expected)
# godentist-fb-ig untouched:
git diff --stat src/lib/agents/godentist-fb-ig/                      # → no changes (expected)
# default-manychat preserved (every existing workspace stays legacy):
#   instagram_provider DEFAULT 'manychat' in the migration
```

### Pitfall 5: Regla 5 break — deploying code that reads `instagram_provider` before the column exists
**What goes wrong:** `readInstagramProvider` queries a non-existent column → silent fallback or query error in prod (echo of the 20h-lost-messages incident).
**How to avoid:** **HARD CHECKPOINT** — apply `20260605xxxxxx_add_instagram_provider.sql` to PROD and get explicit user confirmation BEFORE pushing any code that references `workspaces.instagram_provider` (Regla 5, CLAUDE.md). The migration is the first plan; the code is gated behind it.
**Verification step:** Migration applied + user-confirmed before the domain-chokepoint plan's push.

### Pitfall 6: IG outside-24h has NO templates — block-only
**What goes wrong:** Trying to send an HSM template to re-open the window (works on WhatsApp, does NOT exist on IG/Messenger) → API error or silent drop.
**Why it happens:** WhatsApp muscle-memory.
**How to avoid:** Outside 24h, the ONLY path is the `HUMAN_AGENT` tag (7-day cap), and `META_HUMAN_AGENT_ENABLED` is OFF → `window-gate.ts` returns `{ blocked: true, error: <spanish> }`. Surface the Spanish block message in the inbox compose (IG-05 UX). [CITED: IG has no template/HSM messaging — confirmed across docs]
**Verification step:** `window-gate.ts` reused verbatim returns the block decision for `hoursSince >= 24 && !featureGranted`.

### Pitfall 7: `is_echo` filtering — IG DOES emit echoes
**What goes wrong:** The business's own outbound message comes back as an inbound webhook → duplicate "received" bubble / feedback loop.
**Why it happens:** On Instagram, echoes are integrated into the `messages` field (with `is_echo: true`) rather than a separate `message_echoes` field. [CITED: search — "On Instagram, echo notifications are integrated into the messages field"]
**How to avoid:** Skip events where `ev.message?.is_echo === true` (identical to the FB branch: route.ts:155 `if (ev.message && !ev.message.is_echo)`).
**Verification step:** The IG branch guards `!ev.message.is_echo` exactly like the page branch.

### Pitfall 8: www callback / apex 307 (inherited, must not regress)
**What goes wrong:** Subscribing IG to the apex `https://morfx.app/...` → apex 307-redirects → POST body dropped → zero inbound.
**How to avoid:** IG events use the SAME single callback `https://www.morfx.app/api/webhooks/meta` (www). No new callback URL — one Meta app, one URL, branched by `object`. This is app-level config (no code change), but the App-Dashboard `instagram` webhook field `messages` must be subscribed pointing at the www URL.
**Verification step:** App Dashboard shows `instagram` → `messages` subscribed at the www callback; smoke confirms delivery.

### Pitfall 9: Stickers / voice / reactions → graceful error, not crash
**What goes wrong:** A customer sends a sticker/voice clip/reaction; the sender or handler chokes on an unmapped type.
**How to avoid (inbound):** The attachment-type map (`image|video|audio|file`) already degrades unknown types to a text bubble in the FB handler — clone it. Reactions arrive as a different webhook shape; ignore them in V1 (inbox-only). **(outbound):** `metaInstagramSender.sendMedia` supports image (D-IG-08 scope = text+image); audio/video/document map like FB but are out of the V1 send scope — if attempted, return the existing graceful `Tipo de media no soportado` error (messages.ts pattern). Stickers/voice outbound → not offered in the compose UI.
**Verification step:** Handler maps known types, never throws on unknown; compose offers text + image only.

## Code Examples

### IG inbound webhook payload (what `object==='instagram'` delivers)
```jsonc
// Source: developers.facebook.com/docs/messenger-platform/instagram/features/webhook
{
  "object": "instagram",
  "entry": [
    {
      "id": "IGID",                 // your Instagram Professional account id = recipient.id below
      "time": 1748112000,
      "messaging": [
        {
          "sender":    { "id": "IGSID" },   // the CUSTOMER (string — never Number-coerce). Outbound recipient.
          "recipient": { "id": "IGID" },    // YOUR account → route via resolveByIgAccountId(entry.id)
          "timestamp": 1748112000000,
          "message": {
            "mid": "MESSAGE-ID",            // dedup key (idempotent on receiveMessage)
            "text": "Hola, ¿precio?",
            // media (when present):
            "attachments": [
              { "type": "image", "payload": { "url": "https://lookaside.fbsbx.com/..." } }
              // type ∈ image | video | audio | file (share/story map similarly)
            ],
            "is_echo": true                 // PRESENT when WE sent it → SKIP (Pitfall 7)
          }
        }
      ]
    }
  ]
}
```

### IG Send API — text (clone of sendMessengerText)
```typescript
// Source: developers.facebook.com/docs/messenger-platform/instagram/features/send-message
// POST /{page_id}/messages  (Bearer = Page Access Token)  — SAME endpoint/shape as FB Messenger.
const body = tag
  ? { messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT', recipient: { id: igsid }, message: { text } }
  : { messaging_type: 'RESPONSE',                          recipient: { id: igsid }, message: { text } }
return metaRequest<{ message_id: string; recipient_id: string }>(
  accessToken, `/${pageId}/messages`, { method: 'POST', body: JSON.stringify(body) }
)
// NOTE: NO `messaging_product` field (that's a WhatsApp Cloud API thing).
// NOTE: NO `platform` field required for the Page-based send (the Page→IG link routes it).
```

### IG Send API — image (clone of sendMessengerImage)
```typescript
// Source: send-message doc — attachment.type='image', payload.url (no caption field → caption is a follow-up text)
const body = {
  messaging_type: tag ? 'MESSAGE_TAG' : 'RESPONSE',
  ...(tag ? { tag: 'HUMAN_AGENT' } : {}),
  recipient: { id: igsid },
  message: { attachment: { type: 'image', payload: { url: imageUrl, is_reusable: true } } },
}
return metaRequest<{ message_id: string }>(accessToken, `/${pageId}/messages`, { method: 'POST', body: JSON.stringify(body) })
```

### Resolve `instagram_business_account` off the connected Page (NEW connect sub-step)
```typescript
// Source: graph-api Page node — instagram_business_account edge.
// Reuses the existing Page token from the workspace's connected Page row.
const res = await metaRequest<{ instagram_business_account?: { id: string; username?: string } }>(
  pageToken, `/${pageId}?fields=instagram_business_account{id,username}`
)
const ig = res.instagram_business_account
if (!ig?.id) {
  // D-IG-04 clear error:
  throw new Error('vincula una cuenta de Instagram Profesional a tu página de Facebook')
}
// → upsertMetaAccount({ ..., channel:'instagram', pageId, igAccountId: ig.id, igUsername: ig.username, accessTokenEncrypted })
// reuse the SAME Page token (encrypted) — IG Send/receive use it verbatim.
```

### Resolve IGSID display name (SIMPLER than FB — direct edge works)
```typescript
// Source: developers.facebook.com/docs/messenger-platform/instagram/features/user-profile
// GET /{IGSID}?fields=name,username  with the Page token (needs instagram_basic + instagram_manage_messages — APPROVED).
export async function getInstagramUserName(accessToken: string, igsid: string): Promise<string | null> {
  try {
    const p = await metaRequest<{ name?: string; username?: string }>(
      accessToken, `/${igsid}?fields=name,username`
    )
    return p.name?.trim() || (p.username ? `@${p.username}` : null)
  } catch {
    return null   // best-effort → caller falls back to `IG-${igsid}` + self-heal later
  }
}
// FALLBACK (only if the direct edge ever fails — mirror the FB workaround):
//   GET /{ig_account_id}/conversations?platform=instagram&user_id={igsid}&fields=participants
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ManyChat proxy for IG DMs | Meta Graph API direct (Messenger Platform / Instagram) | This phase | Native inbox, no third-party proxy; default stays manychat (Regla 6) |
| 5,000 automated DMs/day | 200 DMs/hour × engaged users | Oct 2024 (Meta) | Rate budget scales with audience; not a blocker for human-inbox V1 [CITED: creatorflow/getphyllo] |
| FB direct user-profile `GET /{psid}` (failed 100/33) | IG direct `GET /{IGSID}?fields=name,username` works | n/a (IG behaves differently) | IG name resolution is simpler than FB — no conversations-edge workaround needed |

**Deprecated/outdated:**
- **1000-follower minimum for the messaging API:** historical; current Meta docs gate IG messaging on a **Professional account + connected Page + approved permissions**, not a follower count. Treat "1000 followers" as NOT a hard requirement. [VERIFIED: search returned no current follower-minimum for the messaging API — flag as removed]
- **Message tags other than HUMAN_AGENT:** the FB tags removed 2026-04-27 never applied to IG anyway; IG only ever supported `HUMAN_AGENT`. [CITED: "Only the Human Agent tag is available on the Instagram API"]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The webhook `recipient.id` / `entry.id` equals the `instagram_business_account.id` resolved at connect time (so `resolveByIgAccountId(entry.id)` matches) | Pitfall 2, Standard Stack | If the IDs differ (e.g., a separate "connected_instagram_account" id), routing fails → MUST verify in smoke that `entry.id` matches the stored `ig_account_id`. **Highest-value smoke check.** |
| A2 | The existing Page `subscribed_apps` subscription + an app-level `instagram`/`messages` field subscription deliver IG DMs to the SAME www callback without a per-workspace IG-specific subscribe call | Standard Stack, Pitfall 8 | If a separate per-account IG subscribe is needed, `connectInstagramAccount` must add it. Verify delivery in smoke; if missing, add `subscribeInstagram` mirroring `subscribeMessengerPage`. |
| A3 | `GET /{IGSID}?fields=name,username` returns a usable name with the Page token under the approved scopes (no extra grant needed) | Code Examples, Pattern 3 | If it 100/33s like FB did, fall back to the IG conversations edge (documented). Self-heal covers the race regardless. |
| A4 | No `messaging_product`/`platform` field is required on the Page-based IG send | Code Examples | If Meta rejects without `platform`, add it — but the Page→IG link normally routes the platform implicitly. Smoke confirms. |

## Open Questions (RESOLVED)

> Both questions are MEDIUM-confidence linkages that are **live-only verifiable** (no amount of doc-reading settles them — only a real DM against the test account does). Resolution is designed INTO the plans as explicit blocking smoke-verify steps (A1/A2) in Plan 41-07 Task 2 Step B, each with STOP-and-report-on-mismatch handling and a documented fallback. They are surfaced at the gated cutover BEFORE any broad rollout, so a wrong assumption is caught on one test workspace, never silently in prod.

1. **Does `entry.id` in the IG webhook exactly equal the stored `ig_account_id`?**
   - What we know: docs say `recipient.id` = "IGID" = the Instagram Professional account id; `instagram_business_account{id}` is that account's id.
   - What's unclear: edge cases where Meta returns a different namespaced id in webhooks vs the Graph node.
   - Recommendation: SMOKE-VERIFY first — send a real DM to the test account and assert `entry.id` matches the `ig_account_id` resolved at connect. This is the single linchpin (A1). Build it as an early plan/Wave-0 check.
   - **RESOLVED:** deferred to the linchpin A1 smoke in Plan 41-07 (Step B6) — STOP-on-mismatch; fallback is to map `recipient.id`→`ig_account_id` explicitly if the namespaced ids diverge. Live-only verifiable.

2. **Is an app-level `instagram` webhook field subscription (`messages`) already configured for this Meta app, or is it a one-time setup step?**
   - What we know: the FB app already subscribes `page`/`messages`; IG `messages` is a separate App-Dashboard field subscription.
   - What's unclear: whether it's already on (FB connect didn't need it).
   - Recommendation: include a one-time "subscribe `instagram`/`messages` in App Dashboard pointing at the www callback" operator step (mirrors the FB callback setup), then smoke-verify delivery.
   - **RESOLVED:** deferred to the linchpin A2 smoke in Plan 41-07 (Step B7) — if the existing Page `subscribed_apps` does NOT deliver IG DMs, the documented fallback is the one-time App-Dashboard `instagram`/`messages` field subscription + (if needed) a per-account IG subscribe. Live-only verifiable.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Meta Graph API v22.0 | all IG calls | ✓ | v22.0 (pinned constants.ts) | — |
| `instagram_basic` permission | name edge, account resolve | ✓ APPROVED | — | — |
| `instagram_manage_messages` permission | send/receive DMs, name edge | ✓ APPROVED | — | — |
| `pages_manage_metadata` | Page subscribe | ✓ (FB connect uses it) | — | — |
| Connected FB Page + linked IG Professional account | the whole flow | ✓ (test: IG linked to Varixcenter or Pruebas Morfx Page) | — | clear Spanish error if not linked |
| `HUMAN_AGENT` (Human Agent App-Review feature) | outside-24h send | ✗ NOT approved | — | block with Spanish msg (`window-gate.ts`, `META_HUMAN_AGENT_ENABLED=OFF`) |
| HSM templates on IG | re-open window | ✗ does not exist on IG | — | none — block-only |

**Missing dependencies with no fallback:** none that block V1 (human-inbox, in-window).
**Missing dependencies with fallback:** `HUMAN_AGENT` → block message (expected, same as FB).

## Validation Architecture

> `workflow.nyquist_validation` not explicitly false → section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (project standard) |
| Config file | repo root vitest config (used by all `__tests__`) |
| Quick run command | `npx vitest run src/lib/instagram/ src/lib/meta/instagram-api.* src/lib/channels/meta-instagram-sender.*` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IG-01 | `object==='instagram'` branch parses `messaging[]`, routes by `entry.id`, skips `is_echo` | unit | `npx vitest run src/app/api/webhooks/meta/__tests__/instagram-branch.test.ts` | ❌ Wave 0 |
| IG-01/03 | handler resolves contact by `ig-${igsid}`, self-heals `IG-`, no fuzzy match | unit | `npx vitest run src/lib/instagram/__tests__/webhook-handler.test.ts` | ❌ Wave 0 |
| IG-02 | Send text/image hits `POST /{page_id}/messages` with `recipient:{id:igsid}` | unit | `npx vitest run src/lib/meta/__tests__/instagram-api.test.ts` | ❌ Wave 0 |
| IG-02/MIG-02 | domain `instagram` arm branches provider; manychat sub-arm byte-identical | unit | `npx vitest run src/lib/domain/__tests__/messages-instagram.test.ts` | ❌ Wave 0 |
| IG-05 | outside-24h → block decision (reused window-gate) | unit | covered by existing `window-gate` tests (REUSE) | ✅ (FB tests) |
| MIG-02/Regla 6 | default `manychat`; meta sender NOT in channel map; godentist-fb-ig 0-diff | unit + grep | `npx vitest run ...` + grep assertions (Pitfall 4) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** quick run command above.
- **Per wave merge:** `npx vitest run`.
- **Phase gate:** full suite green + live smoke (real IG DM round-trip) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/app/api/webhooks/meta/__tests__/instagram-branch.test.ts` — IG-01 (sample payload from §Code Examples)
- [ ] `src/lib/instagram/__tests__/webhook-handler.test.ts` — IG-01/03
- [ ] `src/lib/meta/__tests__/instagram-api.test.ts` — IG-02
- [ ] `src/lib/domain/__tests__/messages-instagram.test.ts` — IG-02/MIG-02 + Regla 6 manychat byte-identity
- [ ] Regla 6 grep assertions in CI/checklist (Pitfall 4)
- (window-gate: REUSE existing FB tests — no new file)

## Security Domain

> `security_enforcement` not explicitly false → included.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Owner-gated server action (`getRequestAuth` + `workspace_members.role==='owner'`), copied verbatim from `connectFacebookPage` |
| V4 Access Control | yes | `workspaceId` session-derived NEVER from input; webhook routes by `recipient.id` only (no payload-supplied tenant); domain filters by `workspace_id` |
| V5 Input Validation | yes | Webhook HMAC-verified BEFORE parse; IGSID kept as string; unknown IGID → ack-and-drop |
| V6 Cryptography | yes | Page token AES-256-GCM via `encryptToken`; HMAC-SHA256 via `timingSafeEqual`; token never logged |
| V9 Communications | yes | www callback over HTTPS; one app/one URL |

### Known Threat Patterns for IG-via-Page messaging
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged webhook (spoofed DM) | Spoofing | `verifyMetaHmac(raw, X-Hub-Signature-256, META_APP_SECRET)` → 401 (REUSE) |
| Cross-tenant routing via payload | Tampering / Info Disclosure | route ONLY by `entry.id`/`recipient.id` → `resolveByIgAccountId`; unknown → ack-and-drop |
| Token leak in logs | Info Disclosure | never log token; encrypted at rest; toast stays generic |
| Retry storm (Meta retries ≤7×) | DoS | idempotent on `mid` (`receiveMessage` 23505 dedup); 200 ack on unknown |
| Provider flip without consent | Elevation / Regla 6 | connect inserts row but NEVER flips `instagram_provider` (manual SQL cutover) |

## Migration

**One new migration. Everything else (the `ig_account_id` column, `uq_meta_ig`, `idx_meta_accounts_ig`) ALREADY EXISTS from the Phase 37 `workspace_meta_accounts` migration.**

```sql
-- supabase/migrations/20260605xxxxxx_add_instagram_provider.sql
-- Purpose: Per-workspace selection between manychat (legacy proxy) and meta_direct (Graph API)
--          for INSTAGRAM, independent of messenger_provider (D-IG-02). DB-enforced default
--          'manychat' = every existing workspace (incl. godentist-fb-ig) stays unchanged,
--          zero backfill (Regla 6). Sibling of 20260604120000_add_messenger_provider.sql.
-- Phase: 41-instagram-direct — MIG-02 / D-IG-02
-- Regla 5: APPLY IN PROD BEFORE pushing any code that references workspaces.instagram_provider.
ALTER TABLE workspaces
  ADD COLUMN instagram_provider TEXT NOT NULL DEFAULT 'manychat'
  CHECK (instagram_provider IN ('manychat', 'meta_direct'));
```

**Optional (Claude's Discretion D-IG-04):** store the IG handle for display.
```sql
-- Only if storing the IG username is desired (display-only; ig_account_id is the identity).
ALTER TABLE workspace_meta_accounts
  ADD COLUMN ig_username TEXT;   -- nullable, no constraint; ig_account_id (exists) is the key
```
> `ig_account_id` is ALREADY in `workspace_meta_accounts` (Phase 37) — do NOT re-add it. `upsertMetaAccount` already accepts `pageId`; extend its params with `igAccountId` (+ optional `igUsername`) and add them to the INSERT/UPDATE column sets.

**Regla 5 PRE-DEPLOY CHECKPOINT (HARD GATE):**
1. Author the migration in `supabase/migrations/`.
2. **PAUSE** — ask the user to apply it in PROD.
3. **WAIT** for explicit confirmation.
4. Only then push any code reading `instagram_provider`.
Skipping this is the exact failure mode of the 20h-lost-messages incident (CLAUDE.md Regla 5).

## Sources

### Primary (HIGH confidence)
- developers.facebook.com/docs/messenger-platform/instagram/features/webhook — `object:'instagram'`, `entry[].messaging[]`, `sender.id`=IGSID, `recipient.id`=IGID, `is_echo`, `messages` field
- developers.facebook.com/docs/messenger-platform/instagram/features/send-message — `POST /{page_id}/messages`, Page token, `recipient:{id:IGSID}`, image attachment shape
- developers.facebook.com/docs/messenger-platform/instagram/features/user-profile — `GET /{IGSID}?fields=name,username,profile_pic,follower_count,...` with Page token + `instagram_basic`+`instagram_manage_messages`
- Codebase (shipped Phase 40 + Phase 37): `credentials.ts` (`resolveByIgAccountId` exists), `20260401100000_create_workspace_meta_accounts.sql` (`ig_account_id`+`uq_meta_ig`+index exist), `messages.ts` (provider chokepoint), `window-gate.ts`, `contacts.ts` (`healPlaceholderContactName` with `placeholderPrefix`), `meta-facebook-sender.ts`, `messenger-connect.ts`, `meta-onboarding.ts`, `registry.ts` (`manychatInstagramSender`)

### Secondary (MEDIUM confidence — verified against multiple sources)
- developers.facebook.com/docs/instagram-platform/webhooks — app-level `instagram`/`messages` subscription + `POST /{page_id}/subscribed_apps`
- HUMAN_AGENT on IG: Manychat help, Chatwoot user-guide, keyapi.ai 24h-window guide — IG supports ONLY HUMAN_AGENT, 24h session + 7-day human-agent window
- Rate limits: creatorflow.so, getphyllo.com — 200 DMs/hour × engaged users (since Oct 2024)

### Tertiary (LOW confidence — flagged for smoke verification)
- `entry.id` == stored `ig_account_id` linkage (A1) — verify in smoke
- whether a per-account IG subscribe call is needed beyond the Page subscription (A2) — verify in smoke
- `instagram_business_account` vs `connected_instagram_account` namespacing — official comparison not found; resolve via `instagram_business_account{id,username}` and verify the id matches webhook `recipient.id`

## Metadata

**Confidence breakdown:**
- IG webhook payload shape (#1 risk): **HIGH** — confirmed against the official Instagram Messaging webhook doc; `object:'instagram'`, `entry[].messaging[]`, IGSID/IGID identities all explicit. Matches D-IG-06's assumption.
- IG Send API: **HIGH** — official send-message doc confirms `POST /{page_id}/messages` + Page token + `recipient:{id:IGSID}`; structurally identical to FB.
- 24h window + HUMAN_AGENT + no templates: **HIGH** — multiple sources agree IG = 24h session, HUMAN_AGENT-only, 7-day cap, no HSM. `window-gate.ts` reusable verbatim.
- Name edge: **HIGH** — direct `GET /{IGSID}?fields=name,username` documented with the approved scopes; simpler than FB.
- `instagram_business_account` resolution + webhook subscription: **MEDIUM** — resolution edge is standard but the `entry.id`↔`ig_account_id` linkage (A1) and the exact subscription requirement (A2) are smoke-verify items.
- Rate/follower limits: **MEDIUM** — non-blocking for human-inbox V1; 200/hr scales with audience; 1000-follower minimum appears removed.
- Codebase clone map: **HIGH** — FB sibling is shipped + live-verified; IG infra (`resolveByIgAccountId`, `ig_account_id` schema) already present.

**Research date:** 2026-06-05
**Valid until:** 2026-07-05 (Meta Graph API stable on v22.0; re-verify if Meta bumps the enforced minimum or changes IG messaging policy)

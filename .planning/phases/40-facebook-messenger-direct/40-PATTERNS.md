# Phase 40: Facebook Messenger Direct - Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** 14 new/modified files
**Analogs found:** 14 / 14 (this phase is ~80% mirroring shipped P38/P39 code)

> **Reading note for the planner:** Phase 40 is a structural clone of the Phase 38 (connect/webhook) + Phase 39 (provider-flag chokepoint + ChannelSender + Regla 6 byte-identical default) playbook. Every new file has a KNOWN analog. The only place the P38 WhatsApp pattern does NOT transfer cleanly is the **connect token-exchange** — WhatsApp uses an Embedded Signup `config_id` + `exchangeCodeForBisuat` (single OAuth exchange → BISUAT). Facebook Page connect is **classic FB Login** → short-lived user token → **long-lived user token** → **`/me/accounts` Page token** → **per-Page `subscribed_apps`**. That chain is a NEW sibling, flagged in §Divergence.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/channels/meta-facebook-sender.ts` (NEW — `metaFacebookSender`) | channel-sender | request-response | `src/lib/channels/meta-whatsapp-sender.ts` (creds-object) + `manychat-sender.ts` (image-as-followup) | exact (structural mirror) |
| `src/lib/meta/messenger-api.ts` (NEW — `sendMessengerText`/`sendMessengerImage`/`getMessengerUserProfile`) | utility (Graph API) | request-response | `src/lib/meta/api.ts` `sendWhatsAppText`/`sendWhatsAppMedia` + `metaRequest` | exact (role-match) |
| `src/lib/meta/messenger-connect.ts` (NEW — token exchange + Page token + subscribe) | utility (OAuth/server-only) | request-response | `src/lib/meta/embedded-signup.ts` (`exchangeCodeForBisuat`, `subscribeWaba`) — **DIVERGES** | role-match (see §Divergence) |
| `src/lib/domain/messages.ts` (MODIFY — `readMessengerProvider` + facebook arm) | domain (chokepoint) | CRUD / request-response | `readWhatsappProvider` + the `meta_direct` arm in the SAME file (P39) | exact (same file) |
| `src/app/api/webhooks/meta/route.ts` (MODIFY — `object==='page'` branch) | route (webhook) | event-driven | the `object==='whatsapp_business_account'` branch + line-116 reject + HMAC verify in same file | exact (same file) |
| `src/lib/messenger/webhook-handler.ts` (NEW — `processMessengerWebhook`) | service (inbound handler) | event-driven | `src/lib/manychat/webhook-handler.ts` `processManyChatWebhook` | exact (clone) |
| `src/lib/meta/credentials.ts` (MODIFY/reuse — page-token resolver) | domain (read) | request-response | existing `resolveByPageId` (already present) + `resolveByWorkspace` | exact (already exists — reuse) |
| `src/app/actions/meta-onboarding.ts` (MODIFY — add `connectFacebookPage()`) | server action | request-response | existing `connectWhatsAppNumber()` in same file (auth gate + domain delegate) | role-match (gate identical, body diverges) |
| `src/lib/domain/meta-accounts.ts` (MODIFY — `channel:'facebook'` + `page_id`) | domain (write) | CRUD | existing `upsertMetaAccount` in same file | exact (extend) |
| `src/components/settings/connect-facebook.tsx` (NEW — FB Login popup) | component (client) | request-response | `src/components/settings/connect-whatsapp.tsx` `FB.login` block | role-match (config_id → scope) |
| `src/app/actions/messages.ts` (MODIFY — facebook window/tag gate) | server action | request-response | existing 24h-window check in same file (currently WhatsApp-only) | role-match (extend for facebook) |
| `supabase/migrations/*_add_messenger_provider.sql` (NEW) | migration | — | `20260602120000_add_whatsapp_provider.sql` (P39) | exact (verbatim template) |
| `src/lib/channels/__tests__/meta-facebook-sender.test.ts` (NEW) | test | — | `src/lib/channels/__tests__/meta-whatsapp-sender.test.ts` | exact |
| `src/lib/domain/__tests__/messenger-provider.test.ts` (NEW) | test | — | `src/lib/domain/__tests__/messages-provider.test.ts` | exact |

---

## Pattern Assignments

### `src/lib/channels/meta-facebook-sender.ts` (NEW — channel-sender, request-response)

**Analog:** `src/lib/channels/meta-whatsapp-sender.ts` (creds-object shape, NOT in the registry map) + `src/lib/channels/manychat-sender.ts` (image-caption-as-followup-text).

**Creds-object + unwrap pattern** (`meta-whatsapp-sender.ts:30-49`):
```typescript
/** Meta credentials resolved from workspace context — NEVER from input (T-39-02). */
export interface MetaCreds {
  accessToken: string
  phoneNumberId: string
}
interface SendResponse { messages?: Array<{ id: string }> }
function unwrap(response: SendResponse): ChannelSendResult {
  const externalMessageId = response.messages?.[0]?.id
  return { success: true, externalMessageId }
}
export const metaWhatsappSender = {
  async sendText(creds: MetaCreds, to: string, text: string): Promise<ChannelSendResult> {
    const response = await sendWhatsAppText(creds.accessToken, creds.phoneNumberId, to, text)
    return unwrap(response)
  },
  // ...
}
```

**Image-caption-as-followup pattern to copy** (`manychat-sender.ts:40-52` — Messenger has NO native image caption):
```typescript
async sendImage(apiKey, to, imageUrl, caption?) {
  await mcSendImage(apiKey, to, imageUrl)
  if (caption) { await mcSendText(apiKey, to, caption) }   // caption = separate text
  return { success: true }
}
```

**Adaptation for Messenger:**
- Creds object is `{ accessToken, pageId }` (NOT `phoneNumberId`). Define `export interface MetaPageCreds { accessToken: string; pageId: string }`.
- `to` is the **PSID string** — keep as string end-to-end, NEVER `Number()` it (Pitfall: PSID > `Number.MAX_SAFE_INTEGER`).
- Messenger Send API returns `{ message_id, recipient_id }` (NOT `{ messages: [{ id }] }`). `unwrap` must read `response.message_id` → `externalMessageId`.
- `sendText`/`sendImage` accept an optional `tag?: 'HUMAN_AGENT'` 4th/5th arg (for the outside-24h path, D-09).
- `sendImage`: image attachment carries NO caption field — send caption as a follow-up `sendMessengerText` (copy the manychat pattern verbatim).
- **Regla 6 (CRITICAL):** Do NOT register `metaFacebookSender` in `registry.ts`. The domain branch imports it directly (exactly like `metaWhatsappSender`). See §Shared Patterns / Regla 6.

---

### `src/lib/meta/messenger-api.ts` (NEW — utility Graph API, request-response)

**Analog:** `src/lib/meta/api.ts` `sendWhatsAppText` (lines 63-83) + `sendWhatsAppMedia` (130-150) + `metaRequest` (24-54).

**`metaRequest` is the reused transport** (`api.ts:24-54`) — Bearer auth, pinned `META_BASE_URL`, `MetaGraphApiError` parsing. Do NOT hand-roll a fetch wrapper.

**WhatsApp send shape to mirror** (`api.ts:63-83`):
```typescript
export async function sendWhatsAppText(accessToken, phoneNumberId, to, text) {
  return metaRequest<{ messages: Array<{ id: string }> }>(
    accessToken, `/${phoneNumberId}/messages`,
    { method: 'POST', body: JSON.stringify({
        messaging_product: 'whatsapp', recipient_type: 'individual', to,
        type: 'text', text: { body: text },
    }) }
  )
}
```

**Adaptation for Messenger** (RESEARCH §Code Examples — verified payloads):
- Endpoint: `/${pageId}/messages` (Page token as Bearer). Response type: `{ message_id: string; recipient_id: string }`.
- `sendMessengerText(accessToken, pageId, psid, text, tag?)` body:
  ```jsonc
  // inside 24h:        { "messaging_type": "RESPONSE", "recipient": { "id": "<PSID>" }, "message": { "text": "..." } }
  // 24h–7d HUMAN_AGENT:{ "messaging_type": "MESSAGE_TAG", "tag": "HUMAN_AGENT", "recipient": { "id": "<PSID>" }, "message": { "text": "..." } }
  ```
- `sendMessengerImage(accessToken, pageId, psid, imageUrl, tag?)` body:
  ```jsonc
  { "messaging_type": "RESPONSE", "recipient": { "id": "<PSID>" },
    "message": { "attachment": { "type": "image", "payload": { "url": "<url>", "is_reusable": true } } } }
  ```
  No caption field — caller (`metaFacebookSender.sendImage`) sends caption as a separate text.
- `getMessengerUserProfile(accessToken, psid)`: `GET /${psid}?fields=first_name,last_name,profile_pic`. Best-effort — on failure fall back to `FB-${psid}` (Assumption A2: `profile_pic` may be absent; degrade gracefully).
- **Dead tags:** NEVER send `CONFIRMED_EVENT_UPDATE`/`ACCOUNT_UPDATE`/`POST_PURCHASE_UPDATE` (removed 2026-04-27, error 100). Only `HUMAN_AGENT` survives.

---

### `src/lib/domain/messages.ts` (MODIFY — domain chokepoint, CRUD)

**Analog:** `readWhatsappProvider` (lines 44-54) + the `meta_direct` arm in `sendTextMessage` (159-184) / `sendMediaMessage` (261-301) — the SAME file. **THE CHOKEPOINT (Regla 3 / D-10).**

**Provider-read helper to mirror** (`messages.ts:44-54`):
```typescript
async function readWhatsappProvider(supabase, workspaceId): Promise<'360dialog' | 'meta_direct'> {
  const { data: ws } = await supabase
    .from('workspaces').select('whatsapp_provider').eq('id', workspaceId).single()
  return ws?.whatsapp_provider === 'meta_direct' ? 'meta_direct' : '360dialog'
}
```
→ Add a sibling `readMessengerProvider(supabase, workspaceId): Promise<'manychat' | 'meta_direct'>` reading `messenger_provider`, **default `'manychat'`** (Regla 6).

**Provider branch to mirror** (`messages.ts:152-184`, the `whatsapp` arm) — replicate the EXACT same 3-way shape for `channel === 'facebook'`:
```typescript
const provider = channel === 'whatsapp'
  ? await readWhatsappProvider(supabase, ctx.workspaceId)
  : '360dialog'
if (channel === 'whatsapp' && provider === 'meta_direct') {
  const creds = await resolveByWorkspace(ctx.workspaceId, 'whatsapp')   // NEVER from input (T-39-02)
  if (!creds?.accessToken || !creds.phoneNumberId) return { success:false, error:'Credenciales Meta no configuradas' }
  const resp = await metaWhatsappSender.sendText({ accessToken: creds.accessToken, phoneNumberId: creds.phoneNumberId }, params.contactPhone, params.messageBody)
  wamid = resp.externalMessageId
} else if (channel === 'whatsapp') {
  /* 360dialog byte-identical (Regla 6) */
} else {
  /* getChannelSender(channel) → manychat path (Regla 6 byte-identical) */
}
```

**Adaptation for Messenger:**
- Add a `messenger_provider` decision for `channel === 'facebook'`: read once via `readMessengerProvider`.
- `meta_direct` arm: `resolveByWorkspace(ctx.workspaceId, 'facebook')` → `{ accessToken, pageId }` → `metaFacebookSender.sendText(...)`. Pass the optional `tag` from the param if the caller resolved a HUMAN_AGENT send.
- `manychat` arm (default): falls through to the EXISTING `else { getChannelSender('facebook') }` path — **must stay byte-identical** (that path imports `manychatFacebookSender` via `registry.ts`).
- Recipient is `params.contactPhone` which for facebook is the PSID string (the messages server action already passes `external_subscriber_id` as the recipient — see `messages.ts` action below).
- Do the same modification in `sendMediaMessage` (facebook → image only; mirror the existing `if (params.mediaType === 'image')` guard at `messages.ts:289`).

---

### `src/app/api/webhooks/meta/route.ts` (MODIFY — route, event-driven)

**Analog:** the SAME file. HMAC verify (`verifyMetaHmac`, lines 36-50), the raw-body-first read (90-104), the `object !== 'whatsapp_business_account'` **reject at line 116** (becomes a branch), and the WABA-branch-before-phone_number_id pattern (129-186).

**The line-116 reject to convert into a branch** (`route.ts:115-119`):
```typescript
if (payload.object !== 'whatsapp_business_account') {
  console.warn('[meta-webhook] non-WhatsApp webhook:', payload.object)
  return NextResponse.json({ error: 'Invalid webhook type' }, { status: 400 })
}
```

**The ack-and-drop unknown-tenant pattern to copy** (`route.ts:197-201`):
```typescript
const creds = await resolveByPhoneNumberId(phoneNumberId)
if (!creds) {
  console.warn('[meta-webhook] unknown phone_number_id, ack & drop:', phoneNumberId)
  return NextResponse.json({ received: true }, { status: 200 })
}
```

**Adaptation for Messenger** (RESEARCH Pattern 3 — insert AFTER HMAC verify + JSON parse, BEFORE the line-116 reject):
```typescript
if (payload.object === 'page') {
  for (const entry of payload.entry ?? []) {
    const pageId = entry.id
    const creds = await resolveByPageId(pageId)          // EXISTING resolver, credentials.ts:90
    if (!creds) { continue }                              // ack & drop unknown page (no cross-tenant leak)
    for (const ev of entry.messaging ?? []) {
      if (ev.message && !ev.message.is_echo) {           // SKIP our own echoes (Pitfall 6)
        await processMessengerWebhook(ev, creds.workspaceId, pageId)
      }
      // ignore ev.delivery / ev.read / ev.postback for inbox-only V1
    }
  }
  return NextResponse.json({ received: true }, { status: 200 })
}
// ... existing whatsapp_business_account handling continues (the 116 reject stays for everything else)
```
- HMAC verify is reused verbatim — `payload.object === 'page'` events are still HMAC-signed with `META_APP_SECRET`. Do NOT add a second verifier.
- `WebhookPayload` type (imported at route top) will need a `messaging[]` variant or a local cast (mirror the `as unknown as {...}` cast already used at `route.ts:129-134` for the template-status branch).
- Route by `page_id` ONLY via `resolveByPageId` — never trust a payload-supplied workspace (V4 access control).

---

### `src/lib/messenger/webhook-handler.ts` (NEW — service, event-driven)

**Analog:** `src/lib/manychat/webhook-handler.ts` `processManyChatWebhook` (lines 65-141 are the inbox-relevant core).

**Core inbound pattern to clone** (`manychat/webhook-handler.ts:65-141`):
```typescript
export async function processManyChatWebhook(payload, workspaceId): Promise<{ stored: boolean }> {
  const supabase = createAdminClient()
  const ctx: DomainContext = { workspaceId, source: 'webhook' }
  const subscriberId = String(payload.subscriber_id)
  const profileName = payload.name || payload.first_name || `FB-${subscriberId}`
  const channel: 'facebook' | 'instagram' = payload.channel === 'instagram' ? 'instagram' : 'facebook'
  const phoneIdentifier = `mc-${subscriberId}`
  // 1. find/create conversation
  const convResult = await domainFindOrCreateConversation(ctx, {
    phone: phoneIdentifier, channel, profileName, externalSubscriberId: subscriberId,
  })
  // 3. store via domain receiveMessage
  const domainResult = await domainReceiveMessage(ctx, {
    conversationId, contactId: null, phone: phoneIdentifier, messageContent: messageText,
    messageType: 'text', waMessageId, contentJson: { body: messageText },
    timestamp: messageTimestamp, contactName: profileName,
  })
}
```

**Adaptation for Messenger:**
- Signature: `processMessengerWebhook(ev, workspaceId, pageId)` where `ev` is a single `entry.messaging[]` item: `ev.sender.id` = **PSID (customer)**, `ev.recipient.id` = page_id, `ev.message.mid` = dedup key, `ev.message.text`, `ev.message.attachments[]`.
- `subscriberId` ≡ PSID string. Conversation identifier: mirror manychat's `phone: 'mc-${id}'` convention but use a Messenger-distinct prefix (e.g. `phone: 'fb-${PSID}'`, `externalSubscriberId: PSID`, `channel: 'facebook'`). **PSID stays a string** (Pitfall 5).
- `waMessageId` = `ev.message.mid` (real dedup key — receiveMessage is idempotent on it; mirrors the `payload.message_id || ...` fallback at line 129).
- **D-04 contact resolution:** resolve-or-create contact by `(page_id, PSID)` — NOT manychat's phone-match block (lines 103-125). Do NOT fuzzy-match phone/email (D-04/D-05). Fetch display name/avatar via `getMessengerUserProfile(creds.accessToken, PSID)`; fall back to `FB-${PSID}` on failure.
- **OMIT the Inngest agent dispatch** (manychat lines 247-280) — D-12 is human-inbox-only, RESEARCH Open Q2 recommends no dormant agent path. Also OMIT the entire `v4Path` lock block (lines 160-245) — that is v4-gated infra irrelevant here.
- `contactId: null` → conversation's `contact_id` resolves it (same as manychat); but here you DO have a contact from the `(page_id, PSID)` create-or-get, so link it via `domainLinkContactToConversation` (mirror lines 119-123) and pass its id.

---

### `src/lib/meta/credentials.ts` (REUSE — domain read, request-response)

**Analog / already exists:** `resolveByPageId` (lines 90-105) is ALREADY present and returns the decrypted `{ accessToken, pageId, workspaceId, ... }`. **No new resolver needed for inbound.**

```typescript
export async function resolveByPageId(pageId: string): Promise<MetaCredentials | null> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('workspace_meta_accounts')
    .select('workspace_id, ..., page_id, ..., access_token_encrypted')
    .eq('page_id', pageId).eq('is_active', true).single()
  if (!data) return null
  return rowToCredentials(data)   // decryptToken inside
}
```

**Adaptation:** For OUTBOUND sends, the domain chokepoint uses `resolveByWorkspace(workspaceId, 'facebook')` (lines 136-153) — already channel-parameterized via the `MetaChannel` union (`facebook` already allowed, `types.ts:67`). The returned `MetaCredentials.pageId` is the page identifier for `metaFacebookSender`. **No code change required** unless you want a typed `{ accessToken, pageId }` narrowing helper.

---

### `src/app/actions/meta-onboarding.ts` (MODIFY — server action, request-response)

**Analog:** existing `connectWhatsAppNumber()` in the SAME file (lines 66-130). The **auth gate (71-89) copies verbatim**; the body diverges (see §Divergence).

**Auth gate to copy verbatim** (`meta-onboarding.ts:71-89`):
```typescript
const auth = await getRequestAuth()
if (!auth) return { success: false, error: 'No autenticado' }
const workspaceId = auth.workspaceId                       // session-derived, NEVER from body (T-38-13)
const supabase = await createClient()
const { data: member } = await supabase.from('workspace_members')
  .select('role').eq('workspace_id', workspaceId).eq('user_id', auth.userId).single()
if (!member || member.role !== 'owner') return { success: false, error: 'Solo el Owner puede conectar...' }
```

**Domain-delegate + no-provider-flip pattern to copy** (`meta-onboarding.ts:103-117` + the D-04/D-06 comment at 26-29):
```typescript
const accessTokenEncrypted = encryptToken(pageToken)       // AES-256-GCM before persist (T-38-14)
const result = await upsertMetaAccount({ workspaceId, channel: 'facebook', /* pageId... */, accessTokenEncrypted, isActive: true })
// connecting does NOT flip messenger_provider — manual SQL flip only (mirror D-06)
```

**Adaptation:** new `connectFacebookPage(input)` — same auth gate, then the DIVERGENT token chain (§Divergence) instead of `exchangeCodeForBisuat`, then `upsertMetaAccount({ channel:'facebook', pageId, accessTokenEncrypted })`, then `subscribeMessengerPage(pageToken, pageId)`. MUST NOT touch `messenger_provider` (Regla 6).

---

### `src/lib/domain/meta-accounts.ts` (MODIFY — domain write, CRUD)

**Analog:** existing `upsertMetaAccount` in the SAME file (lines 67-134). Already INSERT-or-UPDATE by `(workspace_id, channel)`, already maps the UNIQUE-conflict to a Spanish string.

**Adaptation:** the `UpsertMetaAccountParams` interface (lines 29-38) currently carries `wabaId`/`phoneNumberId` but NOT `pageId`. Add `pageId?: string | null` and write it in both the UPDATE (lines 92-100) and INSERT (112-122) blocks. The `channel: 'facebook'` path leaves `waba_id`/`phone_number_id` null. `mapWriteError` (141-150) should additionally map a `page_id` UNIQUE conflict ("Esta página ya está conectada en otro espacio de trabajo."). The `page_id` column + UNIQUE already exist in prod (migration `20260401100000`).

---

### `src/components/settings/connect-facebook.tsx` (NEW — component, request-response)

**Analog:** `src/components/settings/connect-whatsapp.tsx` `FB.login` block (lines 196-213) + the SDK-load + message-listener scaffolding (110-177).

**FB.login call to adapt** (`connect-whatsapp.tsx:196-213`):
```typescript
window.FB.login((response: any) => {
  const code = response?.authResponse?.code
  if (code) { codeRef.current = code; tryComplete() }
}, {
  config_id: CONFIG_ID,                  // ← WhatsApp Embedded Signup config
  response_type: 'code',
  override_default_response_type: true,
  extras: { sessionInfoVersion: '3' },
})
```

**Adaptation for Page connect (the divergence point):**
- NO `config_id` / `sessionInfoVersion`. Instead pass `scope: 'pages_messaging,<ig_messaging_scope>'` (D-02 IG scope is forward-compat; a denied IG scope must NOT block the FB flow — graceful no-op).
- Keep `response_type: 'code'` (Assumption A1 — prefer `code` for parity so the secret stays server-side; the server exchanges it).
- No Channel-2 `window 'message'` listener needed (Page connect has no WABA/phone_number_id postMessage) — only the `code` from the callback. Drop the listener scaffolding (lines 145-177).
- On `code`, call the new `connectFacebookPage({ code })` server action.

---

### `src/app/actions/messages.ts` (MODIFY — server action, request-response — D-09 window/tag gate)

**Analog:** the existing 24h-window check in the SAME file (lines 113-127), currently WhatsApp-only and skipped for FB/IG.

**Existing window-check to extend** (`messages.ts:113-127`):
```typescript
if (channel === 'whatsapp') {
  if (!conversation.last_customer_message_at) return { error: 'Ventana de 24h cerrada. Usa un template.' }
  const hoursSinceCustomerMessage = differenceInHours(new Date(), new Date(conversation.last_customer_message_at))
  if (hoursSinceCustomerMessage >= 24) return { error: 'Ventana de 24h cerrada. Usa un template.' }
}
```

**Recipient resolution to reuse** (`messages.ts:149-152`) — FB already uses `external_subscriber_id` (= PSID) as recipient:
```typescript
const recipientId = (channel !== 'whatsapp' && conversation.external_subscriber_id)
  ? conversation.external_subscriber_id : conversation.phone
```

**Adaptation for facebook meta_direct (D-09):** add a `channel === 'facebook'` window gate that the manychat path currently skips:
- inside 24h (`hoursSinceCustomerMessage < 24`) → send with `messaging_type: RESPONSE` (no tag).
- 24h–7d (`< 168h`) AND the "Human Agent" feature flag granted (gate behind a config flag, e.g. `META_HUMAN_AGENT_ENABLED` — RESEARCH Open Q1) → send with `tag: 'HUMAN_AGENT'`.
- else → BLOCK with a clear Spanish message ("Ventana de 24h cerrada. Activa el permiso Human Agent o espera a que el cliente escriba.").
- **Only apply this gate when `messenger_provider === 'meta_direct'`** for the workspace — the manychat facebook path stays byte-identical (no window restriction, Regla 6). Note the provider decision LIVES in the domain layer (D-10); the action may need to surface the chosen `tag` down to `domainSendTextMessage` OR the domain re-checks. Planner: pick one site; do NOT duplicate the provider read.

---

### `supabase/migrations/*_add_messenger_provider.sql` (NEW — migration)

**Analog:** `20260602120000_add_whatsapp_provider.sql` (P39) — clone verbatim, swap names.

**Template to clone** (`20260602120000_add_whatsapp_provider.sql:10-12`):
```sql
ALTER TABLE workspaces
  ADD COLUMN whatsapp_provider TEXT NOT NULL DEFAULT '360dialog'
  CHECK (whatsapp_provider IN ('360dialog', 'meta_direct'));
```

**Adaptation:**
```sql
ALTER TABLE workspaces
  ADD COLUMN messenger_provider TEXT NOT NULL DEFAULT 'manychat'
  CHECK (messenger_provider IN ('manychat', 'meta_direct'));
```
- **Default `'manychat'`** (Regla 6 — every existing workspace incl. `godentist-fb-ig` stays on manychat, zero backfill).
- **Regla 5 (CRITICAL):** sequence this migration as its OWN step, applied to prod + confirmed by the user BEFORE pushing any code that reads `messenger_provider`. The header comment should mirror the P39 header (purpose, phase, "APPLY IN PROD BEFORE pushing code that references the column").

---

### Test files

**`src/lib/channels/__tests__/meta-facebook-sender.test.ts`** — clone `meta-whatsapp-sender.test.ts`:
- `vi.mock('@/lib/meta/messenger-api', ...)` returning stub `sendMessengerText`/`sendMessengerImage`/`getMessengerUserProfile`.
- Assert `metaFacebookSender.sendText` takes `{ accessToken, pageId }` creds (NOT apiKey), passes PSID as string, and forwards a `HUMAN_AGENT` tag when provided.
- Assert `sendImage` calls `sendMessengerImage` then a follow-up `sendMessengerText` when caption present (image-as-followup parity).
- Lazy `await import(...)` per test so Wave-0 RED is a clean per-test failure (mirror lines 41-57).

**`src/lib/domain/__tests__/messenger-provider.test.ts`** — clone `messages-provider.test.ts`:
- Chainable supabase builder stub where `workspaces.single()` returns `{ messenger_provider: currentProvider }` (mirror lines 68-97, swap column).
- `manychat` (DEFAULT) arm: asserts `getChannelSender('facebook')` path is used and `resolveByWorkspace`/`metaFacebookSender` are NEVER touched (Regla 6 parity — first-class assertion).
- `meta_direct` arm: asserts `resolveByWorkspace(WS_ID, 'facebook')` called and `metaFacebookSender.sendText` receives the resolved creds object (NOT `params.apiKey`).

Other Wave-0 RED test files (per RESEARCH Test Map): `src/lib/messenger/__tests__/webhook-handler.test.ts`, `src/lib/meta/__tests__/messenger-api.test.ts`, `src/lib/messenger/__tests__/psid-contact.test.ts`, `src/app/actions/__tests__/connect-facebook.test.ts`, `src/app/actions/__tests__/messenger-window.test.ts`.

---

## Shared Patterns

### Regla 6 — byte-identical manychat path (CRITICAL — applies to all facebook files)
**Source:** `src/lib/channels/registry.ts:11-15` + `src/lib/channels/manychat-sender.ts:28-53` + the `else` arm in `messages.ts:176-184`.
```typescript
// registry.ts — this map MUST stay byte-identical (facebook → manychatFacebookSender)
const senders: Record<ChannelType, ChannelSender> = {
  whatsapp: whatsappSender, facebook: manychatFacebookSender, instagram: manychatInstagramSender,
}
```
**Apply to:** every facebook file. The new `metaFacebookSender` is domain-imported (NOT in the registry map). `manychatFacebookSender`, `registry.ts`, and `agents/godentist-fb-ig/*` stay untouched. **Phase gate:** `git diff --stat src/lib/channels/manychat-sender.ts src/lib/channels/registry.ts` returns empty post-impl (RESEARCH Test Map). `godentist-fb-ig` is NOT migrated (D-11).

### Auth gate (owner-only connect)
**Source:** `src/app/actions/meta-onboarding.ts:71-89` (copy of `shopify-oauth.ts`).
**Apply to:** `connectFacebookPage()`. `workspaceId` ALWAYS session-derived via `getRequestAuth()`, NEVER from request body (T-38-13); `workspace_members.role === 'owner'`.

### Token encryption at rest
**Source:** `encryptToken`/`decryptToken` (`src/lib/meta/token.ts`, AES-256-GCM) — already used by `meta-onboarding.ts:101` and `credentials.ts:8`.
**Apply to:** the Page Access Token. Encrypt in the connect action before `upsertMetaAccount`; decrypt ONLY inside `credentials.ts` resolvers. Never log the plaintext token.

### HMAC verify before parse
**Source:** `verifyMetaHmac` + raw-body-first (`route.ts:36-50`, `90-104`).
**Apply to:** the `object==='page'` branch — reuse the SAME verifier (do not add a second). Forged/unsigned events already rejected 401 before the branch runs.

### Ack-and-drop unknown tenant
**Source:** `route.ts:197-201` (unknown phone_number_id → 200 drop).
**Apply to:** unknown `page_id` in the Messenger branch → `continue` / 200, never process with a null workspace (cross-tenant EoP defense).

### Provider chokepoint (Regla 3 / D-10)
**Source:** `messages.ts:44-54` + `152-184`.
**Apply to:** the single `readMessengerProvider` read inside the domain send fns. NEVER read the provider per-call-site.

---

## Divergence (where the P38 WhatsApp pattern does NOT transfer)

### Connect token exchange — NEW sibling `src/lib/meta/messenger-connect.ts`
**WhatsApp (P38):** `FB.login({ config_id, response_type:'code' })` → `exchangeCodeForBisuat(code)` (single OAuth exchange, `embedded-signup.ts:37-53`) → BISUAT (no expiry) → `subscribeWaba(bisuat, wabaId)` (POST `/{wabaId}/subscribed_apps`, NO fields).

**Facebook Page (P40):** classic FB Login with `scope:'pages_messaging,<ig_scope>'` → short-lived user token (or `code`) → **a 3-step chain that does NOT exist in P38**:
1. `GET /oauth/access_token?grant_type=fb_exchange_token&client_id=...&client_secret=...&fb_exchange_token=SHORT` → **long-lived user token (~60d)**. (Pitfall 3: a Page token derived from a SHORT-lived user token dies in 1h — must use the long-lived user token.)
2. `GET /me/accounts?fields=id,name,access_token` → pick the Page → **Page Access Token (never expires** when derived from a long-lived user token).
3. `POST /{page-id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks` with the **Page token** — **per-Page** subscription (Pitfall 4 — distinct from the WABA `subscribed_apps` which uses the BISUAT and no fields; easy to copy the WABA flow and forget the Page-level subscribe → zero inbound).

**Reuse from `embedded-signup.ts`:** the SERVER-ONLY discipline (META_APP_SECRET never reaches client), the dedicated unauthenticated fetch for the OAuth exchange (no Bearer header — `embedded-signup.ts:44-45`), and `subscribeWaba` as the structural template for `subscribeMessengerPage` (but add `?subscribed_fields=messages,messaging_postbacks` and use the Page token).

### Provider default differs
WhatsApp default = `'360dialog'`; Messenger default = **`'manychat'`** (the legacy path here is ManyChat, not 360dialog).

### Send-API response shape differs
WhatsApp returns `{ messages: [{ id }] }`; Messenger returns `{ message_id, recipient_id }`. `unwrap`/external-id extraction must change accordingly.

### Recipient identity differs
WhatsApp `to` = E.164 phone; Messenger `to` = **PSID string** (page-scoped, can exceed `Number.MAX_SAFE_INTEGER` — NEVER `Number()`).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | Every Phase-40 file has a known analog. The closest-to-novel logic is the FB-Login → long-lived → Page-token chain (`messenger-connect.ts`) and the HUMAN_AGENT window gate, both documented above with their partial analogs (`embedded-signup.ts` discipline + the existing 24h window check). |

---

## Metadata

**Analog search scope:** `src/lib/channels/`, `src/lib/meta/`, `src/lib/domain/`, `src/lib/manychat/`, `src/lib/messenger/` (new), `src/app/api/webhooks/meta/`, `src/app/actions/`, `src/components/settings/`, `supabase/migrations/`
**Files scanned (read in full or targeted):** 16 (channels: types, registry, meta-whatsapp-sender, manychat-sender; meta: api, credentials, embedded-signup, types; domain: messages, meta-accounts, conversations, contacts; manychat: webhook-handler; webhook route; actions: meta-onboarding, messages; component: connect-whatsapp; migration: add_whatsapp_provider; tests: meta-whatsapp-sender.test, messages-provider.test)
**Pattern extraction date:** 2026-06-04

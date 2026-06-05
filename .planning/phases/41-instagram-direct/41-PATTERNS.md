# Phase 41: Instagram Direct - Pattern Map

**Mapped:** 2026-06-05
**Files analyzed:** 13 (8 new/clone, 4 modify/extend, 1 migration) + 4 REUSE-verbatim + Regla 6 anchors
**Analogs found:** 13 / 13 (every IG file has a shipped, live-verified FB analog from Phase 40)

> **Overarching verdict:** Phase 41 is a near-verbatim CLONE of the SHIPPED Phase 40 (Facebook Messenger Direct). Every analog below is real, live-verified code. The universal swaps are:
> `PSID → IGSID` · `psid → igsid` · `pageId → pageId` (UNCHANGED — IG rides the same Page) · `fb- → ig-` (identifier) · `FB- → IG-` (placeholder) · `channel 'facebook' → 'instagram'` · `messenger_provider → instagram_provider` · `readMessengerProvider → readInstagramProvider` · `metaFacebookSender → metaInstagramSender` · `resolveByPageId → resolveByIgAccountId` · `object==='page' → object==='instagram'` (routing key `entry.id` = **IGID**, not pageId) · `getMessengerUserName(conversations-edge) → getInstagramUserName(direct edge GET /{IGSID}?fields=name,username)`.
>
> **Three Regla constraints recur on every file:**
> - **Regla 3:** all mutations through `@/lib/domain/*`; creds from `ctx.workspaceId`, never input.
> - **Regla 5:** the `instagram_provider` migration MUST be applied to prod + user-confirmed BEFORE any code reading the column is pushed.
> - **Regla 6:** the ManyChat IG path (`manychatInstagramSender`, `channel='instagram'`) and `godentist-fb-ig` stay BYTE-IDENTICAL. The new Meta sender is imported directly by the domain branch, NEVER added to the channel-keyed `senders` map.

---

## File Classification

| New/Modified File | Role | Data Flow (in→transform→out) | Closest Analog | Verdict |
|-------------------|------|------------------------------|----------------|---------|
| `supabase/migrations/2026060xxxxxxx_add_instagram_provider.sql` | migration | DDL | `20260604120000_add_messenger_provider.sql` | CLONE |
| `src/lib/instagram/webhook-handler.ts` | service (handler) | webhook event → domain store | `src/lib/messenger/webhook-handler.ts` `processMessengerWebhook` | CLONE |
| `src/lib/meta/instagram-api.ts` | service (API client) | args → Graph Send/Profile → response | `src/lib/meta/messenger-api.ts` `sendMessengerText/Image/Attachment` + `getMessengerUserName` | CLONE |
| `src/lib/channels/meta-instagram-sender.ts` | channel-sender (adapter) | creds+igsid → instagram-api → `ChannelSendResult` | `src/lib/channels/meta-facebook-sender.ts` `metaFacebookSender` | CLONE |
| `src/lib/meta/instagram-connect.ts` | service (connect helper) | pageId+pageToken → resolve IG account | NEW small helper (mirrors `messenger-connect.ts` style) | CLONE (small) |
| `src/components/settings/connect-instagram.tsx` | component (client) | FB.login token → server action | `src/components/settings/connect-facebook.tsx` `ConnectFacebook` | CLONE |
| `src/lib/domain/messages.ts` | domain (chokepoint) | provider read → branch send | `facebook` arm + `readMessengerProvider` | EXTEND |
| `src/app/api/webhooks/meta/route.ts` | route (webhook) | HMAC → branch by `object` | `object==='page'` branch | EXTEND |
| `src/app/actions/meta-onboarding.ts` | server action | auth → resolve IG → upsert | `connectFacebookPage` | EXTEND (add `connectInstagramAccount`) |
| `src/lib/domain/meta-accounts.ts` | domain (writer) | params → INSERT/UPDATE | `upsertMetaAccount` (`UpsertMetaAccountParams`) | EXTEND (add `igAccountId`/`igUsername`) |
| `src/lib/meta/credentials.ts` | domain (reader) | `igAccountId` → creds | `resolveByIgAccountId` (lines 111-126) | **REUSE — ALREADY EXISTS** (verify only) |
| `src/lib/messenger/window-gate.ts` | utility (pure policy) | hours+flag → decision | `resolveMessengerWindowSend` | **REUSE VERBATIM** |
| `src/lib/domain/contacts.ts` | domain (writer) | contactId+name → guarded UPDATE | `healPlaceholderContactName` (lines 782-803) | **REUSE** (call with `placeholderPrefix:'IG-'`) |

---

## Pattern Assignments

### 1. `supabase/migrations/2026060xxxxxxx_add_instagram_provider.sql` — CLONE (migration, DDL)

**Analog:** `supabase/migrations/20260604120000_add_messenger_provider.sql` (full file — the template).

**Excerpt (the entire FB analog):**
```sql
-- Migration: Add messenger_provider routing flag to workspaces
-- ... (Regla 6 default-manychat rationale) ...
ALTER TABLE workspaces
  ADD COLUMN messenger_provider TEXT NOT NULL DEFAULT 'manychat'
  CHECK (messenger_provider IN ('manychat', 'meta_direct'));
```

**Swaps:** `messenger_provider → instagram_provider`. SEPARATE column (D-IG-02 — IG and FB migrate independently). Default `'manychat'`.

**Optional (Claude's Discretion D-IG-04):** `ALTER TABLE workspace_meta_accounts ADD COLUMN ig_username TEXT;` (nullable, display-only). **DO NOT re-add `ig_account_id`** — it already exists from Phase 37 (`workspace_meta_accounts` migration) along with `uq_meta_ig` + `idx_meta_accounts_ig`.

**Regla 5 (HARD GATE):** This is the FIRST plan. Author → PAUSE → user applies in prod → WAIT for confirmation → only then push any code reading `workspaces.instagram_provider`. (Pitfall 5 in RESEARCH — the 20h-lost-messages failure mode.)

---

### 2. `src/lib/instagram/webhook-handler.ts` — CLONE (service, webhook event → domain store)

**Analog:** `src/lib/messenger/webhook-handler.ts` `processMessengerWebhook` (lines 68-202).

**Signature to clone:**
```typescript
export async function processMessengerWebhook(
  ev: MessengerMessagingEvent,
  workspaceId: string,
  pageId: string,
  accessToken?: string
): Promise<{ stored: boolean }>
```
→ becomes `processInstagramWebhook(ev: InstagramMessagingEvent, workspaceId: string, igAccountId: string, accessToken?: string)`. (Note: 3rd param is now the **IGID** = the account, not a pageId; the Page token is still passed as `accessToken`.)

**IGSID-as-string + identifier (lines 76-84):**
```typescript
const psid = String(ev.sender?.id ?? '')          // → igsid; STRING verbatim (Pitfall 3 — never Number())
if (!psid) { ... return { stored: false } }
const phoneIdentifier = `fb-${psid}`              // → `ig-${igsid}` (D-IG-05 identity)
```

**Name resolution + `nameResolved` guard (lines 90-102) — THE KEY IG DIVERGENCE:**
```typescript
let profileName = `FB-${psid}`                    // → `IG-${igsid}` placeholder
let nameResolved = false
try {
  const name = await getMessengerUserName(accessToken ?? '', pageId, psid)  // conversations-edge (FB workaround)
  if (name) { profileName = name.trim(); nameResolved = true }
} catch { /* keep FB-${psid} fallback */ }
```
→ Swap to the **simpler direct edge**: `getInstagramUserName(accessToken ?? '', igsid)` = `GET /{IGSID}?fields=name,username` (no pageId arg — RESEARCH Pattern 3; works with the approved `instagram_basic`+`instagram_manage_messages`). FB needed the conversations-edge because the direct `GET /{psid}` failed 100/33; IG does not.

**Attachment-type map (lines 107-124) — clone verbatim** (`image|audio|video|file → image|audio|video|document`; content `{ link, caption }` for media, `{ body }` for text — the nested-`image.url` bug is already fixed here).

**Domain calls (lines 131-183) — clone verbatim, swapping `channel:'facebook' → 'instagram'`:**
```typescript
const convResult = await domainFindOrCreateConversation(ctx, {
  phone: phoneIdentifier, channel: 'facebook',          // → 'instagram'
  profileName: nameResolved ? profileName : undefined,  // first-message-race guard — DO NOT drop
  externalSubscriberId: psid,                            // → igsid
})
// ... resolveOrCreateContact by phoneIdentifier (NO fuzzy match — D-IG-05) ...
if (nameResolved) {
  await domainHealPlaceholderContactName(ctx, { contactId, realName: profileName })  // add placeholderPrefix:'IG-'
}
// ... receiveMessage (idempotent on mid — `fb-${psid}-...` → `ig-${igsid}-...` fallback mid) ...
```

**D-IG-01 (human-only):** Clone the comment block lines 195-197 — **NO Inngest agent dispatch, NO v4 lock**.

**Regla 3:** import EXCLUSIVELY from `@/lib/domain/conversations`, `@/lib/domain/contacts`, `@/lib/domain/messages`, and `@/lib/meta/instagram-api`. Zero `createAdminClient`.

---

### 3. `src/lib/meta/instagram-api.ts` — CLONE (service, args → Graph → response)

**Analog:** `src/lib/meta/messenger-api.ts` (full file, lines 52-219).

**`sendMessengerText` (lines 52-76) — clone verbatim, swap `psid → igsid`:**
```typescript
export async function sendMessengerText(accessToken, pageId, psid, text, tag?: MessengerTag) {
  const body = tag
    ? { messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT', recipient: { id: psid }, message: { text } }
    : { messaging_type: 'RESPONSE',                          recipient: { id: psid }, message: { text } }
  return metaRequest<MessengerSendResponse>(accessToken, `/${pageId}/messages`, {
    method: 'POST', body: JSON.stringify(body),
  })
}
```
→ `sendInstagramText(accessToken, pageId, igsid, text, tag?)`. **SAME endpoint `POST /{pageId}/messages`, SAME Page token, SAME envelope** (RESEARCH: IG-via-Page rides the Messenger Platform). **NO `messaging_product` field** (that's WhatsApp-only). Response shape `{ message_id, recipient_id }`.

**`sendMessengerImage` (lines 90-113) + `sendMessengerAttachment` (lines 129-153) — clone verbatim** (image payload `{ type:'image', payload:{ url, is_reusable:true } }`, no caption field → caption is a follow-up text). For V1, IG send scope is **text + image** (D-IG-08); keep `sendInstagramAttachment` for audio/video/file parity but it's not wired into the compose UI.

**Name edge — REPLACE the conversations-edge `getMessengerUserName` (lines 199-219) with the simpler direct edge:**
```typescript
// IG direct edge — works with the Page token + instagram_basic + instagram_manage_messages (APPROVED).
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
// FALLBACK (documented, only if the direct edge ever 100/33s like FB):
//   GET /{ig_account_id}/conversations?platform=instagram&user_id={igsid}&fields=participants
```

**Type alias:** reuse `MessengerTag = 'HUMAN_AGENT'` (rename to `InstagramTag` or import — IG also only supports `HUMAN_AGENT`).

**Pitfall 3 grep gate:** `grep -n "Number(" src/lib/meta/instagram-api.ts` → 0 matches against the IGSID.

---

### 4. `src/lib/channels/meta-instagram-sender.ts` — CLONE (channel-sender adapter)

**Analog:** `src/lib/channels/meta-facebook-sender.ts` `metaFacebookSender` (lines 31-112).

**Creds shape + unwrap (lines 32-43) — clone verbatim:**
```typescript
export interface MetaPageCreds { accessToken: string; pageId: string }   // reuse — IG uses the Page token + Page id
interface SendResponse { message_id?: string }
function unwrap(response: SendResponse): ChannelSendResult {
  return { success: true, externalMessageId: response.message_id }
}
```

**The object (lines 45-112) — clone verbatim, swap imports `messenger-api → instagram-api`, `psid → igsid`:**
```typescript
export const metaFacebookSender = {                       // → metaInstagramSender
  async sendText(creds: MetaPageCreds, psid, text, tag?): Promise<ChannelSendResult> {
    const response = await sendMessengerText(creds.accessToken, creds.pageId, psid, text, tag)  // → sendInstagramText
    return unwrap(response)
  },
  async sendImage(creds, psid, imageUrl, caption?, tag?) {
    const response = await sendMessengerImage(...)         // image, then caption as FOLLOW-UP text
    if (caption) { await sendMessengerText(..., caption, tag) }
    return unwrap(response)
  },
  async sendMedia(creds, psid, mediaType, mediaUrl, caption?, tag?) {
    if (mediaType === 'image') return this.sendImage(...)
    const attachmentType = mediaType === 'document' ? 'file' : mediaType   // V1: not in compose UI
    const response = await sendMessengerAttachment(...)
    if (caption) { await sendMessengerText(..., caption, tag) }
    return unwrap(response)
  },
}
```

**Regla 6 (CRITICAL — Pitfall 4):** Clone the header comment block (lines 16-20) verbatim. This module is **NOT registered in `senders` in `registry.ts`**. The domain branch imports it directly (like `metaFacebookSender`). Grep gate: `grep -n "metaInstagramSender" src/lib/channels/registry.ts` → **0 matches**.

---

### 5. `src/lib/meta/instagram-connect.ts` — CLONE (small new helper)

**Analog:** the connect chain in `messenger-connect.ts` (`getPageToken` line 173, `subscribeMessengerPage` line 243) + the RESEARCH §Code-Examples resolve snippet. Only the IG-account resolve is genuinely new; the rest of the chain is REUSED.

**New helper (RESEARCH §Code Examples — resolve `instagram_business_account` off the Page):**
```typescript
// Reuses the existing Page token. GET /{pageId}?fields=instagram_business_account{id,username}
export async function resolveInstagramAccount(
  pageToken: string, pageId: string
): Promise<{ id: string; username?: string }> {
  const res = await metaRequest<{ instagram_business_account?: { id: string; username?: string } }>(
    pageToken, `/${pageId}?fields=instagram_business_account{id,username}`
  )
  const ig = res.instagram_business_account
  if (!ig?.id) {
    throw new Error('vincula una cuenta de Instagram Profesional a tu página de Facebook')  // D-IG-04 clear error
  }
  return ig
}
```

**REUSE verbatim from `messenger-connect.ts`:** `getPageToken` (already returns `{ pageId, pageName, accessToken }`) + `subscribeMessengerPage` (already subscribes `messages,messaging_postbacks` — RESEARCH A2: IG events deliver through the SAME Page subscription; verify in smoke whether a separate IG subscribe is needed).

**Smoke linchpin (A1 / Open Q1):** assert the resolved `ig.id` === the webhook `entry.id` (= `recipient.id`). This is the single MEDIUM-confidence linkage — build it as an early Wave-0 check.

---

### 6. `src/components/settings/connect-instagram.tsx` — CLONE (client component)

**Analog:** `src/components/settings/connect-facebook.tsx` `ConnectFacebook` (full file).

**Token-flow pattern (lines 78-87, 129-161) — clone verbatim:** FB.login (token-flow, `auth_type:'reauthorize'`) → capture `authResponse.accessToken` → call the server action. Reuses the SAME FB JS SDK (`META_APP_ID='1457229738955828'`, `META_SDK_VERSION='v22.0'`, `FB_SDK_ID='facebook-jssdk'`).

**Swaps:**
- `connectFacebookPage → connectInstagramAccount` (import + the `startTransition` call, lines 36, 80).
- Scope: the existing FB scope already grants `instagram_*` once the app has them approved. Either reuse the SAME `FB_LOGIN_SCOPE` (line 65-66) and ADD `instagram_basic,instagram_manage_messages`, OR — since IG rides on the already-connected Page — present a simpler "Conectar Instagram" button that just triggers the server action (which resolves IG off the stored Page token, no fresh FB.login needed). **Discretion D-IG-04** — the server action can resolve IG from the existing connected-Page row without a new popup. Prefer the no-popup path if a connected Page row already exists.
- Copy/labels → Spanish IG wording; icon `Facebook → Instagram` (lucide).

**Security (lines 24-30) — preserve:** browser never sees a token beyond the short-lived FB.login token; owner gate is enforced server-side.

---

### 7. `src/lib/domain/messages.ts` — EXTEND (domain chokepoint)

**Analog (chokepoint helper, lines 70-80):**
```typescript
async function readMessengerProvider(supabase, workspaceId): Promise<'manychat' | 'meta_direct'> {
  const { data: ws } = await supabase
    .from('workspaces').select('messenger_provider').eq('id', workspaceId).single()
  return ws?.messenger_provider === 'meta_direct' ? 'meta_direct' : 'manychat'
}
```
→ ADD a sibling `readInstagramProvider` reading `instagram_provider` (default `'manychat'`).

**`sendTextMessage` — the `facebook` arm (lines 230-256) is the template:**
```typescript
} else if (channel === 'facebook') {
  const mp = await readMessengerProvider(supabase, ctx.workspaceId)   // single read (Regla 3 chokepoint)
  if (mp === 'meta_direct') {
    const creds = await resolveByWorkspace(ctx.workspaceId, 'facebook')   // creds from ctx, NEVER input (T-40-02)
    if (!creds?.accessToken || !creds.pageId) return { success: false, error: 'Credenciales Meta no configuradas' }
    const resp = await metaFacebookSender.sendText({ accessToken: creds.accessToken, pageId: creds.pageId },
      params.contactPhone /* PSID string */, params.messageBody, params.tag)
    wamid = resp.externalMessageId
  } else {
    // manychat — BYTE-IDENTICAL to getChannelSender('facebook') (Regla 6)
    const sender = getChannelSender(channel); ...
  }
}
```

**EXTEND plan:** insert a NEW `else if (channel === 'instagram')` block BEFORE the final `else` (lines 257-265), mirroring the facebook arm:
- `readInstagramProvider(...)` → `meta_direct` arm: `resolveByWorkspace(ctx.workspaceId, 'instagram')` + `metaInstagramSender.sendText(...)`.
- `manychat` sub-arm: **byte-identical to the current final `else` body (lines 258-264)** — that current Instagram-via-ManyChat behavior is what must be preserved (Regla 6). The final `else` stays for "future channels".

**`sendMediaMessage` — same shape:** the `facebook` arm (lines 368-399) is the template; the current final `else` (lines 400-413, "Instagram via ManyChat — only images") becomes the `manychat` sub-arm of the new `instagram` block, byte-identical. Add `metaInstagramSender.sendMedia(...)` for the `meta_direct` arm (V1 = image; audio/video/document return the existing graceful `Tipo de media no soportado` error).

**Regla 5:** `readInstagramProvider` reads `instagram_provider` → this file's push is GATED behind the migration applying to prod.

**Regla 6 grep gate (Pitfall 4):** the `manychat` sub-arm body must be a byte-for-byte copy of the current final `else` body.

---

### 8. `src/app/api/webhooks/meta/route.ts` — EXTEND (webhook route)

**Analog:** the `object==='page'` branch (lines 124-163).

**Branch template (lines 124-162):**
```typescript
if ((payload.object as string) === 'page') {
  const pageEntries = (payload as ...).entry ?? []
  for (const entry of pageEntries) {
    const pageId = entry.id; if (!pageId) continue
    const creds = await resolveByPageId(pageId)            // → resolveByIgAccountId(entry.id)
    if (!creds) { console.warn('unknown page_id, ack & drop'); continue }
    for (const ev of entry.messaging ?? []) {
      if (ev.message && !ev.message.is_echo) {              // Pitfall 7 — IG ALSO emits echoes, skip them
        await processMessengerWebhook(ev, creds.workspaceId, pageId, creds.accessToken)
      }
    }
  }
  return NextResponse.json({ received: true }, { status: 200 })
}
```

**EXTEND plan:** add a NEW `if ((payload.object as string) === 'instagram')` branch, structurally identical. Critical divergences (Pitfall 1 + Pitfall 2):
- Parse `entry[].messaging[]` (Messenger-style — **NOT `changes[]`**; that's the comments/mentions shape).
- Routing key is `entry.id` = the **IGID** (`recipient.id`), NOT a pageId → `resolveByIgAccountId(entry.id)`.
- Pass `creds.workspaceId`, `entry.id` (igAccountId), `creds.accessToken` to `processInstagramWebhook`.
- Skip `ev.message.is_echo` exactly like line 155.

**Placement:** ADDITIVE — after the shared `verifyMetaHmac` (lines 102-105, REUSE verbatim, IG events are signed too) and before the `whatsapp_business_account` reject (line 166), exactly like the `page` branch. Import `resolveByIgAccountId` (line 15) + `processInstagramWebhook` (sibling of line 17). WhatsApp + template-status paths stay byte-identical (Regla 6 / D-06).

---

### 9. `src/app/actions/meta-onboarding.ts` — EXTEND (server action, add `connectInstagramAccount`)

**Analog:** `connectFacebookPage` (lines 166-236).

**Auth gate + owner check (lines 169-187) — clone verbatim:**
```typescript
const auth = await getRequestAuth(); if (!auth) return { success: false, error: 'No autenticado' }
const workspaceId = auth.workspaceId           // session-derived, NEVER input (Regla 3 / V4)
const { data: member } = await supabase.from('workspace_members')
  .select('role').eq('workspace_id', workspaceId).eq('user_id', auth.userId).single()
if (!member || member.role !== 'owner') return { success: false, error: 'Solo el Owner puede conectar ...' }
```

**Persist pattern (lines 209-223) — adapt:**
```typescript
const result = await upsertMetaAccount({
  workspaceId, channel: 'facebook',            // → 'instagram'
  wabaId: null, phoneNumberId: null,
  pageId,                                       // keep the Page id; ADD igAccountId + igUsername
  accessTokenEncrypted, isActive: true,         // NO provider flip (Regla 6 — stays manychat)
})
await subscribeMessengerPage(pageToken, pageId)   // REUSE — IG events ride the same Page subscription
```

**`connectInstagramAccount` flow (D-IG-04):** read the workspace's connected Facebook Page row → decrypt its Page token → `resolveInstagramAccount(pageToken, pageId)` (new helper §5) → `upsertMetaAccount({ channel:'instagram', pageId, igAccountId: ig.id, igUsername: ig.username, accessTokenEncrypted: <reuse the SAME encrypted Page token>, isActive:true })`. **MUST NOT flip `instagram_provider`** (Anti-Pattern in RESEARCH — stays `manychat` until manual SQL cutover, Regla 6). Clear Spanish error if no IG linked (thrown by `resolveInstagramAccount`).

**Reuse:** `encryptToken` (token.ts), `getRequestAuth`, `upsertMetaAccount`, `subscribeMessengerPage`.

---

### 10. `src/lib/domain/meta-accounts.ts` — EXTEND (`upsertMetaAccount`)

**Analog params type (lines 30-39):**
```typescript
export interface UpsertMetaAccountParams {
  workspaceId: string
  channel: MetaChannel              // 'whatsapp' | 'facebook' | 'instagram' (already includes instagram)
  wabaId: string | null
  phoneNumberId: string | null
  accessTokenEncrypted: string
  phoneNumber?: string | null
  businessId?: string | null
  pageId?: string | null            // ← ADD igAccountId?: string | null; igUsername?: string | null
  isActive?: boolean
}
```

**UPDATE column set (lines 93-102) + INSERT column set (lines 114-124) — EXTEND both:**
```typescript
// UPDATE (existing row):
.update({ waba_id, phone_number_id, access_token_encrypted, phone_number, business_id,
  page_id: params.pageId ?? null,            // ← ADD ig_account_id: params.igAccountId ?? null,
  is_active: isActive,                       //        ig_username: params.igUsername ?? null,
})
// INSERT (new row): same additions to the .insert({...}) object set.
```

**Regla 3:** this remains the SOLE write path into `workspace_meta_accounts`. The `(workspace_id, channel)` upsert key already isolates the IG row from the FB row (channel='instagram'). `ig_account_id` column + `uq_meta_ig` UNIQUE constraint ALREADY EXIST (Phase 37) — the optional `ig_username` is the only new column (migration §1).

---

### 11. `src/lib/meta/credentials.ts` — **REUSE — ALREADY EXISTS** (verify only)

**The IG resolver is already shipped (lines 111-126):**
```typescript
export async function resolveByIgAccountId(igAccountId: string): Promise<MetaCredentials | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('workspace_meta_accounts')
    .select('workspace_id, waba_id, phone_number_id, phone_number, page_id, ig_account_id, business_id, access_token_encrypted')
    .eq('ig_account_id', igAccountId)
    .eq('is_active', true)
    .single()
  if (!data) return null
  return rowToCredentials(data)
}
```
**Verdict:** NO CHANGE. `rowToCredentials` already maps `ig_account_id → igAccountId` (lines 26-37). `resolveByWorkspace(workspaceId, 'instagram')` (lines 136-153) already works for the outbound send (channel param). The webhook route just imports `resolveByIgAccountId`.

---

### 12. `src/lib/messenger/window-gate.ts` — **REUSE VERBATIM** (pure policy)

**Analog = the file itself, `resolveMessengerWindowSend` (lines 50-67):**
```typescript
export function resolveMessengerWindowSend(input: MessengerWindowInput): MessengerWindowDecision {
  const { hoursSinceCustomerMessage, featureGranted } = input
  if (hoursSinceCustomerMessage < SESSION_WINDOW_HOURS) return { messaging_type: 'RESPONSE' }
  if (hoursSinceCustomerMessage < HUMAN_AGENT_WINDOW_HOURS && featureGranted)
    return { messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' }
  return { blocked: true, error: BLOCK_MESSAGE }   // BLOCK_MESSAGE = 'Ventana de 24h cerrada...'
}
```
**Verdict (D-IG-09 / Discretion):** REUSE the SAME helper — IG window policy is identical to FB (24h session, HUMAN_AGENT-only tag, 7-day cap; `META_HUMAN_AGENT_ENABLED` OFF → block-only; no HSM templates on IG — Pitfall 6). DO NOT create an IG sibling. The IG `meta_direct` send path consults this exact function and surfaces `BLOCK_MESSAGE` in the inbox compose (IG-05). Existing FB window-gate tests cover it — no new test file.

---

### 13. `src/lib/domain/contacts.ts` `healPlaceholderContactName` — **REUSE** (call with `'IG-'`)

**Analog = the function itself (lines 782-803):**
```typescript
export async function healPlaceholderContactName(
  ctx: DomainContext,
  params: { contactId: string; realName: string; placeholderPrefix?: string }
): Promise<DomainResult<{ healed: boolean }>> {
  const supabase = createAdminClient()
  const prefix = params.placeholderPrefix ?? 'FB-'
  const { data, error } = await supabase.from('contacts')
    .update({ name: params.realName })
    .eq('id', params.contactId).eq('workspace_id', ctx.workspaceId)
    .like('name', `${prefix}%`)            // guard: only overwrites the placeholder, never a real name
    .select('id')
  ...
  return { success: true, data: { healed: (data?.length ?? 0) > 0 } }
}
```
**Verdict:** NO CHANGE. The IG handler (§2) calls it with `placeholderPrefix: 'IG-'`. Channel-agnostic, atomic (WHERE-clause guard = no read-then-write race), idempotent.

---

## Shared Patterns

### Provider-flag chokepoint (Regla 3 + Regla 6)
**Source:** `src/lib/domain/messages.ts` `readMessengerProvider` (lines 70-80) + the `facebook` arms (text 230-256 / media 368-399).
**Apply to:** the new `instagram` arm in BOTH `sendTextMessage` and `sendMediaMessage`.
**Rule:** read `instagram_provider` ONCE per send; `meta_direct` → `metaInstagramSender` (creds from `resolveByWorkspace(ws,'instagram')`); else → `manychat` sub-arm **byte-identical** to today's final `else`.

### Tenant routing by Meta-supplied identity only (V4 Access Control)
**Source:** `route.ts` `object==='page'` branch (lines 142-156) — `resolveByPageId(entry.id)`, unknown → ack-and-drop 200.
**Apply to:** the `object==='instagram'` branch — `resolveByIgAccountId(entry.id)` (= IGID = `recipient.id`). NEVER route by `sender.id` (the customer) or any payload-supplied tenant field (Pitfall 2).

### HMAC verify before parse (V5 / Spoofing)
**Source:** `route.ts` `verifyMetaHmac` (lines 37-51) + the raw-body-first POST flow (lines 92-105). REUSE verbatim — IG events are signed with the SAME App Secret.

### Creds-from-context, never input (Regla 3 / V4)
**Source:** `connectFacebookPage` (line 174 `workspaceId = auth.workspaceId`) + the send arms (`resolveByWorkspace(ctx.workspaceId, ...)`, messages.ts:237/374).
**Apply to:** `connectInstagramAccount` + the `instagram` send arm. `workspaceId` session-derived; Page token from the stored encrypted row, never from input.

### Token at rest (V6)
**Source:** `encryptToken`/`decryptToken` (`src/lib/meta/token.ts`), AES-256-GCM. REUSE — IG reuses the SAME encrypted Page token (no new token store).

### First-message-race self-heal
**Source:** `processMessengerWebhook` lines 90-102 (`nameResolved` guard) + 162-164 (`healPlaceholderContactName`).
**Apply to:** the IG handler — `IG-${igsid}` placeholder + `nameResolved` guard + heal with `placeholderPrefix:'IG-'`. Only pass `profileName` to `findOrCreateConversation` when `nameResolved` (never overwrite a healed name back to the placeholder).

---

## Regla 6 Anchors — EXISTING IG paths that MUST stay byte-identical

### `manychatInstagramSender` (the legacy IG path)
**Source:** `src/lib/channels/manychat-sender.ts:59` (`export const manychatInstagramSender: ChannelSender`), registered in `src/lib/channels/registry.ts:14` (`instagram: manychatInstagramSender`).
**Constraint:** NEVER touch. `metaInstagramSender` is imported DIRECTLY by the domain branch and is NEVER added to the `senders` map. Grep gate (Pitfall 4):
```bash
grep -n "metaInstagramSender" src/lib/channels/registry.ts          # → 0 matches
git diff --stat src/lib/channels/registry.ts src/lib/channels/manychat-sender.ts   # → no changes
```

### `godentist-fb-ig` production agent (serves IG via ManyChat)
**Source:** `src/lib/agents/godentist-fb-ig/` — activated via routing fact `channel in ['facebook','instagram']` (config.ts:12). It does NOT reference any Meta sender; it sends through the channel-keyed map (`manychatInstagramSender`).
**Constraint (D-IG-03):** NOT migrated to meta_direct. Grep gate:
```bash
git diff --stat src/lib/agents/godentist-fb-ig/    # → no changes (expected)
```

### Default-manychat preservation
Every existing workspace stays legacy because `instagram_provider DEFAULT 'manychat'` (migration §1). Only an explicit manual SQL cutover (`UPDATE workspaces SET instagram_provider='meta_direct' WHERE id='<uuid>'`) flips a workspace — NEVER on connect (Anti-Pattern, RESEARCH).

---

## No Analog Found

None. Every IG file maps to a shipped, live-verified Phase 40 (or Phase 37) analog. The only genuinely-new code is the single Graph call `resolveInstagramAccount` (`GET /{pageId}?fields=instagram_business_account{id,username}`, §5) and the IG name edge `getInstagramUserName` (`GET /{IGSID}?fields=name,username`, §3) — both small, both with cited Graph-API docs, both simpler than their FB equivalents.

---

## Metadata

**Analog search scope:** `src/lib/messenger/`, `src/lib/meta/`, `src/lib/channels/`, `src/lib/domain/` (messages, contacts, meta-accounts), `src/app/api/webhooks/meta/`, `src/app/actions/`, `src/components/settings/`, `supabase/migrations/`, `src/lib/agents/godentist-fb-ig/`.
**Files scanned:** 14 source files + 1 migration (all real excerpts above, line numbers verified).
**Pattern extraction date:** 2026-06-05

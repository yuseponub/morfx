# Phase 39: WhatsApp Outbound + Templates - Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 11 (5 NEW, 6 MODIFY)
**Analogs found:** 11 / 11 (every NEW file has a strong existing analog — this phase is wiring, not greenfield)

> **Two hard constraints govern every assignment below:**
> - **Regla 3** — all sends/mutations go through the domain layer (`src/lib/domain/messages.ts`, `src/lib/domain/whatsapp-templates.ts`). The senders are the API edge only.
> - **Regla 6** — the 360dialog `send(apiKey, to, ...)` path must stay **byte-identical**. Default provider is `360dialog`; `meta_direct` is opt-in per workspace. Files flagged 🔒 below MUST NOT have their existing behavior changed — Meta is an additive branch.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| **NEW** `src/lib/channels/meta-whatsapp-sender.ts` | service (channel sender) | request-response | `src/lib/channels/whatsapp-sender.ts` + `src/lib/meta/api.ts` | exact |
| **NEW** `src/lib/meta/media.ts` | service (media I/O) | file-I/O / transform | `src/lib/whatsapp/api.ts` (`downloadMedia`) + `webhook-handler.ts` (`downloadAndUploadMedia`) | role+flow match |
| **NEW** `src/lib/meta/templates.ts` | service (management API) | CRUD | `src/lib/whatsapp/templates-api.ts` | exact |
| **MODIFY** `src/lib/meta/api.ts` 🔶 | service (API client) | request-response | self (extend `sendWhatsAppText`/`Template` w/ media+interactive+markRead) | self-extension |
| **MODIFY** `src/lib/domain/messages.ts` 🔑 | domain (chokepoint) | request-response | self (add `meta_direct` branch — Pattern 1) | self-extension |
| **MODIFY** `src/lib/domain/whatsapp-templates.ts` | domain (chokepoint) | CRUD | self (add provider branch for CRUD) | self-extension |
| **MODIFY** `src/app/actions/messages.ts` 🔶 | action (adapter) | request-response | self (`markMessageAsRead` Meta arm — D-07) | self-extension |
| **MODIFY** `src/lib/automations/action-executor.ts:1279` 🔴 | service (automation) | event-driven | direct `send360Template` bypass → rewire to domain | rewire site |
| **MODIFY** `src/lib/domain/contact-reviews.ts:437` 🔴 | domain | event-driven | direct `send360Template` bypass → rewire to domain | rewire site |
| **MODIFY** `src/app/api/webhooks/meta/route.ts` | route (webhook) | event-driven | self + `resolveByPhoneNumberId` (add `message_template_status_update` field) | self-extension |
| **NEW** template-status webhook handler (in or beside `meta/route.ts`) | service (webhook handler) | event-driven | `src/lib/whatsapp/templates-api.ts` (`syncTemplateStatus360`) + `domain/whatsapp-templates.ts` | role match |

**Legend:** 🔑 = the single provider-decision chokepoint (MIG-03). 🔶 = additive Meta branch, 360dialog arm untouched. 🔴 = 131047 blast-radius bypass site (rewire to domain). 🔒 = do-not-modify behavior (see whatsapp-sender.ts / whatsapp/api.ts below).

---

## Pattern Assignments

### NEW `src/lib/channels/meta-whatsapp-sender.ts` (service, request-response)

**Analog A (shape/file structure):** `src/lib/channels/whatsapp-sender.ts` — the 360dialog `ChannelSender` wrapper. **Analog B (payloads):** `src/lib/meta/api.ts`.

**KEY DESIGN NOTE (RESEARCH Pattern 1 + D-02b):** Do NOT register this in the `senders: Record<ChannelType, ChannelSender>` map (that map is *channel*-keyed, not *provider*-keyed). Build it as a thin module the **domain branch** calls. It takes `{ accessToken, phoneNumberId }` — NOT `apiKey`. This keeps the 360dialog `send(apiKey, ...)` signature byte-identical (Regla 6).

**Imports pattern** (mirror whatsapp-sender.ts:1-11, swap to meta/api.ts):
```typescript
import type { ChannelSendResult } from './types'
import {
  sendWhatsAppText,
  sendWhatsAppTemplate,
  // + new helpers added to meta/api.ts: sendWhatsAppMedia, sendWhatsAppInteractive, markWhatsAppRead
} from '@/lib/meta/api'
```

**Core wrapper pattern** (analog `whatsapp-sender.ts:13-25` — same `.messages?.[0]?.id` unwrap, but creds object instead of apiKey string):
```typescript
// existing 360dialog wrapper to mirror (whatsapp-sender.ts):
export const whatsappSender: ChannelSender = {
  async sendText(apiKey: string, to: string, text: string): Promise<ChannelSendResult> {
    const response = await send360Text(apiKey, to, text)
    const externalMessageId = response.messages?.[0]?.id
    return { success: true, externalMessageId }
  },
  // ...
}
// metaWhatsappSender mirrors this but: (creds: {accessToken, phoneNumberId}, ...) and calls meta/api.ts helpers.
```

**Interactive limits** (WA-04 — mirror the gating in 360dialog `sendButtonMessage`, `whatsapp/api.ts:192-232`): max 3 buttons (`buttons.slice(0, 3)`), title ≤20 chars (`btn.title.slice(0, 20)`). List: ≤10 sections, row title ≤24. These are the proven 360dialog guards — copy the `.slice()` clamps.

---

### NEW `src/lib/meta/media.ts` (service, file-I/O / transform)

**Analog A (download two-step):** `src/lib/whatsapp/api.ts` `downloadMedia` (lines 263-296). **Analog B (rehost to Storage):** `webhook-handler.ts` `downloadAndUploadMedia` (lines 632-679).

**Outbound upload** (WA-06, for template header media / large files — NOT chat media; chat media sends by `link` per Pattern 2). RESEARCH §6 warns: `metaRequest` forces `Content-Type: application/json`, so write a **dedicated multipart `fetch`** here, NOT via `metaRequest`:
```
POST https://graph.facebook.com/v22.0/{phone_number_id}/media
Authorization: Bearer <BISUAT>   (multipart/form-data)
fields: messaging_product=whatsapp, type=<mime>, file=<binary>  →  { id: "<media_id>" }
```

**Inbound download two-step** (mirror `whatsapp/api.ts:263-296` — but swap auth header + skip the hostname rewrite, Meta returns the real CDN url):
```typescript
// 360dialog analog (downloadMedia) — the proven 2-step pattern to mirror:
const mediaInfo = await getMediaUrl(apiKey, mediaId)             // GET /{media_id} → { url, mime_type }
const downloadUrl = mediaInfo.url.replace(                       // 360dialog rewrites host…
  'https://lookaside.fbsbx.com', BASE_URL)                       // …Meta does NOT — use url as-is
const response = await fetch(downloadUrl, { headers: { 'D360-API-KEY': apiKey } })  // Meta: Authorization: Bearer
const buffer = await response.arrayBuffer()
```

**Rehost to Supabase Storage** (copy verbatim from `webhook-handler.ts:644-674` — `inbound/{ws}/{conv}/{ts}_{safeName}` path, `getExtensionFromMime` map at :684, `upsert:false`, `getPublicUrl`). RESEARCH Pitfall 3: download IMMEDIATELY on receipt — Meta CDN urls expire ~5 min + need Bearer.

---

### NEW `src/lib/meta/templates.ts` (service, CRUD)

**Analog:** `src/lib/whatsapp/templates-api.ts` — mirror function-for-function, swap base URL + auth.

| 360dialog fn (templates-api.ts) | Meta equivalent (this file) | Endpoint |
|---------------------------------|------------------------------|----------|
| `createTemplate360` (:47) | `createTemplateMeta` | `POST /v22.0/{waba_id}/message_templates` |
| `listTemplates360` (:84) | `listTemplatesMeta` | `GET /v22.0/{waba_id}/message_templates?limit=250&fields=name,status,category,language,components,quality_score,rejected_reason` |
| `deleteTemplate360` (:151) | `deleteTemplateMeta` | `DELETE /v22.0/{waba_id}/message_templates?name=<name>` |
| `syncTemplateStatus360` (:189) | `syncTemplateStatusMeta` (poll fallback) | `GET …message_templates` |
| **(no 360dialog edit fn exists)** | `editTemplateMeta` **(NEW capability)** | `POST /v22.0/{message_template_id}` body `{category?, components?}` |
| `uploadHeaderImage360` (:235) resumable 2-step | `uploadHeaderHandleMeta` | `POST /{app_id}/uploads?file_length&file_type` → session → `POST /{session_id}` file_offset:0 → `{h}` |

Use `metaRequest<T>` from `meta/api.ts` for the JSON Graph calls (parses `MetaGraphApiError` w/ code/subcode). The resumable upload is the **same two-step** 360dialog proxies — copy `uploadHeaderImage360`'s session→bytes structure (templates-api.ts:235-291), pointing at Graph directly.

**D-05 EDIT GATING (mandatory):** `editTemplateMeta` must enforce — `name`/`language` NEVER editable; edit allowed only when status ∈ {APPROVED, REJECTED, PAUSED}; APPROVED = 1/24h, 10/30d; after edit status flips to PENDING. See RESEARCH "D-05 MANDATORY DELIVERABLE" table — reflect in UI, do not promise unconstrained edit.

---

### MODIFY 🔑 `src/lib/domain/messages.ts` (domain, request-response) — THE CHOKEPOINT

**This is the single provider-decision site (MIG-03 / D-02).** Every send surface already funnels here (Regla 3). Add a branch on `workspace.whatsapp_provider` inside each of `sendTextMessage` / `sendMediaMessage` / `sendTemplateMessage`. **Keep the existing `else` (360dialog) arm byte-identical (Regla 6).**

**Current 360dialog arm to PRESERVE verbatim** (`messages.ts:130-133`):
```typescript
if (channel === 'whatsapp') {
  // Direct 360dialog call (existing path, zero change)
  const response = await send360Text(params.apiKey, params.contactPhone, params.messageBody)
  wamid = response.messages?.[0]?.id
} else { /* FB/IG via getChannelSender — UNCHANGED */ }
```

**New meta_direct branch to insert above the 360dialog arm** (RESEARCH Pattern 1 — resolve creds INSIDE the branch; callers keep passing `apiKey`):
```typescript
const { data: ws } = await supabase
  .from('workspaces').select('whatsapp_provider').eq('id', ctx.workspaceId).single()

if (channel === 'whatsapp' && ws?.whatsapp_provider === 'meta_direct') {
  const creds = await resolveByWorkspace(ctx.workspaceId, 'whatsapp')   // meta/credentials.ts
  if (!creds?.accessToken || !creds.phoneNumberId) {
    return { success: false, error: 'Credenciales Meta no configuradas' }
  }
  const resp = await metaWhatsappSender.sendText(creds, params.contactPhone, params.messageBody)
  wamid = resp.externalMessageId
} else if (channel === 'whatsapp') {
  /* existing send360Text — UNCHANGED */
}
```

**Imports to add** (currently `messages.ts:19-26` imports `send360Text/Media/Template` + `getChannelSender`):
```typescript
import { resolveByWorkspace } from '@/lib/meta/credentials'
import { metaWhatsappSender } from '@/lib/channels/meta-whatsapp-sender'
```

**DB insert / conversation-update tail is provider-agnostic — reuse verbatim** (messages.ts:145-186 text, :247-293 media, :331-371 template). Only the API-call section branches; persistence does not.

---

### MODIFY `src/lib/domain/whatsapp-templates.ts` (domain, CRUD)

**Analog:** self — mirror the `createTemplate` orchestration (lines 71-198) and add a provider branch at the 360 Dialog submit step (line 167-173). Same chokepoint pattern as messages.ts.

**Current 360dialog submit to wrap in a branch** (whatsapp-templates.ts:167-173):
```typescript
await createTemplate360(params.apiKey, {
  name: params.name, language: params.language,
  category: params.category, components,
})
```
→ branch on `whatsapp_provider`: `meta_direct` calls `createTemplateMeta(creds, …)` from the new `meta/templates.ts`; `360dialog` keeps `createTemplate360` (UNCHANGED). The uniqueness check (:78-90), local INSERT PENDING (:139-164), `submitted_at` update (:176-180), and REJECTED-on-error audit (:186-196) are provider-agnostic — reuse verbatim. Note the header-handle nuance (lines 92-136): 360dialog wants a **public Supabase URL** in `header_handle`, Meta wants the **resumable upload handle** — branch the header step accordingly.

---

### MODIFY 🔶 `src/lib/meta/api.ts` (service, request-response) — EXTEND

**Analog:** self. Already has `sendWhatsAppText` (:63), `sendWhatsAppTemplate` (:88), `metaRequest<T>` (:24). Add sibling helpers in the same style (Bearer via `metaRequest`, `/${phoneNumberId}/messages` endpoint, `messaging_product:'whatsapp'` envelope):
- `sendWhatsAppMedia(token, pnid, to, type, link, caption?, filename?)` — mirror 360dialog `sendMediaMessage` payload (`whatsapp/api.ts:95-127`) incl. caption∈{image,video,document}, filename∈{document} gating (RESEARCH Pitfall 4).
- `sendWhatsAppInteractive(token, pnid, to, interactive)` — buttons/lists (RESEARCH §4-5).
- `markWhatsAppRead(token, pnid, wamid)` — `{ messaging_product:'whatsapp', status:'read', message_id }` (RESEARCH §8; mirrors 360dialog `markMessageAsRead`, `whatsapp/api.ts:308-320`).

---

### MODIFY 🔶 `src/app/actions/messages.ts` (action, request-response) — D-07 read receipts

**Analog:** self — `markMessageAsRead` (lines 331-372). It already dynamically imports `markRead360`. Add a Meta arm (RESEARCH Open Question 2 recommends a small dedicated branch here):

**Current 360dialog read-receipt to PRESERVE** (messages.ts:358-365):
```typescript
const apiKey = workspaceSettings?.settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
// ...
const { markMessageAsRead: markRead360 } = await import('@/lib/whatsapp/api')
await markRead360(apiKey, message.wamid)
```
→ before resolving `apiKey`, read `whatsapp_provider`; if `meta_direct`: `resolveByWorkspace` → `markWhatsAppRead(creds.accessToken, creds.phoneNumberId, message.wamid)`. **NOTE:** the 24h-window check and recipient resolution in `sendMessage` (:114-127) and `sendMediaMessage` (:214-227) are provider-agnostic and inherited for free (D-04) — DO NOT touch them.

---

### MODIFY 🔴 `src/lib/automations/action-executor.ts` (~line 1279) — REWIRE bypass

**131047 blast-radius site #1.** Currently bypasses domain entirely with a direct `send360Template` import:
```typescript
// action-executor.ts:1278-1286 — the bypass to rewire:
if (workspace?.whatsapp_api_key) {
  const { sendTemplateMessage: send360Template } = await import('@/lib/whatsapp/api')
  await send360Template(workspace.whatsapp_api_key, hostPhone, 'informacion_general', 'es', [ /* body params */ ])
}
```
**Rewire to:** call `domain/messages.ts::sendTemplateMessage(ctx, {...})` so it inherits the provider branch. The component-building shape it already passes (`{type:'body', parameters:[{type:'text', text}]}`) matches the domain `SendTemplateMessageParams.components` type exactly. This is a host-notification to a fixed phone — needs a `conversationId` or a template-send path that tolerates none; planner decides (note: domain `sendTemplateMessage` requires `conversationId`).

---

### MODIFY 🔴 `src/lib/domain/contact-reviews.ts` (~line 437) — REWIRE bypass

**131047 blast-radius site #2.** Same direct-import bypass:
```typescript
// contact-reviews.ts:437-444 — the bypass to rewire:
const { sendTemplateMessage: send360Template } = await import('@/lib/whatsapp/api')
await send360Template(
  workspace.whatsapp_api_key, contact.phone,
  template.templateName, template.language,
  components.length > 0 ? components : undefined,
)
```
**Rewire to** the domain `sendTemplateMessage`. The `components` array it builds (lines 415-434: body params + optional `{type:'header', parameters:[{type:'image', image:{link}}]}`) is already the domain-compatible shape. Since this file is itself in the domain layer, it can call `sendTemplateMessage` directly (in-process).

---

### MODIFY `src/app/api/webhooks/meta/route.ts` + NEW template-status handler (route/webhook, event-driven) — WA-09

**Analog:** self (`meta/route.ts`, already handles inbound + HMAC + `resolveByPhoneNumberId`) + `resolveByPhoneNumberId` (credentials.ts:47). Add handling for `changes[].field === 'message_template_status_update'`.

**Webhook payload to handle** (RESEARCH §13):
```jsonc
{ "object":"whatsapp_business_account",
  "entry":[{ "id":"<waba_id>", "changes":[{ "field":"message_template_status_update",
    "value":{ "event":"APPROVED", "message_template_id":<id>,
              "message_template_name":"<name>", "message_template_language":"es",
              "reason":"NONE" } }] }] }
```
**Handler:** match local row by `(workspace_id, name, language)` or `message_template_id` → UPDATE `status` + `rejected_reason`. The status-mapping logic mirrors `syncTemplateStatus360` (templates-api.ts:189-208), and the row UPDATE mirrors the REJECTED-update in `domain/whatsapp-templates.ts:186-191`. The HMAC verify (`verifyMetaHmac`, route.ts:35-49) + raw-body-first already apply to this field. Pitfall 5: ensure WABA `subscribed_apps` includes the `message_templates` field (Wave-0 `GET /{waba_id}/subscribed_apps` check, OQ1).

---

## Shared Patterns

### Provider Decision (the 131047 fix — applies to ALL send/receipt/template surfaces)
**Source pattern:** `domain/messages.ts` channel branch (:130-142).
**Apply to:** `domain/messages.ts` (3 send fns), `domain/whatsapp-templates.ts`, `actions/messages.ts::markMessageAsRead`.
**Rule:** read `workspaces.whatsapp_provider`; `meta_direct` → resolve creds inside branch; everything else → existing 360dialog arm byte-identical. NEVER patch per-call-site (RESEARCH Anti-Pattern #1 — that was the 131047 root cause where the inbox fell back to global `WHATSAPP_API_KEY`).

### Meta Credential Resolution
**Source:** `src/lib/meta/credentials.ts` `resolveByWorkspace(workspaceId, 'whatsapp')` (:114-131) → `{ accessToken (decrypted via token.ts), phoneNumberId, wabaId }`.
**Apply to:** every `meta_direct` branch. `decryptToken` (token.ts:69) is called inside `rowToCredentials` — never decrypt inline, never log the plaintext token (Security V6).
```typescript
function rowToCredentials(row: MetaAccountRow): MetaCredentials {
  return { accessToken: decryptToken(row.access_token_encrypted),
           wabaId: row.waba_id, phoneNumberId: row.phone_number_id, /* … */ }
}
```

### Graph API Call Wrapper
**Source:** `meta/api.ts` `metaRequest<T>` (:24-54) — Bearer + JSON + throws `MetaGraphApiError(code, subcode, status, fbtrace_id)`.
**Apply to:** all JSON Graph calls in `meta/api.ts` and `meta/templates.ts`. **EXCEPTION:** multipart media upload (`meta/media.ts`) must use a raw `fetch` (metaRequest forces `Content-Type: application/json`).

### Template Component Building (from `{{n}}` vars)
**Source:** `actions/messages.ts:417-470` (inline HEADER media handle + text vars + BODY vars) and `messages-send-idempotent.ts` `buildTemplateApiComponents` (mobile path).
**Apply to:** any new template-send call site. Handles `header_handle[0]` for IMAGE/VIDEO/DOCUMENT headers + sequential text vars. Provider-agnostic — same `components` shape feeds both 360dialog and Meta send.

### Template Validation
**Source:** `config-builder/templates/validation.ts` `validateDraft` + `sanitizeName` (:42-146).
**Apply to:** template create/edit before submit (WA-08). Enforces name `/^[a-z0-9_]+$/`, body ≤1024, sequential `{{1}}` vars, mapping + example coverage. Reuse for Meta — these are Meta's own limits, provider-agnostic.

### Inbound Media Rehost
**Source:** `webhook-handler.ts` `downloadAndUploadMedia` (:632-679) + `getExtensionFromMime` (:684-704).
**Apply to:** Meta inbound media path. Copy structure verbatim; swap the binary-GET auth header to `Authorization: Bearer` and skip the 360dialog hostname rewrite (Meta returns the real CDN url, ~5min expiry — Pitfall 3).

### 24h Window (inherited — DO NOT re-implement, D-04)
**Source:** `actions/messages.ts:114-127` + `messages-send-idempotent.ts:240-242`.
**Apply to:** nothing new. Lives in the action layer ABOVE the sender → meta_direct inherits it for free. RESEARCH "Don't Hand-Roll": do NOT add Meta-specific window logic.

---

## Files Flagged DO-NOT-MODIFY (Regla 6 — 360dialog path frozen)

| File | Why frozen |
|------|------------|
| `src/lib/channels/whatsapp-sender.ts` | The 360dialog `ChannelSender`. Meta gets a NEW sibling file, not a change here. |
| `src/lib/whatsapp/api.ts` | The 360dialog `send(apiKey, ...)` HTTP layer. Byte-identical signature is the Regla 6 contract. Meta gets `meta/api.ts`. |
| `src/lib/whatsapp/templates-api.ts` | 360dialog template CRUD. Meta gets `meta/templates.ts`. |
| `src/lib/channels/registry.ts` / `types.ts` | The `senders` map stays channel-keyed (FB/IG). Provider split lives in domain, NOT here (RESEARCH Pattern 1 note). May extend `ChannelSender` type only additively. |
| The 360dialog `else` arms inside `domain/messages.ts`, `domain/whatsapp-templates.ts`, `actions/messages.ts` | Provider branch is additive; the existing arm must stay verbatim. |

**Regla-6 test (Wave 0):** `src/lib/domain/__tests__/messages-provider.test.ts` must assert flag=`360dialog` → 360dialog path untouched; flag=`meta_direct` → Meta path (MIG-03).

---

## No Analog Found

None. Every NEW file has a strong existing analog (360dialog implementation + half-written `meta/api.ts` helpers). This phase is **wiring + a provider branch + 3 new Meta helper files**, not greenfield (confirmed by RESEARCH "Key insight").

---

## Metadata

**Analog search scope:** `src/lib/channels/`, `src/lib/meta/`, `src/lib/whatsapp/`, `src/lib/domain/`, `src/lib/config-builder/templates/`, `src/lib/automations/`, `src/app/actions/`, `src/app/api/webhooks/meta/`.
**Files read for excerpts:** 14 (whatsapp-sender, channels/types, channels/registry, meta/api, whatsapp/api, meta/credentials, meta/token, domain/messages, actions/messages, webhook-handler, action-executor:1255-1314, contact-reviews:410-468, templates-api, meta/constants, domain/whatsapp-templates, meta/route, config-builder/tools, config-builder/validation, messages-send-idempotent:240-280, engine-adapters/messaging:40-90).
**Pattern extraction date:** 2026-06-03

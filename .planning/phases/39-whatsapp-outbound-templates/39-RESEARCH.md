# Phase 39: WhatsApp Outbound + Templates - Research

**Researched:** 2026-06-03
**Domain:** WhatsApp Cloud API (Meta Graph v22.0) outbound + template management; provider-aware sender routing
**Confidence:** HIGH (payloads + edit constraints verified against Meta-mirroring sources; codebase blast-radius confirmed by grep)

## Summary

This is an **implementation-mode** research. The stack is fixed: a Next.js 15 / TypeScript codebase that calls Meta's Graph REST API directly via `fetch` through the already-written `src/lib/meta/api.ts` helpers. There is no SDK to choose and no "WHAT" to re-litigate — D-01..D-08 in 39-CONTEXT.md are locked.

The single most important finding for de-risking this phase: **360dialog already speaks the canonical WhatsApp Cloud API payload format.** `src/lib/whatsapp/api.ts` POSTs to `https://waba-v2.360dialog.io/messages` with bodies that are byte-identical to what Meta expects at `https://graph.facebook.com/v22.0/{phone_number_id}/messages` — same `messaging_product`, `recipient_type`, `to`, `type`, and per-type sub-objects. `[VERIFIED: src/lib/whatsapp/api.ts + meta/api.ts]` The only deltas for send are (a) **URL** (`graph.facebook.com/v22.0/{phone_number_id}` vs `waba-v2.360dialog.io`), (b) **auth header** (`Authorization: Bearer <BISUAT>` vs `D360-API-KEY`), and (c) **media** — Meta supports the same `link` form but the platform-blessed path is upload-to-CDN→`media_id`. The risk rating of LOW in ROADMAP is justified for the send path.

The two areas that genuinely need care: **(1) media** — Meta inbound arrives as `lookaside.fbsbx.com` CDN URLs that require a `GET /{media_id}` → `url` → `GET url` with `Authorization: Bearer` (the 360dialog code already mirrors this via a hostname swap, so the pattern is proven); **(2) templates** — Meta's edit rules are strict and must be reflected in the UI (D-05 mandatory deliverable, see the table below).

**Primary recommendation:** Add a `metaWhatsappSender: ChannelSender` built on `meta/api.ts`. Make the provider decision in **one place** — the domain send functions (`src/lib/domain/messages.ts`), which every send surface already funnels through — by branching on `workspace.whatsapp_provider`. Keep the 360dialog `send(apiKey, ...)` signature byte-identical; resolve Meta credentials *inside* the Meta branch via `resolveByWorkspace(workspaceId, 'whatsapp')`. Build all message types, media CDN, templates CRUD+edit, read receipts, and interactive before the test-number cutover.

<user_constraints>
## User Constraints (from 39-CONTEXT.md)

### Locked Decisions
- **D-01:** Build the ENTIRE scope (text + media + templates CRUD + interactive + read-receipts + provider switch) BEFORE the first cutover. No thin slice. Planner organizes internal waves, but real cutover waits for the full surface.
- **D-02:** Make the existing `ChannelSender` registry (`src/lib/channels/registry.ts`) **provider-aware**. Resolve `workspace.whatsapp_provider` and route whatsapp → `whatsappSender` (360dialog) **or** a new `metaWhatsappSender` (Cloud API). **Default stays `360dialog`** (Regla 6 — Somnio + all current clients untouched until explicit SQL flip).
- **D-02b (Claude/planner discretion, constrained):** `metaWhatsappSender` resolves Meta credentials (decrypted BISUAT + `phone_number_id`) via `resolveByWorkspace` (`src/lib/meta/credentials.ts`). The exact threading mechanism (extend `ChannelSender.send` signature vs resolve inside the sender by `workspaceId`) is research/planner's call — but it **must not break** the existing 360dialog path (current `send(apiKey, to, ...)` must keep working byte-identical for 360dialog).
- **D-03:** First number flipped to `meta_direct` is the **test number** (Pruebas Morfx, `+57 310 5197782`, already CONNECTED in Phase 38). Somnio + real clients migrate AFTER, one by one.
- **D-04:** **Keep the current 24h-window behavior — NO new logic.** The check (`last_customer_message_at` → "Ventana de 24h cerrada. Usa un template.") already lives in the action layer (above the sender) → inherited for free by Meta. The 131047 we saw at Phase 38 close was NOT a window issue but routing to the wrong 360dialog number — D-02 fixes it at the root.
- **D-05:** **Templates by Meta COMPLETE and research-driven** — create, list, delete, sync status via webhook push (WA-09), and the full creation flow. **Use the existing `config-builder-whatsapp-templates` as the BASE**, extended for Meta. **MANDATORY:** map exactly what Meta allows editing per status and reflect reality in the UI (do NOT promise editing approved templates Meta won't allow).
- **D-06:** Media in scope, complete. Meta requires **upload to Meta CDN (get media_id) BEFORE sending** (different from 360dialog which takes a URL — though Meta also accepts a `link`). Inbound: Meta media arrives as CDN URLs with ~5min expiry → **download to Supabase Storage** (reuse existing pattern). Provider-aware in the sender.
- **D-07:** Read receipts (blue ticks) via Cloud API when opening a conversation, provider-aware.
- **D-08:** Interactive messages (buttons/lists) via Cloud API. Both in scope; exact shape = planner discretion.

### Claude's Discretion (research must inform, not just leave open)
- Credential-threading mechanism in the sender (D-02b).
- Media CDN upload/download implementation (D-06).
- Read-receipt trigger point (D-07).
- Interactive message builder shape (D-08).

### Deferred Ideas (OUT OF SCOPE)
- **Auto-template de re-engagement** (auto-reopen conversation outside 24h window) — new capability, not this phase (D-04).
- **Flip of Somnio / real clients to meta_direct** — later cutover op, after validating on the test number (D-03).
- **Changing the global default to `meta_direct`** — when all numbers are migrated.
- FB Messenger (Phase 40), Instagram (Phase 41).
- Eliminating 360dialog code (only when ALL workspaces migrate — REQUIREMENTS.md Out of Scope).
- WhatsApp Flows / Catalog / Commerce; voice/video; typing indicators (not requested).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WA-01 | Send text via Cloud API | `sendWhatsAppText` exists in `meta/api.ts`; payload verified identical to 360dialog. Code Example §1. |
| WA-02 | Send media (image/video/audio/document/sticker) via Cloud API | Payloads verified (by `id` and by `link`). 360dialog `sendMediaMessage` already canonical. Code Example §2. |
| WA-03 | Send templates via Cloud API | `sendWhatsAppTemplate` exists in `meta/api.ts`; component shape identical to 360dialog. Code Example §3. |
| WA-04 | Send interactive (buttons, lists) via Cloud API | Verified shapes + limits (3 buttons / 20-char titles / 10 sections / 10 rows). Code Example §4-5. New Meta sender method. |
| WA-06 | Download/upload media via Meta CDN | Upload `POST /{phone_number_id}/media` (multipart) → `media_id`; download `GET /{media_id}` → `url` → `GET url` (Bearer). Code Example §6-7. Pattern mirrors existing 360dialog `downloadMedia`. |
| WA-07 | Read receipts via Cloud API | `POST /{phone_number_id}/messages {status:'read', message_id}` verified. New Meta sender method. Code Example §8. |
| WA-08 | CRUD templates via Graph API (create/list/delete/sync) | Graph endpoints verified (`/{waba-id}/message_templates`). Maps onto existing `templates-api.ts` 360dialog functions. Code Example §9-12. |
| WA-09 | Template status webhooks (push, not polling) | `message_template_status_update` field on `/api/webhooks/meta`. Payload verified. Code Example §13. |
| MIG-03 | Channel sender registry provider-aware | D-02. Recommendation: branch in domain send fns on `whatsapp_provider`. Architecture Pattern 1. |
| MIG-01 | Per-workspace `whatsapp_provider` flag | Already shipped Phase 38 (column applied to prod, total=4/dialog360=4). Phase 39 only *reads* it. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Provider routing decision | Domain (`domain/messages.ts`) | — | Single chokepoint every send surface already funnels through (Regla 3). Centralizes the 131047 fix. |
| Meta credential resolution | Domain → `meta/credentials.ts` | DB `workspace_meta_accounts` | Decrypted BISUAT + `phone_number_id` are server-only secrets; resolved inside the Meta branch, never threaded through callers. |
| Send payload construction | `metaWhatsappSender` (channels) | `meta/api.ts` | Borde externo — the sender is the API edge (Regla 3). |
| 24h window enforcement | Action layer (`actions/messages.ts`, `messages-send-idempotent.ts`) | — | Provider-agnostic, ABOVE the sender → inherited for free (D-04). |
| Media upload→CDN (outbound) | `metaWhatsappSender` / `meta/media.ts` | Supabase Storage (source bytes) | Meta needs `media_id` or a `link`; upload step is a Meta-specific concern. |
| Media download (inbound) | Webhook handler (`webhook-handler.ts` path) | Supabase Storage (rehost) | Mirrors existing 360dialog `downloadAndUploadMedia`; CDN URL expires ~5min. |
| Template CRUD + edit | `meta/templates.ts` + domain `whatsapp-templates.ts` | Graph `/{waba-id}/message_templates` | Management API tier; provider-aware sibling of `templates-api.ts`. |
| Template status sync | `/api/webhooks/meta` (WA-09 push) | domain `whatsapp-templates.ts` | Webhook push replaces polling (`syncTemplateStatuses`). |

## Standard Stack

### Core (no new dependencies — native fetch + existing helpers)
| Library / Module | Version | Purpose | Why Standard |
|------------------|---------|---------|--------------|
| `fetch` (native) | Node 20 / Next 15 | All Graph API calls | Codebase convention — both `whatsapp/api.ts` and `meta/api.ts` use raw fetch, no SDK. `[VERIFIED: src/lib/meta/api.ts]` |
| `src/lib/meta/api.ts` `metaRequest<T>` | existing | Bearer + JSON wrapper, throws `MetaGraphApiError` with code/subcode | Already written; reuse for all JSON Graph calls. `[VERIFIED: meta/api.ts:24]` |
| `src/lib/meta/constants.ts` | existing | `META_GRAPH_API_VERSION='v22.0'`, `META_BASE_URL='https://graph.facebook.com/v22.0'` | Version pinned per SETUP-03. `[VERIFIED]` |
| `src/lib/meta/credentials.ts` `resolveByWorkspace` | existing | Decrypted BISUAT + `phone_number_id` + `waba_id` per workspace | The outbound credential resolver. `[VERIFIED: credentials.ts:114]` |
| `src/lib/meta/token.ts` `decryptToken` | existing | AES-256-GCM decrypt of stored BISUAT | Called inside `rowToCredentials`. `[VERIFIED]` |
| `@supabase/storage` (admin client) | existing | Rehost inbound media + source outbound media bytes | Bucket `whatsapp-media` already used both directions. `[VERIFIED: webhook-handler.ts:653]` |
| `vitest` | ^1.6.1 | Test framework | Project standard. `[VERIFIED: package.json]` |

### Supporting (existing modules to extend)
| Module | Purpose | When to Use |
|--------|---------|-------------|
| `src/lib/channels/registry.ts` + `types.ts` | `ChannelSender` abstraction | MIG-03 — add `metaWhatsappSender`. NOTE: the registry today keys only by channel; the provider decision is better made in the domain (see Pattern 1). |
| `src/lib/domain/messages.ts` | Send chokepoint (text/media/template) | The recommended provider branch site. |
| `src/lib/whatsapp/templates-api.ts` | 360dialog template CRUD | BASE shape to mirror for `meta/templates.ts` (D-05). |
| `src/lib/config-builder/templates/**` | AI template builder (tools, validation, system-prompt) | BASE for WA-08 creation flow (D-05). |
| `src/app/actions/messages.ts` | 24h window + recipient resolution | Inherits Meta for free (D-04); only the apiKey-resolution block needs to become provider-aware (or move the branch into domain). |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Branch in domain `messages.ts` | Branch inside `getChannelSender(channel, provider)` | Registry signature would need a 2nd arg; but FB/IG senders take `apiKey` too — making the registry resolve credentials breaks the clean "caller passes apiKey" contract for 360dialog. Domain branch keeps 360dialog byte-identical. **Recommendation: domain branch.** |
| Upload media → `media_id` for every outbound | Send by `link` (public Supabase URL) | `link` is simpler and supported by Meta `[VERIFIED: messages reference — both forms documented]`, but Meta fetches the URL synchronously and rate-limits its fwdproxy (error 131053). For media already in Supabase Storage, `link` is fine and matches the 360dialog path. **Recommendation: send by `link` for parity; reserve upload→`media_id` for template header media + large files.** |
| Webhook push for template status (WA-09) | Keep polling `syncTemplateStatuses` | Polling is the 360dialog path and still works as a fallback. WA-09 explicitly wants push. **Recommendation: push primary, keep poll as manual-resync fallback.** |

**Installation:** No new npm packages. All work is new TypeScript files + edits to existing modules.

**Version verification:** Graph API version is **v22.0** (enforced by Meta since Sep 2025, confirmed current in REQUIREMENTS.md and `meta/constants.ts`). `[VERIFIED: REQUIREMENTS.md:69 + constants.ts]` No npm versions to verify — zero new deps.

## Architecture Patterns

### System Architecture Diagram

```
                         SEND SURFACES (all already funnel through domain — Regla 3)
  ┌──────────────┬───────────────┬──────────────────┬────────────────┬──────────────────┐
  │ Inbox        │ Agent engine  │ Automations      │ contact-reviews│ godentist-remind │
  │ actions/     │ engine-adapt/ │ action-executor  │ domain/contact-│ inngest/         │
  │ messages.ts  │ production/   │ .ts              │ reviews.ts     │ godentist-       │
  │              │ messaging.ts  │                  │                │ reminders.ts     │
  │ + mobile     │               │ (+ 1 direct      │ (+ 1 direct    │                  │
  │ messages-    │               │  send360Template │  send360Template│                 │
  │ send-idemp.  │               │  at line 1279)   │  at line 437)  │                  │
  └──────┬───────┴───────┬───────┴────────┬─────────┴───────┬────────┴────────┬─────────┘
         │  resolve apiKey + 24h window (action concern, provider-agnostic, D-04)
         ▼               ▼                ▼                 ▼                 ▼
  ┌─────────────────────────────────────────────────────────────────────────────────────┐
  │  DOMAIN LAYER  src/lib/domain/messages.ts   (sendTextMessage / sendMediaMessage /     │
  │                                              sendTemplateMessage)                      │
  │  ── THE SINGLE PROVIDER-DECISION CHOKEPOINT (MIG-03 / D-02) ──                         │
  │                                                                                        │
  │   read workspace.whatsapp_provider                                                     │
  │        │                                                                               │
  │        ├─ '360dialog' (DEFAULT) ──► send360Text/Media/Template(apiKey, ...)            │
  │        │                            POST https://waba-v2.360dialog.io/messages         │
  │        │                            header D360-API-KEY                  (UNCHANGED)    │
  │        │                                                                               │
  │        └─ 'meta_direct' ──► resolveByWorkspace(workspaceId,'whatsapp')                  │
  │                             → { accessToken(decrypted BISUAT), phoneNumberId }          │
  │                             → metaWhatsappSender.send*(creds, to, ...)                  │
  │                               POST https://graph.facebook.com/v22.0/{phoneNumberId}/    │
  │                                    messages    header Authorization: Bearer <BISUAT>    │
  └─────────────────────────────────────────────────────────────────────────────────────┘
         │ both return { messages:[{id: wamid}] }  → store row + update conversation
         ▼
  ┌─────────────────────┐        ┌──────────────────────────────────────────────────────┐
  │ messages table (DB) │        │ STATUS WEBHOOKS  /api/webhooks/meta                    │
  │ wamid, status, ...  │◄───────┤  - message status (sent/delivered/read/failed 131047) │
  └─────────────────────┘        │  - message_template_status_update (WA-09 → sync row)  │
                                  └──────────────────────────────────────────────────────┘

  TEMPLATES (WA-08 management — separate from send):
  config-builder UI / actions/templates.ts ─► domain/whatsapp-templates.ts
     │ branch on whatsapp_provider
     ├─ '360dialog'  ─► templates-api.ts  (waba-v2.360dialog.io/v1/configs/templates)
     └─ 'meta_direct'─► meta/templates.ts (graph.facebook.com/v22.0/{waba_id}/message_templates)
```

### Recommended Project Structure
```
src/lib/meta/
├── api.ts            # EXISTING — extend with sendMedia, sendInteractive, markRead
├── media.ts          # NEW — uploadMedia (multipart→media_id), getMediaUrl, downloadMedia
├── templates.ts      # NEW — createTemplateMeta/list/delete/edit (mirror templates-api.ts)
├── credentials.ts    # EXISTING — resolveByWorkspace (no change)
└── constants.ts      # EXISTING

src/lib/channels/
├── meta-whatsapp-sender.ts  # NEW — metaWhatsappSender: ChannelSender (+ extended methods)
├── registry.ts              # EXISTING — see Pattern 1 (decide where branch lives)
├── types.ts                 # EXISTING — may extend ChannelSender (see D-02b options)
└── whatsapp-sender.ts       # EXISTING — 360dialog, DO NOT MODIFY behavior

src/lib/domain/
├── messages.ts              # EXISTING — add provider branch (Pattern 1)
└── whatsapp-templates.ts    # EXISTING — add provider branch for CRUD
```

### Pattern 1: Provider branch in the domain layer (RECOMMENDED for D-02 / D-02b)

**What:** Keep the `ChannelSender` interface and 360dialog sender exactly as-is. Add the provider decision inside `domain/messages.ts` (and `domain/whatsapp-templates.ts`), which every send/template surface already calls (Regla 3). Resolve Meta credentials *inside* the `meta_direct` branch — callers keep passing `apiKey` (used only by the 360dialog branch and FB/IG).

**Why this over extending the registry:** The `ChannelSender.send(apiKey, ...)` contract is shared by 360dialog AND ManyChat FB/IG. Threading Meta's `{accessToken, phoneNumberId}` through every caller (D-02b "extend signature" option) would touch all 6 send surfaces and risk breaking the byte-identical 360dialog path (Regla 6). Resolving inside the domain branch touches one file per send type and leaves callers untouched.

**When to use:** All WhatsApp send paths.

**Example:**
```typescript
// src/lib/domain/messages.ts — sendTextMessage, the meta_direct branch
// Source: pattern derived from existing messages.ts:119 + meta/api.ts:63 [VERIFIED]
const { data: ws } = await supabase
  .from('workspaces').select('whatsapp_provider').eq('id', ctx.workspaceId).single()

if (channel === 'whatsapp' && ws?.whatsapp_provider === 'meta_direct') {
  const creds = await resolveByWorkspace(ctx.workspaceId, 'whatsapp')   // credentials.ts
  if (!creds?.accessToken || !creds.phoneNumberId) {
    return { success: false, error: 'Credenciales Meta no configuradas' }
  }
  const resp = await sendWhatsAppText(creds.accessToken, creds.phoneNumberId,
                                      params.contactPhone, params.messageBody)
  wamid = resp.messages?.[0]?.id
} else if (channel === 'whatsapp') {
  const resp = await send360Text(params.apiKey, params.contactPhone, params.messageBody) // UNCHANGED
  wamid = resp.messages?.[0]?.id
} else { /* FB/IG via getChannelSender — UNCHANGED */ }
```

**Note on `metaWhatsappSender`:** D-02 names a `metaWhatsappSender`. Implement it as a thin `ChannelSender`-shaped module in `channels/meta-whatsapp-sender.ts` that the domain branch calls (keeps the "sender = API edge" convention), but it takes `{accessToken, phoneNumberId}` rather than `apiKey`. Do NOT register it in the `senders` `Record<ChannelType,...>` map (that map is channel-keyed, not provider-keyed). The registry stays for FB/IG; the WhatsApp provider split lives in domain.

### Pattern 2: Send media by `link` (parity) — reserve upload→media_id for template headers

**What:** For chat media already rehosted in Supabase Storage, send Meta the public `link` (same as 360dialog). Use the multipart upload→`media_id` flow only where a stable handle is required: template HEADER media at creation time, and large/private files.

**When to use:** Outbound chat media = `link`. Template header media = upload→handle.

```typescript
// by link (parity with 360dialog sendMediaMessage):
{ messaging_product:'whatsapp', recipient_type:'individual', to,
  type:'image', image:{ link: publicUrl, caption } }
// caption only for image/video/document; filename only for document.  [VERIFIED]
```

### Pattern 3: Template status via webhook push (WA-09)

**What:** Subscribe the WABA to the `message_templates` webhook field (Phase 38 already calls `subscribeWaba`). On `/api/webhooks/meta`, handle `field: 'message_template_status_update'` and UPDATE the local `whatsapp_templates` row's `status` + `rejected_reason`. Keep `syncTemplateStatuses` (poll) as a manual "Resync" button fallback.

### Anti-Patterns to Avoid
- **Patching provider per call-site.** This is exactly the 131047 root cause (inbox fell to global `WHATSAPP_API_KEY`). Make the branch ONCE in domain. `[VERIFIED: PLAYBOOK §GAP DE OUTBOUND]`
- **Modifying the 360dialog `send(apiKey, ...)` signature.** Breaks Regla 6 (Somnio + 4 prod workspaces on 360dialog). Keep it byte-identical.
- **Promising "edit approved template" in the UI without the constraint guardrails.** Meta limits approved edits to 1/24h and 10/30d, and name/language can NEVER change (see D-05 table).
- **Assuming inbound Meta CDN URLs are durable.** They expire ~5min and require `Authorization: Bearer`. Download immediately on receipt (same as the existing 360dialog inbound path).
- **Sending `caption` on audio or sticker.** Not supported — Meta rejects it. Only image/video/document take `caption`; only document takes `filename`. `[VERIFIED: messages reference]`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bearer + error parsing for Graph calls | A new fetch wrapper | `metaRequest<T>` in `meta/api.ts` | Already parses `error.code/subcode/fbtrace_id` into `MetaGraphApiError`. `[VERIFIED]` |
| BISUAT decryption | Inline crypto | `decryptToken` via `resolveByWorkspace` | AES-256-GCM already implemented + tag-verified. `[VERIFIED: token.ts]` |
| 24h window check | New window logic for Meta | Existing action-layer check | Provider-agnostic, above sender (D-04). `[VERIFIED: messages.ts:114]` |
| Inbound media rehost | New downloader | Mirror `downloadAndUploadMedia` (webhook-handler.ts:632) | Proven pattern: download→Supabase Storage→public URL, `upsert:false`, MIME→ext map. `[VERIFIED]` |
| Template component building from `{{n}}` vars | New parser | Reuse `buildTemplateApiComponents` (messages-send-idempotent.ts:431) + the inline logic in actions/messages.ts:417 | Handles HEADER media handle + text vars + BODY vars identically across web + mobile. `[VERIFIED]` |
| Template name sanitization / validation | New validator | `config-builder/templates/validation.ts` (`validateDraft`, `sanitizeName`) | Existing builder enforces Meta char limits + sequential vars. `[VERIFIED: tools.ts:25]` |
| Provider-keyed registry map | A 2nd dimension on the registry Record | Domain branch (Pattern 1) | The Record is channel-keyed; provider belongs in the workspace-aware domain. |

**Key insight:** Almost everything for the Meta send path already exists in two forms — the 360dialog implementation (canonical payloads) and the half-written `meta/api.ts` helpers. This phase is mostly **wiring + a provider branch + 3 new Meta helper files (media, templates, interactive/read methods)**, not greenfield.

## Runtime State Inventory

> Rename/refactor/migration triggers don't fully apply (this is additive feature work), but the provider flip IS a runtime-state migration, so the relevant categories are answered.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `workspaces.whatsapp_provider` column (default `'360dialog'`, prod has total=4/dialog360=4). Test number `+57 310 5197782` row in `workspace_meta_accounts` with encrypted BISUAT + `phone_number_id=1134593926408063` (CONNECTED Phase 38). | The cutover = a single SQL `UPDATE workspaces SET whatsapp_provider='meta_direct' WHERE id='<test-ws>'`. No backfill. Code reads the flag. `[VERIFIED: STATE.md:51]` |
| Live service config | None new. Meta webhook subscription (`subscribed_apps`) done in Phase 38; WA-09 adds the `message_templates` field but that's a code/webhook-field concern, not external UI state. | Confirm WABA is subscribed to `message_templates` field (may need re-subscribe call). |
| OS-registered state | None — verified (no cron/task touches whatsapp_provider; godentist-reminders reads workspace settings at runtime). | None. |
| Secrets/env vars | `WHATSAPP_API_KEY` (global 360dialog fallback) — **this is the 131047 trap.** `META_TOKEN_ENCRYPTION_KEY`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` already set (Phase 38). | Do NOT remove `WHATSAPP_API_KEY` (360dialog default still uses it). After the domain branch, `meta_direct` workspaces never reach that fallback. |
| Build artifacts | None — additive TypeScript, zero migrations expected (MIG-01 column already exists). | None. |

**The canonical question — after every file is updated, what still routes wrong?** Only the per-call-site `apiKey` resolution blocks that fall back to global `WHATSAPP_API_KEY`. The fix is the domain branch + ensuring no surface bypasses domain. The 2 direct `send360Template` imports (action-executor.ts:1279, contact-reviews.ts:437) bypass the domain send fns — see Common Pitfall 1.

## Common Pitfalls

### Pitfall 1: Send surfaces that bypass the domain chokepoint (the 131047 blast radius)
**What goes wrong:** A surface calls 360dialog directly or resolves `apiKey` itself and never sees `whatsapp_provider` → a `meta_direct` workspace's message goes out the wrong number → WhatsApp 131047 "Re-engagement message".
**Why it happens:** Historically every surface resolved `apiKey = settings.whatsapp_api_key || WHATSAPP_API_KEY` and passed it down. Two surfaces also import `send360Template` directly, bypassing domain entirely.
**Full blast radius (grep-verified):** `[VERIFIED: grep]`
- `src/app/actions/messages.ts` — inbox text/media/template (3 fns, lines 143/253/485) + `markMessageAsRead` (line 358).
- `src/lib/domain/messages-send-idempotent.ts` — mobile outbox (line 261).
- `src/lib/agents/engine-adapters/production/messaging.ts` — agent sends via `getChannelCredentials` (line 59).
- `src/lib/automations/action-executor.ts` — automations (lines 787, 945/988/1039 go through domain) **+ a DIRECT `send360Template` at line 1279** (host-notification "informacion_general").
- `src/lib/domain/contact-reviews.ts` — **DIRECT `send360Template` at line 437.**
- `src/inngest/functions/godentist-reminders.ts` — reminder templates via domain (lines 256/504).
- `src/lib/tools/handlers/whatsapp/index.ts` — agent tool sends via domain (lines 255/450).
- `src/lib/config-builder/templates/tools.ts:324` — template create apiKey (management, not send).
**How to avoid:** (1) Put the provider branch in the domain send fns so all domain callers inherit it. (2) Convert the 2 direct `send360Template` imports to call `domainSendTemplateMessage` (so they get the branch too). (3) `markMessageAsRead` (read receipts, D-07) is its own surface — give it a provider branch as well.
**Warning signs:** Outbound `status:failed` + `error_message` containing "Re-engagement" / code 131047, *with* a wamid present.

### Pitfall 2: Promising approved-template edits the UI can't deliver (D-05 mandatory)
**What goes wrong:** UI shows an "Edit" button on an APPROVED template; user changes the name/language/category → Meta rejects or silently no-ops → confusing UX.
**Why it happens:** Meta's edit rules are status- and field-dependent (table below).
**How to avoid:** Gate the edit UI by status + field per the D-05 table. Treat edit as "edit → re-review (status flips to PENDING/IN_APPEAL)".
**Warning signs:** `(#100) ...cannot be edited` errors; edits that never take effect.

### Pitfall 3: Inbound Meta CDN media URL expiry (~5 min) + Bearer requirement
**What goes wrong:** Media stored as the raw `lookaside.fbsbx.com` URL → 404 / 401 after a few minutes.
**Why it happens:** Meta CDN URLs are short-lived and require `Authorization: Bearer <BISUAT>` on the binary GET. `[VERIFIED: WebSearch — multiple BSP sources + 360dialog hostname-swap code]`
**How to avoid:** On inbound webhook, immediately `GET /{media_id}` → `url`, then `GET url` with Bearer, then upload to Supabase Storage and store the public URL (exactly the existing 360dialog `downloadAndUploadMedia` pattern, swapping the auth header and skipping the hostname rewrite — Meta returns the real CDN URL).
**Warning signs:** Inbound images broken in inbox after a delay.

### Pitfall 4: Caption/filename on the wrong media types
**What goes wrong:** Sending `caption` on audio/sticker, or `filename` on non-document → 400.
**How to avoid:** caption ∈ {image, video, document}; filename ∈ {document}. The existing 360dialog `sendMediaMessage` already gates this (api.ts:108-115) — mirror it.

### Pitfall 5: Re-subscribing webhooks / missing `message_templates` field (WA-09)
**What goes wrong:** Template status webhook never arrives → local rows stuck at PENDING.
**How to avoid:** Ensure the WABA `subscribed_apps` includes the `message_templates` field (Phase 38 `subscribeWaba` subscribed the app; verify field coverage). Keep `syncTemplateStatuses` poll as a manual fallback.

### Pitfall 6: Phone number format
**What goes wrong:** Meta wants the recipient `to` without a leading `+` in some flows; 360dialog accepted E.164 with `+`.
**How to avoid:** Meta Cloud API accepts the number with country code; the existing helpers pass `conversation.phone` through unchanged and 360dialog works, so keep parity — but verify on the test-number smoke (D-03). `[ASSUMED — verify on first cutover]`

## Code Examples

> All payloads verified against Meta Graph v22.0 references and cross-checked against the byte-identical 360dialog implementation already in `src/lib/whatsapp/api.ts`.

### 1. Text (WA-01) `[VERIFIED: meta/api.ts:63 + messages reference]`
```
POST https://graph.facebook.com/v22.0/{phone_number_id}/messages
Authorization: Bearer <BISUAT>
{ "messaging_product":"whatsapp", "recipient_type":"individual",
  "to":"<phone>", "type":"text", "text":{ "body":"<text>" } }
```

### 2. Media by link (WA-02) `[VERIFIED: messages reference — both id and link forms]`
```
{ "messaging_product":"whatsapp","recipient_type":"individual","to":"<phone>",
  "type":"image", "image":{ "link":"<public-url>", "caption":"<optional>" } }
// video: video:{link,caption}  audio: audio:{link}  (NO caption)
// document: document:{link, filename, caption}  sticker: sticker:{link}  (NO caption)
```

### 3. Template (WA-03) `[VERIFIED: meta/api.ts:88 + 360dialog api.ts:140]`
```
{ "messaging_product":"whatsapp","recipient_type":"individual","to":"<phone>",
  "type":"template",
  "template":{ "name":"<name>", "language":{ "code":"es" },
    "components":[
      { "type":"header","parameters":[{ "type":"image","image":{ "link":"<url>" } }] },
      { "type":"body","parameters":[{ "type":"text","text":"<var1>" }] } ] } }
```

### 4. Interactive reply buttons (WA-04) `[VERIFIED: messages reference + 360dialog sendButtonMessage; limits: max 3 buttons, title max 20 chars]`
```
{ "messaging_product":"whatsapp","recipient_type":"individual","to":"<phone>",
  "type":"interactive",
  "interactive":{ "type":"button",
    "header":{ "type":"text","text":"<optional>" },
    "body":{ "text":"<body>" },
    "footer":{ "text":"<optional>" },
    "action":{ "buttons":[
      { "type":"reply","reply":{ "id":"btn_1","title":"Sí" } },     // ≤3 buttons
      { "type":"reply","reply":{ "id":"btn_2","title":"No" } } ] } } }  // title ≤20 chars
```

### 5. Interactive list (WA-04) `[VERIFIED: messages reference; max 10 sections, ≤10 rows total, row title ≤24 chars, button text ≤20 chars]`
```
{ "messaging_product":"whatsapp","recipient_type":"individual","to":"<phone>",
  "type":"interactive",
  "interactive":{ "type":"list",
    "header":{ "type":"text","text":"<optional>" },
    "body":{ "text":"<body>" },
    "footer":{ "text":"<optional>" },
    "action":{ "button":"<menu label ≤20>",
      "sections":[ { "title":"<section>",
        "rows":[ { "id":"row_1","title":"<≤24>","description":"<optional ≤72>" } ] } ] } } }
```

### 6. Media UPLOAD (WA-06, for template header media / large files) `[VERIFIED: WebSearch — media upload API; multipart]`
```
POST https://graph.facebook.com/v22.0/{phone_number_id}/media
Authorization: Bearer <BISUAT>
Content-Type: multipart/form-data
fields: messaging_product=whatsapp, type=<mime e.g. image/jpeg>, file=<binary>
→ 200 { "id":"<media_id>" }
// Note: do NOT set Content-Type:application/json — metaRequest forces JSON, so write a
// dedicated multipart fetch (FormData) in meta/media.ts, NOT via metaRequest.
```

### 7. Media DOWNLOAD inbound (WA-06) `[VERIFIED: WebSearch + 360dialog downloadMedia pattern]`
```
GET https://graph.facebook.com/v22.0/{media_id}
Authorization: Bearer <BISUAT>
→ { "url":"https://lookaside.fbsbx.com/...", "mime_type":"image/jpeg",
    "sha256":"...", "file_size":12345, "id":"<media_id>" }   // url valid ~5 min
then:
GET <url>   Authorization: Bearer <BISUAT>   → binary  → upload to Supabase Storage
```

### 8. Read receipt (WA-07) `[VERIFIED: 360dialog markMessageAsRead:308 + messages reference]`
```
POST https://graph.facebook.com/v22.0/{phone_number_id}/messages
Authorization: Bearer <BISUAT>
{ "messaging_product":"whatsapp", "status":"read", "message_id":"<wamid of inbound msg>" }
```
**Recommended trigger point (D-07):** call when the inbox marks a conversation read. Today `markMessageAsRead` (actions/messages.ts:331) marks one inbound message by wamid. Mirror it: branch on `whatsapp_provider` → Meta uses `{accessToken,phoneNumberId}` + the same `status:read` body; 360dialog keeps `markRead360(apiKey, wamid)`. Trigger on conversation-open (already the inbox behavior).

### 9-12. Template CRUD via Graph (WA-08) `[VERIFIED: WebSearch — Business Management API; mirror templates-api.ts]`
```
// CREATE   POST /v22.0/{waba_id}/message_templates
{ "name":"<lower_snake>", "language":"es", "category":"UTILITY",
  "components":[ {"type":"BODY","text":"...{{1}}...",
                 "example":{"body_text":[["ej"]]}}, ... ] }
// LIST     GET  /v22.0/{waba_id}/message_templates?limit=250&fields=name,status,category,language,components,quality_score,rejected_reason
// DELETE   DELETE /v22.0/{waba_id}/message_templates?name=<name>    (deletes all languages of that name)
//          (delete a single language: ?hsm_id=<template_id>&name=<name>)
// EDIT     POST /v22.0/{message_template_id}   body: { "category":..., "components":[...] }
//          NAME and LANGUAGE are immutable. See D-05 table for status/limit rules.
```
**Header media at create:** Meta needs a permanent handle in `components[HEADER].example.header_handle[0]`. The 360dialog path obtains it via a Resumable Upload (`uploadHeaderImage360`, templates-api.ts:235). For Meta direct, use the **Resumable Upload API** (`POST /v22.0/{app_id}/uploads?file_length&file_type` → session → `POST /{session_id}` with `file_offset:0` → `{h:"<handle>"}`). This is the same two-step flow 360dialog proxies. `[VERIFIED: templates-api.ts:211-291 documents the exact 2-step]`

### 13. Template status webhook (WA-09) `[VERIFIED: WebSearch — multiple BSP mirrors of Meta payload]`
```
POST /api/webhooks/meta   (same endpoint as inbound, different field)
{ "object":"whatsapp_business_account",
  "entry":[ { "id":"<waba_id>",
    "changes":[ { "field":"message_template_status_update",
      "value":{ "event":"APPROVED",                 // APPROVED|REJECTED|PENDING|PAUSED|DISABLED|FLAGGED
                "message_template_id":<id>,
                "message_template_name":"<name>",
                "message_template_language":"es",
                "reason":"NONE" } } ] } ] }   // reason populated on REJECTED/PAUSED
```
Handler: match local row by `(workspace_id, name, language)` or `message_template_id` → UPDATE `status` + `rejected_reason`.

## D-05 MANDATORY DELIVERABLE: Meta Template Edit Constraints (per status)

> What Meta's current Graph API (v22.0) actually allows for editing. The UI MUST honor this — do not show an unconstrained "Edit" on approved templates.

| Status | Editable? | What can change | What can NEVER change | Frequency limit | Source |
|--------|-----------|-----------------|------------------------|-----------------|--------|
| **APPROVED** | YES (limited) | `components` (body, header, footer, buttons); category *technically* via the Update endpoint **but triggers re-review** | `name`, `language` | **1 edit / 24h, 10 edits / 30 days** | `[CITED: developer.vonage.com/whatsapp-template-management]` + `[VERIFIED: WebSearch multiple BSPs]` |
| **REJECTED** | YES | `components`, and category | `name`, `language` | **Unlimited** | `[CITED: developer.vonage.com]` |
| **PAUSED** | YES | `components` (to fix quality) | `name`, `language` | **Unlimited** | `[CITED: developer.vonage.com]` |
| **PENDING / IN_REVIEW** | NO | — (wait for review to finish) | — | — | `[CITED: developer.vonage.com]` (only Approved/Rejected/Paused listed editable) |
| **DISABLED** | NO | Must create a new template | — | — | `[VERIFIED: WebSearch — disabled = recreate]` |

**Endpoint:** `POST /v22.0/{message_template_id}` with `{ category?, components? }`. After a successful edit the status flips to **PENDING/IN_REVIEW** (re-review). `[VERIFIED: WebSearch]`

**UI guidance (reflect reality):**
- Show "Edit" only when status ∈ {APPROVED, REJECTED, PAUSED}.
- For APPROVED: disable the `name`/`language`/`category` fields; warn "1 edit per 24h, 10 per 30 days; editing re-submits for Meta review."
- For DISABLED/PENDING: no edit; offer "Duplicate as new" instead.
- Meta does NOT support in-place edit of `name` or `language` for any status — to change those you delete + recreate.
- 360dialog's `templates-api.ts` has NO edit function today — editing is a **new capability** for both providers in this phase (D-05 says base on the builder which only CREATES). The edit endpoint above is Meta-direct; for 360dialog workspaces, editing maps to delete+recreate (or 360dialog's own edit endpoint if added later — out of scope, default stays create-only for 360dialog).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 360dialog proxy (`waba-v2.360dialog.io`, `D360-API-KEY`) | Meta Cloud API direct (`graph.facebook.com/v22.0`, `Bearer`) | This phase (opt-in) | Same payloads; URL+auth swap. Default stays 360dialog (Regla 6). |
| Polling template status (`syncTemplateStatuses`) | Webhook push `message_template_status_update` (WA-09) | This phase | Real-time status; poll kept as manual fallback. |
| Graph API ≤ v21 | v22.0 enforced | Sep 2025 | Already pinned in `constants.ts`. `[VERIFIED: REQUIREMENTS.md:69]` |

**Deprecated/outdated:** None blocking. (Meta periodically increments Graph versions; v22.0 is current and pinned.)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Recipient `to` format (with/without leading `+`) works identically Meta vs 360dialog | Pitfall 6 | LOW — verify on test-number smoke (D-03); existing helpers pass phone unchanged. |
| A2 | WABA `subscribed_apps` from Phase 38 already covers the `message_templates` field (vs needing a re-subscribe call) | Pitfall 5 / WA-09 | MEDIUM — if missing, template webhooks won't fire; add a subscribe-fields step. Verifiable via `GET /{waba_id}/subscribed_apps`. |
| A3 | Sending media by `link` (Supabase public URL) is accepted by Meta for chat media (not just upload→media_id) | Pattern 2 | LOW — documented by Meta; watch for 131053 fwdproxy rate-limit on high volume → fall back to upload→media_id. |
| A4 | Category edit on APPROVED is allowed by the API but best avoided (triggers reclassification/re-review) | D-05 table | LOW — conservative UI (lock category) sidesteps the ambiguity entirely. |
| A5 | Read-receipt trigger = conversation-open (mirrors current inbox `markMessageAsRead`) | Code Example 8 | LOW — D-07 leaves trigger to discretion; conversation-open matches existing UX. |

## Open Questions

1. **Does Phase 38's `subscribeWaba` subscribe to the `message_templates` webhook field, or only inbound messages?**
   - What we know: `subscribeWaba` POSTs `/{waba_id}/subscribed_apps`; inbound works.
   - What's unclear: whether template-status events are included by that subscription (Meta subscribes the app to all fields the app has, but the app's webhook-field config in the Meta App dashboard matters).
   - Recommendation: add a Wave-0 check `GET /{waba_id}/subscribed_apps` on the test number; if `message_templates` not listed, add a one-time field-subscribe + ensure the App dashboard has `message_template_status_update` enabled.

2. **For `meta_direct`, should `markMessageAsRead` (D-07) be its own branch or routed through a sender method?**
   - Recommendation: small dedicated branch in `actions/messages.ts::markMessageAsRead` (it already imports `markRead360` dynamically); add a Meta arm that resolves creds + POSTs `status:read`. Low surface area.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Graph API v22.0 reachable | all WA send/templates | ✓ (used in Phase 38 live) | v22.0 | — |
| Test number CONNECTED | first cutover (D-03) | ✓ | +57 310 5197782 / pnid 1134593926408063 | — |
| `META_TOKEN_ENCRYPTION_KEY` env | decrypt BISUAT | ✓ (Phase 38) | — | — |
| `META_APP_SECRET` / `META_WEBHOOK_VERIFY_TOKEN` | webhook HMAC + handshake | ✓ (Phase 38) | — | — |
| `WHATSAPP_API_KEY` env | 360dialog default | ✓ | — | keep (default provider) |
| Supabase Storage bucket `whatsapp-media` | media rehost both directions | ✓ | — | — |
| **pnpm** (NOT npm) | install/build | ✓ | repo is pnpm-only | npm breaks `pnpm-lock` → broken Vercel deploys (MEMORY.md lesson) |

**Missing dependencies with no fallback:** None.
**Missing with fallback:** None blocking.

## Validation Architecture

> nyquist_validation is not set false in config.json → enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^1.6.1 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run <path>` |
| Full suite command | `npm run test` (`vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WA-01 | Meta text payload shape + provider branch picks Meta when flag=meta_direct | unit | `npx vitest run src/lib/meta/__tests__/send.test.ts` | ❌ Wave 0 |
| WA-02 | Media by link payload per type; caption/filename gating | unit | `npx vitest run src/lib/meta/__tests__/send.test.ts` | ❌ Wave 0 |
| WA-03 | Template send component build (header media handle + body vars) | unit | `npx vitest run src/lib/meta/__tests__/send.test.ts` | ❌ Wave 0 |
| WA-04 | Interactive button/list builder limits (≤3 buttons, ≤20 title, ≤10 sections) | unit | `npx vitest run src/lib/channels/__tests__/meta-whatsapp-sender.test.ts` | ❌ Wave 0 |
| WA-06 | Media upload multipart fields; inbound download Bearer + rehost | unit | `npx vitest run src/lib/meta/__tests__/media.test.ts` | ❌ Wave 0 |
| WA-07 | Read-receipt `status:read` body; provider branch | unit | `npx vitest run src/lib/meta/__tests__/send.test.ts` | ❌ Wave 0 |
| WA-08 | Template create/list/delete/edit endpoint shapes + edit-status gating | unit | `npx vitest run src/lib/meta/__tests__/templates.test.ts` | ❌ Wave 0 |
| WA-09 | `message_template_status_update` handler updates row status | unit | `npx vitest run src/app/api/webhooks/meta/__tests__/template-status.test.ts` | ❌ Wave 0 |
| MIG-03 | 360dialog branch byte-identical when flag=360dialog (Regla 6) | unit | `npx vitest run src/lib/domain/__tests__/messages-provider.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <touched test file>` + `npx tsc --noEmit`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green + LIVE smoke on test number (text/media/template/interactive/read-receipt out the Meta number; inbound media rehosted) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/lib/domain/__tests__/messages-provider.test.ts` — Regla 6: flag=360dialog → 360dialog path untouched; flag=meta_direct → Meta path (MIG-03).
- [ ] `src/lib/meta/__tests__/send.test.ts` — WA-01/02/03/07 payloads.
- [ ] `src/lib/meta/__tests__/media.test.ts` — WA-06 upload + download.
- [ ] `src/lib/meta/__tests__/templates.test.ts` — WA-08 CRUD + edit-status guard (D-05).
- [ ] `src/lib/channels/__tests__/meta-whatsapp-sender.test.ts` — WA-04 interactive limits.
- [ ] `src/app/api/webhooks/meta/__tests__/template-status.test.ts` — WA-09.

## Security Domain

> security_enforcement not set false in config → applies.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth surface (Phase 38 handled signup). |
| V4 Access Control | yes | `workspaceId` from session/ctx, NEVER from input (existing domain pattern); `resolveByWorkspace` filters by workspace + `is_active`. |
| V5 Input Validation | yes | zod schemas already in config-builder templates; validate template name/components + interactive limits before send. |
| V6 Cryptography | yes | BISUAT AES-256-GCM via `token.ts` — never hand-roll; never log plaintext token. |
| V9 Communication | yes | HTTPS-only Graph calls; webhook HMAC-SHA256 over raw body (Phase 38 `verifyMetaHmac`). |

### Known Threat Patterns for Meta Cloud API integration
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Plaintext BISUAT in logs | Information Disclosure | Never `console.log` decrypted token; existing helpers only pass it to fetch. |
| Cross-workspace send (wrong number) | Spoofing/Tampering | Provider branch resolves creds by `ctx.workspaceId` only; the 131047 fix. |
| Forged template-status webhook | Tampering | HMAC verify on `/api/webhooks/meta` (Phase 38) applies to all fields. |
| Sending out wrong provider's number | Tampering | Single domain chokepoint; Regla-6 test asserts 360dialog untouched. |

## Sources

### Primary (HIGH confidence)
- Codebase (grep + file reads): `src/lib/meta/{api,credentials,token,constants}.ts`, `src/lib/whatsapp/{api,templates-api,types,webhook-handler}.ts`, `src/lib/domain/{messages,messages-send-idempotent,whatsapp-templates}.ts`, `src/lib/channels/{registry,types,whatsapp-sender}.ts`, `src/lib/agents/engine-adapters/production/messaging.ts`, `src/lib/automations/action-executor.ts`, `src/lib/domain/contact-reviews.ts`, `src/lib/config-builder/templates/tools.ts`, `src/app/actions/{messages,templates}.ts`.
- 39-CONTEXT.md (D-01..D-08), REQUIREMENTS.md, STATE.md, PLAYBOOK-number-activation.md §GAP DE OUTBOUND.
- Context7 `/websites/developers_facebook_business-messaging_whatsapp_v4` — message types overview, template/interactive/media existence.

### Secondary (MEDIUM confidence — verified against official Meta behavior via BSP mirrors)
- developer.vonage.com/en/messages/guides/whatsapp-template-management — **template edit statuses + 1/24h, 10/30d limits** (D-05 critical).
- developer.vonage.com/.../whatsapp-interactive-messages + developers.facebook.com interactive docs — button/list limits.
- WebSearch (multiple BSPs: Kaleyra, Wati, Sinch, whatchimp, Vonage support) — name/category/language immutable on approved; media size limits (image 5MB, audio/video 16MB, document 100MB, sticker ≤500KB); MIME types; media URL ~5min expiry; media_id 30-day server retention.

### Tertiary (LOW confidence — flagged in Assumptions/Open Questions)
- Recipient phone format parity (A1), subscribed_apps template-field coverage (A2/OQ1), link vs media_id rate-limit nuance (A3).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; all helpers exist and verified by file read.
- Send payloads: HIGH — verified against Meta refs AND the byte-identical 360dialog impl.
- Template edit constraints (D-05): HIGH — primary numeric limits cited (Vonage) + corroborated by 3+ BSP sources.
- Media flows: MEDIUM-HIGH — upload/download verified; exact multipart field casing to confirm on smoke.
- Blast radius (send surfaces): HIGH — grep-enumerated, including the 2 direct `send360Template` bypasses.
- Webhook payload (WA-09): MEDIUM — verified via BSP mirrors of Meta's payload (official page JS-gated).

**Research date:** 2026-06-03
**Valid until:** 2026-07-03 (stable; Graph version pinned. Re-check if Meta bumps from v22.0.)

# Feature Landscape: Meta Direct Integration

**Domain:** Multi-channel messaging SaaS (WhatsApp + Messenger + Instagram) via direct Meta APIs
**Researched:** 2026-03-31
**Overall confidence:** MEDIUM-HIGH (based on official Meta docs, multiple verified sources, and existing codebase analysis)

---

## What Already Exists in MorfX

Before categorizing features, here is what the platform already has:

- **WhatsApp messaging** via 360dialog (text, media, templates, interactive buttons, read receipts)
- **Template management** via 360dialog API (create, list, delete, sync status)
- **Messenger + Instagram messaging** via ManyChat (text, images, tags, flows, custom fields)
- **ChannelSender abstraction** (`src/lib/channels/`) with registry pattern -- WA/FB/IG each have a sender
- **Webhook processing** with signature verification (separate endpoints for WA and ManyChat)
- **Cost tracking** for WhatsApp messages (`cost-utils.ts` with per-category Colombia rates)
- **Multi-workspace isolation** -- each workspace has own API keys, contacts, conversations
- **AI Agent (Somnio)** responds on all 3 channels via unified engine
- **24h window management** -- falls back to template messages when window expires

The migration to direct Meta APIs is about **replacing the transport layer** (360dialog/ManyChat) while keeping the application layer intact.

---

## Table Stakes

Features users expect. Missing = product cannot function or loses parity with current 360dialog/ManyChat setup.

### 1. Embedded Signup / Client Onboarding

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Meta Embedded Signup v4 flow | Only way for clients to connect their WABA/FB/IG without manual config. Standard for tech providers. | HIGH | Requires Facebook App review, Meta Tech Provider enrollment, OAuth 2.0 token exchange. v4 (Dec 2025) supports WA + Messenger + IG in single flow. |
| WABA + phone number creation during signup | Client gets WhatsApp Business Account auto-created and phone number registered | MEDIUM | Part of Embedded Signup flow. Meta handles the UI. Your app receives tokens via callback. |
| Phone number verification (SMS/voice) | Required to activate a WA number on Cloud API | LOW | Meta handles this within their Embedded Signup UI. Your app just stores the result. |
| Token storage per workspace | Each workspace needs System User Access Token + WABA ID + Phone Number ID | MEDIUM | Replace current per-workspace `360dialog_api_key` with `meta_access_token` + `waba_id` + `phone_number_id`. Long-lived tokens but can expire -- need refresh logic. |
| Webhook auto-subscription | App must be subscribed to each WABA to receive messages | MEDIUM | POST to `/{WABA_ID}/subscribed_apps` after signup. CRITICAL: without this, webhooks silently fail. Known as "Shadow Delivery" problem. |

**Embedded Signup Implementation Details (MEDIUM confidence):**
- Config needed: `WHATSAPP_APP_ID`, `WHATSAPP_CONFIGURATION_ID`, `WHATSAPP_APP_SECRET`
- Flow: Client clicks "Connect WhatsApp" -> Facebook Login popup -> selects/creates Business Manager -> creates WABA -> verifies phone -> callback returns access token
- 360dialog currently handles this via their Partner Hub. Going direct means MorfX owns the entire onboarding flow.
- Chatwoot (open source) has a reference implementation of this flow.

### 2. WhatsApp Cloud API Core Messaging

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Send text messages | Basic messaging. Already built for 360dialog. | LOW | API payload is nearly identical. Change base URL from `waba-v2.360dialog.io` to `graph.facebook.com/v21.0`. Change auth header from `D360-API-KEY` to `Authorization: Bearer {token}`. |
| Send media (image, video, audio, document, sticker) | Already built. Must maintain parity. | LOW | Same payload format. Media URL handling simpler (no 360dialog CDN proxy replacement needed). |
| Send template messages | Required for outbound beyond 24h. Already built. | LOW | Same payload structure. Templates managed via Graph API instead of 360dialog-specific endpoint. |
| Send interactive messages (buttons, lists) | Already built. Must maintain parity. | LOW | Same payload format. 360dialog was already proxying Cloud API. |
| Receive webhooks (messages + status updates) | Core inbound flow. Already built. | MEDIUM | Payload format is identical (360dialog proxied Cloud API webhooks). **Major change:** single webhook endpoint serves ALL workspaces. Must route by `phone_number_id`. |
| Media download | Already built with 360dialog proxy. | LOW | Direct from Graph API: GET `/{media_id}` with Bearer token. Simpler than current 360dialog CDN proxy workaround. |
| Read receipts | Already built. | LOW | Same API call structure. |

### 3. WhatsApp Template Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Create templates via API | Already built via 360dialog. Must maintain. | LOW | Graph API: POST `/{WABA_ID}/message_templates`. Nearly identical payload to current `createTemplate360`. |
| List/sync templates | Already built. Must maintain. | LOW | GET `/{WABA_ID}/message_templates`. Paginated response. |
| Delete templates | Already built. Must maintain. | LOW | DELETE `/{WABA_ID}/message_templates?name={name}`. |
| Template status webhooks | Know when Meta approves/rejects | MEDIUM | Subscribe to `message_template_status_update` webhook event. Currently MorfX polls via 360dialog. Push-based is better. |

### 4. Webhook Infrastructure (Architectural Change)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Single webhook endpoint for all workspaces | Meta sends ALL webhooks to ONE URL per app. Must route internally. | HIGH | **Major architectural change.** Currently: 360dialog sends webhooks per-channel (each workspace has own API key). Direct: one endpoint receives messages for ALL clients. Must parse `phone_number_id` / `page_id` / `ig_account_id` from payload to route to correct workspace. |
| Webhook signature verification | Security requirement. Already built for 360dialog. | LOW | Change from 360dialog HMAC to Meta `x-hub-signature-256` using app_secret. Standard pattern. |
| Webhook retry handling | Meta retries on non-200. Must handle idempotently. | MEDIUM | Already have idempotency via `external_message_id`. Meta retries up to 7 times with exponential backoff. Must respond with 200 within 5 seconds. |

### 5. Facebook Messenger Core

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Receive messages from Messenger | Replace ManyChat webhook. Direct from Graph API. | MEDIUM | Subscribe to Page webhooks (`messages`, `messaging_postbacks`). Different payload format from WhatsApp. Need new parser, but same DB storage pattern. |
| Send text messages via Messenger | Replace ManyChat `sendContent`. | LOW | POST to `/{PAGE_ID}/messages` with `messaging_type` + `recipient.id` + `message.text`. |
| Send images/media via Messenger | Replace ManyChat image sending. | LOW | Attachment API: `message.attachment.type = "image"` + `payload.url`. |
| Page-scoped User ID (PSID) resolution | Map Messenger users to contacts. | MEDIUM | Messenger uses PSIDs (Page-Scoped User IDs). Must map PSID -> contact. Currently ManyChat provides `subscriber_id` which abstracts over PSID. |
| 24h messaging window | Messenger has a 24h standard messaging window. | LOW | Similar to WhatsApp. Outside 24h, limited to approved message tags (CONFIRMED_EVENT_UPDATE, POST_PURCHASE_UPDATE, ACCOUNT_UPDATE). |

### 6. Instagram Messaging Core

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Receive DMs from Instagram | Replace ManyChat webhook for IG. | MEDIUM | Subscribe to Instagram webhooks. Different payload format from both WA and Messenger. Need new parser. |
| Send text via IG DM | Replace ManyChat `sendContent` / `addTag` flow for IG. | LOW | POST to `/me/messages` with Instagram-scoped user ID. Max 1000 bytes UTF-8. |
| Send images via IG DM | Replace ManyChat image sending for IG. | LOW | Attachment with image URL. Max 8MB PNG/JPEG. |
| 24h messaging window (HARD limit) | IG has strict 24h window. | LOW (code) / HIGH (UX impact) | Unlike WhatsApp, there is NO way to message IG users after 24h. No templates, no message tags. This is a HARD limitation. Must design UX around this clearly. |

### 7. Channel Sender Swap

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| New WhatsApp sender (Cloud API direct) | Replace 360dialog sender. | LOW | Implement `ChannelSender` interface. Change base URL + auth. Payload is mostly identical. |
| New Messenger sender (Graph API) | Replace ManyChat Facebook sender. | MEDIUM | Implement `ChannelSender` interface. New payload format. PSID as recipient. |
| New Instagram sender (Graph API) | Replace ManyChat Instagram sender. | MEDIUM | Implement `ChannelSender` interface. New payload format. IG-scoped user ID as recipient. |
| Feature flag for gradual migration | Some workspaces on old BSP, some on direct. | MEDIUM | Per-workspace `channel_provider` field: `360dialog` or `meta_direct`. Sender registry checks this. Essential for safe migration. |

---

## Differentiators

Features that provide advantage over using BSPs. Not required for launch but create real value.

### 1. Cost Savings (PRIMARY Differentiator)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Zero BSP markup on WhatsApp | 360dialog charges per-message markup (~$0.005/msg) + monthly fee ($49-199/workspace). Direct = Meta rates only. | LOW (technical) | No code needed. Architectural consequence. At 10K messages/month/workspace, saves ~$100+/mo per client. |
| Zero ManyChat subscription | ManyChat Pro: $15-65/mo per page. Direct Messenger/IG APIs are free. | LOW (technical) | Same. Messenger and IG APIs have no per-message cost from Meta. |
| Transparent billing dashboard | Show clients exact Meta costs vs BSP costs. | MEDIUM | New UI. Query pricing table + usage data. Show savings. Powerful sales tool. |

### 2. WhatsApp Business Profile Management

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Update business profile via API | Set profile photo, about, address, website from MorfX UI. Not available via 360dialog free tier. | LOW | GET/POST `/{PHONE_NUMBER_ID}/whatsapp_business_profile`. Simple CRUD. |
| Phone number quality rating display | Show quality score + messaging limit tier in dashboard. | LOW | GET `/{PHONE_NUMBER_ID}` with `fields=quality_rating,messaging_limit_tier`. |
| Display name management | Change display name (requires Meta review). | LOW | Part of phone number management API. |

### 3. Messenger-Specific Features

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Persistent menu | Always-visible menu in Messenger conversations. Not possible via ManyChat API directly. | LOW | POST to Messenger Profile API with `persistent_menu`. Up to 20 buttons. Requires Get Started button configured first. |
| Handover protocol | Pass conversation between AI agent and human inbox. | MEDIUM | Primary receiver (AI) can pass thread to secondary (human agent) via `/{USER_ID}/pass_thread_control`. Better than current tag-based approach. |
| Quick replies | Suggest response options to user. | LOW | Add `quick_replies` array to message payload. Up to 13 options. |
| Typing indicator | Show "typing..." before AI responds. | LOW | POST `sender_action: "typing_on"`. Better UX. |

### 4. Instagram-Specific Features

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Ice breakers | FAQ questions shown on first DM. Up to 4. | LOW | Configure via API. Great for AI agent conversation starters. Replaces need for ManyChat flow triggers. |
| Generic templates | Rich card messages with image + title + subtitle + buttons. | LOW | Structured cards. Better than plain text for product info. |
| Private replies to comments | Reply privately (via DM) to public post comments. | MEDIUM | Comment webhook trigger -> DM send. Requires `instagram_manage_comments` permission. |
| Story mention replies | Auto-reply when user mentions brand in story. | MEDIUM | Webhook for `story_mentions` -> auto DM. |

### 5. Prepaid Wallet / Billing System

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Workspace credit wallet | Clients pre-pay credits. Messages deduct from balance. Prevents unpaid usage. | HIGH | New subsystem: `wallet_transactions` table, credit/debit logic, balance checks before sending, top-up UI, payment gateway integration. |
| Per-message usage tracking | Track exact Meta cost per delivered template message. | MEDIUM | On delivery webhook (`status: delivered`), calculate cost by category + recipient country. Extends existing `cost-utils.ts`. |
| Low balance alerts | Notify workspace admin when credits below threshold. | LOW | Threshold check + email/in-app notification. |
| Auto-pause on zero balance | Stop sending templates when wallet is empty. | MEDIUM | Pre-send balance check. Must NOT block incoming message processing or free service replies. |

### 6. Number Migration / Porting

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Migrate number from 360dialog | Clients keep their existing number + approved templates + quality rating. | HIGH | Process: disable 2FA on 360dialog -> initiate transfer via Embedded Signup -> verify OTP -> number moves to your WABA. Templates and quality rating migrate automatically. 24-48h downtime risk. |
| Migrate from other BSPs | Support clients coming from Twilio, WATI, etc. | MEDIUM | Same Graph API process. Each BSP has different 2FA disable flow. Document per-BSP instructions. |

### 7. Advanced Webhook Features

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Template status change webhooks | Know instantly when template approved/rejected. Better than current polling. | MEDIUM | Subscribe to `message_template_status_update`. Push notifications to workspace admin. |
| Account status webhooks | Know if client's WABA gets restricted or banned. | LOW | Subscribe to `account_update` webhook event. Critical for compliance monitoring. |
| Messaging limit change notifications | Know when client's messaging tier changes. | LOW | Part of account update webhooks. |

---

## Anti-Features

Features to explicitly NOT build in v1. Common mistakes platforms make.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Custom BSP/reseller layer** | Enormous compliance + legal burden. Meta Tech Provider program has strict requirements for sub-reselling. | MorfX is the tech provider. Clients connect their own accounts. No sub-licensing. |
| **WhatsApp Flows (form builder)** | Complex feature with limited adoption in LATAM e-commerce. High effort, uncertain ROI. | Use interactive messages (buttons, lists) which are already supported. Revisit if demand emerges. |
| **WhatsApp Catalog / Commerce API** | Meta's commerce features are still evolving and LATAM adoption is low. | Continue using Shopify integration. Send product info via templates/messages. |
| **Custom phone number purchasing** | Telecom operation. Regulatory complexity. Out of scope. | Clients bring their own number or get a new one during Embedded Signup (Meta handles this). |
| **Multi-number per workspace** | Adds massive complexity to routing, billing, contacts, conversations. | One WA number per workspace. Multiple numbers = multiple workspaces. Same as current model. |
| **Voice/video calls via WA API** | Completely different product domain. WhatsApp Cloud API calling is new and separate. | Stick to messaging. CRM inbox is text-based. |
| **Meta's Business AI integration** | Meta is rolling out their own AI for business messaging. Would conflict with Somnio agent. | Somnio IS the AI layer. Do not integrate Meta's AI. Keep full control. |
| **Conversation-based billing tracking** | Old model (pre-July 2025) is deprecated. | Implement per-message billing aligned with current Meta pricing model. |
| **WhatsApp Groups API** | Different use case. No CRM value for 1-to-1 customer support/sales. | Ignore completely. |
| **Building custom Embedded Signup UI** | Meta provides the UI via Facebook Login SDK. Don't recreate it. | Use Meta's provided flow. Just handle the OAuth callback and token storage. |
| **WhatsApp Pay integration** | Payment processing within chat. Heavy regulatory requirements, limited to specific countries (India, Brazil). | Use external payment links/Shopify checkout. Not relevant for Colombia market yet. |

---

## Feature Dependencies

```
Embedded Signup v4 (FIRST - enables everything)
  |
  +-> Token + Credential Storage per workspace
  |     |
  |     +-> WA Cloud API Messaging (swap sender)
  |     |     +-> Template Management (Graph API)
  |     |     +-> Media Handling (direct download)
  |     |     +-> Business Profile CRUD
  |     |
  |     +-> FB Page Connection
  |     |     +-> Messenger Messaging (new sender)
  |     |     +-> Persistent Menu
  |     |     +-> Handover Protocol
  |     |
  |     +-> IG Account Connection
  |           +-> Instagram Messaging (new sender)
  |           +-> Ice Breakers
  |           +-> Generic Templates
  |
  +-> Webhook Routing (single endpoint, route by phone/page/ig ID)
        +-> WA inbound messages
        +-> Messenger inbound messages
        +-> IG inbound messages
        +-> Delivery/read status updates
        +-> Template status changes
        +-> Account status updates

Wallet System (INDEPENDENT - can be built in parallel)
  +-> Balance table + transaction log
  +-> Pre-send balance check (hooks into sender)
  +-> Top-up flow (payment gateway)
  +-> Usage dashboard

Feature Flags (PREREQUISITE for safe migration)
  +-> Per-workspace provider selection
  +-> Dual-sender support (old + new in parallel)

Number Migration (LAST - after direct WA is proven stable)
  +-> 360dialog migration guide
  +-> Other BSP migration docs
```

---

## MVP Recommendation

### Phase 1: WhatsApp Direct (replaces 360dialog)

Priority: Must work before any client can be migrated.

1. **Meta App setup + Tech Provider enrollment** -- Facebook App review, permissions, Embedded Signup configuration
2. **Embedded Signup v4 flow** -- Client connects WhatsApp Business Account from MorfX settings page
3. **Token + credential storage** -- New columns in workspace settings or dedicated `meta_connections` table
4. **Webhook routing infrastructure** -- Single endpoint, route by `phone_number_id` to workspace
5. **Cloud API sender** -- Swap `whatsapp-sender.ts` implementation (reuse `ChannelSender` interface)
6. **Template management** -- CRUD via Graph API instead of 360dialog API
7. **Feature flag** -- Per-workspace `whatsapp_provider: '360dialog' | 'meta_direct'` for gradual migration

### Phase 2: Messenger + Instagram Direct (replaces ManyChat)

8. **FB Page + IG Account connection** via Embedded Signup v4 (same flow, additional permissions)
9. **Messenger sender** -- New `ChannelSender` implementation for Graph API
10. **Instagram sender** -- New `ChannelSender` implementation for IG API
11. **Webhook parsers** -- Messenger + IG have different payload formats than WA
12. **Persistent menu + Ice breakers** -- Quick wins, low effort

### Phase 3: Billing + Migration

13. **Wallet system** -- Prepaid credits, per-message tracking, low-balance alerts
14. **Number migration tooling** -- Scripts/guides for moving 360dialog numbers to direct
15. **Billing dashboard** -- Usage visualization, cost comparison

### Defer to post-MVP:

- **Handover protocol** (Messenger): Agent handles escalation via existing patterns
- **Story mention replies** (IG): Nice-to-have
- **Private replies from comments** (IG): Not core inbox
- **Multi-BSP migration automation**: Document-first, automate later
- **Volume tier pricing**: Only relevant at scale

---

## Pricing Model (Current as of July 2025)

Per-message billing for template messages. Critical for wallet system design.

| Category | Description | Cost (Colombia ~) | Charged When |
|----------|-------------|-------------------|--------------|
| Marketing | Promos, product recs | ~$0.0177 USD | Always (every delivered template, even in active window) |
| Utility | Order updates, receipts | ~$0.0064 USD | Only outside 24h service window |
| Authentication | OTPs, verification | ~$0.0064 USD | Always |
| Service | Customer-initiated replies | FREE | Never charged |

**Key billing rules:**
- 24h service window: opens when customer messages. All free-form replies + utility templates = free.
- 72h entry point window: from click-to-WA ads. ALL message types free.
- Utility-in-window: Free. This is a big deal -- order confirmations sent during active conversations cost nothing.
- Marketing-in-window: Still charged. Marketing templates always cost money.
- Volume tiers: Discounts on utility + auth at high monthly volumes. Marketing has no volume discount currently.

**Messenger + Instagram: Zero per-message cost from Meta.** Only your hosting/infrastructure costs.

---

## Complexity Summary

| Feature Area | Complexity | Reason |
|--------------|------------|--------|
| Meta App Setup + Tech Provider | HIGH | Business verification, app review, permissions. Weeks of calendar time (not dev time). |
| Embedded Signup | HIGH | OAuth flow, token exchange, error handling, multiple account types. |
| WA Messaging (swap sender) | LOW | API payloads are nearly identical to 360dialog (which was proxying Cloud API). |
| Webhook Routing | HIGH | Single endpoint for all workspaces. Must be bulletproof. Routing table, idempotency, failure handling, 5-second response requirement. |
| Template Management | LOW | Simple API endpoint swap. Same data model. |
| Messenger Messaging | MEDIUM | New payload format, PSID -> contact mapping, Page-level auth tokens. |
| Instagram Messaging | MEDIUM | New payload format, IG-scoped user IDs, strict 24h hard limit (no templates to reopen). |
| Wallet / Billing | HIGH | New subsystem: transaction log, balance checks, payment integration, alerts, dashboards. |
| Number Migration | HIGH | Multi-step with downtime risk, per-BSP differences, customer communication needed. |
| Business Profile | LOW | Simple CRUD API calls. |
| Persistent Menu / Ice Breakers | LOW | One-time configuration API calls per workspace. |
| Feature Flags / Dual Mode | MEDIUM | Must support old + new providers simultaneously during migration period. |

---

## Sources

### Official Meta Documentation (HIGH confidence)
- [Embedded Signup Overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/)
- [Embedded Signup v4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4/)
- [Embedded Signup v4 Blog Announcement (Dec 2025)](https://developers.facebook.com/blog/post/2025/12/03/simplify-business-onboarding-with-embedded-signup-v4/)
- [Embedded Signup Implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation/)
- [WhatsApp Business Platform Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [Pricing Updates July 2025](https://developers.facebook.com/docs/whatsapp/pricing/updates-to-pricing/)
- [Conversation-Based Pricing (DEPRECATED)](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/conversation-based-pricing/)
- [Messenger Persistent Menu](https://developers.facebook.com/docs/messenger-platform/send-messages/persistent-menu/)
- [Messenger Handover Protocol](https://developers.facebook.com/docs/messenger-platform/handover-protocol/)
- [Instagram Messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/)
- [Instagram Ice Breakers](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/ice-breakers/)
- [Instagram Generic Template](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/generic-template/)
- [WhatsApp Cloud API Webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/)
- [Number Migration via Embedded Signup](https://developers.facebook.com/docs/whatsapp/solution-providers/support/migrating-phone-numbers-among-solution-partners-via-embedded-signup/)
- [WhatsApp Business Accounts](https://developers.facebook.com/documentation/business-messaging/whatsapp/whatsapp-business-accounts/)

### 360dialog Documentation (HIGH confidence -- current BSP)
- [360dialog Embedded Signup](https://docs.360dialog.com/docs/hub/embedded-signup)
- [360dialog Partner Integrated Onboarding](https://docs.360dialog.com/partner/integrations-and-api-development/integration-best-practices/integrated-onboarding)
- [360dialog Tech Provider Program](https://docs.360dialog.com/partner/get-started/tech-provider-program/tech-provider-program-info)

### Third-Party Verified (MEDIUM confidence)
- [Chatwoot WhatsApp Embedded Signup Implementation](https://developers.chatwoot.com/self-hosted/configuration/features/integrations/whatsapp-embedded-signup) -- Reference implementation
- [WhatsApp API Pricing Analysis (Spur)](https://www.spurnow.com/en/blogs/whatsapp-business-api-pricing-explained) -- Detailed pricing breakdown
- [respond.io Cloud API Feature Overview](https://respond.io/blog/whatsapp-cloud-api) -- Feature comparison direct vs BSP
- [Shadow Delivery Webhook Bug (Medium)](https://medium.com/@siri.prasad/the-shadow-delivery-mystery-why-your-whatsapp-cloud-api-webhooks-silently-fail-and-how-to-fix-2c7383fec59f) -- Critical gotcha documented
- [Number Migration Guide (respond.io)](https://respond.io/help/whatsapp/phone-number-migration-to-whatsapp-cloud-api)
- [Number Migration (BoldDesk)](https://support.bolddesk.com/kb/article/17949/migrating-a-phone-number-from-bsp-to-whatsapp-cloud-api)
- [Meta Killing Messenger.com (ChatMaxima)](https://chatmaxima.com/blog/meta-killing-messenger-website-business-messaging/) -- Messenger standalone site deprecated April 2026
- [WhatsApp Pricing Changes (Chat2Desk)](https://chat2desk.com/en/blog/articles/whatsapp-business-api-billing-to-change)

### Codebase Analysis (HIGH confidence)
- `src/lib/channels/types.ts` -- ChannelSender interface (to be preserved, implementations swapped)
- `src/lib/channels/registry.ts` -- Channel routing registry (to be extended with provider check)
- `src/lib/whatsapp/api.ts` -- 360dialog API client (to be replaced with Cloud API direct client)
- `src/lib/whatsapp/templates-api.ts` -- Template CRUD via 360dialog (to be replaced with Graph API)
- `src/lib/whatsapp/cost-utils.ts` -- Cost tracking (to be updated for per-message billing model)
- `src/lib/manychat/api.ts` -- ManyChat API client (to be replaced with direct Messenger + IG clients)
- `src/lib/channels/whatsapp-sender.ts` -- WA sender implementation (to be swapped)
- `src/lib/channels/manychat-sender.ts` -- FB/IG sender implementation (to be replaced)

---
*Research completed: 2026-03-31*

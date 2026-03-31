# Project Research Summary

**Project:** MorfX -- Meta Direct Integration (replace 360dialog + ManyChat)
**Domain:** Multi-channel messaging SaaS -- WhatsApp, Facebook Messenger, Instagram DMs via direct Meta APIs
**Researched:** 2026-03-31
**Confidence:** MEDIUM-HIGH

## Executive Summary

MorfX currently routes all messaging through two intermediaries: 360dialog for WhatsApp and ManyChat for Facebook/Instagram. Direct Meta integration replaces both with a single Meta App using Graph API v22.0, Embedded Signup for client onboarding, and Business Integration System User Access Tokens (BISUATs) for per-workspace API access. The migration is evolutionary, not revolutionary -- 360dialog already proxies Meta's Cloud API, so WhatsApp message payloads are identical. The only changes for WhatsApp are the base URL, auth header, and endpoint path. Messenger and Instagram require new sender implementations with different payload formats but follow the same ChannelSender interface pattern already in place.

The recommended approach is WhatsApp first, then Messenger/Instagram, then billing/migration tooling. This order follows dependency chains (Embedded Signup enables everything) and risk ordering (WhatsApp is the highest-value channel with the most predictable migration path). The existing ChannelSender abstraction, domain layer, and Inngest async processing remain untouched -- the migration is confined to the transport layer. Per-workspace provider flags enable gradual cutover: some workspaces on 360dialog/ManyChat while others run on Meta direct, with no code conflicts.

The top risks are: (1) webhook response time -- Meta requires 200 within 5 seconds or retries flood the system, directly conflicting with MorfX's "always await inngest.send" rule; (2) number migration downtime -- there is no atomic transfer, messages are lost during the handoff window; (3) media URL expiry at 5 minutes, which can race against Inngest queue depth. All three have known mitigations documented in the pitfalls research. The biggest non-technical risk is Meta App Review (2-7 business days, rejection adds more) -- this must be submitted in week 1, not at launch.

## Key Findings

### Recommended Stack

Zero new npm packages required. The entire integration uses native `fetch` for HTTP calls and Node.js `crypto` for HMAC signature validation and AES-256-GCM token encryption -- both already used in the codebase. The Meta JS SDK is loaded via `<script>` tag on the frontend only for Embedded Signup. Inngest, Supabase, domain layer, and ChannelSender interface all remain unchanged.

**Core technologies:**
- **Graph API v22.0 via native fetch**: All messaging, template, and media operations -- same pattern as existing 360dialog calls, just different URL and auth header
- **Node.js crypto (AES-256-GCM)**: Token encryption at rest -- BISUATs never expire but must be encrypted per workspace
- **Meta JS SDK (CDN script)**: Frontend-only for Embedded Signup popup flow -- not an npm dependency
- **Embedded Signup v4**: Client self-service onboarding for WhatsApp + Messenger + Instagram in a single flow

**Critical version requirement:** Graph API v22.0 minimum (enforced since Sep 2025). Pin version in a single constant: `META_GRAPH_API_VERSION = 'v22.0'`.

### Expected Features

**Must have (table stakes):**
- Embedded Signup v4 -- only way for clients to connect WABA/FB/IG without manual config
- WhatsApp Cloud API messaging -- text, media, templates, interactive, read receipts (payloads identical to 360dialog)
- Template CRUD via Graph API -- same operations, different endpoint
- Unified webhook endpoint -- single `/api/webhooks/meta` routes by `object` type to WA/FB/IG handlers
- Webhook signature verification -- same HMAC-SHA256 pattern, use App Secret instead of 360dialog secret
- Per-workspace provider flags -- `whatsapp_provider: 'meta_direct' | '360dialog'` for gradual migration
- Messenger core messaging -- send/receive text and media via Graph API
- Instagram core messaging -- send/receive DMs via Graph API

**Should have (differentiators):**
- Zero BSP markup on WhatsApp -- eliminates 360dialog monthly fee + per-message markup
- Zero ManyChat subscription -- Messenger/IG APIs are free from Meta
- WhatsApp business profile management via API
- Phone number quality rating and messaging tier display
- Template status push webhooks (replace polling)
- Messenger persistent menu and typing indicators
- Instagram ice breakers and generic templates

**Defer (v2+):**
- Prepaid wallet / billing system -- high complexity, independent subsystem
- Number migration tooling -- only after direct WA is proven stable
- Handover protocol for Messenger
- Private replies to Instagram comments and story mentions
- WhatsApp Flows, Catalog/Commerce API, voice/video calls, Groups API, Meta's Business AI

### Architecture Approach

The migration adds a new `src/lib/meta/` module alongside existing `src/lib/whatsapp/` and `src/lib/manychat/`, with new ChannelSender implementations registered in the existing registry. A new `workspace_meta_accounts` table stores encrypted tokens and account identifiers (phone_number_id, page_id, ig_account_id) with unique constraints for fast webhook-to-workspace resolution. Both old and new webhook endpoints coexist -- no existing routes are modified or removed until full migration is complete.

**Major components:**
1. **`src/lib/meta/`** -- Graph API client, token encryption, credentials resolution, webhook router, channel-specific handlers, template/media operations, Embedded Signup backend
2. **`src/lib/channels/meta-*-sender.ts`** -- Three new ChannelSender implementations (WhatsApp, Messenger, Instagram) registered in the existing registry with provider-aware routing
3. **`/api/webhooks/meta/route.ts`** -- Unified webhook endpoint that demultiplexes by `payload.object` type and resolves workspace via account identifier lookup
4. **`workspace_meta_accounts` table** -- Per-workspace encrypted credentials with indexes for O(1) webhook resolution by phone_number_id/page_id/ig_account_id
5. **Settings UI with Embedded Signup** -- Facebook JS SDK popup flow, token exchange, webhook subscription, connection status display

### Critical Pitfalls

1. **Webhook 200 response timeout (CRITICAL)** -- Meta retries if response takes >5 seconds, causing duplicate message floods. Return 200 immediately with zero processing. This directly conflicts with MorfX's "always await inngest.send" rule -- resolve with a lightweight buffer pattern (Supabase insert or unawaited send with dead-letter fallback). Idempotency via message_id dedup is mandatory.

2. **Number migration downtime (CRITICAL)** -- No atomic transfer between BSPs. Messages lost during handoff (minutes to hours). Schedule during lowest traffic (2-4 AM Colombia), test on non-production number first, coordinate pre-release with 360dialog support.

3. **Silent token expiry (CRITICAL)** -- BISUATs theoretically never expire but can be invalidated by Meta security events, business verification lapses, or admin actions. Outbound dies silently while inbound webhooks keep arriving. Implement Inngest cron health check every 5 minutes + alert on any 401/403 from Meta API.

4. **Media URL 5-minute expiry (HIGH)** -- Customer sends image, URL expires before async processing picks it up. Need a dedicated high-priority Inngest function that downloads media within 60 seconds and re-uploads to Supabase Storage.

5. **Single webhook endpoint for all tenants (HIGH)** -- Every workspace's messages hit one URL. Routing must be O(1) via cached phone_number_id-to-workspace lookup. Bug in routing = cross-tenant data leak.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Meta App Setup and Foundation
**Rationale:** Everything depends on having a registered Meta App with approved permissions. App Review takes 2-7 business days -- submit immediately. Foundation code (token encryption, credentials table, types) has zero external dependencies and unblocks all subsequent phases.
**Delivers:** Meta App with approved permissions, `workspace_meta_accounts` migration, token encryption module, Graph API client wrapper, credential resolution functions, type definitions.
**Addresses:** Meta App configuration, business verification, Tech Provider enrollment.
**Avoids:** Pitfall 15 (App Review delays) by submitting in week 1. Pitfall 3 (App Secret exposure) by establishing server-only env var patterns from day one.

### Phase 2: Embedded Signup and WhatsApp Inbound
**Rationale:** Embedded Signup is the gateway -- no workspace can use Meta direct without completing it. Inbound webhooks must work before outbound (otherwise you connect a workspace but can't receive messages). WhatsApp inbound reuses 90% of existing webhook-handler.ts logic since payloads are identical.
**Delivers:** Settings UI with "Connect WhatsApp" button, Facebook JS SDK integration, OAuth token exchange endpoint, webhook subscription, unified `/api/webhooks/meta` endpoint with WhatsApp handler, workspace resolution by phone_number_id.
**Addresses:** Embedded Signup, webhook infrastructure, WhatsApp inbound messaging.
**Avoids:** Pitfall 1 (slow 200) by designing return-immediately-then-process from the start. Pitfall 8 (phantom channels) by implementing proper two-step webhook subscription and "pending review" status. Pitfall 13 (raw body for HMAC) by reading `request.text()` before parsing.

### Phase 3: WhatsApp Outbound and Templates
**Rationale:** With inbound working, add outbound to complete the WhatsApp loop. Sender swap is low-risk because payloads are identical to 360dialog. Template management is a simple endpoint swap. Per-workspace provider flag enables the first real migration test.
**Delivers:** `meta-whatsapp-sender.ts` ChannelSender, provider-aware registry, per-workspace `whatsapp_provider` flag, template CRUD via Graph API, media download/upload via Meta CDN, feature flag for gradual migration.
**Addresses:** WhatsApp Cloud API messaging, template management, channel sender swap, feature flags.
**Avoids:** Pitfall 7 (template category mismatch) by building pre-submission validation. Pitfall 6 (media URL expiry) by implementing fast-track download. Pitfall 12 (rate limits) by designing send queue with throughput awareness.

### Phase 4: Messenger Direct
**Rationale:** With WhatsApp proven stable, extend to Messenger. Different payload format but same ChannelSender pattern. FB Page connection via same Embedded Signup v4 flow (additional permissions). PSID-to-contact mapping is new logic.
**Delivers:** Facebook Page connection UI, Messenger webhook handler, `meta-facebook-sender.ts`, PSID-to-contact resolution, persistent menu configuration, typing indicators.
**Addresses:** Messenger core messaging, page-scoped user ID resolution, persistent menu, quick replies.
**Avoids:** Pitfall 5 (routing) by extending the already-proven webhook router from Phase 2.

### Phase 5: Instagram Direct
**Rationale:** Instagram has the strictest limitations (hard 24h window, no templates, 200 msg/hr rate limit, 1000 follower minimum). Build last so the team understands messaging window patterns from WA and Messenger experience.
**Delivers:** IG account connection UI, Instagram webhook handler, `meta-instagram-sender.ts`, IG-scoped user resolution, ice breakers, clear "window expired" UX.
**Addresses:** Instagram core messaging, ice breakers, generic templates, window management.
**Avoids:** Pitfall 11 (IG 24h hard limit) by building explicit per-channel window tracking. Must handle UNSUPPORTED webhook types gracefully.

### Phase 6: Billing, Migration, and Cleanup
**Rationale:** Wallet system is independent and not blocking. Number migration is inherently risky and should only happen after direct integration is battle-tested. Cleanup removes 360dialog/ManyChat code paths once all workspaces migrate.
**Delivers:** Prepaid wallet system (optional), number migration tooling, per-BSP migration guides, billing dashboard, cost comparison analytics, legacy code removal.
**Addresses:** Wallet/billing, number migration, cost savings visibility.
**Avoids:** Pitfall 2 (migration downtime) by having proven stable direct integration before transferring numbers. Pitfall 14 (pricing model) by implementing per-message tracking aligned with July 2025 model.

### Phase Ordering Rationale

- **Foundation first (Phase 1)** because App Review is calendar-blocked (2-7+ days) and everything depends on it.
- **Inbound before outbound (Phase 2 before 3)** because a connected workspace that can't receive messages is worse than one that can't send -- you lose customer messages silently.
- **WhatsApp before FB/IG (Phases 2-3 before 4-5)** because WhatsApp is the highest-value channel, has the most predictable migration (identical payloads), and represents the core use case for all MorfX clients.
- **Instagram last among channels (Phase 5)** because it has the most restrictions and lowest volume -- lessons learned from WA and Messenger inform the implementation.
- **Migration last (Phase 6)** because moving production numbers is irreversible with downtime risk -- only after direct integration is proven.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Embedded Signup):** Complex OAuth flow with multiple edge cases (phone in review, short-lived token exchange, two-step webhook subscription). Reference Chatwoot's open-source implementation. MEDIUM confidence -- needs hands-on validation.
- **Phase 4 (Messenger):** LOW confidence on Messenger API specifics. PSID lifecycle, page token management, and 24h window behavior with message tags need per-plan research.
- **Phase 5 (Instagram):** LOW confidence on IG DM API. Scoped user IDs, follower requirements, UNSUPPORTED message types, and interaction with Instagram app replies need per-plan research.
- **Phase 6 (Number Migration):** HIGH risk, needs detailed per-BSP coordination research. 360dialog release process, SMS verification, and template migration behavior partially documented.

Phases with standard patterns (skip deep research):
- **Phase 1 (Foundation):** Well-documented -- token encryption is standard crypto, table schema is straightforward, Graph API version pinning is trivial.
- **Phase 3 (WhatsApp Outbound):** HIGH confidence -- payloads identical to 360dialog, ChannelSender pattern is established, template API is a simple endpoint swap.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies. Graph API v22.0 verified via official changelog. Raw fetch pattern proven with 360dialog. |
| Features | MEDIUM-HIGH | WhatsApp features HIGH (identical to current). Messenger/IG MEDIUM (different payload formats, less team experience). Wallet needs design. |
| Architecture | HIGH | ChannelSender interface, domain layer, Inngest patterns proven. Evolutionary migration path clear. workspace_meta_accounts schema well-designed. |
| Pitfalls | MEDIUM-HIGH | Critical pitfalls well-documented across multiple sources. MorfX-specific compounding risks identified (inngest await conflict, serverless constraints). Some theoretical until tested. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Inngest await conflict:** MorfX rule says "always await inngest.send" but webhook must return 200 in <5s. Need to decide on buffer pattern during Phase 2 planning: unawaited send with dead-letter? Supabase insert as buffer? Accept the risk for webhook handlers specifically?
- **Messenger/Instagram API specifics:** LOW confidence on FB/IG payload formats, Page Access Token lifecycle, and PSID/IG-scoped-ID resolution. Needs per-phase research during Phases 4-5.
- **Meta certificate authority change (March 2026):** Meta is switching webhook TLS CA. Vercel likely handles this, but must verify before go-live.
- **Embedded Signup v4 edge cases:** Phone number "In Review" period (24-48h), failed SMS verification, business manager conflicts. Needs test-driven validation during Phase 2.
- **Test vs production number differences:** Meta test numbers have different rate limits and webhook behavior. QA must include real number testing.

## Sources

### Primary (HIGH confidence)
- [Meta Graph API Changelog v22.0](https://developers.facebook.com/docs/graph-api/changelog/version22.0/)
- [Meta Embedded Signup Overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/)
- [Meta Embedded Signup v4 (Dec 2025)](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4/)
- [Meta Access Tokens Guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/)
- [Meta WhatsApp Cloud API Webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/)
- [Meta WhatsApp Pricing (July 2025)](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [Meta WhatsApp Messaging Limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)
- [Meta Messenger Send API](https://developers.facebook.com/docs/messenger-platform/reference/send-api/)
- [Meta Instagram Messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/)
- [Meta Tech Provider Program](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers)

### Secondary (MEDIUM confidence)
- [Chatwoot Embedded Signup Implementation](https://developers.chatwoot.com/self-hosted/configuration/features/integrations/whatsapp-embedded-signup)
- [360dialog Embedded Signup Docs](https://docs.360dialog.com/docs/hub/embedded-signup)
- [Shadow Delivery Webhook Bug (Medium)](https://medium.com/@siri.prasad/the-shadow-delivery-mystery-why-your-whatsapp-cloud-api-webhooks-silently-fail-and-how-to-fix-2c7383fec59f)
- [Hookdeck WhatsApp Webhooks Guide](https://hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks-features-and-best-practices)
- [respond.io Cloud API Feature Overview](https://respond.io/blog/whatsapp-cloud-api)

### Tertiary (LOW confidence)
- [Chatarmin WhatsApp API Status 2026](https://chatarmin.com/en/blog/meta-whats-app-api-status)
- [Meta Business Integration Prototype (GitHub)](https://github.com/RadithSandeepa/meta-business-integration-prototype)

### Codebase Analysis (HIGH confidence)
- `src/lib/channels/types.ts` -- ChannelSender interface preserved
- `src/lib/channels/registry.ts` -- Extended with provider-aware routing
- `src/lib/whatsapp/api.ts` -- 360dialog client, payloads identical to Cloud API
- `src/lib/whatsapp/webhook-handler.ts` -- Cloud API payload parser, 90% reusable
- `src/lib/manychat/api.ts` -- ManyChat client, to be replaced
- `src/lib/domain/messages.ts` -- Domain layer unchanged

---
*Research completed: 2026-03-31*
*Ready for roadmap: yes*

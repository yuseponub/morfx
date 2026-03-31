# Domain Pitfalls: Meta Direct API Integration

**Domain:** Replacing 360dialog (WhatsApp) and ManyChat (FB/IG) with direct Meta Cloud API / Graph API
**Researched:** 2026-03-31
**Confidence:** MEDIUM-HIGH (WebSearch verified against multiple authoritative sources; official docs pages failed to render but cross-referenced with Meta developer blog posts and community implementations)
**Context:** MorfX SaaS — Vercel serverless (60s max), Supabase, Inngest async, multi-tenant, first direct Meta integration for this team

---

## Critical Pitfalls

Mistakes that cause message loss, extended downtime, or require architectural rework.

---

### Pitfall 1: Webhook Endpoint Returns 200 Too Slowly — Meta Retries and Duplicates Flood System

**Severity:** CRITICAL
**Phase:** Webhook Infrastructure (Phase 1-2)

**What goes wrong:** Meta requires your webhook endpoint to respond with HTTP 200 within approximately 5 seconds. If your endpoint does any processing before responding (DB lookup, agent call, Inngest dispatch with await), it exceeds the timeout. Meta assumes delivery failed and retries with exponential backoff for up to 36 hours. Your system processes the same message 2-10 times, sending duplicate bot responses.

**Why it happens:** MorfX has a known history of this exact pattern. The 360dialog webhook currently does inline processing. When migrating to Meta's direct webhooks, developers instinctively add "just a quick DB check" before the 200 response, pushing response time past 5 seconds.

**Consequences:**
- Duplicate messages to customers (brand damage)
- Duplicate Inngest events creating parallel agent runs
- If success rate falls below 95%, Meta throttles delivery or DISABLES the webhook entirely
- Meta retries for up to 36 hours — you can get a flood of stale messages hours later

**Prevention:**
- Return HTTP 200 IMMEDIATELY, before any processing. Zero DB calls, zero awaits.
- Enqueue the raw payload to Inngest (or a queue) asynchronously. The Inngest `send()` must NOT be awaited in the response path — but this contradicts MorfX's existing rule "NEVER fire-and-forget inngest.send". Resolution: use a lightweight queue (Redis list, Supabase insert) as a buffer, then have an Inngest cron drain it. OR accept the small risk of `inngest.send()` without await specifically for webhook handlers, with a dead-letter fallback.
- Implement idempotency: store `message_id` in a dedup table (Redis with TTL or Supabase) and skip processing if already seen.

**Detection:**
- Monitor webhook response times (must be <2s, target <500ms)
- Monitor for duplicate `message_id` values in inbound messages table
- Meta provides webhook health metrics in the App Dashboard

**MorfX-specific risk:** HIGH. Team already experienced a 20h message loss incident from a similar architectural mistake. This is the single most likely failure mode.

---

### Pitfall 2: Number Migration Causes Downtime Window — Messages Lost During Transfer

**Severity:** CRITICAL
**Phase:** Migration (Late phase)

**What goes wrong:** When migrating a phone number from 360dialog (BSP) to your direct Cloud API WABA, there is a handoff period where:
1. You must disable two-step verification (2FA) on the old BSP
2. The number must be "released" by 360dialog
3. You register the number on your WABA and verify via SMS/call code
4. Webhook subscription must be configured on the new WABA

During steps 2-4 (which can take minutes to hours), inbound messages to that number are LOST — they go to neither the old BSP nor the new WABA.

**Why it happens:** There is no atomic migration. The number exists on exactly one WABA at a time, and during transfer it briefly exists on none.

**Consequences:**
- Customer messages lost during migration window (minutes to hours)
- If 360dialog is slow to release, the window extends
- If SMS verification fails (number can't receive SMS), migration stalls entirely
- Templates migrate with UNKNOWN quality rating, potentially throttling sends for 24h

**Prevention:**
- Schedule migration during lowest-traffic window (e.g., 2-4 AM Colombia time)
- Have 360dialog pre-release the number (coordinate via their support)
- Test the entire migration flow on a NON-PRODUCTION number first
- Have fallback: keep 360dialog active for other numbers during gradual migration
- Pre-approve all templates on the new WABA before migration (don't rely on template migration)
- Warn clients about 15-30 minute expected downtime window

**Detection:**
- Monitor inbound message count — any sudden drop to zero during migration = problem
- Have a test sender ready to verify messages flow through new webhook immediately after migration

---

### Pitfall 3: App Secret Exposure in Client-Side Code or Logs

**Severity:** CRITICAL
**Phase:** Auth/Token Infrastructure (Phase 1)

**What goes wrong:** The App Secret is used for: (1) webhook HMAC signature validation, (2) exchanging short-lived tokens for long-lived tokens, (3) generating app access tokens. If exposed, an attacker can: forge webhook payloads, obtain access tokens, and send messages as any WABA connected to your app.

**Why it happens:** Developer stores App Secret in a client-accessible environment variable (e.g., `NEXT_PUBLIC_*`), logs it during debugging, or commits it to git. In multi-tenant setups, there's only ONE App Secret for the entire platform — compromising it compromises ALL tenants.

**Consequences:**
- Full platform compromise (all tenants' WABAs)
- Attacker can send messages, read conversations, modify templates
- Meta can suspend your entire app

**Prevention:**
- App Secret ONLY in server-side environment variables (never `NEXT_PUBLIC_*`)
- Webhook signature validation uses `crypto.timingSafeEqual` (prevents timing attacks)
- Validate against RAW request body (before JSON parsing middleware)
- Rotate App Secret if any suspected exposure (requires updating all webhook validation)
- Note: Meta uses escaped Unicode in payloads when generating signatures — your HMAC must compute against the exact raw bytes, not parsed-and-re-serialized JSON

**Detection:**
- Grep codebase for App Secret value or variable name in client files
- Audit Vercel environment variable configuration (ensure no `NEXT_PUBLIC_` prefix)

---

### Pitfall 4: System Token Expires and Nobody Notices — Silent Message Failure

**Severity:** CRITICAL
**Phase:** Token Management (Phase 1-2)

**What goes wrong:** WhatsApp Cloud API uses System User tokens for API calls. User tokens from Embedded Signup are SHORT-LIVED (expire in hours). Even "permanent" System User tokens can be invalidated by: Meta app review changes, business verification lapses, admin removing the system user, or Meta security events. When the token expires, ALL API calls fail silently — outbound messages stop, but inbound webhooks still arrive (they don't use the token). Your system processes inbound messages and queues responses, but the send calls fail.

**Why it happens:** Teams test with a fresh token, everything works for weeks/months. No monitoring on token validity. The system appears healthy because webhooks still arrive.

**Consequences:**
- Bot "goes silent" — processes messages but can't respond
- Customers wait for replies that never come
- Can persist for hours/days if no alerting

**Prevention:**
- Use System User tokens (not user tokens) for production — they don't expire under normal conditions
- During Embedded Signup: exchange the short-lived user token for a System User token immediately
- Implement token health check: periodic (every 5 min) lightweight API call (e.g., GET the WABA) to verify token validity
- Alert on ANY 401/403 from Meta API — treat as P0 incident
- Store token encrypted in DB, not just env vars (env vars require redeploy to update)
- Build admin UI to rotate tokens without redeploy

**Detection:**
- Monitor outbound message success rate (should be >95%)
- Alert on 3 consecutive failed sends
- Daily token validation cron job

---

## High Pitfalls

Mistakes that cause degraded service, customer complaints, or significant rework.

---

### Pitfall 5: Single Webhook Endpoint for All WABAs — Routing Nightmare

**Severity:** HIGH
**Phase:** Webhook Infrastructure (Phase 1-2)

**What goes wrong:** Meta sends ALL webhooks for ALL WABAs connected to your app to a SINGLE webhook URL. In a multi-tenant SaaS with 50+ clients, every inbound message, status update, and error for every client hits the same endpoint. You must demultiplex based on the phone_number_id or WABA ID in the payload. If your routing logic has a bug, messages go to the wrong tenant.

**Why it happens:** This is Meta's architecture — one app, one webhook URL. Unlike 360dialog which provides per-number webhook URLs, you must build the routing layer yourself.

**Consequences:**
- Cross-tenant data leak (messages routed to wrong workspace)
- Performance bottleneck if routing involves DB lookup per message
- If webhook endpoint goes down, ALL tenants lose messages simultaneously

**Prevention:**
- Build a phone_number_id-to-workspace_id lookup cache (Redis or in-memory with TTL)
- Warm the cache on startup and after Embedded Signup completion
- Log and reject any webhook with an unrecognized phone_number_id (don't silently drop)
- The routing lookup must be O(1) — cache hit, not DB query per webhook
- Consider: Inngest event routing by including workspace_id in the event key

**Detection:**
- Monitor for "unroutable" webhooks (phone_number_id not in cache)
- Audit logs: verify message.workspace_id matches phone_number.workspace_id

---

### Pitfall 6: Media URLs Expire in 5 Minutes — Attachments Silently Lost

**Severity:** HIGH
**Phase:** Media Handling (Phase 2-3)

**What goes wrong:** When a customer sends an image/video/document, the webhook includes a `media_id`. You call GET `/{media_id}` to get a download URL. That URL expires in 5 minutes. If your async processing pipeline (Inngest) has any delay, the URL expires and the media is gone. Additionally, 5 failed requests to the `/media` endpoint in one hour blocks that phone number's media access for 1 hour.

**Why it happens:** Inngest processing can be delayed by queue depth, concurrency limits, or rate limiting. A message received at 3:00:00 might not be processed until 3:07:00 — the media URL is already dead.

**Consequences:**
- Customer sends photo of product/document, bot never sees it
- Repeated download failures trigger Meta's rate limit, blocking ALL media downloads for that number for 1 hour
- Media stored on Meta's servers for only 14 days after last use

**Prevention:**
- Download media IMMEDIATELY in the webhook handler (before the 200 response? NO — this contradicts Pitfall 1). Instead: use a dedicated fast-track Inngest function with high priority that downloads media within 60 seconds of receipt
- Download media and re-upload to your own storage (Supabase Storage or S3) immediately
- Store the `media_id` AND your own storage URL — never rely on Meta's URL for later retrieval
- Implement retry with exponential backoff for download failures (but max 3 retries within the 5-min window)
- Auth header required: `Authorization: Bearer {system_user_token}` for media download

**Detection:**
- Monitor media download success rate
- Alert on media download latency >3 minutes (leaves only 2-min window)
- Track "media referenced but never downloaded" count

---

### Pitfall 7: Template Category Mismatch — Rejected or Reclassified by Meta

**Severity:** HIGH
**Phase:** Template Management (Phase 2-3)

**What goes wrong:** Meta strictly enforces template categories (MARKETING, UTILITY, AUTHENTICATION). If you submit a template as UTILITY but Meta detects promotional content, they either reject it or reclassify it to MARKETING (with higher cost). Since July 2025, pricing is per-message (not per-conversation), so miscategorization directly impacts cost. Repeated violations can restrict your ability to submit templates.

**Why it happens:** The line between "utility" and "marketing" is blurry. "Your order has shipped! Check out our new collection" = marketing, not utility. Meta's automated review catches keywords.

**Common rejection reasons:**
- Variable parameters with mismatched or non-sequential curly braces (`{{1}}`, `{{2}}`, `{{4}}` — missing `{{3}}`)
- Variables containing special characters (`#`, `$`, `%`)
- Template starts or ends with a variable
- URL shorteners (obscure destination)
- Excessive capitalization or emoji in headers
- Content identical to an existing template
- Spelling/grammar errors (deemed untrustworthy)

**Prevention:**
- Build template validation in your UI BEFORE submission to Meta API
- Validate sequential variable numbering, no special chars in variables
- No URL shorteners — use full URLs
- Clear category selection guidance in UI with examples
- Test template approval on a staging WABA before production

**Detection:**
- Monitor template rejection rate
- Alert when a template is reclassified (category changes after submission)

---

### Pitfall 8: Embedded Signup — Two-Step Process Creates Phantom Channels

**Severity:** HIGH
**Phase:** Onboarding/Embedded Signup (Phase 2)

**What goes wrong:** Embedded Signup has a critical two-step webhook subscription requirement: you must (1) subscribe your app to the WABA first, then (2) set the webhook callback URL. If you try to do both in one API call, you get error #100. Additionally, after signup, phone numbers enter a "In Review" period (24-48h) during which the channel appears disconnected. The user token from Embedded Signup is SHORT-LIVED and must be exchanged immediately.

**Why it happens:** Meta's OAuth flow returns a short-lived user token. Developers store it and try to use it days later. Or they assume the signup is complete when the OAuth callback fires, but the phone number is still in review.

**Consequences:**
- Channel shows "connected" in your UI but messages don't flow (phone in review)
- Token expires within hours, all API calls fail
- Webhook subscription not properly configured — inbound messages never arrive
- Client thinks onboarding succeeded, starts sending messages to customers, gets errors

**Prevention:**
- On OAuth callback: (1) exchange user token for System User token IMMEDIATELY, (2) subscribe app to WABA, (3) set webhook callback, (4) mark channel as "pending review" not "active"
- Show clear status in UI: "Phone number under review by Meta (24-48h)"
- Implement a verification check: after signup, periodically poll phone number status until approved
- Store both the WABA ID and phone_number_id — you need both for different API calls

**Detection:**
- Monitor channels with "pending" status >48h (escalate to Meta support)
- Verify webhook subscription is active after each Embedded Signup

---

### Pitfall 9: Graph API Version Deprecation — Endpoint Stops Working Overnight

**Severity:** HIGH
**Phase:** Infrastructure/Maintenance (Ongoing)

**What goes wrong:** Meta releases new Graph API versions quarterly (v22, v23, v24, v25...). Each version is supported for approximately 2 years before deprecation. When a version is deprecated, API calls using that version return errors. Starting September 2025, Meta enforced minimum version v22.0. If your integration hardcodes an API version and you miss the deprecation notice, your entire integration breaks.

**Why it happens:** Team builds integration against v22.0, it works, nobody updates for 18 months. Deprecation email goes to an unmonitored inbox. One day, all API calls fail.

**Consequences:**
- Complete outbound messaging failure for all tenants
- Inbound webhooks may also break if webhook subscription was version-specific
- Emergency scramble to update version across all API calls

**Prevention:**
- Centralize API version in ONE constant: `const META_API_VERSION = 'v22.0'`
- Create a calendar reminder for Meta's quarterly releases
- Subscribe to Meta Developer changelog (RSS/email)
- Build version negotiation: test new version in staging, update constant, deploy
- Plan to update API version at least once per year

**Detection:**
- Monitor for HTTP 400 errors with "version deprecated" in response
- Quarterly check: is our API version still in the supported list?

---

### Pitfall 10: Unverified Business — 250 Message Limit Blocks Production Use

**Severity:** HIGH
**Phase:** Onboarding (Phase 1-2)

**What goes wrong:** Each client's business must be "verified" by Meta to send more than 250 business-initiated messages per 24 hours. Verification requires legal business documents and takes 2-10 business days. New clients on your platform can't message at production scale until verified. Since October 2025, limits are per Business Portfolio (not per number), so ALL numbers under an unverified business share the 250 limit.

**Why it happens:** Team assumes Meta verification from the 360dialog era transfers. It doesn't always. Or new client onboards, sends their first campaign to 300 contacts, and 50 messages fail with a cryptic limit error.

**Consequences:**
- Client can't use the platform effectively until verified
- Campaign sends partially — 250 succeed, rest fail silently
- Client blames your platform, not Meta's verification requirement
- Unverified accounts limited to 2 phone numbers max

**Prevention:**
- Make business verification a REQUIRED step in onboarding UI
- Show verification status prominently in dashboard
- Block campaign sends (or show warning) for unverified businesses
- Guide clients through verification with step-by-step instructions
- Check verification status via API: `GET /{business_id}?fields=verification_status`

**Detection:**
- Dashboard badge showing verification status per workspace
- Alert when send fails with messaging limit error

---

## Moderate Pitfalls

Mistakes that cause delays, confusion, or technical debt.

---

### Pitfall 11: Instagram 24h Window Is Stricter — No Template Messages Outside Window

**Severity:** MEDIUM
**Phase:** Instagram Integration (Phase 3+)

**What goes wrong:** Unlike WhatsApp (where you can send template messages anytime), Instagram only allows messaging users who initiated conversation in the last 24 hours. There are NO template messages on Instagram. The HUMAN_AGENT tag extends the window to 7 days, but only for human agents (not bots). After the window closes, you CANNOT message the user at all until they message you again.

**Why it happens:** Team assumes Instagram messaging works like WhatsApp with templates as a fallback. It doesn't. Instagram has no concept of "template messages" for re-engagement.

**Additional Instagram quirks:**
- Rate limit: 200 messages per hour per account (vs WhatsApp's 80/second)
- Cannot initiate conversations — user must message first
- 1,000 follower minimum for DM API access
- Voice messages, IGTV/Reels shares, and private account media shares arrive as UNSUPPORTED webhook type
- If you also use the Instagram app/website to reply, the API doesn't "see" those messages but receives replies to them — state mismatch

**Prevention:**
- Build separate messaging window logic for each channel (WhatsApp vs IG vs Messenger)
- For Instagram: clearly show "window expired" in agent UI, disable reply button
- Don't promise clients "we can follow up via Instagram" — you can't outside the window
- Handle UNSUPPORTED webhook types gracefully (log, don't crash)

**Detection:**
- Monitor Instagram send failure rate (will spike when sending outside window)
- Track average response time — must be <24h for Instagram to maintain engagement capability

---

### Pitfall 12: Rate Limits Differ Per Context — Easy to Hit During Campaigns

**Severity:** MEDIUM
**Phase:** Messaging Infrastructure (Phase 2)

**What goes wrong:** There are multiple overlapping rate limits:
- **API request rate:** 200 req/hr per app per WABA (default), 5000 req/hr for active WABAs
- **Message throughput:** 80 messages/second per phone number (upgradeable)
- **Per-user rate:** 1 message per 6 seconds to the same user (error 131056)
- **Marketing frequency cap:** 2 marketing templates per user per 24h
- **Media download:** 5 failed attempts per hour blocks media for that number for 1 hour

A campaign sending to 10,000 contacts can easily hit the API request rate limit if you also have normal conversation traffic using the same WABA.

**Why it happens:** Developer tests with 10 messages — works fine. Campaign sends 10,000 — hits multiple limits simultaneously. Rate limit errors are transient but can cascade.

**Consequences:**
- Campaign sends partially, with random failures
- Normal conversation traffic slowed during campaign
- Error 131056 (per-user rate) confused with other errors

**Prevention:**
- Implement send queue with rate limiting (respect 80 msg/sec per number)
- Separate campaign traffic from conversation traffic in the queue (priority levels)
- Track per-WABA request count and throttle before hitting limit
- For campaigns: use Inngest step.sleep() to pace sends
- Never send >2 marketing templates to same user in 24h

**Detection:**
- Monitor for error codes: 131056 (per-user), 429 (API rate), 131048 (spam rate limit)
- Dashboard showing current rate utilization per WABA

---

### Pitfall 13: Webhook Signature Must Use Raw Body — JSON Middleware Breaks Validation

**Severity:** MEDIUM
**Phase:** Webhook Infrastructure (Phase 1)

**What goes wrong:** Meta computes HMAC-SHA256 of the exact raw request body bytes and sends it in `X-Hub-Signature-256`. If your framework (Next.js App Router) parses the JSON body before you can access the raw bytes, the re-serialized JSON may differ from the original (different whitespace, key ordering, Unicode escaping). Your HMAC computation produces a different hash, validation fails, and you reject legitimate webhooks.

**Why it happens:** Next.js App Router route handlers automatically parse JSON request bodies. Developer calls `request.json()` and then tries to `JSON.stringify()` it back for HMAC validation. Meta uses escaped Unicode (e.g., `\u00e9` instead of `e`) in payloads, which changes after parse+re-serialize.

**Consequences:**
- Intermittent webhook validation failures (only when payload contains Unicode)
- Messages silently dropped because they fail signature check
- Hard to debug because it works for ASCII-only messages

**Prevention:**
- Read the raw body FIRST: `const rawBody = await request.text()` in Next.js App Router
- Compute HMAC on `rawBody` string
- THEN parse: `const payload = JSON.parse(rawBody)`
- Use `crypto.timingSafeEqual()` for comparison (prevents timing attacks)
- Test with messages containing Spanish characters (accents, n-tilde) — critical for MorfX's Colombian market

**Detection:**
- Log signature validation failures with the first 100 chars of the raw body
- Monitor validation failure rate — should be 0% in normal operation

---

### Pitfall 14: Pricing Model Change (July 2025) — Cost Tracking Is Now Per-Message

**Severity:** MEDIUM
**Phase:** Billing/Analytics (Phase 2-3)

**What goes wrong:** Since July 2025, Meta charges per delivered template message, not per 24-hour conversation window. Teams that built cost tracking around the old "conversation" model now have inaccurate billing. Additionally, utility messages within a customer-initiated 24h window are FREE, but your system may not track whether a window is open.

**Why it happens:** Legacy mental model: "one conversation = one charge". New model: each template message sent outside a customer-service window = one charge. Utility templates within a service window = free.

**Consequences:**
- Overcharging clients (billing for free utility messages)
- Undercharging clients (not billing per-message for marketing)
- Incorrect ROI calculations

**Prevention:**
- Track message-level billing events from Meta's webhooks (pricing webhook field)
- Differentiate: customer-initiated window (24h free replies) vs business-initiated (template charges)
- Build cost dashboard per workspace per channel
- US market note: Marketing templates are PAUSED for US phone numbers — handle gracefully

**Detection:**
- Compare your calculated costs vs Meta's billing dashboard monthly
- Alert on cost spikes per workspace

---

### Pitfall 15: Meta App Review Takes 2-7 Days — Blocks Launch

**Severity:** MEDIUM
**Phase:** Pre-launch (Phase 1)

**What goes wrong:** Your Meta App needs `whatsapp_business_messaging` and `whatsapp_business_management` permissions, which require App Review. Review takes 2-7 business days. Rejection adds another 3-5 days per attempt. Common rejection reasons: unclear screencast, unnecessary permissions requested, privacy policy issues, slow-loading privacy policy page.

**Why it happens:** Team saves app review for last, submits on Friday before Monday launch, gets rejected.

**Consequences:**
- Launch delayed by 1-3 weeks
- Must re-record screencast and re-submit
- Privacy policy must be live and fast-loading on a public URL

**Prevention:**
- Submit App Review in the FIRST week of development, not the last
- Request ONLY `whatsapp_business_messaging` and `whatsapp_business_management` — nothing extra
- Record a clear screencast showing: what the app does, how each permission is used, the end-user experience
- Privacy policy: host on your domain, fast-loading, mentions WhatsApp data usage
- Follow Meta's sample submission guide exactly

**Detection:**
- Track review status daily after submission
- Have a backup plan: use test mode (limited to 5 numbers) while awaiting approval

---

## Minor Pitfalls

Mistakes that cause annoyance but are fixable without major rework.

---

### Pitfall 16: Webhook Verify Token Is Not the App Secret

**Severity:** LOW
**Phase:** Webhook Setup (Phase 1)

**What goes wrong:** When configuring webhooks, Meta sends a GET request with a `hub.verify_token` that YOU define. This is NOT the App Secret. It's an arbitrary string you choose. Developers confuse this with the App Secret or the System User token and the verification handshake fails.

**Prevention:** Use a random string for verify_token, store it in env vars, document what it is.

---

### Pitfall 17: Status Webhooks Are Verbose — Database Bloat

**Severity:** LOW
**Phase:** Webhook Processing (Phase 2)

**What goes wrong:** Every outbound message generates multiple status webhooks: `sent`, `delivered`, `read` (if read receipts on), and potentially `failed`. For a workspace sending 1,000 messages/day, that's 3,000-4,000 status webhooks/day. Storing all of them bloats the messages/events table.

**Prevention:**
- Update message status in-place (don't create new rows per status)
- Only store the latest status per message
- Consider: do you need `sent` status at all, or only `delivered`/`read`/`failed`?

---

### Pitfall 18: Test Phone Numbers Have Different Behavior

**Severity:** LOW
**Phase:** Development (Phase 1)

**What goes wrong:** Meta provides test phone numbers for development. These numbers have different rate limits, don't charge, and may not trigger all webhook types. Features that work with test numbers may fail with real numbers (especially media, templates, and rate limiting).

**Prevention:**
- Test with real numbers in staging before production
- Document known differences between test and production behavior
- Use Meta's test number for CI/CD but real numbers for QA

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|---|---|---|---|
| Webhook Infrastructure | Slow 200 response causes retries + dedup flood (Pitfall 1) | CRITICAL | Return 200 immediately, async processing, idempotency table |
| Webhook Infrastructure | Raw body needed for HMAC (Pitfall 13) | MEDIUM | `request.text()` before `request.json()` |
| Token Management | Silent token expiry kills outbound (Pitfall 4) | CRITICAL | Health check cron, System User tokens, alerting |
| Embedded Signup | Two-step webhook subscription (Pitfall 8) | HIGH | Subscribe app first, then set callback URL |
| Embedded Signup | Short-lived token not exchanged (Pitfall 8) | HIGH | Exchange immediately in OAuth callback |
| Template Management | Category mismatch = rejection (Pitfall 7) | HIGH | Pre-validation UI, test on staging WABA |
| Multi-tenant Routing | Single endpoint for all WABAs (Pitfall 5) | HIGH | phone_number_id cache, O(1) lookup |
| Media Handling | 5-minute URL expiry (Pitfall 6) | HIGH | Fast-track download within 60s, re-upload to own storage |
| Number Migration | Downtime window during transfer (Pitfall 2) | CRITICAL | Off-peak scheduling, pre-release coordination, test with non-prod number |
| Instagram Channel | No template messages, stricter window (Pitfall 11) | MEDIUM | Separate window logic per channel |
| Rate Limiting | Multiple overlapping limits during campaigns (Pitfall 12) | MEDIUM | Send queue with rate limiting, priority levels |
| API Versioning | Hardcoded version goes stale (Pitfall 9) | HIGH | Single constant, quarterly update process |
| Business Verification | 250 msg limit for unverified (Pitfall 10) | HIGH | Make verification required in onboarding |
| App Review | 2-7 day timeline blocks launch (Pitfall 15) | MEDIUM | Submit in first week, not last |
| Billing | Per-message pricing model (Pitfall 14) | MEDIUM | Track message-level billing events |

---

## MorfX-Specific Compounding Risks

These pitfalls are extra dangerous given MorfX's specific architecture and history:

1. **Pitfall 1 (Slow 200) + Inngest fire-and-forget rule:** MorfX has a strict rule to always `await inngest.send()`. But awaiting in the webhook handler pushes response time past Meta's timeout. This creates a direct conflict that must be resolved architecturally (buffer queue pattern).

2. **Pitfall 2 (Migration downtime) + Production agent:** MorfX agents are actively serving customers 24/7. Even a 15-minute migration window means missed sales conversations. The gradual migration approach (one number at a time) is essential.

3. **Pitfall 4 (Token expiry) + Serverless:** Vercel serverless functions don't have persistent processes to run health checks. Token validation must be either: (a) on every API call (adds latency), or (b) via Inngest cron (5-min intervals). Option (b) means up to 5 minutes of failed sends before detection.

4. **Pitfall 5 (Single webhook) + Multi-tenant:** MorfX already has multi-workspace routing via 360dialog's per-number webhooks. Switching to a single webhook endpoint is an architectural regression that needs careful cache design to avoid per-message DB lookups.

5. **Pitfall 6 (Media expiry) + Inngest queue depth:** During high-traffic periods, Inngest queue depth can cause messages to be processed minutes after receipt. Media URLs will be expired. Need a separate high-priority media download path.

---

## Sources

- [Meta WhatsApp Cloud API Webhooks Guide](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/)
- [Meta WhatsApp Cloud API Media Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media/)
- [Meta App Review for Solution Providers](https://developers.facebook.com/docs/whatsapp/solution-providers/app-review/)
- [Meta Embedded Signup Documentation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/)
- [Meta WhatsApp Messaging Limits](https://developers.facebook.com/docs/whatsapp/messaging-limits/)
- [Meta WhatsApp Access Tokens Guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/)
- [Meta Graph API Versioning (Marketing API)](https://developers.facebook.com/docs/marketing-api/overview/versioning/)
- [Graph API v24.0 Changelog](https://developers.facebook.com/docs/graph-api/changelog/version24.0/)
- [Instagram Messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/)
- [Hookdeck - Guide to WhatsApp Webhooks](https://hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks-features-and-best-practices)
- [Handling Duplicate Webhooks in WhatsApp API (Medium)](https://medium.com/@nkangprecious26/handling-duplicate-webhooks-in-whatsapp-api-using-redis-d7d117731f95)
- [Chatwoot Embedded Signup Issues #13154](https://github.com/chatwoot/chatwoot/issues/13154)
- [WUSeller - 27 Template Rejection Reasons](https://www.wuseller.com/blog/whatsapp-template-approval-checklist-27-reasons-meta-rejects-messages/)
- [Meta App Approval Guide (saurabhdhar.com)](https://www.saurabhdhar.com/blog/meta-app-approval-guide)
- [Chatarmin - WhatsApp API Status 2026](https://chatarmin.com/en/blog/meta-whats-app-api-status)

# External Integrations

**Analysis Date:** 2026-02-09

## APIs & External Services

**Anthropic Claude API:**
- Service: Claude AI API (anthropic.com)
- SDK/Client: `@anthropic-ai/sdk` v0.73.0
- Auth: `ANTHROPIC_API_KEY` (env var, server-only)
- Usage: Agent engine core intelligence
  - Intent detection (Haiku 4.5)
  - Orchestration & decision-making (Sonnet 4.5)
  - Data extraction from customer messages
  - Message classification
- Implementation: `src/lib/agents/claude-client.ts`
- Model mapping:
  - `claude-haiku-4-5` → `claude-sonnet-4-20250514` (Haiku 4 not yet available)
  - `claude-sonnet-4-5` → `claude-sonnet-4-20250514`
- Key features:
  - Tool use (Action DSL integration)
  - Streaming responses
  - Token tracking per model
  - HMAC verification: Not required (API key auth only)

**360dialog WhatsApp Cloud API:**
- Service: 360dialog Cloud API (WhatsApp Business Platform)
- SDK/Client: Custom implementation (no official SDK)
- Auth:
  - `WHATSAPP_API_KEY` (D360-API-KEY header)
  - `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (webhook verification)
  - `WHATSAPP_PHONE_NUMBER_ID` (phone number identifier)
  - `WHATSAPP_DEFAULT_WORKSPACE_ID` (workspace routing)
- Base URL: `https://waba-v2.360dialog.io`
- Implementation: `src/lib/whatsapp/api.ts`
- Capabilities:
  - Send text messages (`sendTextMessage`)
  - Send media (image, video, audio, document, sticker) (`sendMediaMessage`)
  - Send template messages (`sendTemplateMessage`) - 24h window bypass
  - Send interactive buttons (`sendButtonMessage`)
  - Download media (`downloadMedia`, `getMediaUrl`) - 5min expiry
  - Mark messages as read (`markMessageAsRead`)
- Templates API: `src/lib/whatsapp/templates-api.ts`
  - Fetch approved templates
  - Create/submit new templates
  - Check template status
- Cost tracking: `src/lib/whatsapp/cost-utils.ts`
  - Categories: marketing, utility, authentication, service
  - Rates per message type and destination country
- Webhook handler: `src/app/api/webhooks/whatsapp/route.ts`
  - GET: Webhook verification (hub.mode, hub.verify_token, hub.challenge)
  - POST: Incoming messages and status updates
  - Processing: Synchronous (must complete before Vercel timeout)

**Shopify API:**
- Service: Shopify Admin API
- SDK/Client: `@shopify/shopify-api` v12.3.0
- Auth:
  - API Secret (for HMAC verification)
  - Shop domain (multi-tenant, stored in `integrations` table)
- Implementation: `src/lib/shopify/`
  - Webhook handler: `src/lib/shopify/webhook-handler.ts`
  - HMAC verification: `src/lib/shopify/hmac.ts` (talisman library)
  - Order mapping: `src/lib/shopify/order-mapper.ts`
  - Contact matching: `src/lib/shopify/contact-matcher.ts`
  - Phone normalization: `src/lib/shopify/phone-normalizer.ts`
- Webhook endpoint: `src/app/api/webhooks/shopify/route.ts`
  - CRITICAL: HMAC verification BEFORE processing
  - Headers: X-Shopify-Hmac-SHA256, X-Shopify-Webhook-Id, X-Shopify-Shop-Domain, X-Shopify-Topic
  - Idempotency: Uses X-Shopify-Webhook-Id
  - Multi-tenant: Finds integration by shop domain
- Supported webhooks:
  - `orders/create` - Creates contact + order in CRM
- Connection test: `src/lib/shopify/connection-test.ts`
- Data flow:
  1. Shopify order created
  2. Webhook received with HMAC
  3. Match/create contact by phone
  4. Map order + line items to CRM format
  5. Store in `orders` + `order_items` tables
  6. Log event in `webhook_events`

**Inngest:**
- Service: Inngest Cloud (workflow orchestration)
- SDK/Client: `inngest` v3.51.0
- Auth:
  - `INNGEST_EVENT_KEY` - For sending events (production)
  - `INNGEST_SIGNING_KEY` - For verifying webhook requests
- Implementation:
  - Client: `src/inngest/client.ts` (app ID: `morfx-agents`)
  - Events: `src/inngest/events.ts` (typed event schemas)
  - Functions: `src/inngest/functions/agent-timers.ts`
  - Serve endpoint: `src/app/api/inngest/route.ts`
- Purpose: Durable agent timer workflows
  - Replace n8n's Proactive Timer
  - Data collection timeout (6 minutes)
  - Promos offer timeout (10 minutes)
  - Persistent across restarts
  - Automatic retry on failures
- Key features:
  - `step.waitForEvent()` - Wait for customer message with timeout
  - `step.sleep()` - Delays between modes
  - Event-driven architecture
  - Type-safe event schemas
- Event types:
  - `agent/session.started` - Session initialization
  - `agent/customer.message` - Customer sent message (cancels timeouts)
  - `agent/collecting_data.started` - Triggers 6min timer
  - `agent/promos.offered` - Triggers 10min timer
  - `agent/proactive.send_message` - Scheduled proactive message

## Data Storage

**Databases:**
- Primary: Supabase (Postgres 15)
  - Connection:
    - Client: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    - Server: `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  - Client SDK: `@supabase/supabase-js` v2.93.1
  - SSR support: `@supabase/ssr` v0.8.0
  - Implementation:
    - Client: `src/lib/supabase/client.ts` (browser, respects RLS)
    - Server: `src/lib/supabase/server.ts` (Next.js server, respects RLS)
    - Admin: `src/lib/supabase/admin.ts` (bypasses RLS, service role)
    - Middleware: `src/lib/supabase/middleware.ts` (auth refresh)
  - Local dev config: `supabase/config.toml`
  - Migrations: `supabase/migrations/`
  - Key tables:
    - `agent_sessions` - Agent conversation sessions
    - `conversations` - WhatsApp conversations
    - `messages` - WhatsApp messages
    - `contacts` - CRM contacts
    - `orders` - CRM orders
    - `order_items` - Order line items
    - `integrations` - External service configs (Shopify, etc.)
    - `webhook_events` - Webhook processing log
    - `usage_logs` - API usage tracking (Anthropic, WhatsApp costs)
    - `workspaces` - Multi-tenant workspaces
    - `workspace_settings` - Workspace-specific settings

**File Storage:**
- Primary: Supabase Storage
  - Public URL pattern: `https://*.supabase.co/storage/v1/object/public/**`
  - Image optimization: Configured in `next.config.ts`
  - Upload: Image compression via `browser-image-compression` v2.0.2
  - Use cases:
    - WhatsApp media (images, documents, audio, video)
    - CRM attachments
    - User avatars
  - Access: Public storage buckets

**Caching:**
- None - No Redis, Memcached, or edge caching detected
- Strategy: Rely on Supabase query caching and Next.js route caching

## Authentication & Identity

**Auth Provider:**
- Supabase Auth
  - Implementation: `src/lib/auth/api-key.ts`, `src/lib/supabase/server.ts`
  - Methods: Email/Password, Magic Link
  - Session management: Cookie-based (Next.js middleware)
  - Local config: Email signup enabled, double confirmation
  - Google OAuth: Disabled (in `supabase/config.toml`)
- Multi-tenancy:
  - Workspace-based isolation
  - RLS policies enforce workspace boundaries
  - User can belong to multiple workspaces
- API Key auth:
  - Custom implementation in `src/lib/auth/api-key.ts`
  - For Action DSL tool API (`/api/v1/tools`)
  - Validates against Supabase API keys table

## Monitoring & Observability

**Error Tracking:**
- None - No Sentry, Bugsnag, or error tracking service detected

**Logs:**
- Structured logging: Pino v10.3.0
  - Implementation: `src/lib/audit/logger.ts`
  - Format: JSON (ISO 8601 timestamps)
  - GDPR compliance: Auto-redaction of PII (email, phone, tokens, passwords)
  - Levels: debug (dev), info (prod)
  - Context: Module-specific child loggers
  - Tool logging: `src/lib/audit/tool-logger.ts`
- HTTP logging: pino-http v11.0.0
- Output: stdout (captured by Vercel Logs in production)

**Analytics:**
- Custom implementation: `src/lib/analytics/types.ts`
- Usage tracking:
  - WhatsApp message costs (by category, destination)
  - Anthropic token usage (by model, input/output)
  - Stored in `usage_logs` table
  - Actions: `src/app/actions/usage.ts`

## CI/CD & Deployment

**Hosting:**
- Vercel Edge Network
  - Evidence: `.gitignore` includes `.vercel`
  - Auto-deployment on git push to main
  - Environment: Node.js 20+ runtime
  - Regions: Global edge (inferred)

**CI Pipeline:**
- None - No GitHub Actions, CircleCI, or CI config detected
- Likely: Vercel's built-in CI (build on push)

**Build Process:**
- Next.js build: `npm run build`
- TypeScript check: Automatic in Next.js build
- Linting: `npm run lint` (ESLint with Next.js config)
- No pre-commit hooks detected

## Environment Configuration

**Required env vars:**

**Supabase:**
- `NEXT_PUBLIC_SUPABASE_URL` - Project URL (public)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Anon key (public, RLS-protected)
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (server-only, bypasses RLS)

**Anthropic:**
- `ANTHROPIC_API_KEY` - Claude API key (server-only)

**WhatsApp (360dialog):**
- `WHATSAPP_API_KEY` - 360dialog API key (server-only)
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` - Webhook verification token
- `WHATSAPP_PHONE_NUMBER_ID` - Phone number ID for API calls
- `WHATSAPP_DEFAULT_WORKSPACE_ID` - Default workspace for incoming webhooks

**Inngest:**
- `INNGEST_EVENT_KEY` - For sending events (production required)
- `INNGEST_SIGNING_KEY` - Webhook signature verification

**Application:**
- `NODE_ENV` - Environment (development/production)
- `NEXT_PUBLIC_APP_URL` - Public application URL
- `MORFX_OWNER_USER_ID` - Super admin user ID

**Secrets location:**
- Development: `.env.local` (gitignored)
- Production: Vercel Environment Variables
- Example: `.env.example` (committed, contains Supabase vars only)

## Webhooks & Callbacks

**Incoming:**

**WhatsApp (360dialog):**
- Endpoint: `GET|POST /api/webhooks/whatsapp`
- Handler: `src/app/api/webhooks/whatsapp/route.ts`
- Verification:
  - GET with `hub.mode`, `hub.verify_token`, `hub.challenge`
  - Token check: `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- Events:
  - Incoming messages (text, media, location, contacts, reactions)
  - Message status updates (sent, delivered, read, failed)
- Processing: Synchronous (Vercel timeout constraint)
- Idempotency: Message ID-based deduplication
- Flow:
  1. Receive webhook → Find/create conversation → Link to contact
  2. Store message in DB → Trigger agent session if needed
  3. Return 200 OK immediately

**Shopify:**
- Endpoint: `POST /api/webhooks/shopify`
- Handler: `src/app/api/webhooks/shopify/route.ts`
- Verification: HMAC-SHA256 signature (X-Shopify-Hmac-SHA256 header)
- CRITICAL: Must verify HMAC BEFORE parsing body
- Security: Uses raw body as text for HMAC verification
- Events supported:
  - `orders/create` - New order placed
- Processing: Synchronous
- Idempotency: X-Shopify-Webhook-Id stored in `webhook_events`
- Multi-tenant: Routes by X-Shopify-Shop-Domain to correct integration
- Flow:
  1. Receive webhook → Verify HMAC → Find integration by shop domain
  2. Check idempotency → Parse order → Match/create contact
  3. Map order → Store in CRM → Log event → Return 200 OK

**Inngest:**
- Endpoint: `GET|POST|PUT /api/inngest`
- Handler: `src/app/api/inngest/route.ts`
- Verification: INNGEST_SIGNING_KEY signature
- Purpose: Inngest calls this to execute workflow functions
- Methods:
  - GET: Verify route and list functions
  - POST: Execute functions
  - PUT: Batch execution
- Functions served:
  - data-collection-timer: 6min timeout for data collection mode
  - promos-timer: 10min timeout for pack selection

**Outgoing:**

**To Claude API:**
- Endpoint: Anthropic API (api.anthropic.com)
- From: `src/lib/agents/claude-client.ts`
- Methods:
  - Intent detection (Haiku)
  - Orchestration with tool use (Sonnet)
  - Streaming responses
  - Data extraction
- Rate limiting: None implemented (relies on Anthropic's limits)

**To 360dialog API:**
- Endpoint: https://waba-v2.360dialog.io
- From: `src/lib/whatsapp/api.ts`
- Methods:
  - Send messages (text, media, templates, buttons)
  - Download media
  - Mark as read
- Rate limiting: `src/lib/tools/rate-limiter.ts`
  - Tool execution rate limiting
  - Prevents WhatsApp spam

**To Inngest:**
- Endpoint: Inngest Cloud event ingestion
- From: `src/inngest/client.ts`
- Methods: Send events (`inngest.send()`)
- Events:
  - Session lifecycle events
  - Customer message events
  - Mode transition events (collecting_data, promos)
- Environment: Requires `INNGEST_EVENT_KEY` in production

**To Supabase:**
- Endpoint: Supabase project URL
- From: All `src/lib/supabase/*` clients
- Methods: REST API, Realtime subscriptions
- Auth: JWT tokens (anon key or service role key)

## Integration Architecture

**Agent Engine Integration:**
- Core: Claude API (Anthropic)
- Orchestration: Inngest (timers, workflows)
- Data: Supabase (session state, conversation history)
- Communication: 360dialog WhatsApp API
- Flow:
  1. Customer message arrives via WhatsApp webhook
  2. Find/create agent session in Supabase
  3. Intent detection via Claude (Haiku)
  4. Orchestration decision via Claude (Sonnet)
  5. Execute tools via Action DSL registry
  6. Send response via 360dialog API
  7. Track tokens/costs in Supabase usage_logs
  8. Timer workflows managed by Inngest

**Action DSL Integration:**
- Registry: `src/lib/tools/registry.ts`
- Schemas: `src/lib/tools/schemas/*.ts`
- Handlers: `src/lib/tools/handlers/**/*.ts`
- Validation: Ajv JSON Schema (compiled validators)
- Executor: `src/lib/tools/executor.ts`
- API: `src/app/api/v1/tools/route.ts`
- Tools available:
  - `crm.*` - CRM operations (contacts, orders, notes)
  - `whatsapp.*` - WhatsApp messaging
- Name conversion: Dots (`crm.contact.create`) ↔ Underscores (`crm_contact_create`) for Claude

**CRM Integration:**
- Shopify: Orders sync to CRM via webhook
- WhatsApp: Conversations linked to contacts
- Agent: Creates orders during sales flow
- Multi-tenant: Workspace isolation via RLS

**Sandbox Environment:**
- Purpose: Test agents without live WhatsApp
- Implementation: `src/lib/sandbox/`
- UI: `src/app/(dashboard)/sandbox/`
- Features:
  - Mock customer messages
  - Inspect agent state (JSON viewer)
  - Ingest timer simulation
  - CRM agent testing

---

*Integration audit: 2026-02-09*

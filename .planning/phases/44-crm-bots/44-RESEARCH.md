# Phase 44: CRM Bots (Read + Write) — Research

**Researched:** 2026-04-15
**Domain:** Internal AI tool-provider APIs (agent-to-agent), API-key auth, two-step mutation flow, per-workspace rate limit + kill-switch, audit log on top of Phase 42.1 observability
**Confidence:** HIGH on in-repo infrastructure decisions (we own the stack end-to-end); MEDIUM on outbound email alerting (zero precedent in repo); HIGH on AI SDK v6 `tool()` / `generateText` patterns (already used in other bots)

## Summary

Phase 44 is an **integration** phase, not a greenfield one. Almost every subsystem it needs — API-key auth on `/api/v1/*`, sliding-window per-workspace rate limiter, AI SDK v6 with `@ai-sdk/anthropic`, Anthropic-instrumented client with per-turn collector, Supabase domain layer with workspace scoping, and agent folder scaffolding (Somnio V3 / GoDentist / Recompra) — **already exists and is battle-tested in this repo**. The plan should wire these together, not reinvent them.

The three genuinely new pieces are: (1) a `crm_bot_actions` table that stores the two-step propose→confirm lifecycle with idempotent `action_id`s and TTL-based expiration, (2) tiny email-alert plumbing for runaway-loop detection (no email service is installed today — Resend is the recommended minimum-footprint choice), and (3) a second per-workspace sliding-window limiter key namespace (`crm-bot:{workspaceId}`) that sits alongside the existing `ToolRateLimiter`.

**Primary recommendation:** Treat this phase as three concentric layers: (a) reuse `/api/v1/tools` middleware + `src/lib/auth/api-key.ts` + `ToolRateLimiter` verbatim; (b) mirror the `src/lib/agents/godentist/` folder shape for `crm-reader/` and `crm-writer/` with their own `config.ts` + `index.ts` + tool registry; (c) persist proposals/executions through the existing Phase 18 domain layer (`src/lib/domain/*`) — NEVER write to Supabase from tool handlers.

## Standard Stack

### Core — all already in `package.json`, no installs needed

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@ai-sdk/anthropic` | ^3.0.43 | Provider for AI SDK v6 `generateText` | Already used by all 3 production bots (Somnio V3, GoDentist, Recompra); `anthropic-instrumented.ts` in observability wraps it |
| `ai` (Vercel AI SDK v6) | pinned via `@ai-sdk/react` ^3.0.88 | `generateText` + `tool()` helper for tool-calling loop | First-class tool calling, type-safe tool outputs via Zod, native multi-turn tool loop with `maxSteps` |
| `zod` | already present | Tool input schemas (AI SDK v6 expects Zod) | Runtime validation + TS inference in one |
| `@supabase/supabase-js` | already present | DB access via domain layer | Reuse `createAdminClient()` (instrumented) for writes, `createRawAdminClient()` for observability internals |
| Phase 18 domain layer | `src/lib/domain/*.ts` | Single source of truth for mutations | **Regla 3 mandatory** — tool handlers MUST call domain funcs, never Supabase directly |
| Phase 42.1 observability | `src/lib/observability/*` | Collector + AI-call + query recording | `runWithCollector()` wraps each bot turn → audit log gets the entire pipeline for free |
| Existing `src/lib/auth/api-key.ts` | — | API key validation (SHA-256, `mfx_` prefix, `api_keys` table) | Edge-runtime compatible, already wired into middleware |
| Existing `src/lib/tools/rate-limiter.ts` | — | In-memory sliding window | Same primitive, different key namespace |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `resend` (npm) | latest | Transactional email for runaway-loop alerts | ONLY new dep; ~8 lines of wiring; free tier 3k/mo; alternative: Supabase SMTP (configured in "Pending Todos" STATE.md line 403 but still not set up) |
| `inngest` | already present | Expire `proposed` actions after TTL; periodic rate-limit alert aggregation (dedupe) | Avoid `setTimeout` in serverless; use `inngest.createFunction` with cron or delayed events |
| `pino` | already present | Structured logs (module logger pattern: `createModuleLogger('crm-bot-writer')`) | Every log in the repo goes through pino |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Resend for email | Supabase SMTP (STATE.md pending todo) | Supabase SMTP needs provider config (SendGrid/Resend/Postmark) regardless — same dep surface, more config, same net result |
| AI SDK v6 `generateText` + `tool()` | Raw `@anthropic-ai/sdk` with manual tool_use loop | Raw SDK used in older Somnio code (legacy) — AI SDK v6 is the standard for net-new bot code. `generateText` with `stopWhen: stepCountIs(N)` handles the tool-call loop automatically |
| In-memory `ToolRateLimiter` | Upstash Redis, Vercel KV | In-memory is what the rest of the repo uses; it DOES NOT survive Vercel lambda cold starts, which is acceptable because (a) 50/min is a runaway-detection heuristic, not a billing meter, and (b) lambda affinity on a single workspace is high enough that a runaway loop will hit the same instance. Document this explicitly in the plan. |
| New audit table | Reuse `agent_observability_turns` | Decision #CONTEXT.md already says NEW table (`crm_bot_actions`) to separate propose/confirm lifecycle from agent turns — turn records are conversations, these are discrete mutations with 5-state status machine |
| Per-tool granular permissions | Single API key with full scope | CONTEXT.md defers to V2 — V1 uses existing `api_keys.permissions` column minimally (e.g. `['crm-bot:reader']` or `['crm-bot:writer']`) |

**Installation:**

```bash
npm install resend --legacy-peer-deps
# --legacy-peer-deps required per STATE.md (react-textarea-autocomplete peer conflict with React 19)
```

All other deps are already installed.

## Architecture Patterns

### Recommended Project Structure

```
src/lib/agents/
├── crm-reader/
│   ├── index.ts              # Entry: processMessage(input) → output
│   ├── config.ts             # Model, temperature, maxSteps
│   ├── system-prompt.ts      # Reader prompt (read-only, cite tool outputs verbatim)
│   ├── tools/                # Tool registry — import ONLY read domain funcs
│   │   ├── index.ts          # Exports tools: { contactsSearch, contactsGet, ordersList, ... }
│   │   ├── contacts.ts       # Wraps domain/contacts.ts read funcs
│   │   ├── orders.ts
│   │   ├── pipelines.ts
│   │   └── tags.ts
│   └── types.ts
└── crm-writer/
    ├── index.ts              # Entry: propose(input) + confirm(actionId)
    ├── config.ts
    ├── system-prompt.ts      # Writer prompt (always propose, NEVER auto-confirm, explain preview)
    ├── two-step.ts           # Propose/confirm lifecycle helpers
    ├── tools/
    │   ├── index.ts          # ONLY write-capable tools
    │   ├── contacts.ts       # Wraps domain/contacts.ts (create, update, archive)
    │   ├── orders.ts
    │   ├── notes.ts
    │   └── tasks.ts
    └── types.ts

src/app/api/v1/crm-bots/
├── reader/
│   └── route.ts              # POST → reader.processMessage
└── writer/
    ├── propose/
    │   └── route.ts          # POST → writer.propose → returns {action_id, preview}
    └── confirm/
        └── route.ts          # POST → writer.confirm(action_id) → executes via domain
```

**Why this shape:**
- Mirrors `src/lib/agents/godentist/`, `somnio-v3/`, `somnio-recompra/` — pattern recognition for anyone navigating the repo
- **Isolation by construction:** reader tool registry literally cannot import writer handlers — TypeScript won't compile if someone tries
- Two folders = two agent_ids = two prompt versions = two independent observability flows (Phase 42.1 gives each its own `agent_id` in `agent_observability_turns`)

### Pattern 1: Tool handler delegates to domain layer

**What:** Each tool in `tools/contacts.ts` is a thin AI-SDK `tool()` that validates input with Zod and calls a function from `src/lib/domain/contacts.ts`. Tool handlers NEVER touch Supabase directly.

**When to use:** Every single tool. Non-negotiable per CLAUDE.md Regla 3.

**Example:**

```typescript
// src/lib/agents/crm-writer/tools/contacts.ts
import { tool } from 'ai'
import { z } from 'zod'
import { createContact, updateContact, archiveContact } from '@/lib/domain/contacts'
import type { WorkspaceContext } from '../types'

export const makeContactTools = (ctx: WorkspaceContext) => ({
  createContact: tool({
    description: 'Crea un nuevo contacto en el CRM. SIEMPRE usar two-step: devuelve preview, NO ejecuta hasta confirm.',
    inputSchema: z.object({
      name: z.string().min(1),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      tagIds: z.array(z.string().uuid()).optional(),
    }),
    execute: async (input) => {
      // NOTE: in propose phase, we validate + compute preview WITHOUT mutating
      // The actual createContact() call happens in confirm phase (see two-step.ts)
      return proposeAction(ctx, {
        tool: 'createContact',
        input,
        preview: { action: 'create', entity: 'contact', snapshot: input },
      })
    },
  }),
  // ... updateContact, archiveContact similarly
})
```

### Pattern 2: Two-step propose→confirm lifecycle

**What:** Writer NEVER mutates inside `tool.execute`. It inserts a row in `crm_bot_actions` with `status='proposed'`, returns `{action_id, preview}`. A separate endpoint (`/confirm`) executes the mutation by reading the row, calling the domain function, and updating `status='executed'`.

**When to use:** All 4 writer entities (contacts, orders, notes, tasks) — every mutation, no exceptions.

**Example:**

```typescript
// src/lib/agents/crm-writer/two-step.ts
import { createAdminClient } from '@/lib/supabase/admin'
import { randomUUID } from 'crypto'

const PROPOSAL_TTL_MS = 5 * 60 * 1000  // 5 min — CONTEXT.md suggestion

export async function proposeAction(
  ctx: WorkspaceContext,
  input: { tool: string; input: unknown; preview: unknown }
): Promise<{ action_id: string; preview: unknown; expires_at: string }> {
  const admin = createAdminClient()
  const actionId = randomUUID()
  const expiresAt = new Date(Date.now() + PROPOSAL_TTL_MS).toISOString()

  const { error } = await admin.from('crm_bot_actions').insert({
    id: actionId,
    workspace_id: ctx.workspaceId,
    agent_id: 'crm-writer',
    invoker: ctx.invoker,
    tool_name: input.tool,
    input_params: input.input,
    preview: input.preview,
    status: 'proposed',
    expires_at: expiresAt,
  })
  if (error) throw new Error(`propose_failed: ${error.message}`)

  return { action_id: actionId, preview: input.preview, expires_at: expiresAt }
}

export async function confirmAction(
  ctx: WorkspaceContext,
  actionId: string
): Promise<{ status: 'executed' | 'already_executed' | 'expired' | 'not_found'; output?: unknown }> {
  const admin = createAdminClient()

  // Idempotency: SELECT first to detect already_executed
  const { data: row } = await admin
    .from('crm_bot_actions')
    .select('*')
    .eq('id', actionId)
    .eq('workspace_id', ctx.workspaceId)  // workspace scope — critical
    .maybeSingle()

  if (!row) return { status: 'not_found' }
  if (row.status === 'executed') return { status: 'already_executed', output: row.output }
  if (row.status === 'expired' || new Date(row.expires_at) < new Date()) {
    await admin.from('crm_bot_actions').update({ status: 'expired' }).eq('id', actionId).eq('status', 'proposed')
    return { status: 'expired' }
  }

  // Execute via domain layer
  const output = await dispatchToolExecution(row.tool_name, row.input_params, ctx)

  await admin.from('crm_bot_actions')
    .update({ status: 'executed', output, executed_at: new Date().toISOString() })
    .eq('id', actionId)
    .eq('status', 'proposed')  // optimistic concurrency — prevents double-execution on race

  return { status: 'executed', output }
}
```

**Idempotency guarantee:** `.eq('status', 'proposed')` on the final UPDATE means two simultaneous `confirm` calls on the same `action_id` can only succeed once — the second gets 0 rows updated and reads back `status='executed'`.

### Pattern 3: Reuse `/api/v1/tools` middleware wholesale

**What:** The middleware in `middleware.ts` lines 61-91 already handles API-key validation for `/api/v1/tools/*`. Extend it to also cover `/api/v1/crm-bots/*` with a one-line path check — the rest (validateApiKey, workspace-id header injection) is identical.

**When to use:** Route handlers in `src/app/api/v1/crm-bots/*/route.ts` read `x-workspace-id` from headers same as `src/app/api/v1/tools/[toolName]/route.ts`.

**Example (middleware change — single line):**

```typescript
// middleware.ts line 64, change from:
if (pathname.startsWith('/api/v1/tools')) {
// to:
if (pathname.startsWith('/api/v1/tools') || pathname.startsWith('/api/v1/crm-bots')) {
```

### Pattern 4: Rate limit + kill-switch gate inside route handlers

**What:** Before any work, check `process.env.CRM_BOT_ENABLED !== 'false'` (kill-switch is **fail-open** — missing env = enabled, `'false'` explicitly kills). Then consume a token from `ToolRateLimiter` with a new module key `'crm-bot'` or a dedicated limiter instance.

**Example:**

```typescript
// src/app/api/v1/crm-bots/writer/propose/route.ts
import { rateLimiter } from '@/lib/tools/rate-limiter'
// ... imports

export async function POST(request: NextRequest) {
  // 1. Kill-switch (read on every request — NEVER cache, see Pitfall 2 in Phase 42.1 research)
  if (process.env.CRM_BOT_ENABLED === 'false') {
    return NextResponse.json(
      { error: 'CRM bots globally disabled', code: 'KILL_SWITCH' },
      { status: 503 }
    )
  }

  const workspaceId = request.headers.get('x-workspace-id')!  // middleware guaranteed
  const limit = Number(process.env.CRM_BOT_RATE_LIMIT_PER_MIN ?? 50)

  // 2. Rate limit (reuse the existing primitive, new namespace)
  const rl = rateLimiter.check(workspaceId, 'crm-bot' as ToolModule)  // requires extending ToolModule type
  if (!rl.allowed) {
    // trigger email alert async (fire-and-forget through inngest.send)
    void sendRunawayAlert({ workspaceId, limit, remaining: 0 })
    return NextResponse.json(
      { error: 'Rate limited', code: 'RATE_LIMITED', retry_after_ms: rl.resetMs },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } }
    )
  }

  // 3. 80% threshold alert (CONTEXT.md mandate)
  if (rl.remaining / limit < 0.2) {
    void sendApproachingLimitAlert({ workspaceId, used: limit - rl.remaining, limit })
  }

  // 4. Execute bot turn wrapped in observability collector
  return runWithCollector({ agentId: 'crm-writer', workspaceId }, async () => {
    const result = await writer.propose(await request.json(), { workspaceId })
    return NextResponse.json(result)
  })
}
```

### Pattern 5: AI SDK v6 `generateText` with tool loop

**What:** Use `generateText({ model, tools, system, prompt, stopWhen })` where `stopWhen: stepCountIs(5)` caps tool-calling loops. Do NOT hand-roll a tool-call parser against raw `@anthropic-ai/sdk`.

**Source:** AI SDK v6 docs + already in use across Somnio V3 / GoDentist / Recompra. Verified MEDIUM confidence — pattern exists in repo, exact API signature should be confirmed against `@ai-sdk/anthropic` ^3.0.43 during plan.

```typescript
import { generateText, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

const result = await generateText({
  model: anthropic('claude-sonnet-4-5-20250929'),  // CONTEXT.md decision
  system: READER_SYSTEM_PROMPT,
  messages: input.messages,
  tools: makeReaderTools(ctx),
  stopWhen: stepCountIs(5),  // cap tool-call loop
  temperature: 0,  // reader is deterministic; writer may use 0.2 for preview phrasing
})
```

### Anti-Patterns to Avoid

- **Don't toggle read/write with a runtime flag in a single agent.** CONTEXT.md Decision: two folders, no toggle. A runtime filter that fails = data loss. Compile-time isolation = impossible to fail.
- **Don't mutate inside `tool.execute`.** Two-step or nothing. A caller that fires the writer tool call unexpectedly must not be able to mutate without the second `confirm` HTTP round-trip.
- **Don't `inngest.send` without `await`.** STATE.md lists this as a resolved production incident. Every email alert + TTL-expire event must `await inngest.send(...)`.
- **Don't assume kill-switch caching is safe.** Phase 42.1 RESEARCH calls out Pitfall 5: `process.env` reads must happen per-request.
- **Don't use `.single()` on workspace lookups without explicit workspace_id filter.** STATE.md documents a multi-workspace safety incident.
- **Don't store conversation history.** CONTEXT.md explicit: actions yes, chat no. The API is stateless at the conversation level; callers pass messages[] fresh every call.
- **Don't create base resources from the writer.** `agent-scope.md` forbids tag/pipeline/stage/template/user creation. If missing → return `{error: 'resource_not_found', resource_type, suggested_action}`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API key validation | Custom header parser, custom hash | `src/lib/auth/api-key.ts` (`validateApiKey`, `extractApiKey`, `generateApiKey`) | Already hashes with SHA-256, checks `revoked`, `expires_at`, updates `last_used_at`, edge-runtime compatible |
| Workspace-scoped auth injection | Per-route header checks | Middleware at `/api/v1/crm-bots/*` (extend existing `/api/v1/tools` branch) | Guarantees every route handler sees `x-workspace-id`, no per-route duplication |
| Rate limiting | Redis, custom sliding window, token bucket | `src/lib/tools/rate-limiter.ts` — extend `ToolModule` type with `'crm-bot'` and use `rateLimiter.check(workspaceId, 'crm-bot')` | Works, tested, already has `resetMs` field and memory-cleanup timer |
| Tool-calling loop | Raw Anthropic SDK `tool_use` parsing | AI SDK v6 `generateText({ tools, stopWhen })` | Handles multi-step tool use, validates outputs, type-safe via Zod |
| Zod schemas for tool inputs | Hand-written runtime validators | `z.object({...})` inside each `tool({inputSchema: ...})` | AI SDK v6 expects Zod natively |
| Contact/order/note/task mutations | Direct Supabase `.insert/.update` from tool handler | `src/lib/domain/{contacts,orders,notes,tasks}.ts` | **CLAUDE.md Regla 3 — BLOCKING.** Domain funcs already emit automation triggers, filter by workspace_id, use admin client |
| AI call logging, query logging, token cost | Custom audit insert | `runWithCollector({ agentId, workspaceId }, fn)` wrapping every turn, Phase 42.1 observability flushes to `agent_observability_turns` + `agent_observability_ai_calls` + `agent_observability_queries` | Already captures system prompt hash, input/output tokens, cost, duration, all tool-layer Supabase queries |
| Prompt versioning | Per-deploy hashing, env injection | `src/lib/observability/prompt-version.ts` (`hashPrompt`) — collector records prompt version automatically | Ships with Phase 42.1 |
| UUID generation for `action_id` | `Math.random`, nanoid | `crypto.randomUUID()` (Node 20+ / edge-safe) | Native, 128-bit, collision-free |
| Idempotency on confirm | Distributed locks, Redis | Postgres optimistic UPDATE `.eq('status', 'proposed')` | One DB round-trip; second caller gets 0-row update and reads `executed` state |
| TTL expiration of `proposed` actions | `setTimeout` in handler | Inngest cron every 1 min: `UPDATE ... SET status='expired' WHERE status='proposed' AND expires_at < now()` | `setTimeout` dies with the lambda; Inngest survives |
| Email delivery | Raw SMTP, fetch to SendGrid REST | `resend` SDK (`resend.emails.send({...})`) | 4 lines of code, React Email templates optional, free tier sufficient for alerts |
| Alert deduplication | Hand-rolled TTL map | Include a `last_alert_sent_at` column on `workspaces` or an in-memory Set keyed by `workspaceId` with 5-min TTL reuse of `ToolRateLimiter` cleanup pattern | Avoid alert-storming during sustained runaway |

**Key insight:** Every single piece of infrastructure this phase needs (except email) is already in the repo. The plan's atomic tasks should mostly be **wiring + 1 new table + 1 new cron**, not building primitives.

## Common Pitfalls

### Pitfall 1: In-memory rate limiter doesn't survive lambda cold starts

**What goes wrong:** Workspace A fires 100 requests; they get distributed across 3 Vercel lambda instances; each instance's `ToolRateLimiter` sees 33 requests and allows all of them.

**Why it happens:** Vercel serverless — each cold instance has its own module memory. `ToolRateLimiter` is a singleton per-lambda, not per-workspace globally.

**How to avoid:** Acknowledge in plan that 50/min is a **soft heuristic for runaway-loop detection**, not an enforceable ceiling. If hard enforcement becomes needed, upgrade to Upstash Redis (not this phase). Document explicitly in the plan's task 0 / design notes.

**Warning signs:** Metric `crm_bot_rate_limited_total` stays at 0 while `crm_bot_calls_total` hits 200+/min on a single workspace.

### Pitfall 2: `CRM_BOT_ENABLED` env var cached at module load

**What goes wrong:** Kill-switch flipped to `false` in Vercel dashboard; warm lambdas still serve requests because they cached `process.env.CRM_BOT_ENABLED` at module init.

**Why it happens:** `const ENABLED = process.env.CRM_BOT_ENABLED !== 'false'` at top of file runs once per lambda boot.

**How to avoid:** Read `process.env.CRM_BOT_ENABLED` **inside every handler**, not at module scope. Lifted directly from Phase 42.1 RESEARCH Pitfall 5.

**Warning signs:** You set env var to `false`, but a running workspace still receives responses for ~15 min (warm lambda TTL).

### Pitfall 3: Double-confirm race condition

**What goes wrong:** Caller times out, retries `confirmAction(action_id)` while the first call is mid-execution. Both call the domain mutation → duplicate contact / duplicate order.

**Why it happens:** Two simultaneous SELECTs both see `status='proposed'`; both proceed to the domain call.

**How to avoid:** Use optimistic UPDATE as the concurrency primitive: `UPDATE crm_bot_actions SET status='executing' WHERE id=? AND status='proposed' RETURNING *`. Second caller gets 0 rows → returns `{status: 'already_executing'}` without calling domain. See Pattern 2 snippet.

**Warning signs:** Duplicate entities created with timestamps ~seconds apart and same origin.

### Pitfall 4: Workspace-scope escape via forged `x-workspace-id`

**What goes wrong:** Caller with a valid API key for workspace A sends `x-workspace-id: <workspace-B-uuid>` header; route handler trusts the header without binding it to the key.

**Why it happens:** Middleware sets `x-workspace-id` from `validateApiKey(apiKey).workspaceId`, BUT if route handlers accept a workspace_id from request body or a forwarded header, they override.

**How to avoid:** Route handlers read `x-workspace-id` ONLY from `request.headers` (set by middleware post-validation), never from request body. Use `createClient()` inside middleware's namespace, never mutate the header downstream.

**Warning signs:** Cross-workspace data access in tests; audit log shows mismatched `workspace_id` vs API key's `workspace_id`.

### Pitfall 5: Reader returns stale/partial data silently because tool returned `null`

**What goes wrong:** Reader tool `contactsGet(id)` returns `null` for a not-found contact; LLM interprets silence as "contact does not exist" and reports to caller, but actually the row exists in another workspace.

**Why it happens:** Domain layer filters by `workspace_id`; across-workspace access returns no rows. If the tool wrapper doesn't distinguish "not in this workspace" from "doesn't exist globally", the caller gets misleading info.

**How to avoid:** Tool return shape must be discriminated: `{status: 'found', data}` | `{status: 'not_found'}` | `{status: 'access_denied'}`. For V1, collapse `not_found` and `access_denied` into `not_found_in_workspace` with clear phrasing — the reader's system prompt must echo this literally.

**Warning signs:** Callers complain about missing contacts that exist in other workspaces.

### Pitfall 6: AI SDK v6 `tool()` inferred input typing vs runtime Zod failures

**What goes wrong:** Tool `inputSchema: z.object({...})` rejects LLM's output (LLM hallucinated `phoneNumber` vs schema's `phone`). AI SDK v6 fails the tool call; LLM may retry with wrong shape.

**Why it happens:** Anthropic sometimes produces JSON that doesn't match the schema when schema description is ambiguous.

**How to avoid:** (a) Use explicit `description` on every Zod field, (b) set `stopWhen: stepCountIs(N)` low enough (5) so infinite retry loops can't burn tokens, (c) system prompt explicitly enumerates tool names and input field names.

**Warning signs:** High token cost on reader turns with no useful output; observability shows 5 failed tool calls in a row.

### Pitfall 7: Inngest TTL expire job marks executed rows by race

**What goes wrong:** TTL cron runs `UPDATE SET status='expired' WHERE status='proposed' AND expires_at < now()` while a `confirm` is mid-flight. Confirm reads row, cron updates to `expired`, confirm's UPDATE with `WHERE status='proposed'` gets 0 rows and returns `expired` to caller — but the user's mutation had already been intended.

**Why it happens:** Two writers to the same row without a lock.

**How to avoid:** Cron should only expire rows where `expires_at < now() - INTERVAL '30 seconds'` (30s grace period past TTL). Confirm still uses strict TTL. This prevents the race at the cost of 30s of "zombie" proposals that can still be confirmed.

**Warning signs:** Callers see random `expired` responses within seconds of the TTL window.

### Pitfall 8: Email alert storm during legitimate high-volume workspace

**What goes wrong:** A workspace legitimately doing 60 calls/min sends 1 email per request over the threshold = 60 emails in 60 seconds.

**How to avoid:** Dedupe alerts at 1 per workspace per 15 min using an in-memory Set + cleanup, OR a Postgres `workspaces.last_crm_bot_alert_at` column with `WHERE last_crm_bot_alert_at < now() - interval '15 min'` gate before send.

**Warning signs:** Your inbox in an incident.

## Code Examples

### Tool handler wrapping domain layer (READER)

```typescript
// src/lib/agents/crm-reader/tools/contacts.ts
import { tool } from 'ai'
import { z } from 'zod'
import { searchContacts, getContactById } from '@/lib/domain/contacts'

export const makeContactReadTools = (ctx: { workspaceId: string }) => ({
  contactsSearch: tool({
    description: 'Busca contactos por teléfono, email o nombre. Retorna máximo 20 resultados.',
    inputSchema: z.object({
      query: z.string().min(1).describe('Texto de búsqueda (teléfono, email, o parte del nombre)'),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    execute: async ({ query, limit }) => {
      const results = await searchContacts(ctx.workspaceId, query, { limit })
      return { status: 'ok' as const, count: results.length, contacts: results }
    },
  }),
  contactsGet: tool({
    description: 'Obtiene un contacto por ID con sus tags y custom fields.',
    inputSchema: z.object({ contactId: z.string().uuid() }),
    execute: async ({ contactId }) => {
      const contact = await getContactById(ctx.workspaceId, contactId)
      if (!contact) return { status: 'not_found_in_workspace' as const }
      return { status: 'found' as const, contact }
    },
  }),
})
```

### Endpoint with full stack (kill-switch + rate limit + observability)

```typescript
// src/app/api/v1/crm-bots/reader/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { rateLimiter } from '@/lib/tools/rate-limiter'
import { runWithCollector } from '@/lib/observability'
import { processReaderMessage } from '@/lib/agents/crm-reader'
import { sendRunawayAlert, maybeSendApproachingLimitAlert } from '@/lib/agents/crm-reader/alerts'

export async function POST(request: NextRequest) {
  if (process.env.CRM_BOT_ENABLED === 'false') {
    return NextResponse.json({ error: 'disabled', code: 'KILL_SWITCH' }, { status: 503 })
  }

  const workspaceId = request.headers.get('x-workspace-id')
  if (!workspaceId) {
    return NextResponse.json({ error: 'missing_workspace' }, { status: 401 })
  }

  const limit = Number(process.env.CRM_BOT_RATE_LIMIT_PER_MIN ?? 50)
  const rl = rateLimiter.check(workspaceId, 'crm-bot' as const)
  if (!rl.allowed) {
    void sendRunawayAlert({ workspaceId, agentId: 'crm-reader', limit })
    return NextResponse.json(
      { error: 'rate_limited', retry_after_ms: rl.resetMs },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } }
    )
  }
  if (rl.remaining / limit < 0.2) {
    void maybeSendApproachingLimitAlert({ workspaceId, agentId: 'crm-reader', used: limit - rl.remaining, limit })
  }

  const body = await request.json()

  return runWithCollector(
    { agentId: 'crm-reader', workspaceId, triggerKind: 'api' },
    async () => {
      const result = await processReaderMessage({ workspaceId, messages: body.messages })
      return NextResponse.json({ status: 'ok', output: result })
    }
  )
}
```

### Email alert via Resend

```typescript
// src/lib/agents/_shared/alerts.ts
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const RECIPIENT = 'joseromerorincon041100@gmail.com'

const lastSent = new Map<string, number>()
const DEDUPE_MS = 15 * 60 * 1000

export async function sendRunawayAlert(ctx: { workspaceId: string; agentId: string; limit: number }) {
  const key = `runaway:${ctx.workspaceId}:${ctx.agentId}`
  const last = lastSent.get(key) ?? 0
  if (Date.now() - last < DEDUPE_MS) return
  lastSent.set(key, Date.now())

  try {
    await resend.emails.send({
      from: 'MorfX Alerts <alerts@morfx.app>',
      to: RECIPIENT,
      subject: `[CRM Bot] Runaway loop suspected — ${ctx.agentId} — workspace ${ctx.workspaceId.slice(0, 8)}`,
      text: `Workspace ${ctx.workspaceId} exceeded ${ctx.limit} calls/min on ${ctx.agentId}.\nDedupe: next alert in 15 min.`,
    })
  } catch (err) {
    // fail-silent — never crash the route because of alerting
    console.error('[crm-bot-alerts] send failed', err)
  }
}
```

### Table migration (new)

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_crm_bot_actions.sql
CREATE TABLE crm_bot_actions (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL CHECK (agent_id IN ('crm-reader', 'crm-writer')),
  invoker TEXT,                                       -- caller agent id or API-key prefix
  tool_name TEXT NOT NULL,
  input_params JSONB NOT NULL,
  preview JSONB,                                      -- what would happen (null for reader)
  output JSONB,                                       -- result after confirm (null until executed)
  status TEXT NOT NULL CHECK (status IN ('proposed', 'executed', 'failed', 'expired')),
  error JSONB,                                        -- {message, code} if status='failed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  expires_at TIMESTAMPTZ,                             -- null for reader; set for writer
  executed_at TIMESTAMPTZ
);

CREATE INDEX idx_crm_bot_actions_workspace_created ON crm_bot_actions(workspace_id, created_at DESC);
CREATE INDEX idx_crm_bot_actions_proposed_expires ON crm_bot_actions(expires_at) WHERE status = 'proposed';
CREATE INDEX idx_crm_bot_actions_agent_status ON crm_bot_actions(agent_id, status);
```

Note: `timezone('America/Bogota', NOW())` per CLAUDE.md Regla 2.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-rolled tool_use parser on raw `@anthropic-ai/sdk` | AI SDK v6 `generateText({ tools, stopWhen })` | Somnio V3 & GoDentist already migrated | Plan uses AI SDK v6 exclusively for new bots |
| Synchronous mutations in tool handlers | Two-step propose+confirm with idempotent action_id | CONTEXT.md decision for this phase | Guards against runaway caller bugs |
| Conversation-turn logging only (agent_observability_turns) | Dedicated action table + observability turn per call | This phase | Lets audit query "what did bot X do in workspace Y last week" directly |
| `setTimeout` for TTL | Inngest cron | Phase 29 migration | Survives lambda recycling |

**Deprecated/outdated:**
- Raw `@anthropic-ai/sdk` client — only older Somnio V1 still uses it; all net-new bot code uses `@ai-sdk/anthropic` + AI SDK v6
- RLS on bot-owned tables — Phase 42.1 Decision: admin client + workspace_id filter in every query (same pattern here)

## Open Questions

1. **`ToolModule` type extension — should `'crm-bot'` be a new module or two (`'crm-bot-reader'` + `'crm-bot-writer'`)?**
   - What we know: Current `ToolModule` = `'crm' | 'whatsapp' | 'system'`. CONTEXT.md says single 50/min budget per workspace.
   - What's unclear: Whether reader + writer share the quota or each gets its own.
   - Recommendation: **Single `'crm-bot'` module sharing 50/min** — a runaway loop usually hits both; splitting masks it. If in practice reader is high-volume and writer low, plan-phase can split in V1.1.

2. **`invoker` field — what goes in it?**
   - What we know: CONTEXT.md says "caller", likely the agent that invoked the bot.
   - What's unclear: How does the caller identify itself? API-key prefix? Extra header `x-invoker-agent-id`?
   - Recommendation: **Accept `x-invoker` header (optional, free-form string)** + fall back to API-key prefix (first 8 chars of `mfx_...`). Planner decides schema.

3. **Preview format — JSON diff vs before/after vs snapshot?**
   - What we know: CONTEXT.md leaves it to Claude's discretion.
   - Recommendation: **`{ action: 'create' | 'update' | 'archive', entity: 'contact'|..., before?: {...}, after: {...} }`** — simple, human-readable in audit UI, easy to diff client-side later. Avoid jsondiffpatch-style operation arrays (hard to read).

4. **Email service procurement.**
   - What we know: Zero email infra installed. Supabase SMTP listed as "pending todo" since before Phase 37.
   - Recommendation: Install **Resend** in this phase (smallest footprint, 3k/mo free). Plan-phase can add it as a Task 0 item. Alternative: punt alerts to a simple console.error + Vercel log drain, file Resend follow-up.

5. **Reader observability granularity — log every call, or sample?**
   - What we know: CONTEXT.md says "con menor granularidad" for reader.
   - Recommendation: **Log every reader call as an `agent_observability_turns` row** (Phase 42.1 already scales for this) but DO NOT insert into `crm_bot_actions` for reads — keeps the audit table focused on mutations. Revisit if table growth becomes an issue.

6. **Confirm endpoint auth — same API key as propose?**
   - What we know: Two-step flow uses two HTTP calls.
   - Recommendation: **Same API key, same workspace scope**. `confirmAction` validates `workspace_id` matches the key's workspace. No need for separate key.

## Sources

### Primary (HIGH confidence)
- In-repo code: `src/lib/auth/api-key.ts` (lines 1-145) — API key validation pattern, already edge-runtime compatible
- In-repo code: `src/lib/tools/rate-limiter.ts` — Sliding window, per-workspace-per-module, directly reusable
- In-repo code: `middleware.ts` (lines 61-91) — API key middleware pattern for `/api/v1/*`
- In-repo code: `src/app/api/v1/tools/[toolName]/route.ts` — Route handler pattern (headers, error codes 400/401/403/404/429/500/504)
- In-repo code: `src/lib/observability/{collector,context,flush,anthropic-instrumented}.ts` — Phase 42.1 pipeline, `runWithCollector`, `getCollector`
- In-repo code: `src/lib/agents/{godentist,somnio-v3,somnio-recompra}/` — Agent folder pattern to mirror
- In-repo code: `src/lib/domain/{contacts,orders,notes,tasks}.ts` — Existing write funcs the writer will wrap
- CLAUDE.md — Regla 3 (domain layer mandatory), Regla 5 (migration before code), Regla 6 (feature-flag protection), `agent-scope.md` (no base-resource creation)
- STATE.md — Accumulated decisions: Phase 42.1 Pitfall 5 (process.env never cached), multi-workspace `.single()` safety, inngest.send must await, pricing for claude-sonnet-4-5

### Secondary (MEDIUM confidence)
- AI SDK v6 `generateText` + `tool()` + `stopWhen: stepCountIs(N)` pattern — confirmed present in repo's `package.json` (`@ai-sdk/anthropic` ^3.0.43, `@ai-sdk/react` ^3.0.88); exact signature should be re-verified against installed version during plan
- Resend SDK API (`resend.emails.send({from, to, subject, text})`) — standard pattern, MEDIUM until installed and tested

### Tertiary (LOW confidence — mark for plan-phase validation)
- Exact serverless behavior of in-memory rate limiter under Vercel's current lambda scheduling (March 2026) — documented as known limitation; plan-phase should include a task verifying the limiter works under load before production enable

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library is already installed and used elsewhere in repo (except Resend, which is a minor addition)
- Architecture patterns: HIGH — all four patterns (folder shape, tool→domain, two-step, middleware) have direct precedent
- Two-step + idempotency: MEDIUM → HIGH — optimistic-UPDATE pattern is standard Postgres but net-new to this repo; plan must include an explicit idempotency test
- Pitfalls: HIGH — 5 of 8 are lifted directly from STATE.md / Phase 42.1 RESEARCH incidents; remaining 3 are standard two-step/rate-limit traps
- Email alerting: MEDIUM — Resend usage is trivial but zero precedent in repo; plan-phase should include a smoke-test task before relying on it

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (30 days — stack is stable; refresh if AI SDK v6 has a major release or if a Redis-backed rate-limiter is introduced elsewhere first)

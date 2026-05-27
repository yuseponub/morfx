# PATTERNS.md — coordinadora-api-integration

**Mapped:** 2026-05-26
**Files analyzed:** 10 target files (new) + 1 schema migration + 1 feature flag SQL seed
**Analogs found:** 10/10 (all with exact-or-strong role match)
**Standalone:** `.planning/standalone/coordinadora-api-integration/`

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/app/api/webhooks/coordinadora/[env]/route.ts` | route handler (webhook) | request-response (POST + Inngest dispatch) | `src/app/api/webhooks/whatsapp/route.ts` + `src/app/api/v1/tools/[toolName]/route.ts` | role-exact; dynamic-param-exact |
| `src/lib/carriers/coordinadora/client.ts` | HTTP client + token cache | request-response (outbound) | `src/lib/carriers/envia-api.ts` + `src/lib/domain/platform-config.ts` (Map cache) | role-match (extend with auth+cache) |
| `src/lib/carriers/coordinadora/cotizar.ts` | service wrapper | request-response | `src/lib/carriers/envia-api.ts` (thin fetch wrapper) | exact |
| `src/lib/carriers/coordinadora/create-guia.ts` | service wrapper | request-response | `src/lib/carriers/envia-api.ts` | exact |
| `src/lib/carriers/coordinadora/imprimir-etiqueta.ts` | service wrapper | request-response | `src/lib/carriers/envia-api.ts` | exact |
| `src/lib/carriers/coordinadora/types.ts` | type definitions | n/a (pure types) | `src/lib/carriers/envia-api.ts` (inline `EnviaStatusResponse`) + `src/lib/domain/types.ts` | role-match |
| `src/lib/carriers/coordinadora/status-codes.ts` | mapping / enum | transform (codigo → label) | (no precise analog — closest is inline constants in `src/lib/agents/somnio-pw-confirmation/config.ts`) | partial — generic enum pattern |
| `src/lib/carriers/coordinadora/pub-sub-envelope.ts` | type-guard + decode | transform (envelope → typed event) | `src/lib/whatsapp/webhook-handler.ts` (payload validation) | role-match — payload validation analog |
| `src/lib/carriers/coordinadora/tenant.ts` | pure-function resolver (nit → workspace) | transform | n/a (V1 hardcoded constant map) | NO ANALOG — see "No Analog Found" |
| `src/lib/carriers/coordinadora/env.ts` | env-var reader | n/a | inline pattern in `src/lib/bold/client.ts` (env reads) | partial |
| `src/lib/domain/carrier-events.ts` (EXTEND) | domain mutator | CRUD (idempotent INSERT) | `src/lib/domain/carrier-events.ts:50-81` (existing `insertCarrierEvent`) + `src/lib/domain/crm-mutation-idempotency.ts:90-122` (`upsert({ignoreDuplicates:true})`) | exact-extend |
| `src/inngest/functions/coordinadora-webhook-process.ts` | inngest function (async processor) | event-driven | `src/inngest/functions/recompra-preload-context.ts` + `src/inngest/functions/bold-upstream-broken.ts` | role-match (concurrency + observability + step.run) |
| `src/inngest/events.ts` (EXTEND) | event type definitions | n/a | existing `AgentEvents` type union | exact-extend |
| `supabase/migrations/YYYYMMDD_coordinadora_carrier_events_extension.sql` | DB migration (additive) | ddl | `supabase/migrations/20260410000003_order_carrier_events.sql` + `supabase/migrations/20260429180000_crm_mutation_idempotency_keys.sql` | role-exact |
| `supabase/migrations/YYYYMMDD_seed_coordinadora_api_v2_flag.sql` | feature flag seed | ddl (INSERT) | `supabase/migrations/20260421155713_seed_recompra_crm_reader_flag.sql` | EXACT — copy verbatim with key swap |
| `src/lib/carriers/coordinadora/__tests__/*.test.ts` | vitest unit tests | n/a | `src/lib/domain/__tests__/conversations.test.ts` (supabase mock pattern) + `src/inngest/functions/__tests__/recompra-preload-context.test.ts` | role-match |

---

## Pattern Assignments

### `src/app/api/webhooks/coordinadora/[env]/route.ts` (route handler, request-response)

**Primary analog:** `src/app/api/webhooks/whatsapp/route.ts:108-179` (POST handler with raw-body-first + workspace resolution + 200 fast)

**Secondary analog (dynamic param + Next 15 Promise):** `src/app/api/v1/tools/[toolName]/route.ts:63-86`

**Imports pattern** (mirror `webhook-processor` style — RESEARCH cites await inngest.send):
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createModuleLogger } from '@/lib/audit/logger'
import { inngest } from '@/inngest/client'
```

**Next 15 dynamic params pattern** (exact, copy from `src/app/api/v1/tools/[toolName]/route.ts:63-73`):
```typescript
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ toolName: string }> }
) {
  // Ensure tools are initialized
  if (!areToolsInitialized()) {
    initializeTools()
  }
  try {
    const { toolName } = await params
    // ...
```

→ For coordinadora: `{ params: Promise<{ env: string }> }` and `const { env } = await params`.

**Raw-body + parse + 200-fast pattern** (mirror `src/app/api/webhooks/whatsapp/route.ts:135-178`):
```typescript
// Parse payload from raw body (after HMAC verification)
let payload: WebhookPayload
try {
  payload = JSON.parse(rawBody)
} catch {
  console.error('Failed to parse webhook payload')
  return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
}

// Validate it's a WhatsApp webhook
if (payload.object !== 'whatsapp_business_account') {
  console.warn('Received non-WhatsApp webhook:', payload.object)
  return NextResponse.json({ error: 'Invalid webhook type' }, { status: 400 })
}

// Resolve workspace: DB lookup ...
const workspaceId = await resolveWorkspaceId(phoneNumberId)
if (!workspaceId) {
  console.error('No workspace found for phone_number_id:', phoneNumberId)
  return NextResponse.json({ received: true }, { status: 200 })  // ACK + drop
}

// Process synchronously to ensure completion before Vercel kills the function
try {
  const result = await processWebhook(payload, workspaceId, phoneNumberId)
  // ...
  return NextResponse.json({ received: true }, { status: 200 })
} catch (error) {
  // 5xx triggers retry
  return NextResponse.json({ error: 'Failed' }, { status: 500 })
}
```

**Deviations:**
- NO HMAC verification (D-10 — Coordinadora doesn't sign; envelope shape validation is the defense)
- Path param `env` validated against `['test','prod']` literal union (D-06) — reject others with 404
- After domain insert, dispatch via `await inngest.send({ name: 'coordinadora/webhook.received', ... })` instead of synchronous `processWebhook` (D-08 — async downstream)
- Decode errors → 200 + drop (Pub/Sub at-least-once; we don't want eternal retry of a malformed message)
- Persistence errors → 500 (Pub/Sub retries with backoff)

**Risk:** LOW — pattern is well-tested; only novel piece is Pub/Sub envelope decode (covered by `pub-sub-envelope.ts` module with type guard).

---

### `src/lib/carriers/coordinadora/client.ts` (HTTP client + token cache)

**Primary analog (thin fetch wrapper + AbortSignal):** `src/lib/carriers/envia-api.ts:35-47`

**Secondary analog (module-scoped Map cache with TTL):** `src/lib/domain/platform-config.ts:60-103`

**Token cache excerpt to mirror** (from `src/lib/domain/platform-config.ts:58-103`):
```typescript
export const PLATFORM_CONFIG_TTL_MS = 30_000

interface CacheEntry {
  value: unknown
  expiresAt: number
}

/**
 * Module-scoped cache. Lives per-lambda-instance (reset on cold start).
 * No cross-instance synchronization — each Vercel lambda has its own Map.
 */
const cache = new Map<string, CacheEntry>()

export async function getPlatformConfig<T>(key: string, fallback: T): Promise<T> {
  // Step 1: cache hit within TTL
  const entry = cache.get(key)
  const now = Date.now()
  if (entry && entry.expiresAt > now) {
    return entry.value as T
  }
  // ... fetch from upstream + cache + return
}
```

**Fetch wrapper excerpt to mirror** (from `src/lib/carriers/envia-api.ts:35-47`):
```typescript
export async function fetchEnviaStatus(
  guia: string
): Promise<EnviaStatusResponse | null> {
  try {
    const res = await fetch(`${ENVIA_STATUS_URL}/${guia}`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    return (await res.json()) as EnviaStatusResponse
  } catch {
    return null
  }
}
```

**Deviations:**
- Cache keyed by `Env` ('test' | 'prod') — `Map<Env, TokenEntry>` not `Map<string, CacheEntry>`
- TTL = 55min hardcoded (D-13) instead of 30s. DO NOT read `expires_in` from response (Pitfall 1 — Coordinadora's PDF shows it as quoted string `"3599"`)
- Basic Auth header construction via `Buffer.from(`${clientId}:${clientSecret}`).toString('base64')` (RESEARCH Pattern 1)
- Accept BOTH `access_token` AND `acces_token` keys (PDF typo, Pitfall 1)
- On error: `throw new Error('Coordinadora /oauth/token <status>: <text>')` — caller (Inngest function with retries=2) handles retry; do NOT swallow
- Exported test helper `_resetTokenCacheForTests()` (RESEARCH Pattern 1)

**Risk:** MEDIUM — token race during cold-start storms (Pitfall 7). D-13 explicitly accepts extra refreshes; no mutex.

---

### `src/lib/carriers/coordinadora/{cotizar,create-guia,imprimir-etiqueta}.ts` (service wrappers)

**Primary analog:** `src/lib/carriers/envia-api.ts:35-47` (the entire file is the canonical thin-wrapper pattern)

**Pattern to copy** (each wrapper, RESEARCH Pattern §Cotizar wrapper):
```typescript
import { getToken, BASE_URLS } from './client'
import type { CotizarRequest, CotizarResponse } from './types'

export async function cotizar(
  req: CotizarRequest,
  env: 'test' | 'prod' = (process.env.COORDINADORA_ENV ?? 'test') as 'test' | 'prod'
): Promise<CotizarResponse> {
  const token = await getToken(env)
  const res = await fetch(`${BASE_URLS[env]}/cotizador/nacional`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '<unreadable>')
    throw new Error(`Coordinadora /cotizador/nacional ${res.status}: ${text}`)
  }
  return (await res.json()) as CotizarResponse
}
```

**Deviations:**
- Unlike envia (`return null` on error), Coordinadora wrappers `throw` — Inngest function handles retry semantics (RESEARCH "Don't Hand-Roll" §Retry)
- 15s timeout for cotizar/createGuia (vs 10s envia) because Coordinadora's prod latency is unknown
- `createGuia` body discriminated union: `GuiaEstandar (nivelServicio:1)` | `GuiaRCE (nivelServicio:22)` (PDF dictionary)
- `imprimirEtiqueta` body: `{ tipo_etiqueta: "55", guias: string[] }` returns base64 PDF (PDF Servicio etiquetas)

**Risk:** LOW — exact pattern match.

---

### `src/lib/carriers/coordinadora/types.ts` (type definitions)

**Primary analog:** `src/lib/carriers/envia-api.ts:10-28` (inline interfaces; for the Coordinadora module, extracted to standalone `types.ts` because there are 6+ shapes)

**Pattern to mirror** (from `src/lib/carriers/envia-api.ts:10-28`):
```typescript
export interface EnviaStatusNovedad {
  cod_novedad: number
  novedad: string
  fecha: string
  mca_estado: string
  detalle?: string
}

export interface EnviaStatusResponse {
  estado: string
  cod_estadog: number
  fec_recoleccion: string | null
  fec_despacho: string | null
  // ...
  novedades: EnviaStatusNovedad[]
  [key: string]: unknown
}
```

**Required types (per RESEARCH + PDFs):**
- `CotizarRequest` / `CotizarResponse` (flete + dias_entrega)
- `GuiaEstandarRequest` / `GuiaRCERequest` (discriminated on `nivelServicio`)
- `GuiaResponse` (numero_guia 11 dígitos)
- `ImprimirEtiquetaRequest` (`{ tipo_etiqueta, guias[] }`) / `ImprimirEtiquetaResponse` (base64)

**Risk:** LOW — pure types, no runtime behavior.

---

### `src/lib/carriers/coordinadora/status-codes.ts` (enum + mapping)

**No exact analog in carriers/.** Pattern is a standard `const` record + lookup function.

**Pattern to use** (verbatim from RESEARCH "Code Examples"):
```typescript
export const COORDINADORA_STATUS_CODES = {
  '0': 'GUIA_NO_EXISTE',
  '1': 'A_RECIBIR_POR_COORDINADORA',
  // ... 7 omitted intentionally (Pitfall 9)
  '8': 'CERRADO_INCIDENCIA',
  '9': 'EN_PUNTO_DROP',
} as const

export type CoordinadoraStatusLabel =
  typeof COORDINADORA_STATUS_CODES[keyof typeof COORDINADORA_STATUS_CODES]

export function mapStatusCode(codigo: string): CoordinadoraStatusLabel | 'DESCONOCIDO' {
  return (COORDINADORA_STATUS_CODES as Record<string, CoordinadoraStatusLabel>)[codigo]
    ?? 'DESCONOCIDO'
}

export const COORDINADORA_NOVEDAD_CODES: Record<string, string> = {
  '801': 'Pedido Cancelado',  // only confirmed code; D-20 discover-on-the-go
}
```

**Deviations from analog:** N/A — pure data.

**Risk:** LOW.

---

### `src/lib/carriers/coordinadora/pub-sub-envelope.ts` (type-guard + decode)

**No exact analog** for Pub/Sub specifically. Closest pattern: payload-shape validation in webhook handlers.

**Pattern to use** (verbatim from RESEARCH Pattern 2 — pre-approved by user via D-10):
```typescript
export interface PubSubEnvelope {
  message: {
    data: string                    // base64-encoded JSON payload
    messageId?: string
    publishTime?: string
    attributes?: Record<string, string>
    orderingKey?: string
  }
  subscription?: string
  deliveryAttempt?: number
}

export function isPubSubEnvelope(value: unknown): value is PubSubEnvelope {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (typeof v.message !== 'object' || v.message === null) return false
  const m = v.message as Record<string, unknown>
  return typeof m.data === 'string' && m.data.length > 0
}

export function decodePubSubPayload(envelope: PubSubEnvelope): CoordinadoraEvent | null {
  let rawJson: string
  try {
    rawJson = Buffer.from(envelope.message.data, 'base64').toString('utf-8')
  } catch { return null }
  let parsed: unknown
  try { parsed = JSON.parse(rawJson) } catch { return null }
  if (typeof parsed !== 'object' || parsed === null) return null
  const p = parsed as Record<string, unknown>
  if (
    typeof p.tracking_number !== 'string' ||
    typeof p.codigo !== 'string' ||
    typeof p.fecha !== 'string' ||
    typeof p.hora !== 'string'
  ) return null
  return parsed as CoordinadoraEvent
}
```

**Risk:** LOW — type-guard pattern; tested via `__tests__/pub-sub-envelope.test.ts` using fixture from PDF page 1+2.

---

### `src/lib/domain/carrier-events.ts` (EXTEND with `recordCoordinadoraEvent`)

**Primary analog (same file):** `src/lib/domain/carrier-events.ts:50-81` (existing `insertCarrierEvent`)

**Secondary analog (idempotent upsert with ignoreDuplicates):** `src/lib/domain/crm-mutation-idempotency.ts:90-122`

**Existing `insertCarrierEvent` pattern to mirror** (from `src/lib/domain/carrier-events.ts:50-81`):
```typescript
export async function insertCarrierEvent(
  ctx: DomainContext,
  params: InsertCarrierEventParams
): Promise<DomainResult<{ id: string }>> {
  const supabase = createAdminClient()
  try {
    const { data, error } = await supabase
      .from('order_carrier_events')
      .insert({
        workspace_id: ctx.workspaceId,
        order_id: params.orderId,
        guia: params.guia,
        carrier: params.carrier,
        estado: params.estado,
        cod_estado: params.codEstado,
        novedades: params.novedades,
        raw_response: params.rawResponse,
      })
      .select('id')
      .single()
    if (error) {
      return { success: false, error: `INSERT carrier event: ${error.message} (${error.code})` }
    }
    return { success: true, data: { id: data.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
```

**Idempotent upsert pattern to apply** (from `src/lib/domain/crm-mutation-idempotency.ts:99-122`):
```typescript
const { data, error } = await supabase
  .from('crm_mutation_idempotency_keys')
  .upsert(
    {
      workspace_id: ctx.workspaceId,
      tool_name: params.toolName,
      key: params.key,
      result_id: params.resultId,
      result_payload: params.resultPayload as never,
    },
    { onConflict: 'workspace_id,tool_name,key', ignoreDuplicates: true },
  )
  .select('workspace_id')

if (error) return { success: false, error: error.message }
return {
  success: true,
  data: { inserted: Array.isArray(data) && data.length > 0 },
}
```

**Deviations for `recordCoordinadoraEvent`:**
- Combine both: pre-lookup `orders` by `tracking_number` (D-22 — order_id may be null), then `.upsert({ignoreDuplicates:true})` against composite UNIQUE INDEX
- `onConflict` clause must match the partial UNIQUE INDEX name from migration (RESEARCH proposes: `idx_carrier_events_coordinadora_idempotency` with `COALESCE(codigo_estado, '')` — see Migration section)
- Set `order_id = order?.id ?? null` (additive migration relaxes NOT NULL — Pitfall 5)
- Add `source: ctx.source` ('webhook:coordinadora') for audit trail
- Set `carrier: 'coordinadora'` literal (so the partial index `WHERE carrier='coordinadora'` matches)
- Return `DomainResult<{ id: string; inserted: boolean }>` — caller (route handler) dispatches Inngest ONLY when `inserted=true`

**DO NOT touch existing `insertCarrierEvent`** — it remains the canonical path for Envia polling (different shape, no idempotency required because cron already guards via `getLastCarrierEvent`).

**Risk:** MEDIUM — schema migration is a prerequisite (Regla 5 PAUSE step required before push); upsert+`ignoreDuplicates` returns `[]` on conflict so caller logic must handle "row exists but I need its id" (defensive fetch via SELECT after — see RESEARCH lines 678-696).

---

### `src/inngest/functions/coordinadora-webhook-process.ts` (async processor)

**Primary analog (concurrency + observability collector + step.run):** `src/inngest/functions/recompra-preload-context.ts:53-269`

**Secondary analog (simpler structure, single step.run + agent_observability insert):** `src/inngest/functions/bold-upstream-broken.ts:28-62`

**Concurrency + observability setup excerpt** (from `src/inngest/functions/recompra-preload-context.ts:53-132`):
```typescript
export const recompraPreloadContext = inngest.createFunction(
  {
    id: 'recompra-preload-context',
    name: 'Recompra: Preload CRM Context via Reader',
    retries: 1,
    concurrency: [{ key: 'event.data.sessionId', limit: 1 }],
  },
  { event: 'recompra/preload-context' },
  async ({ event, step }) => {
    const { sessionId, contactId, workspaceId, invoker } = event.data

    // ---- Feature flag (defense-in-depth) ----
    const { getPlatformConfig } = await import('@/lib/domain/platform-config')
    const enabled = await getPlatformConfig<boolean>(FEATURE_FLAG_KEY, false)
    if (!enabled) {
      logger.info({ sessionId }, 'feature flag off, skipping')
      return { status: 'skipped' as const, reason: 'feature_flag_off' as const }
    }

    // ---- Observability setup ----
    const collector = isObservabilityEnabled()
      ? new ObservabilityCollector({
          conversationId: realConversationId ?? `synthetic-${sessionId}`,
          workspaceId,
          agentId: 'crm-reader',
          turnStartedAt: new Date(),
          triggerKind: 'system_event',
        })
      : null
```

**step.run + __obs merge pattern** (from `src/inngest/functions/recompra-preload-context.ts:135-236`):
```typescript
const stepResult = await step.run('call-reader-and-persist', async () => {
  const stepCollector = collector ? new ObservabilityCollector({ /* ... */ }) : null
  const run = async () => {
    // ... actual work ...
    return result
  }
  const result = stepCollector ? await runWithCollector(stepCollector, run) : await run()
  return {
    readerResult: result,
    __obs: stepCollector
      ? { events: stepCollector.events, queries: stepCollector.queries, aiCalls: stepCollector.aiCalls }
      : null,
  }
})

// ---- Observability merge (__obs survives step.run replays) ----
if (collector && stepResult.__obs) {
  collector.mergeFrom(stepResult.__obs)
}

// ---- D-16 observability events (emitted in outer scope, NOT inside step.run) ----
collector?.recordEvent('pipeline_decision', 'crm_reader_completed', { /* ... */ })

// ---- Flush collector as last step ----
if (collector) {
  await step.run('observability-flush', async () => {
    await collector.flush()
  })
}
```

**Simpler `step.run` + `agent_observability_events` insert pattern** (from `src/inngest/functions/bold-upstream-broken.ts:47-55`):
```typescript
const supabase = createAdminClient()
await step.run('log-to-observability', async () => {
  await supabase.from('agent_observability_events').insert({
    workspace_id: workspaceId,
    event_type: 'bold_robot_upstream_broken',
    agent_id: 'bold-robot',
    payload: { consecutiveFailures, lastErrorMessage, detectedAt },
  })
})
```

**Deviations for coordinadora-webhook-process:**
- `concurrency: [{ key: 'event.data.trackingNumber', limit: 1 }]` — RESEARCH Pattern 5
- `retries: 2` (vs recompra's 1) — Pub/Sub redelivery means transient persistence/observability failures should retry more aggressively
- Event name: `'coordinadora/webhook.received'` (D-08)
- `agentId: 'coordinadora-webhook'` (D-27 namespace `coordinadora_*`)
- Event payload type: `{ env, workspaceId, eventRowId, trackingNumber, codigo, codigoEstado }`
- V1 downstream is minimal: just emit `pipeline_decision:coordinadora_webhook_processed` + log. Business logic (auto-stage-move, notify agent) is V1.1 (RESEARCH explicit)
- PII redaction in observability: `trackingNumber.slice(-4)` (D-28)

**Risk:** LOW — pattern is canon (used by recompra, pw-confirmation, bold).

---

### `src/inngest/events.ts` (EXTEND with `CoordinadoraWebhookEvents`)

**Analog (same file):** existing `AgentEvents` type union at `src/inngest/events.ts:21+`

**Pattern to mirror** (from `src/inngest/events.ts:21-47`):
```typescript
export type AgentEvents = {
  'agent/session.started': {
    data: {
      sessionId: string
      workspaceId: string
      agentId: string
      conversationId: string
      contactId: string
      mode: string
    }
  }
  'agent/customer.message': {
    data: {
      sessionId: string
      // ...
    }
  }
}
```

**Add (likely new union or extension):**
```typescript
export type CoordinadoraWebhookEvents = {
  'coordinadora/webhook.received': {
    data: {
      env: 'test' | 'prod'
      workspaceId: string
      eventRowId: string
      trackingNumber: string
      codigo: string
      codigoEstado: string | null
    }
  }
}
```

**Deviations:** Check existing pattern for how multiple unions are combined (likely a top-level intersect or registration in `src/inngest/client.ts` — planner verifies). Memory note: `(inngest.send as any)` type assertion for custom event types may be used.

**Risk:** LOW — type-only change.

---

### `supabase/migrations/YYYYMMDD_coordinadora_carrier_events_extension.sql` (additive migration)

**Primary analog (additive ALTER + indexes + comments):** `supabase/migrations/20260429180001_orders_closed_at.sql` (additive column with index) — but most directly modeled on:
**Secondary analog (creates a partial unique index with COALESCE pattern):** N/A in codebase; pattern is canonical SQL — use RESEARCH §Schema Migration Proposal verbatim.

**Tertiary analog (idempotency table reference for GRANT + COMMENT style):** `supabase/migrations/20260429180000_crm_mutation_idempotency_keys.sql:44-50`

**Pattern to mirror — GRANTs explicit + COMMENT trailers** (from `supabase/migrations/20260420000443_platform_config.sql:23-36`):
```sql
-- ──────────────────────────────────────────────────────────────────────────
-- Corrective: grants explicitos
-- ──────────────────────────────────────────────────────────────────────────
-- Tablas creadas via Supabase Studio SQL Editor NO reciben grants automaticos
-- para el service_role ni para authenticated...
-- LEARNING propagado: toda migracion futura que cree una tabla debe incluir
-- GRANTs explicitos aqui mismo...
GRANT ALL    ON TABLE public.platform_config TO service_role;
GRANT SELECT ON TABLE public.platform_config TO authenticated;
```

→ For Coordinadora: NO new tables (only ALTER), so no fresh GRANTs needed. But verify `order_carrier_events` already has them (from migration 20260410000003) — it does.

**Migration SQL to use** (verbatim from RESEARCH §Schema Migration Proposal):
```sql
-- 1. Relax order_id (D-22)
ALTER TABLE order_carrier_events
  ALTER COLUMN order_id DROP NOT NULL;

-- 2. Add Coordinadora columns (NULLable)
ALTER TABLE order_carrier_events
  ADD COLUMN IF NOT EXISTS tracking_number TEXT,
  ADD COLUMN IF NOT EXISTS fecha           DATE,
  ADD COLUMN IF NOT EXISTS hora            TEXT,
  ADD COLUMN IF NOT EXISTS codigo          TEXT,
  ADD COLUMN IF NOT EXISTS codigo_estado   TEXT,
  ADD COLUMN IF NOT EXISTS codigo_novedad  TEXT,
  ADD COLUMN IF NOT EXISTS nit_cliente     TEXT,
  ADD COLUMN IF NOT EXISTS div_cliente     TEXT,
  ADD COLUMN IF NOT EXISTS vinculo_guia    TEXT,
  ADD COLUMN IF NOT EXISTS source          TEXT,
  ADD COLUMN IF NOT EXISTS env             TEXT;

-- 3. Backfill source for existing Envia rows
UPDATE order_carrier_events
SET source = 'cron:envia'
WHERE source IS NULL AND carrier ILIKE '%envia%';

-- 4. Composite UNIQUE INDEX (D-07) — partial with COALESCE
CREATE UNIQUE INDEX IF NOT EXISTS idx_carrier_events_coordinadora_idempotency
  ON order_carrier_events (
    workspace_id, tracking_number, fecha, hora, codigo,
    COALESCE(codigo_estado, '')
  )
  WHERE carrier = 'coordinadora';

-- 5. Indexes for query perf
CREATE INDEX IF NOT EXISTS idx_carrier_events_tracking_number
  ON order_carrier_events(tracking_number)
  WHERE tracking_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_carrier_events_nit_cliente
  ON order_carrier_events(nit_cliente)
  WHERE nit_cliente IS NOT NULL;
```

**Deviations from analog migration** (`20260410000003_order_carrier_events.sql`):
- No CREATE TABLE — only ALTER (additive, non-breaking)
- No RLS changes (existing policies cover new columns)
- No new GRANTs (existing table already granted)
- Filename convention: `YYYYMMDD` per Regla 5; plan-phase picks the actual date

**CRITICAL — Regla 5 enforcement:** This migration MUST be applied in prod BEFORE pushing any code that references the new columns. Plan-phase MUST include explicit PAUSE step.

**Risk:** MEDIUM — `ALTER COLUMN ... DROP NOT NULL` is irreversible without restoring data; no consumer currently requires NOT NULL on `order_id` (verified: `insertCarrierEvent` always passes orderId, `getLastCarrierEvent`/`getCarrierEventsByOrder` filter by orderId, so null rows are invisible to existing queries).

---

### `supabase/migrations/YYYYMMDD_seed_coordinadora_api_v2_flag.sql` (feature flag seed)

**Primary analog (verbatim template):** `supabase/migrations/20260421155713_seed_recompra_crm_reader_flag.sql`

**Pattern to copy verbatim with key swap** (from `supabase/migrations/20260421155713_seed_recompra_crm_reader_flag.sql:1-19`):
```sql
-- Seed feature flag for somnio-recompra-crm-reader integration phase.
-- Default: false (Regla 6 — protect production agent until explicit user activation).
-- Consumer: src/lib/domain/platform-config.ts:96-154 via getPlatformConfig<boolean>(key, false).
--
-- Idempotent: re-runs leave state unchanged (ON CONFLICT DO NOTHING).
-- Activation: UPDATE platform_config SET value='true'::jsonb WHERE key='somnio_recompra_crm_reader_enabled';
-- Rollback: UPDATE platform_config SET value='false'::jsonb WHERE key='somnio_recompra_crm_reader_enabled';

INSERT INTO platform_config (key, value)
VALUES ('somnio_recompra_crm_reader_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- GRANTs explicitos (LEARNING 1 Phase 44.1 — ...)
GRANT ALL ON TABLE platform_config TO service_role;
GRANT SELECT ON TABLE platform_config TO authenticated;
```

**Deviations:**
- Swap key `'somnio_recompra_crm_reader_enabled'` → `'coordinadora_api_v2_enabled'`
- Comment block: reference D-24 instead of recompra phase
- **Per-workspace nuance:** RESEARCH says per-workspace, but current `platform_config` schema is platform-wide (no workspace_id column). Planner must decide:
  - **Option A (recommended):** keep platform-wide for V1 — `coordinadora_api_v2_enabled` is a global boolean; V1 only Somnio anyway (D-01). Matches recompra pattern.
  - **Option B:** add `workspace_id UUID NULL` column to `platform_config` (deferred per platform-config.ts header comment "DELIBERADAMENTE POSPUESTA"). NOT recommended for this standalone — out of scope.
- Activation comment: `UPDATE platform_config SET value='true'::jsonb WHERE key='coordinadora_api_v2_enabled';`

**Risk:** LOW — verbatim template clone.

---

### `src/lib/carriers/coordinadora/__tests__/client-token-cache.test.ts` + others (unit tests)

**Primary analog (supabase admin mock + chained method pattern):** `src/lib/domain/__tests__/conversations.test.ts:12-56`

**Secondary analog (Inngest function test with module mocks):** `src/inngest/functions/__tests__/recompra-preload-context.test.ts`

**Supabase mock chain pattern to mirror** (from `src/lib/domain/__tests__/conversations.test.ts:12-34`):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Supabase admin client mock --------------------------------------------
const singleMock = vi.fn()
const eqMock = vi.fn(() => ({ eq: eqMock, single: singleMock }))
const selectMock = vi.fn(() => ({ eq: eqMock }))
const fromMock = vi.fn(() => ({ select: selectMock }))
const createAdminClientMock = vi.fn(() => ({ from: fromMock }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClientMock(),
}))

import { getConversationChannel } from '@/lib/domain/conversations'

beforeEach(() => {
  vi.clearAllMocks()
  eqMock.mockImplementation(() => ({ eq: eqMock, single: singleMock }))
  selectMock.mockImplementation(() => ({ eq: eqMock }))
  fromMock.mockImplementation(() => ({ select: selectMock }))
  createAdminClientMock.mockImplementation(() => ({ from: fromMock }))
})
```

**Test cases by file:**
- `client-token-cache.test.ts` — mock `global.fetch`; test TTL hit, miss + refresh, error → throw, both `access_token` and `acces_token` keys accepted. Use `_resetTokenCacheForTests()` in `beforeEach`.
- `pub-sub-envelope.test.ts` — fixtures from PDF page 1 (entregada, no novedad) + PDF page 2 (cancelada, with novedad). Test envelope guard, decode happy path, decode rejects on missing fields.
- `status-codes.test.ts` — table-driven test of all 9 codes; assert `mapStatusCode('7')` returns `'DESCONOCIDO'` (Pitfall 9).
- `route.test.ts` (webhook integration) — mock domain layer + inngest; test 404 on invalid env, 400 on non-envelope, 200 on valid + new event (fires `inngest.send`), 200 on duplicate (no `inngest.send`), 500 on persistence error.

**Deviations:**
- For `client-token-cache.test.ts` — use vitest `vi.useFakeTimers()` to test TTL expiry deterministically
- For `route.test.ts` — mock `@/inngest/client` and assert `inngest.send` called with correct event name + payload shape

**Risk:** LOW — supabase mock pattern is well-established.

---

## Shared Patterns

### Pattern A: Logger
**Source:** `src/lib/audit/logger.ts` (used everywhere — `createModuleLogger`)
**Apply to:** All new files (route handler, client.ts, inngest function, domain extension)
```typescript
import { createModuleLogger } from '@/lib/audit/logger'
const logger = createModuleLogger('coordinadora-<module-name>')
```

### Pattern B: Domain context (Regla 3)
**Source:** `src/lib/domain/types.ts:15-27`
**Apply to:** Domain layer extension `carrier-events.ts` `recordCoordinadoraEvent`
```typescript
const ctx: DomainContext = {
  workspaceId,
  source: 'webhook:coordinadora',  // new source value (extends the union comment in types.ts)
}
```

### Pattern C: Feature flag check (Regla 6)
**Source:** `src/lib/domain/platform-config.ts:96-154` + `src/inngest/functions/recompra-preload-context.ts:64-73`
**Apply to:** Caller of `cotizar`/`createGuia`/`imprimirEtiqueta` (NOT the webhook receiver — D-25 says webhook runs always)
```typescript
const { getPlatformConfig } = await import('@/lib/domain/platform-config')
const enabled = await getPlatformConfig<boolean>('coordinadora_api_v2_enabled', false)
if (!enabled) {
  // Fall back to robot Railway / scraping path
  return { status: 'skipped', reason: 'feature_flag_off' }
}
```

### Pattern D: Observability emit (D-27)
**Source:** `src/inngest/functions/bold-upstream-broken.ts:47-55` (simple insert) + `src/inngest/functions/recompra-preload-context.ts:240-258` (collector.recordEvent)
**Apply to:** `src/inngest/functions/coordinadora-webhook-process.ts`
**For simple events (no collector context):**
```typescript
const supabase = createAdminClient()
await supabase.from('agent_observability_events').insert({
  workspace_id: workspaceId,
  event_type: 'coordinadora_webhook_processed',  // D-34 — coordinadora_* prefix
  agent_id: 'coordinadora-webhook',
  payload: { /* PII-redacted — trackingNumber.slice(-4) only */ },
})
```
**For collector context:**
```typescript
collector?.recordEvent('pipeline_decision', 'coordinadora_webhook_processed', {
  env,
  trackingNumber: trackingNumber.slice(-4),  // D-28 PII redaction
  codigo,
  codigoEstado,
  eventRowId,
})
```

### Pattern E: Inngest await dispatch (CRITICAL — memory rule)
**Source:** RESEARCH explicit + MEMORY.md "NEVER fire-and-forget inngest.send"
**Apply to:** Webhook route handler after successful domain insert
```typescript
await inngest.send({
  name: 'coordinadora/webhook.received',
  data: { env, workspaceId, eventRowId, trackingNumber, codigo, codigoEstado },
})
```
ALWAYS `await` — never bare `inngest.send(...)`.

### Pattern F: Regla 3 enforcement (no createAdminClient outside domain)
**Source:** CLAUDE.md Regla 3 + repeated across all agent module scopes
**Verifiable grep:** `grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/carriers/coordinadora/ src/app/api/webhooks/coordinadora/` should return 0 matches. Only `src/lib/domain/carrier-events.ts` (existing) imports `createAdminClient`.

---

## No Analog Found

| File | Role | Data Flow | Reason | Recommendation |
|------|------|-----------|--------|----------------|
| `src/lib/carriers/coordinadora/tenant.ts` (V1 hardcoded `nit → workspace_id` map) | pure resolver | transform | No existing tenant-by-NIT lookup pattern in codebase. Closest is multi-workspace lookup via `phone_number_id` in `whatsapp/route.ts:51-69` but that's DB-based, not in-code constant map. | Use RESEARCH Pattern 6 verbatim (single-file `Record<string,string>` constant + `resolveWorkspaceFromNit` function). V2 will replace with DB table lookup. |
| `src/lib/carriers/coordinadora/env.ts` (validated env-var reader) | env reader | n/a | No standardized env-reader module in repo (most files read `process.env.X` inline). | Optional — can keep inline reads in `client.ts` if simpler. Plan-phase decides. |

---

## Cross-Reference Map (file → which patterns apply)

| File | Patterns Applied |
|------|------------------|
| `app/api/webhooks/coordinadora/[env]/route.ts` | A (logger), E (await inngest.send), Pattern 3 (Next 15 Promise params) |
| `src/lib/carriers/coordinadora/client.ts` | A (logger), F (no createAdminClient — outbound only), Pattern 1 (Map cache + AbortSignal) |
| `src/lib/carriers/coordinadora/cotizar.ts` + 2 siblings | Mirror envia-api.ts fetch wrapper |
| `src/lib/domain/carrier-events.ts` (recordCoordinadoraEvent) | B (DomainContext), existing `insertCarrierEvent` + `upsert({ignoreDuplicates:true})` |
| `src/inngest/functions/coordinadora-webhook-process.ts` | A, C (feature flag — optional defense-in-depth), D (observability), step.run + __obs merge |
| Migration `*_coordinadora_carrier_events_extension.sql` | RESEARCH §Schema Migration Proposal verbatim; Regla 5 enforced via plan-phase PAUSE |
| Seed migration `*_seed_coordinadora_api_v2_flag.sql` | EXACT clone of recompra seed |
| Tests | conversations.test.ts mock chain + recompra-preload-context.test.ts function-test scaffolding |

---

## Metadata

**Analog search scope:** `src/lib/carriers/`, `src/lib/domain/`, `src/app/api/webhooks/`, `src/app/api/v1/`, `src/inngest/functions/`, `src/inngest/`, `supabase/migrations/`, `src/lib/audit/`, `src/lib/agents/production/` (webhook-processor reference), `src/lib/domain/__tests__/`, `src/inngest/functions/__tests__/`

**Files scanned (read in full or critical sections):**
- `src/lib/carriers/envia-api.ts` (full)
- `src/lib/domain/carrier-events.ts` (full)
- `src/lib/domain/platform-config.ts` (full)
- `src/lib/domain/crm-mutation-idempotency.ts` (full)
- `src/lib/domain/types.ts` (full)
- `src/lib/domain/__tests__/conversations.test.ts` (partial — mock pattern)
- `src/app/api/webhooks/whatsapp/route.ts` (full)
- `src/app/api/webhooks/shopify/route.ts` (partial — verification + dispatch)
- `src/app/api/v1/tools/[toolName]/route.ts` (partial — Next 15 Promise params)
- `src/inngest/functions/envia-status-polling.ts` (full)
- `src/inngest/functions/recompra-preload-context.ts` (full)
- `src/inngest/functions/bold-upstream-broken.ts` (full)
- `src/inngest/events.ts` (partial — type union pattern)
- `supabase/migrations/20260410000003_order_carrier_events.sql` (full)
- `supabase/migrations/20260420000443_platform_config.sql` (full)
- `supabase/migrations/20260421155713_seed_recompra_crm_reader_flag.sql` (full)
- `supabase/migrations/20260429180000_crm_mutation_idempotency_keys.sql` (full)

**Pattern extraction date:** 2026-05-26

**Standalone:** coordinadora-api-integration

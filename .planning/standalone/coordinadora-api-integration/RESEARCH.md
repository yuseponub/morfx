# Research: Coordinadora API Integration

**Researched:** 2026-05-26
**Standalone:** coordinadora-api-integration
**Domain:** Vercel serverless webhooks + OAuth2 client_credentials + Next.js 15 App Router + Pub/Sub push receiver
**Overall confidence:** HIGH (Vercel/Next.js patterns, Pub/Sub envelope, codebase patterns all verified). MEDIUM where Coordinadora's exact behavior is undocumented (D-37 — token race semantics, retry intervals).

---

## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01..D-37)

Every decision in `CONTEXT.md` is locked. Most relevant to research/planning:

- **D-04:** Webhook paths = `/api/webhooks/coordinadora/test` y `/api/webhooks/coordinadora/prod` via `[env]` dynamic segment.
- **D-06:** App Router file = `app/api/webhooks/coordinadora/[env]/route.ts`; `env: 'test' | 'prod'` validado contra union literal.
- **D-07:** Idempotency key = composite `(workspace_id, tracking_number, fecha, hora, codigo, codigo_estado)`. Hora granularidad microsegundo.
- **D-08:** Pipeline = decode → validate → persist → 200 inmediato → Inngest async para downstream.
- **D-09:** Multi-tenant via `nit_cliente` del payload (V1 hardcoded Somnio NIT `902052328`; V2 mapping table).
- **D-10:** Sin auth en el endpoint. Sin firma HMAC. Mitigación = validación estricta de envelope + idempotencia.
- **D-12:** Cliente HTTP en `src/lib/carriers/coordinadora/` (carpeta nueva separada de `robot-coordinadora/`).
- **D-13:** Token cache **en memoria por proceso**, TTL 55min.
- **D-14:** 3 wrappers públicos — `cotizar`, `createGuia`, `imprimirEtiqueta`. Cada uno llama `getToken()` internamente.
- **D-15..D-17:** Env vars `COORDINADORA_*`; base URLs hardcoded (`api-test.coordinadora.tech` / `api.coordinadora.tech`); `COORDINADORA_ENV` discriminador.
- **D-21:** Reusar tabla `order_carrier_events` (existe).
- **D-22:** `order_id` puede ser `null` (webhook llega antes que la order o sin match).
- **D-23:** Domain layer obligatorio — `src/lib/domain/carrier-events.ts` ya existe; extender.
- **D-24:** Feature flag `coordinadora_api_v2_enabled` en `platform_config` per-workspace.
- **D-25:** Robot Railway permanece intacto; coexistencia opt-in.
- **D-26:** Cutover prod ≥ 8-jun-2026 (post-ERP Coordinadora 27-may→5-jun).
- **D-27:** Eventos `pipeline_decision:coordinadora_*` a `agent_observability_events`.
- **D-32:** Standalone `coordinadora-status-polling` queda OBSOLETO.

### Claude's Discretion

- **D-33:** Estructura interna `src/lib/carriers/coordinadora/` — research recomienda layout (ver §Architecture Patterns).
- **D-34:** Naming exacto eventos observability (research propone catálogo).
- **D-35:** Schema migration aditiva si se requiere (research la propone, ver §Schema Migration Proposal).
- **D-36:** Rate limit del webhook (research recomienda no implementar V1 — idempotencia protege).

### Deferred Ideas (OUT OF SCOPE)

Reemplazo del robot Railway, anulación de guías, reimpresión sin re-call, cotizaciones México, UI per-workspace, catálogos completos, multi-tenant table real, dashboard salud Coordinadora.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| (no IDs from REQUIREMENTS.md — standalone derives requirements from CONTEXT.md decisions D-01..D-37) |

---

## Executive Summary

This standalone integrates 4 Coordinadora REST endpoints (OAuth token, cotizador, guías, etiquetas) and a Google Cloud Pub/Sub push receiver in Vercel/Next.js. The integration is a thin fetch wrapper following the existing `envia-api.ts` pattern — no new dependencies — with a separate webhook receiver that responds 200 fast and dispatches downstream work via Inngest.

**Primary recommendation:** Build it as 4 thin layers — (1) `src/lib/carriers/coordinadora/` with native `fetch` + `AbortSignal.timeout`, (2) one module-scoped Map for token cache (no Redis/KV — D-13 lock), (3) `app/api/webhooks/coordinadora/[env]/route.ts` that validates Pub/Sub envelope, calls domain layer for idempotent insert, returns 200, and `await inngest.send(...)`, (4) extend `src/lib/domain/carrier-events.ts` with `recordCoordinadoraEvent()` doing `INSERT ... ON CONFLICT DO NOTHING` against a unique index. The biggest implementation landmines are: (a) `order_carrier_events.order_id` is currently `NOT NULL` with FK — D-22 requires an additive migration to allow `null`, (b) Next.js 15 `params` is now `Promise<{ env }>` — must `await`, (c) Inngest `inngest.send()` must be `await`-ed (memory rule re: fire-and-forget).

**What's locked:** all 37 D-decisions from CONTEXT.md. Research does NOT explore alternatives to them. **What's discretional:** internal folder structure (D-33), observability event names (D-34), migration column names (D-35), rate-limit policy (D-36).

**Risk profile:** LOW for HTTP client + webhook receiver (proven Vercel patterns). MEDIUM for token cache cold-start races (mitigation = accept extra requests; Coordinadora doesn't document a rate limit). MEDIUM for D-22 schema change (additive but FK relaxation is irreversible without restoring data).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| OAuth2 token exchange | API/Backend (Vercel function) | — | Outbound HTTPS call from Vercel; secrets in env vars (D-15) |
| Token caching | API/Backend (in-memory per Vercel instance) | — | D-13 explicit: per-process, no Redis. Cold-start refresh acceptable |
| Cotizar / createGuia / imprimirEtiqueta calls | API/Backend (Vercel function or Inngest step) | — | Initiated by server actions or Inngest functions — no client-side calls |
| Pub/Sub webhook receiver | API/Backend (Vercel route handler) | — | HTTPS POST receiver, must respond <5s (D-08), <15s default maxDuration |
| Idempotent event persistence | Database (Postgres unique index) | Domain layer wrapper | Race-safe via `ON CONFLICT DO NOTHING`; never application-level mutex |
| Downstream processing (notify agent, automation) | Inngest function (async) | — | Decouples webhook ACK latency from business logic (D-08) |
| Feature flag check | Database (`platform_config`) + 30s in-memory cache | — | Reuse existing `getPlatformConfig` (`src/lib/domain/platform-config.ts`) |
| Multi-tenant `nit_cliente` → `workspace_id` resolution | API/Backend (constant in code V1, table V2) | — | D-09: V1 hardcoded Somnio, V2 future table |
| Robot Railway coexistence | OS-registered state (Railway) | — | Untouched, opt-in via feature flag (D-25). Webhook receiver runs always (D-25 nota) |

---

## Standard Stack

### Core (already installed — no new deps)

| Library / API | Version | Purpose | Why Standard |
|---------------|---------|---------|--------------|
| Native `fetch` + `AbortSignal.timeout` | Node 22 / Vercel | OAuth + Coordinadora HTTP calls | Pattern used in `src/lib/carriers/envia-api.ts`. Zero deps. |
| `inngest` | `^3.54.0` | Async webhook downstream processing | Established pattern: `recompra-preload-context`, `pw-confirmation-preload-and-invoke`, `bold-upstream-broken`. |
| `@supabase/supabase-js` | `^2.93.1` | Used ONLY in domain layer | D-23 / Regla 3 — never imported in route handler or carrier client directly |
| `pino` (via `@/lib/audit/logger`) | `^10.3.0` | Structured logging | Pattern: `createModuleLogger('coordinadora-webhook')` |
| `next` | `^16.1.6` | App Router route handler | `app/api/webhooks/coordinadora/[env]/route.ts` |
| `vitest` | (dev) | Unit tests | D-29 — token cache, envelope decode, idempotency |

**Installation:** **NONE.** This standalone adds zero npm dependencies. Verified against `package.json` at repo root.

### Supporting (already used elsewhere in codebase)

| Library | Purpose | When to Use |
|---------|---------|-------------|
| `@/lib/observability` (`ObservabilityCollector`, `runWithCollector`, `isObservabilityEnabled`) | Emit `pipeline_decision:coordinadora_*` events (D-27) | In Inngest function downstream step (NOT in webhook ACK path — saves latency) |
| `@/lib/domain/platform-config` (`getPlatformConfig`) | Feature flag `coordinadora_api_v2_enabled` (D-24) | When deciding to use API for guide creation vs scraping robot |

### Alternatives Considered (REJECTED — D-locked)

| Instead of | Could Use | Why Rejected |
|------------|-----------|--------------|
| Module-scoped Map for token cache | Upstash Redis / Vercel KV | D-13 locked: in-memory per process, 55min TTL. Redis would add latency + cost for zero benefit at current volume |
| `oauth4webapi` library for token flow | npm `oauth4webapi` | Client_credentials with Basic Auth is 8 lines of `fetch` — adding a lib increases bundle + maintenance |
| HMAC verification | crypto.timingSafeEqual | D-10: Coordinadora does NOT offer HMAC. The webhook is unauthenticated per spec. Idempotency is the defense |
| Synchronous downstream processing | inline business logic in webhook handler | D-08: ACK fast (<5s), Inngest async dispatch (pattern proven in pw-confirmation-preload-and-invoke) |
| New table `coordinadora_events` | Reuse `order_carrier_events` | D-21 explicit: reuse |

**Version verification:**
```bash
npm view next version       # 16.x current
npm view inngest version    # 3.x current
npm view @supabase/supabase-js version
```
Run before plan-phase locks versions. Current package.json has `next ^16.1.6`, `inngest ^3.54.0`, `@supabase/supabase-js ^2.93.1` — all current as of 2026-05-26.

---

## Architecture Patterns

### System Architecture Diagram

```
                    ┌──────────────────────────────────────────────────────┐
                    │  COORDINADORA INFRASTRUCTURE                         │
                    │  (api-test.coordinadora.tech / api.coordinadora.tech)│
                    └──────────────────────────────────────────────────────┘
                          ▲                                  │
                          │ 1) OAuth + REST                  │ 5) Pub/Sub push
                          │   (we call them)                 │   (they call us)
                          │                                  ▼
   ┌──────────────────────┴──────────┐   ┌──────────────────────────────────┐
   │  src/lib/carriers/coordinadora/ │   │  app/api/webhooks/coordinadora/  │
   │    ├─ client.ts (token cache)   │   │    [env]/route.ts                │
   │    ├─ cotizar.ts                │   │    1. validate env in {test,prod}│
   │    ├─ createGuia.ts             │   │    2. parse Pub/Sub envelope     │
   │    ├─ imprimirEtiqueta.ts       │   │    3. decode base64 → JSON       │
   │    ├─ types.ts                  │   │    4. validate payload shape     │
   │    └─ status-codes.ts (enum)    │   │    5. resolve nit_cliente→ws_id  │
   └─────────────┬───────────────────┘   │    6. domain.recordEvent (ON     │
                 │                       │       CONFLICT DO NOTHING)       │
                 │ called from:          │    7. inngest.send (await)       │
                 │  - server actions     │    8. return 200 (always)        │
                 │  - inngest functions  │                                  │
                 │  - mobile API         │                                  │
                 ▼                       └──────────┬───────────────────────┘
   ┌─────────────────────────────────┐              │ inngest event
   │   Order creation/quote flow     │              ▼
   │   (out of scope — caller        │   ┌──────────────────────────────────┐
   │    invokes coordinadora.*       │   │  src/inngest/functions/          │
   │    based on feature flag)       │   │    coordinadora-webhook-process  │
   └─────────────────────────────────┘   │    1. read event (already        │
                 ▲                       │       persisted, idempotency-safe)│
                 │ feature flag check    │    2. emit pipeline_decision:    │
                 │                       │       coordinadora_*             │
   ┌─────────────┴───────────────────┐   │    3. notify agent / update order│
   │  src/lib/domain/platform-config │   │       (downstream business logic)│
   │   getPlatformConfig(            │   └──────────────────────────────────┘
   │   'coordinadora_api_v2_enabled')│              │
   └─────────────────────────────────┘              │
                                                    ▼
                              ┌─────────────────────────────────────────┐
                              │  src/lib/domain/carrier-events.ts       │
                              │   - insertCarrierEvent (existing)       │
                              │   - recordCoordinadoraEvent (NEW)       │
                              │     INSERT ... ON CONFLICT              │
                              │       (workspace_id, tracking_number,   │
                              │        fecha, hora, codigo,             │
                              │        codigo_estado) DO NOTHING        │
                              └─────────────────────────────────────────┘
                                              │
                                              ▼
                              ┌─────────────────────────────────────────┐
                              │  Postgres: order_carrier_events         │
                              │   + (additive migration) cols:          │
                              │     fecha, hora, codigo, codigo_estado, │
                              │     codigo_novedad, nit_cliente,        │
                              │     div_cliente, vinculo_guia,          │
                              │     tracking_number,                    │
                              │     source ('webhook:coordinadora')     │
                              │   + (relax) order_id NULL allowed       │
                              │   + UNIQUE INDEX composite              │
                              └─────────────────────────────────────────┘
```

### Recommended Project Structure (D-33)

```
src/lib/carriers/coordinadora/
├── client.ts                 # getToken() with module-scoped cache, fetch wrappers
├── cotizar.ts                # cotizar(body: CotizarRequest): Promise<CotizarResponse>
├── create-guia.ts            # createGuia(body: GuiaEstandar | GuiaRCE): Promise<...>
├── imprimir-etiqueta.ts      # imprimirEtiqueta(guias: string[]): Promise<...>
├── types.ts                  # Body / response interfaces (mirror PDF dictionaries)
├── status-codes.ts           # Enum + map (9 estados + 'desconocido' fallback)
├── pub-sub-envelope.ts       # Type guards: isPubSubEnvelope, decodePayload
├── env.ts                    # Validated reader for COORDINADORA_* env vars
└── __tests__/
    ├── client-token-cache.test.ts
    ├── pub-sub-envelope.test.ts
    └── status-codes.test.ts

app/api/webhooks/coordinadora/[env]/
└── route.ts                  # POST handler: 200 fast + dispatch

src/lib/domain/
└── carrier-events.ts          # extend with recordCoordinadoraEvent()

src/inngest/functions/
└── coordinadora-webhook-process.ts  # async downstream processor

src/inngest/
└── events.ts                  # add CoordinadoraWebhookEvents type
```

---

### Pattern 1: Token Cache (D-13 — in-memory per process, 55min TTL)

**What:** module-scoped `Map<env, { token, expiresAt }>` with lazy refresh.

**When to use:** All 3 outbound wrappers (`cotizar`, `createGuia`, `imprimirEtiqueta`) call `getToken(env)` at the start.

**Race-condition policy (D-36 / 8 of focus_areas):** allow extra refreshes during cold-start storms. Coordinadora doesn't document a rate limit on `/oauth/token`, and even 10 parallel refreshes per minute is far below any reasonable rate limit. **Do NOT implement an in-process mutex** — the complexity (Promise<Token> in-flight coalescing) is not worth it for the savings.

**Example (verified pattern from `envia-api.ts` extended):**
```typescript
// src/lib/carriers/coordinadora/client.ts
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('coordinadora-client')

type Env = 'test' | 'prod'

const BASE_URLS: Record<Env, string> = {
  test: 'https://api-test.coordinadora.tech',
  prod: 'https://api.coordinadora.tech',
}

/** Token cache TTL — 55min (5min safety vs 60min real TTL, D-13). */
const TOKEN_TTL_MS = 55 * 60 * 1000

interface TokenEntry {
  token: string
  expiresAt: number
}

/**
 * Module-scoped cache. Lives per-lambda-instance (reset on cold start).
 * One entry per env (test/prod). No cross-instance sync — accept extra
 * refreshes during cold-start storms.
 */
const tokenCache = new Map<Env, TokenEntry>()

export async function getToken(env: Env): Promise<string> {
  const now = Date.now()
  const cached = tokenCache.get(env)
  if (cached && cached.expiresAt > now) {
    // Note: we deliberately do NOT emit observability here per call —
    // cache-hits are 99%+ of calls; emit only on refresh.
    return cached.token
  }

  const clientId = process.env.COORDINADORA_CLIENT_ID
  const clientSecret = process.env.COORDINADORA_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Missing COORDINADORA_CLIENT_ID / COORDINADORA_CLIENT_SECRET')
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(`${BASE_URLS[env]}/oauth/token?grant_type=client_credentials`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '<unreadable>')
    throw new Error(`Coordinadora /oauth/token ${res.status}: ${text}`)
  }

  // PDF response shape (note: API Cotizador PDF shows typo "acces_token";
  // we accept both — Pitfall): { access_token | acces_token, expires_in, token_type }
  const json = (await res.json()) as { access_token?: string; acces_token?: string }
  const token = json.access_token ?? json.acces_token
  if (!token) {
    throw new Error('Coordinadora /oauth/token: missing access_token in response')
  }

  tokenCache.set(env, { token, expiresAt: now + TOKEN_TTL_MS })
  logger.info({ env }, 'coordinadora token refreshed')
  return token
}

/** Test-only helper. Do NOT call from production code. */
export function _resetTokenCacheForTests(): void {
  tokenCache.clear()
}
```

**Pitfall guard:** the PDF for Cotizador shows `"acces_token"` (typo, missing `s`). The PDF for guías shows `"access_token"` (correct). We accept both for safety.

---

### Pattern 2: Pub/Sub Envelope Validation + Decode

**What:** strict type-guard before processing; reject non-Pub/Sub payloads with 400.

**Source:** [Google Cloud Pub/Sub Push docs](https://docs.cloud.google.com/pubsub/docs/push) — envelope is `{ message: { data: <base64>, messageId, publishTime, attributes? }, subscription }`.

**Example (verified canonical envelope from Pub/Sub):**
```typescript
// src/lib/carriers/coordinadora/pub-sub-envelope.ts

export interface PubSubEnvelope {
  message: {
    data: string                    // base64-encoded JSON payload
    messageId?: string
    publishTime?: string             // RFC3339
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

// ---------------------------------------------------------------------------
// Decoded payload — matches PDF "Notificacion-push-Tracking-v3.pdf" examples
// ---------------------------------------------------------------------------

/** Without novedad (delivered event example). PDF page 1. */
export interface CoordinadoraEventWithoutNovedad {
  tracking_number: string           // 11 digits
  referencia: string
  comment: string                    // e.g., "ENTREGADA"
  codigo: string                     // status code as string, see status-codes.ts
  codigo_cliente: string
  fecha: string                      // YYYY-MM-DD
  hora: string                       // HH:MM:SS.microseconds
  anterior: string                   // empty when first event
  referencia_anterior: string        // empty when first event
}

/** With novedad (cancellation example). PDF page 2 — adds 4 fields. */
export interface CoordinadoraEventWithNovedad extends CoordinadoraEventWithoutNovedad {
  codigo_estado: string              // estado actual when novedad fires; PDF: "5"
  desc_estado: string                // human label; PDF: "EN REPARTO"
  nit_cliente: string                // NIT for multi-tenant routing
  div_cliente: string                // division
  vinculo_guia: string               // optional linked guide
}

export type CoordinadoraEvent =
  | CoordinadoraEventWithoutNovedad
  | CoordinadoraEventWithNovedad

export function decodePubSubPayload(envelope: PubSubEnvelope): CoordinadoraEvent | null {
  let rawJson: string
  try {
    rawJson = Buffer.from(envelope.message.data, 'base64').toString('utf-8')
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const p = parsed as Record<string, unknown>
  // Minimum required fields per PDF
  if (
    typeof p.tracking_number !== 'string' ||
    typeof p.codigo !== 'string' ||
    typeof p.fecha !== 'string' ||
    typeof p.hora !== 'string'
  ) {
    return null
  }
  return parsed as CoordinadoraEvent
}

export function isEventWithNovedad(
  e: CoordinadoraEvent
): e is CoordinadoraEventWithNovedad {
  return 'codigo_estado' in e && typeof (e as CoordinadoraEventWithNovedad).codigo_estado === 'string'
}
```

---

### Pattern 3: Webhook Route Handler (D-06, D-08)

**What:** Next.js 15 App Router POST handler. `params` is now `Promise<{ env }>` — must `await`. Validate env in `'test' | 'prod'` literal union. Respond 200 fast, dispatch async.

**Source:** [Next.js 15 route.js docs](https://nextjs.org/docs/app/api-reference/file-conventions/route) — "context.params is now a promise" since v15.0.0-RC.

**Verified from codebase:** `src/app/api/v1/tools/[toolName]/route.ts:31`, `src/app/api/contact-review/[token]/route.ts:23` — both use `params: Promise<{...}>` pattern.

**Example (canonical pattern):**
```typescript
// app/api/webhooks/coordinadora/[env]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createModuleLogger } from '@/lib/audit/logger'
import { inngest } from '@/inngest/client'
import {
  isPubSubEnvelope,
  decodePubSubPayload,
  isEventWithNovedad,
} from '@/lib/carriers/coordinadora/pub-sub-envelope'
import { resolveWorkspaceFromNit } from '@/lib/carriers/coordinadora/tenant'
import { recordCoordinadoraEvent } from '@/lib/domain/carrier-events'

// Vercel default 15s on Pro plan; this handler should finish in <2s typically.
// We do NOT need extension — the heavy work is in the Inngest function.
export const maxDuration = 15
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createModuleLogger('coordinadora-webhook')

const VALID_ENVS = ['test', 'prod'] as const
type CoordEnv = (typeof VALID_ENVS)[number]

function isValidEnv(value: string): value is CoordEnv {
  return (VALID_ENVS as readonly string[]).includes(value)
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ env: string }> }
) {
  const startTime = Date.now()
  const { env } = await context.params

  // ----------------------------------------------------------------------
  // 1. Validate path param against union literal (D-06)
  // ----------------------------------------------------------------------
  if (!isValidEnv(env)) {
    logger.warn({ env }, 'invalid env path param')
    return NextResponse.json(
      { error: 'Invalid env. Expected test or prod.' },
      { status: 404 }
    )
  }

  // ----------------------------------------------------------------------
  // 2. Read body. Pub/Sub sends application/json envelope.
  // ----------------------------------------------------------------------
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    logger.warn({ env }, 'invalid JSON body')
    // Pub/Sub treats 4xx as ACK-FAILED-no-retry-helpful but per spec NACKs and
    // retries. Returning 200 here would lose visibility of malformed messages.
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ----------------------------------------------------------------------
  // 3. Validate Pub/Sub envelope strict (D-10 — defense)
  // ----------------------------------------------------------------------
  if (!isPubSubEnvelope(rawBody)) {
    logger.warn({ env }, 'rejected: not a pub/sub envelope')
    return NextResponse.json(
      { error: 'Expected Pub/Sub envelope' },
      { status: 400 }
    )
  }

  // ----------------------------------------------------------------------
  // 4. Decode base64 → JSON. If malformed, ACK with 200 + drop (we don't
  //    want Pub/Sub to retry an undecodable message indefinitely).
  // ----------------------------------------------------------------------
  const event = decodePubSubPayload(rawBody)
  if (!event) {
    logger.warn({ env, messageId: rawBody.message.messageId }, 'payload decode failed — ack+drop')
    return NextResponse.json({ ok: true, dropped: 'decode_failed' }, { status: 200 })
  }

  // ----------------------------------------------------------------------
  // 5. Resolve nit_cliente → workspace_id (D-09)
  // ----------------------------------------------------------------------
  const nitCliente = isEventWithNovedad(event) ? event.nit_cliente : null
  const workspaceId = resolveWorkspaceFromNit(nitCliente)
  if (!workspaceId) {
    logger.warn(
      { env, nitCliente, tracking: event.tracking_number },
      'no workspace matches nit_cliente — ack+drop',
    )
    // ACK 200 — Pub/Sub should NOT retry. Multi-tenant V2 will add table mapping.
    return NextResponse.json({ ok: true, dropped: 'no_workspace_match' }, { status: 200 })
  }

  // ----------------------------------------------------------------------
  // 6. Idempotent insert via domain layer (D-07, D-23). The composite
  //    unique index in DB enforces dedup — caller does NOT need a SELECT
  //    first (avoids TOCTOU race).
  // ----------------------------------------------------------------------
  const insertResult = await recordCoordinadoraEvent(
    { workspaceId, source: 'webhook:coordinadora' },
    {
      env,
      trackingNumber: event.tracking_number,
      fecha: event.fecha,
      hora: event.hora,
      codigo: event.codigo,
      codigoEstado: isEventWithNovedad(event) ? event.codigo_estado : null,
      codigoNovedad: isEventWithNovedad(event) ? event.codigo : null,
      descEstado: isEventWithNovedad(event) ? event.desc_estado : null,
      comment: event.comment ?? null,
      referencia: event.referencia ?? null,
      nitCliente: isEventWithNovedad(event) ? event.nit_cliente : null,
      divCliente: isEventWithNovedad(event) ? event.div_cliente : null,
      vinculoGuia: isEventWithNovedad(event) ? event.vinculo_guia : null,
      rawPayload: event,
    }
  )

  if (!insertResult.success) {
    logger.error(
      { env, tracking: event.tracking_number, error: insertResult.error },
      'domain insert failed — return 5xx for Pub/Sub retry',
    )
    return NextResponse.json({ error: 'Persistence failed' }, { status: 500 })
  }

  const wasNewlyInserted = insertResult.data?.inserted === true
  const eventRowId = insertResult.data?.id

  // ----------------------------------------------------------------------
  // 7. Dispatch async downstream — only if newly inserted (idempotent)
  //    AWAIT the inngest.send (MEMORY: 'NEVER fire-and-forget inngest.send').
  // ----------------------------------------------------------------------
  if (wasNewlyInserted && eventRowId) {
    await inngest.send({
      name: 'coordinadora/webhook.received',
      data: {
        env,
        workspaceId,
        eventRowId,
        trackingNumber: event.tracking_number,
        codigo: event.codigo,
        codigoEstado: isEventWithNovedad(event) ? event.codigo_estado : null,
      },
    })
  }

  // ----------------------------------------------------------------------
  // 8. ACK 200 always
  // ----------------------------------------------------------------------
  logger.info(
    {
      env,
      tracking: event.tracking_number,
      codigo: event.codigo,
      newlyInserted: wasNewlyInserted,
      durationMs: Date.now() - startTime,
    },
    'coordinadora webhook processed',
  )
  return NextResponse.json(
    { ok: true, newly_inserted: wasNewlyInserted },
    { status: 200 }
  )
}
```

**Why no rate-limit (D-36):** Pub/Sub's source IPs are non-public (GCP NAT pool, changes). IP allowlist is not viable. Idempotency at the DB level provides the practical protection: even 1000 duplicate webhooks for the same event become 1 DB row + 999 no-ops. WAF-level rate-limit deferred to V2 if it ever becomes an issue.

---

### Pattern 4: Domain Layer Extension — Idempotent Insert via Unique Index

**What:** Extend `src/lib/domain/carrier-events.ts` with `recordCoordinadoraEvent()`. Use `INSERT ... ON CONFLICT DO NOTHING` via supabase `.upsert({ ignoreDuplicates: true })` — same pattern as `crm-mutation-idempotency.ts:101-114`.

**Why this beats SELECT-then-INSERT:** TOCTOU window between SELECT and INSERT allows duplicates under concurrent webhooks. Postgres unique-index conflict is atomic.

**Example (verified pattern from `crm-mutation-idempotency.ts:90-122`):**
```typescript
// src/lib/domain/carrier-events.ts (extension)

export interface RecordCoordinadoraEventParams {
  env: 'test' | 'prod'
  trackingNumber: string
  fecha: string
  hora: string
  codigo: string
  codigoEstado: string | null
  codigoNovedad: string | null   // populated when event has novedad
  descEstado: string | null
  comment: string | null
  referencia: string | null
  nitCliente: string | null
  divCliente: string | null
  vinculoGuia: string | null
  rawPayload: unknown
}

/**
 * Insert a Coordinadora webhook event idempotently.
 * Composite unique key: (workspace_id, tracking_number, fecha, hora, codigo, codigo_estado)
 * — D-07 lock. `codigo_estado` may be null; UNIQUE INDEX uses COALESCE('') trick.
 *
 * Returns DomainResult<{ id, inserted }>:
 *   - inserted=true  → new row, caller should dispatch downstream
 *   - inserted=false → duplicate (already-processed webhook), caller should ACK silently
 */
export async function recordCoordinadoraEvent(
  ctx: DomainContext,
  params: RecordCoordinadoraEventParams,
): Promise<DomainResult<{ id: string; inserted: boolean }>> {
  const supabase = createAdminClient()

  // Try to look up an existing order by tracking_number (D-22).
  // If no match, order_id stays null (additive migration relaxes the NOT NULL).
  const { data: order } = await supabase
    .from('orders')
    .select('id')
    .eq('workspace_id', ctx.workspaceId)
    .eq('tracking_number', params.trackingNumber)
    .maybeSingle()

  const insertRow = {
    workspace_id: ctx.workspaceId,
    order_id: order?.id ?? null,
    guia: params.trackingNumber,
    carrier: 'coordinadora',
    estado: params.descEstado ?? params.comment ?? '',
    cod_estado: parseInt(params.codigoEstado ?? params.codigo, 10) || 0,
    novedades: params.codigoNovedad ? [{ codigo: params.codigoNovedad, desc: params.descEstado }] : [],
    raw_response: params.rawPayload as never,
    // ADDITIVE COLUMNS (see Schema Migration Proposal)
    tracking_number: params.trackingNumber,
    fecha: params.fecha,
    hora: params.hora,
    codigo: params.codigo,
    codigo_estado: params.codigoEstado,
    codigo_novedad: params.codigoNovedad,
    nit_cliente: params.nitCliente,
    div_cliente: params.divCliente,
    vinculo_guia: params.vinculoGuia,
    source: ctx.source,  // 'webhook:coordinadora'
    env: params.env,
  }

  const { data, error } = await supabase
    .from('order_carrier_events')
    .upsert(insertRow, {
      onConflict: 'workspace_id,tracking_number,fecha,hora,codigo,codigo_estado_coalesced',
      ignoreDuplicates: true,
    })
    .select('id')

  if (error) {
    return { success: false, error: `recordCoordinadoraEvent: ${error.message}` }
  }

  // ignoreDuplicates returns empty array on conflict, single row on insert.
  const inserted = Array.isArray(data) && data.length > 0
  if (!inserted) {
    // Fetch the existing row id for caller (defensive — most callers won't need it)
    const { data: existing } = await supabase
      .from('order_carrier_events')
      .select('id')
      .eq('workspace_id', ctx.workspaceId)
      .eq('tracking_number', params.trackingNumber)
      .eq('fecha', params.fecha)
      .eq('hora', params.hora)
      .eq('codigo', params.codigo)
      .maybeSingle()
    return { success: true, data: { id: existing?.id ?? '', inserted: false } }
  }
  return { success: true, data: { id: data[0].id as string, inserted: true } }
}
```

**Note on `codigo_estado_coalesced`:** Postgres UNIQUE INDEX over columns containing NULL treats each NULL as distinct (UNIQUE constraint doesn't dedupe rows where any column is NULL). The composite UNIQUE INDEX must use `COALESCE(codigo_estado, '')` as a generated expression — see Schema Migration Proposal below.

---

### Pattern 5: Inngest Downstream Processor (D-08, D-27)

**What:** Pure async business logic. Read the already-persisted event, emit observability, notify agent / update order.

**Example skeleton (pattern from `bold-upstream-broken.ts:28-60`):**
```typescript
// src/inngest/functions/coordinadora-webhook-process.ts
import { inngest } from '../client'
import { createModuleLogger } from '@/lib/audit/logger'
import {
  isObservabilityEnabled,
  ObservabilityCollector,
  runWithCollector,
} from '@/lib/observability'

const logger = createModuleLogger('coordinadora-webhook-process')

export const coordinadoraWebhookProcess = inngest.createFunction(
  {
    id: 'coordinadora-webhook-process',
    name: 'Coordinadora Webhook: Downstream Processor',
    retries: 2,
    concurrency: [{ key: 'event.data.trackingNumber', limit: 1 }],
  },
  { event: 'coordinadora/webhook.received' },
  async ({ event, step }) => {
    const { env, workspaceId, eventRowId, trackingNumber, codigo, codigoEstado } = event.data

    const collector = isObservabilityEnabled()
      ? new ObservabilityCollector({
          conversationId: `coordinadora-webhook-${trackingNumber}`,
          workspaceId,
          agentId: 'coordinadora-webhook',
          turnStartedAt: new Date(),
          triggerKind: 'system_event',
        })
      : null

    await step.run('emit-observability', async () => {
      collector?.recordEvent('pipeline_decision', 'coordinadora_webhook_processed', {
        env,
        trackingNumber: trackingNumber.slice(-4),  // PII redaction (D-28)
        codigo,
        codigoEstado,
        eventRowId,
      })
      if (collector) await runWithCollector(collector, async () => { /* flush */ })
    })

    // ----- Downstream business logic (placeholder for V1.1) -----
    // - Update orders.status if codigo maps to terminal state
    // - Trigger automation (e.g., notify customer)
    // - For V1: just persist + observe. Business logic in follow-up plan.

    logger.info({ env, trackingNumber, codigo }, 'coordinadora event processed')
    return { ok: true, eventRowId }
  }
)
```

**Concurrency key on `trackingNumber`:** prevents duplicate downstream notifications if Pub/Sub retries cause the same event row to be ACKed multiple times.

---

### Pattern 6: Multi-Tenant nit_cliente Resolver (D-09)

**What:** Pure function. V1 hardcoded. V2 will become a DB lookup against a new `coordinadora_tenant_mapping` table.

```typescript
// src/lib/carriers/coordinadora/tenant.ts

// D-09: V1 hardcoded for Somnio. V2 = mapping table.
const SOMNIO_WORKSPACE_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490'
const MORFX_NIT = '902052328'

const NIT_TO_WORKSPACE: Record<string, string> = {
  [MORFX_NIT]: SOMNIO_WORKSPACE_ID,
}

export function resolveWorkspaceFromNit(nitCliente: string | null): string | null {
  if (!nitCliente) {
    // Event without novedad — no nit_cliente present in payload (PDF page 1 shape).
    // For V1 with single tenant, fall back to Somnio.
    // V2: REJECT and require mapping table to resolve all events including those without nit.
    return SOMNIO_WORKSPACE_ID
  }
  return NIT_TO_WORKSPACE[nitCliente] ?? null
}
```

**V1 fallback (when payload has no `nit_cliente`):** PDF page 1 (event without novedad) does NOT include `nit_cliente`. We default to Somnio. This is acceptable because in V1 we only have one workspace using the API; in V2 with multi-tenant, this fallback is dropped and events without `nit_cliente` are logged + reviewed (potential schema gap).

---

### Anti-Patterns to Avoid

- **Don't:** Implement an in-process mutex around `getToken()` to coalesce concurrent refreshes. **Why:** complexity > benefit. Coordinadora has no documented rate limit. 10 parallel refreshes per minute during cold-start storms is negligible.
- **Don't:** Validate Pub/Sub source IP. **Why:** GCP NAT pool is non-public and rotates. IP allowlist breaks unpredictably.
- **Don't:** Store the Coordinadora `client_secret` in the database. **Why:** Vercel env vars are the canonical secret store (D-15). Even `platform_config` is the wrong layer.
- **Don't:** Skip the strict envelope validation because "we trust Coordinadora." **Why:** D-10 defense. A malformed envelope from a misconfigured Coordinadora staging environment shouldn't break our DB layer.
- **Don't:** Block the webhook ACK on Anthropic / OpenAI / external calls. **Why:** Pub/Sub default ACK deadline is 10s; agent calls take 5-30s. Use Inngest dispatch (D-08).
- **Don't:** Hand-roll JWT decoding or expiry parsing. **Why:** Coordinadora gives us `expires_in` in seconds — use that directly (D-13 says 55min hardcoded; we don't trust the upstream's `expires_in` because PDF shows `"3599"` (string!) which is fragile).
- **Don't:** Re-implement the `envia-status-polling.ts` Postgres event-change-detection loop for Coordinadora. **Why:** Coordinadora is push-based — we don't poll. The webhook receiver IS the change detector.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth2 client_credentials grant | Custom JWT validation, refresh-token rotation | Native `fetch` + `Buffer.from(...).toString('base64')` for Basic Auth header | Client_credentials is 8 lines. No JWT to validate (we trust the upstream issuer). No refresh tokens (`grant_type=client_credentials` doesn't issue them). |
| Pub/Sub envelope parsing | Custom JSON-schema validator | Type guards (`isPubSubEnvelope`) + `Buffer.from(b64, 'base64')` | Envelope is 5 known fields. Type guard is 6 lines. Schema lib adds bundle + maintenance. |
| Idempotency table | New `coordinadora_idempotency_keys` table | Composite UNIQUE INDEX on `order_carrier_events` columns + `ON CONFLICT DO NOTHING` | The DB is already the source of truth; a separate table doubles writes and creates 2-table consistency burden. |
| Retry-with-backoff for transient outbound failures | Custom retry loop in `cotizar()` / `createGuia()` | Caller (Inngest function with `retries: 2`) handles retries | Inngest already has durable retry; doing it both at HTTP layer and at function layer is bug-prone (double-charge on idempotent endpoints). |
| Webhook signature verification | crypto.timingSafeEqual scheme | NONE — defense is idempotency (D-10) | Coordinadora explicitly does NOT offer HMAC per PDF. Adding fake validation gives false security. |
| Cron to refresh token proactively | Inngest cron pre-warming token | Lazy refresh on demand | Pre-warming requires a cron that knows ALL Vercel instances — impossible. Lazy refresh + 55min TTL is the same complexity as a cron and handles cold-starts naturally. |
| Cross-instance token cache sync | Redis / KV | Accept duplicate refreshes during cold-start storms | D-13 lock. Each Vercel instance refreshes independently. At Coordinadora's expected throughput, 10 refreshes / minute (worst case) is below any rate limit. |
| Order auto-creation from webhook | "if no order matches tracking → create one" | `order_id: null` + log warning (D-22) | Webhook-created orders lack 80% of fields (customer, products, value). Operator audits the null orders later. |

**Key insight:** Coordinadora's webhook is a notification, not a command. Persist it, emit observability, return 200. Anything more — order updates, customer notifications, automation triggers — happens downstream in Inngest where we have replay safety and retry semantics. Treat the route handler as a pure ACK + dispatcher.

---

## Common Pitfalls

### Pitfall 1: Pub/Sub `expires_in` may be a string

**What goes wrong:** The Cotizador PDF response example shows `"expires_in": "3599"` — quoted as string. If we did `Date.now() + (expires_in * 1000)` without parsing, we'd get `NaN` and cache forever (or never).

**Why it happens:** Coordinadora's response format is loose. PDFs use both `access_token` (correct) and `acces_token` (typo).

**How to avoid:** D-13 says we hardcode 55min TTL — DO NOT read `expires_in` from response at all. Just `expiresAt: Date.now() + 55 * 60 * 1000`.

**Warning sign:** Token cache keeps refreshing every call → check parsing. Token cache never refreshes → check arithmetic.

---

### Pitfall 2: Next.js 15 `params` is a Promise

**What goes wrong:** Treating `context.params.env` as sync returns `Promise<string>` instead of `string`. Validation fails silently (`undefined` !== 'test' && 'prod' → 404 for every request).

**Why it happens:** Next.js 15.0.0-RC migrated `params` from sync to async ([changelog cited above](https://nextjs.org/docs/app/api-reference/file-conventions/route)).

**How to avoid:** Type as `{ params: Promise<{ env: string }> }`, use `const { env } = await context.params`. Verified codebase pattern in `src/app/api/v1/tools/[toolName]/route.ts:31` and `src/app/api/contact-review/[token]/route.ts:23`.

**Warning sign:** TypeScript will catch this at compile time IF you use the explicit Promise type. If you forget `Promise<>`, runtime breaks silently (params evaluates to `[object Promise]`).

---

### Pitfall 3: `inngest.send()` fire-and-forget

**What goes wrong:** `inngest.send({ ... })` without `await` causes Vercel to kill the lambda before the event is queued. The downstream Inngest function never fires.

**Why it happens:** Documented in MEMORY: "Vercel serverless + Inngest: NEVER fire-and-forget inngest.send in webhooks/API routes. Always await."

**How to avoid:** Always `await inngest.send(...)`. Confirmed pattern in `webhook-processor.ts` (Meta WhatsApp) and `pw-confirmation-preload-and-invoke` dispatch.

**Warning sign:** Inngest dashboard shows no events for the receiver, but the webhook returned 200.

---

### Pitfall 4: Postgres UNIQUE INDEX + NULL semantics

**What goes wrong:** `CREATE UNIQUE INDEX idx ON t (a, b, c)` where `c` may be NULL — Postgres treats every NULL as distinct (per SQL standard). Two rows with same `(a, b)` but `c=NULL` both insert.

**Why it happens:** D-07 composite includes `codigo_estado` which is NULL for events WITHOUT novedad (PDF page 1 shape — no codigo_estado field).

**How to avoid:** Use a generated COALESCE expression in the unique index:
```sql
CREATE UNIQUE INDEX idx_carrier_events_idem
ON order_carrier_events (
  workspace_id,
  tracking_number,
  fecha,
  hora,
  codigo,
  COALESCE(codigo_estado, '')
)
WHERE carrier = 'coordinadora';
```
The partial WHERE clause avoids conflict with existing Envia rows.

**Warning sign:** Duplicates appearing in `order_carrier_events` despite `ON CONFLICT DO NOTHING`.

---

### Pitfall 5: `order_id` NOT NULL blocks webhook persistence (D-22 gap)

**What goes wrong:** Current schema (`20260410000003_order_carrier_events.sql:11`) has `order_id UUID NOT NULL REFERENCES orders(id)`. If the webhook arrives before the order exists (race), or if `tracking_number` doesn't match any order (typo, manual entry), INSERT fails with FK violation.

**Why it happens:** Envia polling assumes the order exists (we poll because we know about it). Coordinadora's webhook can fire for any guide under our NIT — including manually-created ones not yet linked.

**How to avoid:** Additive migration relaxes `order_id` to `NULL` allowed. See Schema Migration Proposal below.

**Warning sign:** 23503 foreign_key_violation errors in production, webhook returns 500, Pub/Sub retries indefinitely.

---

### Pitfall 6: Pub/Sub ACK deadline is short

**What goes wrong:** Default Pub/Sub ack deadline is 10s. If our handler takes >10s, Pub/Sub redelivers the message. Subsequent retries can spike if downstream work is slow.

**Why it happens:** Vercel cold-start (1-2s) + DB roundtrip (200-500ms) + Anthropic / agent call (5-30s) = ack deadline exceeded.

**How to avoid:** D-08 mandates ACK fast + Inngest async. Our handler should finish in <2s typically. Set `maxDuration = 15` (Vercel default) to be safe.

**Warning sign:** Multiple Inngest events for the same `messageId`, exponentially-growing webhook QPS.

---

### Pitfall 7: Token cache cold-start race during traffic spike

**What goes wrong:** 10 concurrent cold-starts → 10 parallel `/oauth/token` calls in <1s. Coordinadora *might* rate-limit this (undocumented).

**Why it happens:** Vercel autoscales independently per request. Each new instance has empty token cache.

**How to avoid (V1):** Accept the extra requests. At 1 webhook/min volume, cold-start traffic spikes are unlikely. The implementation is simpler.

**How to mitigate if Coordinadora rate-limits us (V1.1):** Add Inngest cron `coordinadora-token-keepalive` runs every 50min to call `getToken()` once. This warms one instance — other instances still cold-start but baseline is reduced.

**Warning sign:** 429 responses from `/oauth/token` during traffic ramps. Mitigate with the cron approach.

---

### Pitfall 8: Coordinadora typo `api-devcoordinadora.tech` in PDFs

**What goes wrong:** Etiquetas PDF says `curl --location 'https://api-devcoordinadora.tech/oauth/token'` (missing dot). Naively copy-pasting kills the integration.

**Why it happens:** Documentation typo, confirmed in D-16.

**How to avoid:** Hardcode `BASE_URLS` constant (D-16). Never read base URL from PDFs / runtime.

**Warning sign:** DNS lookup failure or 502 from `api-devcoordinadora.tech`.

---

### Pitfall 9: Code 7 missing from status enum

**What goes wrong:** PDF Notificacion-push-Tracking-v3 lists 9 codes: 0,1,2,3,4,5,6,8,9 — **no 7**. If we assume sequential and create a `7 = 'XXX'` entry, we have stale logic if Coordinadora later adds code 7.

**Why it happens:** Possibly historical (deleted code), or 7 is reserved.

**How to avoid:** D-20 — descubrir on-the-go. Any unknown code is logged with a warning + stored raw. NO assumption about 7.

**Warning sign:** None at install — manifests only when Coordinadora introduces code 7.

---

### Pitfall 10: Coordinadora doesn't fire webhooks for guides created by scraping

**Confirmation status:** UNVERIFIED. Hypothesis (focus_areas §10): the webhook fires ONLY for guides created via API (since the API is what registers our endpoint), not for guides created by the scraping robot.

**What goes wrong if true:** Robot-created guides remain in scraping/polling-only mode. Switching a workspace to API guide-creation also enables webhook visibility — but for existing in-flight guides created by the robot, no events fire.

**How to avoid:** Validate during Smoke 7 (D-31). Don't switch the feature flag for an active workspace mid-fulfillment cycle (D-26 helps — cutover after ERP migration when batch is low).

**Warning sign:** Webhooks arrive only for API-created guides; robot-created guides still depend on the legacy `morfx-production.up.railway.app` lookup robot for status.

---

## Code Examples

(Largely covered above — see Pattern 1-6.) Two more critical snippets:

### Cotizar wrapper (Pattern: 3 wrappers, D-14)

```typescript
// src/lib/carriers/coordinadora/cotizar.ts
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

### Status code enum (D-18, D-20)

```typescript
// src/lib/carriers/coordinadora/status-codes.ts

export const COORDINADORA_STATUS_CODES = {
  '0': 'GUIA_NO_EXISTE',
  '1': 'A_RECIBIR_POR_COORDINADORA',
  '2': 'EN_TERMINAL_ORIGEN',
  '3': 'EN_TRANSPORTE',
  '4': 'EN_TERMINAL_DESTINO',
  '5': 'EN_REPARTO',
  '6': 'ENTREGADA',
  // 7 not in spec
  '8': 'CERRADO_INCIDENCIA',
  '9': 'EN_PUNTO_DROP',
} as const

export type CoordinadoraStatusLabel =
  typeof COORDINADORA_STATUS_CODES[keyof typeof COORDINADORA_STATUS_CODES]

export function mapStatusCode(codigo: string): CoordinadoraStatusLabel | 'DESCONOCIDO' {
  return (COORDINADORA_STATUS_CODES as Record<string, CoordinadoraStatusLabel>)[codigo]
    ?? 'DESCONOCIDO'
}

/**
 * Known novedad codes (extend as Coordinadora reveals more — D-20).
 * Unknown novedades are stored raw with a warning.
 */
export const COORDINADORA_NOVEDAD_CODES: Record<string, string> = {
  '801': 'Pedido Cancelado',
}

export function mapNovedadCode(codigo: string): string {
  return COORDINADORA_NOVEDAD_CODES[codigo] ?? `desconocida (${codigo})`
}
```

---

## Schema Migration Proposal (Aditive, D-21 + D-22 + D-35)

Filename suggestion: `supabase/migrations/20260603000000_coordinadora_carrier_events_extension.sql`

```sql
-- ============================================================================
-- Coordinadora API Integration — additive extension of order_carrier_events
-- Standalone: coordinadora-api-integration (2026-06-03)
--
-- WHY: D-21 reuse table, D-22 allow null order_id (webhook race), D-07
-- composite idempotency key, D-09 multi-tenant nit_cliente persistence.
--
-- NON-BREAKING for envia-status-polling.ts: existing columns untouched,
-- new columns are NULLable, new index is partial (carrier='coordinadora').
-- ============================================================================

-- 1. Relax order_id (D-22 — webhook may arrive before order, or with unmatched tracking)
ALTER TABLE order_carrier_events
  ALTER COLUMN order_id DROP NOT NULL;

-- 2. Add Coordinadora-specific columns (NULLable — Envia rows leave them blank)
ALTER TABLE order_carrier_events
  ADD COLUMN IF NOT EXISTS tracking_number TEXT,
  ADD COLUMN IF NOT EXISTS fecha           DATE,
  ADD COLUMN IF NOT EXISTS hora            TEXT,            -- "HH:MM:SS.microseconds" string from Coordinadora
  ADD COLUMN IF NOT EXISTS codigo          TEXT,
  ADD COLUMN IF NOT EXISTS codigo_estado   TEXT,
  ADD COLUMN IF NOT EXISTS codigo_novedad  TEXT,
  ADD COLUMN IF NOT EXISTS nit_cliente     TEXT,
  ADD COLUMN IF NOT EXISTS div_cliente     TEXT,
  ADD COLUMN IF NOT EXISTS vinculo_guia    TEXT,
  ADD COLUMN IF NOT EXISTS source          TEXT,             -- 'webhook:coordinadora' | 'cron:envia' | etc
  ADD COLUMN IF NOT EXISTS env             TEXT;             -- 'test' | 'prod'

-- 3. Backfill `source` for existing Envia rows (defensive — known by carrier)
UPDATE order_carrier_events
SET source = 'cron:envia'
WHERE source IS NULL AND carrier ILIKE '%envia%';

-- 4. Composite UNIQUE INDEX for idempotency (D-07). Partial — only coordinadora.
-- COALESCE handles NULL codigo_estado (events without novedad).
CREATE UNIQUE INDEX IF NOT EXISTS idx_carrier_events_coordinadora_idempotency
  ON order_carrier_events (
    workspace_id,
    tracking_number,
    fecha,
    hora,
    codigo,
    COALESCE(codigo_estado, '')
  )
  WHERE carrier = 'coordinadora';

-- 5. Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_carrier_events_tracking_number
  ON order_carrier_events(tracking_number)
  WHERE tracking_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_carrier_events_nit_cliente
  ON order_carrier_events(nit_cliente)
  WHERE nit_cliente IS NOT NULL;

-- 6. RLS policies — already permissive (`is_workspace_member`), no change needed.

-- 7. Comment for future archeology
COMMENT ON COLUMN order_carrier_events.fecha IS 'Coordinadora event date (D-07 idempotency key part)';
COMMENT ON COLUMN order_carrier_events.hora IS 'Coordinadora event time with microsecond precision';
COMMENT ON COLUMN order_carrier_events.codigo IS 'Coordinadora status code OR novedad code when desc_estado fires';
COMMENT ON COLUMN order_carrier_events.codigo_estado IS 'Current state when codigo is a novedad (D-19 semantica)';
COMMENT ON COLUMN order_carrier_events.codigo_novedad IS 'Same value as codigo when event has novedad (D-19)';
COMMENT ON COLUMN order_carrier_events.nit_cliente IS 'Coordinadora tenant identifier (D-09 multi-tenant key)';
```

**Why each column:**
- `tracking_number` — needed for idempotency composite (D-07); Envia rows use `guia` field but Coordinadora separates them
- `fecha`, `hora`, `codigo`, `codigo_estado` — D-07 composite key components
- `codigo_novedad` — D-19 semantica (preserve novedad-code when codigo=801 + codigo_estado=5)
- `nit_cliente`, `div_cliente`, `vinculo_guia` — D-09 multi-tenant + audit
- `source` — D-23 caller propagation (`'webhook:coordinadora'`); backfilled for Envia
- `env` — distinguish test vs prod data without grepping raw_response

**Regla 5 enforcement:** apply this migration on prod BEFORE the code that references the new columns ships to Vercel. The plan-phase must include a "PAUSE — apply migration in prod" step before any push.

---

## Runtime State Inventory

This is a NEW integration, not a rename — most categories are N/A but we list them explicitly per the canonical question.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `order_carrier_events` table — existing schema doesn't store Coordinadora's payload fully (D-22 + missing columns) | Additive migration (see Schema Migration Proposal). No backfill of existing data — webhook receiver starts empty. |
| Live service config | `platform_config` table needs a new row per workspace for `coordinadora_api_v2_enabled` | SQL: `INSERT INTO platform_config (workspace_id, key, value) VALUES ('a3843b3f-...', 'coordinadora_api_v2_enabled', 'false')` — see CONTEXT.md D-24 |
| OS-registered state | Railway `robot-coordinadora` service — keeps running unchanged (D-25). Coordinadora's Pub/Sub topic on their side: they need our endpoint URL. | Coordinadora-side action (D-37 #5 — give them the URL after deploy) — not a code change |
| Secrets / env vars | NEW Vercel env vars: `COORDINADORA_ENV`, `COORDINADORA_CLIENT_ID`, `COORDINADORA_CLIENT_SECRET`, `COORDINADORA_ID_PROCESO`, `COORDINADORA_DIVISION_CLIENTE`, `COORDINADORA_NIT_CLIENTE`, `COORDINADORA_TIPO_CUENTA`, `COORDINADORA_TIPO_PRODUCTO` (D-15) | Set in Vercel project settings BEFORE deploy. Placeholders are OK until D-37 credentials arrive — code reads env at call time, not import time |
| Build artifacts / installed packages | None — zero npm deps added. No installed CLI tools | None |

---

## Common Pitfalls (already enumerated in §Common Pitfalls 1-10)

See full list above.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22 (Vercel default) | Runtime | ✓ | 22.x | — |
| `next` | App Router route handler | ✓ | ^16.1.6 | — |
| `inngest` | Async webhook downstream | ✓ | ^3.54.0 | — |
| `@supabase/supabase-js` | Domain layer | ✓ | ^2.93.1 | — |
| `pino` (via @/lib/audit/logger) | Structured logs | ✓ | ^10.3.0 | — |
| `vitest` | Unit tests | ✓ | dev dep | — |
| Coordinadora `client_id` / `client_secret` | OAuth token | ✗ | — | env var placeholders until D-37 resolves; smoke tests 2-7 deferred |
| Coordinadora `/guias` exact URL | Guide creation | ✗ | — | Code uses `process.env.COORDINADORA_GUIAS_PATH ?? '/guias/...'` (env-driven); smoke 4+5 deferred |
| GCP Pub/Sub topic configured on Coordinadora side | Webhook receiver | ✗ | — | Receiver deploys fine without it (just receives 0 events); smoke 7 deferred |

**Missing dependencies with no fallback:** None. All blocking items are external (Coordinadora-side configuration / credentials), not local dev environment gaps.

**Missing dependencies with fallback:** All D-37 items — env var placeholders allow the entire integration to ship; only the smoke tests 2-7 are blocked until Coordinadora responds.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (existing in project) |
| Config file | `vitest.config.ts` at repo root |
| Quick run command | `npx vitest run src/lib/carriers/coordinadora/__tests__/` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| D-13 | Token cache returns cached on TTL hit, refreshes on miss | unit | `npx vitest run src/lib/carriers/coordinadora/__tests__/client-token-cache.test.ts` | ❌ Wave 0 (create) |
| D-07 | Composite UNIQUE INDEX prevents duplicate webhook persistence under concurrent insert | integration | `npx vitest run src/lib/domain/__tests__/carrier-events-coordinadora.test.ts` | ❌ Wave 0 (create) |
| D-06 | Webhook route accepts `'test'`/`'prod'`, rejects others with 404 | unit | `npx vitest run app/api/webhooks/coordinadora/__tests__/route.test.ts` | ❌ Wave 0 (create) |
| D-08 | Webhook returns 200 in <2s for valid envelope | unit | (same) | ❌ Wave 0 |
| D-10 | Webhook rejects non-PubSub envelope with 400 | unit | (same) | ❌ Wave 0 |
| D-18 | Status code mapping returns label for known codes, 'DESCONOCIDO' for unknown | unit | `npx vitest run src/lib/carriers/coordinadora/__tests__/status-codes.test.ts` | ❌ Wave 0 (create) |
| D-30 | Fixture-based integration: real PDF examples (entregada + cancelada) parse correctly | integration | `npx vitest run src/lib/carriers/coordinadora/__tests__/pub-sub-envelope.test.ts` | ❌ Wave 0 (create) |
| D-31 Smoke 1 | Webhook stub receives ping vacío — 200 OK | manual | `curl -X POST https://morfx.app/api/webhooks/coordinadora/test -H 'Content-Type: application/json' -d '{"message":{"data":""}}'` | ✅ post-deploy |
| D-31 Smoke 2-7 | OAuth + cotizar + guías + etiquetas + 5 webhooks | manual + integration | requires D-37 credentials | ❌ deferred |

### Sampling Rate

- **Per task commit:** `npx vitest run src/lib/carriers/coordinadora/__tests__/` (quick)
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`; smokes 1 manual; smokes 2-7 deferred to D-37 unlock

### Wave 0 Gaps

- [ ] `src/lib/carriers/coordinadora/__tests__/client-token-cache.test.ts` — covers D-13
- [ ] `src/lib/carriers/coordinadora/__tests__/pub-sub-envelope.test.ts` — covers D-30 fixtures
- [ ] `src/lib/carriers/coordinadora/__tests__/status-codes.test.ts` — covers D-18
- [ ] `app/api/webhooks/coordinadora/__tests__/route.test.ts` — covers D-06, D-08, D-10
- [ ] `src/lib/domain/__tests__/carrier-events-coordinadora.test.ts` — covers D-07 race
- [ ] Migration applied in prod via Supabase Studio (D-21, D-22, Schema Migration Proposal above) — gating Regla 5

---

## Security Domain

`security_enforcement` is treated as enabled (absent in `.planning/config.json` defaults).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (outbound OAuth2) | client_credentials grant; Basic Auth header from env vars; never log token or secret (D-28) |
| V3 Session Management | no | Webhook is stateless; no user session |
| V4 Access Control | yes (multi-tenant) | `resolveWorkspaceFromNit()` is the access boundary; events with no matching workspace are dropped (D-09) |
| V5 Input Validation | yes | Strict Pub/Sub envelope shape (`isPubSubEnvelope`); base64 + JSON decode failure → 400; payload field type checks (`tracking_number` is string, etc.) |
| V6 Cryptography | no | No app-level crypto; HTTPS is enforced by Vercel / Coordinadora PDF requirement |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Replay of a captured Pub/Sub message by an attacker | Repudiation / Tampering | Composite UNIQUE INDEX makes replay idempotent (already-recorded event = 200 + no-op). Attacker cannot inject NEW events because they would need to forge `nit_cliente` matching our hardcoded NIT, and even then the worst case is a single fake event row — no agent action triggered for unknown codes (D-20) |
| Token leakage in logs | Information Disclosure | D-28 explicit: NUNCA log de tokens/credenciales. Code review gate: grep `src/lib/carriers/coordinadora/**` for `console.log\|logger.*token`; should return zero matches |
| Tenant boundary bypass via spoofed `nit_cliente` | Elevation of Privilege | V1 hardcoded NIT map → spoofed nit_cliente that's not in the map → drops with `no_workspace_match` (default secure). V2 with mapping table: ensure the table only accepts admin-managed inserts (RLS policy) |
| `client_secret` exposed via env var dump | Information Disclosure | Vercel env vars are project-scoped + access-controlled. No public route should echo `process.env.*`. Audit before deploy |
| Coordinadora endpoint poisoned (DNS hijack) | Tampering | Hardcoded HTTPS URLs (D-16) + certificate validation by default in Node fetch. TLS pinning is overkill |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SOAP polling (Coordinadora legacy) | REST + Pub/Sub push (this standalone) | 2026 — Coordinadora's ERP migration window 27-may → 5-jun | D-32 marks `coordinadora-status-polling` standalone OBSOLETE |
| Robot scraping Railway for guide creation | REST API (this standalone) | Opt-in via feature flag | Coexistence D-02/D-25; V2 will deprecate the robot |
| `params: { env: string }` (Next.js 14) | `params: Promise<{ env: string }>` (Next.js 15.0.0-RC+) | Next 15 release | Required code change — verified at top of route handler |
| Lazy fetch with no token cache | Module-scoped Map cache 55min TTL | D-13 | Reduces token requests by ~99% under steady traffic |

**Deprecated / outdated:**
- SOAP cliente.ConsultaEstadoGuia — superseded by push (D-32).
- IP allowlist for webhook auth — unreliable for GCP Pub/Sub push (rotating NAT pool).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Coordinadora's webhook fires only for guides created via API (not for robot-scraped guides) | Pitfall 10, focus_areas §10 | If false: cutover via feature flag enables webhook visibility for ALL guides under our NIT — meaning we receive events for robot-created guides too. This is actually BETTER (more data, no duplication) but plan must NOT assume webhook activity correlates with API guide-creation activity. [ASSUMED — VERIFY in Smoke 7] |
| A2 | Coordinadora does not rate-limit `/oauth/token` beyond a generous threshold | Pattern 1, Pitfall 7 | If they rate-limit aggressively, cold-start storms cause cascading 429s. Mitigation: add keepalive cron (V1.1) | [ASSUMED] |
| A3 | Pub/Sub source IPs are part of GCP NAT pool — non-publishable, rotating | Anti-Patterns | If Coordinadora gives us a static IP range, we could allowlist. Validate via D-37 follow-up if useful | [ASSUMED — Pub/Sub general behavior, verify with Coordinadora] |
| A4 | Default Pub/Sub ack deadline is 10s (configurable on Coordinadora's side) | Pitfall 6 | If it's lower (e.g. 5s), Vercel cold-starts may trigger retries. Mitigation: D-08 ACK-fast pattern already in place | [CITED but specific deadline not stated in GCP docs] |
| A5 | The `nit_cliente` field is ONLY present in events WITH novedad (PDF page 2 shape) | Pattern 6, tenant.ts fallback | If `nit_cliente` is also in events without novedad (PDF page 1), V1's Somnio fallback is unnecessary. But the fallback is safe (single tenant V1) | [ASSUMED based on PDF examples — VERIFY with sample webhook] |
| A6 | Coordinadora's response uses string `"expires_in": "3599"` (quoted) — implementation safely ignores it | Pitfall 1, Pattern 1 | If they switch to numeric, no impact (we hardcode 55min TTL). Safe forever | [CITED from API Cotizador PDF page 3] |
| A7 | Coordinadora has typo `acces_token` (missing s) in some PDFs but `access_token` in others | Pattern 1 | Implementation accepts both. Risk: if neither key is present, throw with clear error | [CITED both PDFs] |
| A8 | The `hora` field has microsecond precision (e.g., `13:51:43.456818`) is sufficient for idempotency | D-07, Pitfall 4 | If Coordinadora truncates to second-precision in some envs, duplicates become possible. Mitigation: composite includes `codigo` and `codigo_estado` — still very unlikely to collide | [CITED Push PDF page 1] |

**Recommendation:** Assumptions A1, A2, A5 should be confirmed during Smoke 7 (real webhook reception). Until then, the implementation is defensive enough that any of them being wrong does not cause data loss — worst case is over- or under-receiving events.

---

## Open Questions

1. **Q1 — Does Coordinadora's webhook fire for ALL guides under our NIT, or only for guides created via API?**
   - What we know: PDF doesn't specify. We hypothesize API-only.
   - What's unclear: Whether the robot scraping creates guides that are "registered" under our NIT in a way that triggers webhooks.
   - Recommendation: validate during Smoke 7. Don't gate the implementation — code is the same either way.

2. **Q2 — What's Coordinadora's `/oauth/token` rate limit?**
   - What we know: Not documented in PDFs.
   - What's unclear: How many requests per minute / per hour is acceptable.
   - Recommendation: V1 implements naive lazy refresh. If we hit 429s, add Inngest keepalive cron in V1.1.

3. **Q3 — Should we configure Pub/Sub authenticated push on Coordinadora's side?**
   - What we know: Authenticated push uses GCP JWT signing. Coordinadora's PDF says "no auth," but they MIGHT offer authenticated push as a config option.
   - What's unclear: Whether Coordinadora's product team would entertain this.
   - Recommendation: V1 unauthenticated per PDF (D-10). Add as a follow-up ask to D-37 if security review pushes back.

4. **Q4 — How does `vinculo_guia` work, and when is it populated?**
   - What we know: PDF page 2 example shows it as `""` (empty).
   - What's unclear: Whether it's used for guide-linking (refund / replacement) and when.
   - Recommendation: persist as nullable text. Plan-phase doesn't need to handle business logic for it — V1 stores raw.

5. **Q5 — What's the practical webhook QPS?**
   - What we know: Coordinadora delivers state changes for each guide. Somnio's volume is ~100 orders/day → maybe 500 events/day across all 9 states.
   - What's unclear: Peak QPS during reparto windows.
   - Recommendation: V1 design assumes <10 QPS sustained — well below Vercel + Pub/Sub limits. Monitor in production.

6. **Q6 — Does the existing `envia-status-polling` cron need to stop when a workspace flips the Coordinadora flag?**
   - What we know: D-25 says robot Railway is unchanged. But Envia polling is a different system (REST polling, not robot).
   - What's unclear: Whether a Somnio order created with `carrier='envia'` should still poll vs orders created with `carrier='coordinadora'`.
   - Recommendation: Envia polling is per-`carrier` filter (`.ilike('carrier', '%envia%')` at `envia-status-polling.ts:84`) — already isolated. Coordinadora has its own carrier value `'coordinadora'`. No change needed.

---

## Project Constraints (from CLAUDE.md)

- **Regla 0:** Full GSD workflow — research-phase output here is consumed by plan-phase per `/gsd:plan-phase`. No shortcut.
- **Regla 1:** Push to Vercel after code changes before user testing. Plan-phase must include push steps per task.
- **Regla 2:** Use `America/Bogota` for all date logic. Migration `CREATE INDEX ... ON (fecha)` stores dates as DATE — TZ-aware reads in code.
- **Regla 3 (CRITICAL):** All mutations through `src/lib/domain/`. The route handler MUST NOT call `createAdminClient` directly — extend `carrier-events.ts` with `recordCoordinadoraEvent` (Pattern 4).
- **Regla 4:** Update `docs/analysis/04-estado-actual-plataforma.md` when this standalone ships. Plan-phase must include the doc update task.
- **Regla 5 (CRITICAL):** Migration applied to prod BEFORE pushing dependent code. Plan-phase MUST insert PAUSE step before any push that references new columns.
- **Regla 6 (CRITICAL):** Feature flag `coordinadora_api_v2_enabled` per-workspace in `platform_config` (D-24). Webhook receiver runs always; OUTBOUND API calls (cotizar/createGuia/imprimirEtiqueta) check the flag at caller's discretion. Robot Railway unaffected.

---

## Sources

### Primary (HIGH confidence)

- **PDF: `Notificacion-push-Tracking-v3.pdf`** — official Coordinadora doc, defines envelope format, 9 status codes, with-novedad vs without-novedad shapes, "no authentication" requirement, HTTPS-only mandate. [VERIFIED — read in research session]
- **PDF: `Documentacion Creacion de Guía Estándar y RCE.pdf`** — body fields dictionary (3.1-3.5), Estándar example (page 3), RCE example (page 4-5), 1h token TTL. [VERIFIED — read in research session]
- **PDF: `Servicio etiquetas.pdf`** — endpoint `/etiquetas/imprimir`, body `{tipo_etiqueta:"55", guias:[...]}`, response is JSON with base64. [VERIFIED]
- **PDF: `API Cotizador Nacional.pdf`** — endpoint `/cotizador/nacional`, OAuth via Bearer, body shape Colombia (DANE) + México (CP), response shape with `flete_total`, `dias_entrega`, `tipo_trayecto`. [VERIFIED]
- **PDF: `Comunicado Clientes cierre Mayo 2026.pdf`** — ERP migration window 27-may → 5-jun 2026; supports D-26 cutover ≥ 8-jun-2026. [VERIFIED]
- **[Google Cloud Pub/Sub Push docs](https://docs.cloud.google.com/pubsub/docs/push)** — verified envelope `{message:{data,messageId,publishTime,attributes?,orderingKey?}, subscription, deliveryAttempt?}`. ACK statuses 102/200/201/202/204. Authenticated push via JWT in Authorization header.
- **[Next.js 15 route.ts docs](https://nextjs.org/docs/app/api-reference/file-conventions/route)** — verified `params: Promise<{...}>` since v15.0.0-RC, `await params` required.
- **Codebase: `src/lib/carriers/envia-api.ts`** — verified pattern for thin fetch wrapper with `AbortSignal.timeout`. Sibling to what we'll build.
- **Codebase: `src/lib/domain/carrier-events.ts:50-81`** — verified existing domain function `insertCarrierEvent`. Extend with `recordCoordinadoraEvent`.
- **Codebase: `src/lib/domain/crm-mutation-idempotency.ts:90-122`** — verified `upsert({ ignoreDuplicates: true })` pattern for `INSERT ... ON CONFLICT DO NOTHING`.
- **Codebase: `src/lib/domain/platform-config.ts`** — verified `getPlatformConfig<T>(key, fallback)` API + 30s cache + fail-open policy.
- **Codebase: `src/app/api/v1/tools/[toolName]/route.ts:31`** — verified `params: Promise<{...}>` Next 15 pattern in production.
- **Codebase: `src/app/api/webhooks/whatsapp/route.ts:108-118`** — verified pattern of read raw body first, then validate.
- **Codebase: `src/inngest/functions/recompra-preload-context.ts:53-110`** — verified Inngest function structure (concurrency key, feature flag check, observability collector, retries).
- **Codebase: `src/inngest/functions/pw-confirmation-preload-and-invoke.ts`** + `webhook-processor.ts` — verified `await inngest.send({ ... })` pattern.
- **Codebase: `src/inngest/functions/envia-status-polling.ts:13-14`** — verified imports from domain layer (`@/lib/domain/carrier-events`).
- **MEMORY (`agent_sessions_lifecycle.md` and inngest_observability_merge.md)** — confirmed "NEVER fire-and-forget inngest.send" rule.

### Secondary (MEDIUM confidence)

- **[Vercel Functions duration docs](https://vercel.com/docs/functions/configuring-functions/duration)** — Pro plan default 15s, configurable via `maxDuration` export. Confirms our handler's 15s ceiling.
- **[Vercel changelog: Serverless Functions can now run up to 5 minutes](https://vercel.com/changelog/serverless-functions-can-now-run-up-to-5-minutes)** — confirms `maxDuration` extends to 300s on Pro for longer-running tasks (we don't need it here, but documented).

### Tertiary (LOW confidence — needs validation)

- Hypothesis: Coordinadora's webhook fires only for API-created guides. [UNVERIFIED — see A1, Q1]
- Hypothesis: Coordinadora has no aggressive rate limit on `/oauth/token`. [UNVERIFIED — A2]

---

## Confidence by Section

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All deps verified in package.json; pattern proven in envia-api.ts |
| Architecture Patterns | HIGH | Patterns mirror existing codebase (envia, webhook-processor, recompra-preload, crm-mutation-idempotency) |
| Webhook Receiver | HIGH | Next.js 15 docs verified; codebase already uses Promise params pattern |
| Token Cache | HIGH (design) / MEDIUM (cold-start race policy) | Design is deterministic; the policy "accept extra refreshes" is defensible but unverified against Coordinadora rate limits |
| Idempotency | HIGH | Postgres UNIQUE INDEX semantics well-known; partial index handles NULL case; pattern proven in crm-mutation-idempotency-keys |
| Schema Migration | MEDIUM-HIGH | Additive — non-breaking by construction. `order_id` relaxation is irreversible without restore, but no consumer requires NOT NULL |
| Pitfalls | HIGH | Most are cited from PDFs or Next.js docs |
| Status code mapping | MEDIUM | D-20 explicit "descubrir on-the-go" — incomplete catalog is expected and handled defensively |
| Feature flag pattern | HIGH | `getPlatformConfig` is well-documented in `platform-config.ts` |
| Smoke test plan | MEDIUM | Smokes 2-7 blocked on D-37 credentials |

---

## Metadata

**Research date:** 2026-05-26
**Valid until:** 2026-06-26 (1 month — stable Vercel/Next/Pub/Sub APIs; revalidate sooner if Coordinadora releases new docs)

**What plan-phase MUST do with this research:**
1. Wave 0 — apply migration in prod (Regla 5 PAUSE step), set Vercel env vars (placeholders OK)
2. Wave 1 — implement `src/lib/carriers/coordinadora/` module (client, types, status-codes, pub-sub-envelope, tenant) + tests
3. Wave 2 — implement webhook route + Inngest function + extend `carrier-events.ts` + tests
4. Wave 3 — feature flag SQL insert + observability events + smoke 1 (manual)
5. Wave 4 (blocked by D-37) — smokes 2-7 when credentials arrive

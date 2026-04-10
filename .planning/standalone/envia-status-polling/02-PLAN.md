---
phase: envia-status-polling
plan: 02
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - src/lib/carriers/envia-api.ts
  - src/lib/domain/carrier-events.ts
  - src/lib/domain/carrier-configs.ts
  - src/inngest/functions/envia-status-polling.ts
  - src/app/api/inngest/route.ts
autonomous: true

must_haves:
  truths:
    - "Cron polls Envia API every 2h (5am-7pm Colombia) for all active guides"
    - "State changes are recorded in order_carrier_events (only when estado changes)"
    - "Guides in terminal states are excluded from future polling"
    - "Feature flag ENVIA_AUTO_STAGE_MOVE controls pipeline stage moves (OFF by default)"
  artifacts:
    - path: "src/lib/carriers/envia-api.ts"
      provides: "Envia API fetch wrapper"
      exports: ["fetchEnviaStatus"]
    - path: "src/lib/domain/carrier-events.ts"
      provides: "Domain layer for carrier events CRUD"
      exports: ["insertCarrierEvent", "getLastCarrierEvent", "getCarrierEventsByOrder"]
    - path: "src/inngest/functions/envia-status-polling.ts"
      provides: "Inngest cron function"
      exports: ["enviaStatusPollingCron"]
  key_links:
    - from: "src/inngest/functions/envia-status-polling.ts"
      to: "src/lib/carriers/envia-api.ts"
      via: "fetchEnviaStatus import"
      pattern: "fetchEnviaStatus"
    - from: "src/inngest/functions/envia-status-polling.ts"
      to: "src/lib/domain/carrier-events.ts"
      via: "insertCarrierEvent import"
      pattern: "insertCarrierEvent"
    - from: "src/app/api/inngest/route.ts"
      to: "src/inngest/functions/envia-status-polling.ts"
      via: "function registration"
      pattern: "enviaStatusPollingCron"
---

<objective>
Build the complete backend for Envia status polling: API client, domain layer, Inngest cron function, and registration.

Purpose: Automatically poll Envia Colvanes API every 2 hours to detect shipment state changes and record them in order_carrier_events.
Output: Working cron function that polls active guides and stores state change events.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/envia-status-polling/CONTEXT.md
@.planning/standalone/envia-status-polling/RESEARCH.md
@src/inngest/functions/close-stale-sessions.ts
@src/lib/domain/carrier-configs.ts
@src/lib/domain/notes.ts
@src/lib/domain/types.ts
@src/app/api/inngest/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Envia API client + domain layer</name>
  <files>
    src/lib/carriers/envia-api.ts
    src/lib/domain/carrier-events.ts
    src/lib/domain/carrier-configs.ts
  </files>
  <action>
**1. Create `src/lib/carriers/envia-api.ts`:**

Thin fetch wrapper for the Envia status API. No new npm packages -- use native fetch.

```typescript
const ENVIA_STATUS_URL = 'https://hub.envia.co/ServicioRestConsultaEstados/Service1Consulta.svc/ConsultaEstadoGuia'

export interface EnviaStatusResponse {
  estado: string           // "GENERADA", "DESPACHADA", etc.
  cod_estadog: number      // 1, 4, 5, 8, 16, 18, etc.
  fec_recoleccion: string | null
  fec_despacho: string | null
  fec_bodega_destino: string | null
  fec_reparto: string | null
  fec_entrega: string | null
  novedades: Array<{
    cod_novedad: number
    novedad: string
    fecha: string
    mca_estado: string  // "VI" = vigente
    detalle?: string
  }>
  [key: string]: unknown  // allow extra fields in raw_response
}

export async function fetchEnviaStatus(guia: string): Promise<EnviaStatusResponse | null> {
  try {
    const res = await fetch(`${ENVIA_STATUS_URL}/${guia}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
```

**2. Create `src/lib/domain/carrier-events.ts`:**

Domain layer for `order_carrier_events` table. Follow existing pattern from notes.ts / carrier-configs.ts.

Functions needed:
- `insertCarrierEvent(ctx, params)` -- Insert new event row. Params: orderId, guia, carrier, estado, codEstado, novedades (jsonb), rawResponse (jsonb). Returns DomainResult with the event id.
- `getLastCarrierEvent(ctx, orderId)` -- Get most recent event for an order (for change detection). Select from order_carrier_events WHERE order_id = orderId ORDER BY created_at DESC LIMIT 1.
- `getCarrierEventsByOrder(ctx, orderId)` -- Get all events for an order (for tracking UI). Order by created_at DESC.

All functions use `createAdminClient()` and filter by `workspace_id`. Follow DomainContext/DomainResult pattern from types.ts.

**3. Extend `src/lib/domain/carrier-configs.ts`:**

Add two new fields to the `CarrierConfig` interface:
```typescript
status_polling_pipeline_id: string | null
status_polling_stage_ids: string[] | null
```

Add a new convenience function `getStatusPollingStages(ctx, carrier)` following the same pattern as `getGuideLookupStage()`. Returns `{ pipelineId: string; stageIds: string[] } | null`. Uses the 'envia' carrier config row.

Also add to `UpsertCarrierConfigParams`:
```typescript
statusPollingPipelineId?: string | null
statusPollingStageIds?: string[] | null
```

And handle these in the `upsertCarrierConfig` function (both insert and update paths).
  </action>
  <verify>
    - `npx tsc --noEmit` passes (no type errors)
    - All three files export correct functions
    - carrier-configs.ts CarrierConfig interface includes new fields
  </verify>
  <done>
    - envia-api.ts exports fetchEnviaStatus with 10s timeout
    - carrier-events.ts exports insertCarrierEvent, getLastCarrierEvent, getCarrierEventsByOrder
    - carrier-configs.ts extended with status_polling fields + getStatusPollingStages
  </done>
</task>

<task type="auto">
  <name>Task 2: Inngest cron function + registration</name>
  <files>
    src/inngest/functions/envia-status-polling.ts
    src/app/api/inngest/route.ts
  </files>
  <action>
**1. Create `src/inngest/functions/envia-status-polling.ts`:**

Follow close-stale-sessions.ts pattern exactly. Cron function with TZ= prefix.

```
Cron: TZ=America/Bogota 0 5,7,9,11,13,15,17,19 * * *
(Every 2h from 5am-7pm Colombia, 7 days/week)
```

**Function logic (3 steps within step.run boundaries):**

**Step 1: `get-active-guides`**
Query all orders across ALL workspaces where:
- `tracking_number IS NOT NULL` (the guide number)
- carrier is 'envia' (use `carrier ILIKE '%envia%'` to catch 'ENVIA', 'Envia', 'envia')
- The order is in a stage that's configured for polling

How to determine eligible orders:
- Query carrier_configs WHERE carrier = 'envia' AND status_polling_pipeline_id IS NOT NULL
- For each config, get the status_polling_stage_ids array
- Query orders WHERE workspace_id = config.workspace_id AND stage_id = ANY(status_polling_stage_ids) AND tracking_number IS NOT NULL
- ALSO include orders where carrier ILIKE '%envia%' AND tracking_number IS NOT NULL AND stage_id is in ANY configured polling stage

If no carrier_configs have polling configured yet, fall back to: query ALL orders with carrier ILIKE '%envia%' AND tracking_number IS NOT NULL across all workspaces. This is the "observation mode" -- poll everything until stages are configured.

Return: Array of `{ orderId, workspaceId, trackingNumber }`.

**Step 2: `poll-envia-api`**
Process guides in batches of 20 per step.run() to avoid timeouts.
- For each guide, call `fetchEnviaStatus(trackingNumber)`
- Return array of `{ orderId, workspaceId, trackingNumber, response }` (only successful responses)

Use `step.run('poll-batch-N', ...)` for each batch.

**Step 3: `process-changes`**
For each polled guide:
- Call `getLastCarrierEvent(ctx, orderId)` to get previous state
- Compare `cod_estadog` from API with last known `cod_estado`
- If different (or no previous event exists): call `insertCarrierEvent(ctx, { orderId, guia, carrier: 'envia', estado, codEstado, novedades, rawResponse })`
- Log the change via `logger.info`

**Feature flag for stage moves (prepared but OFF):**
```typescript
const autoStageMove = process.env.ENVIA_AUTO_STAGE_MOVE === 'true'
if (autoStageMove && stateChanged) {
  // TODO: Map cod_estadog to pipeline stage and call moveOrderToStage
  // This will be implemented after 2-3 days of observation
  logger.info({ orderId, codEstado: newCodEstado }, 'auto-stage-move would fire here')
}
```

Return summary: `{ totalGuides, polled, changed, errors }`.

**IMPORTANT Inngest patterns:**
- Return all data from step.run() -- closures don't survive replays
- Use `createAdminClient()` inside each step.run() (fresh client per step)
- `retries: 1` for cron functions
- Use `createModuleLogger('envia-status-polling')` for structured logging

**2. Register in `src/app/api/inngest/route.ts`:**

Add import:
```typescript
import { enviaStatusPollingCron } from '@/inngest/functions/envia-status-polling'
```

Add to functions array:
```typescript
enviaStatusPollingCron,
```

Add to JSDoc comment listing.
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - enviaStatusPollingCron is exported and registered in route.ts
    - Cron expression is `TZ=America/Bogota 0 5,7,9,11,13,15,17,19 * * *`
    - Function uses step.run() for each logical unit
  </verify>
  <done>
    - Inngest cron function created with 3-step logic (get guides, poll API, process changes)
    - Registered in route.ts
    - Feature flag ENVIA_AUTO_STAGE_MOVE prepared but OFF by default
    - Batching in groups of 20 to avoid timeouts
  </done>
</task>

</tasks>

<verification>
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] envia-api.ts exports fetchEnviaStatus
- [ ] carrier-events.ts exports insertCarrierEvent, getLastCarrierEvent, getCarrierEventsByOrder
- [ ] carrier-configs.ts has status_polling fields in CarrierConfig interface
- [ ] envia-status-polling.ts exports enviaStatusPollingCron with correct cron
- [ ] route.ts imports and registers enviaStatusPollingCron
- [ ] All domain functions use createAdminClient() and filter by workspace_id
</verification>

<success_criteria>
Backend is complete: cron function will poll Envia API, detect state changes, and store events in order_carrier_events. Feature flag for auto-stage-move is OFF. Ready for deploy after frontend plan completes.
</success_criteria>

<output>
After completion, create `.planning/standalone/envia-status-polling/02-SUMMARY.md`
</output>

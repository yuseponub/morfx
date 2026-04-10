# Standalone: Envia Status Polling - Research

**Researched:** 2026-04-10
**Domain:** Inngest cron + Supabase + carrier API polling + order UI
**Confidence:** HIGH

## Summary

This project adds automatic polling of Envia Colvanes shipment statuses via their public REST API. The codebase already has mature patterns for Inngest cron functions, carrier configuration, order domain mutations, and order notes -- all of which can be directly reused.

The Envia API is a simple public GET endpoint returning JSON with shipment state, timeline, and active novelties. No authentication needed. The cron runs every 2 hours during business hours (5am-7pm Colombia time) using Inngest's `TZ=` cron prefix pattern already established in this codebase.

**Primary recommendation:** Follow the close-stale-sessions cron pattern for Inngest, add new `order_carrier_events` table, extend `carrier_configs` with polling stage fields, add tracking UI section in `order-sheet.tsx` between shipping and description sections.

## Standard Stack

### Core (already in codebase -- no new dependencies)
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| Inngest | Durable cron function | Already used for 6+ cron/event functions |
| Supabase (admin client) | DB reads/writes bypassing RLS | Domain layer pattern |
| Next.js App Router | API + UI | Existing stack |
| Tailwind CSS | Tracking section styling | Existing stack |

### No new npm packages needed
The Envia API is a simple HTTP GET returning JSON. Use native `fetch()` -- no axios or other HTTP library required.

## Architecture Patterns

### 1. Inngest Cron Function Pattern (from close-stale-sessions.ts)

**Established pattern in codebase:**
```typescript
import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('envia-status-polling')

export const enviaStatusPollingCron = inngest.createFunction(
  {
    id: 'envia-status-polling',
    name: 'Envia Status Polling',
    retries: 1,
  },
  { cron: 'TZ=America/Bogota 0 5,7,9,11,13,15,17,19 * * *' },
  async ({ step }) => {
    // Step 1: Get active guides across all workspaces
    // Step 2: Poll each guide via Envia API
    // Step 3: Insert events for changed states + add order notes
  }
)
```

**Key details (HIGH confidence -- from codebase):**
- Cron string uses `TZ=America/Bogota` prefix (Inngest v3.51.0 pattern, used in close-stale-sessions and observability-purge)
- Every 2 hours from 5am-7pm Colombia = hours 5,7,9,11,13,15,17,19 = 8 runs/day
- `retries: 1` is standard for cron functions
- Must register in `src/app/api/inngest/route.ts` functions array
- Use `step.run()` for durable steps within the function
- Use `createAdminClient()` for all DB operations (bypass RLS)
- Use `createModuleLogger()` for structured logging

### 2. Domain Layer Pattern (from orders.ts, notes.ts)

All mutations through `src/lib/domain/`. For this project:

```typescript
// src/lib/domain/carrier-events.ts (NEW)
export async function insertCarrierEvent(
  ctx: DomainContext,
  params: InsertCarrierEventParams
): Promise<DomainResult<InsertCarrierEventResult>>

// Reuse existing:
// src/lib/domain/notes.ts → createOrderNote()
// src/lib/domain/orders.ts → moveOrderToStage()
// src/lib/domain/carrier-configs.ts → getCarrierConfig()
```

**DomainContext pattern:**
```typescript
const ctx: DomainContext = {
  workspaceId: workspace.id,
  source: 'cron',  // or 'inngest-cron'
}
```

### 3. Carrier Config Extension Pattern

Current `carrier_configs` table has per-carrier pipeline/stage config fields. Pattern for new fields:

```sql
-- New columns following existing naming convention:
ALTER TABLE carrier_configs ADD COLUMN status_polling_pipeline_id uuid REFERENCES pipelines(id);
ALTER TABLE carrier_configs ADD COLUMN status_polling_stage_ids uuid[] DEFAULT '{}';
```

The TypeScript type in `carrier-configs.ts` must be extended:
```typescript
// Add to CarrierConfig interface:
status_polling_pipeline_id: string | null
status_polling_stage_ids: string[] | null
```

### 4. Order Sheet UI Pattern (from order-sheet.tsx)

The order detail sheet has sections separated by `<Separator />`:
1. Contact
2. Products
3. Shipping (includes carrier + tracking_number)
4. Description
5. Tags
6. Related Orders
7. Order Notes
8. Timeline (dates)
9. Actions

**Tracking section placement:** Insert new "Tracking Envia" section AFTER the Shipping section and BEFORE Description. Only show when the order has carrier='envia' and has carrier events.

**Section pattern (from existing code):**
```tsx
<section className="space-y-3">
  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
    <IconComponent className="h-4 w-4" />
    Section Title
  </h3>
  {/* content */}
</section>
```

### 5. Multi-Workspace Cron Pattern (from task-overdue-cron.ts)

The task-overdue-cron queries across ALL workspaces in a single query, then processes per-workspace. Same approach for Envia polling:

```typescript
// Step 1: Get all active Envia guides across all workspaces
// Query orders WHERE carrier = 'envia' AND stage_id IN (configured polling stages)
// AND tracking_number IS NOT NULL AND carrier_guide_number IS NOT NULL

// Step 2: Batch poll Envia API for each guide
// Step 3: Compare with last known state, insert events for changes
```

### Recommended File Structure
```
src/
  inngest/
    functions/
      envia-status-polling.ts       # NEW - Inngest cron function
  lib/
    domain/
      carrier-events.ts             # NEW - Domain layer for order_carrier_events
      carrier-configs.ts            # EXTEND - Add getStatusPollingStages()
      notes.ts                      # REUSE - createOrderNote()
      orders.ts                     # REUSE - moveOrderToStage()
    carriers/
      envia-api.ts                  # NEW - Envia API client (fetch wrapper)
  app/
    (dashboard)/crm/pedidos/
      components/
        order-tracking-section.tsx  # NEW - Tracking UI component
        order-sheet.tsx             # MODIFY - Add tracking section
    actions/
      order-tracking.ts            # NEW - Server action to fetch tracking data
supabase/
  migrations/
    YYYYMMDD_order_carrier_events.sql  # NEW - Table + indexes
    YYYYMMDD_carrier_configs_polling.sql  # NEW - Add polling columns
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron scheduling | Custom setInterval/setTimeout | Inngest cron with `TZ=` prefix | Durable, survives deploys, retries |
| DB access | Raw SQL or direct Supabase | `createAdminClient()` via domain layer | Bypasses RLS, workspace isolation |
| Order notes | Custom note insertion | `createOrderNote()` from domain/notes.ts | Already handles workspace isolation |
| Stage moves | Direct DB update | `moveOrderToStage()` from domain/orders.ts | Emits automation triggers |
| HTTP requests | axios/got | Native `fetch()` | Simple GET, no auth, no cookies |
| Timezone handling | Manual UTC offset math | `TZ=America/Bogota` in cron string | Inngest handles DST automatically |

## Common Pitfalls

### Pitfall 1: Cron Expression Must Be UTC (or use TZ= prefix)
**What goes wrong:** Cron runs at wrong times because expression is in UTC but developer thinks in Colombia time.
**How to avoid:** Use `TZ=America/Bogota` prefix in the cron string. This is already established in close-stale-sessions.ts and observability-purge.ts.
**Verified:** The cron string `TZ=America/Bogota 0 5,7,9,11,13,15,17,19 * * *` will run at 5am, 7am, ..., 7pm Colombia time.

### Pitfall 2: Inngest step.run() Return Value Serialization
**What goes wrong:** In-memory data doesn't survive across step.run() boundaries in Inngest (each replay is a fresh lambda).
**How to avoid:** Return all needed data from step.run() so Inngest serializes it. Don't rely on closures or in-memory state between steps.
**From:** MEMORY.md Inngest observability merge pattern.

### Pitfall 3: Fire-and-Forget inngest.send() in Serverless
**What goes wrong:** `inngest.send()` without `await` may not complete before the lambda shuts down.
**How to avoid:** Always `await inngest.send()` -- BUT this cron function doesn't send events (it's the cron itself). This applies if stage moves trigger automation events.

### Pitfall 4: API Rate Limiting / Timeouts
**What goes wrong:** Polling 50+ guides sequentially may timeout (Vercel serverless has 60s/300s limits).
**How to avoid:** Process guides in batches within step.run(). Each step.run() is its own execution unit. If there are 100+ guides, chunk into groups of 20-30 per step.
**Warning signs:** Function duration exceeding 30s in a single step.

### Pitfall 5: Duplicate Events on Retry
**What goes wrong:** If the function retries after partial completion, events may be inserted twice.
**How to avoid:** Use step.run() for each logical unit. Inngest memoizes completed steps on retry. Also, before inserting an event, check if the last event for this guide already has the same `cod_estado` -- the "only insert on change" logic handles this naturally.

### Pitfall 6: Migration Before Deploy
**What goes wrong:** Code referencing new columns deployed before migration runs.
**How to avoid:** Per project rules (Regla 5): create migration file, PAUSE for user to apply in production, WAIT for confirmation, THEN push code.

### Pitfall 7: Order carrier_guide_number vs tracking_number
**What goes wrong:** Confusing the two fields. `tracking_number` is the user-facing guide number (pedido). `carrier_guide_number` is a flag field used by the guide lookup filter.
**How to avoid:** For Envia polling, query orders by `tracking_number IS NOT NULL` (this is the actual guide number). The `carrier_guide_number` field may or may not be populated for Envia orders -- check both.

## Code Examples

### Envia API Call (verified with 27 real guides per CONTEXT)
```typescript
// Source: CONTEXT.md - API confirmed functional
interface EnviaStatusResponse {
  // Key fields from API response
  estado: string           // e.g. "GENERADA", "DESPACHADA", "EN BODEGA DESTINO"
  cod_estadog: number      // e.g. 1, 4, 5, 8, 16, 18
  // Timeline fields
  fec_recoleccion: string | null
  fec_despacho: string | null
  fec_bodega_destino: string | null
  fec_reparto: string | null
  fec_entrega: string | null
  // Novelties
  novedades: Array<{
    cod_novedad: number
    novedad: string
    fecha: string
    mca_estado: string  // "VI" = vigente (active)
    detalle?: string
  }>
  // Full raw response stored as jsonb
}

async function fetchEnviaStatus(guia: string): Promise<EnviaStatusResponse | null> {
  try {
    const res = await fetch(
      `https://hub.envia.co/ServicioRestConsultaEstados/Service1Consulta.svc/ConsultaEstadoGuia/${guia}`,
      { signal: AbortSignal.timeout(10000) } // 10s timeout per guide
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null // Network error, skip this guide
  }
}
```

### New Table Schema
```sql
-- order_carrier_events: State change history per order/guide
CREATE TABLE order_carrier_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  guia text NOT NULL,
  carrier text NOT NULL DEFAULT 'envia',
  estado text NOT NULL,
  cod_estado integer NOT NULL,
  novedades jsonb DEFAULT '[]',
  raw_response jsonb,
  created_at timestamptz DEFAULT timezone('America/Bogota', NOW())
);

-- Indexes for common queries
CREATE INDEX idx_order_carrier_events_order ON order_carrier_events(order_id);
CREATE INDEX idx_order_carrier_events_workspace ON order_carrier_events(workspace_id);
CREATE INDEX idx_order_carrier_events_guia ON order_carrier_events(guia);
```

### Inngest Registration (append to route.ts)
```typescript
// In src/app/api/inngest/route.ts:
import { enviaStatusPollingCron } from '@/inngest/functions/envia-status-polling'

// Add to functions array:
functions: [
  // ... existing functions
  enviaStatusPollingCron,
],
```

### Order Note on State Change (reuse existing domain function)
```typescript
import { createOrderNote } from '@/lib/domain/notes'

await createOrderNote(ctx, {
  orderId: order.id,
  content: `[Envia] Estado actualizado: ${previousEstado} -> ${newEstado}${
    novedades.length > 0
      ? `\nNovedades: ${novedades.map(n => n.novedad).join(', ')}`
      : ''
  }`,
  createdBy: 'system', // or a system user ID
})
```

### Feature Flag for Stage Moves
```typescript
// Environment variable: ENVIA_AUTO_STAGE_MOVE=false (default)
const autoStageMove = process.env.ENVIA_AUTO_STAGE_MOVE === 'true'

if (autoStageMove && stateChanged) {
  // Map cod_estadog to pipeline stage
  // Use moveOrderToStage() from domain/orders.ts
  // This emits order.stage_changed trigger for automations
}
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Robot scraping (Playwright) | Direct API polling (fetch) | No microservice needed, runs in Vercel/Inngest |
| Manual tracking check | Automatic cron polling | Zero manual effort |
| No state history | `order_carrier_events` table | Full audit trail |

## Open Questions

1. **Terminal state codes**
   - What we know: Codes 1,4,5,8,16,18 observed. Entregada/devuelta codes unknown.
   - Recommendation: The first 2-3 days of polling will discover all codes. Log `cod_estadog` values to build complete mapping. No blocker for implementation.

2. **createOrderNote createdBy for system/cron**
   - What we know: `createOrderNote` expects a `createdBy` string (user.id). The cron has no user context.
   - Recommendation: Use a fixed string like `'system'` or `'envia-cron'`. The order_notes table `user_id` column type needs checking -- if it's a UUID FK to users, we may need to use a null-safe approach or create a system user row.

3. **Guide number field for Envia orders**
   - What we know: `tracking_number` is the user-facing guide. `carrier_guide_number` is a flag for Coordinadora guide lookup. For Envia, we need to confirm which field contains the Envia guide number.
   - Recommendation: Query orders with `carrier ILIKE '%envia%'` and `tracking_number IS NOT NULL` to identify the polling candidates. Verify with real data.

4. **Carrier config for Envia**
   - What we know: `carrier_configs` has rows per workspace+carrier. Currently configs exist for 'coordinadora'. The new polling fields go on a row with `carrier = 'envia'`.
   - Recommendation: Need to create an 'envia' carrier_config row if one doesn't exist. The `status_polling_pipeline_id` and `status_polling_stage_ids` fields determine which orders to poll.

## Sources

### Primary (HIGH confidence)
- `src/inngest/functions/close-stale-sessions.ts` -- Cron function pattern with TZ= prefix
- `src/inngest/functions/observability-purge.ts` -- Multi-step cron pattern
- `src/inngest/functions/task-overdue-cron.ts` -- Multi-workspace cron pattern
- `src/lib/domain/carrier-configs.ts` -- CarrierConfig type + CRUD pattern
- `src/lib/domain/orders.ts` -- Order mutations + moveOrderToStage
- `src/lib/domain/notes.ts` -- createOrderNote pattern
- `src/lib/domain/types.ts` -- DomainContext + DomainResult types
- `src/app/api/inngest/route.ts` -- Function registration pattern
- `src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx` -- UI layout structure

### Secondary (MEDIUM confidence)
- CONTEXT.md -- API response format from 27 real guide tests
- MEMORY.md -- Inngest step.run serialization pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all patterns exist in codebase, no new dependencies
- Architecture: HIGH -- direct extension of established patterns
- Pitfalls: HIGH -- documented from real production incidents in this codebase
- API format: MEDIUM -- based on CONTEXT.md testing, not official Envia docs

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable patterns, no external library changes)

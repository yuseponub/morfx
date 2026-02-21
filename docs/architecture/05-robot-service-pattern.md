# Robot Service Pattern — Architecture Documentation

> **Audience:** Future development (Claude agents and human developers building new carrier integrations).
> **Reference Implementation:** `robot-coordinadora/` (Coordinadora carrier, active since v3.0)

---

## 1. Overview

### What Is a "Robot"?

In MorfX, a **robot** is a standalone service that automates actions on external carrier web portals using Playwright (headless Chromium). Robots fill forms, submit shipments, and extract tracking numbers — replacing the manual process of logging into a carrier portal and creating shipments one by one.

### Why Standalone?

Playwright (headless Chromium) **cannot run on Vercel serverless** — it requires a persistent process with 500MB+ of Chromium binaries. Robots are deployed as separate Docker containers on Railway (or any Docker host), communicating with MorfX through HTTP callbacks and Inngest events.

### Current Robots

| Robot | Carrier | Status | Portal |
|-------|---------|--------|--------|
| `robot-coordinadora` | Coordinadora | Active | ff.coordinadora.com |
| `robot-inter` | Inter Rapidisimo | Planned | — |
| `robot-envia` | Envia | Planned | — |
| `robot-servientrega` | Servientrega | Planned | — |

---

## 2. Robot Service Pattern

Each robot follows the same structural pattern established by `robot-coordinadora/`:

### Structure

```
robot-{carrier}/
  src/
    index.ts                          # Express server entry point
    api/server.ts                     # HTTP endpoints (health + batch)
    adapters/{carrier}-adapter.ts     # Playwright automation for the carrier portal
    middleware/locks.ts               # In-memory workspace + per-order locking
    types/index.ts                    # Shared types (mirrors MorfX contracts)
  Dockerfile                          # Based on mcr.microsoft.com/playwright
  package.json                        # express + playwright dependencies
  tsconfig.json
```

### Key Properties

- **Standalone Express + Playwright** deployed on Railway as a Docker container
- **One adapter per carrier** — the adapter encapsulates all portal-specific selectors, form interactions, and result detection
- **Batch processing** — receives N orders, processes them sequentially through the portal, reports per-order results via HTTP callback
- **Session management** — saves browser cookies to disk per workspace, reuses sessions to avoid re-login on every batch
- **Fire-and-forget acknowledgement** — the batch endpoint returns `200 OK` immediately after validation, then processes orders in the background

### Adapter Interface

Every carrier adapter must implement this lifecycle:

```typescript
class CarrierAdapter {
  async init(): Promise<void>              // Launch Chromium, load cookies
  async login(): Promise<boolean>          // Authenticate on carrier portal
  async createGuia(pedido: PedidoInput): Promise<GuiaResult>  // Fill form, submit, extract result
  async close(): Promise<void>             // Close browser (ALWAYS in try/finally)
}
```

### Batch Endpoint Contract

```
POST /api/crear-pedidos-batch
```

**Request body** (`BatchRequest`):
```typescript
interface BatchRequest {
  workspaceId: string
  credentials: { username: string; password: string }
  callbackUrl: string           // MorfX callback: /api/webhooks/robot-callback
  callbackSecret?: string       // Shared secret forwarded in callback headers
  jobId: string
  orders: Array<{
    itemId: string              // robot_job_items.id
    orderId: string             // orders.id
    pedidoInput: PedidoInput    // Shipment data to fill in portal form
  }>
}
```

**Immediate response** (`BatchResponse`):
```typescript
{ success: true, jobId: string, message: "Batch aceptado, procesando..." }
```

**Per-order callback** (`BatchItemResult`):
```typescript
interface BatchItemResult {
  itemId: string
  status: 'success' | 'error'
  trackingNumber?: string
  errorType?: 'validation' | 'portal' | 'timeout' | 'unknown'
  errorMessage?: string
}
```

---

## 3. Communication Flow

### ASCII Diagram

```
 MorfX (Vercel)                    Inngest                     Robot (Railway)
 ─────────────                    ────────                     ───────────────
      │                               │                              │
  [1] User: "subir ordenes coord"     │                              │
      │                               │                              │
  [2] Server Action:                  │                              │
      validate creds + stage          │                              │
      fetch orders from stage         │                              │
      validate cities                 │                              │
      create robot_job + items        │                              │
      │                               │                              │
  [3] inngest.send(                   │                              │
        robot/job.submitted)  ───────>│                              │
      │                               │                              │
      │                           [4] robot-orchestrator             │
      │                               mark job "processing"         │
      │                               │                              │
      │                           [5] HTTP POST ────────────────────>│
      │                               /api/crear-pedidos-batch      │
      │                               │                              │
      │                               │                         [6] Validate, 200 OK
      │                               │<────────────────────────────│
      │                               │                              │
      │                           [7] step.waitForEvent              │
      │                               (dynamic timeout)             │
      │                               │                         [8] For each order:
      │                               │                              login/reuse session
      │                               │                              fill form + submit
      │                               │                              detect result
      │                               │                              │
      │    [9] POST /api/webhooks/robot-callback <──────────────────│
      │        (per order, with X-Callback-Secret)                  │
      │                               │                              │
  [10] Callback route:                │                              │
       domain: updateJobItemResult    │                              │
       domain: updateOrder (tracking) │                              │
       emit: robot.coord.completed    │                              │
       (automation trigger)           │                              │
       │                              │                              │
  [11] If all items done:             │                              │
       inngest.send(                  │                              │
         robot/job.batch_completed)──>│                              │
       │                              │                              │
       │                          [12] orchestrator returns          │
       │                              { status: 'completed' }       │
```

### Step-by-Step Breakdown

| Step | Component | Action |
|------|-----------|--------|
| 1 | Chat de Comandos UI | User types "subir ordenes coord" in `/comandos` |
| 2 | Server Action (`comandos.ts`) | Validates credentials, fetches dispatch stage orders, validates cities, creates `robot_job` + `robot_job_items` |
| 3 | Server Action | Emits `robot/job.submitted` Inngest event with job data, credentials, and order payloads |
| 4 | Inngest Orchestrator | Marks job as `processing` via domain layer |
| 5 | Inngest Orchestrator | HTTP POST to robot service at `ROBOT_COORDINADORA_URL/api/crear-pedidos-batch` |
| 6 | Robot Service | Validates request, checks idempotency + workspace lock, returns `200 OK` immediately |
| 7 | Inngest Orchestrator | Waits for `robot/job.batch_completed` event with dynamic timeout: `(N orders x 30s) + 5 min` |
| 8 | Robot Service | Processes orders sequentially: init browser, login, fill form, submit, detect SweetAlert2 result |
| 9 | Robot Service | POSTs each order result to MorfX callback URL with `X-Callback-Secret` header |
| 10 | Callback Route | Updates job item via domain, updates order `tracking_number`/`carrier`, fires `robot.coord.completed` automation trigger |
| 11 | Callback Route | When `success_count + error_count >= total_items`, domain auto-completes job, callback emits `robot/job.batch_completed` |
| 12 | Inngest Orchestrator | Receives batch_completed event, returns final status |

---

## 4. Key Files Reference

### Robot Service (`robot-coordinadora/`)

| File | Purpose |
|------|---------|
| `robot-coordinadora/src/index.ts` | Entry point — starts Express on configurable PORT with graceful shutdown |
| `robot-coordinadora/src/api/server.ts` | HTTP endpoints: health check (`GET /api/health`) + batch processing (`POST /api/crear-pedidos-batch`) |
| `robot-coordinadora/src/adapters/coordinadora-adapter.ts` | Playwright automation for ff.coordinadora.com — login, form fill, SweetAlert2 result detection, cookie persistence |
| `robot-coordinadora/src/middleware/locks.ts` | In-memory workspace mutex (one batch per workspace) + per-order skip-if-processing locks |
| `robot-coordinadora/src/types/index.ts` | TypeScript interfaces for HTTP API contract (BatchRequest, BatchItemResult, PedidoInput) |
| `robot-coordinadora/Dockerfile` | Production image based on `mcr.microsoft.com/playwright:v1.52.0-noble` |

### MorfX Core (`src/`)

| File | Purpose |
|------|---------|
| `src/inngest/functions/robot-orchestrator.ts` | Durable Inngest function: dispatch to robot, wait for batch completion with dynamic timeout, fail-fast (retries: 0) |
| `src/app/api/webhooks/robot-callback/route.ts` | Receives per-order callbacks from robot, routes through domain layer, fires automation triggers, signals batch completion |
| `src/lib/domain/robot-jobs.ts` | Domain layer for robot jobs: create job, update item results, auto-complete job, retry failed items |
| `src/lib/domain/carrier-configs.ts` | CRUD for carrier credentials and dispatch stage configuration |
| `src/lib/domain/carrier-coverage.ts` | City validation against carrier coverage tables (single and batch) |
| `src/lib/logistics/constants.ts` | Department abbreviation mapping, text normalization, PedidoInput type definition |
| `src/app/actions/comandos.ts` | Server actions for Chat de Comandos: full dispatch flow, job status, history |
| `src/app/(dashboard)/comandos/page.tsx` | Chat de Comandos page — logistics command panel UI entry point |

---

## 5. Data Model

### Tables

```
carrier_configs
  ├── workspace_id, carrier (unique pair)
  ├── portal_username, portal_password (carrier portal credentials)
  ├── dispatch_pipeline_id, dispatch_stage_id (which CRM stage = "ready to dispatch")
  └── is_enabled

carrier_coverage (global reference table, no workspace_id)
  ├── carrier, city_name, department_abbrev
  ├── city_coordinadora (exact carrier format: "MEDELLIN (ANT)")
  ├── dane_code_id (FK to dane_municipalities)
  └── supports_cod, is_active

robot_jobs
  ├── workspace_id, carrier, status (pending/processing/completed/failed)
  ├── total_items, success_count, error_count
  ├── idempotency_key (prevents duplicate jobs for same batch)
  └── started_at, completed_at

robot_job_items (child of robot_jobs, parent-join RLS)
  ├── job_id, order_id
  ├── status (pending/processing/success/error)
  ├── tracking_number, validated_city, value_sent (JSONB snapshot)
  ├── error_type (validation/portal/timeout/unknown), error_message
  └── retry_count, last_retry_at
```

### Realtime

Supabase Realtime subscriptions on both `robot_jobs` (job status changes) and `robot_job_items` (per-order progress) power the live Chat de Comandos UI. The UI uses dual listeners on a single channel: items for per-order progress updates, job for overall status transitions.

---

## 6. Anti-Duplicate Protection

Five layers prevent duplicate shipments on the carrier portal:

| Layer | Where | How |
|-------|-------|-----|
| **1. Idempotency key** | `robot_jobs` table | `idempotency_key` column checked against active jobs (`pending`/`processing`) before creating a new job. Rejects if a job with the same key is already active. |
| **2. Active job guard** | Server Action (`comandos.ts`) | `getActiveJob()` check — refuses to create a new job if one is already `pending` or `processing` for the workspace. |
| **3. Workspace lock** | Robot service (`locks.ts`) | In-memory Map — only one batch per workspace can run concurrently. Returns `409 Conflict` if workspace is already locked. |
| **4. Per-order lock** | Robot service (`locks.ts`) | In-memory Set — individual orders being processed are skipped (not blocked) if already in the processing Set. |
| **5. Idempotency cache** | Robot service (`server.ts`) | In-memory Map keyed by `jobId` — returns cached `200 OK` response for sequential re-submissions (e.g., Inngest retries after response was already sent). Set BEFORE `res.json()` to prevent race with immediate retry. |

### Additional Safety

- **Inngest retries: 0** on `robot-orchestrator` — fail-fast prevents re-submission of the entire batch
- **Item terminal state guard** — `updateJobItemResult` in the domain layer skips updates to items already in `success` or `error` state
- **Batch completion via domain status** — callback reads `job.status === 'completed'` (atomically set by domain) rather than doing counter arithmetic, preventing spurious duplicate `batch_completed` events from concurrent final callbacks

---

## 7. Adding a New Carrier (Step-by-Step)

This guide walks through adding a new carrier (e.g., Inter Rapidisimo) to the robot system.

### Step 1: Create the Robot Service

Create a new directory at the repo root following the reference structure:

```
robot-inter/
  src/
    index.ts                    # Copy from robot-coordinadora, change port/name
    api/server.ts               # Reuse same endpoint contract (POST /api/crear-pedidos-batch)
    adapters/inter-adapter.ts   # NEW: Playwright automation for Inter's portal
    middleware/locks.ts          # Copy as-is (same locking pattern)
    types/index.ts              # Adjust PedidoInput if Inter requires different fields
  Dockerfile                    # Same base image (mcr.microsoft.com/playwright)
  package.json                  # Same deps: express + playwright
  tsconfig.json
```

The **only file that changes significantly** is the adapter. The server, locks, types, and Dockerfile are largely reusable.

### Step 2: Implement the Carrier Adapter

Create `InterAdapter` following the same interface as `CoordinadoraAdapter`:

```typescript
class InterAdapter {
  async init(): Promise<void>           // Launch Chromium, load cookies
  async login(): Promise<boolean>       // Navigate to Inter portal, fill login form
  async createGuia(pedido: PedidoInput): Promise<GuiaResult>  // Fill shipment form, submit, extract tracking
  async close(): Promise<void>          // Close browser
}
```

Key considerations:
- Study the Inter portal's form structure (field names, city selector type, submit behavior)
- Implement result detection for Inter's success/error feedback (may not be SweetAlert2)
- Handle session cookies per workspace (same pattern as Coordinadora)
- Add screenshot capture for debugging failed submissions

### Step 3: Add Coverage Data

Insert rows into `carrier_coverage` for the new carrier:

```sql
INSERT INTO carrier_coverage (carrier, city_name, department_abbrev, city_coordinadora, supports_cod, is_active)
VALUES ('inter', 'MEDELLIN', 'ANT', 'MEDELLIN (ANT)', false, true);
-- Repeat for all covered cities
```

Note: The `city_coordinadora` column name is legacy — it stores the carrier-specific city format regardless of carrier. If Inter uses a different format, store that format.

### Step 4: Add Carrier Config Support

Update `src/lib/domain/carrier-configs.ts` — no code changes needed. The existing functions accept a `carrier` parameter (defaults to `'coordinadora'`). Just pass `'inter'` when calling.

The Settings UI at `/settings/logistica` already renders placeholder cards for future carriers. Enable the Inter card by updating the carrier list in the settings component.

### Step 5: Add PedidoInput Mapping

If Inter requires different fields than Coordinadora, either:
- Extend `PedidoInput` in `src/lib/logistics/constants.ts` with optional fields, OR
- Create a carrier-specific type that maps from the common `OrderForDispatch`

Update `buildPedidoInputFromOrder()` in `src/app/actions/comandos.ts` or create a carrier-specific builder.

### Step 6: Add Server Action Command

Add `executeSubirOrdenesInter()` in `src/app/actions/comandos.ts` following the same pattern as `executeSubirOrdenesCoord()`:
1. Validate credentials (`getCarrierCredentials(ctx, 'inter')`)
2. Get dispatch stage (`getDispatchStage(ctx, 'inter')`)
3. Check active jobs
4. Fetch orders, validate cities
5. Create robot job (`createRobotJob(ctx, { carrier: 'inter', orderIds })`)
6. Build pedido inputs
7. Emit Inngest event

### Step 7: Create Inngest Orchestrator

Add a new orchestrator function in `src/inngest/functions/` or extend the existing one to accept a `carrier` parameter and route to the correct robot URL based on carrier:

```typescript
const robotUrl = carrier === 'inter'
  ? process.env.ROBOT_INTER_URL
  : process.env.ROBOT_COORDINADORA_URL
```

### Step 8: Add Automation Trigger

Create `robot.inter.completed` trigger type:
1. Add to `TriggerType` union in `src/lib/automations/types.ts`
2. Add emitter function in `src/lib/automations/trigger-emitter.ts`
3. Add Inngest event type in `src/inngest/events.ts`
4. Add automation-runner case in `src/inngest/functions/automation-runner.ts`

### Step 9: Deploy on Railway

1. Create a new Railway service pointing to the `robot-inter/` directory
2. Set environment variables: `PORT` (Railway assigns), no MorfX env vars needed (robot is stateless)
3. Set `ROBOT_INTER_URL` env var in MorfX (Vercel) pointing to the Railway service URL

### Step 10: Add Chat Command

Register the new command in the Chat de Comandos UI:
1. Add "subir ordenes inter" to the command list in `/comandos` components
2. Wire it to `executeSubirOrdenesInter()` server action
3. Reuse the same Realtime progress display (it works off `robot_job_items` regardless of carrier)

---

## 8. Pipeline Config

### Dispatch Stage Binding

Each carrier is bound to a specific pipeline stage that represents "ready to dispatch." This is configured in the Settings UI at `/settings/logistica`:

1. **Pipeline selection** — workspace owner selects which CRM pipeline contains dispatch orders
2. **Stage selection** — selects the specific stage within that pipeline (e.g., "Por Despachar")
3. **Credentials** — portal username/password for the carrier
4. **Enable toggle** — carrier is only active when explicitly enabled

This configuration is stored in `carrier_configs`:
```typescript
{
  carrier: 'coordinadora',
  dispatch_pipeline_id: 'uuid-of-pipeline',
  dispatch_stage_id: 'uuid-of-stage',
  portal_username: 'user@company.com',
  portal_password: '...',
  is_enabled: true
}
```

### How Commands Use Pipeline Config

When a user executes "subir ordenes coord":

1. `getDispatchStage(ctx, 'coordinadora')` reads the configured pipeline + stage
2. `getOrdersByStage(ctx, stageId)` fetches all orders in that CRM stage
3. `getCarrierCredentials(ctx, 'coordinadora')` validates credentials are complete and carrier is enabled
4. Only orders with valid shipping cities (per `carrier_coverage`) are included in the batch

### Settings UI Path

`/settings/logistica` — accessible only to workspace owners. Shows one card per carrier with pipeline/stage dropdowns, credentials fields, and enable toggle. Future carriers appear as disabled placeholder cards.

---

## Appendix: Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `ROBOT_COORDINADORA_URL` | MorfX (Vercel) | Base URL of the robot-coordinadora service on Railway |
| `ROBOT_CALLBACK_SECRET` | MorfX (Vercel) + Robot (Railway) | Shared HMAC secret for authenticating callback requests |
| `PORT` | Robot (Railway) | Express server port (Railway assigns, defaults to 3001) |
| `INNGEST_EVENT_KEY` | MorfX (Vercel) | Inngest event key for sending events |
| `NEXT_PUBLIC_APP_URL` | MorfX (Vercel) | Used to construct the callback URL for the robot |

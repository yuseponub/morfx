# Architecture: Logistics Robot Integration

**Domain:** Playwright browser automation integrated with MorfX CRM
**Researched:** 2026-02-20
**Confidence:** HIGH

## Key Architectural Decisions

1. **Playwright runs as separate microservice** on Railway (~$5-10/mo). Cannot run on Vercel.
2. **Inngest orchestrates** robot operations (same pattern as automation runners).
3. **Domain layer handles** all order mutations from robot results (no direct DB writes from robot).
4. **Supabase Realtime** for progress updates to Chat de Comandos UI.
5. **Robot service is stateless** except for cookie persistence on disk.

## Data Flow

```
User types command in Chat de Comandos
  |
  v
POST /api/robots/command
  - Validates orders in target stage
  - Creates robot_job record in Supabase
  - Emits Inngest event: robot/job.dispatch
  - Returns job_id to frontend
  |
  v
Inngest Function: robot-job-orchestrator
  step.run('load-credentials')  → Get carrier credentials from integrations table
  step.run('call-robot')        → HTTP POST to Robot Service with orders + credentials
  step.run('process-results')   → For each result, call domain updateOrder()
  step.run('complete-job')      → Mark job complete
  |
  v
Robot Service (Railway)
  - Receives order batch via HTTP
  - Opens Playwright browser
  - Logs into carrier portal (or restores cookies)
  - For each order:
    - Fills form, submits
    - Captures guide number
    - Sends callback: POST /api/robots/callback with result
  - Returns batch summary
  |
  v
POST /api/robots/callback (per order)
  - Updates robot_job_items record (Supabase Realtime fires)
  - Calls domain updateOrder() with tracking_number
  - Automation triggers fire (field.changed → WhatsApp notification)
  |
  v
Chat de Comandos (Supabase Realtime subscription)
  - Receives real-time updates per order
  - Shows: "Processing 7/25: Guide #123456 ✓"
```

## New Components

### Database Tables

```sql
-- Reference data: Colombian municipalities
CREATE TABLE dane_municipalities (
  code CHAR(5) PRIMARY KEY,
  name TEXT NOT NULL,
  department_code CHAR(2) NOT NULL,
  department_name TEXT NOT NULL,
  alternative_names TEXT[] DEFAULT '{}',
  region TEXT
);

-- Carrier coverage per municipality
CREATE TABLE carrier_coverage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  carrier_code TEXT NOT NULL,  -- 'coordinadora', 'inter', 'envia'
  dane_code CHAR(5) REFERENCES dane_municipalities(code),
  carrier_city_name TEXT,      -- carrier's expected city string
  is_cod_available BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true
);

-- Robot job tracking
CREATE TABLE robot_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  carrier TEXT NOT NULL,
  command TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  total_orders INT NOT NULL,
  processed_count INT DEFAULT 0,
  success_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
  created_by UUID REFERENCES auth.users(id)
);

-- Per-order results within a job
CREATE TABLE robot_job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES robot_jobs(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, success, failed
  tracking_number TEXT,
  error_message TEXT,
  screenshot_url TEXT,
  processed_at TIMESTAMPTZ
);
```

### Domain Layer Extensions

```typescript
// src/lib/domain/shipping.ts (NEW)
export async function updateOrderShipping(ctx: DomainContext, params: {
  orderId: string;
  trackingNumber: string;
  carrier: string;
  shippingLabelUrl?: string;
}) // Calls updateOrder() internally, emits field.changed triggers

// src/lib/domain/robot-jobs.ts (NEW)
export async function createRobotJob(ctx: DomainContext, params: {...})
export async function updateRobotJobItem(ctx: DomainContext, params: {...})
```

### Inngest Events & Functions

```typescript
// New events
'robot/job.dispatch': { data: { jobId, workspaceId, carrier, orderIds } }
'robot/order.callback': { data: { jobId, orderId, status, trackingNumber } }

// New function: robot-job-orchestrator
// Pattern: same as automation-runner factory
```

### API Routes

```
POST /api/robots/command     → Parse command, create job, emit Inngest event
POST /api/robots/callback    → Receive per-order results from robot service
GET  /api/robots/jobs        → List jobs for workspace (history)
```

### UI Component

```
src/app/(dashboard)/logistica/
  ├── page.tsx                → Main logistics page with Chat de Comandos
  └── components/
      ├── command-chat.tsx    → Terminal-style panel (monospace, dark bg)
      ├── command-parser.ts   → Parse fixed commands
      ├── job-progress.tsx    → Real-time progress via Supabase Realtime
      └── job-history.tsx     → Past command results
```

## Integration Points with Existing Code

| Existing Component | Integration |
|-------------------|-------------|
| `src/lib/domain/orders.ts` | updateOrder() called by robot callbacks |
| `src/lib/inngest/events.ts` | Add robot event types |
| `src/lib/inngest/client.ts` | Register new robot functions |
| `src/lib/automations/constants.ts` | field.changed triggers fire on tracking_number update |
| `src/app/(dashboard)/crm/pedidos/` | Orders pipeline stages linked to robot |

## Multi-Tenant Isolation

- Carrier credentials stored in `integrations` table per workspace
- Robot jobs filtered by `workspace_id`
- Credentials passed per-request to robot (robot NEVER stores them)
- Inngest concurrency key: `event.data.workspaceId`

## Robot Service Architecture

```
robot-coordinadora/
  ├── Dockerfile              → FROM mcr.microsoft.com/playwright:v1.50.0-noble
  ├── package.json            → playwright, express, cors, helmet
  ├── src/
  │   ├── server.ts           → Express API (health, create-order, batch)
  │   ├── coordinadora/
  │   │   ├── adapter.ts      → Playwright automation for ff.coordinadora.com
  │   │   ├── selectors.ts    → CSS/ARIA selectors (externalized)
  │   │   └── normalizer.ts   → Data normalization (MorfX → portal format)
  │   ├── auth/
  │   │   └── session.ts      → Cookie save/restore/validate
  │   └── types/
  │       └── index.ts        → Shared types
  └── data/
      └── cookies/            → Persistent cookie storage
```

## Suggested Build Order

1. **DB + Domain** — Tables, migrations, domain functions, Inngest events (LOW risk)
2. **Robot Service** — Express + Playwright on Railway, Coordinadora adapter (MEDIUM risk)
3. **Inngest Orchestrator + Callback API** — Connect MorfX to robot service (LOW risk)
4. **Chat de Comandos UI** — Command panel with Realtime progress (LOW risk)
5. **Pipeline Integration** — Stage → robot trigger mapping (LOW risk)

---
*Research completed: 2026-02-20*

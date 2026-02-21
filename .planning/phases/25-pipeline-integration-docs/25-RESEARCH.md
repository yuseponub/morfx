# Phase 25: Pipeline Config UI + Docs - Research

**Researched:** 2026-02-21
**Domain:** Settings UI (carrier config), Architecture Documentation
**Confidence:** HIGH

## Summary

Phase 25 adds a visual UI for workspace admins to configure which pipeline stage feeds which robot carrier, and produces architecture documentation for the robot service pattern. The DB layer already exists (`carrier_configs` table with `dispatch_pipeline_id` + `dispatch_stage_id` columns), the domain functions already exist (`upsertCarrierConfig`, `getCarrierConfig`, `getDispatchStage`), and the command flow already works (`executeSubirOrdenesCoord` in `src/app/actions/comandos.ts`). This phase is purely a **UI layer + docs** on top of existing infrastructure.

The codebase has a perfect reference implementation for this exact pattern: the **activacion-cliente** settings page (`/settings/activacion-cliente`). It follows the same shape: server page with auth check, fetches pipelines + existing config, renders a client form component with dropdowns for pipeline stages, save via server action that calls domain layer. This phase should follow the same pattern exactly.

For documentation, the target audience is future development (both Claude and human devs). The architecture covers: robot-coordinadora standalone service, Inngest orchestration, callback API, domain layer integration, and a step-by-step guide for adding a new carrier (Inter, Envia, Bogota).

**Primary recommendation:** Clone the activacion-cliente settings pattern for the UI, and write robot architecture docs in `docs/architecture/`.

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js 15 | App Router | Server components + server actions | Project standard |
| React 19 | - | Client components with useTransition | Project standard |
| Supabase JS | - | DB queries via createAdminClient | Domain layer pattern |
| Tailwind CSS | - | Styling | Project standard |
| shadcn/ui | - | Card, Switch, Select, Button, Label, toast | Already in `src/components/ui/` |

### UI Components Available (already installed)
| Component | Path | Used For |
|-----------|------|----------|
| `Card` | `@/components/ui/card` | Settings section containers |
| `Select` | `@/components/ui/select` | Pipeline/stage/robot dropdowns |
| `Switch` | `@/components/ui/switch` | Enable/disable toggle per binding |
| `Button` | `@/components/ui/button` | Add/remove binding, save |
| `Label` | `@/components/ui/label` | Form labels |
| `Badge` | `@/components/ui/badge` | "Proximamente" carrier placeholder |
| `toast` (sonner) | `sonner` | Success/error feedback |

### No New Dependencies Needed

This phase uses **zero new libraries**. All UI components exist in the project. The domain layer is complete. No DB migrations needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
  app/(dashboard)/settings/
    logistica/
      page.tsx                    # Server page (auth check, data fetch)
      components/
        logistics-config-form.tsx # Client form component
  app/actions/
    logistics-config.ts           # Server actions (get/update carrier config)
docs/architecture/
  05-robot-service-pattern.md     # Architecture documentation
```

### Pattern 1: Settings Page (Clone from activacion-cliente)

**What:** Server-rendered settings page with client form component
**When to use:** Any settings page with read + write operations
**Reference:** `src/app/(dashboard)/settings/activacion-cliente/page.tsx`

```typescript
// Server page pattern (page.tsx)
export default async function LogisticaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) redirect('/workspace')

  // Check admin role
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    redirect('/settings')
  }

  // Fetch data in parallel
  const [carrierConfig, pipelines] = await Promise.all([
    getLogisticsConfig(),
    getPipelines(),
  ])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
        {/* Header */}
        <LogisticsConfigForm config={carrierConfig} pipelines={pipelines} />
      </div>
    </div>
  )
}
```

### Pattern 2: Server Action (Clone from client-activation.ts)

**What:** Auth-guarded server action that validates role, then calls domain layer
**Reference:** `src/app/actions/client-activation.ts`

```typescript
// Server action pattern
'use server'
export async function updateLogisticsConfig(
  params: { dispatchPipelineId: string | null; dispatchStageId: string | null; isEnabled: boolean }
): Promise<ActionResult<CarrierConfig>> {
  // 1. Auth check (user + workspace)
  // 2. Role check (owner or admin)
  // 3. Call domain: upsertCarrierConfig(ctx, params)
  // 4. revalidatePath('/settings/logistica')
  // 5. Return result
}
```

### Pattern 3: Client Form with useTransition

**What:** Client component with local state + server action via useTransition
**Reference:** `src/app/(dashboard)/settings/activacion-cliente/components/activation-config-form.tsx`

```typescript
// Client form pattern
'use client'
export function LogisticsConfigForm({ config, pipelines }: Props) {
  const [isPending, startTransition] = useTransition()
  const [selectedPipelineId, setSelectedPipelineId] = useState(config?.dispatch_pipeline_id ?? null)
  const [selectedStageId, setSelectedStageId] = useState(config?.dispatch_stage_id ?? null)
  const [isEnabled, setIsEnabled] = useState(config?.is_enabled ?? false)

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateLogisticsConfig({ ... })
      if ('error' in result) toast.error(result.error)
      else toast.success('Configuracion actualizada')
    })
  }

  return (/* Cards with Select dropdowns, Switch, and Save button */)
}
```

### Pattern 4: Carrier Config Domain Layer (Already Exists)

**What:** The domain functions for carrier config CRUD are fully implemented
**Key functions available:**
- `getCarrierConfig(ctx, carrier?)` -- Read config (returns null if not exists)
- `upsertCarrierConfig(ctx, params)` -- Create or update config
- `getDispatchStage(ctx, carrier?)` -- Get pipeline/stage IDs
- `getCarrierCredentials(ctx, carrier?)` -- Get credentials (validates enabled + complete)

**IMPORTANT:** The domain layer handles ONE carrier_configs row per carrier per workspace (UNIQUE constraint on `workspace_id + carrier`). The `dispatch_pipeline_id` and `dispatch_stage_id` are columns on this same row, alongside `portal_username` and `portal_password`. The UI must update these columns without touching credentials.

### Anti-Patterns to Avoid
- **Direct DB writes from server actions:** Always go through domain layer (`upsertCarrierConfig`)
- **Duplicating credential management:** Credentials were set up in Phase 21. The logistics UI only manages dispatch_pipeline_id + dispatch_stage_id + is_enabled. Do NOT add credential fields.
- **Multiple carrier rows per workspace:** The DB has a UNIQUE(workspace_id, carrier) constraint. The UI concept of "bindings list" maps to reading all carrier_configs rows for the workspace, one per carrier.
- **Automatic robot activation:** Per user decision, the robot activates by manual command in Chat de Comandos, NOT automatically when orders move to a stage.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pipeline/stage fetching | Custom Supabase query | `getPipelines()` from `src/app/actions/pipelines.ts` | Already returns `PipelineWithStages[]` with stages sorted by position |
| Carrier config CRUD | Direct DB mutations | `upsertCarrierConfig()` from `src/lib/domain/carrier-configs.ts` | Already handles create-or-update, workspace isolation, PGRST116 |
| Auth + workspace resolution | Custom auth logic | Copy pattern from `activacion-cliente/page.tsx` | Proven pattern with role check |
| Toast notifications | Custom notification system | `toast` from `sonner` | Already used throughout the app |
| Form state management | useReducer or external lib | `useState` + `useTransition` | Matches existing settings forms |

## Common Pitfalls

### Pitfall 1: Confusing carrier_configs scope
**What goes wrong:** Thinking each "binding" (etapa -> robot) is a separate row. Actually each carrier has ONE row in carrier_configs with dispatch_pipeline_id + dispatch_stage_id.
**Why it happens:** The CONTEXT.md describes "lista de vinculos" which implies multiple rows, but carrier_configs has UNIQUE(workspace_id, carrier).
**How to avoid:** The "list" is a list of carrier_configs rows -- one per carrier. Currently only "coordinadora" exists. Future carriers (Inter, Envia, Bogota) would each be their own row.
**Warning signs:** Trying to INSERT multiple rows for the same carrier.

### Pitfall 2: Touching credentials in the logistics UI
**What goes wrong:** The logistics settings UI accidentally displays or allows editing of portal_username/portal_password.
**Why it happens:** carrier_configs stores both credentials AND dispatch config in the same row.
**How to avoid:** The server action only passes `dispatchPipelineId`, `dispatchStageId`, and `isEnabled` to `upsertCarrierConfig`. Never pass `portalUsername` or `portalPassword`.
**Warning signs:** UpsertCarrierConfigParams in the server action includes credential fields.

### Pitfall 3: Stage dropdown not filtering by selected pipeline
**What goes wrong:** User selects Pipeline A but sees stages from all pipelines.
**Why it happens:** getPipelines() returns all pipelines with stages. The stage dropdown must be dynamically filtered.
**How to avoid:** When user selects a pipeline, filter `pipelines.find(p => p.id === selectedPipelineId)?.stages` for the stage dropdown.
**Warning signs:** Stage dropdown shows stages from wrong pipeline.

### Pitfall 4: Missing flex-1 overflow wrapper
**What goes wrong:** Page content gets cut off or layout breaks.
**Why it happens:** Dashboard layout requires specific wrapper.
**How to avoid:** Always use `<div className="flex-1 overflow-y-auto">` as the outermost wrapper inside the page component (documented in MEMORY.md).
**Warning signs:** Page content doesn't scroll.

### Pitfall 5: Settings page link not added
**What goes wrong:** Logistics settings page exists but is unreachable.
**Why it happens:** Forgetting to add the link to the settings hub page.
**How to avoid:** Add entry to `settingsLinks` array in `src/app/(dashboard)/settings/page.tsx` with `ownerOnly: true`.
**Warning signs:** Users can't find the new settings page.

### Pitfall 6: Placeholder carriers appearing in carrier_configs
**What goes wrong:** Creating carrier_configs rows for Inter/Envia/Bogota that don't have working robots.
**Why it happens:** UI shows placeholders; someone might try to create config rows for them.
**How to avoid:** Placeholder carriers are DISABLED in the UI. They are NOT rows in carrier_configs. They are visual-only indicators rendered from a static constant.
**Warning signs:** carrier_configs has rows for carriers other than 'coordinadora'.

## Code Examples

### Example 1: Settings Hub Link Entry
```typescript
// In src/app/(dashboard)/settings/page.tsx settingsLinks array
{
  href: '/settings/logistica',
  title: 'Logistica',
  description: 'Configura que etapa del pipeline activa cada robot de transportadora',
  icon: Truck,  // from lucide-react
  ownerOnly: true,
}
```

### Example 2: Server Action - Get Logistics Config
```typescript
// src/app/actions/logistics-config.ts
'use server'
import { getCarrierConfig, type CarrierConfig } from '@/lib/domain/carrier-configs'

export async function getLogisticsConfig(): Promise<CarrierConfig | null> {
  // Auth check...
  const ctx = { workspaceId, source: 'server-action' }
  const result = await getCarrierConfig(ctx, 'coordinadora')
  if (!result.success) return null
  return result.data
}
```

### Example 3: Server Action - Update Dispatch Config
```typescript
// src/app/actions/logistics-config.ts
export async function updateDispatchConfig(params: {
  carrier: string
  dispatchPipelineId: string | null
  dispatchStageId: string | null
  isEnabled: boolean
}): Promise<ActionResult<CarrierConfig>> {
  // Auth + role check...
  const ctx: DomainContext = { workspaceId, source: 'server-action' }
  const result = await upsertCarrierConfig(ctx, {
    carrier: params.carrier,
    dispatchPipelineId: params.dispatchPipelineId,
    dispatchStageId: params.dispatchStageId,
    isEnabled: params.isEnabled,
  })
  if (!result.success) return { error: result.error! }
  revalidatePath('/settings/logistica')
  return { success: true, data: result.data! }
}
```

### Example 4: Carrier Constants for UI Rendering
```typescript
// Static list of known carriers for the UI
const KNOWN_CARRIERS = [
  { id: 'coordinadora', name: 'Coordinadora', available: true },
  { id: 'interrapidisimo', name: 'Inter Rapidisimo', available: false },
  { id: 'envia', name: 'Envia', available: false },
  { id: 'servientrega', name: 'Servientrega (Bogota)', available: false },
] as const
```

### Example 5: Pipeline-Filtered Stage Dropdown
```typescript
// Inside the client form component
const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId)
const availableStages = selectedPipeline?.stages ?? []

<Select value={selectedStageId ?? ''} onValueChange={setSelectedStageId}>
  <SelectTrigger>
    <SelectValue placeholder="Seleccionar etapa..." />
  </SelectTrigger>
  <SelectContent>
    {availableStages.map(stage => (
      <SelectItem key={stage.id} value={stage.id}>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
          {stage.name}
        </div>
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| carrier_configs had only credentials | carrier_configs has dispatch_pipeline_id + dispatch_stage_id | Phase 24 (migration 000004) | Config already in DB, just needs UI |
| No logistics UI | Manual DB updates via Supabase dashboard | Current | This phase adds the UI |
| No robot architecture docs | Code comments + MEMORY.md snippets | Current | This phase creates proper docs |

## Data Model Summary

### carrier_configs table schema (fully migrated)
```sql
id UUID PRIMARY KEY
workspace_id UUID NOT NULL REFERENCES workspaces(id)
carrier TEXT NOT NULL DEFAULT 'coordinadora'
portal_username TEXT
portal_password TEXT
dispatch_pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL
dispatch_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL
is_enabled BOOLEAN NOT NULL DEFAULT false
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
UNIQUE(workspace_id, carrier)
```

### Key Relationships
- carrier_configs.dispatch_pipeline_id -> pipelines.id
- carrier_configs.dispatch_stage_id -> pipeline_stages.id
- One row per carrier per workspace (UNIQUE constraint)
- ON DELETE SET NULL on both FK columns (safe pipeline/stage deletion)

## Robot Architecture Documentation Plan

The documentation deliverable should cover these topics (audience: future dev / Claude):

### 1. Robot Service Pattern
- Standalone Express service (`robot-coordinadora/`) with Playwright
- Deployed on Railway (Docker), NOT on Vercel
- Communicates with MorfX via HTTP (dispatch) + HTTP callbacks (results)
- One adapter per carrier (`CoordinadoraAdapter` = Playwright automation of ff.coordinadora.com)

### 2. Communication Flow
```
MorfX (Vercel)                    Robot (Railway)
     |                                  |
     |-- Inngest: robot/job.submitted ->|
     |   (robot-orchestrator)           |
     |                                  |
     |-- HTTP POST /api/crear-pedidos --|
     |   (dispatch with credentials,    |
     |    orders, callbackUrl)          |
     |                                  |
     |   [Robot processes orders        |
     |    sequentially with Playwright] |
     |                                  |
     |<-- HTTP POST /api/webhooks/      |
     |    robot-callback (per-order)    |
     |   {itemId, status, tracking}     |
     |                                  |
     |--> Domain: updateJobItemResult   |
     |--> Automation: robot.coord.completed
     |                                  |
     |<-- Final callback (last order)   |
     |--> Inngest: robot/job.batch_completed
     |--> robot-orchestrator unblocks   |
```

### 3. Key Files Reference
| File | Purpose |
|------|---------|
| `robot-coordinadora/src/index.ts` | Express server entry |
| `robot-coordinadora/src/api/server.ts` | Batch endpoint + processing |
| `robot-coordinadora/src/adapters/coordinadora-adapter.ts` | Playwright automation |
| `robot-coordinadora/src/middleware/locks.ts` | Workspace + order locks |
| `robot-coordinadora/src/types/index.ts` | Shared contracts |
| `src/inngest/functions/robot-orchestrator.ts` | Inngest durable function |
| `src/app/api/webhooks/robot-callback/route.ts` | Callback receiver |
| `src/lib/domain/robot-jobs.ts` | Job/item CRUD |
| `src/lib/domain/carrier-configs.ts` | Config CRUD |
| `src/lib/domain/carrier-coverage.ts` | City validation |
| `src/lib/logistics/constants.ts` | Department mapping |
| `src/app/actions/comandos.ts` | Command execution flow |

### 4. Adding a New Carrier (Step-by-Step Guide)
1. **Standalone robot service** -- New Express service with carrier-specific adapter
2. **Types contract** -- Define PedidoInput equivalent, BatchRequest/Response
3. **DB migration** -- (No migration needed; insert new row in carrier_configs with carrier name)
4. **Domain layer** -- carrier_configs already supports any carrier name
5. **Inngest event** -- Add robot/{carrier}-specific events
6. **Orchestrator** -- New Inngest function or extend robot-orchestrator
7. **Callback route** -- Reuse existing or create carrier-specific route
8. **Coverage data** -- City validation for new carrier's coverage area
9. **Chat command** -- New command (e.g., "subir ordenes inter")
10. **UI** -- Enable the carrier in the logistics settings UI

### 5. Anti-Duplicate Protection
- **Workspace lock** -- Only one batch per workspace at a time (robot middleware)
- **Per-order lock** -- Skip orders already being processed
- **Batch idempotency cache** -- Reject re-submissions of same jobId
- **Inngest retries: 0** -- Never retry orchestrator (prevents duplicate portal submissions)
- **Domain idempotency guard** -- Skip updateJobItemResult if item already in terminal state

## Open Questions

1. **E2E Verification Strategy**
   - What we know: The phase requires E2E verification of the full flow (config -> stage move -> command -> robot -> callbacks -> CRM updates)
   - What's unclear: Whether this needs a scripted test or manual walkthrough. Playwright E2E on Vercel is impossible (per architecture decision). The robot itself runs on Railway.
   - Recommendation: Document the E2E verification as a manual checklist that the user walks through. No automated E2E test for this phase.

2. **Credential UI Location**
   - What we know: Credentials (portal_username, portal_password) are in carrier_configs. They were presumably set via Supabase dashboard or seed data.
   - What's unclear: Is there already a UI for credentials, or does Phase 25 need one?
   - Recommendation: Per CONTEXT.md, "Credenciales del portal ya estan en carrier_configs (F21), no duplicar." The logistics UI only manages dispatch config, NOT credentials. If there's no credential UI, that's a separate concern.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** -- Direct reading of all 15+ files listed in Key Files Reference
- `src/lib/domain/carrier-configs.ts` -- Full domain API verified
- `src/lib/domain/robot-jobs.ts` -- Full domain API verified
- `src/app/(dashboard)/settings/activacion-cliente/` -- Reference implementation verified
- `src/app/actions/client-activation.ts` -- Server action pattern verified
- `src/app/actions/pipelines.ts` -- Pipeline fetching API verified
- `supabase/migrations/20260222000002_carrier_configs.sql` -- Table schema verified
- `supabase/migrations/20260222000004_carrier_dispatch_stage.sql` -- Column migration verified
- `robot-coordinadora/src/` -- Full robot service structure verified
- `src/inngest/functions/robot-orchestrator.ts` -- Orchestration pattern verified
- `src/app/api/webhooks/robot-callback/route.ts` -- Callback handler verified

### Secondary (MEDIUM confidence)
- Settings page patterns derived from multiple existing pages in the codebase

### Tertiary (LOW confidence)
- None -- all findings are from direct codebase analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all components already exist in the project
- Architecture patterns: HIGH -- clone of existing activacion-cliente pattern
- Pitfalls: HIGH -- derived from direct code analysis of constraints
- Documentation plan: HIGH -- robot service code fully analyzed

**Research date:** 2026-02-21
**Valid until:** Indefinite (internal codebase patterns, not external library versions)

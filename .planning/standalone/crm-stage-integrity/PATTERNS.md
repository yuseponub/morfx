# Standalone: CRM Stage Integrity — Pattern Map

**Mapped:** 2026-04-21
**Files analyzed:** 18 (2 CREATE source + 1 CREATE migration + 8 MODIFY + 7 CREATE tests)
**Analogs found:** 18 / 18 (3 marcados como "net-new pattern" — CAS idiom, cascade_capped history writer, append-only audit ledger — todos con precedente parcial en codebase)

---

## File Classification

| File | Action | Role | Data Flow | Closest Analog | Match Quality |
|------|--------|------|-----------|----------------|---------------|
| `supabase/migrations/<ts>_crm_stage_integrity.sql` | CREATE | DB migration (DDL + seed + realtime publication) | SQL DDL → Supabase | `supabase/migrations/20260212000000_orders_realtime.sql` + `20260213000001_mutation_audit.sql` + `20260420000443_platform_config.sql` (composite) | exact (composite) |
| `src/lib/domain/orders.ts` | MODIFY (lines 557-648) | Domain mutation (CAS + audit insert + trigger emit) | read → CAS UPDATE → history INSERT → emit | `src/lib/agents/crm-writer/two-step.ts:140-189` (idempotent optimistic UPDATE precedent) + self lines 564-588 | role-match — net-new CAS idiom for mutation (precedent is state machine) |
| `src/lib/domain/types.ts` | MODIFY (add fields to DomainContext) | Type extension | — | self (DomainContext interface lines 15-21) | exact (self) |
| `src/app/actions/orders.ts` | MODIFY (lines 518-524, 603-613, 810-831) | Server action — CAS error handling + bulk return shape change | server action → domain → error narrow | self lines 601-613 (existing error path) | exact (self) |
| `src/lib/automations/action-executor.ts` | MODIFY (lines 301-323) | Automation action (annotation only) | — | self | exact (self — minimal edit) |
| `src/lib/automations/trigger-emitter.ts` | MODIFY (lines 23-36, isCascadeSuppressed) | Trigger filter — inserts cascade_capped audit row | detect cap → INSERT history | self (existing function shape) + Pattern 4 of RESEARCH | role-match — net-new cascade-capped writer |
| `src/inngest/functions/automation-runner.ts` | MODIFY (lines 358-405) | Inngest function (stacked concurrency + kill-switch + cap audit) | event → flag-gated step.run queries → skip/execute | `src/inngest/functions/recompra-preload-context.ts:47-68` (concurrency+flag) + `src/inngest/functions/agent-production.ts:76-81` (single-scope) | exact (composite) |
| `src/lib/builder/validation.ts` | MODIFY (lines 390-437) | Builder-side validator (static cycle detection) | automations graph → DFS → cycle path | self lines 398-436 (existing function to expand) | exact (self — expand recursion + operators) |
| `src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx` | MODIFY (lines 205-307, add Realtime useEffect) | Client component (React 19 DnD + Realtime + optimistic) | drag → optimistic → server → reconcile | `src/hooks/use-messages.ts:174-254` (Realtime + echo suppression canon) | exact |
| `src/hooks/use-kanban-realtime.ts` | CREATE | React hook — Realtime subscription extraction | mount → subscribe → payload → onRemoteMove / onReconnect | `src/hooks/use-messages.ts:174-254` | exact |
| `.claude/rules/agent-scope.md` | MODIFY (§CRM Writer Bot) | Docs — document CAS error contract | — | self lines 51-80 (existing scope block) | exact (self) |
| `src/lib/agents/crm-writer/two-step.ts` | MODIFY (confirm branch, ~lines 159-189) | Two-step mutator — propagate CAS error upstream | confirm UPDATE → domain call → narrow error | self lines 140-189 (existing idempotency) | exact (self) |
| `src/__tests__/integration/orders-cas.test.ts` | CREATE | Integration test — CAS concurrency | vitest + real Supabase + 2 parallel UPDATEs | `src/__tests__/integration/crm-bots/reader.test.ts:1-60` (env + admin client scaffold) | exact |
| `src/lib/builder/__tests__/validation-cycles.test.ts` | CREATE | Unit test — cycle detection AND/OR + operators | vitest pure-function | `src/lib/agents/somnio/__tests__/block-composer.test.ts` (pure-function pattern) | exact |
| `src/inngest/functions/__tests__/automation-runner-killswitch.test.ts` | CREATE | Unit test — kill-switch query + threshold | vitest + mocked admin client + mocked step.run | `src/inngest/functions/__tests__/recompra-preload-context.test.ts` | exact |
| `src/inngest/functions/__tests__/automation-runner-cascade-capped.test.ts` | CREATE | Unit test — history insert on cap | vitest + mocked admin client | `src/inngest/functions/__tests__/recompra-preload-context.test.ts` | exact |
| `src/__tests__/integration/stage-changed-concurrency.test.ts` | CREATE | Integration test — Inngest concurrency serialization | vitest + Inngest dev server OR manual smoke | `src/__tests__/integration/crm-bots/reader.test.ts` (env scaffold) | role-match — may degrade to manual smoke (RESEARCH §Test Architecture) |
| `src/app/(dashboard)/crm/pedidos/components/__tests__/kanban-board-rollback.test.tsx` | CREATE | Component test — rollback + toast on CAS reject | vitest + @testing-library/react + mock server action | ninguno directo (primer component test del proyecto) | role-match — net-new pattern (documentar framework choice en Plan 05) |
| `src/__tests__/integration/order-stage-history-rls.test.ts` | CREATE | Integration test — append-only trigger enforcement | vitest + service_role admin + expect INSERT ok / UPDATE rejected | `src/__tests__/integration/crm-bots/reader.test.ts` (env scaffold) | role-match |

---

## Wave Structure

Derivado de RESEARCH.md §Primary Recommendation (5 planes) y dependencies:

- **Wave 0 — Migracion DB (Plan 01)** — no depende de nada; debe aplicarse ANTES del deploy de codigo (Regla 5). Crea `order_stage_history`, agrega `orders` a `supabase_realtime`, seed 2 flags en `platform_config`.
- **Wave 1 — Domain CAS + Audit writer (Plan 02)** — depende de Wave 0 (tabla existe) + flag `crm_stage_integrity_cas_enabled`. Modifica `src/lib/domain/orders.ts` + `src/lib/domain/types.ts` + `src/app/actions/orders.ts` (`bulkMoveOrdersToStage` return shape) + `src/lib/agents/crm-writer/two-step.ts`. Test `orders-cas.test.ts`.
- **Wave 2 — Runtime kill-switch + cascade_capped audit (Plan 03)** — depende de Wave 1 (history writer activo para poder contar). Modifica `automation-runner.ts` (flag + step.run query) + `trigger-emitter.ts` (INSERT cascade_capped) + `action-executor.ts` (annotation). Tests `automation-runner-killswitch.test.ts` + `automation-runner-cascade-capped.test.ts`.
- **Wave 3 — Build-time cycle detection expandida (Plan 04)** — independiente de Wave 1/2 (puro validator sin I/O). Modifica `src/lib/builder/validation.ts:390-437`. Test `validation-cycles.test.ts`.
- **Wave 4 — Kanban Realtime + toast rollback + Inngest concurrency (Plan 05)** — UI depende de Wave 1 para que CAS error llegue. Concurrency es independiente (puede ir en Wave 2 o 4). Modifica `kanban-board.tsx` + crea `use-kanban-realtime.ts`. Tests `kanban-board-rollback.test.tsx` + `stage-changed-concurrency.test.ts`.
- **Wave 5 — Docs `.claude/rules/agent-scope.md` + LEARNINGS.md post-deploy.**

**Migration gate (Regla 5):** PAUSE entre Wave 0 push y Wave 1 — usuario aplica migracion en produccion + confirma, LUEGO se pushea codigo que referencia `order_stage_history`.

**Flag flip gate (Regla 6):** Wave 1-5 deployed con CAS flag OFF por default (D-17). Usuario flip manual workspace-by-workspace tras observar `stage_change_rejected_cas` events.

---

## Shared Patterns

### Patron Shared 1 — Feature flag gate con `getPlatformConfig` (fail-open/fail-closed)

**Source:** `src/inngest/functions/recompra-preload-context.ts:58-67`
**Apply to:** Plan 02 (CAS behind `crm_stage_integrity_cas_enabled`, default **false** = fail-closed para rollout), Plan 03 (kill-switch behind `crm_stage_integrity_killswitch_enabled`, default **false** = fail-open pero OFF hasta activar)

```typescript
// Source: src/inngest/functions/recompra-preload-context.ts:58-67
const { getPlatformConfig } = await import('@/lib/domain/platform-config')
const enabled = await getPlatformConfig<boolean>(FEATURE_FLAG_KEY, false)
if (!enabled) {
  logger.info(
    { sessionId, contactId, workspaceId },
    'feature flag off, skipping reader preload',
  )
  return { status: 'skipped' as const, reason: 'feature_flag_off' as const }
}
```

**Differences para este standalone:**
- Plan 02 (CAS): fallback **`false`** → fail-closed (flag off = legacy path sin CAS, no regresion).
- Plan 03 (kill-switch): fallback **`false`** → kill-switch OFF por default; cuando flag ON y query falla, fail-open inline (`catch → return 0 → let automation run`). Ver Pitfall 8 de RESEARCH.
- TTL 30s per-lambda aceptado (Pitfall 11). Runbook: esperar 30-60s tras flip antes de observar.

---

### Patron Shared 2 — `DomainContext.source` como discriminator

**Source:** `src/lib/domain/types.ts:15-21`
**Apply to:** Plan 02 (populate `source` column en `order_stage_history.INSERT`)

```typescript
// Source: src/lib/domain/types.ts:15-21
export interface DomainContext {
  workspaceId: string
  /** Who initiated: 'server-action' | 'tool-handler' | 'automation' | 'webhook' | 'adapter' */
  source: string
  /** Cascade depth for automation trigger chain protection */
  cascadeDepth?: number
}
```

**Differences:**
- Agregar campos `actorId?: string`, `actorLabel?: string`, `triggerEvent?: string` a `DomainContext` (Plan 02). Caller popula: server-action pasa `user_id + name`, action-executor pasa `automation.id + automation.name`, webhook pasa `null + 'shopify'`, etc.
- Mapear `ctx.source` a valores aceptados por CHECK constraint de `order_stage_history.source`:
  - `'server-action'` → `'manual'`
  - `'automation'` → `'automation'`
  - `'webhook'` → `'webhook'`
  - `'tool-handler'` / `'adapter'` → `'agent'` (crm-writer via tools)
  - `'robot'` (nuevo) → `'robot'`
  - default → `'system'`
- Pitfall 10: `actor_id uuid NULL` para user/automation UUIDs; agents pasan `null` y usan `actor_label='crm-writer'`.

---

### Patron Shared 3 — `.select()` + `data.length === 0` detecta filas afectadas post-UPDATE

**Source:** `src/lib/agents/crm-writer/two-step.ts:140-155`
**Apply to:** Plan 02 CAS idiom (canonical example de PATRON CORE)

```typescript
// Source: src/lib/agents/crm-writer/two-step.ts:140-155 — idempotency via optimistic UPDATE
const { data: updated } = await admin
  .from('crm_bot_actions')
  .update({ status: 'failed', error: failed, executed_at: new Date().toISOString() })
  .eq('id', actionId)
  .eq('status', 'proposed')  // ← swap predicate
  .select()
  .maybeSingle()
if (!updated) {
  const { data: current } = await admin
    .from('crm_bot_actions')
    .select('status, output, error')
    .eq('id', actionId)
    .maybeSingle()
  if (current?.status === 'executed') return { status: 'already_executed', output: current.output }
  if (current?.status === 'failed') return { status: 'failed', error: current.error }
}
```

**Differences para CAS de stage_id:**
- Swap predicate es `.eq('stage_id', previousStageId)` (no `status='proposed'`).
- En lugar de `.maybeSingle()` usar `.select('id')` que retorna **array** (Pattern 1 RESEARCH). Check `!updated || updated.length === 0`.
- Re-fetch tras rejection trae `currentStageId` para toast UX (D-15).
- Retorna `error: 'stage_changed_concurrently'` como string-marker literal (callers hacen `result.error === 'stage_changed_concurrently'`).

---

### Patron Shared 4 — Inngest concurrency key por `event.data.<id>`

**Source:** `src/inngest/functions/recompra-preload-context.ts:47-53` (latest per-entity precedent)
**Apply to:** Plan 05 stacked concurrency en `automation-runner.ts`

```typescript
// Source: src/inngest/functions/recompra-preload-context.ts:47-53
export const recompraPreloadContext = inngest.createFunction(
  {
    id: 'recompra-preload-context',
    name: 'Recompra: Preload CRM Context via Reader',
    retries: 1,
    concurrency: [{ key: 'event.data.sessionId', limit: 1 }],
  },
```

**Differences (Pattern 2 RESEARCH):**
- Stack 2 objetos: `workspaceId:5` (pre-existente line 363) **+** `orderId:1` (nuevo, solo para runner `order.stage_changed` — D-09).
- Condicional per-triggerType: no aplicar a otros runners (tag.assigned, order.created, etc.).
- Pitfall 4: validar `event.data.orderId` presence upstream en `emitOrderStageChanged` (ya requerido por typing existente).

---

### Patron Shared 5 — Supabase Realtime + echo suppression via ref

**Source:** `src/hooks/use-messages.ts:174-254`
**Apply to:** Plan 05 `kanban-board.tsx` + `use-kanban-realtime.ts`

```typescript
// Source: src/hooks/use-messages.ts:174-254
useEffect(() => {
  if (!conversationId) return
  const supabase = createClient()
  let previousStatus = ''

  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${conversationId}`,
    }, (payload) => {
      // ... echo handling ...
    })
    .subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR') {
        softRefetch()
      } else if (status === 'SUBSCRIBED' && previousStatus && previousStatus !== 'SUBSCRIBED') {
        softRefetch()
      }
      previousStatus = status
    })

  return () => { supabase.removeChannel(channel) }
}, [conversationId, softRefetch])
```

**Differences (Pattern 3 + Example 3 RESEARCH):**
- Channel name: `kanban:${pipelineId}` (no `messages:`).
- Event: `UPDATE` (no INSERT) + filter `pipeline_id=eq.${pipelineId}`.
- Echo suppression: check `recentMoveRef.current === true` al inicio del callback → return early (existe en `kanban-board.tsx:103-104`, 2000ms timeout — D-16 lock).
- `payload.new` suficiente (NO enable REPLICA IDENTITY FULL — Pitfall 6 RESEARCH).
- Reconnect: `setLocalOrdersByStage(ordersByStage)` con props actuales (equivalent al `softRefetch`).
- Idempotent: `if (currentStageId === updated.stage_id) return prev` (no-op si UI ya esta consistente — Pitfall 7 RESEARCH).
- Deps array: SOLO `[pipelineId, ...memoized-callbacks]`. NO `ordersByStage` (Pitfall 5 RESEARCH — reconnect storm).

---

### Patron Shared 6 — Migration idempotente con GRANTs explicitos + realtime publication + seed

**Source:** `supabase/migrations/20260212000000_orders_realtime.sql` (publication) + `20260420000443_platform_config.sql:35-36` (GRANTs) + `20260421155713_seed_recompra_crm_reader_flag.sql` (seed)
**Apply to:** Plan 01 migration compuesta

```sql
-- Source: supabase/migrations/20260420000443_platform_config.sql:22-36
-- LEARNING Phase 44.1 — toda migration que cree tabla DEBE incluir GRANTs explicitos
-- porque Studio SQL Editor no hereda los grants automaticos del workflow db push.
GRANT ALL    ON TABLE public.platform_config TO service_role;
GRANT SELECT ON TABLE public.platform_config TO authenticated;
```

```sql
-- Source: supabase/migrations/20260212000000_orders_realtime.sql (entire file)
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
```

```sql
-- Source: supabase/migrations/20260421155713_seed_recompra_crm_reader_flag.sql:11-13
INSERT INTO platform_config (key, value)
VALUES ('somnio_recompra_crm_reader_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
```

**Differences para Plan 01:**
- **CREATE tabla `order_stage_history`** con schema D-10 + 3 indices D-11 + `source` CHECK constraint 7 valores.
- **RLS policies** (D-13): SELECT workspace-scoped, INSERT WITH CHECK true, UPDATE/DELETE USING false.
- **Trigger plpgsql** `prevent_order_stage_history_mutation` que hace `RAISE EXCEPTION` en BEFORE UPDATE/DELETE para blockear service_role bypass (Pattern 4 RESEARCH).
- **Realtime add**: `orders` NO esta en publication hoy (verified via grep). Idempotente via `DO $$ IF NOT EXISTS (SELECT 1 FROM pg_publication_tables...) THEN ALTER PUBLICATION ...`. Example 6 RESEARCH.
- **Seed 2 flags**: `crm_stage_integrity_cas_enabled` + `crm_stage_integrity_killswitch_enabled` ambos `'false'::jsonb` con `ON CONFLICT DO NOTHING`.
- **GRANTs explicitos** sobre `order_stage_history`: `GRANT ALL TO service_role` + `GRANT SELECT TO authenticated` (para timeline UI futuro — fuera de scope pero no cuesta nada).
- **COMMENTs** sobre tabla + columnas (Pattern 4 SQL).

---

## Pattern Assignments

### Wave 0 — Migracion DB

---

#### `supabase/migrations/<ts>_crm_stage_integrity.sql` — CREATE

**Role:** DDL + seed + realtime publication (composite migration)
**Data flow:** SQL DDL → Supabase prod (via Studio SQL Editor o `supabase db push`)

**Closest analog (composite):**
- `supabase/migrations/20260212000000_orders_realtime.sql` (publication pattern — ver bloque Shared 6 arriba)
- `supabase/migrations/20260213000001_mutation_audit.sql:1-64` (audit table schema + trigger function precedent, NO RLS)
- `supabase/migrations/20260420000443_platform_config.sql:1-37` (table + GRANTs + seed pattern)
- `supabase/migrations/20260421155713_seed_recompra_crm_reader_flag.sql` (idempotent ON CONFLICT DO NOTHING seed)

**Change shape (composite — ver Pattern 4 RESEARCH para SQL completo):**

1. `CREATE TABLE order_stage_history (...)` con schema D-10 (13 columnas).
2. `CREATE INDEX` x3 (D-11) incluyendo partial `WHERE source != 'manual'`.
3. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (a diferencia de `mutation_audit` que NO tiene RLS).
4. `CREATE POLICY` x4: SELECT workspace-scoped, INSERT WITH CHECK true, UPDATE USING false, DELETE USING false.
5. `CREATE OR REPLACE FUNCTION prevent_order_stage_history_mutation()` + 2 triggers BEFORE UPDATE/DELETE.
6. `DO $$ IF NOT EXISTS ... ALTER PUBLICATION supabase_realtime ADD TABLE orders` (Example 6 RESEARCH — idempotente).
7. `INSERT INTO platform_config (key, value) VALUES ('crm_stage_integrity_cas_enabled', 'false'::jsonb), ('crm_stage_integrity_killswitch_enabled', 'false'::jsonb) ON CONFLICT (key) DO NOTHING;` (Example 5 RESEARCH).
8. `GRANT ALL ON TABLE public.order_stage_history TO service_role;` + `GRANT SELECT TO authenticated` (LEARNING 44.1).
9. `COMMENT ON TABLE` + `COMMENT ON COLUMN source/actor_id/previous_stage_id` (Pattern 4 RESEARCH).

**Differences vs analogs:**
- `mutation_audit` NO tenia RLS ni append-only enforcement — este standalone lo eleva a ledger de primera clase con doble guardia (RLS + trigger — Pattern 4).
- `orders_realtime.sql` solo tiene 1 linea; esta es composite: publication ADD + seed + DDL en una sola migracion para cumplir Regla 5 ("una sola PAUSE gate" antes del deploy de codigo).
- `platform_config` seed pattern reproducido: `ON CONFLICT (key) DO NOTHING` garantiza replay safety.
- **NO** `REPLICA IDENTITY FULL` (Pitfall 6 Supabase Realtime RESEARCH — disk + bandwidth cost, no ganamos nada porque cliente ya tiene `old` en `localOrdersByStage`).

**Referenced by plans covering:** D-10, D-11, D-13, D-17, D-18, D-20. Bloquea Wave 1 hasta aplicar en prod (Regla 5).

---

### Wave 1 — Domain CAS + Audit writer

---

#### `src/lib/domain/types.ts` — MODIFY

**Role:** Type extension — add fields to `DomainContext`
**Data flow:** caller populates → domain reads → insert to history

**Closest analog:** self (`src/lib/domain/types.ts:15-21`)

**Change shape:**
```typescript
// MODIFY src/lib/domain/types.ts:15-21
export interface DomainContext {
  workspaceId: string
  source: string
  cascadeDepth?: number
  // NEW — populated by caller, used by moveOrderToStage history insert
  actorId?: string | null
  actorLabel?: string | null
  triggerEvent?: string | null  // only when source='automation', the trigger_type
}
```

**Differences:**
- Campos nuevos son opcionales (backward-compat con todos los callers existentes — solo `moveOrderToStage` los consume).
- No cambia `DomainResult<T>` shape — el error sigue siendo string (`'stage_changed_concurrently'` es un marker literal).

**Referenced by plans covering:** D-10, D-12. Pitfall 10 RESEARCH (actor_id type discussion).

---

#### `src/lib/domain/orders.ts` — MODIFY (lines 557-648, `moveOrderToStage`)

**Role:** Domain mutation (single source of truth — Regla 3)
**Data flow:** read current → short-circuit same-stage → flag-gated CAS UPDATE → INSERT history (best-effort) → emit trigger

**Closest analog:** `src/lib/agents/crm-writer/two-step.ts:140-189` (optimistic state-machine UPDATE — Shared Pattern 3 above)

**Core pattern (Example 1 + Pattern 1 RESEARCH — CANON):**

```typescript
// Source: Pattern 1 RESEARCH + Shared Pattern 3 (two-step.ts precedent)
// Reemplaza moveOrderToStage lines 557-648

// Step 1: read (igual al actual — line 564-570)
const { data: currentOrder, error: fetchError } = await supabase
  .from('orders')
  .select('stage_id, pipeline_id, contact_id, total_value, description, name, shipping_address, shipping_city, shipping_department, carrier, tracking_number')
  .eq('id', params.orderId)
  .eq('workspace_id', ctx.workspaceId)
  .single()

if (fetchError || !currentOrder) return { success: false, error: 'Pedido no encontrado' }
const previousStageId = currentOrder.stage_id

// Short-circuit same-stage no-op (Pitfall 2 RESEARCH — antes del CAS)
if (previousStageId === params.newStageId) {
  return { success: true, data: { orderId: params.orderId, previousStageId, newStageId: params.newStageId } }
}

// Step 2: flag-gated CAS
const casEnabled = await getPlatformConfig<boolean>('crm_stage_integrity_cas_enabled', false)

if (casEnabled) {
  const { data: updated, error: updateError } = await supabase
    .from('orders')
    .update({ stage_id: params.newStageId })
    .eq('id', params.orderId)
    .eq('workspace_id', ctx.workspaceId)
    .eq('stage_id', previousStageId)  // ← CAS predicate
    .select('id')  // ← CRITICAL: habilita Prefer: return=representation

  if (updateError) return { success: false, error: `Error al mover el pedido: ${updateError.message}` }

  if (!updated || updated.length === 0) {
    // CAS rejected — re-fetch current stage para toast UX
    const { data: refetch } = await supabase
      .from('orders')
      .select('stage_id')
      .eq('id', params.orderId)
      .eq('workspace_id', ctx.workspaceId)
      .single()
    return {
      success: false,
      error: 'stage_changed_concurrently',
      data: { currentStageId: refetch?.stage_id ?? null } as any,
    }
  }
} else {
  // Legacy path (lines 578-587 actual, unchanged)
  const { error: updateError } = await supabase
    .from('orders')
    .update({ stage_id: params.newStageId })
    .eq('id', params.orderId)
    .eq('workspace_id', ctx.workspaceId)
  if (updateError) return { success: false, error: `Error al mover el pedido: ${updateError.message}` }
}

// Step 3: INSERT order_stage_history (ALWAYS — no flag, D-18)
// Best-effort: failure logged but NO block al move (Pitfall 3 RESEARCH)
const sourceMapped = mapDomainSourceToHistorySource(ctx.source)  // helper en este archivo
const { error: historyError } = await supabase.from('order_stage_history').insert({
  order_id: params.orderId,
  workspace_id: ctx.workspaceId,
  previous_stage_id: previousStageId,
  new_stage_id: params.newStageId,
  source: sourceMapped,
  actor_id: ctx.actorId ?? null,
  actor_label: ctx.actorLabel ?? null,
  cascade_depth: ctx.cascadeDepth ?? 0,
  trigger_event: ctx.triggerEvent ?? null,
})
if (historyError) console.error('[moveOrderToStage] history insert failed:', historyError.message)

// Step 4: emit trigger (lines 589-648 actual — unchanged)
// ...
```

**Differences vs analog (two-step.ts):**
- Predicate es `.eq('stage_id', previousStageId)` (no `status='proposed'`).
- Usa `.select('id')` sin `.maybeSingle()` — retorna array (PostgREST `return=representation`).
- No hay "already executed" branch — solo "concurrently changed" → caller maneja UX.
- History insert es fire-and-log (Pitfall 3) — no retornar error si history falla.
- Mapper `mapDomainSourceToHistorySource` convierte `ctx.source` string a uno de los 7 valores CHECK constraint.

**Referenced by plans covering:** D-04, D-05, D-06, D-12, D-17. Pitfalls 1, 2, 3 RESEARCH.

---

#### `src/app/actions/orders.ts` — MODIFY (lines 601-613 + 810-831)

**Role:** Server action — CAS error narrowing + bulk return shape change
**Data flow:** getAuthContext → ctx.source='server-action' → domain → narrow `stage_changed_concurrently` → return to Kanban client

**Closest analog:** self lines 601-613 (existing error path)

**Change shape:**
```typescript
// MODIFY moveOrderToStage action lines 603-613
const ctx: DomainContext = {
  workspaceId: auth.workspaceId,
  source: 'server-action',
  actorId: auth.userId,          // NEW — D-10 actor_id
  actorLabel: auth.userName,      // NEW — populated from session
}
const result = await domainMoveOrderToStage(ctx, { orderId, newStageId })

if (!result.success) {
  // NEW: narrow string marker so client component can show specific toast
  if (result.error === 'stage_changed_concurrently') {
    return { error: 'stage_changed_concurrently', data: result.data }  // pass through
  }
  return { error: result.error || 'Error al mover el pedido' }
}

// MODIFY bulkMoveOrdersToStage lines 810-831 — change return shape (Pitfall 12 RESEARCH)
export async function bulkMoveOrdersToStage(
  orderIds: string[],
  newStageId: string,
): Promise<ActionResult<{ moved: number; failed: Array<{ orderId: string; reason: string }> }>> {
  // ... auth + ctx ...
  let moved = 0
  const failed: Array<{ orderId: string; reason: string }> = []
  for (const orderId of orderIds) {
    const result = await domainMoveOrderToStage(ctx, { orderId, newStageId })
    if (result.success) moved++
    else failed.push({ orderId, reason: result.error || 'unknown' })
  }
  revalidatePath('/crm/pedidos')
  return { success: true, data: { moved, failed } }
}
```

**Differences:**
- `bulkMoveOrdersToStage` existing signature `{ moved: number }` cambia a `{ moved, failed }` — Pitfall 12 RESEARCH + Open Question 4.
- `auth.userId` / `auth.userName` requieren que `getAuthContext()` ya exponga estos (verificar en Plan 02).

**Referenced by plans covering:** D-06, D-15 (error propagation), Pitfall 12.

---

#### `src/lib/agents/crm-writer/two-step.ts` — MODIFY (confirm branch)

**Role:** Two-step mutator — propagate CAS error when tool triggers `moveOrderToStage`
**Data flow:** confirm → dispatch tool → domain → if CAS rejected propagate as structured error

**Closest analog:** self lines 140-189 (existing idempotency — Shared Pattern 3)

**Change shape:**
```typescript
// MODIFY: en el dispatchToolExecution path que llama moveOrderToStage,
// cuando result.error === 'stage_changed_concurrently', propagar como
// tool failure con error.code='stage_changed_concurrently' (no generic 'dispatch_error')
// El frame de failure existente (lines 139-157) ya persiste en crm_bot_actions.error JSONB.
```

**Differences:**
- El existing frame de failure (lines 140-156) YA persiste arbitrary error JSONB — solo documentar que `error.code='stage_changed_concurrently'` es un valor legitimo (callers tipo UI de sandbox lo muestran).
- No cambia idempotency — el UPDATE WHERE status='proposed' sigue funcionando.
- Update `.claude/rules/agent-scope.md` §CRM Writer Bot listado de codigos de error (Plan 05 / Wave 5).

**Referenced by plans covering:** D-06, agent-scope §CRM Writer.

---

#### `src/__tests__/integration/orders-cas.test.ts` — CREATE

**Role:** Integration test — verify CAS rejects second concurrent UPDATE
**Data flow:** vitest + real Supabase admin → INSERT pedido → 2 UPDATEs paralelos con mismo previousStageId → assert 1 succeeds + 1 returns `stage_changed_concurrently`

**Closest analog:** `src/__tests__/integration/crm-bots/reader.test.ts:1-60`

```typescript
// Source: src/__tests__/integration/crm-bots/reader.test.ts:25-51
import { describe, expect, it, beforeAll, beforeEach, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3020'
const TEST_WORKSPACE_ID = process.env.TEST_WORKSPACE_ID ?? ''
const TEST_API_KEY = process.env.TEST_API_KEY ?? ''

beforeAll(() => {
  if (!TEST_WORKSPACE_ID || !TEST_API_KEY) {
    throw new Error('TEST_WORKSPACE_ID and TEST_API_KEY env vars are required. ...')
  }
})
```

**Differences:**
- En lugar de POST a endpoint HTTP, importar `moveOrderToStage` de `@/lib/domain/orders` y llamar 2x con `Promise.all` con mismo `previousStageId`.
- `beforeEach`: seed order en stage A + enable `crm_stage_integrity_cas_enabled` flag via `UPDATE platform_config SET value='true'::jsonb WHERE key=...`; `afterEach` revert flag + delete pedido.
- Aserciones: exactly 1 result.success=true, 1 result.error='stage_changed_concurrently'. Verificar que `order_stage_history` tiene **1** row (no 2 — history solo se escribe cuando CAS succeeded).
- Segundo caso: happy path (flag OFF) — ambos UPDATEs succeed bajo legacy path (regresion test del fail-closed default).

**Referenced by plans covering:** D-04, D-25. Assumption A1 RESEARCH (`.update().eq().select()` retorna `[]` vs `null`).

---

### Wave 2 — Runtime kill-switch + cascade_capped audit

---

#### `src/inngest/functions/automation-runner.ts` — MODIFY (lines 358-405)

**Role:** Inngest function — stacked concurrency + kill-switch step + cascade_capped audit
**Data flow:** event → concurrency gate → step.run flag read → step.run kill-switch query → skip/continue

**Closest analog (composite):**
- `src/inngest/functions/recompra-preload-context.ts:47-68` (concurrency + flag + step.run pattern)
- `src/inngest/functions/agent-production.ts:76-81` (single-scope concurrency — to extend to stacked)
- Self lines 358-405 (existing runner shape)

**Core pattern (Example 2 RESEARCH):**

```typescript
// Source: Example 2 RESEARCH + Shared Pattern 4
// MODIFY lines 358-405

return inngest.createFunction(
  {
    id: `automation-${triggerType.replace(/\./g, '-')}`,
    retries: 2,
    concurrency: [
      { key: 'event.data.workspaceId', limit: 5 },
      // D-08: stack orderId limit only on stage_changed runner (D-09)
      ...(triggerType === 'order.stage_changed'
        ? [{ key: 'event.data.orderId', limit: 1 }]
        : []),
    ],
  },
  { event: eventName as any },
  async ({ event, step }) => {
    const eventData = (event as any).data as Record<string, unknown>
    const workspaceId = String(eventData.workspaceId || '')
    const cascadeDepth = Number(eventData.cascadeDepth ?? 0)

    // CASCADE CAP — now also logs cascade_capped row to history (D-07 layer 3)
    if (cascadeDepth >= MAX_CASCADE_DEPTH) {
      await step.run(`cap-audit-${triggerType}`, async () => {
        if (triggerType !== 'order.stage_changed' || !eventData.orderId) return
        const supabase = createAdminClient()
        await supabase.from('order_stage_history').insert({
          order_id: String(eventData.orderId),
          workspace_id: workspaceId,
          previous_stage_id: String(eventData.previousStageId),
          new_stage_id: String(eventData.newStageId),
          source: 'cascade_capped',
          actor_id: null,
          actor_label: `Cascade capped at depth ${cascadeDepth}`,
          cascade_depth: cascadeDepth,
          trigger_event: triggerType,
        })
      })
      return { skipped: true, reason: 'cascade_depth_exceeded' }
    }

    // KILL-SWITCH (D-07 layer 2) — stage_changed only, flag-gated
    if (triggerType === 'order.stage_changed' && eventData.orderId) {
      const killSwitchEnabled = await step.run('kill-switch-flag', async () =>
        getPlatformConfig<boolean>('crm_stage_integrity_killswitch_enabled', false)
      )

      if (killSwitchEnabled) {
        const recentChanges = await step.run('kill-switch-check', async () => {
          const supabase = createAdminClient()
          const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString()
          const { count } = await supabase
            .from('order_stage_history')
            .select('id', { count: 'exact', head: true })
            .eq('order_id', eventData.orderId as string)
            .neq('source', 'manual')
            .gt('changed_at', sixtySecondsAgo)
          return count ?? 0
        })

        if (recentChanges > 5) {
          console.warn(`[kill-switch] order ${eventData.orderId}: ${recentChanges} non-manual changes in 60s. Skipping.`)
          return { skipped: true, reason: 'kill_switch_triggered', recentChanges }
        }
      }
    }

    // ... resto del runner existing (load-automations, execute actions) sin cambios
  }
)
```

**Differences vs analog (recompra-preload-context):**
- 2 scopes concurrency (stacked) vs 1 en recompra.
- Condicional per-triggerType (D-09) — solo `order.stage_changed`.
- Kill-switch query usa `.select('id', { count: 'exact', head: true })` (patron Shared validado en 10 callsites del codebase).
- Particion index `idx_osh_kill_switch WHERE source != 'manual'` es critica para <5ms latency (Pitfall 8 RESEARCH).
- Fail-open: try/catch interno en query → retorna 0 → permite que automation corra (RESEARCH Pattern 5 "soft guard").

**Referenced by plans covering:** D-07 L2, D-07 L3, D-08, D-09, D-20. Pitfall 4, 8 RESEARCH.

---

#### `src/lib/automations/trigger-emitter.ts` — MODIFY (lines 23-36, `isCascadeSuppressed`)

**Role:** Trigger filter — suprime emit + opcional INSERT history row
**Data flow:** cascadeDepth check → true + INSERT cascade_capped history (solo si trigger context trae orderId)

**Closest analog:** self (existing function shape — minimal edit)

**Change shape:**
```typescript
// MODIFY lines 23-36
async function isCascadeSuppressed(
  triggerType: string,
  workspaceId: string,
  cascadeDepth: number,
  // NEW: optional order context for cascade_capped history insert (D-07 L3)
  orderContext?: { orderId: string; previousStageId?: string; newStageId?: string },
): Promise<boolean> {
  if (cascadeDepth >= MAX_CASCADE_DEPTH) {
    console.warn(`[trigger-emitter] Cascade depth ${cascadeDepth} >= MAX (${MAX_CASCADE_DEPTH}). Suppressing ${triggerType}`)

    // NEW: log cascade_capped to history when available (best-effort, non-blocking)
    if (triggerType === 'order.stage_changed' && orderContext?.orderId) {
      try {
        const supabase = createAdminClient()
        await supabase.from('order_stage_history').insert({
          order_id: orderContext.orderId,
          workspace_id: workspaceId,
          previous_stage_id: orderContext.previousStageId ?? null,
          new_stage_id: orderContext.newStageId ?? orderContext.previousStageId ?? '',
          source: 'cascade_capped',
          actor_label: `Cascade capped at depth ${cascadeDepth} (pre-emit)`,
          cascade_depth: cascadeDepth,
          trigger_event: triggerType,
        })
      } catch (e) {
        console.error('[trigger-emitter] cascade_capped history insert failed:', e)
      }
    }
    return true
  }
  return false
}
```

**Differences:**
- Function becomes async (minor — all callers are already in async scope via `sendEvent`).
- Double coverage con Plan 03 automation-runner: este caso es "pre-emit cap" (fuente ya sabe que sera capped); automation-runner es "post-dequeue cap" (defensive en el runner). Ambos insertan history — OK — diferencian via `cascade_depth` value.
- Alternative considerada: solo hacerlo en runner → ventaja: no async; desventaja: runner solo se invoca si hay automations — si no hay automations matching, el cap nunca se loggea. Mejor cubrir en ambos.

**Referenced by plans covering:** D-07 L3, D-23.

---

#### `src/lib/automations/action-executor.ts` — MODIFY (lines 301-323)

**Role:** Execute `change_stage` action — annotation only (domain ya maneja history)
**Data flow:** tool → domain → resultado

**Closest analog:** self (existing function — minimal edit)

**Change shape:**
```typescript
// MODIFY lines 301-323
async function executeChangeStage(
  params: Record<string, unknown>,
  _context: TriggerContext,
  workspaceId: string,
  cascadeDepth: number,
  // NEW (optional): automation metadata for history actor_id / trigger_event
  automationContext?: { automationId: string; automationName: string; triggerType: string },
): Promise<unknown> {
  const stageId = String(params.stageId || '')
  const orderId = _context.orderId
  if (!stageId) throw new Error('stageId is required for change_stage')
  if (!orderId) throw new Error('No orderId available in trigger context')

  const ctx: DomainContext = {
    workspaceId,
    source: 'automation',
    cascadeDepth: cascadeDepth + 1,
    actorId: automationContext?.automationId ?? null,
    actorLabel: automationContext ? `Automation: ${automationContext.automationName}` : null,
    triggerEvent: automationContext?.triggerType ?? null,
  }
  const result = await domainMoveOrderToStage(ctx, { orderId, newStageId: stageId })

  if (!result.success) {
    // NEW: propagate stage_changed_concurrently distinctly so the runner
    // logs it as pipeline_decision:stage_change_rejected_cas (D-22) rather
    // than a generic action failure
    if (result.error === 'stage_changed_concurrently') {
      throw new Error('stage_changed_concurrently')
    }
    throw new Error(result.error || 'Failed to change stage')
  }
  return { orderId, previousStageId: result.data!.previousStageId, newStageId: result.data!.newStageId }
}
```

**Differences:**
- Pasamos `automationContext` desde el runner (que ya tiene `automation.id / name`) — al pasarlo, poblamos `actor_id` y `actor_label` en history (Pitfall 10 RESEARCH).
- Propagamos `stage_changed_concurrently` como error distinto para que el runner pueda emitir el observability event especifico.

**Referenced by plans covering:** D-04, D-06, D-10 (actor_id), D-22 (observability event routing).

---

#### Tests Wave 2 — `automation-runner-killswitch.test.ts` + `automation-runner-cascade-capped.test.ts` — CREATE

**Role:** Unit tests
**Closest analog:** `src/inngest/functions/__tests__/recompra-preload-context.test.ts`

**Change shape (ambos):**
- Mockear `createAdminClient()` para retornar counts parametrizables.
- Mockear `getPlatformConfig` para forzar flag ON.
- Invocar el handler directamente (Inngest function exportada retorna `{ skipped, reason, ... }`).

**Differences:**
- `killswitch.test.ts`: 3 casos → count=0 (pasa), count=3 (pasa), count=6 (skipped + reason='kill_switch_triggered'). Verificar que flag OFF skippea la query entirely.
- `cascade-capped.test.ts`: invocar con `cascadeDepth=3` + `triggerType='order.stage_changed'` → verificar que `from('order_stage_history').insert()` fue llamado con `source='cascade_capped'`.

**Referenced by plans covering:** D-07 L2, D-07 L3, D-25.

---

### Wave 3 — Build-time cycle detection expandida

---

#### `src/lib/builder/validation.ts` — MODIFY (lines 390-437, `conditionsPreventActivation`)

**Role:** Pure validator — static cycle detection
**Data flow:** automation graph → DFS → per-edge check → return cycle path

**Closest analog:** self (existing function — expand recursion + operators)

**Change shape (Pattern 6 RESEARCH):**

Ver Pattern 6 del RESEARCH.md lines 719-809 para codigo completo. Esencialmente:
- Reemplazar `checkConditionEntries` (iterative for-loop line 400-433) con `evalGroup(group)` recursivo que maneja AND/OR logic correctly (current code solo hace OR implicit).
- Agregar `evalRule(rule)` que maneja 9 operators: `eq, neq, gt, gte, lt, lte, contains, in, not_in`.
- Agregar `extractActionValue(actionType, params, field)` que cubre mas action types que solo `change_stage` / `change_pipeline` / `add_tag`: incluye `update_field` (custom fields), `orden.valor` (numerico del trigger), etc.

**Differences vs existing code:**
- Current: solo hace check iterative (no verdadera AND/OR semantics) — si hay nested groups, cualquier condition matching previene → efectivamente OR logic siempre.
- New: recursive `evalGroup` respeta `group.logic === 'AND' ? some : every`.
- Current: hardcoded 3 fields (`orden.stage_id`, `orden.pipeline_id`, `tag.nombre`).
- New: switch over 8+ fields + fallback conservador (`return false` = "cant determine, dont prevent").
- Conservative default: cuando no se puede determinar (variable runtime, unknown field), retornar `false` = no-prevent = cycle alerted (mejor false-positive que miss).

**Referenced by plans covering:** D-07 L1, D-20 (no flag para capa 1).

---

#### `src/lib/builder/__tests__/validation-cycles.test.ts` — CREATE

**Role:** Unit test — cycle detection exhaustive (AND/OR/operators)
**Closest analog:** `src/lib/agents/somnio/__tests__/block-composer.test.ts` (pure-function pattern)

**Change shape:**
```typescript
// Source: src/lib/agents/somnio/__tests__/block-composer.test.ts (format)
import { describe, it, expect } from 'vitest'
import { detectCycles } from '@/lib/builder/validation'

describe('conditionsPreventActivation — AND/OR nested groups', () => {
  it('AND group with one eq match and one neq mismatch → prevents', () => {...})
  it('OR group — any matching child allows → does NOT prevent', () => {...})
  it('nested AND inside OR — recursion correctness', () => {...})
  it('operator gt — action value 100, required >500 → prevents', () => {...})
  it('operator contains — action sets description BAR, condition requires FOO → prevents', () => {...})
  it('unknown field → conservative false (dont prevent)', () => {...})
  // ... 9 operators + 3 action types ≈ 20 cases
})
```

**Differences:**
- Pure-function test (no I/O, no mocks) — fastest test category.
- Cover all 9 operators × 3-4 action types = ~25 cases minimum.

**Referenced by plans covering:** D-07 L1, D-25.

---

### Wave 4 — Kanban Realtime + toast rollback + Inngest concurrency (already in Wave 2)

---

#### `src/hooks/use-kanban-realtime.ts` — CREATE

**Role:** React hook — Realtime subscription (extracted para testability per Example 3 RESEARCH)
**Data flow:** mount → subscribe → payload.new → onRemoteMove callback / onReconnect callback

**Closest analog:** `src/hooks/use-messages.ts:174-254`

**Code ver Example 3 RESEARCH lines 1115-1169 (completo).**

**Differences vs use-messages:**
- Evento UPDATE en lugar de INSERT+UPDATE.
- Filter `pipeline_id=eq.${pipelineId}` en lugar de `conversation_id=eq.${conversationId}`.
- Callback API: `onRemoteMove(orderId, newStageId)` + `onReconnect()` — mas declarativo (extraible).
- `recentMoveRef` passed by caller (vive en component parent).

**Referenced by plans covering:** D-14, D-21. Pattern 3 + Pitfalls 5, 6, 7 RESEARCH.

---

#### `src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx` — MODIFY

**Role:** Client component — DnD + optimistic + Realtime + CAS rollback
**Data flow:** drag → optimistic setState → recentMoveRef.current=true → server → CAS error → revert + toast → Realtime reconciles

**Closest analog:** `src/hooks/use-messages.ts:174-254` + self lines 103-110, 205-307

**Change shape:**

1. Add `useKanbanRealtime` hook call arriba del component (pasar `pipelineId`, `recentMoveRef`, `onRemoteMove`, `onReconnect` callbacks).
2. Callback `onRemoteMove(orderId, newStageId)`: mover card en `localOrdersByStage` (idempotente — no-op si ya esta en ese stage, Pitfall 7).
3. Callback `onReconnect()`: `setLocalOrdersByStage(ordersByStage)` con props actuales.
4. Modify `handleDragEnd` error branch (line 296-306) — agregar case `'stage_changed_concurrently'` (Example 4 RESEARCH):

```typescript
// Source: Example 4 RESEARCH lines 1183-1203
if ('error' in result) {
  setLocalOrdersByStage(ordersByStage)
  onOrderMoved?.(orderId, newStageId, currentStageId)
  if (result.error === 'stage_changed_concurrently') {
    toast.error('Este pedido fue movido por otra fuente. Actualizando...')
    recentMoveRef.current = false  // release suppression for Realtime
  } else {
    toast.error(result.error)
  }
}
```

**Differences vs use-messages:**
- Optimistic pattern ya existe (lines 268-286) — Plan 05 NO lo cambia.
- Echo suppression ya existe — Plan 05 solo extiende su uso al hook.
- D-16 lock: mantener timeout 2000ms (line 270-272).

**Referenced by plans covering:** D-14, D-15, D-21. Pattern 3 + Pitfalls 5, 6, 7 RESEARCH.

---

#### `src/app/(dashboard)/crm/pedidos/components/__tests__/kanban-board-rollback.test.tsx` — CREATE

**Role:** Component test — rollback + toast on CAS reject
**Data flow:** render Kanban → simulate drag → mock moveOrderToStage returns error → assert revert + toast

**Closest analog:** ninguno directo en el codebase (primer component test).
**Match quality:** role-match — net-new pattern. Plan 05 debera documentar setup de `@testing-library/react` (posiblemente devDep nueva si no existe).

**Change shape:**
```typescript
// Tentative — framework TBD in Plan 05
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/app/actions/orders', () => ({
  moveOrderToStage: vi.fn().mockResolvedValue({ error: 'stage_changed_concurrently' }),
}))

describe('KanbanBoard rollback on CAS reject', () => {
  it('reverts optimistic update + shows toast on stage_changed_concurrently', async () => {...})
})
```

**Differences:**
- Plan 05 debera decidir framework component testing (recomendacion: `@testing-library/react` + `jsdom` environment en `vitest.config.ts`).
- Alternativa: degradar a manual smoke test en staging documentado en LEARNINGS.md.

**Referenced by plans covering:** D-15, D-25. Open Question 4 (test infra).

---

#### `src/__tests__/integration/stage-changed-concurrency.test.ts` — CREATE

**Role:** Integration test — Inngest serializes 2 events for same orderId
**Closest analog:** `src/__tests__/integration/crm-bots/reader.test.ts` (env scaffold)
**Match quality:** role-match — puede degradar a manual smoke (RESEARCH §Test Architecture Wave 0).

**Change shape (opcional — may defer to manual smoke):**
- Requiere `inngest-cli` local + inngest dev server running.
- Emit 2 `order.stage_changed` events back-to-back con mismo `orderId`.
- Verificar via Inngest API (o logs) que se ejecutaron en serie (FIFO).

**Differences:**
- Si infra no disponible → documentar manual smoke en LEARNINGS.md (emit 2 events via `inngest.send` en script + observar Inngest dashboard `running/queued` counts).

**Referenced by plans covering:** D-08, D-25. Assumption A2 RESEARCH.

---

#### `src/__tests__/integration/order-stage-history-rls.test.ts` — CREATE

**Role:** Integration test — append-only trigger enforcement
**Closest analog:** `src/__tests__/integration/crm-bots/reader.test.ts` (env scaffold)

**Change shape:**
```typescript
// Sketch
import { createClient } from '@supabase/supabase-js'

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

it('INSERT succeeds', async () => {
  const { error } = await adminClient.from('order_stage_history').insert({...})
  expect(error).toBeNull()
})

it('UPDATE rejected by trigger', async () => {
  const { error } = await adminClient.from('order_stage_history').update({...}).eq('id', rowId)
  expect(error).not.toBeNull()
  expect(error!.message).toMatch(/append-only/)
})

it('DELETE rejected by trigger', async () => { /* similar */ })
```

**Differences:**
- Requiere seed de un row via INSERT primero (trigger BEFORE UPDATE/DELETE solo se dispara con row existente).
- Service role DOES bypass RLS; el trigger plpgsql es el unico guardia — este test verifica ese segundo-layer.

**Referenced by plans covering:** D-13, D-25. Pattern 4 RESEARCH.

---

### Wave 5 — Docs

---

#### `.claude/rules/agent-scope.md` — MODIFY (§CRM Writer Bot)

**Role:** Scope docs — document CAS error contract for writer consumers
**Closest analog:** self lines 51-80 (existing scope block)

**Change shape:**
- Agregar a seccion **§CRM Writer Bot** bullet point en "Validacion":
  > - Error `stage_changed_concurrently` retornado por `moveOrderToStage` domain — callers deben surfacar al usuario como "accion stale" (no retry automatico). Pattern: `two-step.ts confirm` captura el string-error → persiste en `crm_bot_actions.error.code` → sandbox UI muestra toast.
- Agregar a "NO PUEDE":
  > - Retry implicito tras `stage_changed_concurrently` — la decision de re-proponer es del usuario/agent loop, no del writer mechanics.

**Differences:**
- No cambio de scope (writer sigue mutando via two-step); solo documentacion de error contract.

**Referenced by plans covering:** D-06, post-deploy docs (Regla 4).

---

## No Analog Found / Net-New Patterns

Archivos con match calidad **role-match** que introducen pattern nuevo (planner use RESEARCH.md como reference primaria):

| File | Reason | RESEARCH.md reference |
|------|--------|-----------------------|
| `src/lib/domain/orders.ts` CAS body | No hay CAS mutation precedent (solo state-machine via two-step) — se introduce idiom | Pattern 1 (Example 1) |
| `src/lib/automations/trigger-emitter.ts` cascade_capped writer | Primer "audit write desde fuera de domain" — precedent parcial es domain.moveOrderToStage mismo, pero este path no pasa por ahi | Pattern 4 — Append-Only Audit |
| `supabase/migrations/<ts>_crm_stage_integrity.sql` (RLS+trigger append-only) | `mutation_audit` no tiene RLS ni trigger; este es el primer ledger con ambos | Pattern 4 |
| `src/app/(dashboard)/crm/pedidos/components/__tests__/kanban-board-rollback.test.tsx` | Primer component test del proyecto — framework choice TBD en Plan 05 | RESEARCH §Wave 0 Gaps |
| `src/__tests__/integration/stage-changed-concurrency.test.ts` | Inngest concurrency integration test infra TBD (may degrade to manual smoke) | RESEARCH §Test Architecture |

---

## Metadata

**Analog search scope:**
- `src/lib/domain/*.ts` (orders, tasks, conversations, platform-config, types)
- `src/lib/agents/crm-writer/two-step.ts` + `src/lib/agents/crm-writer/tools/*.ts`
- `src/inngest/functions/*.ts` (automation-runner, recompra-preload-context, agent-production)
- `src/hooks/use-messages.ts` + `src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx`
- `src/lib/builder/validation.ts`
- `src/app/actions/orders.ts`
- `supabase/migrations/{orders_realtime, mutation_audit, platform_config, seed_recompra_crm_reader_flag}.sql`
- `src/__tests__/integration/crm-bots/reader.test.ts` + `src/inngest/functions/__tests__/recompra-preload-context.test.ts`
- Standalone reference: `.planning/standalone/somnio-recompra-crm-reader/PATTERNS.md` (format canon)

**Files scanned:** ~25
**Pattern extraction date:** 2026-04-21
**Valid until:** RESEARCH.md expiry 2026-05-21 (30 days; re-verify si Inngest v4 migration doc changes concurrency syntax)

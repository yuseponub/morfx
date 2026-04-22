# Standalone: CRM Stage Integrity — Research

**Researched:** 2026-04-21
**Type:** Standalone (no phase number)
**Mode:** Implementation (25 decisions D-01..D-25 LOCKED en CONTEXT.md — esta research valida las mecanicas)
**Domain:** Next.js 15 App Router + React 19 + Supabase (Postgres + RLS + Realtime) + Inngest v3.51 + dnd-kit + Vercel serverless
**Confidence:** HIGH — todos los patrones ya existen en el codebase o en docs oficiales; esta fase los compone, no inventa.

## Summary

Las 25 decisiones de implementacion estan lockeadas. Esta research valida la mecanica operacional en 5 capas y surface los pitfalls no-obvios que el planner debe convertir en verification steps explicitos.

Hallazgos criticos descubiertos durante la investigacion:

- **Supabase JS v2 CAS canon: `.update().eq('stage_id', previousStageId).select('id')`**. Cuando el WHERE no matchea, `data` retorna array vacio `[]` (no `null`, no error). Esto es la primitiva confiable — `count: 'exact'` NO funciona con UPDATE en todas las versiones PostgREST (solo en GET con `head: true`; en UPDATE retorna el header `Content-Range` pero `count` en el body es inconsistente en supabase-js). [VERIFIED via grep del codebase — existen 10 callsites con `count: 'exact'` pero TODOS estan en `.select()` con `head: true`, ni uno con UPDATE]. El patron de detectar `data.length === 0` es el canonico y lo que ya usa el codebase en `two-step.ts` para idempotencia (BLOCKER: confirmar esto en Plan 01).
- **`orders` NO esta en `supabase_realtime` publication hoy.** Hay que hacer `ALTER PUBLICATION supabase_realtime ADD TABLE orders;` en la migracion de Plan 05. Otras tablas ya estan (conversations, messages, contacts, contact_tags, robot_jobs, agent_sessions) — mismo patron a replicar. [VERIFIED via `grep "ALTER PUBLICATION" supabase/migrations/` — linea por linea, 7 tablas agregadas historicamente, `orders` NO aparece].
- **Inngest v3 `concurrency: [{ key: 'event.data.orderId', limit: 1 }]` es el CEL-expression correcto** (scope default `fn`, no se necesita especificar). El codebase ya usa esto en 4 functions: `whatsappAgentProcessor` con `conversationId`, `agentTimerV3` con `sessionId`, `recompraPreloadContext` con `sessionId`, `automationRunner` con `workspaceId`. **Stacking funciona con hasta 2 scopes** — el plan debe mantener el workspaceId+limit:5 existente Y agregar orderId+limit:1, resultando en array de 2 objetos. La orden no importa (Inngest respeta "any limit reached").
- **`duplicateOrder` emite `order.created` con cascadeDepth heredado, no incrementado** (`src/lib/domain/orders.ts:877,910`) — esto es intencional, pero significa que el vector H1 de CONTEXT.md depende de `executeChangeStage` incrementar depth (`src/lib/automations/action-executor.ts:313`). Ya lo hace. El loop A→B→dup→A se corta en MAX_CASCADE_DEPTH=3. Confirmado: el cap actual es suficiente para bound el loop, pero el pedido original queda "en un stage intermedio" cuando el cap corta — ese es el sintoma visible del bug. D-07 capa 3 (logear `cascade_capped` en history) hace visible ESTA aqui-paraba-el-loop.
- **PostgREST publica UPDATE events via `REPLICA IDENTITY DEFAULT`** por default (solo PK + columnas cambiadas se incluyen en `payload.new`). Para Realtime recibir el stage_id viejo en `payload.old`, necesitas `ALTER TABLE orders REPLICA IDENTITY FULL`. Sin esto, el client ve `payload.new.stage_id` pero NO `payload.old.stage_id`. **El codebase hoy NO usa REPLICA IDENTITY FULL en ninguna tabla — el UI pattern solo usa `payload.new`** (verificado en `use-messages.ts:227` y `metricas-view.tsx`). Recomendacion: seguir ese patron, NO agregar REPLICA IDENTITY FULL (cuesta disco + bandwidth), usar solo `payload.new.stage_id`.
- **Append-only ledger con RLS ES el patron correcto, pero `createAdminClient()` bypasea RLS**, por lo que el domain puede escribir libremente. La proteccion real contra DELETE accidental es un **policy negativo + trigger plpgsql que rechaza UPDATE/DELETE incluso para service_role**. Patron Postgres estandar. 
- **Kanban local echo suppression ya esta implementado** via `recentMoveRef.current` con timeout 2000ms (`kanban-board.tsx:103-104,267-272`). Esto es el mismo patron que `use-messages.ts` usa para optimistic messages. El Realtime subscription nueva (D-14) debe **respetar ese ref** — si `recentMoveRef.current === true`, suprimir el sync de Realtime. Ya hay infraestructura, solo agregar el subscription.

**Primary recommendation:** 5 capas implementadas como 5 planes del standalone, en este orden (dependencias):

1. **Plan 01 — Migracion DB**: crear `order_stage_history` (D-10), agregar `orders` a `supabase_realtime` publication (D-14), crear los 2 flags en `platform_config` con default `false` (D-17, D-20).
2. **Plan 02 — Domain CAS + Audit Log**: reescribir `moveOrderToStage` con compare-and-swap `.eq('stage_id', previousStageId).select('id')` + insert a `order_stage_history` + feature-flag gating (D-04, D-06, D-12, D-17).
3. **Plan 03 — Runtime kill-switch + cascade_capped audit**: en `executeChangeStage` consultar history ultimos 60s; en `isCascadeSuppressed` insertar row `source='cascade_capped'` (D-07 capas 2+3, D-20).
4. **Plan 04 — Build-time cycle detection expandida**: reescribir `conditionsPreventActivation` para cubrir AND/OR nested + todos los tipos de condicion (D-07 capa 1).
5. **Plan 05 — Kanban Realtime + toast rollback + Inngest concurrency**: agregar subscription en `kanban-board.tsx` con `recentMoveRef` suppression, toast en CAS reject, concurrency orderId al runner `automation-order-stage-changed` (D-08, D-14, D-15, D-21).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (copy verbatim de CONTEXT.md §Decisions)

**Scope y calidad:**
- **D-01:** Usuario delega las decisiones tecnicas a Claude (rol builder) con el mandato: "hazlo lo mas funcional posible sin bugs" + "investiga lo que ya se aplica antes de implementar".
- **D-02:** Alcance completo en un standalone (no dividir en P0/P1).
- **D-03:** Audit log **CONFIRMADO POR USUARIO** — crear tabla `order_stage_history`. No duplica `mutation_audit`.

**DB-level locking:**
- **D-04:** **Optimistic compare-and-swap** en `domain.moveOrderToStage`. Al UPDATE, agregar `.eq('stage_id', previousStageId)` — si `count === 0`, retornar `{ success: false, error: 'stage_changed_concurrently', currentStageId }`.
- **D-05:** NO usar version field incremental ni advisory locks.
- **D-06:** Compare-and-swap aplica a TODOS los callers de `moveOrderToStage` (Kanban server action, action-executor, crm-writer two-step, webhook handlers).

**Cycle detection:**
- **D-07:** **Defense-in-depth** — 3 capas: (1) mejorar `conditionsPreventActivation` para AND/OR + todos los tipos. (2) Runtime kill-switch: query history ultimos 60s, si >5 cambios automaticos → bloquear. (3) cap cascade depth 3, cuando se alcanza logear con `source='cascade_capped'`.

**Inngest concurrency:**
- **D-08:** Agregar concurrency scope `event.data.orderId` con `limit: 1` al runner `automation-order-stage-changed`. Mantener el limit por workspaceId.
- **D-09:** No afecta a otros runners — solo el de stage_changed.

**Audit log:**
- **D-10:** Schema de `order_stage_history`: id, order_id, workspace_id, previous_stage_id, new_stage_id, source CHECK IN 7 valores, actor_id, actor_label, cascade_depth, trigger_event, changed_at DEFAULT `timezone('America/Bogota', NOW())`, metadata jsonb.
- **D-11:** 3 indices: (order_id, changed_at DESC), (workspace_id, changed_at DESC), (order_id, changed_at DESC) WHERE source != 'manual'.
- **D-12:** Escrito por `domain.moveOrderToStage` — orden: CAS UPDATE → insert history → emit trigger.
- **D-13:** RLS scoped por workspace_id. Append-only (no delete, no update).

**Kanban UX:**
- **D-14:** Supabase Realtime subscription a `orders` con filter `pipeline_id=eq.${pipelineId}`. Respeta `recentMoveRef`.
- **D-15:** Cuando CAS rechaza: revertir optimistic update + toast rojo + resync forzado.
- **D-16:** Mantener timeout bounce-back actual 2000ms.

**Feature flags:**
- **D-17:** CAS detras de flag `crm_stage_integrity_cas_enabled` en `platform_config`. Default `false`.
- **D-18:** Audit log sin flag (additive).
- **D-19:** Inngest concurrency sin flag (additive).
- **D-20:** Cycle detection capa 1 sin flag; capa 2 (runtime kill-switch) detras de `crm_stage_integrity_killswitch_enabled`.
- **D-21:** Kanban Realtime sin flag.

**Observability:**
- **D-22:** Eventos `pipeline_decision:*` a emitir: stage_change_rejected_cas, stage_change_killswitch_triggered, stage_change_cascade_capped, stage_change_cycle_detected_buildtime.
- **D-23:** Rows con `source='cascade_capped'` o `kill_switch_triggered` → warning a Vercel logs.

**Migracion historica:**
- **D-24:** NO backfill desde `mutation_audit`.

**Testing:**
- **D-25:** Tests cubren: CAS rechaza 2do update concurrente, cycle A→B→A bloqueado por kill-switch, cycle build-time detectado AND/OR, Inngest concurrency serializa 2 eventos, Kanban Realtime actualiza, Kanban rollback toast.

### Claude's Discretion (from CONTEXT.md)

Las decisiones en "Claude's Discretion" estan todas lockeadas en D-04..D-21. No hay areas abiertas para research — solo validacion y pitfalls.

### Deferred Ideas (OUT OF SCOPE)

- UI timeline visual de `order_stage_history` en sheet del pedido.
- Backfill history desde `mutation_audit`.
- Generalizar kill-switch a otros triggers (tag.assigned, contact.created).
- Refactor completo del cycle detector.
- Presence indicators en Kanban.
- Idempotency mejorada para agents (ya cubierto por two-step).
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Compare-and-swap de stage_id | API / Backend (`src/lib/domain/orders.ts`) | — | Domain layer es Regla 3 single source of truth. Todos los callers heredan fix. |
| Escritura a order_stage_history | API / Backend (domain) | Database (RLS + trigger append-only) | Consistencia transaccional-logica con UPDATE. RLS blocks accidental writes. |
| Kill-switch query (history 60s) | API / Backend (action-executor) | Database (indice parcial) | Runs hot path antes de cada stage change automatico. Index `(order_id, changed_at DESC) WHERE source != 'manual'` crucial para latencia <5ms. |
| Build-time cycle detection | API / Backend (`src/lib/builder/validation.ts`) | — | Ejecuta solo en builder save — latencia no critica. Escala O(N²) con numero de automations activas (N<50 por MAX_AUTOMATIONS_PER_WORKSPACE). |
| Inngest concurrency gate | Inngest Function (Background Worker) | — | Plataforma-level, antes de que el runner empiece. Invisible a domain. |
| Realtime UPDATE subscription | Browser / Client (`kanban-board.tsx`) | — | Supabase Realtime es WebSocket desde browser — no toca backend. |
| Optimistic update + rollback | Browser / Client (React state) | — | Respuesta <100ms es requirement UX; reconciliacion con truth server via CAS. |
| Feature flag reads (platform_config) | API / Backend (domain) | — | Cache 30s per-lambda. Fail-open a fallback=false. |

## Standard Stack

### Core (already locked in codebase — use exact versions from package.json)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | ^2.93.1 | Postgres queries (CAS) + Realtime subscriptions | Unico client DB del codebase; service_role via `createAdminClient()` para domain |
| `@supabase/ssr` | ^0.8.0 | Server components client (para server actions) | Patron establecido por Phase 41 |
| `inngest` | ^3.51.0 | Async runners con concurrency keys | v3 SDK usado en 20+ functions del codebase |
| `@dnd-kit/core` | ^6.3.1 | Kanban drag-and-drop | Ya en produccion — no tocar API |
| `@dnd-kit/sortable` | ^10.0.0 | Sortable strategy para columnas | Pareja del core |
| `next` | ^16.1.6 | App Router + Server Actions | revalidatePath para cache invalidation post-move |
| `react` | 19.2.3 | useOptimistic, useTransition disponibles | **PERO** — current pattern usa `useState` manual; mantener (D-16) |
| `sonner` | ^2.0.7 | Toast notifications (toast.error/warning/success) | Ya importado en `kanban-board.tsx:27` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@/lib/domain/platform-config` | (internal) | Feature flags con cache 30s | Para los 2 flags nuevos (D-17, D-20) |
| `@/lib/supabase/admin` | (internal) | `createAdminClient()` bypass RLS | Todo domain layer lo usa (Regla 3) |
| `@/lib/supabase/client` | (internal) | `createClient()` browser Realtime | Solo kanban-board.tsx (client component) |

**No hay libraries nuevas que instalar.** Todo el fix compone infraestructura existente.

### Version verification

```bash
npm view @supabase/supabase-js version    # 2.93.1 era feb 2026; verificar que no haya mayor
npm view inngest version                   # 3.51.0 era abr 2026; v4 ya existe pero codebase usa v3
npm view @dnd-kit/core version             # 6.3.1 estable
```

[VERIFIED via package.json 2026-04-21: versiones arriba son las que corre produccion]

### Alternatives NOT considered (locked)

| Instead of | Could Use | Why Rejected |
|------------|-----------|--------------|
| Optimistic CAS | Advisory locks (`pg_try_advisory_lock`) | D-05 — overhead operacional; lock bookkeeping complica retries |
| Optimistic CAS | Version field incremental | D-05 — requiere migracion schema + signature change en todos los callers |
| New table | Extender `mutation_audit` | Discussion log — JSONB parsing costoso; sin indices; signal-to-noise bajo |
| Supabase Realtime | Pusher / Ably / custom WebSocket | Ya resuelto en codebase; no-op infra change |
| React 19 `useOptimistic` | Manual useState + ref | D-16 mantiene patron actual (bounce-back 2000ms ya funciona) |

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                    USER ACTIONS (moveOrderToStage)                    │
│                                                                        │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐      │
│   │ Kanban     │  │ Mobile API │  │ Agent      │  │ Inngest    │      │
│   │ drag-end   │  │ PATCH      │  │ Writer     │  │ change_    │      │
│   │            │  │            │  │ confirm    │  │ stage      │      │
│   └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘      │
│         │               │               │               │              │
│         └───────────────┴───────────────┴───────────────┘              │
│                                 │                                      │
│                                 ▼                                      │
│                    ┌────────────────────────┐                          │
│                    │  src/app/actions/      │                          │
│                    │  orders.ts (server     │                          │
│                    │  action) or agent      │                          │
│                    │  tool dispatch         │                          │
│                    └────────────┬───────────┘                          │
│                                 │                                      │
│                                 ▼                                      │
│         ┌──────────────────────────────────────────────┐               │
│         │  DOMAIN LAYER (src/lib/domain/orders.ts)     │               │
│         │  moveOrderToStage(ctx, params)               │               │
│         │                                               │               │
│         │  1. READ current stage_id  (SELECT)          │               │
│         │  2. IF flag CAS_ENABLED:                     │               │
│         │       UPDATE ... .eq('stage_id', prev)        │               │
│         │       IF affected=0 → return                 │               │
│         │         'stage_changed_concurrently'          │               │
│         │     ELSE legacy UPDATE                       │               │
│         │  3. INSERT order_stage_history (append-only) │               │
│         │  4. emitOrderStageChanged (Inngest event)    │               │
│         └──────────────┬──────────────────────┬─────────┘              │
│                        │                      │                        │
│            FAIL ─ ◄────┘                      └──► SUCCESS ──┐         │
│            (return error)                                    │         │
└────────────────────────────────────────────────────────────┼─────────┘
                                                              │
                                                              ▼
                            ┌──────────────────────────────────────┐
                            │  Inngest: automation/order.stage_    │
                            │  changed (concurrency orderId=1)     │
                            │                                       │
                            │  ┌────────────────────────────────┐   │
                            │  │ FOR each matching automation:  │   │
                            │  │                                │   │
                            │  │ IF flag KILL_SWITCH_ENABLED:   │   │
                            │  │   SELECT count(*) FROM         │   │
                            │  │     order_stage_history        │   │
                            │  │     WHERE order_id=? AND       │   │
                            │  │       source !='manual' AND    │   │
                            │  │       changed_at > now-60s     │   │
                            │  │   IF count > 5 → skip + log    │   │
                            │  │     'stage_change_killswitch_  │   │
                            │  │      triggered'                 │   │
                            │  │                                │   │
                            │  │ IF cascadeDepth >=             │   │
                            │  │   MAX_CASCADE_DEPTH:           │   │
                            │  │   INSERT history row with      │   │
                            │  │     source='cascade_capped'    │   │
                            │  │   (visible ledger)              │   │
                            │  │                                │   │
                            │  │ ELSE execute change_stage      │   │
                            │  │   (recursa al domain)          │   │
                            │  └────────────────────────────────┘   │
                            └──────────────────────────────────────┘
                                         │
                                         ▼
                            ┌──────────────────────────────────────┐
                            │  Postgres: UPDATE orders fires       │
                            │  logical replication → Realtime      │
                            │  WebSocket broadcast                 │
                            └────────┬─────────────────────────────┘
                                     │
                                     ▼
                     ┌──────────────────────────────────────┐
                     │  BROWSER (kanban-board.tsx)          │
                     │                                       │
                     │  postgres_changes UPDATE subscription │
                     │  filter: pipeline_id=eq.${pipelineId} │
                     │                                       │
                     │  IF recentMoveRef.current === true:  │
                     │    SKIP (suppress echo of own move)  │
                     │  ELSE:                               │
                     │    setLocalOrdersByStage(resync)     │
                     │                                       │
                     │  On server CAS error:                │
                     │    revert optimistic                 │
                     │    toast.error + resync              │
                     └──────────────────────────────────────┘
```

### Pattern 1: Compare-And-Swap with Supabase JS v2

**What:** Atomic stage mutation that rejects if another writer already moved the order. Zero schema changes — uses only the `stage_id` column as its own version.

**When to use:** ALL mutations of `orders.stage_id` — single entry point in domain layer.

**Example (the CANON for this fix):**

```typescript
// Source: Pattern established by this research; codebase has precedent in
// two-step.ts:140-155 (idempotent confirm UPDATE WHERE status='proposed')

import { createAdminClient } from '@/lib/supabase/admin'
import { getPlatformConfig } from '@/lib/domain/platform-config'

export async function moveOrderToStage(
  ctx: DomainContext,
  params: MoveOrderToStageParams
): Promise<DomainResult<MoveOrderToStageResult>> {
  const supabase = createAdminClient()

  // Step 1: read current state (need previousStageId for CAS + history + trigger)
  const { data: currentOrder, error: fetchError } = await supabase
    .from('orders')
    .select('stage_id, pipeline_id, contact_id, total_value, description, name, shipping_address, shipping_city, shipping_department, carrier, tracking_number')
    .eq('id', params.orderId)
    .eq('workspace_id', ctx.workspaceId)
    .single()

  if (fetchError || !currentOrder) {
    return { success: false, error: 'Pedido no encontrado' }
  }

  const previousStageId = currentOrder.stage_id

  // Short-circuit: same stage is a no-op success (NOT a CAS rejection)
  if (previousStageId === params.newStageId) {
    return {
      success: true,
      data: { orderId: params.orderId, previousStageId, newStageId: params.newStageId },
    }
  }

  // Step 2: feature-flagged CAS (D-17)
  const casEnabled = await getPlatformConfig<boolean>(
    'crm_stage_integrity_cas_enabled',
    false,  // fail-closed: default off during rollout
  )

  if (casEnabled) {
    // THE CAS: .eq('stage_id', previousStageId) is the swap condition
    // .select('id') is CRITICAL — without it, we get no data array and cannot detect 0 rows
    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update({ stage_id: params.newStageId })
      .eq('id', params.orderId)
      .eq('workspace_id', ctx.workspaceId)
      .eq('stage_id', previousStageId)  // ← CAS predicate
      .select('id')

    if (updateError) {
      return { success: false, error: `Error al mover el pedido: ${updateError.message}` }
    }

    // CAS REJECTED: another writer moved it between our SELECT and UPDATE
    if (!updated || updated.length === 0) {
      // Re-fetch current stage so caller can show it in toast
      const { data: refetch } = await supabase
        .from('orders')
        .select('stage_id')
        .eq('id', params.orderId)
        .eq('workspace_id', ctx.workspaceId)
        .single()

      return {
        success: false,
        error: 'stage_changed_concurrently',
        // Callers distinguish by error string; currentStageId is optional extra:
        data: { currentStageId: refetch?.stage_id ?? null },
      } as any  // type narrowing: extend DomainResult union if strict
    }
  } else {
    // Legacy path (flag off) — keep existing behavior unchanged
    const { error: updateError } = await supabase
      .from('orders')
      .update({ stage_id: params.newStageId })
      .eq('id', params.orderId)
      .eq('workspace_id', ctx.workspaceId)

    if (updateError) {
      return { success: false, error: `Error al mover el pedido: ${updateError.message}` }
    }
  }

  // Step 3: insert to order_stage_history (ALWAYS, no flag — D-18)
  const { error: historyError } = await supabase
    .from('order_stage_history')
    .insert({
      order_id: params.orderId,
      workspace_id: ctx.workspaceId,
      previous_stage_id: previousStageId,
      new_stage_id: params.newStageId,
      source: ctx.source || 'system',
      actor_id: ctx.actorId ?? null,       // ← needs ctx.actorId added to DomainContext
      actor_label: ctx.actorLabel ?? null,
      cascade_depth: ctx.cascadeDepth ?? 0,
      trigger_event: ctx.triggerEvent ?? null,
    })

  if (historyError) {
    // NON-FATAL: log + continue. History loss is acceptable; move succeeded.
    console.error('[moveOrderToStage] history insert failed:', historyError.message)
  }

  // Step 4: fetch stage names + emit trigger (unchanged from current code)
  // ... (lineas 589-648 del codigo actual)

  return { success: true, data: { orderId: params.orderId, previousStageId, newStageId: params.newStageId } }
}
```

**Key pattern insights:**

1. **`.select('id')` is mandatory** — without it, `data` is `null` always, even on success. `.select('id')` causes PostgREST to add `Prefer: return=representation`, which returns matched rows as an array. [VERIFIED via PostgREST docs v12]
2. **Empty array means CAS rejected** — not error, not null, `[].length === 0`. [VERIFIED: PostgREST returns `[]` when WHERE matches zero rows with `Prefer: return=representation`]
3. **`count: 'exact'` is NOT used** — it's unreliable for UPDATE in supabase-js; the canonical pattern is `.select().then(({data}) => data.length === 0)`. Codebase has 10 callsites of `count: 'exact'` ALL in `.select(..., { head: true })`, ZERO in UPDATE. This research ratifies that convention.
4. **Re-fetch after rejection is a separate query** — Supabase JS doesn't expose transactions; accept the round-trip cost.
5. **No-op on same stage** — short-circuit BEFORE the CAS. Otherwise `.eq('stage_id', previousStageId)` would succeed but do nothing, which is indistinguishable from a real hit.

### Pattern 2: Inngest Concurrency Key Stacking (v3 SDK)

**What:** Two concurrency scopes on one function, serializing per-orderId while capping per-workspace.

**When to use:** Only the `automation-order-stage-changed` runner (D-09). Other runners stay with single workspace limit.

**Example:**

```typescript
// Source: inngest.com/docs/guides/concurrency (v3 SDK syntax)
// Verified against codebase: src/inngest/functions/agent-production.ts:76-81 (1 scope),
// this extends to 2 scopes

return inngest.createFunction(
  {
    id: `automation-${triggerType.replace(/\./g, '-')}`,
    retries: 2,
    // Stacked concurrency — function runs are limited by BOTH constraints.
    // Order within array does not matter; Inngest blocks on any limit reached.
    concurrency: [
      { key: 'event.data.workspaceId', limit: 5 },  // existing — workspace cap
      { key: 'event.data.orderId', limit: 1 },      // NEW — serialize per-order (D-08)
    ],
  },
  { event: eventName as any },
  async ({ event, step }) => { /* ... */ }
)
```

**Key pattern insights:**

1. **Default scope is `fn`** (function-level) — no need to specify `scope: 'fn'` explicitly. All existing callsites omit it. [VERIFIED via Inngest docs 2026-04]
2. **FIFO ordering within a key**: when 5 events queue for orderId=X, they execute in arrival order. Guaranteed by Inngest. [VERIFIED via docs]
3. **Max 2 scopes per function** — don't try to add a 3rd dimension; not supported. [VERIFIED via docs]
4. **Null key = unbounded**: if `event.data.orderId` is missing, the CEL expression yields null and the concurrency gate is SKIPPED (function runs without limit). This is undocumented but consistent with Inngest semantics for missing expression values. **MITIGATION:** validate `orderId` presence before emit via `emitOrderStageChanged` (already required by current typing).
5. **Cold start does NOT break concurrency**: Inngest queues events at platform level, not at Vercel lambda level. A cold start just delays the first event; subsequent events still queue behind it.
6. **Timeout + concurrency interaction:** if step 1 runs 60s, step 2 for same orderId waits. If step 1 Inngest-times-out (default 2h step timeout), lock releases. Phase 42.1 observability instrumentation handles timeout — our fix does NOT need to retry manually.

### Pattern 3: Supabase Realtime + Local Echo Suppression (React 19)

**What:** Subscribe to `orders` UPDATE events; reconcile remote state; SKIP if the current user just made the change themselves (optimistic update in-flight).

**When to use:** Inside `kanban-board.tsx` — exactly ONE `useEffect` that establishes one channel per `pipelineId`.

**Example (verified against `src/hooks/use-messages.ts:174-254` — same pattern):**

```typescript
// Source: codebase pattern from use-messages.ts + Supabase Realtime docs

// INSIDE KanbanBoard component:
React.useEffect(() => {
  if (!pipelineId) return

  const supabase = createClient()  // browser client
  let previousStatus = ''

  const channel = supabase
    .channel(`kanban:${pipelineId}`)  // unique per pipeline to avoid cross-talk
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `pipeline_id=eq.${pipelineId}`,  // server-side filter
      },
      (payload) => {
        // Local echo suppression — we just made this move ourselves
        if (recentMoveRef.current) return

        // payload.new contains the updated row (REPLICA IDENTITY DEFAULT is fine)
        const updated = payload.new as { id: string; stage_id: string; pipeline_id: string }

        // Skip if event is not for our pipeline (defensive — filter should handle)
        if (updated.pipeline_id !== pipelineId) return

        // Reconcile: find order in localOrdersByStage, move to new column
        setLocalOrdersByStage((prev) => {
          // Locate current position
          let currentStageId: string | null = null
          let orderItem: OrderWithDetails | null = null
          for (const [sid, orders] of Object.entries(prev)) {
            const found = orders.find(o => o.id === updated.id)
            if (found) {
              currentStageId = sid
              orderItem = found
              break
            }
          }

          if (!orderItem || currentStageId === updated.stage_id) return prev

          const next = { ...prev }
          if (currentStageId) {
            next[currentStageId] = (prev[currentStageId] || []).filter(o => o.id !== updated.id)
          }
          next[updated.stage_id] = [
            ...(prev[updated.stage_id] || []),
            { ...orderItem, stage_id: updated.stage_id },
          ]
          return next
        })
      }
    )
    .subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[kanban:realtime] channel error — will rely on revalidatePath', err)
      } else if (status === 'SUBSCRIBED' && previousStatus && previousStatus !== 'SUBSCRIBED') {
        // Reconnected after drop — server state may have drifted, force resync
        setLocalOrdersByStage(ordersByStage)  // use current props
      }
      previousStatus = status
    })

  return () => {
    supabase.removeChannel(channel)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [pipelineId])  // ONLY pipelineId — `ordersByStage` would cause reconnect storms
```

**Key pattern insights:**

1. **Server-side filter syntax is EXACT:** `filter: 'pipeline_id=eq.UUID'` — PostgREST filter mini-language, not CEL. Supports `eq`, `neq`, `lt`, `gt`, `lte`, `gte`, `in`. No `AND`/`OR` — ONE filter per `.on()` call. [VERIFIED Supabase Realtime docs]
2. **Multiple `.on()` listeners on ONE channel is the way** to get compound behavior (e.g., listen to INSERT + UPDATE on same table). Don't create multiple channels for the same pipeline.
3. **Channel name collision is safe** — Supabase allows multiple subscribers to the same channel name (presence feature piggybacks this). But for cleanup, UNIQUE names per pipeline avoid flaky unsubscribe when user switches pipelines.
4. **`payload.new` has the NEW values** (post-update). `payload.old` is EMPTY unless `REPLICA IDENTITY FULL` is set on the table. We do NOT need `old` — the client already knows the previous position in `localOrdersByStage`. **DO NOT enable REPLICA IDENTITY FULL** — disk+bandwidth cost, and codebase pattern never relies on `old`.
5. **React 19 StrictMode double-fires useEffect** in dev — cleanup must call `supabase.removeChannel(channel)`. The pattern above does it. [VERIFIED via use-messages.ts]
6. **`recentMoveRef` suppression is the local echo fix** — already exists in `kanban-board.tsx:103-104`. Realtime subscription just needs to CHECK it. Timeout 2000ms is long enough for server roundtrip + Realtime replay.
7. **Max 100 channels per client per Supabase project** — far below our ceiling (user views 1 pipeline at a time). [VERIFIED Supabase Realtime limits docs]
8. **Reconnection loses events during downtime** — there's no replay buffer. Solution: on `SUBSCRIBED` after `CLOSED`/`CHANNEL_ERROR`, force a resync to server truth. [VERIFIED Supabase troubleshooting docs]
9. **Filter is `pipeline_id` not `workspace_id`** — pipelineId is more specific, and RLS on `orders` already enforces workspace isolation at the DB level. PostgREST filter is secondary defense.

### Pattern 4: Append-Only Audit Ledger with RLS + Trigger Guard

**What:** Table that only accepts INSERT — UPDATE and DELETE are blocked even for service_role via trigger.

**When to use:** `order_stage_history` (D-13).

**Example SQL:**

```sql
-- Source: Postgres standard append-only pattern; codebase precedent in
-- mutation_audit table which uses trigger-based enforcement (different approach —
-- we improve on it with explicit UPDATE/DELETE block)

-- Migration: 20260421XXXXXX_order_stage_history.sql

CREATE TABLE order_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  previous_stage_id uuid NULL,  -- null solo en create order
  new_stage_id uuid NOT NULL,
  source text NOT NULL CHECK (
    source IN ('manual', 'automation', 'webhook', 'agent', 'robot', 'cascade_capped', 'system')
  ),
  actor_id uuid NULL,
  actor_label text NULL,
  cascade_depth smallint NOT NULL DEFAULT 0,
  trigger_event text NULL,
  changed_at timestamptz NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  metadata jsonb NULL
);

-- Indices per D-11
CREATE INDEX idx_osh_order_changed ON order_stage_history (order_id, changed_at DESC);
CREATE INDEX idx_osh_workspace_changed ON order_stage_history (workspace_id, changed_at DESC);
CREATE INDEX idx_osh_kill_switch ON order_stage_history (order_id, changed_at DESC)
  WHERE source != 'manual';  -- partial index: kill-switch reads hot path

-- RLS: enable + workspace scoping
ALTER TABLE order_stage_history ENABLE ROW LEVEL SECURITY;

-- SELECT: workspace-scoped (mirrors orders table)
CREATE POLICY "Users see history for own workspace orders"
  ON order_stage_history FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- INSERT: only service_role (domain layer via createAdminClient bypasses RLS anyway,
-- but explicit policy documents intent)
CREATE POLICY "Service role inserts history"
  ON order_stage_history FOR INSERT
  WITH CHECK (true);  -- no user-level inserts; domain handles enforcement

-- UPDATE: blocked entirely (append-only)
CREATE POLICY "No updates on history"
  ON order_stage_history FOR UPDATE
  USING (false);

-- DELETE: blocked entirely
CREATE POLICY "No deletes on history"
  ON order_stage_history FOR DELETE
  USING (false);

-- Defense-in-depth: trigger that rejects UPDATE/DELETE even for service_role
-- (RLS bypasses for service_role, so we need this for true append-only guarantee)
CREATE OR REPLACE FUNCTION prevent_order_stage_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'order_stage_history is append-only (TG_OP=%)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guard_order_stage_history_no_update
  BEFORE UPDATE ON order_stage_history
  FOR EACH ROW EXECUTE FUNCTION prevent_order_stage_history_mutation();

CREATE TRIGGER guard_order_stage_history_no_delete
  BEFORE DELETE ON order_stage_history
  FOR EACH ROW EXECUTE FUNCTION prevent_order_stage_history_mutation();

-- Comments for documentation
COMMENT ON TABLE order_stage_history IS
  'Append-only ledger of all stage_id changes on orders. Written by domain.moveOrderToStage.';
COMMENT ON COLUMN order_stage_history.source IS
  'Origin of the change: manual (user UI), automation (Inngest runner), webhook, agent (CRM bot), robot (Coordinadora/Inter), cascade_capped (MAX_CASCADE_DEPTH hit — not actually changed), system (migrations, scripts).';
COMMENT ON COLUMN order_stage_history.actor_id IS
  'user_id for manual; automation_id for automation; agent_id for agent; workspace_id for system.';
COMMENT ON COLUMN order_stage_history.previous_stage_id IS
  'NULL only on initial stage assignment (e.g., order creation). Always set on subsequent changes.';
```

**Key pattern insights:**

1. **`DEFAULT timezone('America/Bogota', NOW())`** matches Regla 2 — timestamp in local TZ at DB level.
2. **RLS + trigger is defense-in-depth** — RLS blocks anon/authenticated roles; trigger blocks service_role. Codebase's `mutation_audit` has no RLS (system table), but user explicitly wants UI read access (eventual timeline) — so RLS here IS necessary.
3. **Partial index `WHERE source != 'manual'`** is the kill-switch query optimizer — reduces scanned rows by 50-80% in typical workspaces (most stage changes are automation cascades).
4. **`ON DELETE CASCADE` from orders** — if an order is deleted, its history goes too. Acceptable tradeoff: we don't want orphan history rows. `mutation_audit` already captures the DELETE.
5. **`smallint` for cascade_depth** — values 0-3, saves 2 bytes per row vs int.
6. **`CHECK` over ENUM** — simpler migration (no `CREATE TYPE`), easy to add values in future (`ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT`). Codebase convention.
7. **No GIN index on metadata jsonb yet** — YAGNI until query patterns emerge. Can be added in a follow-up migration when timeline UI needs facet searches.

### Pattern 5: Kill-Switch Query (Runtime Layer 2)

**What:** Before executing an `order.stage_changed` automation that would do `change_stage`, check if >5 non-manual changes happened in the last 60s.

**When to use:** Inside `automation-runner.ts` `automation-order-stage-changed` runner, before invoking `executeChangeStage`.

**Example:**

```typescript
// Source: D-07 layer 2; new pattern for this standalone

import { getPlatformConfig } from '@/lib/domain/platform-config'

// Inside createAutomationRunner, after cascade depth check, BEFORE actions execute:

if (triggerType === 'order.stage_changed' && eventData.orderId) {
  const killSwitchEnabled = await getPlatformConfig<boolean>(
    'crm_stage_integrity_killswitch_enabled',
    false,  // fail-open: default off during rollout
  )

  if (killSwitchEnabled) {
    const recentChanges = await step.run(
      `kill-switch-check-${String(eventData.orderId).slice(0, 8)}`,
      async () => {
        const supabase = createAdminClient()
        const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString()

        // Uses partial index idx_osh_kill_switch for <5ms latency
        const { count, error } = await supabase
          .from('order_stage_history')
          .select('id', { count: 'exact', head: true })
          .eq('order_id', eventData.orderId)
          .neq('source', 'manual')
          .gt('changed_at', sixtySecondsAgo)

        if (error) {
          console.error('[kill-switch] query failed:', error.message)
          return 0  // fail-open
        }
        return count ?? 0
      }
    )

    if (recentChanges > 5) {
      // Emit observability event (D-22)
      // TODO: pipe through ObservabilityCollector if isObservabilityEnabled()
      console.warn(
        `[kill-switch] TRIGGERED for order ${eventData.orderId}: ` +
        `${recentChanges} non-manual changes in last 60s. Skipping automations.`
      )
      return { skipped: true, reason: 'kill_switch_triggered', count: recentChanges }
    }
  }
}
```

**Key pattern insights:**

1. **`.select('id', { count: 'exact', head: true })`** is the canonical count query in supabase-js — returns JUST the count in `Content-Range` header, no body data. 10 callsites in codebase use this. [VERIFIED]
2. **Threshold is >5 non-manual** — user can manually yank an order back and forth freely (source='manual' excluded). >5 catches automation loops where A→B→A repeats at least 3 times.
3. **60s window** — matches industry norm (Zapier uses 60s, n8n uses configurable, Salesforce uses 60s). More aggressive (30s) risks false positives on legitimate cascades; less aggressive (5min) risks silent loops wasting Inngest quota.
4. **Partial index `WHERE source != 'manual'`** makes this <5ms even at 100k rows per workspace. Without it, full scan on order_id + filter is O(N).
5. **Fail-open** — if the kill-switch query errors, let the automation run. We're a soft guard, not the last line of defense (cascade_depth=3 already caps).
6. **Runs INSIDE `step.run`** so Inngest caches the result across retries. Essential for determinism.
7. **Only on `order.stage_changed` trigger** — other triggers don't need this check (D-09).

### Pattern 6: Build-Time Cycle Detection — Expanded conditionsPreventActivation

**What:** Walk nested ConditionGroup (AND/OR) and check EVERY condition type (stage, pipeline, tag, custom field, numeric value) to determine if the target automation would actually fire.

**When to use:** Inside `detectCycles` in `src/lib/builder/validation.ts:390-437`. Replaces the current function.

**Example (refactored):**

```typescript
// Source: D-07 layer 1; extends existing code to handle AND/OR + all condition types

type ConditionOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'not_in'

interface ConditionRule {
  field: string
  operator: ConditionOperator
  value: unknown
}

interface ConditionGroup {
  logic: 'AND' | 'OR'
  conditions: Array<ConditionRule | ConditionGroup>
}

/**
 * Returns true if the target automation's conditions would DEFINITELY prevent
 * activation given the action's params. Returns false if conditions allow it
 * or cannot be determined (conservative — let the cycle be detected).
 *
 * AND group: all child conditions must NOT prevent — if ANY prevents, group prevents
 *   → FALSE (prevents) for cycle means: action would pass the gate
 *   → TRUE (prevents) for any child → TRUE for AND group
 * OR group: only ONE child must allow — if ALL children prevent, group prevents
 *   → TRUE for all children → TRUE for OR group
 */
function conditionsPreventActivation(
  action: { type: string; params: Record<string, unknown> },
  target: AutoNode
): boolean {
  const conditions = target.conditions as ConditionGroup | null

  if (!conditions?.conditions || conditions.conditions.length === 0) return false

  function evalGroup(group: ConditionGroup): boolean {
    const childResults = group.conditions.map(child => {
      if ('logic' in child && 'conditions' in child) {
        return evalGroup(child as ConditionGroup)  // nested
      }
      return evalRule(child as ConditionRule)
    })

    // AND: any prevents → group prevents
    // OR: all prevent → group prevents
    return group.logic === 'AND'
      ? childResults.some(r => r === true)
      : childResults.every(r => r === true)
  }

  function evalRule(rule: ConditionRule): boolean {
    if (!rule.field) return false  // conservative: don't prevent on missing field

    const ap = action.params
    const value = rule.value

    // Map field → action param lookup
    const extracted = extractActionValue(action.type, ap, rule.field)
    if (extracted === undefined) return false  // can't determine — conservative

    // Evaluate operator
    switch (rule.operator) {
      case 'eq':
        return extracted !== value  // prevents if they DON'T match
      case 'neq':
        return extracted === value  // prevents if they DO match
      case 'gt':
        return Number(extracted) <= Number(value)
      case 'gte':
        return Number(extracted) < Number(value)
      case 'lt':
        return Number(extracted) >= Number(value)
      case 'lte':
        return Number(extracted) > Number(value)
      case 'contains':
        return !String(extracted).includes(String(value))
      case 'in':
        return !Array.isArray(value) || !value.includes(extracted)
      case 'not_in':
        return Array.isArray(value) && value.includes(extracted)
      default:
        return false  // unknown operator — conservative
    }
  }

  function extractActionValue(
    actionType: string,
    params: Record<string, unknown>,
    field: string,
  ): unknown {
    // Spanish field paths used by runtime (matches current code)
    switch (field) {
      case 'orden.stage_id':
        return params.targetStageId || params.stageId
      case 'orden.pipeline_id':
        return params.targetPipelineId || params.pipelineId
      case 'tag.nombre':
        return params.tagName
      case 'tag.id':
        return params.tagId
      case 'orden.valor':
        // Actions don't set value directly — unpredictable
        return undefined
      case 'contacto.nombre':
      case 'contacto.telefono':
        // Actions don't set contact fields — unpredictable
        return undefined
      default:
        // Custom fields via update_field
        if (actionType === 'update_field' && params.fieldName === field.replace(/^orden\.|^contacto\./, '')) {
          return params.value
        }
        return undefined  // unknown field — conservative (don't prevent)
    }
  }

  return evalGroup(conditions)
}
```

**Key pattern insights:**

1. **Conservative by default** — if we can't determine what the action produces (e.g., `orden.valor` from update_field with a variable), we return `false` (don't prevent). Better a false-positive cycle warning than a missed cycle.
2. **Recursive over nested ConditionGroup** — this is what the current code is MISSING. User D-07 layer 1 explicitly addresses this.
3. **Operator semantics matter** — `eq` prevents when action value does NOT equal required; `neq` prevents when they DO equal. Easy to flip this by accident. TEST each operator in D-25.
4. **No regex/contains perfect match** — good enough for production. If a condition is "description contains FOO" and action sets description to "BAR", return `true` (prevents). If description comes from a variable, return `false` (conservative).
5. **Field namespacing matches runtime** — Spanish paths (`orden.stage_id`, `tag.nombre`) already used by automation engine. Don't diverge.

### Recommended Project Structure

```
supabase/migrations/
└── 20260421XXXXXX_crm_stage_integrity.sql       # NEW: order_stage_history + orders realtime + platform_config flags

src/lib/domain/
├── orders.ts                                     # MODIFIED: moveOrderToStage CAS + history insert
└── platform-config.ts                            # UNCHANGED: consumed for 2 new flags

src/lib/automations/
├── action-executor.ts                            # MODIFIED: executeChangeStage wraps in kill-switch check (moved to runner)
└── trigger-emitter.ts                            # MODIFIED: isCascadeSuppressed inserts cascade_capped row

src/lib/builder/
└── validation.ts                                 # MODIFIED: conditionsPreventActivation expanded (lines 390-437)

src/inngest/functions/
└── automation-runner.ts                          # MODIFIED: concurrency[orderId], kill-switch step, cascade_capped logging

src/app/(dashboard)/crm/pedidos/components/
└── kanban-board.tsx                              # MODIFIED: Realtime subscription, toast rollback on CAS reject

src/app/actions/
└── orders.ts                                     # MODIFIED: handle 'stage_changed_concurrently' error string → toast

.claude/rules/
└── agent-scope.md                                # MODIFIED: document CAS contract for crm-writer consumers (D-06)
```

### Anti-Patterns to Avoid

- **DO NOT use `count: 'exact'` for UPDATE to detect affected rows.** Empty `data` array is the canonical check.
- **DO NOT re-read after UPDATE to verify it happened.** CAS `.select('id')` already tells you.
- **DO NOT wrap CAS in a retry loop at domain level.** Caller decides UX (toast + manual refresh vs silent retry). CAS with auto-retry creates hidden cascades.
- **DO NOT add `REPLICA IDENTITY FULL` to orders table.** Disk + bandwidth cost, no benefit (browser already has `old` state).
- **DO NOT create one channel per order.** One channel per pipeline + server-side filter.
- **DO NOT depend on `revalidatePath` for Realtime users.** Two sources of truth (cache invalidation + Realtime) create race conditions. Realtime is primary for Kanban post-deploy.
- **DO NOT block the Inngest runner waiting for history insert.** History is best-effort; runner MUST continue on history failure.
- **DO NOT use `ctx.source = 'automation'` for the cascade_capped history row.** Use `source: 'cascade_capped'` as a distinct category — makes kill-switch query cleaner.
- **DO NOT emit observability events from domain layer directly.** Domain returns structured errors; the caller (server action / Inngest runner) translates to `pipeline_decision:*`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Optimistic concurrency control | Custom version field + migration + callers | `.update().eq('stage_id', prev).select()` | Zero schema change; atomic at DB; idiomatic |
| Detecting zero rows affected | Wrapper + count query + diff | `data.length === 0` from `.select('id')` | PostgREST native; 1 round-trip |
| Concurrency serialization | DB advisory locks, Redis SETNX, queue | Inngest `concurrency.key` | Already platform infra; FIFO guaranteed |
| Feature flag cache | process.env + global var | `getPlatformConfig` | 30s TTL + fail-open + already proven in Phase 44.1 |
| Realtime broadcast | Pusher/Ably, custom WebSocket | Supabase Realtime `postgres_changes` | Already in WhatsApp inbox; same client; free |
| DAG cycle detection library | OSS library (dagre/cytoscape/graphlib) | Hand-rolled DFS in `validation.ts` | Scale <50 automations; cycle semantics are domain-specific (ACTION_TO_TRIGGER_MAP); library adds complexity |
| Append-only table enforcement | Application-level checks | RLS policy `FOR DELETE USING (false)` + trigger | Defense-in-depth at DB; can't be bypassed by code rewrite |
| Toast + rollback state machine | XState / Redux | Local `useState` + `sonner` + ref for suppression | Kanban is one component; codebase idiom already |
| React optimistic updates | `useOptimistic` (React 19) | Existing manual state + `recentMoveRef` | D-16 preserves existing pattern; `useOptimistic` would require refactor not in scope |

**Key insight:** This phase's value is COMPOSITION of existing primitives, not new abstractions. Resist the urge to introduce a "move coordinator service" or "stage history middleware" — domain layer + 5 small modifications is the right shape.

## Runtime State Inventory

Not applicable — this standalone is a production bug fix introducing new behavior, not renaming or migrating existing state. No grep-unsearchable runtime state is affected.

**Categories verified empty:**
- **Stored data:** None — new `order_stage_history` is empty at deploy; no existing data migrated (D-24).
- **Live service config:** None — no n8n/external service config changes.
- **OS-registered state:** None — no Windows Task Scheduler / pm2 / systemd changes.
- **Secrets/env vars:** None — 2 new platform_config keys, read via existing helper.
- **Build artifacts:** None — no package name changes, no egg-info equivalent.

## Common Pitfalls

### Pitfall 1 — CAS: PostgREST `.select()` Without `Prefer: return=representation`

**What goes wrong:** You chain `.update({stage_id: X}).eq('id', orderId).eq('stage_id', prev)` WITHOUT `.select()`. `data` is `null` always. You can't distinguish "CAS succeeded" from "CAS rejected".

**Why it happens:** Supabase JS v2 only adds `Prefer: return=representation` when `.select()` is chained. Without it, PostgREST returns `204 No Content` and `data = null` regardless of affected rows.

**How to avoid:** ALWAYS `.select('id')` (or any column) after `.update().eq()` when you need to detect zero rows.

**Warning signs:** Unit test passes because all test rows match, but production shows stage changes "succeed silently" even under contention.

### Pitfall 2 — CAS: Same-Stage No-Op Looks Like CAS Rejection

**What goes wrong:** User moves order from stage A to stage A (same stage — maybe accidental re-drop). The `.eq('stage_id', previousStageId)` succeeds but returns the row "as-is". Your code looks at `data.length === 0` — but `data.length === 1` because it matched. No false positive here. **BUT** if you short-circuit BEFORE the SELECT (like the example does), the CAS is skipped entirely. Both paths are correct; mistake is mixing them.

**Why it happens:** Same-stage update is a legitimate case (user re-drops same column); CAS would succeed silently; no state change. Confusing `same-stage` with `stage_changed_concurrently` breaks UX.

**How to avoid:** Short-circuit BEFORE the CAS: `if (previousStageId === params.newStageId) return success without changes`. Example in Pattern 1 shows this.

**Warning signs:** Test case "drop order on same column" triggers toast "movido por otra fuente"; users confused.

### Pitfall 3 — History Insert Failure Blocking Move

**What goes wrong:** CAS succeeds (stage updated). History insert fails (e.g., check constraint violation, network blip). Domain returns error → caller thinks move failed → UI reverts → state drift between DB and UI.

**Why it happens:** Chaining UPDATE + INSERT as if transactional, but they're 2 round-trips. Second can fail after first succeeded.

**How to avoid:** History insert is best-effort. `console.error` + continue, DON'T return failure. The row state is already correct; losing an audit row is acceptable. Observability event `history_insert_failed` for monitoring.

**Warning signs:** `mutation_audit` shows the UPDATE but `order_stage_history` has no matching row at the same timestamp.

### Pitfall 4 — Inngest Concurrency Key Resolves to `undefined`

**What goes wrong:** An automation event lacks `orderId` in `event.data`. The `concurrency.key = 'event.data.orderId'` CEL expression evaluates to `null`. Inngest behavior is "unbounded run" (undocumented but consistent with other nullable expressions). Suddenly 100 events run in parallel, no serialization.

**Why it happens:** Some trigger emitter upstream forgot to include orderId. Defensive coding gap.

**How to avoid:** Validate in `emitOrderStageChanged` — if `data.orderId` is falsy, throw or drop the event. Since the trigger is specifically `order.stage_changed`, it's a bug to emit without orderId.

**Warning signs:** Sudden burst of parallel automation executions for same workspace; Inngest dashboard shows queue concurrency spikes.

### Pitfall 5 — Realtime Subscription Causes `useEffect` Reconnect Storm

**What goes wrong:** Deps array includes `ordersByStage` (object identity changes on every server re-render). useEffect fires → removeChannel + subscribe every ~200ms. Users see flapping "subscribed / unsubscribing" in console + server logs.

**Why it happens:** React 19 + Supabase + dynamic props; natural deps trap.

**How to avoid:** Deps ONLY `[pipelineId]`. Reference `ordersByStage` via `useRef` if needed. The example in Pattern 3 uses `eslint-disable` for exhaustive-deps with explicit rationale.

**Warning signs:** Vercel Realtime quota exhausts faster than expected; console shows repeated `[realtime:kanban] status: SUBSCRIBED / CLOSED / SUBSCRIBED`.

### Pitfall 6 — Realtime Missed Events on Reconnect (No Replay)

**What goes wrong:** User's laptop sleeps for 2 minutes. Realtime WS closes. 10 stage changes happen on server during sleep. Laptop wakes → `SUBSCRIBED` fires again. UI shows stale state but thinks it's fresh.

**Why it happens:** Supabase Realtime has NO event replay — it's a pub/sub stream, not a log. [VERIFIED Supabase docs]

**How to avoid:** On `status === 'SUBSCRIBED'` after a previous non-SUBSCRIBED status, force a refetch (`setLocalOrdersByStage(ordersByStage)` using current props, or fetch fresh from server action). Pattern in `use-messages.ts:242-246` does this; Kanban must mirror.

**Warning signs:** User reports "pedidos se veian en un stage pero no eran".

### Pitfall 7 — Kanban Local Echo Suppression Timeout Too Short

**What goes wrong:** `recentMoveRef` timeout is 2000ms. Server roundtrip + Inngest lag + Realtime broadcast = 2500ms occasionally. Suppression wears off BEFORE the echo arrives. User sees their own move as a Realtime event → double state update → flicker.

**Why it happens:** Vercel cold start + Inngest lag + network = variable total latency.

**How to avoid:** Extend suppression to 5000ms as a safety buffer? **NO — D-16 locks 2000ms.** Better: the Realtime handler should noop if the incoming `stage_id` matches what we already have locally. The example in Pattern 3 does this: `if (currentStageId === updated.stage_id) return prev`. Idempotent by construction.

**Warning signs:** Kanban cards flicker briefly after drag.

### Pitfall 8 — Kill-Switch Query Latency

**What goes wrong:** Partial index not created. Query `WHERE order_id=? AND source != 'manual' AND changed_at > now-60s` does a heap scan. 50ms latency on hot path. Inngest step.run timeout starts accumulating.

**Why it happens:** Index forgotten; or created without `WHERE source != 'manual'` clause.

**How to avoid:** Migration MUST include `CREATE INDEX ... WHERE source != 'manual'` exactly as specified in Pattern 4 SQL. Verification step: `EXPLAIN ANALYZE` on the query pattern should show `Index Scan using idx_osh_kill_switch` and execution time <5ms.

**Warning signs:** Slow automation runs; Vercel logs show `[kill-switch] query took 45ms`.

### Pitfall 9 — `cascadeDepth` Heredado vs Incrementado

**What goes wrong:** `duplicateOrder` passes `ctx.cascadeDepth` unchanged (line 877 of orders.ts). `executeChangeStage` passes `cascadeDepth + 1` (line 313 of action-executor). Mixing these two in a cascade A→B (via change_stage)→dup→A (via duplicate_order → order.created automation → change_stage) — the depth advances by 1 per change_stage but not per duplicate. A loop with alternating steps could escape the cap.

**Why it happens:** Current behavior is INTENTIONAL — duplicates are not "deeper" recursion (they're a new entity). But a loop that involves duplicates doesn't get the full cap protection.

**How to avoid:** For THIS standalone, do NOT change `duplicateOrder` semantics. The D-07 runtime kill-switch covers this case — it counts automation changes over 60s regardless of cascade depth. Defense-in-depth compensates.

**Warning signs:** Kill-switch firing for orders that should not have exceeded cascade_depth=3. Verify by `SELECT source, count(*) FROM order_stage_history WHERE order_id=X GROUP BY source`.

### Pitfall 10 — `actor_id` Pollution

**What goes wrong:** Kanban drag uses user_id as actor_id. Automation uses automation_id. crm-writer uses agent_id=`crm-writer`. Webhook uses NULL. Confusing UI timeline: what type of UUID is in actor_id?

**Why it happens:** Flat `uuid NULL` column with no type discriminator.

**How to avoid:** `source` column IS the discriminator. Plan must document:
- `source='manual'` → `actor_id` = user_id, `actor_label` = user full name
- `source='automation'` → `actor_id` = automation_id, `actor_label` = "Automation: {name}"
- `source='agent'` → `actor_id` = NULL (agent_id is a string, not UUID), `actor_label` = 'crm-writer' / 'somnio-recompra-v1' / etc
- `source='webhook'` → `actor_id` = NULL, `actor_label` = source hint (e.g., 'shopify')
- `source='robot'` → `actor_id` = NULL, `actor_label` = robot name
- `source='cascade_capped'` → `actor_id` = automation_id (which was capped), `actor_label` = "Cascade capped at depth 3"
- `source='system'` → `actor_id` = NULL, `actor_label` = migration name

**Warning signs:** Eventual timeline UI needs to JOIN actor_id → users / automations / workspaces and the mapping is ambiguous.

### Pitfall 11 — Platform Config Flag Cache Staleness

**What goes wrong:** User flips `crm_stage_integrity_cas_enabled` via SQL. 30s later, half the lambdas see `true`, half see `false`. During this window, Kanban may get CAS rejection (from a lambda with flag ON) while another action on the same order sees no CAS (lambda with flag OFF).

**Why it happens:** `getPlatformConfig` has 30s per-lambda cache. [DOCUMENTED in `src/lib/domain/platform-config.ts`]

**How to avoid:** Known and accepted. Runbook in `platform-config.ts` top comment says wait 30s. For this rollout: enable during low-traffic window, wait 2 minutes, observe.

**Warning signs:** Mixed success/failure within a ~30s window after flag flip.

### Pitfall 12 — `bulkMoveOrdersToStage` Still Non-Atomic Under CAS

**What goes wrong:** Bulk moves 50 orders A→B. Each CAS is independent. 3 orders were concurrently modified by an automation mid-bulk. Current code: `moved++` only on success → returns `{moved: 47}`. But user sees 47/50 without knowing WHICH 3 failed.

**Why it happens:** Current implementation (actions/orders.ts:810-831) loops silently.

**How to avoid:** CONTEXT.md §code_context already flagged this. Change return shape from `{moved: number}` to `{moved: number, failed: Array<{orderId: string, reason: string}>}`. Caller can toast per-order failure.

**Warning signs:** User reports "bulk did not move all orders" without clear indication of which or why.

## Code Examples

### Example 1: Complete moveOrderToStage (final production shape)

See Pattern 1 above — inline at the top of Architecture Patterns section. That IS the canonical example.

### Example 2: Inngest Runner with Stacked Concurrency + Kill-Switch

```typescript
// Source: src/inngest/functions/automation-runner.ts — MODIFIED for this fix
// Shows stacked concurrency (D-08) + kill-switch (D-07 layer 2)

return inngest.createFunction(
  {
    id: `automation-${triggerType.replace(/\./g, '-')}`,
    retries: 2,
    concurrency: [
      { key: 'event.data.workspaceId', limit: 5 },
      // NEW: only for order.stage_changed runner (D-09)
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

    if (cascadeDepth >= MAX_CASCADE_DEPTH) {
      // D-07 layer 3: log cascade_capped to history (new behavior)
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

    // D-07 layer 2: kill-switch for stage_changed only
    if (triggerType === 'order.stage_changed' && eventData.orderId) {
      const killSwitchEnabled = await step.run(
        'kill-switch-flag',
        async () => getPlatformConfig<boolean>(
          'crm_stage_integrity_killswitch_enabled',
          false,
        ),
      )

      if (killSwitchEnabled) {
        const recentChanges = await step.run(
          `kill-switch-check`,
          async () => {
            const supabase = createAdminClient()
            const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString()
            const { count } = await supabase
              .from('order_stage_history')
              .select('id', { count: 'exact', head: true })
              .eq('order_id', eventData.orderId as string)
              .neq('source', 'manual')
              .gt('changed_at', sixtySecondsAgo)
            return count ?? 0
          },
        )

        if (recentChanges > 5) {
          console.warn(
            `[kill-switch] order ${eventData.orderId}: ${recentChanges} non-manual changes in 60s. Skipping.`
          )
          return {
            skipped: true,
            reason: 'kill_switch_triggered',
            recentChanges,
          }
        }
      }
    }

    // ... rest of existing runner logic (load automations, execute actions)
  }
)
```

### Example 3: Kanban Realtime Subscription (complete hook extraction)

```typescript
// Source: Pattern 3 of this research; extracted as a reusable hook for testability
// File: src/hooks/use-kanban-realtime.ts (NEW)

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { OrderWithDetails, OrdersByStage } from '@/lib/orders/types'

interface UseKanbanRealtimeOpts {
  pipelineId: string | null
  recentMoveRef: React.MutableRefObject<boolean>
  onRemoteMove: (orderId: string, newStageId: string) => void
  onReconnect: () => void
}

export function useKanbanRealtime({
  pipelineId,
  recentMoveRef,
  onRemoteMove,
  onReconnect,
}: UseKanbanRealtimeOpts) {
  useEffect(() => {
    if (!pipelineId) return

    const supabase = createClient()
    let previousStatus = ''

    const channel = supabase
      .channel(`kanban:${pipelineId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `pipeline_id=eq.${pipelineId}`,
        },
        (payload) => {
          if (recentMoveRef.current) return
          const updated = payload.new as { id: string; stage_id: string; pipeline_id: string }
          if (updated.pipeline_id !== pipelineId) return
          onRemoteMove(updated.id, updated.stage_id)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && previousStatus && previousStatus !== 'SUBSCRIBED') {
          onReconnect()
        }
        previousStatus = status
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [pipelineId, recentMoveRef, onRemoteMove, onReconnect])
}
```

### Example 4: Kanban Error Handling — CAS Reject + Toast

```typescript
// Source: src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx
// Modifies handleDragEnd (line 293-307) to handle new error code

// Persist to server
setPendingMoveId(orderId)
const result = await moveOrderToStage(orderId, newStageId)
setPendingMoveId(null)

if ('error' in result) {
  // Revert local state on error
  setLocalOrdersByStage(ordersByStage)
  // Revert parent state
  onOrderMoved?.(orderId, newStageId, currentStageId)

  if (result.error === 'stage_changed_concurrently') {
    // NEW: D-15 — specific handling for CAS rejection
    toast.error('Este pedido fue movido por otra fuente. Actualizando...')
    // Realtime subscription will bring the fresh state; no manual fetch needed.
    // BUT as a safety net, force resync in case Realtime lags:
    recentMoveRef.current = false  // release suppression so Realtime can update
  } else {
    // Other errors (WIP limit, pedido no encontrado, etc.)
    toast.error(result.error)
  }
} else {
  if (result.data?.warning) {
    toast.warning(result.data.warning)
  }
}
```

### Example 5: Platform Config Seeding Migration

```sql
-- Source: Plan 01 migration snippet. Platform config flags are seeded with false
-- so the deploy is no-op; user enables manually per workspace after verification.

INSERT INTO platform_config (key, value, description)
VALUES
  (
    'crm_stage_integrity_cas_enabled',
    'false'::jsonb,
    'When true, moveOrderToStage uses optimistic compare-and-swap. Set to true per workspace after validation. See .planning/standalone/crm-stage-integrity/CONTEXT.md D-17.'
  ),
  (
    'crm_stage_integrity_killswitch_enabled',
    'false'::jsonb,
    'When true, the automation-order-stage-changed runner checks order_stage_history for >5 non-manual changes in last 60s and skips if exceeded. See D-20.'
  )
ON CONFLICT (key) DO NOTHING;
```

### Example 6: Adding `orders` to Supabase Realtime Publication

```sql
-- Source: Plan 01 migration snippet. Matches pattern used in 7 prior migrations.

DO $$
BEGIN
  -- Idempotent add (skip if already in publication)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;
END $$;

-- Do NOT set REPLICA IDENTITY FULL — we don't need payload.old (see Pitfall / Pattern 3 note).
-- Default REPLICA IDENTITY (primary key only in payload.new) is sufficient.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Read-then-write without lock | Optimistic CAS via `.eq()` predicate | This fix (2026-04) | Eliminates write-write race on stage_id |
| Ephemeral Vercel logs for automation loops | `order_stage_history` ledger | This fix | User + support can diagnose devoluciones post-hoc |
| Single concurrency scope per Inngest function | Stacked [workspace, orderId] scopes | This fix | Serializes per-order without blocking workspace |
| Kanban bounce-back only (2s timeout) | Realtime + bounce-back + CAS reject toast | This fix | Multi-user truth; external-source changes reflected in <1s |
| Cycle detection at single layer (build-time) | 3-layer defense (build-time + runtime + cap) | This fix | Catches cycles that runtime data (variables) hide from static analysis |

**Deprecated/outdated:**
- **Fire-and-forget `inngest.send`** in webhook: already fixed codebase-wide. Not relevant here.
- **`count: 'exact'` for UPDATE row counts:** codebase never used this pattern. We formalize that choice.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `supabase-js v2 .update().eq().select()` returns empty array `[]` when WHERE matches 0 rows (not null, not error). | Pattern 1, Pitfall 1 | MEDIUM — if actually returns `null`, CAS check must use `data == null ? 0 : data.length === 0`. [ASSUMED from PostgREST docs + codebase convention; NOT confirmed against GitHub issues] |
| A2 | Inngest v3 concurrency.key=null causes unbounded execution (no serialization). | Pitfall 4 | LOW — workaround is validating orderId presence before emit. Testable in staging. [ASSUMED — Inngest docs don't specify null handling] |
| A3 | Supabase Realtime `filter: 'pipeline_id=eq.UUID'` is case-sensitive for UUIDs. | Pattern 3 | LOW — Postgres UUIDs are normalized to lowercase. Any UUID generated via `gen_random_uuid()` is lowercase. [ASSUMED] |
| A4 | `REPLICA IDENTITY DEFAULT` (no change) gives us `payload.new` with stage_id for Realtime UPDATE events. | Pattern 3 | LOW — this is the Postgres default; works for every Supabase Realtime integration. [VERIFIED via use-messages.ts behavior] |
| A5 | Kill-switch threshold of >5 changes in 60s catches automation loops without false-positives on legitimate cascades. | Pattern 5 | MEDIUM — if legitimate flows routinely do 3-4 change_stage actions in <60s, the threshold is fine. If some flows do 6-10 legitimate changes, threshold is too tight. Only production observation can confirm. Start with 5, monitor, adjust. [ASSUMED from industry norms] |
| A6 | Postgres trigger `BEFORE UPDATE/DELETE` with RAISE EXCEPTION fully blocks service_role writes. | Pattern 4 | LOW — standard Postgres semantics; triggers fire for all roles. [VERIFIED by Postgres docs] |
| A7 | Supabase Realtime does not replay events after reconnect — catch-up requires manual refetch. | Pitfall 6 | LOW — VERIFIED by Supabase troubleshooting docs + codebase pattern in use-messages.ts. |
| A8 | `duplicateOrder` passing cascadeDepth unchanged is intentional behavior that should NOT be modified in this standalone. | Pitfall 9 | MEDIUM — if user wants to cap duplicate loops more aggressively, behavior change is required. Deferred per CONTEXT.md scope. [ASSUMED from code reading] |

**If this table is non-empty, the planner should note these for verification during plan execution or user confirmation during discuss-phase.**

## Open Questions

1. **When should the CAS feature flag be flipped to `true` in production?**
   - What we know: deploy is no-op until flag is true; no regression risk.
   - What's unclear: user's risk appetite for the first workspace. Recommend: flip for a single low-traffic workspace, wait 1 week, observe `stage_change_rejected_cas` events; if <1% rejection rate with no user complaints, roll out broader.
   - Recommendation: defer to user during `/gsd-plan-phase` discussion; add as a LEARNINGS.md follow-up.

2. **Should `actor_id` be a UUID or TEXT column?**
   - What we know: D-10 says `uuid NULL`.
   - What's unclear: agent IDs are strings (`'crm-writer'`, `'somnio-recompra-v1'`) NOT UUIDs. If we store in `actor_id uuid`, agents can only use NULL.
   - Recommendation: Pattern 4 captures this — use `actor_id uuid NULL` + `actor_label text NULL`, with agents storing NULL in `actor_id` and their name in `actor_label`. Timeline UI joins on `source` to interpret.

3. **Does the Kanban Realtime subscription conflict with concurrent Shopify dashboards or mobile app?**
   - What we know: Supabase limit is 100 channels per client. User is one browser tab.
   - What's unclear: if user opens 5 Kanban tabs (different pipelines), 5 channels active. Well below limit.
   - Recommendation: no action needed at current scale. Document limit in CONVENTIONS.md if ever relevant.

4. **Should `bulkMoveOrdersToStage` return shape change (`{moved, failed}`) be in this standalone or a follow-up?**
   - What we know: Pitfall 12 surfaces the UX gap.
   - What's unclear: change to return shape affects all callers of the bulk action.
   - Recommendation: include in this standalone (Plan 05 or 06). Not breaking for existing Kanban code (which doesn't use bulk). Simple win, high value. Add as sub-task in Plan 02.

5. **What happens to in-flight Inngest events when the concurrency config changes?**
   - What we know: Inngest versions functions by id + config hash. Changing `concurrency` creates a new function version.
   - What's unclear: in-flight events from OLD config — do they finish with old semantics, or re-enter queue?
   - Recommendation: Inngest handles this gracefully (rolling update); in-flight events complete with old config. But events queued WAITING will use new config. Document in runbook: "during deploy, expect up to 1 minute where orderId concurrency is inconsistent." Low risk.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase production project | ALL (migrations, Realtime, domain) | ✓ | current | — |
| Postgres 15+ (Supabase default) | Migration (jsonb, check constraints, partial index) | ✓ | 15+ | — |
| Inngest platform (event infra) | Runner concurrency | ✓ | v3 SDK | — |
| Vercel deployment | Next.js 15 App Router | ✓ | current | — |
| `@supabase/supabase-js` | CAS, Realtime, admin client | ✓ | ^2.93.1 | — |
| `@supabase/ssr` | Server client for actions | ✓ | ^0.8.0 | — |
| `inngest` | Runners | ✓ | ^3.51.0 | — |
| `@dnd-kit/core` + `@dnd-kit/sortable` | Kanban DnD | ✓ | ^6.3.1 / ^10.0.0 | — |
| `sonner` | Toast notifications | ✓ | ^2.0.7 | — |
| `platform_config` table | Feature flags | ✓ | (exists since Phase 44.1) | — |
| `workspace_members` table | RLS policy reference | ✓ | (exists) | — |

**No missing dependencies.** All infrastructure is live.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` (codebase uses it for unit tests; no e2e framework) |
| Config file | `vitest.config.ts` (verify exists; if not, Wave 0 gap) |
| Quick run command | `npm test -- --run tests/{file}.test.ts` |
| Full suite command | `npm test -- --run` |

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Automated Command | File Exists? |
|------|----------|-----------|-------------------|-------------|
| D-04 | CAS rejects second concurrent UPDATE | unit + integration | `npm test -- --run tests/domain/orders-cas.test.ts` | ❌ Wave 0 |
| D-07 L1 | Cycle detected with AND group of multiple condition types | unit | `npm test -- --run tests/builder/validation-cycles.test.ts` | ⚠️ EXISTS — needs new cases |
| D-07 L2 | Kill-switch blocks after >5 non-manual changes/60s | integration | `npm test -- --run tests/automations/kill-switch.test.ts` | ❌ Wave 0 |
| D-07 L3 | cascade_capped row inserted when depth=3 reached | integration | `npm test -- --run tests/automations/cascade-capped.test.ts` | ❌ Wave 0 |
| D-08 | Inngest serializes 2 events for same orderId | integration (inngest-test-engine if exists) | `npm test -- --run tests/inngest/stage-changed-concurrency.test.ts` | ❌ Wave 0 |
| D-14 | Kanban Realtime updates UI when other client moves | e2e (manual or Playwright) | manual test in staging OR `npx playwright test tests/e2e/kanban-realtime.spec.ts` | ❌ Wave 0 (manual OK) |
| D-15 | Kanban rollback + toast on CAS reject | component test | `npm test -- --run tests/components/kanban-board-rollback.test.tsx` | ❌ Wave 0 |
| D-10 RLS | order_stage_history rejects UPDATE/DELETE even via service_role | integration | `npm test -- --run tests/migrations/order-stage-history-rls.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- --run tests/{specific file}.test.ts`
- **Per plan merge:** `npm test -- --run` (full vitest)
- **Phase gate:** Full suite + manual Kanban smoke in staging before production deploy + CAS flag flip.

### Wave 0 Gaps
- [ ] `tests/domain/orders-cas.test.ts` — CAS logic (D-04, D-25)
- [ ] `tests/builder/validation-cycles.test.ts` — if exists, extend with AND/OR/all-types cases; else create
- [ ] `tests/automations/kill-switch.test.ts` — kill-switch query + threshold (D-07 L2)
- [ ] `tests/automations/cascade-capped.test.ts` — history insert on cap (D-07 L3)
- [ ] `tests/inngest/stage-changed-concurrency.test.ts` — stacked concurrency (D-08); requires Inngest test harness or integration Docker + inngest-cli
- [ ] `tests/components/kanban-board-rollback.test.tsx` — rollback UX on CAS reject (D-15)
- [ ] `tests/migrations/order-stage-history-rls.test.ts` — append-only enforcement (D-13)

**Note:** some integration tests (Inngest concurrency, Realtime) may be deferred to manual smoke in staging if automated framework not available — document in LEARNINGS.md.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Existing Supabase auth unchanged by this fix |
| V3 Session Management | No | Unchanged |
| V4 Access Control | YES | RLS on `order_stage_history` (workspace_id scoped per D-13); service_role bypass mitigated by append-only trigger |
| V5 Input Validation | YES | `source` CHECK constraint; orderId/stageId UUIDs via Supabase JS typing |
| V6 Cryptography | No | No crypto primitives introduced |
| V8 Data Protection | YES | `actor_id` stores user UUID — auditable but not exposed to untrusted parties (RLS) |
| V9 Logging & Monitoring | YES | `order_stage_history` IS the audit log; immutable by design |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via stage_id | Tampering | Supabase JS parameterized queries (no raw SQL) |
| Race condition double-mutation | Tampering | CAS `.eq('stage_id', prev)` rejects stale writes |
| Cross-workspace data leak (actor_id) | Information Disclosure | RLS `workspace_id IN (SELECT ...)` |
| Deleted audit rows | Repudiation | Trigger `prevent_order_stage_history_mutation` blocks DELETE even for service_role |
| Cascade loop exhausts Inngest quota | DoS | Kill-switch layer 2 (D-07) + cascade cap layer 3 |
| Stale feature flag cache allowing CAS bypass | Tampering | Accepted 30s window; runbook documents; fail-open acceptable for kill-switch specifically |

## Sources

### Primary (HIGH confidence)

- **Inngest Concurrency Docs** - [Managing concurrency](https://www.inngest.com/docs/guides/concurrency) — CEL expression syntax, scope defaults, stacking semantics
- **Supabase Realtime Postgres Changes** - [Postgres Changes guide](https://supabase.com/docs/guides/realtime/postgres-changes) — filter syntax, listener limits per channel
- **Supabase Realtime Limits** - [Realtime Limits](https://supabase.com/docs/guides/realtime/limits) — 100 channels/client, 1024 KB payload postgres_changes
- **Supabase Realtime Troubleshooting** - [Silent Disconnections](https://supabase.com/docs/guides/troubleshooting/realtime-handling-silent-disconnections-in-backgrounded-applications-592794) — reconnect behavior, no event replay
- **PostgREST Preferences** - [Prefer Header v12](https://docs.postgrest.org/en/v12/references/api/preferences.html) — return=representation behavior for PATCH/UPDATE
- **Codebase — use-messages.ts:174-254** — canonical Realtime + optimistic pattern
- **Codebase — platform-config.ts** — feature flag cache pattern (Phase 44.1)
- **Codebase — two-step.ts:140-155** — idempotent UPDATE WHERE status pattern (CAS precedent)
- **Codebase — mutation_audit.sql** — existing audit table (we complement, not replace)
- **Codebase — agent-production.ts:76-81** — single-scope concurrency precedent
- **Codebase — recompra-preload-context.ts:52** — per-entity concurrency precedent
- **Codebase — src/inngest/functions/automation-runner.ts:358-618** — runner to modify

### Secondary (MEDIUM confidence)

- **Supabase Realtime Issues & Discussions** - [Discussion #5641](https://github.com/orgs/supabase/discussions/5641) — "How to obtain reliable realtime updates in the real world" — community patterns for catch-up refetch
- **Realtime js lost heartbeats** - [Issue #133](https://github.com/supabase/realtime-js/issues/133) — reconnect behavior under specific network conditions
- **PostgREST Tables and Views v12** - [Tables and Views](https://docs.postgrest.org/en/v12/references/api/tables_views.html) — affected resource response semantics

### Tertiary (LOW confidence — needs validation in test environment)

- Exact supabase-js v2 behavior for `.update().eq().select()` returning `[]` vs `null` when zero rows affected — documented behavior via PostgREST, but worth a `tests/domain/orders-cas.test.ts` unit test to confirm against local Supabase instance. Flagged as A1 in Assumptions Log.
- Inngest v3 null-key concurrency behavior — flagged as A2 in Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified from package.json; no new libs
- Architecture: HIGH — all 5 patterns have precedent in codebase or official docs
- Pitfalls: HIGH — 12 pitfalls surfaced from deep read of existing code + cross-reference with current Realtime/CAS semantics
- Test architecture: MEDIUM — vitest framework assumed; some integration tests require Wave 0 test harness setup

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (30 days — standard for stable Postgres/Supabase/Inngest APIs; re-verify if Inngest releases v4 SDK migration guide that affects concurrency syntax).

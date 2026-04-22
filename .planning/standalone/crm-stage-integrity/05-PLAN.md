---
phase: crm-stage-integrity
plan: 05
type: execute
wave: 4
depends_on: [01, 02, 03, 04]
files_modified:
  - vitest.config.ts
  - src/hooks/use-kanban-realtime.ts
  - src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx
  - src/app/(dashboard)/crm/pedidos/components/__tests__/handle-move-result.test.ts
  - .claude/rules/agent-scope.md
  - docs/analysis/04-estado-actual-plataforma.md
  - .planning/standalone/crm-stage-integrity/LEARNINGS.md
autonomous: false
requirements:
  - D-06
  - D-08
  - D-14
  - D-15
  - D-16
  - D-21
  - D-22
  - D-25

must_haves:
  truths:
    - "`src/hooks/use-kanban-realtime.ts` existe como hook extraido, recibe `{ pipelineId, recentMoveRef, onRemoteMove, onReconnect }` y subscribe a `postgres_changes UPDATE` sobre `orders` con filter `pipeline_id=eq.${pipelineId}`"
    - "El hook respeta `recentMoveRef.current === true` → return early (echo suppression, D-14 + Pattern 3 RESEARCH)"
    - "El hook detecta reconnect: status SUBSCRIBED tras previousStatus distinto → llama `onReconnect()` (Pitfall 6 — no replay)"
    - "`useEffect` deps array es SOLO `[pipelineId, recentMoveRef, onRemoteMove, onReconnect]` — NO `ordersByStage` (Pitfall 5 reconnect storm)"
    - "`src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx` invoca el hook con callbacks stable (useCallback/useMemo o inline memoized)"
    - "El callback `onRemoteMove(orderId, newStageId)` mueve el order card en `localOrdersByStage` state. Idempotente: no-op si ya esta en ese stage (Pitfall 7 — compare currentStageId === updated.stage_id)"
    - "El callback `onReconnect()` fuerza `setLocalOrdersByStage(ordersByStage)` con los props actuales (Pitfall 6 mitigation)"
    - "`kanban-board.tsx` EXPORTA la funcion pura `handleMoveResult(result, ctx)` — factoring request de WARNING 4; `ctx = { orderId, originalStageId, setLocalOrdersByStage, ordersByStage, recentMoveRef, toast }`. Contiene toda la logica error-branching (rollback + toast con string preciso + release ref). `handleDragEnd` la invoca tras recibir el resultado del server action."
    - "`handleDragEnd` detecta `result.error === 'stage_changed_concurrently'` (via `handleMoveResult`) y muestra toast `'Este pedido fue movido por otra fuente. Actualizando...'` + setea `recentMoveRef.current = false` para que Realtime pueda actualizar UI (D-15, Example 4 RESEARCH)"
    - "`pipelineId` en el Kanban component viene via prop directa (confirmado: `KanbanBoardProps.pipelineId: string`, linea 33 del file). NO se deriva de stages — la prop es la source of truth."
    - "El timeout de bounce-back permanece 2000ms (D-16 locked)"
    - "`vitest.config.ts` existing se EXTIENDE (NO se recrea from scratch — el archivo ya existe). Default env: `node` (explicit `environment: 'node'` bajo `test:`). Component tests opt-in a jsdom via per-file comment `// @vitest-environment jsdom` (canonical vitest pattern). BLOCKER 4: asegura que los integration tests de Plan 02 (`orders-cas.test.ts`, `order-stage-history-rls.test.ts`) corren bajo Node env y NO se rompen con `window is not defined`"
    - "Test `src/app/(dashboard)/crm/pedidos/components/__tests__/handle-move-result.test.ts` importa `handleMoveResult` (funcion pura exportada de kanban-board) + mockea `setLocalOrdersByStage` + `toast` + assert-ea rollback + toast con texto exacto `'movido por otra fuente'` + `recentMoveRef.current = false` (WARNING 4 — regression signal real, no placeholder)"
    - "NO se crea `src/__tests__/integration/stage-changed-concurrency.test.ts` (WARNING 6 — placeholder eliminado). D-08 automated coverage deferred pending `inngest-test-engine` evaluation. Manual smoke procedure documentado en LEARNINGS.md §Inngest Smoke Manual es el gate actual."
    - "`.claude/rules/agent-scope.md` §CRM Writer Bot actualizado con nota del contract del error `stage_changed_concurrently` + 'NO PUEDE retry implicito' (D-06)"
    - "`docs/analysis/04-estado-actual-plataforma.md` contiene entrada actualizada mencionando: CRM Stage Integrity shipped, 5 capas, flags `crm_stage_integrity_cas_enabled` + `crm_stage_integrity_killswitch_enabled` default false, referencia al standalone path (Regla 4)"
    - "`LEARNINGS.md` del standalone creado con: commits ranges, patterns establecidos (CAS idiom, append-only ledger, kill-switch, per-file jsdom pattern), pitfalls encontrados, guia de rollout (cuando flipear flags), Inngest smoke manual, nota explicita 'D-08 automated coverage deferred pending inngest-test-engine evaluation'"
    - "QA checkpoint humano completado (Regla 6): usuario flipea `crm_stage_integrity_cas_enabled=true` en staging workspace, hace smoke test (move un pedido + verificar que history tiene row), flipea `killswitch_enabled=true` + verifica warning en logs cuando se dispara"
  artifacts:
    - path: "vitest.config.ts"
      provides: "Vitest config con environment: 'node' default (BLOCKER 4); component tests opt-in jsdom per-file"
      contains: "environment: 'node'"
    - path: "src/hooks/use-kanban-realtime.ts"
      provides: "React hook reutilizable para Kanban Realtime"
      contains: "useKanbanRealtime"
    - path: "src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx"
      provides: "Kanban con Realtime + exporta handleMoveResult pure function (WARNING 4)"
      contains: "export function handleMoveResult"
    - path: "src/app/(dashboard)/crm/pedidos/components/__tests__/handle-move-result.test.ts"
      provides: "Unit test importa handleMoveResult + asserts toast exact string + rollback + ref release (WARNING 4)"
      contains: "movido por otra fuente"
    - path: ".claude/rules/agent-scope.md"
      provides: "Scope doc actualizado con error contract"
      contains: "stage_changed_concurrently"
    - path: "docs/analysis/04-estado-actual-plataforma.md"
      provides: "Estado plataforma con shipped del standalone (Regla 4)"
      contains: "CRM Stage Integrity"
    - path: ".planning/standalone/crm-stage-integrity/LEARNINGS.md"
      provides: "Learnings + guia rollout del standalone + D-08 deferred note"
      contains: "D-08 automated coverage deferred"
  key_links:
    - from: "src/hooks/use-kanban-realtime.ts"
      to: "Supabase Realtime postgres_changes UPDATE orders"
      via: "supabase.channel(`kanban:${pipelineId}`).on('postgres_changes', ...)"
      pattern: "postgres_changes"
    - from: "src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx handleDragEnd"
      to: "handleMoveResult pure function (WARNING 4)"
      via: "handleMoveResult(result, { orderId, originalStageId, setLocalOrdersByStage, ordersByStage, recentMoveRef, toast })"
      pattern: "handleMoveResult\\("
    - from: ".claude/rules/agent-scope.md CRM Writer Bot"
      to: "domain.moveOrderToStage error contract"
      via: "documented 'stage_changed_concurrently' error code handling"
      pattern: "stage_changed_concurrently"
    - from: "vitest.config.ts"
      to: "integration tests in src/__tests__/integration/ (Plan 02)"
      via: "environment: 'node' default; jsdom opt-in per-file via @vitest-environment comment"
      pattern: "environment: 'node'"
---

<objective>
Wave 4 (Kanban Realtime + toast rollback + pure handleMoveResult helper + docs) + Wave 5 (docs Regla 4 + LEARNINGS + QA checkpoint Regla 6) consolidados. Cierra el standalone.

**7 entregables (revised post-checker-review):**

1. **Hook extraction** — `src/hooks/use-kanban-realtime.ts` nuevo, subscription a `orders` UPDATE via Supabase Realtime (Pattern 3 + Example 3 RESEARCH). Filter `pipeline_id=eq.${pipelineId}`, echo suppression via `recentMoveRef`, reconnect resync via `onReconnect` callback (Pitfall 6 no replay).

2. **Kanban wiring + pure handleMoveResult helper** — `kanban-board.tsx` usa el hook con callbacks memoizados, callbacks `onRemoteMove` actualizan `localOrdersByStage` idempotentemente (Pitfall 7), `onReconnect` re-inicializa state. `handleDragEnd` delega el post-server-action error-branching a una funcion pura EXPORTADA `handleMoveResult` (WARNING 4 — permite unit testing directo en lugar de placeholder drag-sim). Logica `stage_changed_concurrently` → toast + release `recentMoveRef.current = false` vive dentro de `handleMoveResult` (Example 4 RESEARCH).

3. **Vitest config fix (BLOCKER 4)** — `vitest.config.ts` YA existe (verificado); se EXTIENDE agregando `environment: 'node'` explicit default bajo `test:`. Component tests opt-in a jsdom via per-file comment `// @vitest-environment jsdom`. Esto asegura que los integration tests de Plan 02 (`orders-cas.test.ts`, `order-stage-history-rls.test.ts`) corren bajo Node env sin romperse con `window is not defined`. LEARNINGS.md documenta el per-file pattern para futuros component tests.

4. **Unit test para handleMoveResult (WARNING 4)** — `handle-move-result.test.ts` importa la funcion exportada + mockea `setLocalOrdersByStage`, `toast`, `recentMoveRef` + assert-ea: (a) toast llamado con texto que contiene `'movido por otra fuente'`, (b) setLocalOrdersByStage llamado con `ordersByStage` original, (c) `recentMoveRef.current === false` tras el call. Regression signal real, NO placeholder.

5. **D-08 integration test DELETED (WARNING 6)** — el placeholder `stage-changed-concurrency.test.ts` se ELIMINA del plan completamente. D-08 (Inngest FIFO serialization per-orderId) queda cubierto por manual smoke documentado en LEARNINGS.md §Inngest Smoke Manual. Nota explicita en LEARNINGS: "D-08 automated coverage deferred pending inngest-test-engine evaluation".

6. **Scope doc + platform state doc updates** — `.claude/rules/agent-scope.md` §CRM Writer Bot documenta error contract `stage_changed_concurrently` + "NO PUEDE retry implicito" (D-06). `docs/analysis/04-estado-actual-plataforma.md` menciona shipped del standalone + flags + refs (Regla 4).

7. **LEARNINGS + QA checkpoint** — `LEARNINGS.md` del standalone con commits + patterns (incluye per-file jsdom pattern) + pitfalls + rollout guide + Inngest smoke manual + D-08 deferred note. Checkpoint humano bloqueante (Regla 6): usuario flipea flags en staging workspace + smoke test + decide rollout.

Purpose: Capa UI (Kanban) del defense-in-depth — cuando CAS reject ocurre o cuando otro cliente mueve un pedido via Realtime, el usuario VE la correccion en <1s. Sin Realtime, tras un CAS reject el usuario tendria que refrescar manualmente. Plan 05 tambien cierra Regla 4 (docs sync) y Regla 6 (QA con flags en staging antes de rollout).

**CRITICAL — Regla 6:** El checkpoint humano flipea flags en staging workspace SOLAMENTE. No activa CAS en toda la plataforma — eso queda para decision del usuario post-observacion. Plan 05 entrega toda la maquinaria pero el rollout es gradual por workspace.

**CRITICAL — Regla 1:** Push a Vercel al final de Task 6 (antes del QA checkpoint). El QA checkpoint opera contra el deploy.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/crm-stage-integrity/CONTEXT.md — D-06 (scope doc), D-14 (Realtime subscription), D-15 (toast rollback), D-16 (2000ms bounce-back locked), D-21 (no flag para Kanban UX), D-22 (observability events), D-25 (tests)
@.planning/standalone/crm-stage-integrity/RESEARCH.md §Pattern 3 lineas 417-511 (Realtime + echo suppression completo), §Example 3 lineas 1114-1169 (hook extraction shape), §Example 4 lineas 1174-1204 (Kanban error handling), §Pitfall 5 (reconnect storm), §Pitfall 6 (no replay), §Pitfall 7 (echo timeout), §Open Question 4 (bulk return shape ya cubierto en Plan 02)
@.planning/standalone/crm-stage-integrity/PATTERNS.md §Wave 4 use-kanban-realtime.ts (lineas 814-828), §kanban-board.tsx MODIFY (lineas 832-865), §kanban-board-rollback.test.tsx (lineas 869-896), §Wave 5 agent-scope.md (lineas 956-970)
@src/hooks/use-messages.ts — lineas 174-254 (canonical Realtime + echo suppression pattern)
@src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx — linea 33 (`pipelineId: string` prop — CONFIRMADO WARNING 5), linea 77 (destructured en component body), linea 103-110 (recentMoveRef existing), 205-307 (handleDragEnd), 268-286 (optimistic + bounce-back 2000ms)
@src/lib/supabase/client.ts — `createClient()` browser client
@vitest.config.ts — EXISTING (verificado): tiene `exclude` pero NO `environment` — Plan 05 agrega `environment: 'node'` explicit (BLOCKER 4)
@.claude/rules/agent-scope.md — seccion §CRM Writer Bot existing (PUEDE / NO PUEDE / Validacion)
@docs/analysis/04-estado-actual-plataforma.md — doc actualizable
@CLAUDE.md §Regla 1 (push), §Regla 4 (docs sync), §Regla 6 (QA flags)

<interfaces>
<!-- Hook signature (Example 3 RESEARCH + PATTERNS.md Wave 4) -->
interface UseKanbanRealtimeOpts {
  pipelineId: string | null
  recentMoveRef: React.MutableRefObject<boolean>
  onRemoteMove: (orderId: string, newStageId: string) => void
  onReconnect: () => void
}
export function useKanbanRealtime(opts: UseKanbanRealtimeOpts): void

<!-- Subscription shape (Pattern 3 RESEARCH) -->
supabase
  .channel(`kanban:${pipelineId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'orders',
    filter: `pipeline_id=eq.${pipelineId}`,
  }, (payload) => {
    if (recentMoveRef.current) return  // echo suppression
    const updated = payload.new as { id: string; stage_id: string; pipeline_id: string }
    if (updated.pipeline_id !== pipelineId) return  // defensive
    onRemoteMove(updated.id, updated.stage_id)
  })
  .subscribe((status) => {
    if (status === 'SUBSCRIBED' && previousStatus && previousStatus !== 'SUBSCRIBED') {
      onReconnect()  // reconnect resync (Pitfall 6)
    }
    previousStatus = status
  })

<!-- handleMoveResult pure helper EXPORTADA de kanban-board.tsx (WARNING 4) -->
export interface MoveOrderResult {
  success?: true
  error?: string
  data?: { currentStageId?: string | null }
}

export interface HandleMoveResultCtx {
  orderId: string
  originalStageId: string
  setLocalOrdersByStage: (next: OrdersByStage | ((prev: OrdersByStage) => OrdersByStage)) => void
  ordersByStage: OrdersByStage
  recentMoveRef: React.MutableRefObject<boolean>
  toast: {
    error: (msg: string) => void
  }
}

export function handleMoveResult(result: MoveOrderResult, ctx: HandleMoveResultCtx): void {
  if (result.success) return  // happy path - no rollback needed
  // Rollback optimistic state
  ctx.setLocalOrdersByStage(ctx.ordersByStage)
  if (result.error === 'stage_changed_concurrently') {
    // D-15: CAS rejection — other source moved this order concurrently
    ctx.toast.error('Este pedido fue movido por otra fuente. Actualizando...')
    // Release echo suppression so Realtime can deliver the truth-state update
    ctx.recentMoveRef.current = false
  } else {
    ctx.toast.error(result.error ?? 'Error al mover el pedido')
  }
}

<!-- vitest.config.ts extension (BLOCKER 4) -->
// BEFORE (existing):
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/.claude/**'],
  },
})
// AFTER:
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'node',  // NEW — default to Node for integration tests (Plan 02)
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/.claude/**'],
  },
})
// Component tests opt-in to jsdom via per-file comment:
//   // @vitest-environment jsdom
//   import { render } from '@testing-library/react'
//   ...

<!-- agent-scope.md addition (PATTERNS.md Wave 5 shape) -->
-- En §CRM Writer Bot → "Validacion":
-- - Error `stage_changed_concurrently` retornado por domain.moveOrderToStage:
--   callers lo persisten a `crm_bot_actions.error.code` para que sandbox UI
--   muestre toast "pedido stale". El writer NO retry implicitamente.
-- En §CRM Writer Bot → "NO PUEDE":
-- - Retry implicito tras `stage_changed_concurrently` (es decision del agent loop /
--   usuario re-proponer, no del mechanic del writer).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear hook `use-kanban-realtime.ts` + modificar `kanban-board.tsx` (Realtime + exportar handleMoveResult + toast)</name>
  <read_first>
    - src/hooks/use-messages.ts (entero lineas 174-254 — canonical pattern, eslint-disable exhaustive-deps rationale)
    - src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx (entero — especialmente lineas 30-47 `KanbanBoardProps` — CONFIRMAR que `pipelineId: string` ES una prop directa en linea 33; lineas 74-91 destructuring; lineas 90-130 para ver recentMoveRef + useEffect existing, 205-307 handleDragEnd, 268-286 bounce-back 2000ms)
    - **WARNING 5 verification:** ejecutar `grep -nE "pipelineId|pipeline_id" src/app/\(dashboard\)/crm/pedidos/components/kanban-board.tsx` — confirmar que `pipelineId` es prop directa (ya verificado: linea 33 `pipelineId: string` + linea 77 destructured). Si por algun motivo la prop no existe en el archivo observado en runtime, derivarla via `const pipelineId = stages[0]?.pipeline_id ?? null` y documentar en el action block.
    - src/lib/supabase/client.ts (confirmar `createClient` export browser-safe)
    - src/lib/orders/types.ts (buscar tipos `OrderWithDetails`, `OrdersByStage` — shape que `localOrdersByStage` maneja)
    - .planning/standalone/crm-stage-integrity/RESEARCH.md §Pattern 3 lineas 417-511, §Example 3 lineas 1114-1169, §Example 4 lineas 1174-1204, §Pitfalls 5/6/7
    - .planning/standalone/crm-stage-integrity/PATTERNS.md §Wave 4 (lineas 814-865)
    - .planning/standalone/crm-stage-integrity/CONTEXT.md §Decisions D-14, D-15, D-16, D-21
  </read_first>
  <action>
    **Paso 1 — CREAR `src/hooks/use-kanban-realtime.ts`:**

    ```typescript
    /**
     * useKanbanRealtime — subscribe to Supabase Realtime UPDATE events on `orders`
     * for a specific pipeline. Reconciles remote state changes (CAS completions from
     * other clients, automations, agents) into the Kanban UI.
     *
     * - Echo suppression: skips events when `recentMoveRef.current === true` (the current
     *   user just made a local optimistic move — avoids double-apply / flicker).
     * - Reconnect resync: on SUBSCRIBED after a non-SUBSCRIBED status, calls `onReconnect`
     *   so the parent can refetch / reset state (Supabase Realtime has NO event replay).
     *
     * D-14 + D-21 (no flag). Pattern 3 + Example 3 RESEARCH.
     */
    import { useEffect } from 'react'
    import type { MutableRefObject } from 'react'
    import { createClient } from '@/lib/supabase/client'

    export interface UseKanbanRealtimeOpts {
      pipelineId: string | null
      recentMoveRef: MutableRefObject<boolean>
      onRemoteMove: (orderId: string, newStageId: string) => void
      onReconnect: () => void
    }

    export function useKanbanRealtime({
      pipelineId,
      recentMoveRef,
      onRemoteMove,
      onReconnect,
    }: UseKanbanRealtimeOpts): void {
      useEffect(() => {
        if (!pipelineId) return

        const supabase = createClient()
        let previousStatus = ''

        const channel = supabase
          .channel(`kanban:${pipelineId}`)
          .on(
            'postgres_changes' as any,
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'orders',
              filter: `pipeline_id=eq.${pipelineId}`,
            },
            (payload: { new: { id: string; stage_id: string; pipeline_id: string } }) => {
              // Local echo suppression (Pitfall 7 — existing 2000ms via recentMoveRef)
              if (recentMoveRef.current) return

              const updated = payload.new
              // Defensive: server-side filter SHOULD guarantee this, but double-check
              if (updated.pipeline_id !== pipelineId) return

              onRemoteMove(updated.id, updated.stage_id)
            },
          )
          .subscribe((status: string) => {
            if (
              status === 'SUBSCRIBED' &&
              previousStatus &&
              previousStatus !== 'SUBSCRIBED'
            ) {
              // Reconnected after drop — Supabase Realtime has no replay (Pitfall 6)
              onReconnect()
            }
            previousStatus = status
          })

        return () => {
          supabase.removeChannel(channel)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [pipelineId, recentMoveRef, onRemoteMove, onReconnect])
      // NOTE: intentionally NO `ordersByStage` in deps — Pitfall 5 reconnect storm avoidance.
    }
    ```

    NOTA: Los callers (kanban-board) deben memoizar `onRemoteMove` y `onReconnect` con `useCallback` sobre sus deps estables (pipelineId, props de setters). Si no se memoizan, el useEffect re-subscribe en cada render — Pitfall 5.

    **Paso 2 — MODIFICAR `src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx`:**

    1) Agregar import del hook:
    ```typescript
    import { useKanbanRealtime } from '@/hooks/use-kanban-realtime'
    ```

    2) **EXPORTAR `handleMoveResult` como funcion pura (WARNING 4 — habilita unit test directo):**

    En el TOPE del archivo (fuera del component body, al nivel de module), agregar:

    ```typescript
    export interface MoveOrderResult {
      success?: true
      error?: string
      data?: { currentStageId?: string | null }
    }

    export interface HandleMoveResultCtx {
      orderId: string
      originalStageId: string
      setLocalOrdersByStage: (
        next: OrdersByStage | ((prev: OrdersByStage) => OrdersByStage)
      ) => void
      ordersByStage: OrdersByStage
      recentMoveRef: React.MutableRefObject<boolean>
      toast: { error: (msg: string) => void }
    }

    /**
     * Pure function: branches on a moveOrderToStage result and reverts optimistic
     * UI state + shows toast when the server rejected (CAS, WIP limits, 404, etc).
     * Exported so unit tests can verify the error-branching without driving
     * dnd-kit. WARNING 4 from checker review.
     */
    export function handleMoveResult(
      result: MoveOrderResult,
      ctx: HandleMoveResultCtx,
    ): void {
      if (result.success) return  // happy path — optimistic state already correct

      // Rollback optimistic state to parent truth
      ctx.setLocalOrdersByStage(ctx.ordersByStage)

      if (result.error === 'stage_changed_concurrently') {
        // D-15: CAS rejection — other source moved this order concurrently
        ctx.toast.error('Este pedido fue movido por otra fuente. Actualizando...')
        // Release echo suppression so Realtime can deliver the truth-state update
        ctx.recentMoveRef.current = false
      } else {
        ctx.toast.error(result.error ?? 'Error al mover el pedido')
      }
    }
    ```

    3) En el component body, tras la declaracion de `recentMoveRef` (linea ~103), agregar callbacks memoizados + hook call. `pipelineId` viene directamente de `KanbanBoardProps` (confirmado linea 33 + 77 — WARNING 5):

    ```typescript
    const handleRemoteMove = React.useCallback(
      (orderId: string, newStageId: string) => {
        setLocalOrdersByStage((prev) => {
          // Locate current position
          let currentStageId: string | null = null
          let orderItem: any = null
          for (const [sid, orders] of Object.entries(prev)) {
            const found = (orders as any[]).find((o) => o.id === orderId)
            if (found) {
              currentStageId = sid
              orderItem = found
              break
            }
          }
          // Idempotent: no-op if already in target stage (Pitfall 7 RESEARCH)
          if (!orderItem || currentStageId === newStageId) return prev

          const next = { ...prev }
          if (currentStageId) {
            next[currentStageId] = (prev[currentStageId] || []).filter(
              (o: any) => o.id !== orderId,
            )
          }
          next[newStageId] = [
            ...(prev[newStageId] || []),
            { ...orderItem, stage_id: newStageId },
          ]
          return next
        })
      },
      [],
    )

    const handleReconnect = React.useCallback(() => {
      setLocalOrdersByStage(ordersByStage)  // reset to parent truth
    }, [ordersByStage])

    useKanbanRealtime({
      pipelineId: pipelineId ?? null,  // pipelineId is a required prop (line 33 KanbanBoardProps)
      recentMoveRef,
      onRemoteMove: handleRemoteMove,
      onReconnect: handleReconnect,
    })
    ```

    4) MODIFICAR `handleDragEnd` (linea ~293-307 existing error branch). Localizar el bloque `if ('error' in result)` y REEMPLAZARLO por una invocacion al helper puro `handleMoveResult`:

    ```typescript
    // Dentro de handleDragEnd, tras obtener `result` del server action:
    handleMoveResult(result as MoveOrderResult, {
      orderId,
      originalStageId: currentStageId,
      setLocalOrdersByStage,
      ordersByStage,
      recentMoveRef,
      toast,
    })
    if ('error' in (result as any)) {
      onOrderMoved?.(orderId, newStageId, currentStageId)
      return
    }
    ```

    El helper encapsula la logica error-branching (rollback + toast + release ref). Esto permite que el unit test de Task 2 cubra las 3 asserts (rollback, toast exact text, ref release) sin necesidad de simular dnd-kit.

    5) **NO tocar** la logica de optimistic state update (lines ~268-286) ni el bounce-back timeout 2000ms (D-16 locked per CONTEXT.md).

    6) Si `sonner` no esta importado ya: agregar `import { toast } from 'sonner'` (YA esta en linea 27 — verificado).

    **Paso 3 — Smoke compile check:**
    ```bash
    npx tsc --noEmit 2>&1 | grep -E "(src/hooks/use-kanban-realtime|src/app/\(dashboard\)/crm/pedidos/components/kanban-board)"
    ```
    Esperado: 0 errors en estos 2 archivos.
  </action>
  <verify>
    <automated>ls src/hooks/use-kanban-realtime.ts</automated>
    <automated>grep -q "export function useKanbanRealtime" src/hooks/use-kanban-realtime.ts</automated>
    <automated>grep -q "recentMoveRef.current" src/hooks/use-kanban-realtime.ts</automated>
    <automated>grep -q "postgres_changes" src/hooks/use-kanban-realtime.ts</automated>
    <automated>grep -qE "filter: \`pipeline_id=eq\.\\\${pipelineId}\`" src/hooks/use-kanban-realtime.ts</automated>
    <automated>grep -q "previousStatus !== 'SUBSCRIBED'" src/hooks/use-kanban-realtime.ts</automated>
    <automated>grep -q "removeChannel" src/hooks/use-kanban-realtime.ts</automated>
    <automated>grep -q "useKanbanRealtime" src/app/\(dashboard\)/crm/pedidos/components/kanban-board.tsx</automated>
    <automated>grep -q "export function handleMoveResult" src/app/\(dashboard\)/crm/pedidos/components/kanban-board.tsx</automated>
    <automated>grep -q "stage_changed_concurrently" src/app/\(dashboard\)/crm/pedidos/components/kanban-board.tsx</automated>
    <automated>grep -q "Este pedido fue movido por otra fuente" src/app/\(dashboard\)/crm/pedidos/components/kanban-board.tsx</automated>
    <automated>grep -q "recentMoveRef.current = false" src/app/\(dashboard\)/crm/pedidos/components/kanban-board.tsx</automated>
    <automated>grep -nE "pipelineId" src/app/\(dashboard\)/crm/pedidos/components/kanban-board.tsx | head -3</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -v node_modules | grep -E "(src/hooks/use-kanban-realtime|kanban-board.tsx)" || echo "no TS errors"</automated>
  </verify>
  <acceptance_criteria>
    - `src/hooks/use-kanban-realtime.ts` existe y exporta `useKanbanRealtime`.
    - Hook usa `supabase.channel(\`kanban:\${pipelineId}\`)`, `.on('postgres_changes', { event: 'UPDATE', table: 'orders', filter: 'pipeline_id=eq.${pipelineId}' })`, echo suppression via `recentMoveRef.current`, reconnect detection via previousStatus compare.
    - Cleanup via `supabase.removeChannel(channel)` en return.
    - Deps array SOLO `[pipelineId, recentMoveRef, onRemoteMove, onReconnect]` — NO `ordersByStage`.
    - `kanban-board.tsx` importa y llama el hook con callbacks memoizados (`React.useCallback`).
    - `kanban-board.tsx` EXPORTA funcion pura `handleMoveResult(result, ctx)` (WARNING 4) — verificable via `grep -q "export function handleMoveResult"`.
    - `pipelineId` es prop directa (line 33 KanbanBoardProps, WARNING 5) — no se deriva de stages.
    - `onRemoteMove` es idempotente (check `currentStageId === newStageId` no-op).
    - `onReconnect` hace `setLocalOrdersByStage(ordersByStage)`.
    - `handleDragEnd` delega al helper `handleMoveResult(result, {orderId, originalStageId, setLocalOrdersByStage, ordersByStage, recentMoveRef, toast})`.
    - Bounce-back timeout 2000ms intacto (D-16 not modified).
    - `npx tsc --noEmit` sin errores nuevos.
  </acceptance_criteria>
  <done>
    - Commit atomico: `feat(crm-stage-integrity): add Kanban Realtime + export handleMoveResult pure helper`
    - NO push todavia — acumular con Tasks 2-7.
  </done>
</task>

<task type="auto">
  <name>Task 2: Extender vitest.config.ts + crear handle-move-result.test.ts (BLOCKER 4 + WARNING 4 + WARNING 6)</name>
  <read_first>
    - vitest.config.ts COMPLETO — YA existe; tiene `resolve.alias` + `test.exclude`. NO tiene `test.environment` — Plan 05 lo AGREGA como `'node'` explicit (BLOCKER 4)
    - src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx (la version modificada en Task 1 — confirmar que `handleMoveResult` + `MoveOrderResult` + `HandleMoveResultCtx` estan exportados)
    - package.json (verificar `@testing-library/react` / `jsdom` — solo necesarios si futuros component tests con UI rendering; handle-move-result.test.ts es pure function, NO necesita jsdom)
    - .planning/standalone/crm-stage-integrity/PATTERNS.md §Wave 4 kanban-board-rollback.test.tsx (lineas 869-896) — formato original (puede diferir porque ahora es pure function test)
    - .planning/standalone/crm-stage-integrity/CONTEXT.md §Decisions D-25
  </read_first>
  <action>
    **Paso 1 — MODIFICAR `vitest.config.ts` existing (BLOCKER 4 fix):**

    El archivo YA existe. Extender el bloque `test` para agregar `environment: 'node'` como default explicit. NO crear desde cero.

    Estado actual:
    ```typescript
    import { defineConfig } from 'vitest/config'
    import path from 'node:path'

    export default defineConfig({
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        },
      },
      test: {
        exclude: [
          '**/node_modules/**',
          '**/.next/**',
          '**/dist/**',
          '**/.claude/**',
        ],
      },
    })
    ```

    Estado tras edit — agregar UNA linea `environment: 'node'` dentro de `test:`:

    ```typescript
    import { defineConfig } from 'vitest/config'
    import path from 'node:path'

    export default defineConfig({
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        },
      },
      test: {
        // Default env: Node. Integration tests (Plan 02 — orders-cas, order-stage-history-rls)
        // require Supabase admin client + real DB — they CANNOT run under jsdom.
        // Component tests (future) opt-in to jsdom via per-file comment:
        //   // @vitest-environment jsdom
        environment: 'node',
        exclude: [
          '**/node_modules/**',
          '**/.next/**',
          '**/dist/**',
          '**/.claude/**',
        ],
      },
    })
    ```

    **Por que `environment: 'node'` explicit:** Aunque `node` es el default de vitest, hacerlo explicit:
    (a) Documenta la intencion (integration tests son first-class).
    (b) Previene que futuros edits accidentales (alguien agrega `environment: 'jsdom'` global) rompan los integration tests de Plan 02.
    (c) Satisface el grep check `grep -q "environment: 'node'" vitest.config.ts`.

    **Paso 2 — Smoke test: verificar que integration tests de Plan 02 siguen corriendo bajo Node:**

    ```bash
    # Estos tests existen tras Plan 02 + usan createClient de @supabase/supabase-js (Node-only libs)
    npm test -- --run src/__tests__/domain/orders-cas.test.ts 2>&1 | tee /tmp/orders-cas-test.log
    npm test -- --run src/__tests__/integration/order-stage-history-rls.test.ts 2>&1 | tee /tmp/rls-test.log
    ```

    Expected outputs (tras el vitest config update):
    - Si env vars TEST_* set: tests corren bajo Node env + PASS/FAIL reales.
    - Si env vars TEST_* missing: tests SKIP (via `describe.skipIf` de Plan 02) — no ERROR con `window is not defined` ni similar jsdom leakage.
    - **NO aceptable:** `ReferenceError: window is not defined` u otro error de jsdom. Si aparece → BLOCKER 4 no resuelto.

    **Paso 3 — CREAR `src/app/(dashboard)/crm/pedidos/components/__tests__/handle-move-result.test.ts` (WARNING 4):**

    Pure function test, NO necesita jsdom. Corre bajo Node env (default tras Paso 1). Importa `handleMoveResult` exportado de kanban-board (Task 1 Paso 2.2).

    ```typescript
    /**
     * Unit test — handleMoveResult pure function (WARNING 4, D-15, D-25).
     * Pure function, no UI rendering — runs under default Node env (BLOCKER 4).
     * Imports the exported helper directly from kanban-board.tsx to get real regression signal.
     */
    import { describe, it, expect, vi, beforeEach } from 'vitest'
    import { handleMoveResult, type MoveOrderResult, type HandleMoveResultCtx } from '@/app/(dashboard)/crm/pedidos/components/kanban-board'

    function buildCtx(overrides: Partial<HandleMoveResultCtx> = {}): HandleMoveResultCtx {
      const ordersByStage = {
        'stage-A': [{ id: 'order-1', name: 'Test', stage_id: 'stage-A' }] as any,
        'stage-B': [] as any,
      }
      return {
        orderId: 'order-1',
        originalStageId: 'stage-A',
        setLocalOrdersByStage: vi.fn(),
        ordersByStage: ordersByStage as any,
        recentMoveRef: { current: true } as any,
        toast: { error: vi.fn() },
        ...overrides,
      }
    }

    describe('handleMoveResult', () => {
      beforeEach(() => {
        vi.clearAllMocks()
      })

      it('success result → NO rollback, NO toast, NO ref release', () => {
        const ctx = buildCtx()
        const result: MoveOrderResult = { success: true }
        handleMoveResult(result, ctx)
        expect(ctx.setLocalOrdersByStage).not.toHaveBeenCalled()
        expect(ctx.toast.error).not.toHaveBeenCalled()
        expect(ctx.recentMoveRef.current).toBe(true)
      })

      it('stage_changed_concurrently error → rollback + toast con "movido por otra fuente" + release ref', () => {
        const ctx = buildCtx()
        const result: MoveOrderResult = {
          error: 'stage_changed_concurrently',
          data: { currentStageId: 'stage-C' },
        }
        handleMoveResult(result, ctx)

        expect(ctx.setLocalOrdersByStage).toHaveBeenCalledTimes(1)
        expect(ctx.setLocalOrdersByStage).toHaveBeenCalledWith(ctx.ordersByStage)

        expect(ctx.toast.error).toHaveBeenCalledTimes(1)
        expect(ctx.toast.error).toHaveBeenCalledWith(
          expect.stringContaining('movido por otra fuente'),
        )

        expect(ctx.recentMoveRef.current).toBe(false)  // released (D-15)
      })

      it('generic error → rollback + toast con error string + NO ref release', () => {
        const ctx = buildCtx()
        const result: MoveOrderResult = { error: 'Pedido no encontrado' }
        handleMoveResult(result, ctx)

        expect(ctx.setLocalOrdersByStage).toHaveBeenCalledWith(ctx.ordersByStage)
        expect(ctx.toast.error).toHaveBeenCalledWith('Pedido no encontrado')
        // Generic error → ref stays at original (true) — only CAS reject releases
        expect(ctx.recentMoveRef.current).toBe(true)
      })

      it('error result sin error string → fallback toast message', () => {
        const ctx = buildCtx()
        const result: MoveOrderResult = { error: undefined as any }
        handleMoveResult(result, ctx)
        expect(ctx.toast.error).toHaveBeenCalledWith('Error al mover el pedido')
      })
    })
    ```

    **Paso 4 — Smoke run local:**

    ```bash
    npm test -- --run src/app/\(dashboard\)/crm/pedidos/components/__tests__/handle-move-result.test.ts
    ```

    Esperado: 4 tests PASS (pure function, no UI, no DB). Si TypeScript falla compilando el test → `handleMoveResult` no fue exportado correctamente en Task 1 Paso 2.2.

    **Paso 5 — WARNING 6: NO crear `stage-changed-concurrency.test.ts`:**

    El placeholder `src/__tests__/integration/stage-changed-concurrency.test.ts` del plan original se ELIMINA del alcance. D-08 (Inngest FIFO serialization per-orderId) queda cubierto por:
    1. Concurrency stacked array en runner (Plan 03 Task 1) + tests unitarios de helpers (Plan 03 Task 4) — cubre la configuracion.
    2. Manual smoke procedure documentado en LEARNINGS.md §Inngest Smoke Manual (Task 5 Paso 5.X abajo) — cubre la verificacion end-to-end.

    Verificacion explicita que el placeholder NO existe:
    ```bash
    test ! -f src/__tests__/integration/stage-changed-concurrency.test.ts
    ```

    Nota explicita sera registrada en LEARNINGS.md (Task 5) en el formato: "D-08 automated coverage deferred pending inngest-test-engine evaluation".
  </action>
  <verify>
    <automated>grep -q "environment: 'node'" vitest.config.ts</automated>
    <automated>ls src/app/\(dashboard\)/crm/pedidos/components/__tests__/handle-move-result.test.ts</automated>
    <automated>grep -q "import { handleMoveResult" src/app/\(dashboard\)/crm/pedidos/components/__tests__/handle-move-result.test.ts</automated>
    <automated>grep -q "movido por otra fuente" src/app/\(dashboard\)/crm/pedidos/components/__tests__/handle-move-result.test.ts</automated>
    <automated>grep -q "expect.stringContaining" src/app/\(dashboard\)/crm/pedidos/components/__tests__/handle-move-result.test.ts</automated>
    <automated>test ! -f src/__tests__/integration/stage-changed-concurrency.test.ts</automated>
    <automated>npm test -- --run src/app/\(dashboard\)/crm/pedidos/components/__tests__/handle-move-result.test.ts 2>&1 | grep -qE "(PASS|passed)" || echo "test may require vitest setup"</automated>
    <automated>npm test -- --run src/__tests__/integration/order-stage-history-rls.test.ts 2>&1 | grep -vq "window is not defined" || echo "BLOCKER 4 not fixed — jsdom leaked"</automated>
  </verify>
  <acceptance_criteria>
    - `vitest.config.ts` tiene `environment: 'node'` explicit bajo `test:` (BLOCKER 4 fix) — verificable via `grep -q "environment: 'node'" vitest.config.ts`.
    - `src/app/(dashboard)/crm/pedidos/components/__tests__/handle-move-result.test.ts` creado, importa `handleMoveResult` del kanban-board module (WARNING 4).
    - Test tiene 4 casos: success no-op, CAS reject (toast + rollback + ref release), generic error (toast + rollback, NO ref release), error sin string (fallback message).
    - Test assert-ea toast con `expect.stringContaining('movido por otra fuente')` (texto exacto del requirement WARNING 4).
    - Test assert-ea setLocalOrdersByStage called with `ordersByStage` original.
    - Test assert-ea `recentMoveRef.current === false` tras CAS reject.
    - `src/__tests__/integration/stage-changed-concurrency.test.ts` NO existe (WARNING 6 fix — placeholder eliminado).
    - Smoke run de tests de Plan 02 (integration) NO muestra `window is not defined` ni errores de jsdom (BLOCKER 4 validation).
    - `handle-move-result.test.ts` corre bajo Node env (default tras Paso 1) — no necesita jsdom porque es pure function test.
    - `npx tsc --noEmit` sin errores nuevos.
  </acceptance_criteria>
  <done>
    - Commit atomico: `test(crm-stage-integrity): extend vitest config + add handleMoveResult unit test`
  </done>
</task>

<task type="auto">
  <name>Task 3: Actualizar `.claude/rules/agent-scope.md` §CRM Writer Bot (D-06 scope doc)</name>
  <read_first>
    - .claude/rules/agent-scope.md (entero — ver §CRM Writer Bot actual lineas ~51-80)
    - .planning/standalone/crm-stage-integrity/PATTERNS.md §Wave 5 agent-scope.md (lineas 956-970)
    - .planning/standalone/crm-stage-integrity/CONTEXT.md §Decisions D-06
  </read_first>
  <action>
    Localizar §CRM Writer Bot en `.claude/rules/agent-scope.md`. Agregar en la subseccion "Validacion" (al final, antes de la proxima seccion) los siguientes bullets NUEVOS:

    ```markdown
    - **Error contract `stage_changed_concurrently` (Standalone crm-stage-integrity, D-06):** cuando `domain.moveOrderToStage` retorna este error (CAS reject — otra fuente movio el pedido entre el SELECT y el UPDATE), el writer lo persiste verbatim en `crm_bot_actions.error.code`. La sandbox UI lo consume para mostrar toast "pedido stale". NO convertir a mensaje generico.
    ```

    Y agregar a la subseccion "NO PUEDE":

    ```markdown
    - Retry implicito tras `stage_changed_concurrently`. La decision de re-proponer la mutacion es del agent loop / usuario — el writer mechanic (two-step propose → confirm) no intenta reintentos automaticos. Comportamiento esperado: el `confirm` devuelve `status: 'failed'` + `error: { code: 'stage_changed_concurrently' }`; el caller decide que hacer (propose de nuevo con fresh state o escalar al usuario).
    ```

    Preservar la estructura existente (PUEDE / NO PUEDE / Validacion / Consumidores in-process). NO borrar ningun contenido actual. Solo agregar los 2 bullets nuevos.

    Si la seccion §CRM Writer Bot tambien tiene una tabla de error codes, agregar `stage_changed_concurrently` ahi tambien.
  </action>
  <verify>
    <automated>grep -q "stage_changed_concurrently" .claude/rules/agent-scope.md</automated>
    <automated>grep -q "Retry implicito tras" .claude/rules/agent-scope.md</automated>
    <automated>grep -q "crm_bot_actions.error.code" .claude/rules/agent-scope.md</automated>
    <automated>grep -q "crm-stage-integrity" .claude/rules/agent-scope.md</automated>
  </verify>
  <acceptance_criteria>
    - `.claude/rules/agent-scope.md` §CRM Writer Bot contiene bullet nuevo en "Validacion" mencionando `stage_changed_concurrently` + `crm_bot_actions.error.code` + referencia al standalone.
    - Contiene bullet nuevo en "NO PUEDE" sobre "Retry implicito tras stage_changed_concurrently".
    - Contenido existing preservado intacto.
  </acceptance_criteria>
  <done>
    - Commit atomico: `docs(crm-stage-integrity): document stage_changed_concurrently error contract in agent-scope (D-06)`
  </done>
</task>

<task type="auto">
  <name>Task 4: Actualizar `docs/analysis/04-estado-actual-plataforma.md` (Regla 4)</name>
  <read_first>
    - docs/analysis/04-estado-actual-plataforma.md (entero — entender estructura de secciones para encontrar donde agregar)
    - .planning/standalone/crm-stage-integrity/CONTEXT.md (resumen del standalone para referencia)
  </read_first>
  <action>
    Localizar la seccion relevante en `docs/analysis/04-estado-actual-plataforma.md`. Candidatos probables (dependiendo de la estructura):
    - Seccion "CRM / Pedidos" → agregar entry con ship del standalone.
    - Seccion "Automatizaciones" → mencionar cycle detection expandida.
    - Seccion "Deuda tecnica" → si habia item sobre "pedidos que se devuelven" o "race condition stage_id", marcarlo como resuelto y removerlo (o taggearlo [RESUELTO 2026-04]).

    Agregar (o mergear con seccion existente) el siguiente bloque:

    ```markdown
    ### CRM Stage Integrity (shipped 2026-04)

    Standalone `.planning/standalone/crm-stage-integrity/` — fix del bug "pedidos se devuelven de un stage a otro" (reportado 2026-04-21). 5 capas de defensa compuestas:

    1. **Domain CAS** — `src/lib/domain/orders.ts moveOrderToStage` usa optimistic compare-and-swap (`.eq('stage_id', previousStageId).select('id')`). Flag `crm_stage_integrity_cas_enabled` default `false` (rollout gradual per workspace).
    2. **Audit log** — tabla append-only `order_stage_history` con RLS + trigger plpgsql. Poblada desde deploy (additive, no flag).
    3. **Inngest concurrency per-orderId** — `automation-runner.ts` runner `order.stage_changed` serializa eventos del mismo orderId (no flag, additive).
    4. **Runtime kill-switch** — mismo runner consulta `order_stage_history` en ultimos 60s; si >5 cambios no-manuales, skippea. Flag `crm_stage_integrity_killswitch_enabled` default `false`.
    5. **Build-time cycle detection** — `src/lib/builder/validation.ts conditionsPreventActivation` reescrita con AND/OR recursivo + 9 operators + 5+ field namespaces (no flag, pure function).
    6. **Kanban Realtime + toast rollback** — `src/hooks/use-kanban-realtime.ts` nuevo + `kanban-board.tsx` muestra toast "pedido movido por otra fuente" cuando CAS rechaza el move local (no flag).

    **Rollout status:** tecnico shipped a prod. Flags default OFF. Flip manual per workspace tras observar `stage_change_rejected_cas` events en logs.

    **Referencia:** `.planning/standalone/crm-stage-integrity/LEARNINGS.md` para rollout guide.
    ```

    Si existia una entrada previa de "Deuda tecnica P0/P1" sobre este bug, removerla (Regla 4: resolved items eliminar o mover a "Resuelto").

    Si el doc tiene tabla de "Estado por modulo", actualizar el estado de "CRM Pedidos" y "Automations" con la nueva info.
  </action>
  <verify>
    <automated>grep -q "CRM Stage Integrity" docs/analysis/04-estado-actual-plataforma.md</automated>
    <automated>grep -q "crm_stage_integrity_cas_enabled" docs/analysis/04-estado-actual-plataforma.md</automated>
    <automated>grep -q "crm_stage_integrity_killswitch_enabled" docs/analysis/04-estado-actual-plataforma.md</automated>
    <automated>grep -q "order_stage_history" docs/analysis/04-estado-actual-plataforma.md</automated>
  </verify>
  <acceptance_criteria>
    - `docs/analysis/04-estado-actual-plataforma.md` contiene entrada CRM Stage Integrity con las 5-6 capas listadas + flags default OFF + referencia al standalone path.
    - Si habia deuda tecnica P0/P1 relacionada a "race condition stage_id" o "pedidos se devuelven", marcada como resuelta o removida.
    - Content existente preservado.
  </acceptance_criteria>
  <done>
    - Commit atomico: `docs(crm-stage-integrity): update platform state with CRM Stage Integrity ship (Regla 4)`
  </done>
</task>

<task type="auto">
  <name>Task 5: Crear `LEARNINGS.md` del standalone</name>
  <read_first>
    - .planning/standalone/somnio-recompra-crm-reader/LEARNINGS.md si existe (referencia de structure)
    - Commits de Plans 01-04 (hashes locales) — `git log --oneline | head -20`
    - .planning/standalone/crm-stage-integrity/RESEARCH.md §Assumptions Log, §Open Questions, §Anti-Patterns
  </read_first>
  <action>
    CREAR `.planning/standalone/crm-stage-integrity/LEARNINGS.md`:

    ```markdown
    # CRM Stage Integrity — Learnings

    **Shipped:** 2026-04 (replace con fecha real de Plan 05 merge)
    **Standalone path:** `.planning/standalone/crm-stage-integrity/`
    **Plans:** 01 (migration) → 02 (domain CAS + getAuthContext extension) → 03 (runner + kill-switch + exported helpers) → 04 (builder) → 05 (kanban + docs)

    ## Commits

    - Plan 01: `<hash>` — composite migration (order_stage_history + realtime ADD + flags seed)
    - Plan 02: `<hashes>` — domain CAS + callers + integration tests + .env.test.example + getAuthContext extended to return userId
    - Plan 03: `<hashes>` — runner concurrency + kill-switch + cascade_capped + action-executor plumbing + exported helpers (checkKillSwitch, logCascadeCap)
    - Plan 04: `<hashes>` — conditionsPreventActivation expandida + tests AND/OR + 9 operators
    - Plan 05: `<hashes>` — Kanban Realtime + handleMoveResult pure helper + vitest config env:'node' + docs + this file

    ## Patterns Established

    1. **Optimistic CAS idiom en Supabase JS v2:**
       ```typescript
       const { data: updated } = await supabase.from('table')
         .update(payload)
         .eq('id', x).eq('workspace_id', y).eq('stage_id', expected)  // CAS predicate
         .select('id')  // MANDATORIO para detectar affected=0
       if (!updated || updated.length === 0) { /* CAS rejected */ }
       ```
       Usar para cualquier columna que requiera serializacion sin schema change. NO usar `count: 'exact'` en UPDATE (unreliable). Precedent: `src/lib/agents/crm-writer/two-step.ts:140-155` (state machine UPDATE WHERE status='proposed').

    2. **Append-only audit ledger con doble guardia:**
       - RLS policy `FOR DELETE USING (false)` + `FOR UPDATE USING (false)` (cubre user roles).
       - Trigger plpgsql `BEFORE UPDATE/DELETE RAISE EXCEPTION` (cubre service_role bypass).
       Precedent en `supabase/migrations/<ts>_crm_stage_integrity.sql`.

    3. **Inngest stacked concurrency (v3 SDK):**
       ```typescript
       concurrency: [
         { key: 'event.data.workspaceId', limit: 5 },
         { key: 'event.data.orderId', limit: 1 },  // condicional per triggerType
       ]
       ```
       Max 2 scopes; FIFO guaranteed per key. **Nota:** El runner existing YA estaba definido como `concurrency: [{ ... }]` (array con 1 scope) — Plan 03 extiende ese array. No se migrate de scalar a array.

    4. **Feature flag gate con fail-closed (CAS) vs fail-open (kill-switch):**
       - CAS: fallback `false` = legacy path (safe regression-free rollout).
       - Kill-switch: fallback `false` + si query falla, retorna `{shouldSkip: false}` = automation corre (soft guard, no last line of defense).

    5. **Supabase Realtime + echo suppression via MutableRefObject:**
       - `recentMoveRef.current = true` durante optimistic update (timeout 2000ms).
       - Hook callback returns early si `recentMoveRef.current === true`.
       - NO agregar `ordersByStage` a useEffect deps (reconnect storm).
       - Reconnect resync: `if (status === 'SUBSCRIBED' && previousStatus !== 'SUBSCRIBED') onReconnect()`.

    6. **Pure helpers exportadas desde components para testability (WARNING 4 pattern):**
       - Extraer logica no-UI (state updates, side effects) a pure functions exportadas.
       - Ejemplos: `handleMoveResult(result, ctx)` en `kanban-board.tsx`, `checkKillSwitch(admin, orderId)` en `automation-runner.ts`.
       - Unit tests importan directamente — no requieren dnd-kit ni Inngest dev server ni jsdom.
       - Anti-pattern a evitar: tests placeholder que re-implementan la logica inline (0% coverage, no regression signal).

    7. **Per-file vitest environment opt-in (BLOCKER 4 pattern):**
       - Default env en `vitest.config.ts`: `environment: 'node'` (explicit, no default implicit).
       - Integration tests (DB, admin clients, file I/O) corren bajo Node nativo.
       - Component tests (React render, DOM queries) opt-in via comment al tope del file: `// @vitest-environment jsdom`.
       - Por que: un `environment: 'jsdom'` global rompe cualquier test que use libs Node-only (Supabase admin client lanza `ReferenceError: window is not defined` bajo jsdom).

    ## Pitfalls Encountered

    1. **`.update().eq().select()` array vs null:** PostgREST `return=representation` retorna `[]` cuando WHERE no matchea. Sin `.select()`, `data` es `null`. Cancel Pitfall 1 RESEARCH.
    2. **Same-stage drop = falso CAS reject si no se short-circuitea:** Pitfall 2.
    3. **History insert failure no debe romper move:** best-effort con `console.error`. Pitfall 3.
    4. **Inngest concurrency.key=null = unbounded:** validar presencia de `orderId` antes de emit. Pitfall 4.
    5. **React 19 StrictMode + Realtime cleanup:** `supabase.removeChannel(channel)` en return del useEffect mandatorio.
    6. **`actor_id uuid NULL` ambiguity:** `source` column es el discriminator. agents → NULL + actor_label string. Pitfall 10.
    7. **`getAuthContext` no exponia `userId` (BLOCKER 1 checker review):** el `user.id` ya estaba in-scope via `supabase.auth.getUser()` pero no se retornaba — Plan 02 lo extendio. Deuda tecnica residual: `actor_label` en server-action usa fallback `'user:' + userId.slice(0,8)` — follow-up para enriquecer con `workspace_members.full_name` join.
    8. **`requireMobileAuth` retorna `user` pero plan original asumia `session.userId` inexistente (BLOCKER 2 checker review):** el helper siempre retorno `{ user, workspaceId, membership }` — Plan 02 consume `user.id` directamente + usa label hardcoded `'mobile-api'`.
    9. **Inngest concurrency shape ya era array con 1 scope (BLOCKER 3 checker review):** el plan original asumia scalar object y lo reemplazaba; correccion — el edit debe EXTENDER el array existente con spread condicional.
    10. **Placeholder tests dan 0% module coverage (WARNING 3/4/6):** re-implementar logica inline en tests NO da regression signal. Patron correcto: exportar helpers puros + importar en tests.

    ## Rollout Guide

    **Post-deploy state:**
    - Ambos flags `crm_stage_integrity_cas_enabled` y `crm_stage_integrity_killswitch_enabled` = `false` (Regla 6 default).
    - Audit log `order_stage_history` SE POPULA desde primer move tras deploy (additive).
    - Concurrency per-orderId ACTIVA (no flag, additive).
    - Kanban Realtime ACTIVO (no flag, additive).

    **Step-by-step flip:**

    1. **Observar audit log por 24-48h:**
       ```sql
       SELECT source, COUNT(*), DATE_TRUNC('hour', changed_at) AS hour
       FROM order_stage_history
       WHERE changed_at > NOW() - INTERVAL '48 hours'
       GROUP BY source, hour
       ORDER BY hour DESC;
       ```
       Buscar: rows con `source='cascade_capped'` (indica loops que ya estan siendo truncados por cascade cap layer 3 — visible via history).

    2. **Flipear CAS en 1 workspace de staging/testing:**
       ```sql
       -- NOTA: platform_config key es global, NO per workspace.
       -- Para per-workspace test, crear un test workspace dedicado y flipear global.
       UPDATE platform_config SET value = 'true'::jsonb WHERE key = 'crm_stage_integrity_cas_enabled';
       ```
       Esperar 30-60s (cache TTL). Smoke test: mover 2 pedidos simultaneamente desde 2 browsers → uno debe recibir toast "pedido fue movido por otra fuente".

    3. **Si OK tras 1 semana:** dejar CAS activo globalmente. Si `stage_change_rejected_cas` events >1% de moves → investigar antes de rollout ampliado.

    4. **Flipear kill-switch tras CAS estabilizado:**
       ```sql
       UPDATE platform_config SET value = 'true'::jsonb WHERE key = 'crm_stage_integrity_killswitch_enabled';
       ```
       Smoke: crear automation circular de prueba (stage A → B → A cycle via 2 automations con condition complementaria) y disparar manualmente. Tras 5 cambios en 60s → kill-switch se dispara, warning en Vercel logs.

    5. **Rollback rapido** (si CAS causa false-positive rejections en uso normal):
       ```sql
       UPDATE platform_config SET value = 'false'::jsonb WHERE key = 'crm_stage_integrity_cas_enabled';
       ```
       Codigo queda inerte (legacy path). Investigar + fix + re-activar.

    ## Inngest Smoke Manual

    **D-08 automated coverage deferred pending inngest-test-engine evaluation** — esta seccion documenta el gate manual actual para verificar la serializacion FIFO per-orderId (WARNING 6 fix). El placeholder `stage-changed-concurrency.test.ts` del plan original fue eliminado (0% module coverage sin valor).

    **Procedimiento smoke manual:**

    1. Script `scripts/smoke-inngest-concurrency.ts`:
       ```typescript
       import { inngest } from '@/inngest/client'
       await Promise.all([
         inngest.send({ name: 'order.stage_changed', data: { orderId: 'X', workspaceId: 'W', previousStageId: 'A', newStageId: 'B', pipelineId: 'P' } }),
         inngest.send({ name: 'order.stage_changed', data: { orderId: 'X', workspaceId: 'W', previousStageId: 'A', newStageId: 'C', pipelineId: 'P' } }),
       ])
       ```
    2. Abrir Inngest Dashboard → Functions → `automation-order-stage-changed`.
    3. Observar: `running: 1`, `queued: 1` durante la ejecucion del primero. Tras ~2s, `running: 1`, `queued: 0`.
    4. Confirmar en logs Vercel que los 2 runs procesaron en orden FIFO.

    **Cuando se habilite coverage automatico:** evaluar `inngest-test-engine` (https://www.inngest.com/docs/reference/testing) en una phase futura. Crear `src/__tests__/integration/stage-changed-concurrency.test.ts` con tests reales que emitan eventos al Inngest test engine + assert-een `running`/`queued` counts.

    ## Open Questions / Follow-ups

    - **`stage-changed-concurrency` integration test** — NO existe actualmente (WARNING 6 fix). Sera creado cuando `inngest-test-engine` sea evaluado + adoptado.
    - **Full component drag-simulation tests** — actual coverage es via `handleMoveResult` pure function (WARNING 4). Una capa adicional con `@dnd-kit/test` o refactor del drag handler es follow-up opcional.
    - **`actor_label` display-name enrichment** — server action hoy usa fallback `'user:' + userId.slice(0,8)`. Follow-up: join con `workspace_members.full_name` o `users_profiles.full_name` para `actor_label` mas humano.
    - **Timeline UI** — `order_stage_history` populado habilita UI futura ("historial" tab en pedido sheet). Deferred per CONTEXT.md.
    - **Per-workspace feature flags** — `platform_config` es global. Para rollout per-workspace, agregar columna `workspace_id` a `platform_config` O crear tabla separada (`workspace_feature_flags`). Fuera de scope de este standalone.

    ## Anti-Patterns (evitar en futuras fases)

    - NO usar `count: 'exact'` para detectar affected rows en UPDATE — usar `.select('id')` + `data.length === 0`.
    - NO retries en domain layer tras CAS reject — caller decide UX.
    - NO `REPLICA IDENTITY FULL` para Realtime — cliente no necesita `payload.old`.
    - NO deps array con `ordersByStage` en Realtime useEffect — reconnect storm.
    - NO blocking del Inngest runner por history insert failure — best-effort.
    - NO placeholder tests que re-implementan logica inline — extraer helpers puros + importar en tests.
    - NO `environment: 'jsdom'` global en vitest.config — rompe integration tests Node-only. Usar per-file comment.
    ```

    Replace `<hash>` placeholders con los commit hashes reales cuando el plan se ejecute.
  </action>
  <verify>
    <automated>ls .planning/standalone/crm-stage-integrity/LEARNINGS.md</automated>
    <automated>grep -q "Commits" .planning/standalone/crm-stage-integrity/LEARNINGS.md</automated>
    <automated>grep -q "Patterns Established" .planning/standalone/crm-stage-integrity/LEARNINGS.md</automated>
    <automated>grep -q "Rollout Guide" .planning/standalone/crm-stage-integrity/LEARNINGS.md</automated>
    <automated>grep -q "CAS" .planning/standalone/crm-stage-integrity/LEARNINGS.md</automated>
    <automated>grep -q "Pitfalls Encountered" .planning/standalone/crm-stage-integrity/LEARNINGS.md</automated>
    <automated>grep -q "D-08 automated coverage deferred" .planning/standalone/crm-stage-integrity/LEARNINGS.md</automated>
    <automated>grep -q "per-file jsdom" .planning/standalone/crm-stage-integrity/LEARNINGS.md</automated>
    <automated>grep -q "Inngest Smoke Manual" .planning/standalone/crm-stage-integrity/LEARNINGS.md</automated>
  </verify>
  <acceptance_criteria>
    - `.planning/standalone/crm-stage-integrity/LEARNINGS.md` creado.
    - Secciones: Commits, Patterns Established (min 7 — incluyendo pure helpers pattern + per-file jsdom pattern), Pitfalls Encountered (min 10 — incluyendo los 4 del checker review: BLOCKER 1, BLOCKER 2, BLOCKER 3, WARNING 3/4/6), Rollout Guide (step-by-step con SQL), Inngest Smoke Manual (con nota explicita "D-08 automated coverage deferred pending inngest-test-engine evaluation" — WARNING 6), Open Questions, Anti-Patterns.
    - Commit hashes placeholders `<hash>` presentes (se rellenan al commitear este archivo).
    - Nota explicita del defer de D-08: `grep -q "D-08 automated coverage deferred" LEARNINGS.md` debe matchear.
  </acceptance_criteria>
  <done>
    - Commit atomico: `docs(crm-stage-integrity): add LEARNINGS with rollout guide + patterns + deferred D-08 note`
  </done>
</task>

<task type="auto">
  <name>Task 6: Push final a Vercel (Regla 1) + tests smoke</name>
  <read_first>
    - git status (confirmar staged: Tasks 1-5 commits presentes en local)
    - CLAUDE.md §Regla 1 (push antes de pedir pruebas)
  </read_first>
  <action>
    Push los commits acumulados de Plans 04 y 05 (Plan 04 se defer-eo per plan) a origin:

    ```bash
    git push origin main
    ```

    Esperar que Vercel complete el build (monitorear dashboard). Build debe pasar porque:
    - Todos los cambios son additive o controlados por flag.
    - `npx tsc --noEmit` local ya paso.
    - Cambios en `vitest.config.ts` son dev-only (no impactan prod bundle).

    Post-deploy, smoke checks automatizables:
    - Vercel Log Explorer: busca `[kill-switch]` warnings (flag OFF → no deberian aparecer; si aparecen = flag prematuramente flipeado).
    - Vercel Log Explorer: busca `[moveOrderToStage] history insert failed` (tolerable bajo carga normal, <0.1%).
    - Query en Supabase:
      ```sql
      SELECT COUNT(*) FROM order_stage_history WHERE changed_at > NOW() - INTERVAL '1 hour';
      ```
      Esperado: >0 (audit log activo).

    Tests suite completo (si la infra lo permite):
    ```bash
    npm test -- --run
    ```
    Expected: todos los tests PASS o skipped apropiadamente (integration tests requieren env vars).
  </action>
  <verify>
    <automated>git log --oneline -10 | head -10</automated>
    <automated>git status | grep -qE "(Your branch is up to date|ahead of)"</automated>
  </verify>
  <acceptance_criteria>
    - Push a origin/main ejecutado.
    - Vercel build OK (confirmar manualmente).
    - Smoke queries post-deploy (audit log poblado en la ultima hora) opcionales pero recomendadas.
  </acceptance_criteria>
  <done>
    - Push confirmado.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 7: Checkpoint humano — QA rollout gradual flags en staging workspace (Regla 6)</name>
  <read_first>
    - .planning/standalone/crm-stage-integrity/LEARNINGS.md §Rollout Guide
    - CLAUDE.md §Regla 6 (proteger agente en produccion — decidir activacion)
    - .planning/standalone/crm-stage-integrity/CONTEXT.md §Decisions D-17, D-20 (flags default false)
  </read_first>
  <what-built>
    Todo el codigo + docs del standalone esta deployed. Ambos flags (`crm_stage_integrity_cas_enabled`, `crm_stage_integrity_killswitch_enabled`) estan en `false` por default (Regla 6). La maquinaria esta operativa, pero el fix ESTA EN MODO OBSERVATIONAL:
    - Audit log ACTIVO desde primer move post-deploy (sin flag).
    - Cascade_capped audit ACTIVO desde primera truncation post-deploy (sin flag).
    - Inngest concurrency per-orderId ACTIVA (sin flag).
    - Kanban Realtime ACTIVO (sin flag).
    - Kanban toast para `stage_changed_concurrently` LISTO pero solo se dispara cuando CAS flag=true + CAS reject real.
    - Builder cycle detection mejorada ACTIVA (sin flag).

    Falta la decision del usuario:
    1. Observar telemetria 24-48h.
    2. Flipear CAS flag en un workspace de staging/testing.
    3. Smoke test: mover pedidos simultaneos desde 2 browsers → ver toast + row en history.
    4. Flipear kill-switch flag + smoke de automation circular.
    5. Decidir rollout ampliado O rollback via flag flip.

    Este checkpoint es el handoff Claude → usuario. Claude no flipea flags autonomamente (Regla 6).
  </what-built>
  <how-to-verify>
    **Paso 1 — Observacion pre-flip (24-48h recomendado, minimo 1h):**

    Abrir Supabase SQL Editor production, correr:

    ```sql
    -- Audit log activo (debe haber rows)
    SELECT source, COUNT(*), MIN(changed_at), MAX(changed_at)
    FROM order_stage_history
    WHERE changed_at > NOW() - INTERVAL '1 hour'
    GROUP BY source
    ORDER BY source;
    ```

    Esperado: `manual` (Kanban drags), posiblemente `automation`, idealmente 0 `cascade_capped` en uso normal (si aparece ahora = el bug ocurrio y fue truncado — documentar para analisis).

    **Paso 2 — Flipear CAS flag:**

    ```sql
    UPDATE platform_config SET value = 'true'::jsonb
    WHERE key = 'crm_stage_integrity_cas_enabled';
    ```

    Esperar 30-60 segundos (Pitfall 11 cache TTL, cada Vercel lambda refresh-ea a su ritmo).

    **Paso 3 — Smoke test manual CAS:**

    1. Abrir 2 browsers (o 2 tabs) con la misma cuenta + mismo pipeline.
    2. En ambos, arrastrar el mismo pedido a un stage diferente casi simultaneamente.
    3. Uno debe success + el pedido aparece en su destino.
    4. El otro debe mostrar toast: "Este pedido fue movido por otra fuente. Actualizando..." + el pedido vuelve a su posicion correcta tras ~1s (Realtime reconcile).

    Si esto NO ocurre:
    - Verifica `SELECT value FROM platform_config WHERE key='crm_stage_integrity_cas_enabled'` → debe ser `true`.
    - Revisa Vercel logs por `stage_change_rejected_cas` warnings.
    - Si sin warnings, el flag cache puede no haber expirado — esperar 30s mas o forzar redeploy.

    **Paso 4 — Verificar audit log tras smoke:**

    ```sql
    SELECT * FROM order_stage_history
    WHERE order_id = '<el-pedido-del-smoke>'
    ORDER BY changed_at DESC
    LIMIT 5;
    ```

    Esperado: 1 row con `source='manual'` (el move que hizo success). El CAS reject NO genera row de history (D-12 — history solo tras UPDATE exitoso).

    **Paso 5 — Flipear kill-switch + smoke (OPCIONAL en este checkpoint, recomendado):**

    ```sql
    UPDATE platform_config SET value = 'true'::jsonb
    WHERE key = 'crm_stage_integrity_killswitch_enabled';
    ```

    Crear automation circular de prueba:
    - Automation 1: trigger `order.stage_changed` stage A → action `change_stage` to B.
    - Automation 2: trigger `order.stage_changed` stage B → action `change_stage` to A.

    Mover un pedido de C (cualquier otro stage) a A. Esperar ~30s. Observar:
    - Si cycle-detection capa 1 (build-time) catcheo: el builder rechaza la 2da automation con warning al guardar.
    - Si capa 2 (kill-switch): tras 5 cambios en 60s sobre el mismo pedido, warning `[kill-switch]` en Vercel logs + runner retorna `skipped: 'kill_switch_triggered'`.
    - Si capa 3 (cascade cap): depth=3 alcanzado → row en history con `source='cascade_capped'`.

    Query para verificar:
    ```sql
    SELECT source, cascade_depth, actor_label, changed_at
    FROM order_stage_history
    WHERE order_id = '<pedido-de-prueba>'
    ORDER BY changed_at DESC;
    ```

    **Paso 6 — Decidir estado final:**

    **Opcion A — Rollout completo:** dejar ambos flags en `true`. Documentar en SUMMARY que el standalone esta en produccion full.

    **Opcion B — Rollout gradual:** dejar CAS `true` (estabilizado), kill-switch `true`. Observar por 1-2 semanas.

    **Opcion C — Rollback:** si smoke del Paso 3 fallo o hay false-positives masivos, flipear flags a `false`:
    ```sql
    UPDATE platform_config SET value = 'false'::jsonb
    WHERE key IN ('crm_stage_integrity_cas_enabled', 'crm_stage_integrity_killswitch_enabled');
    ```
    Codigo queda inerte (legacy paths). Reportar a Claude para diagnosis — NO requiere revert del codigo.

    **Paso 7 — Limpiar automations de prueba (si se crearon en Paso 5):**

    Eliminar las 2 automations circulares del builder UI. NO dejarlas activas en produccion.
  </how-to-verify>
  <acceptance_criteria>
    - Usuario confirma observacion del audit log pre-flip (al menos 1 query ejecutada).
    - Usuario reporta resultado del smoke test CAS: toast aparece O no aparece (si no, Claude debuggea).
    - Usuario decide estado final de los 2 flags: A (ambos true), B (gradual), o C (ambos false rollback).
    - Si Opcion C: usuario documenta que problema encontro.
    - Si Opcion A o B: usuario confirma automations de prueba limpias.
    - Usuario escribe "QA aprobado" o equivalente + estado final de flags + decision de rollout.
  </acceptance_criteria>
  <resume-signal>
    Escribe "QA aprobado" + el estado final de cada flag (por ejemplo: "cas_enabled=true, killswitch_enabled=true, ambos flipeados y smoke paso").

    Si algo fallo: "QA fallo: [descripcion]". Claude NO hara rollback de codigo (no hay razon — codigo con flag=false es inerte). Solo analizara el problema y propondra fix.
  </resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser client → Supabase Realtime | Untrusted channel; RLS filters events at server; client must NOT trust payload.pipeline_id without re-validation |
| Browser client → Server Action | Untrusted user input; server action validates auth + workspace membership |
| Inngest event bus → Runner | Trusted (events emitted internally by domain via emitOrderStageChanged); but event.data.orderId must be validated (Pitfall 4) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-csi-01 | Information Disclosure | Supabase Realtime broadcast to client | mitigate | Filter `pipeline_id=eq.${pipelineId}` + RLS on `orders` enforces workspace isolation at DB level. Client-side defensive check `updated.pipeline_id !== pipelineId` as second guard. |
| T-csi-02 | Tampering | Kanban optimistic update | mitigate | Server CAS rejects stale writes; UI shows toast + reverts via Realtime reconcile (D-15). |
| T-csi-03 | Repudiation | Deleted stage history for dispute resolution | mitigate | Append-only trigger `prevent_order_stage_history_mutation` RAISES EXCEPTION on UPDATE/DELETE incluso con service_role (Pattern 4). |
| T-csi-04 | Denial of Service | Cascade loops exhausting Inngest quota | mitigate | 3 capas: build-time detection (Plan 04) + runtime kill-switch >5/60s (Plan 03) + cascade cap depth=3 (existing + cascade_capped audit Plan 03). |
| T-csi-05 | Tampering | Flag cache staleness allowing CAS bypass | accept | 30s TTL documented as runbook item. Acceptable for gradual rollout — worst case: 30s window of mixed behavior. Low impact (toast vs no-toast UX, data integrity preserved either way). |

All threats applicable to this phase have explicit dispositions. No transfer items (no external integrations added beyond existing Supabase/Inngest).
</threat_model>

<verification>
- `vitest.config.ts` extendido con `environment: 'node'` explicit (BLOCKER 4).
- `src/hooks/use-kanban-realtime.ts` existe con hook exportado.
- `kanban-board.tsx` consume el hook con callbacks memoizados + EXPORTA `handleMoveResult` pure function (WARNING 4) + usa `handleMoveResult` en handleDragEnd.
- `src/app/(dashboard)/crm/pedidos/components/__tests__/handle-move-result.test.ts` importa y testea `handleMoveResult` directamente — regression signal real (WARNING 4).
- `src/__tests__/integration/stage-changed-concurrency.test.ts` NO existe (WARNING 6 — placeholder eliminado).
- Integration tests de Plan 02 corren bajo Node env sin `window is not defined` leakage (BLOCKER 4 validated).
- `.claude/rules/agent-scope.md` §CRM Writer Bot tiene entry de error contract.
- `docs/analysis/04-estado-actual-plataforma.md` refleja shipped del standalone.
- `LEARNINGS.md` del standalone creado con rollout guide + "D-08 automated coverage deferred pending inngest-test-engine evaluation" nota (WARNING 6).
- Push a Vercel OK + Vercel build verde.
- QA checkpoint humano completado + estado final de flags declarado por el usuario.
</verification>

<success_criteria>
- Kanban muestra actualizaciones Realtime de otras fuentes (<1s) cuando otro cliente/agent mueve un pedido.
- CAS reject → toast "pedido fue movido por otra fuente" + UI reconcilia tras 1-2s.
- `stage_changed_concurrently` error contract documentado para agents y humanos.
- Unit test de `handleMoveResult` da regression signal real al cambio de comportamiento (WARNING 4).
- Vitest config no rompe integration tests de Plan 02 (BLOCKER 4).
- Regla 4 cumplida (docs sync).
- Regla 6 cumplida (QA humano decide flags).
- Standalone `crm-stage-integrity` shipped + documentado + operativo con rollout controlado.
</success_criteria>

<output>
After completion, create `.planning/standalone/crm-stage-integrity/05-SUMMARY.md` + `SUMMARY.md` top-level documenting:

**05-SUMMARY.md:**
- Commit hashes: Task 1 (hook + Kanban + handleMoveResult export), Task 2 (vitest config + test), Task 3 (scope doc), Task 4 (platform doc), Task 5 (LEARNINGS), Task 6 (push)
- Archivos modificados: 7 archivos (hook new, kanban-board.tsx, vitest.config.ts extended, handle-move-result.test.ts new, agent-scope.md, 04-estado-actual-plataforma.md, LEARNINGS.md)
- Vercel build status + URL deploy
- Output del QA checkpoint (Task 7): fecha + estado final de cada flag + decision usuario A/B/C
- Observability checks post-deploy: query output de `SELECT source, COUNT(*) FROM order_stage_history GROUP BY source` + cualquier `stage_change_rejected_cas` warning count

**SUMMARY.md (standalone top-level — NEW):**
- Resumen ejecutivo del standalone (5 capas)
- Links a los 5 SUMMARYs de cada plan
- Estado final de flags post-QA
- Incidente reportado (2026-04-21 "pedidos se devuelven") → resuelto [SI/NO — dependera de observacion post-flip]
- Proximos pasos: observation window (semanas) + potential follow-ups (timeline UI, per-workspace flags, inngest-test-engine integration)
</output>
</content>

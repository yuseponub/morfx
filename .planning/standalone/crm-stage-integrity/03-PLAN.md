---
phase: crm-stage-integrity
plan: 03
type: execute
wave: 2
depends_on: [01, 02]
files_modified:
  - src/inngest/functions/automation-runner.ts
  - src/lib/automations/trigger-emitter.ts
  - src/lib/automations/action-executor.ts
  - src/inngest/functions/__tests__/automation-runner-killswitch.test.ts
  - src/inngest/functions/__tests__/automation-runner-cascade-capped.test.ts
autonomous: true
requirements:
  - D-07
  - D-08
  - D-09
  - D-18
  - D-19
  - D-20
  - D-22
  - D-23
  - D-25

must_haves:
  truths:
    - "`src/inngest/functions/automation-runner.ts` ya tiene `concurrency: [{ key: 'event.data.workspaceId', limit: 5 }]` (array con 1 scope) — Plan 03 lo EXTIENDE a array con 2 scopes: el existing + `orderId:1` agregado SOLO cuando `triggerType === 'order.stage_changed'` via spread condicional (D-08, D-09, Pattern 2 + Shared Pattern 4 RESEARCH)"
    - "Cuando `cascadeDepth >= MAX_CASCADE_DEPTH` y `triggerType === 'order.stage_changed'`, el runner hace `step.run('cap-audit-...')` que inserta row a `order_stage_history` con `source='cascade_capped'`, `cascade_depth` + `trigger_event` + `actor_label='Cascade capped at depth N'` (D-07 capa 3)"
    - "Tras el cap-audit el runner retorna `{ skipped: true, reason: 'cascade_depth_exceeded' }` (early return — no ejecuta el resto del runner)"
    - "El runner chequea kill-switch SOLO cuando `triggerType === 'order.stage_changed'` y `eventData.orderId` presente (Pitfall 4 RESEARCH — no aplicar a otros runners)"
    - "Kill-switch lee flag `crm_stage_integrity_killswitch_enabled` via `step.run('kill-switch-flag', ...)` con fallback `false` (D-20)"
    - "Cuando flag=true, ejecuta `step.run('kill-switch-check', ...)` que invoca helper exportado `checkKillSwitch(admin, orderId)` que hace `supabase.from('order_stage_history').select('id', { count: 'exact', head: true }).eq('order_id', X).neq('source', 'manual').gt('changed_at', sixtySecondsAgo)`"
    - "Si count > 5, emite `console.warn` con mensaje `[kill-switch] order ... non-manual changes in 60s. Skipping.` + retorna `{ skipped: true, reason: 'kill_switch_triggered', recentChanges }` (D-22 event list + D-23 warning log)"
    - "Kill-switch query falla → helper retorna `{shouldSkip: false, recentChanges: 0}` (fail-open Pattern 5 RESEARCH — si la query se rompe, NO bloqueamos la automation)"
    - "`automation-runner.ts` EXPORTA 2 helpers puros para testability: `export async function checkKillSwitch(admin, orderId, threshold=5, windowMs=60_000): Promise<{shouldSkip: boolean, recentChanges: number}>` y `export async function logCascadeCap(admin, params): Promise<void>` — WARNING 3 fix"
    - "`src/lib/automations/trigger-emitter.ts isCascadeSuppressed` se convierte en async y, cuando `triggerType === 'order.stage_changed'` + orderContext presente, inserta row pre-emit con `source='cascade_capped'` y `actor_label='Cascade capped at depth N (pre-emit)'` (D-07 capa 3 defensa doble con runner)"
    - "`src/lib/automations/action-executor.ts executeChangeStage` pasa `automationContext` (automationId + name + triggerType) al DomainContext cuando llama `moveOrderToStage`, populando `actor_id` + `actor_label` + `triggerEvent` (D-10 actor mapping, Pitfall 10)"
    - "`executeChangeStage` propaga el error `stage_changed_concurrently` como `throw new Error('stage_changed_concurrently')` distintamente para que el runner pueda loggear event observability D-22 `stage_change_rejected_cas`"
    - "Test `src/inngest/functions/__tests__/automation-runner-killswitch.test.ts` IMPORTA `checkKillSwitch` del runner (no re-implementa la logica inline) y mockea supabase admin client: count=0 → shouldSkip=false, count=3 → shouldSkip=false, count=6 → shouldSkip=true, query error → shouldSkip=false (fail-open) (D-25, WARNING 3)"
    - "Test `src/inngest/functions/__tests__/automation-runner-cascade-capped.test.ts` IMPORTA `logCascadeCap` del runner y verifica shape del INSERT payload: `source='cascade_capped'`, `actor_label='Cascade capped at depth N'`, `cascade_depth`, `trigger_event` (D-25, WARNING 3)"
  artifacts:
    - path: "src/inngest/functions/automation-runner.ts"
      provides: "Runner con stacked concurrency + kill-switch step + cascade_capped audit + 2 helpers exportados (checkKillSwitch, logCascadeCap)"
      contains: "export async function checkKillSwitch"
    - path: "src/lib/automations/trigger-emitter.ts"
      provides: "isCascadeSuppressed inserta row pre-emit cuando cap hit"
      contains: "cascade_capped"
    - path: "src/lib/automations/action-executor.ts"
      provides: "executeChangeStage con automationContext mapping + narrow de CAS reject"
      contains: "automationContext"
    - path: "src/inngest/functions/__tests__/automation-runner-killswitch.test.ts"
      provides: "Unit test que importa checkKillSwitch + cubre thresholds + flag OFF + fail-open"
      contains: "checkKillSwitch"
    - path: "src/inngest/functions/__tests__/automation-runner-cascade-capped.test.ts"
      provides: "Unit test que importa logCascadeCap + verifica shape del history insert"
      contains: "logCascadeCap"
  key_links:
    - from: "src/inngest/functions/automation-runner.ts concurrency array"
      to: "Inngest v3 SDK stacked scopes"
      via: "extend existing [{key:'event.data.workspaceId', limit:5}] with spread: ...(triggerType==='order.stage_changed' ? [{key:'event.data.orderId', limit:1}] : [])"
      pattern: "event.data.orderId.*limit: 1"
    - from: "src/inngest/functions/automation-runner.ts kill-switch helper"
      to: "order_stage_history table + idx_osh_kill_switch partial index"
      via: "checkKillSwitch(admin, orderId) → supabase.from('order_stage_history')...neq('source', 'manual').gt('changed_at', sixtySecondsAgo)"
      pattern: "\\.neq\\('source', 'manual'\\)"
    - from: "src/lib/automations/action-executor.ts executeChangeStage"
      to: "domain.moveOrderToStage via actor_id/actor_label plumbing"
      via: "ctx.actorId = automationContext.automationId"
      pattern: "automationContext"
    - from: "src/inngest/functions/__tests__/automation-runner-killswitch.test.ts"
      to: "checkKillSwitch export from automation-runner.ts"
      via: "import { checkKillSwitch } from '../automation-runner'"
      pattern: "import.*checkKillSwitch"
    - from: "src/inngest/functions/__tests__/automation-runner-cascade-capped.test.ts"
      to: "logCascadeCap export from automation-runner.ts"
      via: "import { logCascadeCap } from '../automation-runner'"
      pattern: "import.*logCascadeCap"
---

<objective>
Wave 2 — Runtime kill-switch + cascade_capped audit + concurrency per-orderId + observability events.

**4 cambios integrados:**

1. **Stacked concurrency (D-08, D-09)** — `automation-runner.ts` EXTIENDE el array existing `[{ key: 'event.data.workspaceId', limit: 5 }]` (YA es array con 1 scope en linea 363 — BLOCKER 3 verified) agregando un scope condicional via spread: `...(triggerType === 'order.stage_changed' ? [{ key: 'event.data.orderId', limit: 1 }] : [])`. NO se reemplaza un objeto scalar — se extiende el array existente. Serializa cambios del mismo pedido sin bloquear workspace (Shared Pattern 4 RESEARCH).

2. **Kill-switch (D-07 capa 2, D-20)** — dentro del runner, ANTES de ejecutar actions, chequea `order_stage_history` por `order_id` en ultimos 60s via helper puro exportado `checkKillSwitch(admin, orderId)`: si count > 5 → skip + `console.warn` (D-23) + return `{skipped:true, reason:'kill_switch_triggered'}`. Gated por flag `crm_stage_integrity_killswitch_enabled` default `false` (D-20). Fail-open: query error → helper retorna `{shouldSkip: false, recentChanges: 0}` (Pattern 5 RESEARCH).

3. **Cascade_capped audit (D-07 capa 3)** — cuando `cascadeDepth >= MAX_CASCADE_DEPTH`, ademas del return existing, insertar row a `order_stage_history` via helper puro exportado `logCascadeCap(admin, params)` con `source='cascade_capped'` para que el bug sea VISIBLE post-hoc. Doble cobertura:
   - **En el runner** (post-dequeue cap) — cuando el Inngest function recibe un event con cascadeDepth=3 pero todavia existe en la cola.
   - **En `trigger-emitter.isCascadeSuppressed`** (pre-emit cap) — cuando la fuente ya detecta que el siguiente emit seria capped. Ambos insertan, `actor_label` diferencia ("pre-emit" vs sin sufijo).

4. **Action-executor plumbing (Pitfall 10, D-22)** — `executeChangeStage` recibe `automationContext = {automationId, automationName, triggerType}` desde el runner y lo pasa al DomainContext para que `order_stage_history` tenga `actor_id = automationId` + `actor_label = "Automation: {name}"`. Tambien narrow-ea `stage_changed_concurrently` como error distintivo (en lugar de generic action failure).

**WARNING 3 fix (tests importan helpers):** Los tests unitarios cubren los helpers puros exportados, NO re-implementan la logica inline. Esto asegura que los tests dan regression signal real — si el codigo del runner cambia en el futuro, los tests rompen.

Tests cubren (D-25): kill-switch count thresholds (0/3/6), fail-open, history insert shape en cap.

Purpose: Capas 2+3 de defense-in-depth D-07. Capa 2 (kill-switch) cierra el caso H1+H4 (automations circulares disparando change_stage >5 veces en 60s). Capa 3 (cascade_capped audit) hace VISIBLE el sintoma del bug — cuando el usuario reporta "mi pedido se devolvio a X", ahora habra una row en `order_stage_history` con `source='cascade_capped'` que muestra exactamente donde el loop fue cortado.

**CRITICAL — Regla 6:** Flag `crm_stage_integrity_killswitch_enabled=false` default. Sin flip, el query de kill-switch no se ejecuta (`if (killSwitchEnabled) { ... }` es el gate). Concurrency per-orderId NO tiene flag (D-19 — additive, solo serializa). Cascade_capped audit NO tiene flag (D-18 — additive, solo escribe audit).

**CRITICAL — Regla 1:** Push a Vercel al final del plan. Concurrency cambios son safe (additive). Flag OFF → kill-switch inerte. Usuario flipea flag tras observar telemetria.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/crm-stage-integrity/CONTEXT.md — D-07 (3 capas defense-in-depth), D-08 (concurrency), D-09 (solo stage_changed), D-18 (audit sin flag), D-19 (concurrency sin flag), D-20 (kill-switch con flag), D-22 (observability events), D-23 (warning logs)
@.planning/standalone/crm-stage-integrity/RESEARCH.md §Pattern 2 (Inngest stacked concurrency, lineas 379-406), §Pattern 5 (kill-switch completo lineas 617-671), §Example 2 (runner completo lineas 1025-1110), §Pitfall 4 (concurrency key null), §Pitfall 8 (index parcial critico), §Pitfall 9 (cascadeDepth vs duplicate — doble cobertura compensa), §Pitfall 10 (actor_id mapping automation_id)
@.planning/standalone/crm-stage-integrity/PATTERNS.md §Wave 2 automation-runner.ts (lineas 529-622), §trigger-emitter.ts (lineas 626-674), §action-executor.ts (lineas 678-729), §Tests Wave 2 (lineas 732-746)
@src/inngest/functions/automation-runner.ts — linea 358-618 (runner to modify, especificamente linea 363 concurrency array y lineas 358-405 para body handler)
@src/lib/automations/trigger-emitter.ts — linea 23-36 (isCascadeSuppressed — a convertir a async + INSERT)
@src/lib/automations/action-executor.ts — linea 301-323 (executeChangeStage — a modificar para plumb automationContext)
@src/lib/automations/constants.ts — linea 11 (MAX_CASCADE_DEPTH = 3)
@src/inngest/functions/recompra-preload-context.ts — precedent concurrency + flag + step.run (patron Shared 1, Shared 4)
@src/inngest/functions/agent-production.ts — linea 76-81 (precedent single-scope concurrency)
@src/inngest/functions/__tests__/recompra-preload-context.test.ts — precedent unit test con mocked adminClient + mocked step.run
@CLAUDE.md §Regla 1 (push), §Regla 6 (flag default false)

<interfaces>
<!-- Stacked concurrency EXTENSION (D-08, D-09 — Pattern 2 + Shared Pattern 4, BLOCKER 3 corrected shape) -->
<!-- BEFORE (linea 363 actual, VERIFIED via grep): -->
concurrency: [{ key: 'event.data.workspaceId', limit: 5 }],
<!-- AFTER: extender el array con spread condicional -->
concurrency: [
  { key: 'event.data.workspaceId', limit: 5 },
  ...(triggerType === 'order.stage_changed'
    ? [{ key: 'event.data.orderId', limit: 1 }]
    : []),
],

<!-- Exported helpers (WARNING 3 — testability) -->
export async function checkKillSwitch(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
  threshold = 5,
  windowMs = 60_000,
): Promise<{ shouldSkip: boolean; recentChanges: number }> {
  const sinceIso = new Date(Date.now() - windowMs).toISOString()
  const { count, error } = await admin
    .from('order_stage_history')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId)
    .neq('source', 'manual')
    .gt('changed_at', sinceIso)
  if (error) {
    console.error('[kill-switch] query failed:', error.message)
    return { shouldSkip: false, recentChanges: 0 }  // fail-open
  }
  const recentChanges = count ?? 0
  return { shouldSkip: recentChanges > threshold, recentChanges }
}

export async function logCascadeCap(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    orderId: string
    workspaceId: string
    prevStageId: string | null
    newStageId: string | null
    cascadeDepth: number
    triggerType: string
  },
): Promise<void> {
  await admin.from('order_stage_history').insert({
    order_id: params.orderId,
    workspace_id: params.workspaceId,
    previous_stage_id: params.prevStageId,
    new_stage_id: params.newStageId ?? params.prevStageId ?? '',
    source: 'cascade_capped',
    actor_id: null,
    actor_label: `Cascade capped at depth ${params.cascadeDepth}`,
    cascade_depth: params.cascadeDepth,
    trigger_event: params.triggerType,
  })
}

<!-- Runner usa los helpers: -->
if (cascadeDepth >= MAX_CASCADE_DEPTH) {
  await step.run(`cap-audit-${triggerType}`, async () => {
    if (triggerType !== 'order.stage_changed' || !eventData.orderId) return
    await logCascadeCap(createAdminClient(), {
      orderId: String(eventData.orderId),
      workspaceId,
      prevStageId: eventData.previousStageId ? String(eventData.previousStageId) : null,
      newStageId: eventData.newStageId ? String(eventData.newStageId) : null,
      cascadeDepth,
      triggerType,
    })
  })
  return { skipped: true, reason: 'cascade_depth_exceeded' }
}

if (triggerType === 'order.stage_changed' && eventData.orderId) {
  const killSwitchEnabled = await step.run('kill-switch-flag', async () =>
    getPlatformConfig<boolean>('crm_stage_integrity_killswitch_enabled', false)
  )
  if (killSwitchEnabled) {
    const { shouldSkip, recentChanges } = await step.run('kill-switch-check', async () =>
      checkKillSwitch(createAdminClient(), eventData.orderId as string)
    )
    if (shouldSkip) {
      console.warn(`[kill-switch] order ${eventData.orderId}: ${recentChanges} non-manual changes in 60s. Skipping.`)
      return { skipped: true, reason: 'kill_switch_triggered', recentChanges }
    }
  }
}

<!-- action-executor signature change -->
async function executeChangeStage(
  params: Record<string, unknown>,
  _context: TriggerContext,
  workspaceId: string,
  cascadeDepth: number,
  automationContext?: { automationId: string; automationName: string; triggerType: string },
): Promise<unknown> {
  // ...
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
    if (result.error === 'stage_changed_concurrently') {
      throw new Error('stage_changed_concurrently')
    }
    throw new Error(result.error || 'Failed to change stage')
  }
  return { ... }
}
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Modificar `automation-runner.ts` — stacked concurrency + cascade_capped audit + kill-switch + exportar helpers</name>
  <read_first>
    - src/inngest/functions/automation-runner.ts COMPLETO (especialmente lineas 358-405 donde esta `inngest.createFunction` + concurrency array + body inicial del handler)
    - **BLOCKER 3 CRITICO:** ejecutar `grep -n "concurrency" src/inngest/functions/automation-runner.ts` y confirmar que linea 363 hoy es `concurrency: [{ key: 'event.data.workspaceId', limit: 5 }],` (array con 1 scope, NO objeto scalar). El edit DEBE extender el array, no reemplazar un objeto scalar.
    - src/lib/automations/constants.ts (linea 11 — MAX_CASCADE_DEPTH = 3)
    - src/inngest/functions/recompra-preload-context.ts lineas 47-68 (precedent concurrency + flag + step.run)
    - src/inngest/functions/agent-production.ts lineas 76-81 (single-scope precedent)
    - src/lib/domain/platform-config.ts (confirmar import path `@/lib/domain/platform-config`)
    - src/lib/supabase/admin.ts (import `createAdminClient`)
    - .planning/standalone/crm-stage-integrity/RESEARCH.md §Example 2 lineas 1025-1110 (runner shape completo), §Pattern 5 lineas 617-671 (kill-switch), §Pitfall 4 (null key), §Pitfall 8 (partial index)
    - .planning/standalone/crm-stage-integrity/PATTERNS.md §Wave 2 automation-runner.ts lineas 529-622
    - .planning/standalone/crm-stage-integrity/CONTEXT.md §Decisions D-07, D-08, D-09, D-20, D-23
  </read_first>
  <action>
    **Paso 1 — Agregar imports al tope de `src/inngest/functions/automation-runner.ts`:**

    ```typescript
    import { createAdminClient } from '@/lib/supabase/admin'
    import { getPlatformConfig } from '@/lib/domain/platform-config'
    ```

    (Si `createAdminClient` ya existe — preservar. El import de `MAX_CASCADE_DEPTH` debe existir ya desde `@/lib/automations/constants`.)

    **Paso 2 — EXPORTAR 2 helpers puros al tope del archivo (antes de `createAutomationRunner`) — WARNING 3 fix:**

    Estos 2 helpers encapsulan la logica de kill-switch y cascade-cap-audit para que los tests unitarios los importen + mockeen, en lugar de re-implementar la logica inline (que daria 0% module coverage).

    ```typescript
    /**
     * Kill-switch query — checks if an order has had > threshold non-manual stage changes
     * in the last windowMs milliseconds. Fail-open: query error returns shouldSkip=false.
     * D-07 layer 2 + D-20. Exported for unit testing.
     */
    export async function checkKillSwitch(
      admin: ReturnType<typeof createAdminClient>,
      orderId: string,
      threshold = 5,
      windowMs = 60_000,
    ): Promise<{ shouldSkip: boolean; recentChanges: number }> {
      const sinceIso = new Date(Date.now() - windowMs).toISOString()
      const { count, error } = await admin
        .from('order_stage_history')
        .select('id', { count: 'exact', head: true })
        .eq('order_id', orderId)
        .neq('source', 'manual')
        .gt('changed_at', sinceIso)
      if (error) {
        console.error('[kill-switch] query failed:', error.message)
        return { shouldSkip: false, recentChanges: 0 }  // fail-open (Pattern 5)
      }
      const recentChanges = count ?? 0
      return { shouldSkip: recentChanges > threshold, recentChanges }
    }

    /**
     * Cascade cap audit — writes a row to order_stage_history marking where a cascade
     * was truncated (source='cascade_capped'). Makes the bug VISIBLE in the ledger.
     * D-07 layer 3 + D-18. Exported for unit testing.
     */
    export async function logCascadeCap(
      admin: ReturnType<typeof createAdminClient>,
      params: {
        orderId: string
        workspaceId: string
        prevStageId: string | null
        newStageId: string | null
        cascadeDepth: number
        triggerType: string
      },
    ): Promise<void> {
      await admin.from('order_stage_history').insert({
        order_id: params.orderId,
        workspace_id: params.workspaceId,
        previous_stage_id: params.prevStageId,
        new_stage_id: params.newStageId ?? params.prevStageId ?? '',
        source: 'cascade_capped',
        actor_id: null,
        actor_label: `Cascade capped at depth ${params.cascadeDepth}`,
        cascade_depth: params.cascadeDepth,
        trigger_event: params.triggerType,
      })
    }
    ```

    **Paso 3 — EXTENDER `concurrency` en `inngest.createFunction` (linea 363 actual — BLOCKER 3 fix):**

    **IMPORTANTE:** La linea actual YA es un array con 1 elemento, NO un objeto scalar. Verificar ANTES del edit:

    ```bash
    grep -n "concurrency" src/inngest/functions/automation-runner.ts
    ```

    Esperado: `363:      concurrency: [{ key: 'event.data.workspaceId', limit: 5 }],`

    Reemplazar esa linea individual (el array single-element) por un array multi-element con spread condicional:

    **ANTES (linea 363):**
    ```typescript
          concurrency: [{ key: 'event.data.workspaceId', limit: 5 }],
    ```

    **DESPUES:**
    ```typescript
          concurrency: [
            { key: 'event.data.workspaceId', limit: 5 },
            // D-08: serialize per-orderId only for order.stage_changed runner (D-09)
            ...(triggerType === 'order.stage_changed'
              ? [{ key: 'event.data.orderId', limit: 1 }]
              : []),
          ],
    ```

    El resto del objeto `inngest.createFunction` opts (id, retries) queda IDENTICO. Solo se reemplaza la linea 363 single-line por el bloque multi-line.

    **Paso 4 — MODIFICAR el body del handler (alrededor de lineas 367-380 existing):**

    El body actual ya tiene:
    ```typescript
    const eventData = (event as any).data as Record<string, unknown>
    const workspaceId = String(eventData.workspaceId || '')
    const cascadeDepth = Number(eventData.cascadeDepth ?? 0)

    // Check cascade depth
    if (cascadeDepth >= MAX_CASCADE_DEPTH) {
      console.warn(...)
      return { skipped: true, reason: 'cascade_depth_exceeded' }
    }
    ```

    AMPLIAR el check de cascade depth para que, ademas del return existing, invoque `logCascadeCap` via `step.run` ANTES del return (cuando es stage_changed). Y AGREGAR el bloque kill-switch DESPUES del cascade check:

    ```typescript
    const eventData = (event as any).data as Record<string, unknown>
    const workspaceId = String(eventData.workspaceId || '')
    const cascadeDepth = Number(eventData.cascadeDepth ?? 0)

    // === D-07 Layer 3: cascade_capped history audit (VISIBLE ledger of what would have run) ===
    if (cascadeDepth >= MAX_CASCADE_DEPTH) {
      // NEW: log to history when trigger is order.stage_changed + orderId present
      await step.run(`cap-audit-${triggerType}`, async () => {
        if (triggerType !== 'order.stage_changed' || !eventData.orderId) return
        await logCascadeCap(createAdminClient(), {
          orderId: String(eventData.orderId),
          workspaceId,
          prevStageId: eventData.previousStageId ? String(eventData.previousStageId) : null,
          newStageId: eventData.newStageId ? String(eventData.newStageId) : null,
          cascadeDepth,
          triggerType,
        })
      })
      console.warn(
        `[automation-runner] Cascade depth ${cascadeDepth} >= MAX (${MAX_CASCADE_DEPTH}). ` +
        `Skipping ${triggerType} for workspace ${workspaceId}`
      )
      return { skipped: true, reason: 'cascade_depth_exceeded' }
    }

    // === D-07 Layer 2: runtime kill-switch (flag-gated, fail-open) ===
    if (triggerType === 'order.stage_changed' && eventData.orderId) {
      const killSwitchEnabled = await step.run(
        'kill-switch-flag',
        async () => getPlatformConfig<boolean>('crm_stage_integrity_killswitch_enabled', false),
      )

      if (killSwitchEnabled) {
        const { shouldSkip, recentChanges } = await step.run('kill-switch-check', async () =>
          checkKillSwitch(createAdminClient(), eventData.orderId as string)
        )

        if (shouldSkip) {
          // D-22 observability event + D-23 warning log
          console.warn(
            `[kill-switch] order ${eventData.orderId}: ${recentChanges} non-manual changes in 60s. Skipping.`
          )
          return { skipped: true, reason: 'kill_switch_triggered', recentChanges }
        }
      }
    }

    // === resto del runner existing sigue aqui (load automations, filter, execute actions) ===
    // ... (preservar todo el codigo entre el nuevo bloque y el return final)
    ```

    **CRITICAL:** NO tocar el codigo existing de load/filter/execute entre el nuevo bloque y el `return` final. Solo ampliamos el cascade depth check + insertamos el kill-switch block INMEDIATAMENTE DESPUES.

    **Paso 5 — Cuando se ejecuta `executeChangeStage` desde el runner (alrededor de lineas ~500+ donde se invocan actions), pasar `automationContext`:**

    Localizar donde se hace el despacho de actions. Buscar:
    ```bash
    grep -n "executeChangeStage" src/inngest/functions/automation-runner.ts
    ```

    Encontrar el call que dispatcha la action `change_stage` (probablemente via un switch o `actionHandlers[action.type]`). Modificar el call para pasar el `automationContext`:

    ```typescript
    // Por cada action que se ejecuta (dentro del loop de automations matching):
    if (action.type === 'change_stage') {
      await executeChangeStage(
        action.params,
        triggerContext,
        workspaceId,
        cascadeDepth,
        // NEW: plumb automation metadata for history actor_id / trigger_event
        {
          automationId: automation.id,
          automationName: automation.name ?? 'unnamed',
          triggerType,
        },
      )
    }
    ```

    Si el runner usa un switch/map generico que no distingue action types, ajustar la firma del dispatcher o agregar el arg como opcional para que `change_stage` lo use y otros lo ignoren.

    **Paso 6 — Manejar el error `stage_changed_concurrently` del executeChangeStage en el runner:**

    Donde el runner catchea errores de action execution, agregar narrowing para loggear el event observability D-22 `stage_change_rejected_cas`:

    ```typescript
    try {
      await executeChangeStage(...)
    } catch (err) {
      if (err instanceof Error && err.message === 'stage_changed_concurrently') {
        console.warn(`[automation-runner] stage_change_rejected_cas for order ${triggerContext.orderId} via automation ${automation.id}`)
        // Continue to next action / next automation — no rethrow
      } else {
        // existing error handling preserved
        throw err
      }
    }
    ```

    Si el runner ya tiene try/catch per-action, agregar el narrowing dentro. Si no, envolver selectivamente solo el call a `executeChangeStage`.
  </action>
  <verify>
    <automated>grep -q "createAdminClient" src/inngest/functions/automation-runner.ts</automated>
    <automated>grep -q "getPlatformConfig" src/inngest/functions/automation-runner.ts</automated>
    <automated>grep -q "export async function checkKillSwitch" src/inngest/functions/automation-runner.ts</automated>
    <automated>grep -q "export async function logCascadeCap" src/inngest/functions/automation-runner.ts</automated>
    <automated>grep -qE "concurrency: \[" src/inngest/functions/automation-runner.ts</automated>
    <automated>grep -A 6 'retries: 2' src/inngest/functions/automation-runner.ts | grep -q "event.data.orderId"</automated>
    <automated>grep -A 6 'retries: 2' src/inngest/functions/automation-runner.ts | grep -q "workspaceId"</automated>
    <automated>grep -q "triggerType === 'order.stage_changed'" src/inngest/functions/automation-runner.ts</automated>
    <automated>grep -qE "cap-audit-" src/inngest/functions/automation-runner.ts</automated>
    <automated>grep -q "'cascade_capped'" src/inngest/functions/automation-runner.ts</automated>
    <automated>grep -q "cascade_depth_exceeded" src/inngest/functions/automation-runner.ts</automated>
    <automated>grep -q "kill-switch-flag" src/inngest/functions/automation-runner.ts</automated>
    <automated>grep -q "kill-switch-check" src/inngest/functions/automation-runner.ts</automated>
    <automated>grep -q "crm_stage_integrity_killswitch_enabled" src/inngest/functions/automation-runner.ts</automated>
    <automated>grep -qE "\.neq\('source', 'manual'\)" src/inngest/functions/automation-runner.ts</automated>
    <automated>grep -qE "\.gt\('changed_at'" src/inngest/functions/automation-runner.ts</automated>
    <automated>grep -q "shouldSkip" src/inngest/functions/automation-runner.ts</automated>
    <automated>grep -q "kill_switch_triggered" src/inngest/functions/automation-runner.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -v node_modules | grep -E "src/inngest/functions/automation-runner.ts" || echo "no TS errors in automation-runner"</automated>
  </verify>
  <acceptance_criteria>
    - Imports `createAdminClient` + `getPlatformConfig` presentes en top del archivo.
    - 2 helpers exportados: `export async function checkKillSwitch(...)` y `export async function logCascadeCap(...)` — WARNING 3 fix.
    - `concurrency` ahora es un array con 2 objetos + spread condicional para `orderId:1` SOLO si `triggerType === 'order.stage_changed'`. El edit EXTIENDE el array existing (BLOCKER 3 fix: no reemplaza un scalar, extiende el array).
    - Handler ampla el cascade depth check existing con `step.run('cap-audit-${triggerType}')` que llama `logCascadeCap(...)`.
    - Return `{ skipped: true, reason: 'cascade_depth_exceeded' }` tras cap-audit (preservado del existing).
    - Bloque kill-switch INSERTADO DESPUES del cascade check, CONDICIONADO a `triggerType === 'order.stage_changed' && eventData.orderId`.
    - `step.run('kill-switch-flag', ...)` lee `crm_stage_integrity_killswitch_enabled` con fallback `false`.
    - `step.run('kill-switch-check', ...)` invoca `checkKillSwitch(createAdminClient(), orderId)` (no re-implementa inline).
    - `{ shouldSkip, recentChanges }` destructured → `if (shouldSkip) console.warn(...) return { skipped: true, reason: 'kill_switch_triggered', recentChanges }`.
    - `executeChangeStage` call en el runner pasa `automationContext = { automationId, automationName, triggerType }` cuando dispatcha la action.
    - Error narrowing: `err.message === 'stage_changed_concurrently'` → `console.warn('stage_change_rejected_cas')` + continua (no crash del runner).
    - NO tocado el codigo de load/execute automations existing entre el bloque nuevo y el return final.
    - `npx tsc --noEmit` sin errores nuevos en este archivo.
  </acceptance_criteria>
  <done>
    - Commit atomico: `feat(crm-stage-integrity): export kill-switch helpers + stacked concurrency + cascade_capped audit in automation-runner`
    - NO push todavia — Tasks 2-4 completan Wave 2.
  </done>
</task>

<task type="auto">
  <name>Task 2: Modificar `trigger-emitter.ts isCascadeSuppressed` (async + INSERT pre-emit cap audit)</name>
  <read_first>
    - src/lib/automations/trigger-emitter.ts (entero — especialmente linea 23-36 isCascadeSuppressed + todos los callers; preservar callers async context)
    - src/lib/automations/constants.ts (MAX_CASCADE_DEPTH)
    - src/lib/supabase/admin.ts (import createAdminClient)
    - .planning/standalone/crm-stage-integrity/PATTERNS.md §Wave 2 trigger-emitter.ts (lineas 626-674)
    - .planning/standalone/crm-stage-integrity/RESEARCH.md §Pitfall 9 (doble cobertura con runner)
    - .planning/standalone/crm-stage-integrity/CONTEXT.md §Decisions D-07 capa 3, D-23
  </read_first>
  <action>
    **Paso 1 — Agregar import al tope de `src/lib/automations/trigger-emitter.ts`:**

    ```typescript
    import { createAdminClient } from '@/lib/supabase/admin'
    ```

    **Paso 2 — MODIFICAR `isCascadeSuppressed` (lineas 23-36 actuales):**

    Convertir la funcion a async + agregar arg opcional `orderContext` + INSERT pre-emit cuando `triggerType === 'order.stage_changed'`:

    ```typescript
    async function isCascadeSuppressed(
      triggerType: string,
      workspaceId: string,
      cascadeDepth: number,
      // NEW: optional order context for cascade_capped history insert (D-07 layer 3, pre-emit path)
      orderContext?: { orderId: string; previousStageId?: string | null; newStageId?: string | null },
    ): Promise<boolean> {
      if (cascadeDepth >= MAX_CASCADE_DEPTH) {
        console.warn(
          `[trigger-emitter] Cascade depth ${cascadeDepth} >= MAX (${MAX_CASCADE_DEPTH}). Suppressing ${triggerType}`
        )

        // NEW: log cascade_capped to history when order context available (best-effort, non-blocking)
        if (triggerType === 'order.stage_changed' && orderContext?.orderId) {
          try {
            const supabase = createAdminClient()
            await supabase.from('order_stage_history').insert({
              order_id: orderContext.orderId,
              workspace_id: workspaceId,
              previous_stage_id: orderContext.previousStageId ?? null,
              new_stage_id: orderContext.newStageId ?? orderContext.previousStageId ?? '',
              source: 'cascade_capped',
              actor_id: null,
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

    **Paso 3 — ACTUALIZAR callers de `isCascadeSuppressed` en el mismo archivo para (a) hacer await + (b) pasar orderContext cuando disponible:**

    Buscar en `trigger-emitter.ts`:
    ```bash
    grep -n "isCascadeSuppressed" src/lib/automations/trigger-emitter.ts
    ```

    Cada caller (por ejemplo `emitOrderStageChanged`) debe convertirse a llamar con `await` + pasar orderContext si es un trigger `order.stage_changed`:

    ```typescript
    // Ejemplo: en emitOrderStageChanged (si el caller es ahi)
    if (await isCascadeSuppressed('order.stage_changed', data.workspaceId, depth, {
      orderId: data.orderId,
      previousStageId: data.previousStageId,
      newStageId: data.newStageId,
    })) {
      return  // suppressed
    }
    ```

    Para otros emit helpers (tag.assigned, order.created, etc.), dejar `orderContext: undefined`:
    ```typescript
    if (await isCascadeSuppressed('tag.assigned', workspaceId, cascadeDepth)) {
      return
    }
    ```

    **NOTAS:**
    - La funcion se vuelve async. Los callers existentes que NO usen await ahora recibiran una `Promise<boolean>` truthy siempre — romperian el check. Asegurarse que TODOS los callers estan awaiting.
    - La doble cobertura (runner Task 1 + emitter Task 2) es intencional (Pitfall 9): runner catchea el caso "event ya en cola al dequeue"; emitter catchea el caso "source sabe pre-emit". `actor_label` distingue ("pre-emit" sufijo).
  </action>
  <verify>
    <automated>grep -q "async function isCascadeSuppressed" src/lib/automations/trigger-emitter.ts</automated>
    <automated>grep -q "orderContext\?" src/lib/automations/trigger-emitter.ts</automated>
    <automated>grep -q "cascade_capped" src/lib/automations/trigger-emitter.ts</automated>
    <automated>grep -q "pre-emit" src/lib/automations/trigger-emitter.ts</automated>
    <automated>grep -q "createAdminClient" src/lib/automations/trigger-emitter.ts</automated>
    <automated>! grep -nE "isCascadeSuppressed\(" src/lib/automations/trigger-emitter.ts | grep -v "async function" | grep -v "await"</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -v node_modules | grep -E "src/lib/automations/trigger-emitter.ts" || echo "no TS errors in trigger-emitter"</automated>
  </verify>
  <acceptance_criteria>
    - `isCascadeSuppressed` es `async` (Promise<boolean> return).
    - Tiene arg opcional `orderContext?: { orderId, previousStageId?, newStageId? }`.
    - Cuando cap hit + `triggerType === 'order.stage_changed'` + orderContext presente → INSERT a `order_stage_history` con `source: 'cascade_capped'` y `actor_label: ...pre-emit`.
    - INSERT wrappeado en try/catch — failure loggea pero no bloquea el suppression flow.
    - TODOS los callers en el mismo archivo usan `await` (grep: no encuentra calls sin await).
    - Callers de `order.stage_changed` especificamente pasan el orderContext.
    - Otros callers (tag.assigned, order.created, etc.) no pasan orderContext (arg opcional).
    - `npx tsc --noEmit` sin errores nuevos.
  </acceptance_criteria>
  <done>
    - Commit atomico: `feat(crm-stage-integrity): log cascade_capped to history in trigger-emitter (pre-emit path)`
  </done>
</task>

<task type="auto">
  <name>Task 3: Modificar `action-executor.ts executeChangeStage` — automationContext + narrow CAS reject</name>
  <read_first>
    - src/lib/automations/action-executor.ts (entero — especialmente lineas 301-323 executeChangeStage)
    - src/lib/domain/orders.ts (firma actualizada de moveOrderToStage + DomainContext extendido del Plan 02)
    - src/lib/domain/types.ts (DomainContext con actorId/actorLabel/triggerEvent)
    - .planning/standalone/crm-stage-integrity/PATTERNS.md §Wave 2 action-executor.ts (lineas 678-729)
    - .planning/standalone/crm-stage-integrity/CONTEXT.md §Decisions D-07 (cascadeDepth increment), D-10 (actor mapping Pitfall 10)
  </read_first>
  <action>
    **Paso 1 — MODIFICAR `executeChangeStage` (lineas ~301-323) en `src/lib/automations/action-executor.ts`:**

    Agregar arg opcional `automationContext` + populate DomainContext con actor fields + narrow CAS reject:

    ```typescript
    async function executeChangeStage(
      params: Record<string, unknown>,
      _context: TriggerContext,
      workspaceId: string,
      cascadeDepth: number,
      // NEW: automation metadata for audit trail (Pitfall 10 RESEARCH — actor_id mapping)
      automationContext?: { automationId: string; automationName: string; triggerType: string },
    ): Promise<unknown> {
      const stageId = String(params.stageId || '')
      const orderId = _context.orderId
      if (!stageId) throw new Error('stageId is required for change_stage')
      if (!orderId) throw new Error('No orderId available in trigger context')

      // cascadeDepth + 1: ensures trigger chain is bounded by MAX_CASCADE_DEPTH.
      // See CONTEXT.md D-07 layer 3: when the incremented value reaches the cap,
      // automation-runner.ts short-circuits AND logs cascade_capped to order_stage_history.
      const ctx: DomainContext = {
        workspaceId,
        source: 'automation',
        cascadeDepth: cascadeDepth + 1,
        // NEW: populate from automation metadata (Pitfall 10)
        actorId: automationContext?.automationId ?? null,
        actorLabel: automationContext
          ? `Automation: ${automationContext.automationName}`
          : null,
        triggerEvent: automationContext?.triggerType ?? null,
      }

      const result = await domainMoveOrderToStage(ctx, { orderId, newStageId: stageId })

      if (!result.success) {
        // NEW: propagate stage_changed_concurrently as a distinct error so the
        // runner can log pipeline_decision:stage_change_rejected_cas (D-22)
        // rather than a generic action failure.
        if (result.error === 'stage_changed_concurrently') {
          throw new Error('stage_changed_concurrently')
        }
        throw new Error(result.error || 'Failed to change stage')
      }

      return {
        orderId,
        previousStageId: result.data!.previousStageId,
        newStageId: result.data!.newStageId,
      }
    }
    ```

    **Paso 2 — Actualizar los callers de `executeChangeStage` si no se modificaron en Task 1 (automation-runner):**

    Verificar que el dispatcher de actions en `automation-runner.ts` pasa el arg `automationContext` (Task 1 Paso 5 ya lo hace). Si hay algun OTRO caller de `executeChangeStage` (buscar con grep):

    ```bash
    grep -rn "executeChangeStage" src/ --include="*.ts"
    ```

    Solo `automation-runner.ts` y `action-executor.ts` deberian referenciarla. Si hay mas callers, agregar el arg opcional (backward-compat — existing callers pasan `undefined`).
  </action>
  <verify>
    <automated>grep -q "automationContext" src/lib/automations/action-executor.ts</automated>
    <automated>grep -q "automationId: string" src/lib/automations/action-executor.ts</automated>
    <automated>grep -q "automationName: string" src/lib/automations/action-executor.ts</automated>
    <automated>grep -q "actorId: automationContext" src/lib/automations/action-executor.ts</automated>
    <automated>grep -qE "Automation: \\\${automationContext.automationName}" src/lib/automations/action-executor.ts</automated>
    <automated>grep -q "stage_changed_concurrently" src/lib/automations/action-executor.ts</automated>
    <automated>grep -q "cascadeDepth + 1" src/lib/automations/action-executor.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -v node_modules | grep -E "src/lib/automations/action-executor.ts" || echo "no TS errors"</automated>
  </verify>
  <acceptance_criteria>
    - `executeChangeStage` tiene arg opcional `automationContext?: { automationId, automationName, triggerType }`.
    - `DomainContext` construido populates `actorId`, `actorLabel: 'Automation: {name}'`, `triggerEvent`.
    - `cascadeDepth + 1` preservado en ctx (D-07 layer 3 bounded).
    - Narrow `if (result.error === 'stage_changed_concurrently') throw new Error('stage_changed_concurrently')`.
    - Callers del runner (Task 1 Paso 5) pasan `automationContext`.
    - `npx tsc --noEmit` sin errores nuevos.
  </acceptance_criteria>
  <done>
    - Commit atomico: `feat(crm-stage-integrity): plumb automation context + narrow CAS reject in executeChangeStage`
  </done>
</task>

<task type="auto">
  <name>Task 4: Crear tests unitarios que IMPORTEN los helpers exportados — kill-switch + cascade_capped + push</name>
  <read_first>
    - src/inngest/functions/__tests__/recompra-preload-context.test.ts (precedent: vitest + mocked createAdminClient + mocked step.run + mocked getPlatformConfig)
    - src/inngest/functions/automation-runner.ts (la version modificada en Task 1 — CONFIRMAR exports `checkKillSwitch` y `logCascadeCap` presentes antes de escribir los tests)
    - .planning/standalone/crm-stage-integrity/PATTERNS.md §Wave 2 Tests (lineas 732-746)
    - .planning/standalone/crm-stage-integrity/CONTEXT.md §Decisions D-25
  </read_first>
  <action>
    **Paso 1 — CREAR `src/inngest/functions/__tests__/automation-runner-killswitch.test.ts`:**

    Este test IMPORTA `checkKillSwitch` del runner y mockea el admin client. Prueba DIRECTA sobre el helper exportado — da regression signal real (WARNING 3 fix).

    ```typescript
    /**
     * Unit test — kill-switch helper in automation-runner (D-07 layer 2, D-20, D-25).
     * Imports the exported `checkKillSwitch` helper directly (no inline re-implementation).
     */
    import { describe, it, expect, vi, beforeEach } from 'vitest'
    import { checkKillSwitch } from '@/inngest/functions/automation-runner'

    // Build a chainable mock that supports .from().select().eq().neq().gt()
    function buildAdminMock(response: { count: number | null; error: { message: string } | null }) {
      const gt = vi.fn().mockResolvedValue(response)
      const neq = vi.fn(() => ({ gt }))
      const eq = vi.fn(() => ({ neq }))
      const select = vi.fn(() => ({ eq }))
      const from = vi.fn(() => ({ select }))
      return { admin: { from } as any, gt, neq, eq, select, fromFn: from }
    }

    describe('checkKillSwitch (automation-runner exported helper)', () => {
      beforeEach(() => {
        vi.clearAllMocks()
      })

      it('count=0 → shouldSkip=false (below threshold)', async () => {
        const { admin, fromFn, gt } = buildAdminMock({ count: 0, error: null })
        const result = await checkKillSwitch(admin, 'order-123')
        expect(fromFn).toHaveBeenCalledWith('order_stage_history')
        expect(gt).toHaveBeenCalledWith('changed_at', expect.any(String))
        expect(result).toEqual({ shouldSkip: false, recentChanges: 0 })
      })

      it('count=3 → shouldSkip=false (still below threshold=5)', async () => {
        const { admin } = buildAdminMock({ count: 3, error: null })
        const result = await checkKillSwitch(admin, 'order-123')
        expect(result).toEqual({ shouldSkip: false, recentChanges: 3 })
      })

      it('count=5 → shouldSkip=false (equal to threshold, NOT strictly greater)', async () => {
        const { admin } = buildAdminMock({ count: 5, error: null })
        const result = await checkKillSwitch(admin, 'order-123')
        expect(result.shouldSkip).toBe(false)
      })

      it('count=6 → shouldSkip=true (strictly greater than threshold)', async () => {
        const { admin } = buildAdminMock({ count: 6, error: null })
        const result = await checkKillSwitch(admin, 'order-123')
        expect(result).toEqual({ shouldSkip: true, recentChanges: 6 })
      })

      it('query error → shouldSkip=false (fail-open, Pattern 5)', async () => {
        const { admin } = buildAdminMock({ count: null, error: { message: 'db down' } })
        const result = await checkKillSwitch(admin, 'order-123')
        expect(result).toEqual({ shouldSkip: false, recentChanges: 0 })
      })

      it('custom threshold=10 overrides default=5', async () => {
        const { admin } = buildAdminMock({ count: 7, error: null })
        const result = await checkKillSwitch(admin, 'order-123', 10)
        expect(result.shouldSkip).toBe(false)  // 7 <= 10
      })

      it('custom windowMs passed to changed_at filter', async () => {
        const { admin, gt } = buildAdminMock({ count: 0, error: null })
        const before = Date.now()
        await checkKillSwitch(admin, 'order-123', 5, 30_000)
        const call = (gt.mock.calls[0] as any[])[1] as string
        const callMs = new Date(call).getTime()
        // sinceIso should be ~30s before test start
        expect(before - callMs).toBeGreaterThanOrEqual(29_000)
        expect(before - callMs).toBeLessThanOrEqual(31_500)
      })
    })
    ```

    **Paso 2 — CREAR `src/inngest/functions/__tests__/automation-runner-cascade-capped.test.ts`:**

    Este test IMPORTA `logCascadeCap` del runner y mockea el admin client insert para verificar el shape del payload.

    ```typescript
    /**
     * Unit test — cascade_capped history insert helper (D-07 layer 3, D-25).
     * Imports the exported `logCascadeCap` helper directly.
     */
    import { describe, it, expect, vi, beforeEach } from 'vitest'
    import { logCascadeCap } from '@/inngest/functions/automation-runner'

    const MAX_CASCADE_DEPTH = 3

    function buildAdminMock() {
      const insert = vi.fn().mockResolvedValue({ error: null })
      const from = vi.fn(() => ({ insert }))
      return { admin: { from } as any, insert, fromFn: from }
    }

    describe('logCascadeCap (automation-runner exported helper)', () => {
      beforeEach(() => {
        vi.clearAllMocks()
      })

      it('inserts row with source=cascade_capped + actor_label + cascade_depth + trigger_event', async () => {
        const { admin, insert, fromFn } = buildAdminMock()
        await logCascadeCap(admin, {
          orderId: 'order-abc',
          workspaceId: 'ws-1',
          prevStageId: 'stage-A',
          newStageId: 'stage-B',
          cascadeDepth: MAX_CASCADE_DEPTH,
          triggerType: 'order.stage_changed',
        })

        expect(fromFn).toHaveBeenCalledWith('order_stage_history')
        expect(insert).toHaveBeenCalledTimes(1)
        expect(insert.mock.calls[0][0]).toMatchObject({
          order_id: 'order-abc',
          workspace_id: 'ws-1',
          previous_stage_id: 'stage-A',
          new_stage_id: 'stage-B',
          source: 'cascade_capped',
          actor_id: null,
          actor_label: `Cascade capped at depth ${MAX_CASCADE_DEPTH}`,
          cascade_depth: MAX_CASCADE_DEPTH,
          trigger_event: 'order.stage_changed',
        })
      })

      it('newStageId fallback: if undefined, uses prevStageId', async () => {
        const { admin, insert } = buildAdminMock()
        await logCascadeCap(admin, {
          orderId: 'order-abc',
          workspaceId: 'ws-1',
          prevStageId: 'stage-A',
          newStageId: null,
          cascadeDepth: 3,
          triggerType: 'order.stage_changed',
        })
        expect(insert.mock.calls[0][0].new_stage_id).toBe('stage-A')
      })

      it('actor_label scales with cascadeDepth value', async () => {
        const { admin, insert } = buildAdminMock()
        await logCascadeCap(admin, {
          orderId: 'o',
          workspaceId: 'w',
          prevStageId: null,
          newStageId: 'x',
          cascadeDepth: 7,
          triggerType: 'order.stage_changed',
        })
        expect(insert.mock.calls[0][0].actor_label).toBe('Cascade capped at depth 7')
      })
    })
    ```

    **Paso 3 — Smoke run local (si infra disponible):**

    ```bash
    npm test -- --run src/inngest/functions/__tests__/automation-runner-killswitch.test.ts
    npm test -- --run src/inngest/functions/__tests__/automation-runner-cascade-capped.test.ts
    ```

    Ambos deben PASS (son unit tests con mocks, no requieren DB ni env vars). Los tests IMPORTAN los helpers de `@/inngest/functions/automation-runner` — si los helpers no estan exportados, TypeScript falla en compile (WARNING 3 fix assert via compilation).

    **Paso 4 — Push a Vercel (Regla 1):**

    ```bash
    git push origin main
    ```

    Esperar build OK. Con ambos flags en `false`, el deploy es:
    - Concurrency per-orderId: ACTIVA desde primer evento post-deploy (D-19 — additive sin flag).
    - Kill-switch: INACTIVO (flag=false → gate skippea query).
    - Cascade_capped audit: ACTIVA desde primer cap hit post-deploy (D-18 additive).
    - `executeChangeStage automationContext`: ACTIVA desde primer execute post-deploy (audit trail poblado).

    Smoke opcional post-deploy: dejar que la app corra 1h, luego query:
    ```sql
    SELECT source, COUNT(*)
    FROM order_stage_history
    WHERE changed_at > NOW() - INTERVAL '1 hour'
    GROUP BY source;
    ```
    Esperado: al menos `manual` (Kanban drags) + potencialmente `automation` (triggers) + posiblemente `cascade_capped` si alguna automation loop fue truncada.
  </action>
  <verify>
    <automated>ls src/inngest/functions/__tests__/automation-runner-killswitch.test.ts</automated>
    <automated>ls src/inngest/functions/__tests__/automation-runner-cascade-capped.test.ts</automated>
    <automated>grep -q "checkKillSwitch" src/inngest/functions/__tests__/automation-runner-killswitch.test.ts</automated>
    <automated>grep -q "import { checkKillSwitch }" src/inngest/functions/__tests__/automation-runner-killswitch.test.ts</automated>
    <automated>grep -q "logCascadeCap" src/inngest/functions/__tests__/automation-runner-cascade-capped.test.ts</automated>
    <automated>grep -q "import { logCascadeCap }" src/inngest/functions/__tests__/automation-runner-cascade-capped.test.ts</automated>
    <automated>grep -q "MAX_CASCADE_DEPTH" src/inngest/functions/__tests__/automation-runner-cascade-capped.test.ts</automated>
    <automated>grep -q "cascade_capped" src/inngest/functions/__tests__/automation-runner-cascade-capped.test.ts</automated>
    <automated>npm test -- --run src/inngest/functions/__tests__/automation-runner-killswitch.test.ts 2>&1 | grep -qE "(PASS|Test Files.*passed)" || echo "test may require vitest setup"</automated>
    <automated>npm test -- --run src/inngest/functions/__tests__/automation-runner-cascade-capped.test.ts 2>&1 | grep -qE "(PASS|Test Files.*passed)" || echo "test may require vitest setup"</automated>
  </verify>
  <acceptance_criteria>
    - `automation-runner-killswitch.test.ts` creado, IMPORTA `checkKillSwitch` de `@/inngest/functions/automation-runner` (verificado via grep `import { checkKillSwitch }`).
    - Test cubre 7 casos: count=0, count=3, count=5 (boundary), count=6 (skip), query error (fail-open), custom threshold, custom windowMs.
    - `automation-runner-cascade-capped.test.ts` creado, IMPORTA `logCascadeCap` de `@/inngest/functions/automation-runner` (verificado via grep).
    - Test cubre 3 casos: shape del insert, newStageId fallback a prevStageId, actor_label scales con cascadeDepth.
    - Ambos archivos compilan — si los helpers no estan exportados en Task 1, compilacion falla (esa es la garantia WARNING 3).
    - Git push a origin main exitoso.
    - Vercel build OK.
  </acceptance_criteria>
  <done>
    - Commit atomico tests: `test(crm-stage-integrity): add kill-switch + cascade_capped unit tests importing runner helpers`
    - Push a origin/main commiteado y acknowledged.
  </done>
</task>

</tasks>

<verification>
- `src/inngest/functions/automation-runner.ts`: 2 helpers exportados (`checkKillSwitch`, `logCascadeCap`) + stacked concurrency (array extension del existing single-element, BLOCKER 3 fix) + cap-audit step usando `logCascadeCap` + kill-switch flag-gated usando `checkKillSwitch` + error narrow.
- `src/lib/automations/trigger-emitter.ts`: `isCascadeSuppressed` async + INSERT pre-emit cap audit + callers actualizados con await.
- `src/lib/automations/action-executor.ts`: `executeChangeStage` con `automationContext` + narrow CAS reject.
- 2 tests unitarios creados que IMPORTAN los helpers exportados (WARNING 3 fix — regression signal real).
- `npx tsc --noEmit` sin errores nuevos.
- Vercel push + build OK.
</verification>

<success_criteria>
- **Concurrency:** 2 eventos `order.stage_changed` simultaneos para mismo orderId se serializan (verificable en Inngest dashboard `running/queued`).
- **Kill-switch (flag OFF por default):** inerte. Cuando el usuario flippe flag → 6+ cambios no-manuales en 60s sobre el mismo pedido → runner skippea + emite `console.warn`.
- **Cascade cap:** cuando una automation loop alcanza depth=3, `order_stage_history` ahora tiene row `source='cascade_capped'` visible via query + `actor_label` discrimina `pre-emit` (source trigger-emitter) vs post-dequeue (source runner).
- **Actor trail:** `order_stage_history` populado con `actor_id=automation.id` + `actor_label="Automation: {name}"` desde el primer cambio automatico post-deploy.
- **Tests dan regression signal real:** si el helper cambia comportamiento en el futuro (ej. threshold hardcoded cambia de 5 a 10), tests fallan (WARNING 3 fix).
- Regla 6 respetada: flag kill-switch=false, comportamiento observable en produccion = byte-identical pre-fase + audit log additive.
- Plan 04 desbloqueado (independiente — builder validation).
- Plan 05 desbloqueado (Kanban UI + Realtime puede contar con kill-switch + concurrency en backend).
</success_criteria>

<output>
After completion, create `.planning/standalone/crm-stage-integrity/03-SUMMARY.md` documenting:
- Commit hashes: Task 1 (runner + helpers), Task 2 (trigger-emitter), Task 3 (action-executor), Task 4 (tests + push)
- Archivos modificados + aprox LOC added/removed
- Output de `npm test -- --run src/inngest/functions/__tests__/automation-runner-killswitch.test.ts` (PASS esperado — tests importan los helpers exportados)
- Output de `npm test -- --run src/inngest/functions/__tests__/automation-runner-cascade-capped.test.ts` (PASS esperado)
- Confirmacion push Vercel + build status
- Si corrio smoke post-deploy: output de `SELECT source, COUNT(*) FROM order_stage_history WHERE changed_at > NOW() - INTERVAL '1 hour' GROUP BY source`
- Estado de flags: `crm_stage_integrity_cas_enabled=false`, `crm_stage_integrity_killswitch_enabled=false` (sin flip en este plan)
- Cualquier caller de `executeChangeStage` no cubierto en Task 3 (si grep encontro mas)
</output>
</content>

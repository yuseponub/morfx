---
phase: crm-stage-integrity
plan: 02
type: execute
wave: 1
depends_on: [01]
files_modified:
  - src/lib/domain/types.ts
  - src/lib/domain/orders.ts
  - src/app/actions/orders.ts
  - src/app/api/mobile/orders/[id]/stage/route.ts
  - src/lib/agents/crm-writer/two-step.ts
  - src/__tests__/integration/orders-cas.test.ts
  - src/__tests__/integration/order-stage-history-rls.test.ts
  - .env.test.example
autonomous: true
requirements:
  - D-01
  - D-02
  - D-04
  - D-05
  - D-06
  - D-12
  - D-13
  - D-15
  - D-17
  - D-18
  - D-25

must_haves:
  truths:
    - "`DomainContext` interface en `src/lib/domain/types.ts` expone campos opcionales `actorId?: string | null`, `actorLabel?: string | null`, `triggerEvent?: string | null` (backward-compat: existing callers no-op)"
    - "`getAuthContext()` en `src/app/actions/orders.ts` extendido a retornar `{ workspaceId: string, userId: string } | { error: string }` — userId extraido del `user.id` de `supabase.auth.getUser()` que ya esta in-scope"
    - "`moveOrderToStage` en `src/lib/domain/orders.ts` short-circuitea cuando `previousStageId === params.newStageId` retornando `success: true` sin UPDATE ni history insert (Pitfall 2 RESEARCH)"
    - "`moveOrderToStage` lee `crm_stage_integrity_cas_enabled` flag via `getPlatformConfig(..., false)` — fail-closed"
    - "Cuando flag=true, el UPDATE incluye `.eq('stage_id', previousStageId).select('id')` y verifica `!updated || updated.length === 0` para detectar CAS reject (Pattern 1 + Assumption A1 RESEARCH)"
    - "Cuando CAS reject, re-fetch stage actual + retorna `{ success: false, error: 'stage_changed_concurrently', data: { currentStageId } }`"
    - "Cuando flag=false, legacy path UPDATE sin `.eq('stage_id')` se preserva byte-identical al comportamiento actual"
    - "`moveOrderToStage` escribe row en `order_stage_history` tras UPDATE exitoso (ambas paths — flag ON y OFF, additive D-18). INSERT falla → `console.error` + continua (best-effort, Pitfall 3)"
    - "La row de history popula `source` via mapper que convierte `ctx.source` (5 valores) → CHECK constraint values (7 valores); `'server-action' → 'manual'`, `'automation' → 'automation'`, `'webhook' → 'webhook'`, `'tool-handler' | 'adapter' → 'agent'`, `'mobile-api' → 'manual'`, else `'system'`"
    - "`src/app/actions/orders.ts moveOrderToStage` action pasa `actorId = auth.userId` + `actorLabel = 'user:' + auth.userId.slice(0,8)` + `source: 'server-action'` al DomainContext (fallback label corto: tablas de display-name no disponibles in-scope)"
    - "`src/app/actions/orders.ts moveOrderToStage` action narrows el error: `if (result.error === 'stage_changed_concurrently') return { error: 'stage_changed_concurrently', data: result.data }` — no se muta a mensaje generico"
    - "`bulkMoveOrdersToStage` retorna `{ moved: number, failed: Array<{ orderId: string, reason: string }> }` en lugar de solo count (Pitfall 12, Open Question 4)"
    - "`src/app/api/mobile/orders/[id]/stage/route.ts` usa `requireMobileAuth(req)` que YA retorna `{ user, workspaceId, membership }` — se pasa `actorId: authCtx.user.id`, `actorLabel: 'mobile-api'` al DomainContext"
    - "`src/lib/agents/crm-writer/two-step.ts` confirm branch propaga `error.code = 'stage_changed_concurrently'` cuando result.error === 'stage_changed_concurrently' (distinguible del error generico, per CONTEXT.md D-06)"
    - "Test `src/__tests__/integration/orders-cas.test.ts`: CAS rechaza segundo UPDATE concurrente (happy path con flag ON), legacy path preserva comportamiento (flag OFF), same-stage no-op no genera CAS reject, history insert best-effort no rompe move — usa `describe.skipIf(!process.env.TEST_STAGE_A, ...)` para no-fail cuando env missing"
    - "Test `src/__tests__/integration/order-stage-history-rls.test.ts`: INSERT ok, UPDATE falla con mensaje `append-only`, DELETE falla idem (D-13) — usa `describe.skipIf(...)` patron tambien"
    - "`.env.test.example` en la raiz del repo lista las env vars requeridas por los integration tests (TEST_STAGE_A/B/C, TEST_PIPELINE_ID, TEST_WORKSPACE_ID, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) con comentarios de donde obtener cada valor"
  artifacts:
    - path: "src/lib/domain/types.ts"
      provides: "DomainContext extendido con actorId/actorLabel/triggerEvent opcionales"
      contains: "actorId?: string | null"
    - path: "src/lib/domain/orders.ts"
      provides: "moveOrderToStage con CAS flag-gated + history insert best-effort + short-circuit same-stage"
      contains: "stage_changed_concurrently"
    - path: "src/app/actions/orders.ts"
      provides: "getAuthContext extendido + server action que narrow-ea stage_changed_concurrently + bulk retorna failed list"
      contains: "failed: Array"
    - path: "src/app/api/mobile/orders/[id]/stage/route.ts"
      provides: "Mobile route pasa actorId=user.id + actorLabel='mobile-api' al DomainContext"
      contains: "'mobile-api'"
    - path: "src/__tests__/integration/orders-cas.test.ts"
      provides: "Integration test CAS concurrency (D-25)"
      contains: "stage_changed_concurrently"
    - path: "src/__tests__/integration/order-stage-history-rls.test.ts"
      provides: "Integration test append-only trigger (D-13, D-25)"
      contains: "append-only"
    - path: ".env.test.example"
      provides: "Template de env vars para integration tests (TEST_STAGE_A/B/C, TEST_PIPELINE_ID, TEST_WORKSPACE_ID)"
      contains: "TEST_STAGE_A"
  key_links:
    - from: "src/lib/domain/orders.ts moveOrderToStage"
      to: "platform_config.crm_stage_integrity_cas_enabled"
      via: "getPlatformConfig<boolean>('crm_stage_integrity_cas_enabled', false)"
      pattern: "crm_stage_integrity_cas_enabled"
    - from: "src/lib/domain/orders.ts moveOrderToStage"
      to: "order_stage_history table"
      via: "supabase.from('order_stage_history').insert({...})"
      pattern: "from\\('order_stage_history'\\).insert"
    - from: "src/lib/domain/orders.ts CAS UPDATE"
      to: "Supabase JS v2 .update().eq().select('id')"
      via: ".eq('stage_id', previousStageId).select('id')"
      pattern: "\\.eq\\('stage_id', previousStageId\\)"
    - from: "src/app/actions/orders.ts moveOrderToStage server action"
      to: "Kanban UI (Plan 05)"
      via: "error === 'stage_changed_concurrently' preservado del domain al caller"
      pattern: "stage_changed_concurrently"
    - from: "src/app/actions/orders.ts getAuthContext"
      to: "DomainContext.actorId"
      via: "return { workspaceId, userId: user.id }"
      pattern: "userId: user.id"
    - from: "src/app/api/mobile/orders/[id]/stage/route.ts"
      to: "DomainContext.actorId/actorLabel"
      via: "requireMobileAuth retorna { user, workspaceId, membership }; actorId=authCtx.user.id, actorLabel='mobile-api'"
      pattern: "'mobile-api'"
---

<objective>
Wave 1 — Domain compare-and-swap + audit log insert. Reescribe `moveOrderToStage` en `src/lib/domain/orders.ts` para:

1. **Short-circuit same-stage** (antes del CAS) — Pitfall 2 RESEARCH: `if (previousStageId === params.newStageId) return success`.
2. **Flag-gated CAS** (D-17) — cuando `crm_stage_integrity_cas_enabled=true`, el UPDATE incluye `.eq('stage_id', previousStageId).select('id')` y detecta rechazo via `!updated || updated.length === 0` (Pattern 1 RESEARCH + Assumption A1).
3. **Legacy path** cuando flag=false — UPDATE sin `.eq('stage_id', prev)`, comportamiento byte-identical al actual.
4. **Audit log insert always** (D-18, no flag, additive) — tras UPDATE exitoso (ambos paths) escribe row a `order_stage_history` con `source` mapeado, `actor_id/actor_label/cascade_depth/trigger_event` populados desde `DomainContext`. INSERT es best-effort: error se loggea y se continua (Pitfall 3).
5. **Callers actualizados** (D-06) — `getAuthContext` EXTENDIDO para exponer `userId` (BLOCKER 1 fix — hoy retorna solo `{workspaceId}` pero el `user.id` ya esta in-scope via `supabase.auth.getUser()`), `server action moveOrderToStage`, `bulkMoveOrdersToStage` (return shape cambia — Pitfall 12), mobile API PATCH (BLOCKER 2 fix — usa `requireMobileAuth.user.id` como actorId + label `'mobile-api'` como fallback hardcoded), `crm-writer/two-step` — todos pasan `actorId/actorLabel` y narrow-ean el error `stage_changed_concurrently` distinctamente para que Plan 05 UI pueda mostrar toast dedicado.

Tests cubren (D-25): CAS rechaza 2do UPDATE paralelo, legacy path preserva comportamiento, same-stage short-circuit, history insert failure no-bloquea move, append-only trigger enforcement. Tests usan `describe.skipIf(!TEST_STAGE_A)` para degradar gracefully cuando env vars no disponibles (WARNING 2 fix).

Purpose: El fix estructural del bug de "pedidos que se devuelven". Sin CAS, read-then-write race condition entre bulk+automation (H2 25-30%) o entre 2 automations (consecuencia secundaria de H1 70-75%) puede sobreescribir un move manual. CAS garantiza que si otra fuente ya movio el pedido entre nuestro SELECT y UPDATE, el UPDATE falla y nosotros informamos al caller en lugar de sobreescribir silenciosamente. Plan 02 tambien habilita la visibilidad (audit log) que Plan 03 consume para kill-switch.

**CRITICAL — Regla 6:** El flag `crm_stage_integrity_cas_enabled` default `false` (Plan 01 seed) + fallback de `getPlatformConfig(..., false)` = deploy inicial es NO-OP en runtime. El legacy path se ejecuta hasta que el usuario flipee el flag manualmente. El audit log SI se escribe desde el primer move post-deploy (D-18), pero solo como additive observation.

**CRITICAL — Regla 1:** Push a Vercel al finalizar Plan 02 es seguro: flag=false → comportamiento actual. El usuario puede pedir que se flippee el flag en un workspace de staging/test tras deploy para verificar CAS.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/crm-stage-integrity/CONTEXT.md — D-04 (CAS idiom), D-05 (no advisory lock/version field), D-06 (todos los callers), D-12 (orden CAS → history → emit), D-13 (append-only RLS), D-15 (callers narrow error), D-17 (flag CAS), D-18 (history sin flag), Pitfall 12 (bulk return shape)
@.planning/standalone/crm-stage-integrity/RESEARCH.md §Pattern 1 lineas 250-378 (codigo canonico CAS), §Pitfall 1 lineas 892-899 (`.select('id')` mandatorio), §Pitfall 2 lineas 901-909 (short-circuit same-stage antes del CAS), §Pitfall 3 lineas 911-919 (history insert best-effort), §Pitfall 10 lineas 981-996 (actor_id mapping), §Pitfall 11 lineas 998-1006 (cache TTL 30s), §Pitfall 12 lineas 1008-1016 (bulk failed list), §Example 1 (ver Pattern 1), §Assumption A1 (array vacio vs null)
@.planning/standalone/crm-stage-integrity/PATTERNS.md §Wave 1 Domain CAS (lineas 289-522) — incluye shape exacto de types.ts, orders.ts, actions/orders.ts, two-step.ts
@src/lib/domain/orders.ts — linea 557-648 (moveOrderToStage actual — a reemplazar)
@src/lib/domain/types.ts — linea 15-21 (DomainContext actual — a extender)
@src/lib/domain/platform-config.ts — consumer getPlatformConfig<T>(key, fallback) (cache 30s fail-open)
@src/lib/agents/crm-writer/two-step.ts — lineas 140-189 patron idempotency (Shared Pattern 3 PATTERNS.md)
@src/app/actions/orders.ts — lineas 76-86 (getAuthContext — a extender con userId), 518-524, 601-613, 810-831 (moveOrderToStage action + bulk action a modificar)
@src/app/api/mobile/orders/[id]/stage/route.ts — linea 36 (`requireMobileAuth(req)` retorna `{user, workspaceId, membership}`), linea 51 (caller mobile API domain call)
@src/app/api/mobile/_lib/auth.ts — confirmado retorna `MobileAuthContext { user: User, workspaceId: string, membership }` — NO es necesario extender, solo consumir `user.id`
@src/__tests__/integration/crm-bots/reader.test.ts — scaffold env vars + admin client (precedent para los 2 tests nuevos)
@CLAUDE.md §Regla 3 (domain layer unica fuente), §Regla 1 (push a Vercel), §Regla 6 (flag default false)

<interfaces>
<!-- DomainContext ANTES (types.ts:15-21) -->
export interface DomainContext {
  workspaceId: string
  source: string  // 'server-action' | 'tool-handler' | 'automation' | 'webhook' | 'adapter' | 'mobile-api'
  cascadeDepth?: number
}

<!-- DomainContext DESPUES (Plan 02 modifica) -->
export interface DomainContext {
  workspaceId: string
  source: string
  cascadeDepth?: number
  actorId?: string | null       // NEW — user_id / automation_id / null
  actorLabel?: string | null    // NEW — human-readable
  triggerEvent?: string | null  // NEW — solo cuando source='automation'
}

<!-- getAuthContext ANTES (src/app/actions/orders.ts:76-86) -->
async function getAuthContext(): Promise<{ workspaceId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  return { workspaceId }
}

<!-- getAuthContext DESPUES (Plan 02 Task 2 Paso 0 modifica — BLOCKER 1 fix) -->
async function getAuthContext(): Promise<{ workspaceId: string; userId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  return { workspaceId, userId: user.id }  // NEW — userId ya estaba in-scope (linea 78), solo no se retornaba
}

<!-- requireMobileAuth signature (existing — src/app/api/mobile/_lib/auth.ts:64-98) -->
export interface MobileAuthContext {
  user: User              // Supabase User object con .id (uuid)
  workspaceId: string
  membership: MobileMembership
}
export async function requireMobileAuth(req: Request): Promise<MobileAuthContext>
// → usamos authCtx.user.id como actorId + label hardcoded 'mobile-api'

<!-- emitOrderStageChanged signature (existing — src/lib/automations/trigger-emitter.ts:66-90) -->
export async function emitOrderStageChanged(data: {
  workspaceId: string
  orderId: string
  previousStageId: string
  newStageId: string
  pipelineId: string
  contactId: string | null
  previousStageName?: string
  newStageName?: string
  pipelineName?: string
  contactName?: string
  contactPhone?: string
  contactAddress?: string | null
  contactCity?: string | null
  contactDepartment?: string | null
  shippingAddress?: string | null
  shippingCity?: string | null
  shippingDepartment?: string | null
  orderValue?: number | null
  orderName?: string | null
  orderDescription?: string | null
  trackingNumber?: string | null
  carrier?: string | null
  cascadeDepth?: number
}): Promise<void>
// El replacement block en Task 1 preserva nombres de parametros exactos.

<!-- moveOrderToStage signature (sin cambios, solo interno) -->
export async function moveOrderToStage(
  ctx: DomainContext,
  params: MoveOrderToStageParams
): Promise<DomainResult<MoveOrderToStageResult>>
// Error strings posibles: 'Pedido no encontrado', 'Error al mover el pedido: ...', 'stage_changed_concurrently'

<!-- CAS idiom CANONICO (Pattern 1 RESEARCH, copiable verbatim al plan) -->
const { data: updated, error: updateError } = await supabase
  .from('orders')
  .update({ stage_id: params.newStageId })
  .eq('id', params.orderId)
  .eq('workspace_id', ctx.workspaceId)
  .eq('stage_id', previousStageId)  // ← CAS predicate
  .select('id')                      // ← mandatorio para detectar affected=0
if (updateError) return { success: false, error: `Error al mover el pedido: ${updateError.message}` }
if (!updated || updated.length === 0) {
  const { data: refetch } = await supabase.from('orders').select('stage_id')
    .eq('id', params.orderId).eq('workspace_id', ctx.workspaceId).single()
  return {
    success: false,
    error: 'stage_changed_concurrently',
    data: { currentStageId: refetch?.stage_id ?? null } as any,
  }
}

<!-- Source mapper (Pitfall 10 RESEARCH) -->
function mapDomainSourceToHistorySource(source: string): string {
  switch (source) {
    case 'server-action': return 'manual'
    case 'mobile-api':    return 'manual'  // mobile is still a human user moving a card
    case 'automation':    return 'automation'
    case 'webhook':       return 'webhook'
    case 'tool-handler':
    case 'adapter':       return 'agent'
    case 'robot':         return 'robot'
    default:              return 'system'
  }
}

<!-- Bulk return shape ANTES -->
Promise<ActionResult<{ moved: number }>>

<!-- Bulk return shape DESPUES (Pitfall 12) -->
Promise<ActionResult<{ moved: number; failed: Array<{ orderId: string; reason: string }> }>>
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extender DomainContext + reescribir moveOrderToStage (CAS flag-gated + history insert + short-circuit)</name>
  <read_first>
    - src/lib/domain/types.ts (entero — interface DomainContext linea 15-21)
    - src/lib/domain/orders.ts (lineas 540-670 completos — moveOrderToStage + emit actual)
    - src/lib/domain/platform-config.ts (verificar signature getPlatformConfig + TTL cache behavior)
    - src/lib/agents/crm-writer/two-step.ts lineas 140-189 (Shared Pattern 3 — precedent de `.update().eq(...).select()`)
    - src/lib/automations/trigger-emitter.ts lineas 60-120 (WARNING 1 — confirmar signature de `emitOrderStageChanged`: nombres de parametros EXACTOS como `workspaceId`, `orderId`, `previousStageId`, `newStageId`, `pipelineId`, `contactId`, `contactName`, etc.)
    - .planning/standalone/crm-stage-integrity/RESEARCH.md §Pattern 1 lineas 250-378 (codigo canon completo), §Pitfall 1, §Pitfall 2, §Pitfall 3, §Pitfall 10, §Assumption A1
    - .planning/standalone/crm-stage-integrity/PATTERNS.md §Wave 1 `src/lib/domain/orders.ts` (lineas 318-413 — core pattern), §types.ts MODIFY (lineas 296-315)
    - .planning/standalone/crm-stage-integrity/CONTEXT.md §Decisions D-04, D-05, D-06, D-12, D-17, D-18
  </read_first>
  <behavior>
    - Test 1 (mock-based unit): con flag OFF + currentStageId=A + newStageId=B, se llama UPDATE sin `.eq('stage_id', A)`, se inserta row a order_stage_history con `source='manual'`, se emite trigger. Comportamiento existing preservado.
    - Test 2 (mock-based unit): con flag OFF + currentStageId=A + newStageId=A (same-stage drop), NO se llama UPDATE, NO se inserta history, retorna `success: true` con previousStageId=newStageId=A.
    - Test 3 (mock-based unit): con flag ON + el UPDATE mockeado retorna `{data: []}`, re-fetch retorna `{stage_id: 'C'}`, resultado es `{success: false, error: 'stage_changed_concurrently', data: {currentStageId: 'C'}}`. NO se inserta row a history (CAS rejected ≡ no UPDATE committed).
    - Test 4 (mock-based unit): con flag ON + UPDATE retorna `{data: [{id: X}]}`, se inserta row a history + emite trigger, retorna success.
    - Test 5 (mock-based unit): history insert mockea error → moveOrderToStage STILL retorna success (Pitfall 3 best-effort); `console.error` invocado con mensaje conteniendo 'history insert failed'.
  </behavior>
  <action>
    **Paso 1 — MODIFICAR `src/lib/domain/types.ts`:**

    Agregar 3 campos opcionales a `DomainContext` (NO cambiar `workspaceId` ni `source` ni `cascadeDepth`):

    ```typescript
    export interface DomainContext {
      workspaceId: string
      source: string
      cascadeDepth?: number
      // NEW — populated by caller for order_stage_history audit trail
      actorId?: string | null
      actorLabel?: string | null
      triggerEvent?: string | null  // only when source='automation'
    }
    ```

    NO cambiar `DomainResult` — el error sigue siendo string (`'stage_changed_concurrently'` es un string-marker literal).

    **Paso 2 — MODIFICAR `src/lib/domain/orders.ts`:**

    Agregar import al tope del archivo (despues de imports existentes):
    ```typescript
    import { getPlatformConfig } from '@/lib/domain/platform-config'
    ```

    Agregar helper al archivo (despues del import block, antes de las exports):
    ```typescript
    /**
     * Map DomainContext.source to order_stage_history.source CHECK constraint values.
     * Pitfall 10 RESEARCH: source column is the discriminator; actor_id/actor_label interpret within that source.
     */
    function mapDomainSourceToHistorySource(source: string): string {
      switch (source) {
        case 'server-action':
          return 'manual'
        case 'mobile-api':
          return 'manual'  // mobile is still a human user moving a card
        case 'automation':
          return 'automation'
        case 'webhook':
          return 'webhook'
        case 'tool-handler':
        case 'adapter':
          return 'agent'
        case 'robot':
          return 'robot'
        default:
          return 'system'
      }
    }
    ```

    Reemplazar el cuerpo de `moveOrderToStage` (lineas 557-648) con la siguiente implementacion. El try/catch externo se preserva. NO tocar la firma exportada. **Los parametros de `emitOrderStageChanged` deben coincidir byte-identical con la signature existing verificada en <read_first> (WARNING 1):**

    ```typescript
    export async function moveOrderToStage(
      ctx: DomainContext,
      params: MoveOrderToStageParams
    ): Promise<DomainResult<MoveOrderToStageResult>> {
      const supabase = createAdminClient()

      try {
        // Step 1: read current order state (preserva seleccion de shipping/contact fields para rich trigger context)
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

        // Short-circuit: same-stage drop is a no-op success (Pitfall 2 RESEARCH — evita falso CAS reject)
        if (previousStageId === params.newStageId) {
          return {
            success: true,
            data: {
              orderId: params.orderId,
              previousStageId,
              newStageId: params.newStageId,
            },
          }
        }

        // Step 2: flag-gated CAS (D-17)
        const casEnabled = await getPlatformConfig<boolean>(
          'crm_stage_integrity_cas_enabled',
          false,  // fail-closed: default off para rollout (Regla 6)
        )

        if (casEnabled) {
          // CAS: .eq('stage_id', previousStageId) es el swap predicate
          // .select('id') es CRITICO — sin el, data es null siempre (Pitfall 1 RESEARCH)
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

          // CAS REJECTED: array vacio = 0 filas matcharon (Assumption A1 + PostgREST docs)
          if (!updated || updated.length === 0) {
            // Re-fetch current stage para que el caller pueda mostrarlo en toast
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
          // Legacy path (flag off) — byte-identical al comportamiento actual
          const { error: updateError } = await supabase
            .from('orders')
            .update({ stage_id: params.newStageId })
            .eq('id', params.orderId)
            .eq('workspace_id', ctx.workspaceId)

          if (updateError) {
            return { success: false, error: `Error al mover el pedido: ${updateError.message}` }
          }
        }

        // Step 3: INSERT order_stage_history (D-18: SIN flag, additive desde deploy)
        // Best-effort: failure logged but does NOT block the move (Pitfall 3 RESEARCH)
        const historySource = mapDomainSourceToHistorySource(ctx.source)
        const { error: historyError } = await supabase
          .from('order_stage_history')
          .insert({
            order_id: params.orderId,
            workspace_id: ctx.workspaceId,
            previous_stage_id: previousStageId,
            new_stage_id: params.newStageId,
            source: historySource,
            actor_id: ctx.actorId ?? null,
            actor_label: ctx.actorLabel ?? null,
            cascade_depth: ctx.cascadeDepth ?? 0,
            trigger_event: ctx.triggerEvent ?? null,
          })

        if (historyError) {
          // NON-FATAL: move already succeeded; losing audit row acceptable
          console.error('[moveOrderToStage] history insert failed:', historyError.message)
        }

        // Step 4: fetch stage/pipeline/contact names + emit trigger
        // (PRESERVAR parametros exactos de emitOrderStageChanged signature — WARNING 1)
        const [
          { data: prevStage },
          { data: newStage },
          { data: pipeline },
          { data: contact },
        ] = await Promise.all([
          supabase.from('pipeline_stages').select('name').eq('id', previousStageId).single(),
          supabase.from('pipeline_stages').select('name').eq('id', params.newStageId).single(),
          supabase.from('pipelines').select('name').eq('id', currentOrder.pipeline_id).single(),
          currentOrder.contact_id
            ? supabase.from('contacts').select('name, phone, address, city, department')
                .eq('id', currentOrder.contact_id).eq('workspace_id', ctx.workspaceId).single()
            : Promise.resolve({ data: null }),
        ])

        if (previousStageId !== params.newStageId) {
          await emitOrderStageChanged({
            workspaceId: ctx.workspaceId,
            orderId: params.orderId,
            previousStageId,
            newStageId: params.newStageId,
            pipelineId: currentOrder.pipeline_id,
            contactId: currentOrder.contact_id ?? null,
            previousStageName: prevStage?.name,
            newStageName: newStage?.name,
            pipelineName: pipeline?.name,
            contactName: contact?.name,
            contactPhone: contact?.phone,
            contactAddress: contact?.address,
            contactCity: contact?.city,
            contactDepartment: contact?.department,
            shippingAddress: currentOrder.shipping_address,
            shippingCity: currentOrder.shipping_city,
            shippingDepartment: currentOrder.shipping_department,
            orderValue: currentOrder.total_value,
            orderName: currentOrder.name,
            orderDescription: currentOrder.description,
            trackingNumber: currentOrder.tracking_number,
            carrier: currentOrder.carrier,
            cascadeDepth: ctx.cascadeDepth,
          })
        }

        return {
          success: true,
          data: {
            orderId: params.orderId,
            previousStageId,
            newStageId: params.newStageId,
          },
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { success: false, error: message }
      }
    }
    ```

    NOTAS CRITICAS:
    - Orden D-12: CAS UPDATE → INSERT history → emit trigger. Si UPDATE falla o CAS reject, history NO se escribe (consistencia: history solo contiene cambios efectivos).
    - `.select('id')` es MANDATORIO cuando flag ON — sin el, `data` es `null` siempre (Pitfall 1).
    - Short-circuit same-stage ANTES del CAS — Pitfall 2.
    - `console.error` en history failure, NO return error — Pitfall 3 (move succeeded, audit row is best-effort).
    - El source mapper cubre los 6 valores actuales de `DomainContext.source` (incluye `'mobile-api'`) + mapea a 7 valores de CHECK constraint.
    - `emitOrderStageChanged` parametros DEBEN matchear byte-identical con la signature existing (WARNING 1 — verificada en <read_first>).
  </action>
  <verify>
    <automated>grep -q "actorId?: string | null" src/lib/domain/types.ts</automated>
    <automated>grep -q "actorLabel?: string | null" src/lib/domain/types.ts</automated>
    <automated>grep -q "triggerEvent?: string | null" src/lib/domain/types.ts</automated>
    <automated>grep -q "getPlatformConfig" src/lib/domain/orders.ts</automated>
    <automated>grep -q "mapDomainSourceToHistorySource" src/lib/domain/orders.ts</automated>
    <automated>grep -q "crm_stage_integrity_cas_enabled" src/lib/domain/orders.ts</automated>
    <automated>grep -q "\.eq('stage_id', previousStageId)" src/lib/domain/orders.ts</automated>
    <automated>grep -q "\.select('id')" src/lib/domain/orders.ts</automated>
    <automated>grep -q "stage_changed_concurrently" src/lib/domain/orders.ts</automated>
    <automated>grep -q "from('order_stage_history')" src/lib/domain/orders.ts</automated>
    <automated>grep -q "if (previousStageId === params.newStageId)" src/lib/domain/orders.ts</automated>
    <automated>grep -A 30 "emitOrderStageChanged(" src/lib/automations/trigger-emitter.ts | grep -q "workspaceId"</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -v node_modules | grep -E "(error TS|src/lib/domain/orders.ts|src/lib/domain/types.ts)" || echo "no domain TS errors"</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/domain/types.ts` tiene los 3 campos nuevos `actorId?`, `actorLabel?`, `triggerEvent?` en `DomainContext`.
    - `src/lib/domain/orders.ts` importa `getPlatformConfig` de `@/lib/domain/platform-config`.
    - `src/lib/domain/orders.ts` define helper `mapDomainSourceToHistorySource(source: string): string` — case `'mobile-api'` mapea a `'manual'`.
    - `moveOrderToStage` short-circuitea con `if (previousStageId === params.newStageId) return { success: true, ... }`.
    - `moveOrderToStage` llama `getPlatformConfig<boolean>('crm_stage_integrity_cas_enabled', false)`.
    - Branch `if (casEnabled)` contiene `.eq('stage_id', previousStageId)` y `.select('id')` sobre el `.update(...)` call.
    - Check `if (!updated || updated.length === 0)` presente + re-fetch + `return { success: false, error: 'stage_changed_concurrently', data: { currentStageId: ... } }`.
    - Branch `else` (flag off) preserva UPDATE sin `.eq('stage_id', ...)` — comportamiento actual.
    - `.from('order_stage_history').insert({...})` presente DESPUES del UPDATE exitoso, antes del emit.
    - Historia insert wrappeado en patron `if (historyError) console.error(...)` — NO return error.
    - Emit trigger preservado (`emitOrderStageChanged`) con signature existing intacta (WARNING 1 — nombres de parametros idem).
    - `npx tsc --noEmit` no reporta errores nuevos en `src/lib/domain/orders.ts` ni `src/lib/domain/types.ts`.
  </acceptance_criteria>
  <done>
    - Commit atomico: `feat(crm-stage-integrity): add CAS + audit log to moveOrderToStage (flag-gated)`
    - NO push a Vercel todavia — Tasks 2-4 modifican callers, luego push conjunto.
  </done>
</task>

<task type="auto">
  <name>Task 2: Actualizar callers — extender getAuthContext + server action + bulk action (+failed list) + mobile API + crm-writer two-step</name>
  <read_first>
    - src/app/actions/orders.ts lineas 1-100 (imports + `getAuthContext` completo lineas 76-86 — **BLOCKER 1 CRITICO**: confirmar que hoy retorna SOLO `{workspaceId}` y que el `user.id` esta in-scope en linea 78)
    - src/app/actions/orders.ts lineas 500-835 completos (moveOrderToStage action + bulkMoveOrdersToStage action + todos los otros callers de getAuthContext)
    - `grep -n "getAuthContext" src/app/actions/orders.ts` — identificar TODOS los callers que ahora reciben `{workspaceId, userId}` en lugar de solo `{workspaceId}` (debe preservarse backward-compat via destructuring que ignore `userId` o explicit re-type)
    - src/app/api/mobile/orders/[id]/stage/route.ts (entero — **BLOCKER 2 CRITICO**: hoy usa `const { workspaceId } = await requireMobileAuth(req)`, el helper retorna `{user, workspaceId, membership}` — cambiar a destructurar `user` tambien)
    - src/app/api/mobile/_lib/auth.ts (entero — confirmar shape de `MobileAuthContext { user: User, workspaceId, membership }`; `user.id` es Supabase uuid)
    - src/lib/agents/crm-writer/two-step.ts lineas 100-200 (confirm branch donde llama tools → domain)
    - .planning/standalone/crm-stage-integrity/PATTERNS.md §Wave 1 actions/orders.ts (lineas 416-464), §two-step.ts (lineas 468-488)
    - .planning/standalone/crm-stage-integrity/RESEARCH.md §Pitfall 12 (bulk return shape)
    - .planning/standalone/crm-stage-integrity/CONTEXT.md §Decisions D-06 (todos los callers narrow error)
  </read_first>
  <action>
    **Paso 0 — MODIFICAR `getAuthContext` en `src/app/actions/orders.ts` (lineas 76-86) — BLOCKER 1 fix:**

    El helper hoy retorna `{ workspaceId: string } | { error: string }` pero el `user.id` ya esta in-scope (linea 78: `const { data: { user } } = await supabase.auth.getUser()`). Extenderlo para exponer `userId`:

    ```typescript
    async function getAuthContext(): Promise<{ workspaceId: string; userId: string } | { error: string }> {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { error: 'No autenticado' }

      const cookieStore = await cookies()
      const workspaceId = cookieStore.get('morfx_workspace')?.value
      if (!workspaceId) return { error: 'No hay workspace seleccionado' }

      return { workspaceId, userId: user.id }  // NEW — userId was already available, just not returned
    }
    ```

    **NOTA sobre `actorLabel`:** Tablas con user display-name (`workspace_members.full_name`, `users_profiles.full_name`, etc.) NO son accesibles limpiamente desde un server action sin round-trip adicional + RLS considerations. Decision: usar fallback hardcoded `'user:' + userId.slice(0,8)` como short identifier (aceptable — `source='manual'` + `actor_id=user.id` da trazabilidad completa; `actor_label` es display-only enrichment). Documentar en LEARNINGS.md (Plan 05 Task 5) como deuda tecnica follow-up: "join a workspace_members.full_name en futuro para actor_label mas humano".

    **Verificar que NINGUN otro caller de `getAuthContext` en el archivo rompe:**

    ```bash
    grep -n "getAuthContext()" src/app/actions/orders.ts
    ```

    Todos los callers usan patron `const auth = await getAuthContext(); if ('error' in auth) return auth; const { workspaceId } = auth` — el destructuring solo de `workspaceId` ignora silenciosamente el nuevo campo `userId` (backward-compat preservada). Confirmar con grep que NO hay `const { workspaceId, ...rest } = auth` ni spread operators que romperian.

    **Paso 1 — MODIFICAR `src/app/actions/orders.ts moveOrderToStage` action (lineas ~518-614):**

    En la construccion del `ctx: DomainContext`, agregar `actorId` y `actorLabel`. Se destructura `userId` del auth context extendido en Paso 0:

    ```typescript
    const auth = await getAuthContext()
    if ('error' in auth) return auth
    const { workspaceId, userId } = auth  // userId ahora disponible (Paso 0 BLOCKER 1 fix)

    const ctx: DomainContext = {
      workspaceId,
      source: 'server-action',
      actorId: userId,                              // NEW — real user.id
      actorLabel: `user:${userId.slice(0, 8)}`,     // NEW — short identifier fallback (display-name follow-up)
    }
    ```

    En el bloque de manejo de error del resultado del domain:

    ```typescript
    const result = await domainMoveOrderToStage(ctx, { orderId, newStageId })

    if (!result.success) {
      // NEW: narrow string-marker asi el Kanban puede render toast especifico (D-15)
      if (result.error === 'stage_changed_concurrently') {
        return { error: 'stage_changed_concurrently', data: result.data }
      }
      return { error: result.error || 'Error al mover el pedido' }
    }
    ```

    NO cambiar otras partes del action (WIP-limit checks, revalidatePath, etc).

    **Paso 2 — MODIFICAR `bulkMoveOrdersToStage` (lineas ~810-831) — cambiar return shape (Pitfall 12):**

    ```typescript
    export async function bulkMoveOrdersToStage(
      orderIds: string[],
      newStageId: string,
    ): Promise<ActionResult<{ moved: number; failed: Array<{ orderId: string; reason: string }> }>> {
      const auth = await getAuthContext()
      if ('error' in auth) return auth
      const { workspaceId, userId } = auth

      const ctx: DomainContext = {
        workspaceId,
        source: 'server-action',
        actorId: userId,
        actorLabel: `user:${userId.slice(0, 8)}`,
      }

      let moved = 0
      const failed: Array<{ orderId: string; reason: string }> = []
      for (const orderId of orderIds) {
        const result = await domainMoveOrderToStage(ctx, { orderId, newStageId })
        if (result.success) {
          moved++
        } else {
          failed.push({ orderId, reason: result.error || 'unknown' })
        }
      }

      revalidatePath('/crm/pedidos')
      return { success: true, data: { moved, failed } }
    }
    ```

    Si hay algun caller del bulk action existente que espera la shape vieja `{moved: number}`, buscarlos con:
    ```bash
    grep -rn "bulkMoveOrdersToStage" src/ --include="*.ts" --include="*.tsx"
    ```
    y actualizarlos para que acepten la nueva shape `{moved, failed}`. Si no hay usos en UI, solo este archivo cambia.

    **Paso 3 — MODIFICAR `src/app/api/mobile/orders/[id]/stage/route.ts` — BLOCKER 2 fix:**

    Hoy linea 36 destructura solo `workspaceId`: `const { workspaceId } = await requireMobileAuth(req)`. El helper retorna `{user, workspaceId, membership}` (confirmado en `src/app/api/mobile/_lib/auth.ts:64-98`). Cambiar a:

    ```typescript
    const authCtx = await requireMobileAuth(req)
    const { workspaceId, user } = authCtx  // user.id disponible (Supabase User type)
    const { id: orderId } = await ctx.params

    // ... JSON parsing + schema validation preservados ...

    const result = await domainMoveOrderToStage(
      {
        workspaceId,
        source: 'mobile-api',
        actorId: user.id,              // NEW — real user.id del JWT
        actorLabel: 'mobile-api',       // NEW — label hardcoded (no display-name lookup en mobile route)
      },
      { orderId, newStageId: parsed.data.stageId }
    )

    if (!result.success) {
      const msg = (result.error ?? '').toLowerCase()
      if (msg.includes('no encontrad')) {
        throw new MobileNotFoundError('not_found', result.error ?? 'not_found')
      }
      // NEW: narrow stage_changed_concurrently como 409 Conflict
      if (result.error === 'stage_changed_concurrently') {
        return NextResponse.json(
          {
            error: 'stage_changed_concurrently',
            currentStageId: (result.data as { currentStageId?: string | null })?.currentStageId ?? null,
          },
          { status: 409, headers: { 'Cache-Control': 'no-store' } },
        )
      }
      throw new Error(result.error ?? 'move_stage_failed')
    }
    ```

    409 Conflict es standard HTTP para CAS rejection; mobile client (Phase 43 app) podra distinguirlo.

    NO tocar la rama 200 OK existing (la que construye `MoveOrderStageResponseSchema.parse(...)`).

    **Paso 4 — MODIFICAR `src/lib/agents/crm-writer/two-step.ts` confirm branch (lineas ~140-189 segun PATTERNS §Wave 1 two-step):**

    Localizar el punto donde el confirm ejecuta el tool que dispara `moveOrderToStage` (via agent tool handler que a su vez llama domain). El frame de failure existing (~lines 139-157 segun PATTERNS.md) YA persiste arbitrary error JSONB — documentar en un comment que `stage_changed_concurrently` es un valor legitimo:

    Agregar comment encima del persist-failure block (ej. linea ~155):

    ```typescript
    // When the underlying tool dispatch returns `moveOrderToStage` error
    // `'stage_changed_concurrently'`, we persist it verbatim to `crm_bot_actions.error`
    // so sandbox UI can render a dedicated toast (D-06 cross-agent contract).
    // Do NOT rewrite to a generic message — preserve the string-marker.
    ```

    Si el codigo actual mapea errores a strings genericos antes de persistir, ajustar para preservar `stage_changed_concurrently` cuando detecte ese literal:

    ```typescript
    const errorToPersist = (
      dispatchErr &&
      typeof dispatchErr === 'object' &&
      'code' in dispatchErr &&
      dispatchErr.code === 'stage_changed_concurrently'
    )
      ? { code: 'stage_changed_concurrently', message: 'Pedido movido por otra fuente' }
      : dispatchErr  // existing behavior
    ```

    (El shape exacto depende del codigo actual — preservar comportamiento existing + AGREGAR narrowing del marker). NO cambiar la logica de idempotency (`.update().eq('status', 'proposed')` se preserva).

    Ajuste estrictamente aditivo — si el archivo no tiene este exact shape, solo agregar el comment + preservar el literal `stage_changed_concurrently` en cualquier path que vaya a `crm_bot_actions.error`.
  </action>
  <verify>
    <automated>grep -q "userId: string" src/app/actions/orders.ts</automated>
    <automated>grep -q "userId: user.id" src/app/actions/orders.ts</automated>
    <automated>grep -q "actorId: userId" src/app/actions/orders.ts</automated>
    <automated>grep -qE "actorLabel: .user:" src/app/actions/orders.ts</automated>
    <automated>grep -q "stage_changed_concurrently" src/app/actions/orders.ts</automated>
    <automated>grep -q "failed: Array" src/app/actions/orders.ts</automated>
    <automated>grep -qE "(failed: .*\{ orderId: string; reason: string \})" src/app/actions/orders.ts</automated>
    <automated>grep -q "'mobile-api'" src/app/api/mobile/orders/\[id\]/stage/route.ts</automated>
    <automated>grep -q "actorId: user.id" src/app/api/mobile/orders/\[id\]/stage/route.ts</automated>
    <automated>grep -q "stage_changed_concurrently" src/app/api/mobile/orders/\[id\]/stage/route.ts</automated>
    <automated>grep -qE "status: 409" src/app/api/mobile/orders/\[id\]/stage/route.ts</automated>
    <automated>grep -q "stage_changed_concurrently" src/lib/agents/crm-writer/two-step.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -v node_modules | grep -E "(error TS)" | head -20 || echo "no TS errors"</automated>
  </verify>
  <acceptance_criteria>
    - `getAuthContext` en `src/app/actions/orders.ts` retorna `{ workspaceId: string; userId: string } | { error: string }` — tipo y runtime value updated (BLOCKER 1).
    - `src/app/actions/orders.ts moveOrderToStage` action pasa `actorId = userId` y `actorLabel = 'user:' + userId.slice(0,8)` en el `ctx`.
    - `moveOrderToStage` action narrows `stage_changed_concurrently` distinto del error generico.
    - `bulkMoveOrdersToStage` signature retorna `{ moved: number; failed: Array<{ orderId: string; reason: string }> }` (Pitfall 12 / Open Question 4).
    - `src/app/api/mobile/orders/[id]/stage/route.ts` destructura `user` de `requireMobileAuth` + pasa `actorId: user.id, actorLabel: 'mobile-api'` al DomainContext (BLOCKER 2).
    - Mobile route retorna 409 Conflict para `stage_changed_concurrently` con payload `{ error, currentStageId }`.
    - `src/lib/agents/crm-writer/two-step.ts` preserva string-marker `stage_changed_concurrently` (no lo rewrite a mensaje generico).
    - `npx tsc --noEmit` no introduce errores nuevos en estos 4 archivos.
    - NO se ejecuto test runner todavia (Task 3 crea los tests).
  </acceptance_criteria>
  <done>
    - Commit atomico: `feat(crm-stage-integrity): extend getAuthContext + update callers for CAS + actor_id + bulk failed list`
    - NO push todavia.
  </done>
</task>

<task type="auto">
  <name>Task 3: Crear tests — orders-cas integration + order-stage-history-rls integration + .env.test.example</name>
  <read_first>
    - src/__tests__/integration/crm-bots/reader.test.ts (entero — scaffold env TEST_BASE_URL, TEST_WORKSPACE_ID, TEST_API_KEY, beforeAll pattern)
    - src/lib/domain/orders.ts (la version nueva modificada en Task 1 — verificar signature `moveOrderToStage(ctx, params)`)
    - vitest.config.ts (existing — `exclude` de node_modules/.next/dist/.claude; no `environment` set = default `node` — usable as-is para integration tests)
    - .planning/standalone/crm-stage-integrity/PATTERNS.md §Wave 1 test CREATE (lineas 492-522), §Wave 4 `order-stage-history-rls.test.ts` (lineas 918-945)
    - .planning/standalone/crm-stage-integrity/RESEARCH.md §Validation Architecture (lineas 1321-1359) — test map + sampling
    - package.json — verificar que `vitest ^1.6.1` presente (si, line 104)
  </read_first>
  <action>
    **Paso 1 — CREAR `.env.test.example` en la raiz del repo (WARNING 2):**

    ```bash
    # Copy to .env.test (gitignored) and fill with real values for integration tests.
    # These tests hit REAL Supabase tables; never use production workspace/stage ids.

    # Supabase admin (required — createClient(SUPABASE_URL, SERVICE_ROLE_KEY) bypasses RLS)
    NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt-from-supabase-dashboard>

    # Test workspace (required — an isolated workspace NOT used in production)
    # Create manually: INSERT INTO workspaces (name) VALUES ('TEST — crm-stage-integrity');
    TEST_WORKSPACE_ID=<uuid>

    # Test pipeline + 3 distinct stages within that pipeline (required for CAS concurrency test)
    # Seed helper SQL:
    #   INSERT INTO pipelines (workspace_id, name) VALUES ('<TEST_WORKSPACE_ID>', 'Test Pipeline') RETURNING id;
    #   INSERT INTO pipeline_stages (pipeline_id, name, stage_order) VALUES
    #     ('<TEST_PIPELINE_ID>', 'A', 0),
    #     ('<TEST_PIPELINE_ID>', 'B', 1),
    #     ('<TEST_PIPELINE_ID>', 'C', 2)
    #   RETURNING id;
    TEST_PIPELINE_ID=<uuid>
    TEST_STAGE_A=<uuid>
    TEST_STAGE_B=<uuid>
    TEST_STAGE_C=<uuid>

    # Optional — only used if integrating with Inngest test engine in future phase
    # INNGEST_DEV_URL=http://localhost:8288
    ```

    **Paso 2 — CREAR `src/__tests__/integration/orders-cas.test.ts`:**

    Usar `describe.skipIf(!process.env.TEST_STAGE_A, ...)` para degradar gracefully cuando env vars missing (WARNING 2 fix — no fail silencioso, tampoco hard error; skip limpio).

    ```typescript
    /**
     * Integration test — CAS rechaza UPDATE concurrente en moveOrderToStage.
     * D-04 + D-25 RESEARCH §Validation Architecture.
     * Requiere env vars — ver .env.test.example en la raiz del repo.
     * Si env vars missing → tests SKIP (no fail, no pass silencioso).
     */
    import { describe, it, expect, beforeEach, afterEach } from 'vitest'
    import { createClient } from '@supabase/supabase-js'
    import { moveOrderToStage } from '@/lib/domain/orders'
    import type { DomainContext } from '@/lib/domain/types'

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
    const TEST_WORKSPACE_ID = process.env.TEST_WORKSPACE_ID ?? ''
    const TEST_PIPELINE_ID = process.env.TEST_PIPELINE_ID ?? ''
    const STAGE_A = process.env.TEST_STAGE_A ?? ''
    const STAGE_B = process.env.TEST_STAGE_B ?? ''
    const STAGE_C = process.env.TEST_STAGE_C ?? ''

    const envReady = Boolean(
      SUPABASE_URL && SERVICE_ROLE_KEY && TEST_WORKSPACE_ID &&
      TEST_PIPELINE_ID && STAGE_A && STAGE_B && STAGE_C
    )

    const admin = envReady ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null

    // Helpers (only invoked when envReady)
    async function seedOrder(stageId: string): Promise<string> {
      const { data, error } = await admin!
        .from('orders')
        .insert({
          workspace_id: TEST_WORKSPACE_ID,
          stage_id: stageId,
          pipeline_id: TEST_PIPELINE_ID,
          name: 'TEST CAS',
        })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    }

    async function setFlag(key: string, value: boolean) {
      await admin!.from('platform_config').update({ value }).eq('key', key)
    }

    async function cleanupOrder(orderId: string) {
      await admin!.from('orders').delete().eq('id', orderId)
    }

    const ctx: DomainContext = {
      workspaceId: TEST_WORKSPACE_ID,
      source: 'server-action',
      actorId: null,
      actorLabel: 'test',
    }

    describe.skipIf(!envReady)('moveOrderToStage CAS (flag ON)', () => {
      let orderId: string

      beforeEach(async () => {
        await setFlag('crm_stage_integrity_cas_enabled', true)
        // esperar cache TTL (30s) o matar lambdas — en local es inmediato
        orderId = await seedOrder(STAGE_A)
      })

      afterEach(async () => {
        await setFlag('crm_stage_integrity_cas_enabled', false)
        await cleanupOrder(orderId)
      })

      it('CAS rechaza 2do UPDATE concurrente con mismo previousStageId', async () => {
        // Ambos intentan mover A→B/C en paralelo, leyendo el mismo previousStageId=A
        const [r1, r2] = await Promise.all([
          moveOrderToStage(ctx, { orderId, newStageId: STAGE_B }),
          moveOrderToStage(ctx, { orderId, newStageId: STAGE_C }),
        ])

        const successes = [r1, r2].filter((r) => r.success)
        const rejections = [r1, r2].filter((r) => !r.success && r.error === 'stage_changed_concurrently')

        expect(successes.length).toBe(1)
        expect(rejections.length).toBe(1)
        expect((rejections[0] as any).data?.currentStageId).toBeDefined()
      })

      it('same-stage drop NO dispara CAS reject (short-circuit Pitfall 2)', async () => {
        const result = await moveOrderToStage(ctx, { orderId, newStageId: STAGE_A })
        expect(result.success).toBe(true)
        // order_stage_history NO recibe row (short-circuit antes del CAS)
        const { count } = await admin!
          .from('order_stage_history')
          .select('id', { count: 'exact', head: true })
          .eq('order_id', orderId)
        expect(count ?? 0).toBe(0)
      })

      it('history insert falla → move sigue exitoso (best-effort Pitfall 3)', async () => {
        // NO podemos mockear facilmente el INSERT de history en integration,
        // pero podemos verificar el comportamiento indirectamente: corriendo con actor_id
        // que viola FK (random uuid no presente en users), el INSERT a history fallara
        // sola la parte de actor_id pero el move ya succeded.
        const result = await moveOrderToStage(
          { ...ctx, actorId: '00000000-0000-0000-0000-000000000000' as any },
          { orderId, newStageId: STAGE_B },
        )
        expect(result.success).toBe(true)
      })
    })

    describe.skipIf(!envReady)('moveOrderToStage legacy (flag OFF)', () => {
      let orderId: string

      beforeEach(async () => {
        await setFlag('crm_stage_integrity_cas_enabled', false)
        orderId = await seedOrder(STAGE_A)
      })

      afterEach(async () => {
        await cleanupOrder(orderId)
      })

      it('flag OFF → UPDATE sin CAS, comportamiento byte-identical al actual', async () => {
        const result = await moveOrderToStage(ctx, { orderId, newStageId: STAGE_B })
        expect(result.success).toBe(true)
        // Historia SI se escribe (D-18 additive)
        const { count } = await admin!
          .from('order_stage_history')
          .select('id', { count: 'exact', head: true })
          .eq('order_id', orderId)
        expect(count ?? 0).toBe(1)
      })
    })
    ```

    **Paso 3 — CREAR `src/__tests__/integration/order-stage-history-rls.test.ts`:**

    ```typescript
    /**
     * Integration test — order_stage_history es append-only (D-13 + D-25).
     * Verifica que el trigger plpgsql `prevent_order_stage_history_mutation` bloquea
     * UPDATE/DELETE incluso con service_role (RLS bypass).
     * SKIP si env vars missing (WARNING 2).
     */
    import { describe, it, expect, beforeEach, afterEach } from 'vitest'
    import { createClient } from '@supabase/supabase-js'

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
    const TEST_WORKSPACE_ID = process.env.TEST_WORKSPACE_ID ?? ''
    const TEST_PIPELINE_ID = process.env.TEST_PIPELINE_ID ?? ''
    const STAGE_A = process.env.TEST_STAGE_A ?? ''

    const envReady = Boolean(
      SUPABASE_URL && SERVICE_ROLE_KEY && TEST_WORKSPACE_ID &&
      TEST_PIPELINE_ID && STAGE_A
    )

    const admin = envReady ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null

    describe.skipIf(!envReady)('order_stage_history append-only enforcement', () => {
      let orderId: string
      let historyId: string

      beforeEach(async () => {
        const { data: order, error: oerr } = await admin!
          .from('orders')
          .insert({
            workspace_id: TEST_WORKSPACE_ID,
            stage_id: STAGE_A,
            pipeline_id: TEST_PIPELINE_ID,
            name: 'TEST RLS',
          })
          .select('id')
          .single()
        if (oerr) throw oerr
        orderId = order.id

        const { data: row, error: herr } = await admin!
          .from('order_stage_history')
          .insert({
            order_id: orderId,
            workspace_id: TEST_WORKSPACE_ID,
            previous_stage_id: null,
            new_stage_id: STAGE_A,
            source: 'system',
            actor_label: 'rls-test',
          })
          .select('id')
          .single()
        if (herr) throw herr
        historyId = row.id
      })

      afterEach(async () => {
        // ON DELETE CASCADE del orders FK borra la history row tambien
        await admin!.from('orders').delete().eq('id', orderId)
      })

      it('INSERT succeeds', async () => {
        expect(historyId).toBeTruthy()
      })

      it('UPDATE rejected by trigger with service_role', async () => {
        const { error } = await admin!
          .from('order_stage_history')
          .update({ source: 'manual' })
          .eq('id', historyId)
        expect(error).not.toBeNull()
        expect(error?.message).toMatch(/append-only/i)
      })

      it('DELETE rejected by trigger with service_role', async () => {
        const { error } = await admin!
          .from('order_stage_history')
          .delete()
          .eq('id', historyId)
        expect(error).not.toBeNull()
        expect(error?.message).toMatch(/append-only/i)
      })
    })
    ```

    Si la infra de CI no tiene env vars, ambos describes SKIP (no fail). Documentar en SUMMARY como deuda tecnica de infra — tests listos para activacion cuando CI este configurado.
  </action>
  <verify>
    <automated>test -f .env.test.example</automated>
    <automated>grep -q "TEST_STAGE_A" .env.test.example</automated>
    <automated>grep -q "TEST_STAGE_B" .env.test.example</automated>
    <automated>grep -q "TEST_STAGE_C" .env.test.example</automated>
    <automated>grep -q "TEST_PIPELINE_ID" .env.test.example</automated>
    <automated>grep -q "TEST_WORKSPACE_ID" .env.test.example</automated>
    <automated>ls src/__tests__/integration/orders-cas.test.ts</automated>
    <automated>ls src/__tests__/integration/order-stage-history-rls.test.ts</automated>
    <automated>grep -q "describe.skipIf" src/__tests__/integration/orders-cas.test.ts</automated>
    <automated>grep -q "describe.skipIf" src/__tests__/integration/order-stage-history-rls.test.ts</automated>
    <automated>grep -q "stage_changed_concurrently" src/__tests__/integration/orders-cas.test.ts</automated>
    <automated>grep -q "Promise.all" src/__tests__/integration/orders-cas.test.ts</automated>
    <automated>grep -q "crm_stage_integrity_cas_enabled" src/__tests__/integration/orders-cas.test.ts</automated>
    <automated>grep -q "append-only" src/__tests__/integration/order-stage-history-rls.test.ts</automated>
    <automated>grep -q "UPDATE rejected" src/__tests__/integration/order-stage-history-rls.test.ts</automated>
    <automated>grep -q "DELETE rejected" src/__tests__/integration/order-stage-history-rls.test.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -v node_modules | grep -E "(src/__tests__/integration/orders-cas|src/__tests__/integration/order-stage-history-rls)" || echo "no TS errors in new test files"</automated>
  </verify>
  <acceptance_criteria>
    - `.env.test.example` en raiz del repo con 7 env vars (5 TEST_* + 2 Supabase) y comentarios explicativos.
    - `src/__tests__/integration/orders-cas.test.ts` creado con 4 tests: CAS reject concurrente, same-stage no-op, history best-effort, legacy path preservado.
    - `src/__tests__/integration/order-stage-history-rls.test.ts` creado con 3 tests: INSERT succeeds, UPDATE rejected, DELETE rejected.
    - Ambos archivos usan `describe.skipIf(!envReady, ...)` para skip limpio cuando env vars missing (NO throw, NO pass silencioso).
    - Ambos archivos importan `createClient` de `@supabase/supabase-js` + estan scoped al `TEST_WORKSPACE_ID` env var.
    - Compilan sin errores TS.
    - Smoke local opcional: `npm test -- --run src/__tests__/integration/order-stage-history-rls.test.ts` — si env vars set → tests corren + pass/fail real; si missing → todos SKIP (vitest output `X skipped`).
    - Vitest environment: default `node` (del `vitest.config.ts` existing — NO hay override que setee jsdom, lo cual romperia estos tests).
  </acceptance_criteria>
  <done>
    - Commit atomico: `test(crm-stage-integrity): add CAS concurrency + RLS append-only integration tests + env template`
  </done>
</task>

<task type="auto">
  <name>Task 4: Push a Vercel + verificacion post-deploy (Regla 1)</name>
  <read_first>
    - CLAUDE.md §Regla 1 (push a Vercel antes de pedir pruebas)
    - .planning/standalone/crm-stage-integrity/CONTEXT.md §Decisions D-17 (flag default false → deploy inicial es no-op)
    - git log --oneline -5 (verificar que Task 1+2+3 commits estan en local, listos para push)
  </read_first>
  <action>
    Push los commits de Plan 02 a Vercel:

    ```bash
    git push origin main
    ```

    Esperar que Vercel complete el build (Vercel dashboard). Build debe pasar porque:
    - Solo se agregaron archivos (tests + `.env.test.example`) y se modificaron 5 existing (types, orders domain, orders action, mobile route, two-step).
    - `npx tsc --noEmit` local ya verifico que no hay errores.
    - Vercel corre `pnpm install --frozen-lockfile` + `next build` — no cambiamos deps.

    Post-deploy, NO hacer smoke test de CAS todavia (flag=false → no se puede observar). Lo que SI se puede observar:
    - Historia de stages empieza a poblarse: cualquier move de stage post-deploy escribe una row a `order_stage_history`.
    - Verificar con query:
      ```sql
      SELECT COUNT(*), source FROM order_stage_history GROUP BY source ORDER BY source;
      ```
      Tras 5-10 minutos con uso normal de la app, deberia haber rows con `source='manual'` (Kanban drags) y posiblemente `source='automation'` (automations cascadeando).

    Si la query NO devuelve rows tras uso activo de la app, investigar:
    - `grep '[moveOrderToStage] history insert failed' logs de Vercel` (Vercel Log Explorer).
    - Revisar si `GRANT ALL TO service_role` se aplico (LEARNING 1).

    Documentar en SUMMARY que el CAS sigue OFF (flag=false) — el usuario puede flipeear manualmente tras Plan 03/04/05 deploy tambien, o en cualquier momento via:

    ```sql
    -- Activar CAS en produccion (rollout escalonado recomendado: comenzar con 1 workspace de test)
    UPDATE platform_config SET value = 'true'::jsonb WHERE key = 'crm_stage_integrity_cas_enabled';
    ```

    Esperar 30-60s (Pitfall 11 — cache TTL) tras el flip antes de observar CAS behavior.
  </action>
  <verify>
    <automated>git log --oneline -5 | head -5</automated>
    <automated>git status | grep -q "Your branch is up to date with 'origin/main'" || git status | grep -qE "(ahead of|nothing to commit)"</automated>
  </verify>
  <acceptance_criteria>
    - `git push origin main` ejecuto exitosamente.
    - Vercel build pasa (verificar manualmente en dashboard).
    - No se flipeo el flag — CAS queda OFF por default (Regla 6).
    - Audit log SI empezo a escribirse desde el primer move post-deploy (opcional: verificar via query).
  </acceptance_criteria>
  <done>
    - Push a origin/main confirmado.
    - NO flip de flag CAS en este plan (se deja para decision del usuario post-observacion, conforme Open Question 1 RESEARCH).
  </done>
</task>

</tasks>

<verification>
- `src/lib/domain/types.ts`: `DomainContext` tiene `actorId?`, `actorLabel?`, `triggerEvent?`.
- `src/lib/domain/orders.ts`: `moveOrderToStage` tiene short-circuit same-stage + flag-gated CAS (`.eq('stage_id', prev).select('id')`) + history insert best-effort + emit trigger preservado.
- `src/app/actions/orders.ts getAuthContext`: retorna `{workspaceId, userId}` (BLOCKER 1 fix).
- `src/app/actions/orders.ts moveOrderToStage` action: pasa `actorId = userId`, `actorLabel = 'user:' + slice`, narrow-ea `stage_changed_concurrently`.
- `src/app/actions/orders.ts bulkMoveOrdersToStage`: retorna `{moved, failed}`.
- `src/app/api/mobile/orders/[id]/stage/route.ts`: destructura `user` de `requireMobileAuth`, pasa `actorId: user.id, actorLabel: 'mobile-api'` + retorna 409 para CAS reject (BLOCKER 2 fix).
- `src/lib/agents/crm-writer/two-step.ts`: preserva string-marker `stage_changed_concurrently`.
- `.env.test.example` en raiz con 7 env vars documentadas (WARNING 2).
- 2 archivos de test creados con `describe.skipIf`, compilan y degradan gracefully sin env vars (WARNING 2).
- `npx tsc --noEmit` sin errores nuevos.
- Vercel deploy OK con flag=false (comportamiento actual).
</verification>

<success_criteria>
- Con flag OFF (default): comportamiento actual preservado byte-identical + audit log escribe desde primer move con `actor_id=user.id` real.
- Con flag ON (tras flip manual): CAS rechaza segundo UPDATE concurrente, caller recibe `stage_changed_concurrently`, cliente Kanban/mobile puede distinguir del error generico.
- `bulkMoveOrdersToStage` expone `failed` list para UX granular (Pitfall 12 cerrado).
- Tests `orders-cas.test.ts` + `order-stage-history-rls.test.ts` compilan y corren con `describe.skipIf` — en CI sin env vars, skipean; en local/CI con env vars, corren y validan.
- Plan 03 desbloqueado — assume `order_stage_history` con rows reales + helper mapper + actor fields.
</success_criteria>

<output>
After completion, create `.planning/standalone/crm-stage-integrity/02-SUMMARY.md` documenting:
- Commit hashes: Task 1 (domain + types), Task 2 (callers + getAuthContext), Task 3 (tests + .env.test.example), Task 4 (push)
- Archivos modificados y lineas aproximadas (8 archivos: 5 existing + 3 new)
- Confirmacion que `npx tsc --noEmit` pasa sin errores nuevos
- Output de `npm test -- --run src/__tests__/integration/` si la infra lo permite; si no, documentar como "skipped pending .env.test setup" (no es fallo, es feature de skipIf)
- Confirmacion post-deploy: Vercel build status + url deploy
- Query de observacion `SELECT COUNT(*), source FROM order_stage_history GROUP BY source` si se corrio en prod
- Estado actual de flags: `crm_stage_integrity_cas_enabled=false` (sin flip en este plan)
- Deuda tecnica descubierta: `actor_label` en server-action usa fallback `'user:' + userId.slice(0,8)` — follow-up para enriquecer con `workspace_members.full_name` documentado para Plan 05 LEARNINGS.md
</output>
</content>
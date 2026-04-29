---
plan: 04
wave: 3
phase: standalone-crm-query-tools
depends_on: [03]
files_modified:
  - src/lib/agents/shared/crm-query-tools/orders.ts
  - src/lib/agents/shared/crm-query-tools/helpers.ts
  - src/lib/agents/shared/crm-query-tools/index.ts
  - src/lib/agents/shared/crm-query-tools/__tests__/orders.test.ts
  - src/lib/agents/shared/crm-query-tools/__tests__/helpers.test.ts
autonomous: true
requirements:
  - D-02  # 5 tools list — this plan delivers the 4 order tools
  - D-07  # Discriminated union (no_orders, no_active_order, config_not_set, multiple_active, error)
  - D-10  # not_found vs no_orders distinction
  - D-15  # Multi-active → newest by created_at + other_active_orders_count flag
  - D-16  # Pipeline scope — config default + pipelineId param override
  - D-17  # no_active_order returns last_terminal_order
  - D-18  # OrderDetail extended in Plan 02 — use, never duplicate
  - D-19  # No cache; fresh DB read every call (including config read)
  - D-20  # All fields included always (items, shipping, etc.)
  - D-23  # Observability events
  - D-27  # config_not_set status — distinct from no_active_order
---

<objective>
Implement the four remaining query tools (`getLastOrderByPhone`, `getOrdersByPhone`, `getActiveOrderByPhone`, `getOrderById`) plus the `findActiveOrderForContact` helper that encapsulates D-15/D-16/D-17/D-27 logic. Wire them into the `createCrmQueryTools` factory. Cover the matrix (~15-20 unit tests) including config_not_set, multi-active resolution, last_terminal_order, pipelineId override, and PII-redacted observability. After this plan ships, the module is feature-complete; UI (Plan 05) and integration/E2E tests (Plan 06) follow.
</objective>

<context>
@./CLAUDE.md
@.planning/standalone/crm-query-tools/CONTEXT.md
@.planning/standalone/crm-query-tools/RESEARCH.md
@.planning/standalone/crm-query-tools/PATTERNS.md
@src/lib/agents/crm-reader/tools/orders.ts
@src/lib/agents/shared/crm-query-tools/contacts.ts
@src/lib/agents/shared/crm-query-tools/types.ts
@src/lib/agents/shared/crm-query-tools/index.ts
@src/lib/domain/orders.ts
@src/lib/domain/contacts.ts
@src/lib/domain/crm-query-tools-config.ts
@src/lib/utils/phone.ts

<interfaces>
<!-- Helper contract used by getLastOrderByPhone + getActiveOrderByPhone tools. -->

```typescript
// src/lib/agents/shared/crm-query-tools/helpers.ts (NEW this plan)
import type { ContactDetail } from '@/lib/domain/contacts'
import type { OrderListItem } from '@/lib/domain/orders'

// Resolves contact by phone (single source for D-08 duplicates + phone normalization).
// Returns null when phone normalize fails OR no contact matches.
export async function resolveContactByPhone(
  domainCtx: DomainContext,
  rawPhone: string,
): Promise<
  | { kind: 'invalid_phone' }
  | { kind: 'not_found' }
  | { kind: 'found'; contact: ContactDetail; duplicates: string[] }
  | { kind: 'error'; message: string }
>

// Computes active / last-terminal partition + config_not_set flag (D-15, D-17, D-27).
export interface ActiveOrderResolution {
  active: OrderListItem | null
  otherActiveCount: number
  lastTerminal: OrderListItem | null
  configWasEmpty: boolean   // true when activeStageIds.length === 0 AND no override
}

export async function findActiveOrderForContact(
  domainCtx: DomainContext,
  contactId: string,
  pipelineIdOverride?: string,
): Promise<ActiveOrderResolution>
```

Tool signatures (consumed by Plan 05 UI test runner + Plan 06 E2E + future agents):
```typescript
getLastOrderByPhone({ phone })           → CrmQueryLookupResult<OrderDetail>
getOrdersByPhone({ phone, limit?, offset? }) → CrmQueryListResult<OrderListItem>
getActiveOrderByPhone({ phone, pipelineId? }) → CrmQueryLookupResult<OrderDetail & { other_active_orders_count: number }>
getOrderById({ orderId })                → CrmQueryLookupResult<OrderDetail>
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 4.1: Implement helpers.ts (resolveContactByPhone + findActiveOrderForContact)</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 7 — helpers.ts, lines ~427-481; Example 3 in RESEARCH lines ~684-715 — note `configWasEmpty` flag for D-27)
    - src/lib/domain/orders.ts (lines 1684-1734 — listOrders contract; verify `OrderListItem` shape includes `id, contactId, pipelineId, stageId, totalValue, createdAt`)
    - src/lib/domain/contacts.ts (searchContacts + getContactById signatures)
    - src/lib/domain/crm-query-tools-config.ts (CrmQueryToolsConfig shape from Plan 02)
    - src/lib/utils/phone.ts (normalizePhone)
    - src/lib/agents/shared/crm-query-tools/contacts.ts (Plan 03 — copy duplicates resolution logic but extract to a helper)
  </read_first>
  <behavior>
    `resolveContactByPhone(domainCtx, rawPhone)`:
    - Returns `{ kind: 'invalid_phone' }` when `normalizePhone(rawPhone)` is null.
    - Returns `{ kind: 'not_found' }` when normalize succeeds but no contact has matching normalized phone.
    - Returns `{ kind: 'found', contact: ContactDetail, duplicates: string[] }` with newest contact + older IDs (D-08).
    - Returns `{ kind: 'error', message }` on domain failure.

    `findActiveOrderForContact(domainCtx, contactId, pipelineIdOverride?)`:
    - Reads config via `getCrmQueryToolsConfig(domainCtx)` (D-19 fresh read).
    - `pipelineId = pipelineIdOverride ?? cfg.pipelineId ?? undefined` (D-16 priority: caller override beats config beats "all").
    - Calls `listOrders(domainCtx, { contactId, pipelineId, limit: 50 })`.
    - Sorts orders DESC by `createdAt` (Pitfall 3).
    - When `cfg.activeStageIds.length === 0` AND `pipelineIdOverride` is undefined → returns `{ active: null, otherActiveCount: 0, lastTerminal: orders[0] ?? null, configWasEmpty: true }` (D-27 caller will distinguish).
    - When config has stages: actives = orders matching `activeStageIds`, terminals = the rest. Returns `{ active: actives[0] ?? null, otherActiveCount: max(0, actives.length - 1), lastTerminal: terminals[0] ?? null, configWasEmpty: false }` (D-15, D-17).
  </behavior>
  <action>
    Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/shared/crm-query-tools/helpers.ts` with EXACT contents:

    ```typescript
    /**
     * CRM Query Tools — internal helpers.
     *
     * Standalone crm-query-tools Wave 3 (Plan 04).
     *
     * Pure-ish helpers (calls domain only):
     *   - resolveContactByPhone: phone normalize + duplicates resolution (D-08, D-09, D-10).
     *   - findActiveOrderForContact: active/terminal partition (D-15, D-16, D-17, D-27).
     *
     * BLOCKER invariant: NO createAdminClient. NO @supabase/supabase-js. Domain only.
     */

    import {
      searchContacts,
      getContactById,
      type ContactDetail,
    } from '@/lib/domain/contacts'
    import {
      listOrders,
      type OrderListItem,
    } from '@/lib/domain/orders'
    import { getCrmQueryToolsConfig } from '@/lib/domain/crm-query-tools-config'
    import { normalizePhone } from '@/lib/utils/phone'
    import type { DomainContext } from '@/lib/domain/types'

    export type ResolveContactByPhoneResult =
      | { kind: 'invalid_phone' }
      | { kind: 'not_found' }
      | { kind: 'found'; contact: ContactDetail; duplicates: string[] }
      | { kind: 'error'; message: string }

    export async function resolveContactByPhone(
      domainCtx: DomainContext,
      rawPhone: string,
    ): Promise<ResolveContactByPhoneResult> {
      // 1. Normalize (D-09)
      const e164 = normalizePhone(rawPhone)
      if (!e164) return { kind: 'invalid_phone' }

      // 2. Search (Pitfall 4: pass digits sans `+` for ILIKE substring)
      const search = await searchContacts(domainCtx, {
        query: e164.replace(/^\+/, ''),
        limit: 50,
      })
      if (!search.success) {
        return { kind: 'error', message: search.error ?? 'searchContacts failed' }
      }

      // 3. Filter exact match
      const matches = (search.data ?? []).filter(
        (c) => normalizePhone(c.phone ?? '') === e164,
      )
      if (matches.length === 0) return { kind: 'not_found' }

      // 4. D-08: newest by createdAt DESC
      matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      const primary = matches[0]
      const duplicates = matches.slice(1).map((m) => m.id)

      // 5. Fetch full ContactDetail
      const detail = await getContactById(domainCtx, { contactId: primary.id })
      if (!detail.success || !detail.data) {
        return {
          kind: 'error',
          message: detail.success ? 'contact disappeared' : (detail.error ?? 'getContactById failed'),
        }
      }

      return { kind: 'found', contact: detail.data, duplicates }
    }

    export interface ActiveOrderResolution {
      active: OrderListItem | null
      otherActiveCount: number
      lastTerminal: OrderListItem | null
      /** D-27: true when no active stages configured AND no override. */
      configWasEmpty: boolean
    }

    /**
     * Computes active/terminal partition for a contact's orders.
     *
     * D-15: when multiple actives, return newest + otherActiveCount = (n - 1).
     * D-16: pipelineId priority = override > config > undefined (all pipelines).
     * D-17: lastTerminal = newest order in non-active stage.
     * D-27: configWasEmpty signals to caller that workspace never configured stages.
     */
    export async function findActiveOrderForContact(
      domainCtx: DomainContext,
      contactId: string,
      pipelineIdOverride?: string,
    ): Promise<ActiveOrderResolution> {
      // D-19: fresh config read every call (no cache).
      const cfg = await getCrmQueryToolsConfig(domainCtx)
      const activeStageIds = new Set(cfg.activeStageIds)
      const pipelineId = pipelineIdOverride ?? cfg.pipelineId ?? undefined

      const result = await listOrders(domainCtx, { contactId, pipelineId, limit: 50 })
      if (!result.success) {
        throw new Error(result.error ?? 'listOrders failed')
      }

      // Pitfall 3: explicit ORDER BY createdAt DESC
      const orders = (result.data ?? [])
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

      // D-27: when config empty AND no override, surface to caller
      if (activeStageIds.size === 0 && pipelineIdOverride === undefined) {
        return {
          active: null,
          otherActiveCount: 0,
          lastTerminal: orders[0] ?? null,
          configWasEmpty: true,
        }
      }

      const actives = orders.filter((o) => activeStageIds.has(o.stageId))
      const terminals = orders.filter((o) => !activeStageIds.has(o.stageId))

      return {
        active: actives[0] ?? null,
        otherActiveCount: Math.max(0, actives.length - 1),
        lastTerminal: terminals[0] ?? null,
        configWasEmpty: false,
      }
    }
    ```
  </action>
  <verify>
    <automated>test -f src/lib/agents/shared/crm-query-tools/helpers.ts && grep -q "resolveContactByPhone" src/lib/agents/shared/crm-query-tools/helpers.ts && grep -q "findActiveOrderForContact" src/lib/agents/shared/crm-query-tools/helpers.ts && grep -q "configWasEmpty" src/lib/agents/shared/crm-query-tools/helpers.ts && ! grep -E "^import.*createAdminClient" src/lib/agents/shared/crm-query-tools/helpers.ts && npx tsc --noEmit -p . 2>&1 | grep -E "helpers\.ts" | head -3</automated>
  </verify>
  <acceptance_criteria>
    - `helpers.ts` exists.
    - `grep -c "resolveContactByPhone" {file}` returns ≥1 export.
    - `grep -c "findActiveOrderForContact" {file}` returns ≥1 export.
    - `grep -c "configWasEmpty" {file}` returns ≥3 (interface + return + condition).
    - `grep -c "@/lib/domain/" {file}` returns ≥3 (contacts, orders, crm-query-tools-config).
    - `grep -E "^import.*createAdminClient" {file}` returns 0.
    - `grep "pipelineIdOverride === undefined" {file}` returns 1 (D-27 trigger condition).
    - `npx tsc --noEmit -p .` returns zero errors.
  </acceptance_criteria>
  <done>helpers.ts exports resolveContactByPhone + findActiveOrderForContact + ActiveOrderResolution. Ready for Task 4.2.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4.2: Implement orders.ts (4 order tools)</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 6 — orders.ts analog + 4 tool adaptations, lines ~354-422)
    - src/lib/agents/crm-reader/tools/orders.ts (lines 1-73 — verbatim factory + tool() pattern)
    - src/lib/agents/shared/crm-query-tools/contacts.ts (Plan 03 — observability emission pattern, phoneSuffix helper)
    - src/lib/agents/shared/crm-query-tools/helpers.ts (just-created, in Task 4.1)
    - src/lib/agents/shared/crm-query-tools/types.ts (CrmQueryLookupResult / CrmQueryListResult — note `config_not_set` status)
    - src/lib/domain/orders.ts (listOrders, getOrderById, OrderListItem, OrderDetail — extended with shipping fields in Plan 02)
  </read_first>
  <behavior>
    Four tools with consistent observability shell:

    1. `getLastOrderByPhone({ phone })`:
       - resolveContactByPhone → if invalid_phone/not_found/error, return analogous CrmQueryLookupResult.
       - listOrders({ contactId, limit: 1 }).
       - If empty → `{ status: 'no_orders', contact }` (D-10).
       - getOrderById on first order ID → `{ status: 'found', data: OrderDetail }`.

    2. `getOrdersByPhone({ phone, limit?, offset? })`:
       - resolveContactByPhone → invalid_phone/not_found/error mapped to CrmQueryListResult.
       - listOrders({ contactId, limit, offset }).
       - Empty → `{ status: 'no_orders', contact }` (D-10 list variant).
       - Else → `{ status: 'ok', count, items: OrderListItem[] }` (D-20: lists are items not details — paging).

    3. `getActiveOrderByPhone({ phone, pipelineId? })`:
       - resolveContactByPhone → invalid_phone/not_found/error.
       - findActiveOrderForContact(contactId, pipelineId).
       - If `configWasEmpty` → `{ status: 'config_not_set', contact }` (D-27).
       - If `active === null` → `{ status: 'no_active_order', contact, last_terminal_order: lastTerminal ? OrderDetail : undefined }` (D-17). MUST fetch full OrderDetail for lastTerminal via getOrderById.
       - Else → fetch full OrderDetail for active.id, return `{ status: 'found', data: OrderDetail & { other_active_orders_count: number } }` (D-15).

    4. `getOrderById({ orderId })`:
       - getOrderById(domainCtx, { orderId }).
       - Success + data → `{ status: 'found', data }`.
       - Success + null → `{ status: 'not_found' }`.
       - Failure → `{ status: 'error', error: { code: 'db_error', message } }`.
  </behavior>
  <action>
    Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/shared/crm-query-tools/orders.ts` with EXACT contents:

    ```typescript
    /**
     * CRM Query Tools — Order Tools (4 tools).
     *
     * Standalone crm-query-tools Wave 3 (Plan 04).
     *
     * BLOCKER invariant: this file imports ONLY from @/lib/domain/* + helpers.
     * Verified via grep:
     *   grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/shared/crm-query-tools/
     * Expected: zero matches in code (only doc-comment mentions allowed).
     *
     * Tools:
     *   - getLastOrderByPhone(phone)         → most recent order with full detail (D-10).
     *   - getOrdersByPhone(phone, limit, offset) → paginated history list (D-10 list).
     *   - getActiveOrderByPhone(phone, pipelineId?) → active order with config-driven filter (D-15, D-16, D-17, D-27).
     *   - getOrderById(orderId)              → single order by ID (mirror crm-reader.ordersGet).
     *
     * D-23 observability: every tool emits crm_query_invoked + completed/failed events.
     */

    import { tool } from 'ai'
    import { z } from 'zod'
    import {
      listOrders,
      getOrderById,
      type OrderDetail,
      type OrderListItem,
    } from '@/lib/domain/orders'
    import type { DomainContext } from '@/lib/domain/types'
    import { createModuleLogger } from '@/lib/audit/logger'
    import { getCollector } from '@/lib/observability'
    import {
      resolveContactByPhone,
      findActiveOrderForContact,
    } from './helpers'
    import type {
      CrmQueryToolsContext,
      CrmQueryLookupResult,
      CrmQueryListResult,
    } from './types'

    const logger = createModuleLogger('crm-query-tools.orders')

    function phoneSuffix(raw: string): string {
      return raw.replace(/\D/g, '').slice(-4)
    }

    export function makeOrderQueryTools(ctx: CrmQueryToolsContext) {
      const domainCtx: DomainContext = {
        workspaceId: ctx.workspaceId,
        source: 'tool-handler',
      }
      const collector = () => getCollector()
      const baseEvt = (toolName: string) => ({
        tool: toolName,
        workspaceId: ctx.workspaceId,
        invoker: ctx.invoker,
      })

      // ───────────────────────────────────────────────────────────
      // Tool 1: getLastOrderByPhone
      // ───────────────────────────────────────────────────────────
      const getLastOrderByPhoneTool = tool({
        description:
          'Obtiene el ultimo pedido de un contacto identificado por telefono. ' +
          'Retorna el pedido completo (items + direccion) ordenado por created_at DESC. ' +
          'Si el contacto no tiene pedidos, retorna status no_orders + el contacto.',
        inputSchema: z.object({
          phone: z.string().min(7).describe('Telefono del contacto.'),
        }),
        execute: async ({ phone }): Promise<CrmQueryLookupResult<OrderDetail>> => {
          const startedAt = Date.now()
          collector()?.recordEvent('pipeline_decision', 'crm_query_invoked', {
            ...baseEvt('getLastOrderByPhone'),
            phoneSuffix: phoneSuffix(phone),
          })

          const resolved = await resolveContactByPhone(domainCtx, phone)
          if (resolved.kind === 'invalid_phone') {
            collector()?.recordEvent('pipeline_decision', 'crm_query_failed', {
              ...baseEvt('getLastOrderByPhone'),
              errorCode: 'invalid_phone',
              latencyMs: Date.now() - startedAt,
            })
            return { status: 'error', error: { code: 'invalid_phone' } }
          }
          if (resolved.kind === 'not_found') {
            collector()?.recordEvent('pipeline_decision', 'crm_query_completed', {
              ...baseEvt('getLastOrderByPhone'),
              status: 'not_found',
              latencyMs: Date.now() - startedAt,
            })
            return { status: 'not_found' }
          }
          if (resolved.kind === 'error') {
            logger.error({ error: resolved.message, workspaceId: ctx.workspaceId }, 'getLastOrderByPhone resolve failed')
            collector()?.recordEvent('pipeline_decision', 'crm_query_failed', {
              ...baseEvt('getLastOrderByPhone'),
              errorCode: 'db_error',
              latencyMs: Date.now() - startedAt,
            })
            return { status: 'error', error: { code: 'db_error', message: resolved.message } }
          }

          const list = await listOrders(domainCtx, { contactId: resolved.contact.id, limit: 1 })
          if (!list.success) {
            collector()?.recordEvent('pipeline_decision', 'crm_query_failed', {
              ...baseEvt('getLastOrderByPhone'),
              errorCode: 'db_error',
              latencyMs: Date.now() - startedAt,
            })
            return { status: 'error', error: { code: 'db_error', message: list.error } }
          }
          if ((list.data ?? []).length === 0) {
            collector()?.recordEvent('pipeline_decision', 'crm_query_completed', {
              ...baseEvt('getLastOrderByPhone'),
              status: 'no_orders',
              latencyMs: Date.now() - startedAt,
            })
            return { status: 'no_orders', contact: resolved.contact }
          }

          const detail = await getOrderById(domainCtx, { orderId: list.data![0].id })
          if (!detail.success || !detail.data) {
            collector()?.recordEvent('pipeline_decision', 'crm_query_failed', {
              ...baseEvt('getLastOrderByPhone'),
              errorCode: 'db_error',
              latencyMs: Date.now() - startedAt,
            })
            return { status: 'error', error: { code: 'db_error', message: detail.success ? 'order disappeared' : detail.error } }
          }

          collector()?.recordEvent('pipeline_decision', 'crm_query_completed', {
            ...baseEvt('getLastOrderByPhone'),
            status: 'found',
            latencyMs: Date.now() - startedAt,
          })
          return { status: 'found', data: detail.data }
        },
      })

      // ───────────────────────────────────────────────────────────
      // Tool 2: getOrdersByPhone (list / paginated)
      // ───────────────────────────────────────────────────────────
      const getOrdersByPhoneTool = tool({
        description:
          'Lista los pedidos de un contacto identificado por telefono, mas reciente primero. ' +
          'Acepta limit (default 20, max 50) y offset para paginacion. ' +
          'Si el contacto no tiene pedidos, retorna no_orders + el contacto.',
        inputSchema: z.object({
          phone: z.string().min(7),
          limit: z.number().int().min(1).max(50).default(20),
          offset: z.number().int().min(0).default(0),
        }),
        execute: async ({ phone, limit, offset }): Promise<CrmQueryListResult<OrderListItem>> => {
          const startedAt = Date.now()
          collector()?.recordEvent('pipeline_decision', 'crm_query_invoked', {
            ...baseEvt('getOrdersByPhone'),
            phoneSuffix: phoneSuffix(phone),
            limit,
            offset,
          })

          const resolved = await resolveContactByPhone(domainCtx, phone)
          if (resolved.kind === 'invalid_phone') {
            collector()?.recordEvent('pipeline_decision', 'crm_query_failed', { ...baseEvt('getOrdersByPhone'), errorCode: 'invalid_phone', latencyMs: Date.now() - startedAt })
            return { status: 'error', error: { code: 'invalid_phone' } }
          }
          if (resolved.kind === 'not_found') {
            collector()?.recordEvent('pipeline_decision', 'crm_query_completed', { ...baseEvt('getOrdersByPhone'), status: 'not_found', latencyMs: Date.now() - startedAt })
            return { status: 'not_found' }
          }
          if (resolved.kind === 'error') {
            logger.error({ error: resolved.message, workspaceId: ctx.workspaceId }, 'getOrdersByPhone resolve failed')
            collector()?.recordEvent('pipeline_decision', 'crm_query_failed', { ...baseEvt('getOrdersByPhone'), errorCode: 'db_error', latencyMs: Date.now() - startedAt })
            return { status: 'error', error: { code: 'db_error', message: resolved.message } }
          }

          const list = await listOrders(domainCtx, { contactId: resolved.contact.id, limit, offset })
          if (!list.success) {
            collector()?.recordEvent('pipeline_decision', 'crm_query_failed', { ...baseEvt('getOrdersByPhone'), errorCode: 'db_error', latencyMs: Date.now() - startedAt })
            return { status: 'error', error: { code: 'db_error', message: list.error } }
          }
          const items = list.data ?? []
          if (items.length === 0) {
            collector()?.recordEvent('pipeline_decision', 'crm_query_completed', { ...baseEvt('getOrdersByPhone'), status: 'no_orders', latencyMs: Date.now() - startedAt })
            return { status: 'no_orders', contact: resolved.contact }
          }
          collector()?.recordEvent('pipeline_decision', 'crm_query_completed', { ...baseEvt('getOrdersByPhone'), status: 'ok', count: items.length, latencyMs: Date.now() - startedAt })
          return { status: 'ok', count: items.length, items }
        },
      })

      // ───────────────────────────────────────────────────────────
      // Tool 3: getActiveOrderByPhone
      // ───────────────────────────────────────────────────────────
      const getActiveOrderByPhoneTool = tool({
        description:
          'Obtiene el pedido activo del contacto. "Activo" se define en /agentes/crm-tools por workspace ' +
          '(stages activos + pipeline scope). ' +
          'Retorna found + other_active_orders_count si el contacto tiene mas de uno activo (mas reciente primero). ' +
          'Retorna no_active_order + last_terminal_order si todos sus pedidos estan en stages terminales. ' +
          'Retorna config_not_set si el operador no ha configurado stages activos en este workspace. ' +
          'Acepta pipelineId opcional que sobrescribe el config para esta llamada.',
        inputSchema: z.object({
          phone: z.string().min(7),
          pipelineId: z.string().uuid().optional(),
        }),
        execute: async ({ phone, pipelineId }): Promise<CrmQueryLookupResult<OrderDetail & { other_active_orders_count: number }>> => {
          const startedAt = Date.now()
          collector()?.recordEvent('pipeline_decision', 'crm_query_invoked', {
            ...baseEvt('getActiveOrderByPhone'),
            phoneSuffix: phoneSuffix(phone),
            pipelineIdOverride: pipelineId ?? null,
          })

          const resolved = await resolveContactByPhone(domainCtx, phone)
          if (resolved.kind === 'invalid_phone') {
            collector()?.recordEvent('pipeline_decision', 'crm_query_failed', { ...baseEvt('getActiveOrderByPhone'), errorCode: 'invalid_phone', latencyMs: Date.now() - startedAt })
            return { status: 'error', error: { code: 'invalid_phone' } }
          }
          if (resolved.kind === 'not_found') {
            collector()?.recordEvent('pipeline_decision', 'crm_query_completed', { ...baseEvt('getActiveOrderByPhone'), status: 'not_found', latencyMs: Date.now() - startedAt })
            return { status: 'not_found' }
          }
          if (resolved.kind === 'error') {
            logger.error({ error: resolved.message, workspaceId: ctx.workspaceId }, 'getActiveOrderByPhone resolve failed')
            collector()?.recordEvent('pipeline_decision', 'crm_query_failed', { ...baseEvt('getActiveOrderByPhone'), errorCode: 'db_error', latencyMs: Date.now() - startedAt })
            return { status: 'error', error: { code: 'db_error', message: resolved.message } }
          }

          let resolution
          try {
            resolution = await findActiveOrderForContact(domainCtx, resolved.contact.id, pipelineId)
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            logger.error({ error: message, workspaceId: ctx.workspaceId, contactId: resolved.contact.id }, 'findActiveOrderForContact failed')
            collector()?.recordEvent('pipeline_decision', 'crm_query_failed', { ...baseEvt('getActiveOrderByPhone'), errorCode: 'db_error', latencyMs: Date.now() - startedAt })
            return { status: 'error', error: { code: 'db_error', message } }
          }

          // D-27 first
          if (resolution.configWasEmpty) {
            collector()?.recordEvent('pipeline_decision', 'crm_query_completed', { ...baseEvt('getActiveOrderByPhone'), status: 'config_not_set', latencyMs: Date.now() - startedAt })
            return { status: 'config_not_set', contact: resolved.contact }
          }

          // D-17: no active
          if (!resolution.active) {
            let lastTerminalDetail: OrderDetail | undefined
            if (resolution.lastTerminal) {
              const lt = await getOrderById(domainCtx, { orderId: resolution.lastTerminal.id })
              lastTerminalDetail = lt.success && lt.data ? lt.data : undefined
            }
            collector()?.recordEvent('pipeline_decision', 'crm_query_completed', { ...baseEvt('getActiveOrderByPhone'), status: 'no_active_order', hasTerminal: !!lastTerminalDetail, latencyMs: Date.now() - startedAt })
            return { status: 'no_active_order', contact: resolved.contact, last_terminal_order: lastTerminalDetail }
          }

          // D-15: active found, fetch full detail + other_active_orders_count
          const detail = await getOrderById(domainCtx, { orderId: resolution.active.id })
          if (!detail.success || !detail.data) {
            collector()?.recordEvent('pipeline_decision', 'crm_query_failed', { ...baseEvt('getActiveOrderByPhone'), errorCode: 'db_error', latencyMs: Date.now() - startedAt })
            return { status: 'error', error: { code: 'db_error', message: detail.success ? 'active order disappeared' : detail.error } }
          }
          collector()?.recordEvent('pipeline_decision', 'crm_query_completed', {
            ...baseEvt('getActiveOrderByPhone'),
            status: 'found',
            otherActiveCount: resolution.otherActiveCount,
            latencyMs: Date.now() - startedAt,
          })
          return {
            status: 'found',
            data: { ...detail.data, other_active_orders_count: resolution.otherActiveCount },
          }
        },
      })

      // ───────────────────────────────────────────────────────────
      // Tool 4: getOrderById
      // ───────────────────────────────────────────────────────────
      const getOrderByIdTool = tool({
        description:
          'Obtiene un pedido por ID con sus items (order_products) y direccion de envio. ' +
          'Filtra por workspace_id automaticamente. Retorna not_found si el pedido no existe en este workspace.',
        inputSchema: z.object({
          orderId: z.string().uuid(),
        }),
        execute: async ({ orderId }): Promise<CrmQueryLookupResult<OrderDetail>> => {
          const startedAt = Date.now()
          collector()?.recordEvent('pipeline_decision', 'crm_query_invoked', {
            ...baseEvt('getOrderById'),
            orderIdSuffix: orderId.slice(-8),
          })

          const result = await getOrderById(domainCtx, { orderId })
          if (!result.success) {
            collector()?.recordEvent('pipeline_decision', 'crm_query_failed', { ...baseEvt('getOrderById'), errorCode: 'db_error', latencyMs: Date.now() - startedAt })
            return { status: 'error', error: { code: 'db_error', message: result.error } }
          }
          if (!result.data) {
            collector()?.recordEvent('pipeline_decision', 'crm_query_completed', { ...baseEvt('getOrderById'), status: 'not_found', latencyMs: Date.now() - startedAt })
            return { status: 'not_found' }
          }
          collector()?.recordEvent('pipeline_decision', 'crm_query_completed', { ...baseEvt('getOrderById'), status: 'found', latencyMs: Date.now() - startedAt })
          return { status: 'found', data: result.data }
        },
      })

      return {
        getLastOrderByPhone: getLastOrderByPhoneTool,
        getOrdersByPhone: getOrdersByPhoneTool,
        getActiveOrderByPhone: getActiveOrderByPhoneTool,
        getOrderById: getOrderByIdTool,
      }
    }
    ```

    Then update `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/shared/crm-query-tools/index.ts` to add the order tools spread:

    ```typescript
    // index.ts diff: replace the body of createCrmQueryTools
    import { makeContactQueryTools } from './contacts'
    import { makeOrderQueryTools } from './orders'

    export type {
      CrmQueryToolsContext,
      CrmQueryLookupResult,
      CrmQueryListResult,
      ContactWithDuplicates,
    } from './types'

    export function createCrmQueryTools(ctx: import('./types').CrmQueryToolsContext) {
      return {
        ...makeContactQueryTools(ctx),
        ...makeOrderQueryTools(ctx),
      }
    }
    ```

    Verify with `npx tsc --noEmit -p .` — zero errors.
  </action>
  <verify>
    <automated>test -f src/lib/agents/shared/crm-query-tools/orders.ts && grep -c "getLastOrderByPhone:\|getOrdersByPhone:\|getActiveOrderByPhone:\|getOrderById:" src/lib/agents/shared/crm-query-tools/orders.ts && grep -q "config_not_set" src/lib/agents/shared/crm-query-tools/orders.ts && grep -q "other_active_orders_count" src/lib/agents/shared/crm-query-tools/orders.ts && grep -q "makeOrderQueryTools" src/lib/agents/shared/crm-query-tools/index.ts && ! grep -E "^import.*createAdminClient" src/lib/agents/shared/crm-query-tools/orders.ts && npx tsc --noEmit -p . 2>&1 | head -10</automated>
  </verify>
  <acceptance_criteria>
    - `orders.ts` exists with `makeOrderQueryTools` exported.
    - `grep -c "getLastOrderByPhone:\\|getOrdersByPhone:\\|getActiveOrderByPhone:\\|getOrderById:" orders.ts` returns 4 (one per tool entry in return object).
    - `grep -c "config_not_set" orders.ts` returns ≥1 (D-27 path).
    - `grep -c "other_active_orders_count" orders.ts` returns ≥1 (D-15 flag).
    - `grep -c "last_terminal_order" orders.ts` returns ≥1 (D-17 field).
    - `grep -c "pipelineId" orders.ts` returns ≥2 (param + override threading per D-16).
    - `grep -E "^import.*createAdminClient|@supabase/supabase-js" orders.ts` returns 0.
    - `index.ts` includes `makeOrderQueryTools` spread.
    - `npx tsc --noEmit -p .` returns zero errors.
  </acceptance_criteria>
  <done>4 order tools wired into factory. Module is feature-complete.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4.3: Unit tests — helpers.test.ts (pure helper logic)</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 10 — helpers.test.ts analog, lines ~558-595)
    - src/lib/agents/somnio-recompra/__tests__/transitions.test.ts (lines 1-55 — pure-function unit pattern)
    - src/lib/agents/shared/crm-query-tools/helpers.ts (just-created)
  </read_first>
  <behavior>
    Test cases:
    1. `findActiveOrderForContact` — empty config + no override → returns `configWasEmpty: true`, `active: null`, `lastTerminal: orders[0] (newest)`.
    2. `findActiveOrderForContact` — empty config + `pipelineIdOverride` provided → does NOT short-circuit (configWasEmpty: false), filters by pipelineId, all orders treated as terminal since activeStageIds empty.
    3. `findActiveOrderForContact` — single active → `active.id` set, `otherActiveCount: 0`.
    4. `findActiveOrderForContact` — multi-active (3 orders in active stages, different createdAt) → `active.id === newest`, `otherActiveCount: 2` (D-15).
    5. `findActiveOrderForContact` — all terminal → `active: null`, `lastTerminal === newest non-active` (D-17).
    6. `findActiveOrderForContact` — pipelineId override → passes pipelineId to listOrders correctly (asserts mock call args; D-16).
    7. `findActiveOrderForContact` — listOrders returns success: false → throws (caller catches and emits error).
    8. `resolveContactByPhone` — invalid → `{ kind: 'invalid_phone' }`. Skip if covered by contacts.test.ts already; KEEP at minimum: 1 happy path test for resolveContactByPhone to verify export shape.
  </behavior>
  <action>
    Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/shared/crm-query-tools/__tests__/helpers.test.ts` with EXACT contents:

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest'

    const { listOrdersMock, getCrmQueryToolsConfigMock, searchContactsMock, getContactByIdMock } = vi.hoisted(() => ({
      listOrdersMock: vi.fn(),
      getCrmQueryToolsConfigMock: vi.fn(),
      searchContactsMock: vi.fn(),
      getContactByIdMock: vi.fn(),
    }))

    vi.mock('@/lib/domain/orders', () => ({ listOrders: listOrdersMock, getOrderById: vi.fn() }))
    vi.mock('@/lib/domain/contacts', () => ({ searchContacts: searchContactsMock, getContactById: getContactByIdMock }))
    vi.mock('@/lib/domain/crm-query-tools-config', () => ({ getCrmQueryToolsConfig: getCrmQueryToolsConfigMock }))

    import { findActiveOrderForContact, resolveContactByPhone } from '../helpers'

    const DOMAIN_CTX = { workspaceId: 'ws-1', source: 'tool-handler' as const }

    function order(id: string, stageId: string, createdAt: string) {
      return {
        id,
        contactId: 'c1',
        pipelineId: 'p1',
        stageId,
        totalValue: 100,
        createdAt,
      }
    }

    beforeEach(() => {
      vi.clearAllMocks()
    })

    describe('findActiveOrderForContact — D-27 empty config', () => {
      it('returns configWasEmpty=true when activeStageIds empty AND no override', async () => {
        getCrmQueryToolsConfigMock.mockResolvedValueOnce({ pipelineId: null, activeStageIds: [] })
        listOrdersMock.mockResolvedValueOnce({
          success: true,
          data: [order('o1', 'sX', '2026-04-01T00:00:00Z'), order('o2', 'sY', '2026-03-01T00:00:00Z')],
        })

        const r = await findActiveOrderForContact(DOMAIN_CTX, 'c1')
        expect(r.configWasEmpty).toBe(true)
        expect(r.active).toBeNull()
        expect(r.lastTerminal?.id).toBe('o1')
      })

      it('does NOT short-circuit when override provided even if config empty', async () => {
        getCrmQueryToolsConfigMock.mockResolvedValueOnce({ pipelineId: null, activeStageIds: [] })
        listOrdersMock.mockResolvedValueOnce({
          success: true,
          data: [order('o1', 'sX', '2026-04-01T00:00:00Z')],
        })

        const r = await findActiveOrderForContact(DOMAIN_CTX, 'c1', 'pipeline-override')
        expect(r.configWasEmpty).toBe(false)
        expect(listOrdersMock).toHaveBeenCalledWith(DOMAIN_CTX, expect.objectContaining({ pipelineId: 'pipeline-override' }))
      })
    })

    describe('findActiveOrderForContact — D-15 multi-active resolution', () => {
      it('returns newest active + otherActiveCount', async () => {
        getCrmQueryToolsConfigMock.mockResolvedValueOnce({ pipelineId: null, activeStageIds: ['sActive'] })
        listOrdersMock.mockResolvedValueOnce({
          success: true,
          data: [
            order('mid', 'sActive', '2026-03-15T00:00:00Z'),
            order('newest', 'sActive', '2026-04-01T00:00:00Z'),
            order('oldest', 'sActive', '2026-02-01T00:00:00Z'),
            order('terminal1', 'sTerm', '2026-04-10T00:00:00Z'),
          ],
        })

        const r = await findActiveOrderForContact(DOMAIN_CTX, 'c1')
        expect(r.active?.id).toBe('newest')
        expect(r.otherActiveCount).toBe(2)
        expect(r.lastTerminal?.id).toBe('terminal1')
        expect(r.configWasEmpty).toBe(false)
      })
    })

    describe('findActiveOrderForContact — D-17 last_terminal when no active', () => {
      it('returns active=null + lastTerminal=newest non-active', async () => {
        getCrmQueryToolsConfigMock.mockResolvedValueOnce({ pipelineId: null, activeStageIds: ['sActive'] })
        listOrdersMock.mockResolvedValueOnce({
          success: true,
          data: [
            order('t-newest', 'sTerm', '2026-04-15T00:00:00Z'),
            order('t-old', 'sTerm', '2026-01-01T00:00:00Z'),
          ],
        })

        const r = await findActiveOrderForContact(DOMAIN_CTX, 'c1')
        expect(r.active).toBeNull()
        expect(r.otherActiveCount).toBe(0)
        expect(r.lastTerminal?.id).toBe('t-newest')
      })
    })

    describe('findActiveOrderForContact — D-16 pipelineId override priority', () => {
      it('caller override beats config pipeline', async () => {
        getCrmQueryToolsConfigMock.mockResolvedValueOnce({ pipelineId: 'config-pipe', activeStageIds: ['sA'] })
        listOrdersMock.mockResolvedValueOnce({ success: true, data: [] })
        await findActiveOrderForContact(DOMAIN_CTX, 'c1', 'override-pipe')
        expect(listOrdersMock).toHaveBeenCalledWith(DOMAIN_CTX, expect.objectContaining({ pipelineId: 'override-pipe' }))
      })

      it('falls back to config pipeline when no override', async () => {
        getCrmQueryToolsConfigMock.mockResolvedValueOnce({ pipelineId: 'config-pipe', activeStageIds: ['sA'] })
        listOrdersMock.mockResolvedValueOnce({ success: true, data: [] })
        await findActiveOrderForContact(DOMAIN_CTX, 'c1')
        expect(listOrdersMock).toHaveBeenCalledWith(DOMAIN_CTX, expect.objectContaining({ pipelineId: 'config-pipe' }))
      })

      it('passes undefined pipelineId when both null', async () => {
        getCrmQueryToolsConfigMock.mockResolvedValueOnce({ pipelineId: null, activeStageIds: ['sA'] })
        listOrdersMock.mockResolvedValueOnce({ success: true, data: [] })
        await findActiveOrderForContact(DOMAIN_CTX, 'c1')
        const callArg = listOrdersMock.mock.calls[0][1] as { pipelineId?: string }
        expect(callArg.pipelineId).toBeUndefined()
      })
    })

    describe('findActiveOrderForContact — error path', () => {
      it('throws when listOrders fails', async () => {
        getCrmQueryToolsConfigMock.mockResolvedValueOnce({ pipelineId: null, activeStageIds: ['sA'] })
        listOrdersMock.mockResolvedValueOnce({ success: false, error: 'db down' })
        await expect(findActiveOrderForContact(DOMAIN_CTX, 'c1')).rejects.toThrow('db down')
      })
    })

    describe('resolveContactByPhone — sanity', () => {
      it('returns invalid_phone for garbage input', async () => {
        const r = await resolveContactByPhone(DOMAIN_CTX, 'abc')
        expect(r).toEqual({ kind: 'invalid_phone' })
      })
    })
    ```

    Run: `npm run test -- --run src/lib/agents/shared/crm-query-tools/__tests__/helpers.test.ts`. All ≥9 tests must pass.
  </action>
  <verify>
    <automated>npm run test -- --run src/lib/agents/shared/crm-query-tools/__tests__/helpers.test.ts 2>&1 | tail -15</automated>
  </verify>
  <acceptance_criteria>
    - Tests pass (exit 0).
    - ≥9 individual `it(` cases.
    - `grep -c "configWasEmpty" __tests__/helpers.test.ts` returns ≥3 (D-27 explicit checks).
    - `grep -c "otherActiveCount" __tests__/helpers.test.ts` returns ≥3 (D-15).
    - `grep -c "lastTerminal" __tests__/helpers.test.ts` returns ≥2 (D-17).
    - `grep -c "pipelineId" __tests__/helpers.test.ts` returns ≥3 (D-16 priority cases).
  </acceptance_criteria>
  <done>helpers.ts unit-tested. D-15/D-16/D-17/D-27 covered.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4.4: Unit tests — orders.test.ts (4 order tools)</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 9 — orders.test.ts adaptations, lines 541-555)
    - src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts (Plan 03 — pattern for vi.hoisted + observability mock)
    - src/lib/agents/shared/crm-query-tools/orders.ts (just-created — to know what to mock)
    - src/lib/agents/shared/crm-query-tools/helpers.ts (mock at boundary so order tool tests don't double up on helper logic)
  </read_first>
  <behavior>
    Test matrix (~16-20 tests). Mocks: `@/lib/domain/orders`, `@/lib/domain/contacts`, `@/lib/agents/shared/crm-query-tools/helpers` (so order tools test their own logic, not helper internals already covered in 4.3).

    Per tool:
    - `getLastOrderByPhone`: invalid_phone, not_found (resolve), no_orders (empty list), found (full detail), db_error (resolve fails).
    - `getOrdersByPhone`: invalid_phone, not_found, no_orders (empty), ok (count + items), respects limit/offset args (assert listOrders called with correct args).
    - `getActiveOrderByPhone`: invalid_phone, not_found (no contact), config_not_set (helper returns configWasEmpty), no_active_order with last_terminal (helper returns active:null + lastTerminal set, getOrderById returns detail), no_active_order without last_terminal (helper returns lastTerminal: null), found with other_active_orders_count, pipelineId param threads to helper.
    - `getOrderById`: found, not_found (data null), db_error.
  </behavior>
  <action>
    Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/shared/crm-query-tools/__tests__/orders.test.ts` with EXACT contents:

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest'

    const {
      listOrdersMock,
      getOrderByIdMock,
      resolveContactByPhoneMock,
      findActiveOrderForContactMock,
      recordEventMock,
    } = vi.hoisted(() => ({
      listOrdersMock: vi.fn(),
      getOrderByIdMock: vi.fn(),
      resolveContactByPhoneMock: vi.fn(),
      findActiveOrderForContactMock: vi.fn(),
      recordEventMock: vi.fn(),
    }))

    vi.mock('@/lib/domain/orders', () => ({
      listOrders: listOrdersMock,
      getOrderById: getOrderByIdMock,
    }))
    vi.mock('@/lib/domain/contacts', () => ({
      searchContacts: vi.fn(),
      getContactById: vi.fn(),
    }))
    vi.mock('../helpers', () => ({
      resolveContactByPhone: resolveContactByPhoneMock,
      findActiveOrderForContact: findActiveOrderForContactMock,
    }))
    vi.mock('@/lib/observability', () => ({
      getCollector: () => ({ recordEvent: recordEventMock }),
    }))

    import { createCrmQueryTools } from '../index'

    const CTX = { workspaceId: 'ws-1', invoker: 'test' } as const
    const exec = (toolName: keyof ReturnType<typeof createCrmQueryTools>, input: unknown) => {
      const tools = createCrmQueryTools(CTX)
      return (tools[toolName] as { execute: (i: unknown) => Promise<unknown> }).execute(input)
    }

    function buildContact(id = 'c1') {
      return {
        id, name: 'X', phone: '+573001234567', email: null,
        address: null, city: null, department: null,
        createdAt: '2026-01-01T00:00:00Z', archivedAt: null,
        tags: [], customFields: {},
      }
    }
    function buildOrderListItem(id: string, stageId = 's1', createdAt = '2026-04-01T00:00:00Z') {
      return { id, contactId: 'c1', pipelineId: 'p1', stageId, totalValue: 100, createdAt }
    }
    function buildOrderDetail(id: string) {
      return {
        id, contactId: 'c1', pipelineId: 'p1', stageId: 's1',
        totalValue: 100, description: null,
        shippingAddress: null, shippingCity: null, shippingDepartment: null,
        createdAt: '2026-04-01T00:00:00Z', archivedAt: null,
        items: [],
      }
    }

    beforeEach(() => {
      vi.clearAllMocks()
    })

    // ─── getLastOrderByPhone ───────────────────────────────────────
    describe('getLastOrderByPhone', () => {
      it('returns invalid_phone for garbage input', async () => {
        resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'invalid_phone' })
        const r = await exec('getLastOrderByPhone', { phone: 'abc' })
        expect(r).toEqual({ status: 'error', error: { code: 'invalid_phone' } })
      })
      it('returns not_found when contact missing', async () => {
        resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'not_found' })
        const r = await exec('getLastOrderByPhone', { phone: '+573001234567' })
        expect(r).toEqual({ status: 'not_found' })
      })
      it('returns no_orders + contact when contact has zero orders', async () => {
        resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'found', contact: buildContact(), duplicates: [] })
        listOrdersMock.mockResolvedValueOnce({ success: true, data: [] })
        const r = await exec('getLastOrderByPhone', { phone: '+573001234567' })
        expect(r).toMatchObject({ status: 'no_orders', contact: { id: 'c1' } })
      })
      it('returns found + full detail when order exists', async () => {
        resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'found', contact: buildContact(), duplicates: [] })
        listOrdersMock.mockResolvedValueOnce({ success: true, data: [buildOrderListItem('o1')] })
        getOrderByIdMock.mockResolvedValueOnce({ success: true, data: buildOrderDetail('o1') })
        const r = await exec('getLastOrderByPhone', { phone: '+573001234567' })
        expect(r).toMatchObject({ status: 'found', data: { id: 'o1' } })
      })
      it('returns db_error when resolve fails with kind error', async () => {
        resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'error', message: 'fail' })
        const r = await exec('getLastOrderByPhone', { phone: '+573001234567' })
        expect(r).toMatchObject({ status: 'error', error: { code: 'db_error' } })
      })
    })

    // ─── getOrdersByPhone ──────────────────────────────────────────
    describe('getOrdersByPhone', () => {
      it('returns ok with count + items', async () => {
        resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'found', contact: buildContact(), duplicates: [] })
        listOrdersMock.mockResolvedValueOnce({
          success: true,
          data: [buildOrderListItem('a'), buildOrderListItem('b')],
        })
        const r = await exec('getOrdersByPhone', { phone: '+573001234567', limit: 10, offset: 0 })
        expect(r).toMatchObject({ status: 'ok', count: 2 })
      })
      it('returns no_orders when empty', async () => {
        resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'found', contact: buildContact(), duplicates: [] })
        listOrdersMock.mockResolvedValueOnce({ success: true, data: [] })
        const r = await exec('getOrdersByPhone', { phone: '+573001234567' })
        expect(r).toMatchObject({ status: 'no_orders' })
      })
      it('threads limit + offset to listOrders', async () => {
        resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'found', contact: buildContact(), duplicates: [] })
        listOrdersMock.mockResolvedValueOnce({ success: true, data: [] })
        await exec('getOrdersByPhone', { phone: '+573001234567', limit: 5, offset: 10 })
        expect(listOrdersMock).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ contactId: 'c1', limit: 5, offset: 10 }),
        )
      })
      it('returns not_found when contact missing', async () => {
        resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'not_found' })
        const r = await exec('getOrdersByPhone', { phone: '+573001234567' })
        expect(r).toEqual({ status: 'not_found' })
      })
    })

    // ─── getActiveOrderByPhone ─────────────────────────────────────
    describe('getActiveOrderByPhone', () => {
      it('D-27: returns config_not_set when configWasEmpty', async () => {
        resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'found', contact: buildContact(), duplicates: [] })
        findActiveOrderForContactMock.mockResolvedValueOnce({
          active: null, otherActiveCount: 0, lastTerminal: null, configWasEmpty: true,
        })
        const r = await exec('getActiveOrderByPhone', { phone: '+573001234567' })
        expect(r).toMatchObject({ status: 'config_not_set', contact: { id: 'c1' } })
        const completed = recordEventMock.mock.calls.find((c) => c[1] === 'crm_query_completed')
        expect(completed?.[2]).toMatchObject({ status: 'config_not_set' })
      })

      it('D-17: returns no_active_order + last_terminal_order detail', async () => {
        resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'found', contact: buildContact(), duplicates: [] })
        findActiveOrderForContactMock.mockResolvedValueOnce({
          active: null, otherActiveCount: 0, lastTerminal: buildOrderListItem('term-1'), configWasEmpty: false,
        })
        getOrderByIdMock.mockResolvedValueOnce({ success: true, data: buildOrderDetail('term-1') })
        const r = await exec('getActiveOrderByPhone', { phone: '+573001234567' })
        expect(r).toMatchObject({
          status: 'no_active_order',
          contact: { id: 'c1' },
          last_terminal_order: { id: 'term-1' },
        })
      })

      it('D-17: returns no_active_order with no last_terminal_order', async () => {
        resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'found', contact: buildContact(), duplicates: [] })
        findActiveOrderForContactMock.mockResolvedValueOnce({
          active: null, otherActiveCount: 0, lastTerminal: null, configWasEmpty: false,
        })
        const r = await exec('getActiveOrderByPhone', { phone: '+573001234567' }) as { status: string; last_terminal_order?: unknown }
        expect(r.status).toBe('no_active_order')
        expect(r.last_terminal_order).toBeUndefined()
      })

      it('D-15: returns found + other_active_orders_count', async () => {
        resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'found', contact: buildContact(), duplicates: [] })
        findActiveOrderForContactMock.mockResolvedValueOnce({
          active: buildOrderListItem('act-newest'), otherActiveCount: 2, lastTerminal: null, configWasEmpty: false,
        })
        getOrderByIdMock.mockResolvedValueOnce({ success: true, data: buildOrderDetail('act-newest') })
        const r = await exec('getActiveOrderByPhone', { phone: '+573001234567' })
        expect(r).toMatchObject({
          status: 'found',
          data: { id: 'act-newest', other_active_orders_count: 2 },
        })
      })

      it('D-16: threads pipelineId param to helper', async () => {
        resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'found', contact: buildContact(), duplicates: [] })
        findActiveOrderForContactMock.mockResolvedValueOnce({
          active: null, otherActiveCount: 0, lastTerminal: null, configWasEmpty: false,
        })
        await exec('getActiveOrderByPhone', { phone: '+573001234567', pipelineId: '00000000-0000-0000-0000-000000000123' })
        expect(findActiveOrderForContactMock).toHaveBeenCalledWith(
          expect.anything(),
          'c1',
          '00000000-0000-0000-0000-000000000123',
        )
      })

      it('returns invalid_phone via resolve', async () => {
        resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'invalid_phone' })
        const r = await exec('getActiveOrderByPhone', { phone: 'xx' })
        expect(r).toEqual({ status: 'error', error: { code: 'invalid_phone' } })
      })
    })

    // ─── getOrderById ──────────────────────────────────────────────
    describe('getOrderById', () => {
      it('returns found when domain returns data', async () => {
        getOrderByIdMock.mockResolvedValueOnce({ success: true, data: buildOrderDetail('o9') })
        const r = await exec('getOrderById', { orderId: '00000000-0000-0000-0000-000000000009' })
        expect(r).toMatchObject({ status: 'found', data: { id: 'o9' } })
      })
      it('returns not_found when data is null', async () => {
        getOrderByIdMock.mockResolvedValueOnce({ success: true, data: null })
        const r = await exec('getOrderById', { orderId: '00000000-0000-0000-0000-000000000009' })
        expect(r).toEqual({ status: 'not_found' })
      })
      it('returns db_error when domain fails', async () => {
        getOrderByIdMock.mockResolvedValueOnce({ success: false, error: 'gone' })
        const r = await exec('getOrderById', { orderId: '00000000-0000-0000-0000-000000000009' })
        expect(r).toMatchObject({ status: 'error', error: { code: 'db_error' } })
      })
    })
    ```

    Run: `npm run test -- --run src/lib/agents/shared/crm-query-tools/__tests__/orders.test.ts`. All tests must pass.
  </action>
  <verify>
    <automated>npm run test -- --run src/lib/agents/shared/crm-query-tools/__tests__/orders.test.ts 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - Tests pass (exit 0).
    - ≥16 individual `it(` blocks across 4 describes.
    - `grep -c "config_not_set" __tests__/orders.test.ts` returns ≥1 (D-27 case).
    - `grep -c "other_active_orders_count" __tests__/orders.test.ts` returns ≥1 (D-15 assertion).
    - `grep -c "last_terminal_order" __tests__/orders.test.ts` returns ≥2 (D-17 cases).
    - `grep -c "pipelineId" __tests__/orders.test.ts` returns ≥1 (D-16 case).
  </acceptance_criteria>
  <done>4 order tools fully unit-tested. D-15/D-16/D-17/D-27 covered.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4.5: Anti-pattern grep + full test suite + commit + push</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (Section "Mitigation: planner adds these greps to Wave verify steps")
    - .claude/rules/code-changes.md
  </read_first>
  <action>
    1. BLOCKER 1 grep:
       ```
       grep -E "^import" src/lib/agents/shared/crm-query-tools/*.ts | grep -E "createAdminClient|@supabase/supabase-js"
       ```
       Expected: 0 matches.

    2. Hardcoded stage names grep:
       ```
       grep -rn "'CONFIRMADO'\|'ENTREGADO'\|'FALTA INFO'\|'NUEVO PAG WEB'\|is_closed" src/lib/agents/shared/crm-query-tools/ --include="*.ts" | grep -v __tests__
       ```
       Expected: 0 matches.

    3. Session writes grep:
       ```
       grep -rn "SessionManager\|datos_capturados" src/lib/agents/shared/crm-query-tools/ --include="*.ts"
       ```
       Expected: 0.

    4. Module scope cache check (no top-level Map / LRU):
       ```
       grep -rn "^const cache\|new LRU\|new Map(" src/lib/agents/shared/crm-query-tools/ --include="*.ts" | grep -v __tests__
       ```
       Expected: 0 (D-19 enforced).

    5. Full type-check + full Vitest:
       ```
       npx tsc --noEmit -p .
       npm run test -- --run
       ```
       Both exit 0.

    6. Stage + commit:
       ```
       git add src/lib/agents/shared/crm-query-tools/
       git commit -m "$(cat <<'EOF'
       feat(crm-query-tools): 4 order tools + helpers + unit tests

       - orders.ts: getLastOrderByPhone, getOrdersByPhone, getActiveOrderByPhone, getOrderById.
       - helpers.ts: resolveContactByPhone, findActiveOrderForContact (pure logic for D-15/16/17/27).
       - index.ts: factory now spreads makeOrderQueryTools.
       - __tests__/orders.test.ts: 16+ tests covering D-10/15/16/17/27.
       - __tests__/helpers.test.ts: 9+ tests covering D-15/16/17/27 + resolveContactByPhone sanity.
       - BLOCKER 1: zero createAdminClient in module.
       - No hardcoded stage names; no session_state writes; no module-scope cache.

       Standalone: crm-query-tools Plan 04 (Wave 3).
       Refs D-02, D-07, D-10, D-15, D-16, D-17, D-18, D-19, D-20, D-23, D-27.

       Co-authored-by: Claude <noreply@anthropic.com>
       EOF
       )"
       ```

    7. Push: `git push origin main`.
  </action>
  <verify>
    <automated>! grep -E "^import" src/lib/agents/shared/crm-query-tools/*.ts | grep -qE "createAdminClient|@supabase/supabase-js" && npm run test -- --run src/lib/agents/shared/crm-query-tools 2>&1 | tail -5 && git log -1 --oneline | grep -i "crm-query-tools"</automated>
  </verify>
  <acceptance_criteria>
    - All anti-pattern greps return 0.
    - `npm run test -- --run` (full suite) exits 0 — no regression.
    - `npx tsc --noEmit -p .` exits 0.
    - `git log -1 --pretty=%s` matches `feat(crm-query-tools): 4 order tools`.
    - `git log @{u}..HEAD` is empty (push succeeded).
  </acceptance_criteria>
  <done>Plan 04 shipped. Module is feature-complete. UI (Plan 05) and tests (Plan 06) unblocked.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Tool input (LLM-provided phone / orderId) → tool runtime | Untrusted input |
| Tool runtime → domain (orders, contacts, config) | Workspace filter enforced |
| Tool → helper (findActiveOrderForContact) | Helper trusts ctx; no untrusted input passed through |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-W3-01 | Information Disclosure | `getOrderById` returns order from another workspace | HIGH | mitigate | Domain `getOrderById` filters by `ctx.workspaceId`. inputSchema accepts `orderId: z.string().uuid()` only — no workspaceId field. Plan 06 integration test seeds orders in 2 workspaces and asserts isolation. |
| T-W3-02 | Information Disclosure | `getActiveOrderByPhone` leaks PII via observability `pipelineIdOverride` | LOW | accept | pipelineId is workspace-scoped UUID, not PII. Acceptable to log. |
| T-W3-03 | Tampering | Caller bypasses config by passing `pipelineId` to override scope | INFO | accept | D-16 explicitly allows the override. Workspace isolation still enforced (active stages junction filtered by ctx.workspaceId in helper's config read). |
| T-W3-04 | Information Disclosure | Stale active stage IDs in config leak post-deletion | INFO | mitigate | Plan 02 FK CASCADE removes deleted stage IDs from junction. Helper reads fresh config (D-19) every call. |
| T-W3-05 | Denial of Service | listOrders returns >50 items causing slow filter | LOW | mitigate | Helper hard-caps `listOrders(..., { limit: 50 })`. In-memory partition is O(n). Acceptable. |
| T-W3-06 | Information Disclosure | Phone PII in logs/events | MEDIUM | mitigate | All tools call `phoneSuffix(raw).slice(-4)` for events. Logger errors include `phoneSuffix` not raw phone (orders.ts). |
| T-W3-07 | Tampering | findActiveOrderForContact short-circuits when override empty config — could be misused for enumeration | LOW | accept | The "active stages" set without config is empty by design (D-27 surfaces config_not_set). Even with override, listOrders filters by workspace_id. No enumeration path. |
| T-W3-08 | Repudiation | Tool calls without trace | INFO | mitigate | All 4 tools emit `crm_query_invoked` + `crm_query_completed`/`failed` with `tool`, `workspaceId`, `invoker`, `latencyMs`, `status`. |
</threat_model>

<verification>
- `npm run test -- --run` (full suite) exits 0 — ≥16 new order tests + ≥9 new helper tests + Plan 03's 7 contact tests all green.
- `npx tsc --noEmit -p .` exits 0.
- BLOCKER greps (Task 4.5) return 0.
- Module exports include all 5 tools: `createCrmQueryTools(ctx)` returns `{ getContactByPhone, getLastOrderByPhone, getOrdersByPhone, getActiveOrderByPhone, getOrderById }`.
- `git log -2 --oneline` shows Plan 03 + Plan 04 commits, both pushed.
</verification>

<must_haves>
truths:
  - "createCrmQueryTools(ctx) returns 5 tools, all 5 callable via .execute()."
  - "getActiveOrderByPhone returns config_not_set when activeStageIds empty AND no pipelineId override (D-27)."
  - "getActiveOrderByPhone returns found + other_active_orders_count when multiple actives (D-15)."
  - "getActiveOrderByPhone returns no_active_order + last_terminal_order detail when only terminals exist (D-17)."
  - "getActiveOrderByPhone respects pipelineId override (D-16)."
  - "getOrdersByPhone respects limit + offset for paging."
  - "getOrderById returns not_found when order outside workspace (RLS implicit + workspace filter)."
  - "All tools emit pipeline_decision events with phoneSuffix only (no raw phone)."
  - "Module remains free of createAdminClient / @supabase/supabase-js direct imports (BLOCKER invariant)."
artifacts:
  - path: "src/lib/agents/shared/crm-query-tools/orders.ts"
    provides: "4 order tools (getLastOrderByPhone, getOrdersByPhone, getActiveOrderByPhone, getOrderById)"
    exports: ["makeOrderQueryTools"]
    min_lines: 200
  - path: "src/lib/agents/shared/crm-query-tools/helpers.ts"
    provides: "resolveContactByPhone + findActiveOrderForContact"
    exports: ["resolveContactByPhone", "findActiveOrderForContact", "ActiveOrderResolution", "ResolveContactByPhoneResult"]
  - path: "src/lib/agents/shared/crm-query-tools/__tests__/orders.test.ts"
    provides: "16+ unit tests for the 4 order tools"
  - path: "src/lib/agents/shared/crm-query-tools/__tests__/helpers.test.ts"
    provides: "9+ unit tests for helpers"
  - path: "src/lib/agents/shared/crm-query-tools/index.ts"
    provides: "Updated factory spreading makeOrderQueryTools"
    contains: "...makeOrderQueryTools(ctx)"
key_links:
  - from: "orders.ts"
    to: "./helpers (resolveContactByPhone, findActiveOrderForContact)"
    via: "import"
    pattern: "from './helpers'"
  - from: "helpers.ts"
    to: "@/lib/domain/crm-query-tools-config (getCrmQueryToolsConfig)"
    via: "import"
    pattern: "from '@/lib/domain/crm-query-tools-config'"
  - from: "ctx.workspaceId"
    to: "domainCtx.workspaceId in 4 tools"
    via: "factory closure"
    pattern: "workspaceId: ctx.workspaceId"
</must_haves>

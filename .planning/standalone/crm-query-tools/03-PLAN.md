---
plan: 03
wave: 2
phase: standalone-crm-query-tools
depends_on: [02]
files_modified:
  - src/lib/agents/shared/crm-query-tools/index.ts
  - src/lib/agents/shared/crm-query-tools/types.ts
  - src/lib/agents/shared/crm-query-tools/contacts.ts
  - src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts
autonomous: true
requirements:
  - D-04  # Module at src/lib/agents/shared/crm-query-tools/, export createCrmQueryTools
  - D-05  # Workspace isolation via ctx.workspaceId; never accept workspaceId from input
  - D-07  # Discriminated union return shape (status field), no throws for expected outcomes
  - D-08  # 2+ contacts same phone → most recent + duplicates_count + duplicates: string[]
  - D-09  # Phone normalization inside the tool via normalizePhone helper
  - D-10  # not_found vs no_orders distinction (this plan delivers not_found path for contacts)
  - D-18  # Use ContactDetail from domain (no fork) — extended in Plan 02
  - D-19  # No cache; every tool call hits domain fresh
  - D-20  # Output always includes tags + custom_fields (no opt-in flags)
  - D-23  # Observability events pipeline_decision:crm_query_invoked / completed / failed
---

<objective>
Create the `src/lib/agents/shared/crm-query-tools/` module skeleton with `createCrmQueryTools(ctx)` factory, the discriminated-union types, the FIRST tool `getContactByPhone` (proves the shape end-to-end), and unit tests with mocked domain. This is the smallest possible vertical slice that exercises every architectural concern: workspace isolation, phone normalization, duplicate detection, observability emission, no `createAdminClient`. Plan 04 adds the 4 order tools using the same shape.
</objective>

<context>
@./CLAUDE.md
@./.claude/rules/agent-scope.md
@.planning/standalone/crm-query-tools/CONTEXT.md
@.planning/standalone/crm-query-tools/RESEARCH.md
@.planning/standalone/crm-query-tools/PATTERNS.md
@src/lib/agents/crm-reader/types.ts
@src/lib/agents/crm-reader/tools/contacts.ts
@src/lib/agents/crm-reader/tools/index.ts
@src/lib/domain/contacts.ts
@src/lib/domain/types.ts
@src/lib/utils/phone.ts
@src/lib/observability/index.ts
@src/lib/observability/collector.ts
@src/lib/audit/logger.ts
@src/lib/agents/somnio-pw-confirmation/__tests__/crm-writer-adapter.test.ts

<interfaces>
<!-- Contracts this plan creates that Plan 04 + Plan 05 + Plan 06 consume. -->

NEW types (this plan):
```typescript
// src/lib/agents/shared/crm-query-tools/types.ts
import type { ContactDetail } from '@/lib/domain/contacts'
import type { OrderDetail, OrderListItem } from '@/lib/domain/orders'

export interface CrmQueryToolsContext {
  workspaceId: string
  invoker?: string  // e.g. 'somnio-recompra-v1' — for observability
}

// Lookup result (single entity). Renamed `not_found_in_workspace` → `not_found`
// per RESEARCH Open Q7 (workspace is implicit; document divergence in handoff).
export type CrmQueryLookupResult<T> =
  | { status: 'found'; data: T }
  | { status: 'not_found' }
  | { status: 'no_orders'; contact: ContactDetail }
  | { status: 'no_active_order'; contact: ContactDetail; last_terminal_order?: OrderDetail }
  | { status: 'config_not_set'; contact: ContactDetail }   // D-27
  | { status: 'error'; error: { code: string; message?: string } }

export type CrmQueryListResult<T> =
  | { status: 'ok'; count: number; items: T[] }
  | { status: 'not_found' }
  | { status: 'no_orders'; contact: ContactDetail }
  | { status: 'error'; error: { code: string; message?: string } }

// Convenience type for getContactByPhone payload
export type ContactWithDuplicates = ContactDetail & {
  duplicates_count: number
  duplicates: string[]   // contact IDs of older duplicates
}
```

Factory export (consumed by future agents and Plan 06 test runner):
```typescript
export function createCrmQueryTools(ctx: CrmQueryToolsContext): {
  getContactByPhone: ReturnType<typeof tool>
  // (Plan 04 adds: getLastOrderByPhone, getOrdersByPhone, getActiveOrderByPhone, getOrderById)
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 3.1: Create types.ts + index.ts (factory aggregator skeleton)</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 3 — index.ts factory analog, lines ~178-211; File 4 — types.ts analog with adaptations, lines ~213-271; RESEARCH Example 1)
    - src/lib/agents/crm-reader/types.ts (full file — analog for ToolLookupResult, ToolListResult, ReaderContext)
    - src/lib/agents/crm-reader/tools/index.ts (lines 1-24 — verbatim factory pattern)
    - src/lib/domain/contacts.ts (re-confirm ContactDetail export; was extended in Plan 02 with `department`)
    - src/lib/domain/orders.ts (re-confirm OrderDetail + OrderListItem exports)
  </read_first>
  <behavior>
    - types.ts exports `CrmQueryToolsContext`, `CrmQueryLookupResult<T>`, `CrmQueryListResult<T>`, `ContactWithDuplicates`.
    - index.ts exports `createCrmQueryTools(ctx)` that returns a spread of `makeContactQueryTools(ctx)` (orders factory comes in Plan 04).
    - Both files compile under `tsc --noEmit -p .` with zero errors.
    - The discriminated union exhausts cleanly in switch statements (downstream consumers can rely on TS exhaustiveness).
  </behavior>
  <action>
    1. Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/shared/crm-query-tools/types.ts` with EXACT contents:

    ```typescript
    /**
     * CRM Query Tools — shared types.
     *
     * Standalone crm-query-tools Wave 2 (Plan 03).
     *
     * D-07 / D-10 / D-15 / D-17 / D-27 — discriminated union with statuses:
     *   - 'found'              — happy path
     *   - 'not_found'          — phone unknown (D-10) — renamed from crm-reader's
     *                            'not_found_in_workspace' per Open Q7 (workspace implicit).
     *   - 'no_orders'          — contact exists, has zero orders (D-10)
     *   - 'no_active_order'    — contact + orders exist, none in active stages (D-17)
     *   - 'config_not_set'     — workspace never configured active stages (D-27)
     *   - 'error'              — DB / validation failure
     *
     * Error shape diverges intentionally from crm-reader: `{ error: { code, message? } }`
     * vs flat `{ message }`. The nested code allows downstream agents to switch on
     * 'invalid_phone' / 'db_error' / 'config_not_set' without parsing strings.
     * Document divergence in INTEGRATION-HANDOFF.md (Plan 07).
     *
     * D-18: ContactDetail and OrderDetail are imported from domain layer — never forked.
     */

    import type { ContactDetail } from '@/lib/domain/contacts'
    import type { OrderDetail } from '@/lib/domain/orders'

    export interface CrmQueryToolsContext {
      workspaceId: string
      /** Caller agent id for observability (e.g. 'somnio-recompra-v1'). Optional. */
      invoker?: string
    }

    export type CrmQueryLookupResult<T> =
      | { status: 'found'; data: T }
      | { status: 'not_found' }
      | { status: 'no_orders'; contact: ContactDetail }
      | { status: 'no_active_order'; contact: ContactDetail; last_terminal_order?: OrderDetail }
      | { status: 'config_not_set'; contact: ContactDetail }
      | { status: 'error'; error: { code: string; message?: string } }

    export type CrmQueryListResult<T> =
      | { status: 'ok'; count: number; items: T[] }
      | { status: 'not_found' }
      | { status: 'no_orders'; contact: ContactDetail }
      | { status: 'error'; error: { code: string; message?: string } }

    /** Convenience type for getContactByPhone — adds duplicates flag (D-08). */
    export type ContactWithDuplicates = ContactDetail & {
      duplicates_count: number
      duplicates: string[]
    }
    ```

    2. Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/shared/crm-query-tools/index.ts` with EXACT contents:

    ```typescript
    /**
     * CRM Query Tools — factory aggregator.
     *
     * Standalone crm-query-tools Wave 2 (Plan 03).
     *
     * Usage from a future agent (NOT migrated in THIS standalone, see D-25):
     *   tools: { ...createCrmQueryTools({ workspaceId: ctx.workspaceId, invoker: 'agent-id' }) }
     *
     * D-04: factory pattern. Per-call instantiation; no module-scope state (Pitfall 6).
     * D-19: no cache.
     */

    import { makeContactQueryTools } from './contacts'
    // Plan 04 adds: import { makeOrderQueryTools } from './orders'

    export type {
      CrmQueryToolsContext,
      CrmQueryLookupResult,
      CrmQueryListResult,
      ContactWithDuplicates,
    } from './types'

    export function createCrmQueryTools(ctx: import('./types').CrmQueryToolsContext) {
      return {
        ...makeContactQueryTools(ctx),
        // Plan 04: ...makeOrderQueryTools(ctx),
      }
    }
    ```

    Note: `index.ts` import of `./contacts` will fail tsc until Task 3.2 lands. That's intentional — Task 3.2 follows immediately.
  </action>
  <verify>
    <automated>test -f src/lib/agents/shared/crm-query-tools/types.ts && test -f src/lib/agents/shared/crm-query-tools/index.ts && grep -q "CrmQueryToolsContext" src/lib/agents/shared/crm-query-tools/types.ts && grep -q "config_not_set" src/lib/agents/shared/crm-query-tools/types.ts && grep -q "createCrmQueryTools" src/lib/agents/shared/crm-query-tools/index.ts</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/agents/shared/crm-query-tools/types.ts` exists.
    - `src/lib/agents/shared/crm-query-tools/index.ts` exists.
    - `grep -c "config_not_set" src/lib/agents/shared/crm-query-tools/types.ts` returns ≥1 (D-27).
    - `grep -c "not_found_in_workspace" src/lib/agents/shared/crm-query-tools/types.ts` returns 0 (intentional rename).
    - `grep -c "ContactDetail" src/lib/agents/shared/crm-query-tools/types.ts` returns ≥1 (imports from domain — D-18 no fork).
    - tsc errors against `index.ts` referring to `./contacts` are acceptable until Task 3.2.
  </acceptance_criteria>
  <done>Types + factory skeleton created. tsc on `contacts.ts` import deferred to next task.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3.2: Implement getContactByPhone tool (contacts.ts)</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 5 — contacts.ts analog + adaptations, lines ~273-352; full Example 2 in RESEARCH ~lines 569-682)
    - src/lib/agents/crm-reader/tools/contacts.ts (full file — verbatim analog: BLOCKER 1 invariant, AI SDK v6 tool() pattern, factory shape)
    - src/lib/utils/phone.ts (lines 37-87 — normalizePhone returns string | null; line 12-16 — depends on libphonenumber-js)
    - src/lib/domain/contacts.ts (lines 539-580 — searchContacts contract; lines 610-658 — getContactById contract; line 592 — extended ContactDetail with department from Plan 02)
    - src/lib/observability/index.ts (line 32 — getCollector export)
    - src/lib/observability/collector.ts (line 153 — recordEvent signature: `recordEvent(category, label, payload)`)
    - src/lib/observability/types.ts (line 77 — confirm `pipeline_decision` is a valid EventCategory)
    - src/lib/audit/logger.ts (line 86 — createModuleLogger)
    - src/lib/agents/engine-adapters/production/crm-writer-adapter.ts (lines 156-178 — canonical recordEvent('pipeline_decision', label, payload) example)
  </read_first>
  <behavior>
    Tool `getContactByPhone({ phone })` MUST:
    - Test: invalid phone (e.g., empty / `"abc"`) → `{ status: 'error', error: { code: 'invalid_phone' } }` (D-09).
    - Test: phone NOT in workspace → `{ status: 'not_found' }` (D-10). NO contact field.
    - Test: phone in workspace, single contact → `{ status: 'found', data: ContactWithDuplicates }` with `duplicates_count: 0`, `duplicates: []`.
    - Test: phone in workspace, 2+ contacts (same phone, different created_at) → `{ status: 'found', data: ContactWithDuplicates }` where `data.id` = newest contact, `duplicates_count: N-1`, `duplicates: [olderIds...]` (D-08).
    - Test: domain `searchContacts` returns `{ success: false, error: ... }` → `{ status: 'error', error: { code: 'db_error', message } }`.
    - Test: emits `pipeline_decision:crm_query_invoked` event with `{ tool, workspaceId, invoker, phoneSuffix }` on entry.
    - Test: emits `pipeline_decision:crm_query_completed` with `{ status, latencyMs, duplicatesCount? }` on success/not_found.
    - Test: emits `pipeline_decision:crm_query_failed` with `{ errorCode, latencyMs }` on error path.
    - Test: phoneSuffix in events = last 4 digits of raw input only (PII redaction — never full phone).
  </behavior>
  <action>
    Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/shared/crm-query-tools/contacts.ts` with EXACT contents below.

    ```typescript
    /**
     * CRM Query Tools — Contact Tools.
     *
     * Standalone crm-query-tools Wave 2 (Plan 03).
     *
     * BLOCKER invariant (CRITICAL): this file MUST import ONLY from '@/lib/domain/*'
     * for data access. NO createAdminClient. NO @supabase/supabase-js direct import.
     * Verified via grep:
     *   grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/shared/crm-query-tools/
     * Expected: zero matches in production code (this comment is the only allowed mention).
     *
     * D-04: factory pattern.
     * D-05: workspace from ctx, NEVER from input.
     * D-08: duplicates resolution — newest by createdAt + duplicates_count + duplicates: string[].
     * D-09: phone normalization via normalizePhone — invalid_phone if null.
     * D-10: not_found if no contact matches.
     * D-18: ContactDetail imported from domain (no fork).
     * D-19: no cache; every call hits domain.
     * D-20: tags + customFields always present (handled by getContactById).
     * D-23: emits pipeline_decision:crm_query_invoked/completed/failed.
     */

    import { tool } from 'ai'
    import { z } from 'zod'
    import {
      searchContacts,
      getContactById,
      type ContactDetail,
    } from '@/lib/domain/contacts'
    import type { DomainContext } from '@/lib/domain/types'
    import { createModuleLogger } from '@/lib/audit/logger'
    import { getCollector } from '@/lib/observability'
    import { normalizePhone } from '@/lib/utils/phone'
    import type {
      CrmQueryToolsContext,
      CrmQueryLookupResult,
      ContactWithDuplicates,
    } from './types'

    const logger = createModuleLogger('crm-query-tools.contacts')

    function phoneSuffix(raw: string): string {
      return raw.replace(/\D/g, '').slice(-4)
    }

    export function makeContactQueryTools(ctx: CrmQueryToolsContext) {
      const domainCtx: DomainContext = {
        workspaceId: ctx.workspaceId,
        source: 'tool-handler',
      }

      return {
        getContactByPhone: tool({
          description:
            'Busca un contacto del workspace por numero de telefono. Acepta cualquier formato razonable ' +
            '(3001234567, +57 300 123 4567, etc) y normaliza a E.164 internamente. ' +
            'Retorna el contacto con tags y custom_fields. Si hay duplicados con el mismo telefono, ' +
            'retorna el mas reciente con duplicates_count y la lista duplicates.',
          inputSchema: z.object({
            phone: z.string().min(7).describe('Telefono del contacto en cualquier formato razonable.'),
          }),
          execute: async ({ phone }): Promise<CrmQueryLookupResult<ContactWithDuplicates>> => {
            const startedAt = Date.now()
            const collector = getCollector()
            const baseEvt = {
              tool: 'getContactByPhone' as const,
              workspaceId: ctx.workspaceId,
              invoker: ctx.invoker,
            }

            collector?.recordEvent('pipeline_decision', 'crm_query_invoked', {
              ...baseEvt,
              phoneSuffix: phoneSuffix(phone),
            })

            // 1. Phone normalization (D-09)
            const e164 = normalizePhone(phone)
            if (!e164) {
              collector?.recordEvent('pipeline_decision', 'crm_query_failed', {
                ...baseEvt,
                errorCode: 'invalid_phone',
                latencyMs: Date.now() - startedAt,
              })
              return { status: 'error', error: { code: 'invalid_phone' } }
            }

            // 2. Search via domain (workspace-filtered)
            const search = await searchContacts(domainCtx, {
              query: e164.replace(/^\+/, ''),  // strip + for ILIKE substring match (Pitfall 4)
              limit: 50,
            })
            if (!search.success) {
              logger.error(
                { error: search.error, workspaceId: ctx.workspaceId, phoneSuffix: phoneSuffix(phone) },
                'getContactByPhone: searchContacts failed',
              )
              collector?.recordEvent('pipeline_decision', 'crm_query_failed', {
                ...baseEvt,
                errorCode: 'db_error',
                latencyMs: Date.now() - startedAt,
              })
              return { status: 'error', error: { code: 'db_error', message: search.error } }
            }

            // 3. Filter for exact phone match (search is ILIKE substring → narrow)
            const matches = (search.data ?? []).filter(
              (c) => normalizePhone(c.phone ?? '') === e164,
            )

            if (matches.length === 0) {
              collector?.recordEvent('pipeline_decision', 'crm_query_completed', {
                ...baseEvt,
                status: 'not_found',
                latencyMs: Date.now() - startedAt,
              })
              return { status: 'not_found' }
            }

            // 4. D-08: sort DESC by createdAt; primary = newest, duplicates = the rest
            matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            const primary = matches[0]
            const duplicates = matches.slice(1).map((m) => m.id)

            // 5. Fetch full ContactDetail (tags + custom_fields + department)
            const detail = await getContactById(domainCtx, { contactId: primary.id })
            if (!detail.success || !detail.data) {
              logger.error(
                { error: detail.success ? 'no detail' : detail.error, contactId: primary.id, workspaceId: ctx.workspaceId },
                'getContactByPhone: getContactById failed for primary',
              )
              collector?.recordEvent('pipeline_decision', 'crm_query_failed', {
                ...baseEvt,
                errorCode: 'detail_fetch_failed',
                latencyMs: Date.now() - startedAt,
              })
              return {
                status: 'error',
                error: {
                  code: 'db_error',
                  message: detail.success ? 'contact disappeared between search and detail fetch' : detail.error,
                },
              }
            }

            // 6. Emit success + return
            collector?.recordEvent('pipeline_decision', 'crm_query_completed', {
              ...baseEvt,
              status: 'found',
              duplicatesCount: duplicates.length,
              latencyMs: Date.now() - startedAt,
            })

            const data: ContactWithDuplicates = {
              ...(detail.data as ContactDetail),
              duplicates_count: duplicates.length,
              duplicates,
            }
            return { status: 'found', data }
          },
        }),
      }
    }
    ```

    Run `npx tsc --noEmit -p .` — zero errors. Then run the BLOCKER 1 grep:
    ```
    grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/shared/crm-query-tools/ --include="*.ts"
    ```
    Expected: ONE match in the doc-comment header of `contacts.ts` (the comment that documents the invariant). Zero in actual import statements.
  </action>
  <verify>
    <automated>test -f src/lib/agents/shared/crm-query-tools/contacts.ts && grep -c "normalizePhone" src/lib/agents/shared/crm-query-tools/contacts.ts && grep -c "@/lib/domain/contacts" src/lib/agents/shared/crm-query-tools/contacts.ts && ! grep -E "^import.*createAdminClient" src/lib/agents/shared/crm-query-tools/contacts.ts && npx tsc --noEmit -p . 2>&1 | grep -E "shared/crm-query-tools" | head -5</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/agents/shared/crm-query-tools/contacts.ts` exists.
    - `grep -c "import.*normalizePhone" {file}` returns ≥1.
    - `grep -c "@/lib/domain/contacts" {file}` returns ≥1.
    - `grep -c "tool(" {file}` returns ≥1 (AI SDK v6 factory).
    - `grep -E "^import.*createAdminClient" {file}` returns 0 (BLOCKER invariant).
    - `grep -E "^import.*@supabase/supabase-js" {file}` returns 0.
    - `grep -c "ctx.workspaceId" {file}` returns ≥3 (domain ctx + observability).
    - `grep -c "phoneSuffix" {file}` returns ≥3 (PII redaction in events).
    - `grep -c "recordEvent" {file}` returns ≥4 (invoked + completed + 2 failed paths minimum).
    - `npx tsc --noEmit -p .` returns zero errors in this file or any other.
    - `grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/shared/crm-query-tools/ --include="*.ts" | grep -v "// "` returns 0 (only matches in doc comments allowed).
  </acceptance_criteria>
  <done>getContactByPhone fully implemented with D-08, D-09, D-10, D-18, D-19, D-20, D-23 covered. Module skeleton import is now valid.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3.3: Write unit tests for getContactByPhone (contacts.test.ts)</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 8 — test analog, lines 484-538)
    - src/lib/agents/somnio-pw-confirmation/__tests__/crm-writer-adapter.test.ts (lines 1-90 — vi.hoisted + vi.mock pattern)
    - src/lib/agents/somnio-recompra/__tests__/transitions.test.ts (lines 1-55 — pure unit test scaffold)
    - vitest.config.ts (current config; e2e/** exclude added in Plan 01)
    - src/lib/agents/shared/crm-query-tools/contacts.ts (just-created — to know what to mock)
  </read_first>
  <behavior>
    Test cases (all D-XX coverage):
    1. D-09 invalid phone (`"abc"`) → `{ status: 'error', error: { code: 'invalid_phone' } }`. normalizePhone NOT mocked (real lib). Asserts `recordEvent` called with label `crm_query_failed` and `errorCode: 'invalid_phone'`.
    2. D-10 not_found: searchContacts returns empty array → `{ status: 'not_found' }`. Asserts `crm_query_completed` event with `status: 'not_found'`.
    3. D-08 duplicates: searchContacts returns 2 contacts (created_at T1 < T2), both normalize to same E.164 → `data.id === T2.id`, `duplicates_count === 1`, `duplicates === [T1.id]`. Asserts `crm_query_completed` with `duplicatesCount: 1`.
    4. happy path single contact: searchContacts returns 1 contact, getContactById returns full ContactDetail → `data.duplicates_count === 0`, `data.duplicates === []`, `data.id` matches.
    5. DB error: searchContacts returns `{ success: false, error: 'connection lost' }` → `{ status: 'error', error: { code: 'db_error', message: 'connection lost' } }`. Asserts `crm_query_failed` with `errorCode: 'db_error'`.
    6. detail fetch failure: searchContacts succeeds but getContactById returns `{ success: false }` → `{ status: 'error', error: { code: 'db_error' } }`. Asserts `crm_query_failed` with `errorCode: 'detail_fetch_failed'`.
    7. observability redaction: phoneSuffix in events is last 4 digits of raw input. Test with phone `'+57 300 123 4567'` → phoneSuffix === `'4567'`. Asserts payload of crm_query_invoked event.
    8. Workspace isolation (D-05): assert that the tool internally constructs `domainCtx.workspaceId = ctx.workspaceId`. Verify by inspecting the first-arg of mocked searchContacts.
  </behavior>
  <action>
    Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts` with EXACT contents:

    ```typescript
    /**
     * Unit tests for getContactByPhone (Plan 03 / Wave 2).
     *
     * Mocks: @/lib/domain/contacts (searchContacts, getContactById), @/lib/observability (getCollector).
     * Coverage: D-05, D-07, D-08, D-09, D-10, D-18, D-19, D-20, D-23.
     */

    import { describe, it, expect, vi, beforeEach } from 'vitest'

    const { searchContactsMock, getContactByIdMock, recordEventMock } = vi.hoisted(() => ({
      searchContactsMock: vi.fn(),
      getContactByIdMock: vi.fn(),
      recordEventMock: vi.fn(),
    }))

    vi.mock('@/lib/domain/contacts', () => ({
      searchContacts: searchContactsMock,
      getContactById: getContactByIdMock,
    }))

    vi.mock('@/lib/observability', () => ({
      getCollector: () => ({ recordEvent: recordEventMock }),
    }))

    // Import AFTER mocks
    import { makeContactQueryTools } from '../contacts'
    import { createCrmQueryTools } from '../index'

    const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111'
    const CTX = { workspaceId: WORKSPACE_ID, invoker: 'test-suite' } as const

    function buildContactRow(overrides: Partial<{ id: string; phone: string; createdAt: string }> = {}) {
      return {
        id: overrides.id ?? 'c1',
        name: 'Test Contact',
        phone: overrides.phone ?? '+573001234567',
        email: 'test@example.com',
        createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
      }
    }

    function buildContactDetail(id: string) {
      return {
        id,
        name: 'Test Contact',
        phone: '+573001234567',
        email: 'test@example.com',
        address: null,
        city: null,
        department: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null,
        tags: [],
        customFields: {},
      }
    }

    beforeEach(() => {
      vi.clearAllMocks()
    })

    describe('getContactByPhone — D-09 phone normalization', () => {
      it('returns invalid_phone error for non-numeric input', async () => {
        const tools = createCrmQueryTools(CTX)
        const result = await (tools.getContactByPhone as { execute: (i: unknown) => Promise<unknown> }).execute({ phone: 'abc' })
        expect(result).toEqual({ status: 'error', error: { code: 'invalid_phone' } })
        expect(searchContactsMock).not.toHaveBeenCalled()

        // Observability: invoked + failed events emitted
        const labels = recordEventMock.mock.calls.map((c) => c[1])
        expect(labels).toEqual(['crm_query_invoked', 'crm_query_failed'])
        const failedPayload = recordEventMock.mock.calls[1][2]
        expect(failedPayload).toMatchObject({ errorCode: 'invalid_phone', tool: 'getContactByPhone' })
      })
    })

    describe('getContactByPhone — D-10 not_found', () => {
      it('returns not_found when domain search yields zero matches', async () => {
        searchContactsMock.mockResolvedValueOnce({ success: true, data: [] })
        const tools = createCrmQueryTools(CTX)
        const result = await (tools.getContactByPhone as { execute: (i: unknown) => Promise<unknown> }).execute({ phone: '+573001234567' })
        expect(result).toEqual({ status: 'not_found' })

        const completed = recordEventMock.mock.calls.find((c) => c[1] === 'crm_query_completed')
        expect(completed?.[2]).toMatchObject({ status: 'not_found', tool: 'getContactByPhone' })
      })
    })

    describe('getContactByPhone — D-08 duplicates', () => {
      it('returns newest by createdAt + duplicates_count + duplicates list', async () => {
        searchContactsMock.mockResolvedValueOnce({
          success: true,
          data: [
            buildContactRow({ id: 'older', createdAt: '2026-01-01T00:00:00.000Z', phone: '+573001234567' }),
            buildContactRow({ id: 'newer', createdAt: '2026-04-01T00:00:00.000Z', phone: '+573001234567' }),
          ],
        })
        getContactByIdMock.mockResolvedValueOnce({ success: true, data: buildContactDetail('newer') })

        const tools = createCrmQueryTools(CTX)
        const result = await (tools.getContactByPhone as { execute: (i: unknown) => Promise<unknown> }).execute({
          phone: '+573001234567',
        })

        expect(result).toMatchObject({
          status: 'found',
          data: { id: 'newer', duplicates_count: 1, duplicates: ['older'] },
        })

        // getContactById called with the NEWEST id
        expect(getContactByIdMock).toHaveBeenCalledWith(
          expect.objectContaining({ workspaceId: WORKSPACE_ID }),
          { contactId: 'newer' },
        )

        const completed = recordEventMock.mock.calls.find((c) => c[1] === 'crm_query_completed')
        expect(completed?.[2]).toMatchObject({ status: 'found', duplicatesCount: 1 })
      })
    })

    describe('getContactByPhone — happy path single contact', () => {
      it('returns found with duplicates_count: 0', async () => {
        searchContactsMock.mockResolvedValueOnce({
          success: true,
          data: [buildContactRow({ id: 'c1', phone: '+573001234567' })],
        })
        getContactByIdMock.mockResolvedValueOnce({ success: true, data: buildContactDetail('c1') })

        const tools = createCrmQueryTools(CTX)
        const result = await (tools.getContactByPhone as { execute: (i: unknown) => Promise<unknown> }).execute({
          phone: '3001234567',
        })

        expect(result).toMatchObject({
          status: 'found',
          data: { id: 'c1', duplicates_count: 0, duplicates: [] },
        })
      })
    })

    describe('getContactByPhone — error paths', () => {
      it('returns db_error when searchContacts fails', async () => {
        searchContactsMock.mockResolvedValueOnce({ success: false, error: 'connection lost' })
        const tools = createCrmQueryTools(CTX)
        const result = await (tools.getContactByPhone as { execute: (i: unknown) => Promise<unknown> }).execute({
          phone: '+573001234567',
        })
        expect(result).toEqual({ status: 'error', error: { code: 'db_error', message: 'connection lost' } })
        const failed = recordEventMock.mock.calls.find((c) => c[1] === 'crm_query_failed')
        expect(failed?.[2]).toMatchObject({ errorCode: 'db_error' })
      })

      it('returns db_error when getContactById fails after match', async () => {
        searchContactsMock.mockResolvedValueOnce({
          success: true,
          data: [buildContactRow({ id: 'c1', phone: '+573001234567' })],
        })
        getContactByIdMock.mockResolvedValueOnce({ success: false, error: 'detail unavailable' })

        const tools = createCrmQueryTools(CTX)
        const result = await (tools.getContactByPhone as { execute: (i: unknown) => Promise<unknown> }).execute({
          phone: '+573001234567',
        })
        expect(result).toMatchObject({ status: 'error', error: { code: 'db_error' } })
        const failed = recordEventMock.mock.calls.find((c) => c[1] === 'crm_query_failed')
        expect(failed?.[2]).toMatchObject({ errorCode: 'detail_fetch_failed' })
      })
    })

    describe('getContactByPhone — D-23 observability redaction', () => {
      it('emits phoneSuffix as last-4-digits of raw input only', async () => {
        searchContactsMock.mockResolvedValueOnce({ success: true, data: [] })
        const tools = createCrmQueryTools(CTX)
        await (tools.getContactByPhone as { execute: (i: unknown) => Promise<unknown> }).execute({
          phone: '+57 300 123 4567',
        })
        const invoked = recordEventMock.mock.calls.find((c) => c[1] === 'crm_query_invoked')
        expect(invoked?.[2]).toMatchObject({ phoneSuffix: '4567' })
        expect(JSON.stringify(invoked?.[2])).not.toContain('+57')
        expect(JSON.stringify(invoked?.[2])).not.toContain('3001234567')
      })
    })

    describe('getContactByPhone — D-05 workspace isolation', () => {
      it('passes ctx.workspaceId to domain searchContacts (not from input)', async () => {
        searchContactsMock.mockResolvedValueOnce({ success: true, data: [] })
        const tools = createCrmQueryTools({ workspaceId: 'other-ws-id', invoker: 'test' })
        await (tools.getContactByPhone as { execute: (i: unknown) => Promise<unknown> }).execute({
          phone: '+573001234567',
        })
        expect(searchContactsMock).toHaveBeenCalledWith(
          expect.objectContaining({ workspaceId: 'other-ws-id' }),
          expect.anything(),
        )
      })
    })
    ```

    Run the tests:
    ```
    npm run test -- --run src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts
    ```
    All test cases must pass. If any fail, fix `contacts.ts` (NOT the test) until green.
  </action>
  <verify>
    <automated>npm run test -- --run src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts` exists.
    - `npm run test -- --run src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts` exits 0.
    - Output reports ≥7 passing tests covering D-05, D-07, D-08, D-09, D-10, D-23.
    - `grep -c "describe(" {test_file}` returns ≥6 describe blocks.
    - `grep -c "duplicates_count" {test_file}` returns ≥2 (D-08 explicit assertions).
    - `grep -c "phoneSuffix" {test_file}` returns ≥1 (D-23 redaction check).
    - `npx tsc --noEmit -p .` returns zero errors.
  </acceptance_criteria>
  <done>Unit tests green. D-05/07/08/09/10/23 covered.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3.4: Anti-pattern grep verification + commit + push</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (Section "Anti-Patterns Flagged" — Wave 2 grep verification block, lines ~1340-1356)
    - .planning/standalone/crm-query-tools/RESEARCH.md (Section "Pattern 2 — Two-Layer (Tool → Domain) Strict Invariant")
    - .claude/rules/code-changes.md
  </read_first>
  <action>
    1. Run the BLOCKER 1 grep:
       ```
       grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/shared/crm-query-tools/ --include="*.ts"
       ```
       Expected: ONE match in `contacts.ts` (the doc-comment `BLOCKER invariant` line that mentions both terms, plus possibly the comment in the test file). ZERO matches in actual `import` statements.

       Verify via `grep -E "^import" src/lib/agents/shared/crm-query-tools/**/*.ts | grep -E "createAdminClient|@supabase/supabase-js"` returns ZERO.

    2. Run additional anti-pattern greps:
       ```
       # No hardcoded stage names
       grep -rn "'CONFIRMADO'\|'ENTREGADO'\|'FALTA INFO'\|'NUEVO PAG WEB'\|is_closed" src/lib/agents/shared/crm-query-tools/ --include="*.ts" | grep -v __tests__
       # Expected: 0

       # No SessionManager / session_state writes
       grep -rn "SessionManager\|datos_capturados" src/lib/agents/shared/crm-query-tools/ --include="*.ts"
       # Expected: 0

       # No workspaceId in inputSchema
       grep -rn "workspaceId.*z\." src/lib/agents/shared/crm-query-tools/ --include="*.ts" | grep -v __tests__
       # Expected: 0
       ```

    3. Run full type-check + full test suite (regression):
       ```
       npx tsc --noEmit -p .
       npm run test -- --run
       ```
       Both must exit 0.

    4. Stage and commit:
       ```
       git add src/lib/agents/shared/crm-query-tools/
       git commit -m "$(cat <<'EOF'
       feat(crm-query-tools): module skeleton + getContactByPhone + unit tests

       - src/lib/agents/shared/crm-query-tools/{index,types,contacts}.ts
       - Discriminated union: found/not_found/no_orders/no_active_order/config_not_set/error.
       - getContactByPhone: phone normalize + duplicates resolution + observability.
       - 7 unit tests cover D-05, D-07, D-08, D-09, D-10, D-23.
       - BLOCKER invariant verified: zero createAdminClient in module (only doc comment).
       - No hardcoded stage names; no session_state writes.

       Standalone: crm-query-tools Plan 03 (Wave 2).
       Refs D-04, D-05, D-07, D-08, D-09, D-10, D-18, D-19, D-20, D-23.

       Co-authored-by: Claude <noreply@anthropic.com>
       EOF
       )"
       ```

    5. Push: `git push origin main`.
  </action>
  <verify>
    <automated>! grep -E "^import" src/lib/agents/shared/crm-query-tools/index.ts src/lib/agents/shared/crm-query-tools/types.ts src/lib/agents/shared/crm-query-tools/contacts.ts | grep -qE "createAdminClient|@supabase/supabase-js" && npm run test -- --run src/lib/agents/shared/crm-query-tools 2>&1 | tail -5 && git log -1 --oneline</automated>
  </verify>
  <acceptance_criteria>
    - `grep -E "^import" src/lib/agents/shared/crm-query-tools/**/*.ts | grep -E "createAdminClient|@supabase/supabase-js"` returns ZERO.
    - `grep -rn "'CONFIRMADO'\|'ENTREGADO'\|'FALTA INFO'\|'NUEVO PAG WEB'\|is_closed" src/lib/agents/shared/crm-query-tools/ --include="*.ts" | grep -v __tests__` returns ZERO.
    - `grep -rn "SessionManager\|datos_capturados" src/lib/agents/shared/crm-query-tools/ --include="*.ts"` returns ZERO.
    - `npm run test -- --run` exits 0 (all tests, no regression).
    - `npx tsc --noEmit -p .` exits 0.
    - `git log -1 --pretty=%s` matches "feat(crm-query-tools): module skeleton".
    - `git log @{u}..HEAD` is empty (push succeeded).
  </acceptance_criteria>
  <done>Plan 03 shipped. Wave 2 complete. Wave 3 (Plan 04) is unblocked.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Tool input (LLM-provided phone string) → tool runtime | Untrusted; must validate + normalize |
| Tool runtime → domain layer | Must enforce `ctx.workspaceId` (D-05) |
| Tool → observability collector | PII redaction required (phone last-4) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-W2-01 | Information Disclosure | Cross-workspace contact leak via `phone` input | HIGH | mitigate | Tool reads `ctx.workspaceId` (factory closure), passes to `domainCtx`. inputSchema does NOT include `workspaceId`. Pitfall 1. Verified by grep `workspaceId.*z\.` returns 0 in non-test files (Task 3.4). Plan 06 integration test seeds same phone in 2 workspaces and asserts isolation. |
| T-W2-02 | Information Disclosure | Phone PII leaks to observability/log streams | MEDIUM | mitigate | `phoneSuffix(raw).slice(-4)` is the ONLY phone-derived value emitted to events. Logger-error branches log only `phoneSuffix` not full phone. Test asserts `JSON.stringify(invoked.payload).not.toContain('+57')`. |
| T-W2-03 | Tampering | Tool input contains injection (SQL/script) | LOW | mitigate | Phone goes through `normalizePhone` (libphonenumber-js) which rejects non-phone strings → `invalid_phone`. Domain `searchContacts` uses parameterized Supabase queries. zod min(7) caps lower-bound length. |
| T-W2-04 | Tampering | Direct Supabase access bypasses workspace filter | HIGH | mitigate | BLOCKER invariant grep in Task 3.4 confirms zero `createAdminClient` / `@supabase/supabase-js` imports in module. |
| T-W2-05 | Spoofing | Caller spoofs ctx.workspaceId | LOW | accept | `ctx.workspaceId` originates from agent execution context (header `x-workspace-id` validated by middleware, or session_state validated server-side). Out-of-scope for THIS module — invariant of upstream agent layer. |
| T-W2-06 | Repudiation | Tool calls untraceable | INFO | mitigate | Every call emits `crm_query_invoked` + `crm_query_completed`/`failed` with `tool`, `workspaceId`, `invoker`, `latencyMs`. Stored via collector → `agent_observability_events`. |
| T-W2-07 | Denial of Service | Domain returns 50+ contact rows due to ILIKE substring | LOW | mitigate | `searchContacts(domainCtx, { query: e164.replace(/^\+/, ''), limit: 50 })` caps to 50. Filter step narrows to exact `normalizePhone === e164` matches in-memory. Acceptable cost. |
</threat_model>

<verification>
- `npm run test -- --run src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts` exits 0 with ≥7 tests passing.
- `npm run test -- --run` (full suite) exits 0 — no regression in existing tests.
- `npx tsc --noEmit -p .` exits 0.
- BLOCKER 1 grep returns 0 actual imports of `createAdminClient` or `@supabase/supabase-js` in module files.
- `grep -c "ctx.workspaceId" src/lib/agents/shared/crm-query-tools/contacts.ts` returns ≥3.
- `git log -1 --oneline` shows the new commit; `git push origin main` succeeded.
</verification>

<must_haves>
truths:
  - "createCrmQueryTools(ctx) returns an object with getContactByPhone tool registered."
  - "Tool execute({ phone }) normalizes phone to E.164, returns invalid_phone error for garbage input."
  - "Tool returns not_found when no contact matches; returns found with duplicates_count when duplicates exist."
  - "Tool emits pipeline_decision:crm_query_invoked + completed/failed events with phoneSuffix only (PII redacted)."
  - "Tool never imports createAdminClient or @supabase/supabase-js (BLOCKER invariant)."
  - "Tool reads workspaceId from ctx (closure), never from input schema."
artifacts:
  - path: "src/lib/agents/shared/crm-query-tools/index.ts"
    provides: "createCrmQueryTools factory + type re-exports"
    exports: ["createCrmQueryTools", "CrmQueryToolsContext", "CrmQueryLookupResult", "CrmQueryListResult", "ContactWithDuplicates"]
  - path: "src/lib/agents/shared/crm-query-tools/types.ts"
    provides: "Discriminated union return shapes"
    contains: "config_not_set"
  - path: "src/lib/agents/shared/crm-query-tools/contacts.ts"
    provides: "makeContactQueryTools(ctx) → getContactByPhone tool"
    exports: ["makeContactQueryTools"]
  - path: "src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts"
    provides: "Unit tests for getContactByPhone covering 8 cases"
    min_lines: 150
key_links:
  - from: "src/lib/agents/shared/crm-query-tools/contacts.ts"
    to: "@/lib/domain/contacts (searchContacts, getContactById)"
    via: "import"
    pattern: "from '@/lib/domain/contacts'"
  - from: "src/lib/agents/shared/crm-query-tools/contacts.ts"
    to: "@/lib/utils/phone (normalizePhone)"
    via: "import"
    pattern: "from '@/lib/utils/phone'"
  - from: "src/lib/agents/shared/crm-query-tools/contacts.ts"
    to: "@/lib/observability (getCollector)"
    via: "import"
    pattern: "from '@/lib/observability'"
  - from: "ctx.workspaceId"
    to: "domainCtx.workspaceId"
    via: "factory closure"
    pattern: "workspaceId: ctx.workspaceId"
</must_haves>

---
phase: coordinadora-api-integration
plan: 06
type: execute
wave: 2
depends_on: [01, 03]
files_modified:
  - src/lib/domain/carrier-events.ts
  - src/lib/domain/__tests__/carrier-events-coordinadora.test.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "src/lib/domain/carrier-events.ts exports recordCoordinadoraEvent (new) ALONGSIDE existing insertCarrierEvent (untouched)"
    - "recordCoordinadoraEvent attempts orders lookup by tracking_number; sets order_id=null if no match (D-22)"
    - "recordCoordinadoraEvent uses .upsert({ignoreDuplicates:true}) against composite UNIQUE INDEX over codigo_estado_idem generated column (D-07)"
    - "Duplicate INSERT returns success=true with inserted=false (caller skips downstream dispatch)"
    - "New INSERT returns success=true with inserted=true + row id"
    - "ZERO modification to existing insertCarrierEvent, getLastCarrierEvent, getCarrierEventsByOrder (Envia path untouched)"
    - "Insert payload does NOT explicitly set codigo_estado_idem — Postgres derives it from the generated column expression"
  artifacts:
    - path: "src/lib/domain/carrier-events.ts"
      provides: "recordCoordinadoraEvent function + RecordCoordinadoraEventParams interface (extending the existing file)"
      exports: ["recordCoordinadoraEvent", "RecordCoordinadoraEventParams"]
    - path: "src/lib/domain/__tests__/carrier-events-coordinadora.test.ts"
      provides: "Vitest suite covering insert happy path, duplicate, missing order match, error"
  key_links:
    - from: "recordCoordinadoraEvent"
      to: "order_carrier_events table"
      via: "supabase.upsert with onConflict 'workspace_id,tracking_number,fecha,hora,codigo,codigo_estado_idem'"
      pattern: "ignoreDuplicates:true → empty array on conflict, single row on insert; codigo_estado_idem is the generated column from Plan 01 migration"
    - from: "recordCoordinadoraEvent"
      to: "orders.tracking_number"
      via: "supabase.from('orders').select('id').eq('workspace_id', ctx.workspaceId).eq('tracking_number', ...).maybeSingle()"
      pattern: "best-effort lookup; null if no match (D-22)"
    - from: "Plan 01 migration generated column codigo_estado_idem"
      to: "this onConflict string"
      via: "PostgREST infers index from column list; generated column makes the index 'plain-column' from inference POV"
      pattern: "Idempotency mechanism locked at schema level — see Plan 01 §3 ALTER TABLE ... ADD COLUMN codigo_estado_idem"
---

<objective>
Extend `src/lib/domain/carrier-events.ts` with `recordCoordinadoraEvent` — the SOLE entry point for persisting Coordinadora webhook events (Regla 3). The function:

1. Looks up `orders.id` by `tracking_number` (best-effort — null if not found, D-22)
2. Performs idempotent INSERT via `supabase.upsert({ignoreDuplicates: true})` against the composite UNIQUE INDEX `idx_carrier_events_coordinadora_idempotency` (created by Plan 01 migration). The index references the **generated column `codigo_estado_idem`** (= COALESCE(codigo_estado, '')) so PostgREST `onConflict` can use a plain column list.
3. Returns `DomainResult<{ id: string; inserted: boolean }>` — caller (route handler Plan 08) uses `inserted` to decide whether to dispatch Inngest

DO NOT touch the existing `insertCarrierEvent`, `getLastCarrierEvent`, `getCarrierEventsByOrder` functions — they remain the canonical Envia polling path.

Per D-23 (Regla 3): this is the ONLY layer in the standalone allowed to import `createAdminClient`. Webhook route handler (Plan 08) and Inngest function (Plan 09) call THIS function, not Supabase directly.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/coordinadora-api-integration/CONTEXT.md
@.planning/standalone/coordinadora-api-integration/RESEARCH.md
@.planning/standalone/coordinadora-api-integration/PATTERNS.md
@.planning/standalone/coordinadora-api-integration/01-PLAN.md
@src/lib/domain/carrier-events.ts
@src/lib/domain/types.ts
@src/lib/domain/crm-mutation-idempotency.ts
@src/lib/domain/__tests__/conversations.test.ts

<interfaces>
From src/lib/domain/carrier-events.ts (existing, lines 1-145 — DO NOT MODIFY):
- Imports: createAdminClient, DomainContext, DomainResult
- Exports: insertCarrierEvent, getLastCarrierEvent, getCarrierEventsByOrder, InsertCarrierEventParams, CarrierEvent

From src/lib/domain/types.ts:15-27:
- DomainContext { workspaceId, source, cascadeDepth?, actorId?, actorLabel?, triggerEvent? }
- DomainResult<T> { success: boolean; data?: T; error?: string }

From src/lib/domain/crm-mutation-idempotency.ts:90-122 (analog upsert pattern):
- supabase.from(table).upsert(row, { onConflict: 'col1,col2', ignoreDuplicates: true }).select('id')
- ignoreDuplicates=true → on conflict returns data=[], no error; on insert returns data=[{id}]

From Plan 01 migration (LOCKED — DO NOT alter the contract):
- Generated STORED column: `codigo_estado_idem TEXT GENERATED ALWAYS AS (COALESCE(codigo_estado, '')) STORED`
- UNIQUE INDEX column list: `(workspace_id, tracking_number, fecha, hora, codigo, codigo_estado_idem) WHERE carrier = 'coordinadora'`
- This onConflict MUST reference the generated column name `codigo_estado_idem` (NOT `codigo_estado`).
- Insert payload MUST NOT explicitly set `codigo_estado_idem` — Postgres derives it.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write carrier-events-coordinadora.test.ts (TDD — tests first)</name>
  <files>src/lib/domain/__tests__/carrier-events-coordinadora.test.ts</files>
  <read_first>
    - src/lib/domain/__tests__/conversations.test.ts:12-56 (supabase mock chain pattern — verbatim mirror)
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Pattern 4 lines 599-696 (recordCoordinadoraEvent canonical)
    - .planning/standalone/coordinadora-api-integration/PATTERNS.md lines 330-402 (extension pattern + deviations)
    - .planning/standalone/coordinadora-api-integration/01-PLAN.md §3 ALTER TABLE generated column + §5 UNIQUE INDEX column list (codigo_estado_idem contract)
    - src/lib/domain/crm-mutation-idempotency.ts:90-122 (upsert ignoreDuplicates analog)
  </read_first>
  <behavior>
    - Test 1: happy path — order found, INSERT succeeds → returns {success:true, data:{id, inserted:true}}
    - Test 2: order not found (tracking_number no match) — INSERT proceeds with order_id=null → returns {success:true, data:{id, inserted:true}}
    - Test 3: duplicate INSERT — upsert returns empty array → returns {success:true, data:{id, inserted:false}}
    - Test 4: supabase error on INSERT → returns {success:false, error}
    - Test 5: carrier='coordinadora' literal always set (so partial INDEX matches)
    - Test 6: source from ctx propagated to row
    - Test 7: all PDF payload fields flow to insertRow (codigo_estado, codigo_novedad, nit_cliente, etc.) AND insert payload does NOT include codigo_estado_idem (Postgres generates it)
    - Test 8: upsert call uses onConflict 'workspace_id,tracking_number,fecha,hora,codigo,codigo_estado_idem' + ignoreDuplicates:true (locked per Plan 01 generated column)
  </behavior>
  <action>
    Create `src/lib/domain/__tests__/carrier-events-coordinadora.test.ts`:

    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest'

    // Supabase admin mock — chained API style (mirrors conversations.test.ts:12-34)
    const ordersSingleMock = vi.fn()
    const upsertSelectMock = vi.fn()
    const duplicateLookupSingleMock = vi.fn()
    const duplicateLookupChainMock = vi.fn(() => ({ eq: duplicateLookupChainMock, maybeSingle: duplicateLookupSingleMock }))
    const upsertMock = vi.fn(() => ({ select: upsertSelectMock }))
    const ordersChainMock = vi.fn(() => ({ eq: ordersChainMock, maybeSingle: ordersSingleMock }))
    const ordersSelectMock = vi.fn(() => ({ eq: ordersChainMock }))
    const duplicateLookupSelectMock = vi.fn(() => ({ eq: duplicateLookupChainMock }))

    const fromMock = vi.fn((table: string) => {
      if (table === 'orders') return { select: ordersSelectMock }
      if (fromMock.mock.calls.filter(c => c[0] === 'order_carrier_events').length === 1) {
        return { upsert: upsertMock }
      }
      return { select: duplicateLookupSelectMock }
    })
    const createAdminClientMock = vi.fn(() => ({ from: fromMock }))

    vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => createAdminClientMock() }))

    import { recordCoordinadoraEvent } from '@/lib/domain/carrier-events'
    import type { DomainContext } from '@/lib/domain/types'

    const ctx: DomainContext = {
      workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490',
      source: 'webhook:coordinadora',
    }

    const baseParams = {
      env: 'test' as const,
      trackingNumber: '12345678901',
      fecha: '2026-05-26',
      hora: '13:51:43.456818',
      codigo: '6',
      codigoEstado: null,
      codigoNovedad: null,
      descEstado: null,
      comment: 'ENTREGADA',
      referencia: 'AA1',
      nitCliente: null,
      divCliente: null,
      vinculoGuia: null,
      rawPayload: { tracking_number: '12345678901', codigo: '6' },
    }

    beforeEach(() => {
      vi.clearAllMocks()
      ordersChainMock.mockImplementation(() => ({ eq: ordersChainMock, maybeSingle: ordersSingleMock }))
      ordersSelectMock.mockImplementation(() => ({ eq: ordersChainMock }))
      duplicateLookupChainMock.mockImplementation(() => ({ eq: duplicateLookupChainMock, maybeSingle: duplicateLookupSingleMock }))
      duplicateLookupSelectMock.mockImplementation(() => ({ eq: duplicateLookupChainMock }))
      upsertMock.mockImplementation(() => ({ select: upsertSelectMock }))
    })

    describe('recordCoordinadoraEvent (D-07 + D-22 + D-23)', () => {
      it('happy path: order found + new insert → returns inserted:true with id', async () => {
        ordersSingleMock.mockResolvedValueOnce({ data: { id: 'order-uuid-1' }, error: null })
        upsertSelectMock.mockResolvedValueOnce({ data: [{ id: 'event-uuid-1' }], error: null })

        const result = await recordCoordinadoraEvent(ctx, baseParams)
        expect(result.success).toBe(true)
        expect(result.data).toEqual({ id: 'event-uuid-1', inserted: true })
      })

      it('order not found → INSERT proceeds with order_id=null (D-22)', async () => {
        ordersSingleMock.mockResolvedValueOnce({ data: null, error: null })
        upsertSelectMock.mockResolvedValueOnce({ data: [{ id: 'event-uuid-2' }], error: null })

        const result = await recordCoordinadoraEvent(ctx, baseParams)
        expect(result.success).toBe(true)
        expect(result.data?.inserted).toBe(true)
        const row = upsertMock.mock.calls[0]?.[0] as Record<string, unknown>
        expect(row.order_id).toBeNull()
      })

      it('duplicate webhook (composite key conflict) → returns inserted:false with id from defensive SELECT', async () => {
        ordersSingleMock.mockResolvedValueOnce({ data: { id: 'order-uuid-3' }, error: null })
        upsertSelectMock.mockResolvedValueOnce({ data: [], error: null })
        duplicateLookupSingleMock.mockResolvedValueOnce({ data: { id: 'existing-event-uuid' }, error: null })

        const result = await recordCoordinadoraEvent(ctx, baseParams)
        expect(result.success).toBe(true)
        expect(result.data).toEqual({ id: 'existing-event-uuid', inserted: false })
      })

      it('supabase upsert error → returns success:false with error', async () => {
        ordersSingleMock.mockResolvedValueOnce({ data: { id: 'order-uuid' }, error: null })
        upsertSelectMock.mockResolvedValueOnce({ data: null, error: { message: 'unique violation', code: '23505' } })

        const result = await recordCoordinadoraEvent(ctx, baseParams)
        expect(result.success).toBe(false)
        expect(result.error).toContain('unique violation')
      })

      it('always sets carrier=coordinadora literal', async () => {
        ordersSingleMock.mockResolvedValueOnce({ data: null, error: null })
        upsertSelectMock.mockResolvedValueOnce({ data: [{ id: 'event-uuid' }], error: null })

        await recordCoordinadoraEvent(ctx, baseParams)
        const row = upsertMock.mock.calls[0]?.[0] as Record<string, unknown>
        expect(row.carrier).toBe('coordinadora')
      })

      it('propagates ctx.source and ctx.workspaceId to the row', async () => {
        ordersSingleMock.mockResolvedValueOnce({ data: null, error: null })
        upsertSelectMock.mockResolvedValueOnce({ data: [{ id: 'event-uuid' }], error: null })

        await recordCoordinadoraEvent(ctx, baseParams)
        const row = upsertMock.mock.calls[0]?.[0] as Record<string, unknown>
        expect(row.workspace_id).toBe('a3843b3f-c337-4836-92b5-89c58bb98490')
        expect(row.source).toBe('webhook:coordinadora')
      })

      it('includes all PDF payload fields in the row AND does NOT set codigo_estado_idem explicitly (generated column)', async () => {
        ordersSingleMock.mockResolvedValueOnce({ data: null, error: null })
        upsertSelectMock.mockResolvedValueOnce({ data: [{ id: 'event-uuid' }], error: null })

        const withNovedad = {
          ...baseParams,
          codigo: '801',
          codigoEstado: '5',
          codigoNovedad: '801',
          descEstado: 'EN REPARTO',
          nitCliente: '902052328',
          divCliente: '01',
          vinculoGuia: '',
        }
        await recordCoordinadoraEvent(ctx, withNovedad)
        const row = upsertMock.mock.calls[0]?.[0] as Record<string, unknown>
        expect(row.codigo).toBe('801')
        expect(row.codigo_estado).toBe('5')
        expect(row.codigo_novedad).toBe('801')
        expect(row.nit_cliente).toBe('902052328')
        expect(row.div_cliente).toBe('01')
        expect(row.vinculo_guia).toBe('')
        expect(row.tracking_number).toBe('12345678901')
        expect(row.fecha).toBe('2026-05-26')
        expect(row.hora).toBe('13:51:43.456818')
        // Generated column MUST NOT be set explicitly — Postgres derives it from COALESCE(codigo_estado, '')
        expect(row).not.toHaveProperty('codigo_estado_idem')
      })

      it('upsert uses onConflict composite column-list with codigo_estado_idem (generated column) + ignoreDuplicates:true', async () => {
        ordersSingleMock.mockResolvedValueOnce({ data: null, error: null })
        upsertSelectMock.mockResolvedValueOnce({ data: [{ id: 'event-uuid' }], error: null })

        await recordCoordinadoraEvent(ctx, baseParams)
        const opts = upsertMock.mock.calls[0]?.[1] as { onConflict?: string; ignoreDuplicates?: boolean }
        expect(opts.ignoreDuplicates).toBe(true)
        // Locked per Plan 01 §3 (generated column codigo_estado_idem). DO NOT change to codigo_estado.
        expect(opts.onConflict).toBe('workspace_id,tracking_number,fecha,hora,codigo,codigo_estado_idem')
      })
    })
    ```

    Save the file. Tests will fail until Task 2.

    Commit message: `test(coordinadora-api): add recordCoordinadoraEvent test suite (RED)`
  </action>
  <verify>
    <automated>test -f src/lib/domain/__tests__/carrier-events-coordinadora.test.ts &amp;&amp; grep -c "  it(" src/lib/domain/__tests__/carrier-events-coordinadora.test.ts | awk '{ exit ($1 &gt;= 7 ? 0 : 1) }'</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/domain/__tests__/carrier-events-coordinadora.test.ts` exists
    - Contains 7+ `it(` test cases
    - Mocks `@/lib/supabase/admin` via `vi.mock`
    - Imports `recordCoordinadoraEvent` (function doesn't exist yet — Task 2 creates it)
    - Asserts `opts.onConflict` is the EXACT string `'workspace_id,tracking_number,fecha,hora,codigo,codigo_estado_idem'` (generated column locked per Plan 01)
    - Asserts insert payload does NOT have property `codigo_estado_idem`
    - File committed
  </acceptance_criteria>
  <done>Test scaffold for new domain function committed. Tests RED until Task 2.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Extend carrier-events.ts with recordCoordinadoraEvent (GREEN)</name>
  <files>src/lib/domain/carrier-events.ts</files>
  <read_first>
    - src/lib/domain/carrier-events.ts (existing — DO NOT modify lines 1-145; only APPEND)
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Pattern 4 lines 599-696 (canonical recordCoordinadoraEvent)
    - .planning/standalone/coordinadora-api-integration/PATTERNS.md lines 367-402 (deviations + ignoreDuplicates semantics)
    - .planning/standalone/coordinadora-api-integration/01-PLAN.md §3 (generated column definition) + §5 (UNIQUE INDEX column list with codigo_estado_idem)
    - src/lib/domain/crm-mutation-idempotency.ts:90-122 (upsert ignoreDuplicates analog)
    - src/lib/domain/__tests__/carrier-events-coordinadora.test.ts (Task 1 — assertions to satisfy, especially onConflict='...,codigo_estado_idem')
  </read_first>
  <behavior>
    - APPEND `RecordCoordinadoraEventParams` interface + `recordCoordinadoraEvent` function to existing file
    - DO NOT modify any existing exports
    - Use `.upsert({ onConflict: 'workspace_id,tracking_number,fecha,hora,codigo,codigo_estado_idem', ignoreDuplicates: true })` — generated column locked by Plan 01
    - Insert payload sets `codigo_estado` (and other source columns); MUST NOT set `codigo_estado_idem` (Postgres derives it from the generated expression)
    - Best-effort orders lookup by workspace_id + tracking_number (maybeSingle)
    - Defensive SELECT after conflict to return existing row id
  </behavior>
  <action>
    Edit `src/lib/domain/carrier-events.ts` — APPEND this block AFTER the existing `getCarrierEventsByOrder` function. DO NOT modify anything above:

    ```ts
    // ============================================================================
    // Coordinadora — extension (Standalone: coordinadora-api-integration)
    // D-07 idempotent upsert via composite UNIQUE INDEX (incl. codigo_estado_idem generated col)
    // D-22 order_id may be null (webhook arrives before order or unmatched tracking)
    // D-23 single domain entry point; route handler MUST call this, not supabase directly
    // ============================================================================

    export interface RecordCoordinadoraEventParams {
      env: 'test' | 'prod'
      trackingNumber: string
      fecha: string
      hora: string
      codigo: string
      codigoEstado: string | null
      codigoNovedad: string | null
      descEstado: string | null
      comment: string | null
      referencia: string | null
      nitCliente: string | null
      divCliente: string | null
      vinculoGuia: string | null
      rawPayload: unknown
    }

    /**
     * Insert a Coordinadora webhook event idempotently.
     *
     * Composite UNIQUE INDEX (created by migration 20260526000000_coordinadora_carrier_events_extension.sql):
     *   (workspace_id, tracking_number, fecha, hora, codigo, codigo_estado_idem)
     *   WHERE carrier = 'coordinadora'
     *
     * `codigo_estado_idem` is a STORED generated column = COALESCE(codigo_estado, '').
     * The insert payload below MUST NOT set it explicitly — Postgres derives it.
     * `onConflict` references the generated column name so PostgREST `ON CONFLICT (col_list)`
     * inference matches the index unambiguously (Pitfall 4 revision-locked workaround).
     *
     * Returns:
     *   - success:true, data:{id, inserted:true}  — new row, caller should dispatch Inngest downstream
     *   - success:true, data:{id, inserted:false} — duplicate webhook, caller ACKs 200 + skip dispatch
     *   - success:false, error:string             — persistence failure, caller returns 5xx (Pub/Sub retries)
     */
    export async function recordCoordinadoraEvent(
      ctx: DomainContext,
      params: RecordCoordinadoraEventParams,
    ): Promise<DomainResult<{ id: string; inserted: boolean }>> {
      const supabase = createAdminClient()

      // D-22: best-effort orders lookup by tracking_number.
      const { data: order } = await supabase
        .from('orders')
        .select('id')
        .eq('workspace_id', ctx.workspaceId)
        .eq('tracking_number', params.trackingNumber)
        .maybeSingle()

      // NOTE: do NOT add `codigo_estado_idem` to this object. It's a generated STORED column
      // (= COALESCE(codigo_estado, '')) — Postgres populates it automatically.
      const insertRow = {
        workspace_id: ctx.workspaceId,
        order_id: (order?.id as string | undefined) ?? null,
        guia: params.trackingNumber,
        carrier: 'coordinadora',
        estado: params.descEstado ?? params.comment ?? '',
        cod_estado: Number.parseInt(params.codigoEstado ?? params.codigo, 10) || 0,
        novedades: params.codigoNovedad
          ? [{ codigo: params.codigoNovedad, desc: params.descEstado }]
          : [],
        raw_response: params.rawPayload as never,
        tracking_number: params.trackingNumber,
        fecha: params.fecha,
        hora: params.hora,
        codigo: params.codigo,
        codigo_estado: params.codigoEstado,
        codigo_novedad: params.codigoNovedad,
        nit_cliente: params.nitCliente,
        div_cliente: params.divCliente,
        vinculo_guia: params.vinculoGuia,
        source: ctx.source,
        env: params.env,
      }

      const { data, error } = await supabase
        .from('order_carrier_events')
        .upsert(insertRow, {
          // Locked per Plan 01 §3 ALTER TABLE ... ADD COLUMN codigo_estado_idem.
          // The generated column makes this onConflict match the UNIQUE INDEX
          // unambiguously (vs. a COALESCE expression index which is NOT matchable
          // by plain-column-list ON CONFLICT — Pitfall 4 revision-locked).
          onConflict: 'workspace_id,tracking_number,fecha,hora,codigo,codigo_estado_idem',
          ignoreDuplicates: true,
        })
        .select('id')

      if (error) {
        return { success: false, error: `recordCoordinadoraEvent: ${error.message}` }
      }

      const inserted = Array.isArray(data) && data.length > 0
      if (!inserted) {
        // Defensive SELECT to return the existing row id.
        const { data: existing } = await supabase
          .from('order_carrier_events')
          .select('id')
          .eq('workspace_id', ctx.workspaceId)
          .eq('tracking_number', params.trackingNumber)
          .eq('fecha', params.fecha)
          .eq('hora', params.hora)
          .eq('codigo', params.codigo)
          .maybeSingle()
        return { success: true, data: { id: (existing?.id as string | undefined) ?? '', inserted: false } }
      }
      return { success: true, data: { id: data[0].id as string, inserted: true } }
    }
    ```

    Idempotency mechanism locked via generated column — see Plan 01 §3 (ALTER TABLE ADD COLUMN codigo_estado_idem ... GENERATED ALWAYS AS (COALESCE(codigo_estado, '')) STORED) + §5 (UNIQUE INDEX column list referencing codigo_estado_idem). The onConflict string here MUST match the index column list verbatim. No smoke-time pivot needed.

    Run `npx vitest run src/lib/domain/__tests__/carrier-events-coordinadora.test.ts` — expect 8/8 tests green.

    Verify Regla 3:
    - `grep -c "createAdminClient" src/lib/domain/carrier-events.ts` should be exactly 4 (one per function: insertCarrierEvent, getLastCarrierEvent, getCarrierEventsByOrder, recordCoordinadoraEvent)
    - `grep -rc "createAdminClient" src/lib/carriers/coordinadora/ | grep -v ":0"` should return 0 lines

    Commit message: `feat(coordinadora-api): extend carrier-events with recordCoordinadoraEvent (GREEN)`
  </action>
  <verify>
    <automated>npx vitest run src/lib/domain/__tests__/carrier-events-coordinadora.test.ts 2&gt;&amp;1 | tail -8 | grep -E "Test Files\s+1 passed"</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/domain/carrier-events.ts` now exports `recordCoordinadoraEvent` AND `RecordCoordinadoraEventParams`
    - Existing exports `insertCarrierEvent`, `getLastCarrierEvent`, `getCarrierEventsByOrder` STILL exist (unmodified)
    - File contains line `onConflict: 'workspace_id,tracking_number,fecha,hora,codigo,codigo_estado_idem'` exactly once
    - File does NOT contain `onConflict: 'workspace_id,tracking_number,fecha,hora,codigo,codigo_estado'` (without `_idem` — anti-regression)
    - File does NOT contain `codigo_estado_idem:` as a property assignment in the insertRow object (Postgres derives it)
    - File contains line `ignoreDuplicates: true,` (inside the upsert opts)
    - File contains `carrier: 'coordinadora',` literal (so partial INDEX matches)
    - All 8+ test cases pass
    - `grep -rc "createAdminClient" src/lib/carriers/coordinadora/` returns 0 (Regla 3 enforced)
    - Zero `any` types added (grep new lines for `: any\b`)
  </acceptance_criteria>
  <done>Domain layer extended with recordCoordinadoraEvent. Idempotency mechanism locked via generated column (see Plan 01). Plan 08 (route handler) can now call it.</done>
</task>

</tasks>

<verification>
- Vitest suite for `carrier-events-coordinadora.test.ts` passes 8/8
- Existing `insertCarrierEvent`/`getLastCarrierEvent`/`getCarrierEventsByOrder` UNTOUCHED (visual diff review)
- Regla 3 grep clean (no createAdminClient outside domain)
- onConflict string references `codigo_estado_idem` (generated column from Plan 01) — not `codigo_estado`
</verification>

<success_criteria>
1. Test file + extended carrier-events.ts committed (2 commits)
2. 8+ tests pass for recordCoordinadoraEvent
3. Existing Envia path completely untouched
4. D-07, D-22, D-23 satisfied via composite onConflict (over generated column codigo_estado_idem) + null order_id + single domain entry
5. Idempotency mechanism locked at schema level — no smoke-time pivot required
</success_criteria>

<output>
After completion, create `.planning/standalone/coordinadora-api-integration/06-SUMMARY.md` documenting:
- Diff summary (what was appended to carrier-events.ts; LOC count of additions)
- Vitest output (test count)
- Commit SHAs (2)
- Confirmation: `grep -rc createAdminClient src/lib/carriers/coordinadora/` returns 0
- Confirmation: onConflict string is `'workspace_id,tracking_number,fecha,hora,codigo,codigo_estado_idem'` (matches Plan 01 generated column)
</output>

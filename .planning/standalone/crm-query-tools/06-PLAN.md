---
plan: 06
wave: 5
phase: standalone-crm-query-tools
depends_on: [01, 02, 04, 05]
files_modified:
  - src/__tests__/integration/crm-query-tools/cross-workspace.test.ts
  - src/__tests__/integration/crm-query-tools/config-driven.test.ts
  - src/__tests__/integration/crm-query-tools/duplicates.test.ts
  - src/app/api/test/crm-query-tools/runner/route.ts
  - e2e/fixtures/seed.ts
  - e2e/crm-query-tools.spec.ts
autonomous: true
requirements:
  - D-05  # Workspace isolation enforced
  - D-08  # Duplicate-phone resolution
  - D-13  # Stage CASCADE on deletion
  - D-24  # Unit + Integration + Playwright E2E coverage
---

<objective>
Add the "live DB" test layer. Three Vitest integration tests (env-gated by `TEST_WORKSPACE_ID` etc., same pattern as `crm-bots/reader.test.ts`) that exercise the tools against real Supabase to verify cross-workspace isolation, FK CASCADE behavior on stage deletion, and duplicate-phone resolution. Then the Playwright E2E test that drives `/agentes/crm-tools` UI, saves config, and invokes a tool through a NODE_ENV-gated test runner endpoint to verify UI ↔ DB ↔ tool wiring end-to-end. Plan 01's seed.ts skeleton is filled in here.
</objective>

<context>
@./CLAUDE.md
@.planning/standalone/crm-query-tools/CONTEXT.md
@.planning/standalone/crm-query-tools/RESEARCH.md
@.planning/standalone/crm-query-tools/PATTERNS.md
@src/__tests__/integration/crm-bots/reader.test.ts
@src/lib/agents/shared/crm-query-tools/index.ts
@src/lib/domain/crm-query-tools-config.ts
@src/lib/domain/contacts.ts
@src/lib/domain/orders.ts
@src/lib/domain/pipelines.ts
@e2e/fixtures/auth.ts
@e2e/fixtures/seed.ts
@playwright.config.ts

<interfaces>
<!-- Test runner API contract used by Playwright E2E. -->

```typescript
// src/app/api/test/crm-query-tools/runner/route.ts (NEW this plan)
// POST /api/test/crm-query-tools/runner
// Headers: x-test-secret: <PLAYWRIGHT_TEST_SECRET>
// Body: { tool: string, input: Record<string, unknown> }
// Response: 200 + JSON tool result, OR 403/404/400/500 with error.
//
// Gates (V13 ASVS):
//   - NODE_ENV !== 'production'  → return 404
//   - x-test-secret missing or wrong → return 403
//   - workspaceId from TEST_WORKSPACE_ID env (NOT body)
//   - Tool name must be in the allowed set
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 6.1: Create the test-runner API endpoint (env-gated)</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 21 — runner/route.ts template, lines ~1014-1060; Open Pattern Question 2 — verify AI SDK v6 tool().execute pattern)
    - .planning/standalone/crm-query-tools/RESEARCH.md (Section "Security Domain" V13 — env+secret gating)
    - src/lib/agents/shared/crm-query-tools/index.ts (Plan 03/04 — createCrmQueryTools shape)
    - One existing route handler in `src/app/api/v1/**/route.ts` (look at any) to confirm Next 16 route handler signature (e.g., `export async function POST(req: NextRequest)`).
    - node_modules/ai/dist/index.d.ts (verify `tool({...})` returns an object with `execute` callable directly — find via `grep -A3 "export.*function tool" node_modules/ai/dist/index.d.ts | head -20`)
  </read_first>
  <action>
    1. Verify AI SDK v6 `tool().execute` is callable directly. Run:
       ```
       grep -A20 "export.*function tool\|interface ToolDefinition\|type Tool " node_modules/ai/dist/*.d.ts 2>/dev/null | head -40
       ```
       The expectation per RESEARCH Open Q2 is that `tool({...})` returns `{ execute: (input) => Promise<unknown>, ... }` callable directly. If verification reveals the API requires `inputSchema` parsing first, adjust the route to call `await zodSchema.parseAsync(body.input)` before passing to execute. Otherwise proceed.

    2. Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/test/crm-query-tools/runner/route.ts` with EXACT contents:

    ```typescript
    /**
     * Test-only endpoint to invoke crm-query-tools from Playwright E2E.
     *
     * Standalone crm-query-tools Wave 5 (Plan 06).
     *
     * Security gates (V13 ASVS):
     *   1. NODE_ENV !== 'production' (returns 404 in prod).
     *   2. x-test-secret header MUST match process.env.PLAYWRIGHT_TEST_SECRET.
     *   3. workspaceId is read from process.env.TEST_WORKSPACE_ID — NEVER from body.
     *   4. Only the 5 documented tools are exposed; any other name returns 400.
     *
     * Documented in INTEGRATION-HANDOFF.md (Plan 07): how to set
     * PLAYWRIGHT_TEST_SECRET + TEST_WORKSPACE_ID in dev / preview env.
     */

    import { NextRequest, NextResponse } from 'next/server'
    import { createCrmQueryTools } from '@/lib/agents/shared/crm-query-tools'

    const ALLOWED_TOOLS = new Set([
      'getContactByPhone',
      'getLastOrderByPhone',
      'getOrdersByPhone',
      'getActiveOrderByPhone',
      'getOrderById',
    ])

    export async function POST(req: NextRequest) {
      // Gate 1: NODE_ENV
      if (process.env.NODE_ENV === 'production') {
        return new NextResponse('Not found', { status: 404 })
      }

      // Gate 2: header secret
      const expected = process.env.PLAYWRIGHT_TEST_SECRET
      if (!expected) {
        return NextResponse.json(
          { error: 'PLAYWRIGHT_TEST_SECRET not configured on server' },
          { status: 500 },
        )
      }
      const got = req.headers.get('x-test-secret')
      if (!got || got !== expected) {
        return new NextResponse('Forbidden', { status: 403 })
      }

      // Gate 3: workspace from env, NOT body
      const workspaceId = process.env.TEST_WORKSPACE_ID
      if (!workspaceId) {
        return NextResponse.json(
          { error: 'TEST_WORKSPACE_ID not configured' },
          { status: 500 },
        )
      }

      let body: { tool?: string; input?: Record<string, unknown> }
      try {
        body = (await req.json()) as { tool?: string; input?: Record<string, unknown> }
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
      }

      if (!body.tool || !ALLOWED_TOOLS.has(body.tool)) {
        return NextResponse.json(
          { error: `Unknown tool: ${body.tool ?? '(missing)'}. Allowed: ${[...ALLOWED_TOOLS].join(', ')}` },
          { status: 400 },
        )
      }

      const tools = createCrmQueryTools({ workspaceId, invoker: 'playwright-e2e' })
      const tool = tools[body.tool as keyof typeof tools]
      if (!tool) {
        return NextResponse.json({ error: `Tool not registered: ${body.tool}` }, { status: 500 })
      }

      try {
        // AI SDK v6 tool object exposes execute(input) directly.
        const result = await (tool as { execute: (input: unknown) => Promise<unknown> }).execute(body.input ?? {})
        return NextResponse.json(result)
      } catch (err) {
        return NextResponse.json(
          {
            status: 'error',
            error: { code: 'runner_threw', message: err instanceof Error ? err.message : String(err) },
          },
          { status: 500 },
        )
      }
    }
    ```

    3. Verify no production ship hazard: confirm the route has no other HTTP method (only POST), and `NODE_ENV` gate is the FIRST check (before any other logic). Read the file back.
  </action>
  <verify>
    <automated>test -f "src/app/api/test/crm-query-tools/runner/route.ts" && grep -q "process.env.NODE_ENV === 'production'" "src/app/api/test/crm-query-tools/runner/route.ts" && grep -q "PLAYWRIGHT_TEST_SECRET" "src/app/api/test/crm-query-tools/runner/route.ts" && grep -q "TEST_WORKSPACE_ID" "src/app/api/test/crm-query-tools/runner/route.ts" && ! grep "workspaceId.*body" "src/app/api/test/crm-query-tools/runner/route.ts" && npx tsc --noEmit -p . 2>&1 | grep -E "runner/route" | head -3</automated>
  </verify>
  <acceptance_criteria>
    - Route file exists.
    - First branch in `POST` body checks `NODE_ENV === 'production'` and returns 404.
    - `grep "x-test-secret" {file}` returns 1.
    - `grep "TEST_WORKSPACE_ID" {file}` returns ≥1.
    - `grep "ALLOWED_TOOLS" {file}` returns ≥2 (declared + checked).
    - `grep "body\\.workspaceId\\|body\\['workspaceId'\\]" {file}` returns 0 (workspace NEVER comes from body).
    - `npx tsc --noEmit -p .` returns zero errors.
  </acceptance_criteria>
  <done>Test runner endpoint live in dev/preview, hard-blocked in production.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 6.2: Integration test — cross-workspace isolation (D-05)</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 11 — cross-workspace.test.ts, lines ~599-637)
    - src/__tests__/integration/crm-bots/reader.test.ts (full file — env-gated TEST_WORKSPACE_ID + admin client pattern)
    - src/lib/agents/shared/crm-query-tools/index.ts (createCrmQueryTools)
    - vitest.config.ts (confirm `src/__tests__/**` is included)
  </read_first>
  <behavior>
    Test (skipped automatically if env not set):
    - `beforeAll`: assert env `TEST_WORKSPACE_ID` and `TEST_WORKSPACE_ID_2` set; assert `SUPABASE_SERVICE_ROLE_KEY` set.
    - `beforeAll`: seed contact `+573009999111` in workspace A AND in workspace B (admin client direct insert with `workspace_id` per row).
    - Test 1: invoke `getContactByPhone` via `createCrmQueryTools({ workspaceId: WS_A })` → assert returned `data.id` matches the WS_A contact, NOT WS_B's.
    - Test 2: invoke `getContactByPhone` via `createCrmQueryTools({ workspaceId: WS_B })` → assert returned `data.id` matches the WS_B contact.
    - `afterAll`: cleanup both contacts.
  </behavior>
  <action>
    Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/__tests__/integration/crm-query-tools/cross-workspace.test.ts` with EXACT contents:

    ```typescript
    /**
     * Integration — cross-workspace isolation for crm-query-tools.
     *
     * Standalone crm-query-tools Wave 5 (Plan 06).
     *
     * Pattern: env-gated, real Supabase admin client.
     *   Required env: TEST_WORKSPACE_ID, TEST_WORKSPACE_ID_2,
     *                 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
     *
     * Verifies Pitfall 1 mitigation: same phone in two workspaces resolves
     * to the workspace's own contact, never the other.
     */

    import { describe, it, expect, beforeAll, afterAll } from 'vitest'
    import { createClient, type SupabaseClient } from '@supabase/supabase-js'
    import { createCrmQueryTools } from '@/lib/agents/shared/crm-query-tools'

    const WS_A = process.env.TEST_WORKSPACE_ID ?? ''
    const WS_B = process.env.TEST_WORKSPACE_ID_2 ?? ''
    const SHARED_PHONE = '+573009999111'

    const skip = !WS_A || !WS_B || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL

    function admin(): SupabaseClient {
      return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
    }

    let contactIdA = ''
    let contactIdB = ''

    describe.skipIf(skip)('crm-query-tools cross-workspace isolation (D-05)', () => {
      beforeAll(async () => {
        const supabase = admin()
        const insA = await supabase
          .from('contacts')
          .insert({ workspace_id: WS_A, name: 'X-Test Contact A', phone: SHARED_PHONE })
          .select('id')
          .single()
        if (insA.error) throw new Error(`seed A failed: ${insA.error.message}`)
        contactIdA = insA.data!.id

        const insB = await supabase
          .from('contacts')
          .insert({ workspace_id: WS_B, name: 'X-Test Contact B', phone: SHARED_PHONE })
          .select('id')
          .single()
        if (insB.error) throw new Error(`seed B failed: ${insB.error.message}`)
        contactIdB = insB.data!.id
      })

      afterAll(async () => {
        const supabase = admin()
        if (contactIdA) await supabase.from('contacts').delete().eq('id', contactIdA)
        if (contactIdB) await supabase.from('contacts').delete().eq('id', contactIdB)
      })

      it('workspace A query returns contact A only', async () => {
        const tools = createCrmQueryTools({ workspaceId: WS_A, invoker: 'integration-test' })
        const result = await (tools.getContactByPhone as { execute: (i: unknown) => Promise<unknown> }).execute({ phone: SHARED_PHONE }) as { status: string; data?: { id: string } }
        expect(result.status).toBe('found')
        expect(result.data?.id).toBe(contactIdA)
        expect(result.data?.id).not.toBe(contactIdB)
      })

      it('workspace B query returns contact B only', async () => {
        const tools = createCrmQueryTools({ workspaceId: WS_B, invoker: 'integration-test' })
        const result = await (tools.getContactByPhone as { execute: (i: unknown) => Promise<unknown> }).execute({ phone: SHARED_PHONE }) as { status: string; data?: { id: string } }
        expect(result.status).toBe('found')
        expect(result.data?.id).toBe(contactIdB)
        expect(result.data?.id).not.toBe(contactIdA)
      })
    })
    ```

    NOTE: Run only when env vars set. Without env, suite is skipped (CI-safe).
  </action>
  <verify>
    <automated>test -f src/__tests__/integration/crm-query-tools/cross-workspace.test.ts && grep -q "describe.skipIf" src/__tests__/integration/crm-query-tools/cross-workspace.test.ts && grep -q "TEST_WORKSPACE_ID_2" src/__tests__/integration/crm-query-tools/cross-workspace.test.ts && npm run test -- --run src/__tests__/integration/crm-query-tools/cross-workspace.test.ts 2>&1 | tail -5</automated>
  </verify>
  <acceptance_criteria>
    - File exists.
    - `grep -c "describe.skipIf" {file}` returns 1 (env-gated).
    - `grep -c "TEST_WORKSPACE_ID_2" {file}` returns ≥1.
    - `grep -c "afterAll" {file}` returns 1 (cleanup).
    - `npm run test -- --run src/__tests__/integration/crm-query-tools/cross-workspace.test.ts` exits 0 (either skipped or passing — no failures).
  </acceptance_criteria>
  <done>Cross-workspace integration test ready.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 6.3: Integration test — config-driven + FK CASCADE (D-13)</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 12 — config-driven.test.ts, lines ~641-654)
    - src/__tests__/integration/crm-query-tools/cross-workspace.test.ts (just-created — pattern for env gating + admin client)
    - src/lib/domain/crm-query-tools-config.ts (Plan 02 — getCrmQueryToolsConfig signature)
  </read_first>
  <behavior>
    Test (env-gated):
    - `beforeAll`: seed pipeline + 3 stages (S1, S2, S3) in `TEST_WORKSPACE_ID`. Insert config row with `pipeline_id`. Insert junction rows for S1 + S2.
    - Test 1 — read fresh: `getCrmQueryToolsConfig({ workspaceId: WS, source: 'tool-handler' })` → `activeStageIds.length === 2`, both UUIDs present.
    - Test 2 — FK CASCADE: delete stage S1 from `pipeline_stages` (admin client) → re-read config → `activeStageIds.length === 1` (only S2 remains; S1's junction row auto-deleted by FK CASCADE per D-13).
    - Test 3 — pipeline FK SET NULL: delete the pipeline (admin client) → re-read config → `pipelineId === null` (config row preserved, just `pipeline_id` cleared per D-16 default).
    - `afterAll`: delete remaining seeded data (contacts/orders not used here, just the pipeline + stages + config row + junction rows).
  </behavior>
  <action>
    Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/__tests__/integration/crm-query-tools/config-driven.test.ts` with EXACT contents:

    ```typescript
    /**
     * Integration — config-driven active stages + FK behavior.
     *
     * Standalone crm-query-tools Wave 5 (Plan 06).
     * Verifies D-11/D-12/D-13/D-16 + Pitfall 2 mitigation.
     */

    import { describe, it, expect, beforeAll, afterAll } from 'vitest'
    import { createClient, type SupabaseClient } from '@supabase/supabase-js'
    import { getCrmQueryToolsConfig } from '@/lib/domain/crm-query-tools-config'

    const WS = process.env.TEST_WORKSPACE_ID ?? ''
    const skip = !WS || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL

    function admin(): SupabaseClient {
      return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
    }

    let pipelineId = ''
    let s1 = ''
    let s2 = ''
    let s3 = ''

    describe.skipIf(skip)('crm-query-tools config-driven + FK CASCADE (D-13)', () => {
      beforeAll(async () => {
        const supabase = admin()

        const pipeIns = await supabase
          .from('pipelines')
          .insert({ workspace_id: WS, name: 'X-Test Pipeline crm-query-tools' })
          .select('id')
          .single()
        if (pipeIns.error) throw new Error(`pipeline seed failed: ${pipeIns.error.message}`)
        pipelineId = pipeIns.data!.id

        const stagesIns = await supabase
          .from('pipeline_stages')
          .insert([
            { pipeline_id: pipelineId, name: 'S1-Test', position: 1 },
            { pipeline_id: pipelineId, name: 'S2-Test', position: 2 },
            { pipeline_id: pipelineId, name: 'S3-Test', position: 3 },
          ])
          .select('id, name')
        if (stagesIns.error) throw new Error(`stages seed failed: ${stagesIns.error.message}`)

        const sMap = new Map(stagesIns.data!.map((s: { id: string; name: string }) => [s.name, s.id]))
        s1 = sMap.get('S1-Test')!
        s2 = sMap.get('S2-Test')!
        s3 = sMap.get('S3-Test')!

        // Upsert config row + junction
        await supabase
          .from('crm_query_tools_config')
          .upsert({ workspace_id: WS, pipeline_id: pipelineId }, { onConflict: 'workspace_id' })

        // Clean any pre-existing junction for this WS to keep test deterministic
        await supabase.from('crm_query_tools_active_stages').delete().eq('workspace_id', WS)

        await supabase
          .from('crm_query_tools_active_stages')
          .insert([
            { workspace_id: WS, stage_id: s1 },
            { workspace_id: WS, stage_id: s2 },
          ])
      })

      afterAll(async () => {
        const supabase = admin()
        // CASCADE may have removed junction rows — best-effort cleanup
        await supabase.from('crm_query_tools_active_stages').delete().eq('workspace_id', WS)
        if (pipelineId) {
          // Stages are CASCADE-deleted with pipeline (orders.ts FK)
          await supabase.from('pipelines').delete().eq('id', pipelineId)
        }
        // Reset config back to whatever it was — just clear the test pipeline_id
        await supabase
          .from('crm_query_tools_config')
          .update({ pipeline_id: null })
          .eq('workspace_id', WS)
      })

      it('reads config with 2 active stages', async () => {
        const cfg = await getCrmQueryToolsConfig({ workspaceId: WS, source: 'tool-handler' })
        expect(cfg.pipelineId).toBe(pipelineId)
        expect(cfg.activeStageIds.length).toBeGreaterThanOrEqual(2)
        expect(cfg.activeStageIds).toContain(s1)
        expect(cfg.activeStageIds).toContain(s2)
      })

      it('D-13: deleting a stage removes it from active list via FK CASCADE', async () => {
        const supabase = admin()
        const del = await supabase.from('pipeline_stages').delete().eq('id', s1)
        expect(del.error).toBeNull()

        const cfg = await getCrmQueryToolsConfig({ workspaceId: WS, source: 'tool-handler' })
        expect(cfg.activeStageIds).not.toContain(s1)
        // S2 is still there
        expect(cfg.activeStageIds).toContain(s2)
      })

      it('D-16: deleting the pipeline SETs pipeline_id NULL', async () => {
        const supabase = admin()
        const del = await supabase.from('pipelines').delete().eq('id', pipelineId)
        expect(del.error).toBeNull()

        const cfg = await getCrmQueryToolsConfig({ workspaceId: WS, source: 'tool-handler' })
        expect(cfg.pipelineId).toBeNull()
      })
    })
    ```
  </action>
  <verify>
    <automated>test -f src/__tests__/integration/crm-query-tools/config-driven.test.ts && grep -q "FK CASCADE" src/__tests__/integration/crm-query-tools/config-driven.test.ts && npm run test -- --run src/__tests__/integration/crm-query-tools/config-driven.test.ts 2>&1 | tail -5</automated>
  </verify>
  <acceptance_criteria>
    - File exists with `describe.skipIf`.
    - `grep -c "deleting a stage" {file}` returns ≥1 (D-13 explicit).
    - `grep -c "deleting the pipeline" {file}` returns ≥1 (D-16 SET NULL).
    - `npm run test -- --run src/__tests__/integration/crm-query-tools/config-driven.test.ts` exits 0.
  </acceptance_criteria>
  <done>Config + FK CASCADE integration test ready.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 6.4: Integration test — duplicates resolution (D-08)</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 13 — duplicates.test.ts, lines ~657-668)
    - src/__tests__/integration/crm-query-tools/cross-workspace.test.ts (just-created — pattern for env gating)
  </read_first>
  <behavior>
    Test (env-gated):
    - `beforeAll`: seed 3 contacts in `TEST_WORKSPACE_ID` with phone `+573009999222` and different `created_at` values (T1 < T2 < T3) by using explicit insert + setting `created_at` via the admin insert (Supabase allows passing `created_at` in insert).
    - Test: invoke `getContactByPhone` → `data.id === T3.id`, `duplicates_count === 2`, `duplicates` array contains T1 and T2 (any order).
    - `afterAll`: delete all 3 seeded contacts.
  </behavior>
  <action>
    Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/__tests__/integration/crm-query-tools/duplicates.test.ts` with EXACT contents:

    ```typescript
    /**
     * Integration — D-08 duplicates resolution.
     *
     * Standalone crm-query-tools Wave 5 (Plan 06).
     * Verifies: 2+ contacts same phone in same workspace → newest first
     * + duplicates_count + duplicates list.
     */

    import { describe, it, expect, beforeAll, afterAll } from 'vitest'
    import { createClient, type SupabaseClient } from '@supabase/supabase-js'
    import { createCrmQueryTools } from '@/lib/agents/shared/crm-query-tools'

    const WS = process.env.TEST_WORKSPACE_ID ?? ''
    const PHONE = '+573009999222'
    const skip = !WS || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL

    function admin(): SupabaseClient {
      return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
    }

    const ids: string[] = []

    describe.skipIf(skip)('crm-query-tools duplicates resolution (D-08)', () => {
      beforeAll(async () => {
        const supabase = admin()
        // Insert 3 contacts with explicit created_at so newest is unambiguous
        const rows = [
          { workspace_id: WS, name: 'X-Dup-T1', phone: PHONE, created_at: '2026-01-01T00:00:00.000Z' },
          { workspace_id: WS, name: 'X-Dup-T2', phone: PHONE, created_at: '2026-02-01T00:00:00.000Z' },
          { workspace_id: WS, name: 'X-Dup-T3', phone: PHONE, created_at: '2026-04-01T00:00:00.000Z' },
        ]
        const ins = await supabase.from('contacts').insert(rows).select('id, name')
        if (ins.error) throw new Error(`seed dups failed: ${ins.error.message}`)
        for (const r of ins.data!) ids.push(r.id)
      })

      afterAll(async () => {
        const supabase = admin()
        if (ids.length) await supabase.from('contacts').delete().in('id', ids)
      })

      it('returns the newest contact + duplicates_count: 2', async () => {
        const supabase = admin()
        const verify = await supabase
          .from('contacts')
          .select('id, name, created_at')
          .in('id', ids)
          .order('created_at', { ascending: false })
        if (verify.error) throw new Error(`verify failed: ${verify.error.message}`)
        const newestId = verify.data![0].id
        const olderIds = verify.data!.slice(1).map((r) => r.id)

        const tools = createCrmQueryTools({ workspaceId: WS, invoker: 'integration-test' })
        const result = await (tools.getContactByPhone as { execute: (i: unknown) => Promise<unknown> }).execute({ phone: PHONE }) as {
          status: string
          data?: { id: string; duplicates_count: number; duplicates: string[] }
        }

        expect(result.status).toBe('found')
        expect(result.data?.id).toBe(newestId)
        expect(result.data?.duplicates_count).toBe(2)
        expect(new Set(result.data?.duplicates ?? [])).toEqual(new Set(olderIds))
      })
    })
    ```
  </action>
  <verify>
    <automated>test -f src/__tests__/integration/crm-query-tools/duplicates.test.ts && grep -q "duplicates_count" src/__tests__/integration/crm-query-tools/duplicates.test.ts && npm run test -- --run src/__tests__/integration/crm-query-tools/duplicates.test.ts 2>&1 | tail -5</automated>
  </verify>
  <acceptance_criteria>
    - File exists with `describe.skipIf`.
    - `grep -c "duplicates_count" {file}` returns ≥1.
    - `grep -c "in(\"id\", ids)" {file}` returns ≥1 (cleanup).
    - `npm run test -- --run` exits 0 (passes or skipped).
  </acceptance_criteria>
  <done>D-08 duplicates integration test ready.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 6.5: Fill in e2e/fixtures/seed.ts body</name>
  <read_first>
    - e2e/fixtures/seed.ts (Plan 01 skeleton — placeholder body)
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 20 — seed.ts skeleton notes)
    - src/__tests__/integration/crm-query-tools/cross-workspace.test.ts (Task 6.2 — verified pattern for admin insert)
    - src/__tests__/integration/crm-query-tools/config-driven.test.ts (Task 6.3 — pattern for pipeline + stages + config seeding)
  </read_first>
  <action>
    Replace the body of `/mnt/c/Users/Usuario/Proyectos/morfx-new/e2e/fixtures/seed.ts` with EXACT contents (preserve the imports + interface — replace ONLY the `seedTestFixture` and `cleanupTestFixture` bodies):

    ```typescript
    // e2e/fixtures/seed.ts
    // Body filled in standalone crm-query-tools Plan 06 (Wave 5).
    // Pattern derived from src/__tests__/integration/crm-query-tools/config-driven.test.ts.

    import { createClient, type SupabaseClient } from '@supabase/supabase-js'

    export interface SeededData {
      workspaceId: string
      pipelineId: string
      stageIds: string[]   // [activo1, activo2, terminal1]
      contactId: string
      orderIds: string[]
    }

    function admin(): SupabaseClient {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const srk = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!url || !srk) {
        throw new Error('seed requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
      }
      return createClient(url, srk)
    }

    const E2E_PHONE = '+573009998888'
    const E2E_PIPELINE_NAME = 'X-E2E-Pipeline crm-query-tools'

    export async function seedTestFixture(): Promise<SeededData> {
      const supabase = admin()
      const workspaceId = process.env.TEST_WORKSPACE_ID
      if (!workspaceId) throw new Error('seed requires TEST_WORKSPACE_ID')

      // 1. Pipeline
      const pipeIns = await supabase
        .from('pipelines')
        .insert({ workspace_id: workspaceId, name: E2E_PIPELINE_NAME })
        .select('id')
        .single()
      if (pipeIns.error) throw new Error(`seed pipeline failed: ${pipeIns.error.message}`)
      const pipelineId = pipeIns.data!.id

      // 2. Stages: 2 active + 1 terminal
      const stagesIns = await supabase
        .from('pipeline_stages')
        .insert([
          { pipeline_id: pipelineId, name: 'X-E2E-ACTIVO-1', position: 1 },
          { pipeline_id: pipelineId, name: 'X-E2E-ACTIVO-2', position: 2 },
          { pipeline_id: pipelineId, name: 'X-E2E-TERMINAL', position: 3 },
        ])
        .select('id, name')
      if (stagesIns.error) throw new Error(`seed stages failed: ${stagesIns.error.message}`)
      const stageMap = new Map(stagesIns.data!.map((s: { id: string; name: string }) => [s.name, s.id]))
      const activo1 = stageMap.get('X-E2E-ACTIVO-1')!
      const activo2 = stageMap.get('X-E2E-ACTIVO-2')!
      const terminal = stageMap.get('X-E2E-TERMINAL')!

      // 3. Contact
      const contactIns = await supabase
        .from('contacts')
        .insert({ workspace_id: workspaceId, name: 'X-E2E Contact', phone: E2E_PHONE })
        .select('id')
        .single()
      if (contactIns.error) throw new Error(`seed contact failed: ${contactIns.error.message}`)
      const contactId = contactIns.data!.id

      // 4. Two orders: one in activo1 (newest), one in terminal (older)
      const ordersIns = await supabase
        .from('orders')
        .insert([
          {
            workspace_id: workspaceId,
            contact_id: contactId,
            pipeline_id: pipelineId,
            stage_id: terminal,
            total_value: 50000,
            description: 'X-E2E older terminal order',
            created_at: '2026-01-01T00:00:00.000Z',
          },
          {
            workspace_id: workspaceId,
            contact_id: contactId,
            pipeline_id: pipelineId,
            stage_id: activo1,
            total_value: 100000,
            description: 'X-E2E active order (newer)',
            created_at: '2026-04-01T00:00:00.000Z',
          },
        ])
        .select('id')
      if (ordersIns.error) throw new Error(`seed orders failed: ${ordersIns.error.message}`)
      const orderIds = ordersIns.data!.map((r: { id: string }) => r.id)

      return {
        workspaceId,
        pipelineId,
        stageIds: [activo1, activo2, terminal],
        contactId,
        orderIds,
      }
    }

    export async function cleanupTestFixture(seeded: SeededData): Promise<void> {
      const supabase = admin()
      // Reset config that the E2E test set
      await supabase
        .from('crm_query_tools_active_stages')
        .delete()
        .eq('workspace_id', seeded.workspaceId)
        .in('stage_id', seeded.stageIds)
      await supabase
        .from('crm_query_tools_config')
        .update({ pipeline_id: null })
        .eq('workspace_id', seeded.workspaceId)

      // Delete orders, contact, pipeline (stages CASCADE with pipeline FK in your schema)
      if (seeded.orderIds.length) {
        await supabase.from('orders').delete().in('id', seeded.orderIds)
      }
      if (seeded.contactId) {
        await supabase.from('contacts').delete().eq('id', seeded.contactId)
      }
      if (seeded.pipelineId) {
        // Stages CASCADE-delete with pipeline
        await supabase.from('pipelines').delete().eq('id', seeded.pipelineId)
      }
    }
    ```

    Verify:
    - Old `NOT_IMPLEMENTED` markers are gone: `grep "NOT_IMPLEMENTED" e2e/fixtures/seed.ts` returns 0.
    - File compiles: `npx tsc --noEmit -p .` zero errors.
  </action>
  <verify>
    <automated>! grep "NOT_IMPLEMENTED" e2e/fixtures/seed.ts && grep -q "X-E2E-ACTIVO-1" e2e/fixtures/seed.ts && grep -q "X-E2E-TERMINAL" e2e/fixtures/seed.ts && npx tsc --noEmit -p . 2>&1 | grep -E "fixtures/seed" | head -3</automated>
  </verify>
  <acceptance_criteria>
    - `grep "NOT_IMPLEMENTED" e2e/fixtures/seed.ts` returns 0 (placeholders gone).
    - `grep -c "X-E2E-" e2e/fixtures/seed.ts` returns ≥3 (stage labels).
    - `npx tsc --noEmit -p .` returns zero errors related to this file.
  </acceptance_criteria>
  <done>seed fixture body shipped. Plan 06.6 E2E spec can use it.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 6.6: Write the Playwright E2E spec — UI ↔ DB ↔ tool runner</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 18 — e2e spec, lines ~858-898)
    - .planning/standalone/crm-query-tools/RESEARCH.md (Example 6 — full skeleton)
    - playwright.config.ts (Plan 01 — webServer + baseURL)
    - e2e/fixtures/auth.ts (Plan 01 — authenticateAsTestUser)
    - e2e/fixtures/seed.ts (Task 6.5 — seedTestFixture/cleanupTestFixture)
    - src/app/(dashboard)/agentes/crm-tools/_components/ConfigEditor.tsx (Plan 05 — ARIA labels: "Pipeline", "Stages activos", role=combobox; toast text "Configuracion guardada")
    - src/app/api/test/crm-query-tools/runner/route.ts (Task 6.1 — POST shape + x-test-secret header)
  </read_first>
  <action>
    Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/e2e/crm-query-tools.spec.ts` with EXACT contents:

    ```typescript
    /**
     * E2E — UI ↔ DB ↔ tool runner integration.
     *
     * Standalone crm-query-tools Wave 5 (Plan 06).
     *
     * Required env (set in .env.local or CI):
     *   - NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
     *   - TEST_WORKSPACE_ID
     *   - TEST_USER_EMAIL, TEST_USER_PASSWORD (workspace member)
     *   - PLAYWRIGHT_TEST_SECRET (matches server-side env)
     *
     * If any required env is missing, the test is skipped (CI-safe).
     */

    import { test, expect, type Page } from '@playwright/test'
    import { authenticateAsTestUser } from './fixtures/auth'
    import { seedTestFixture, cleanupTestFixture, type SeededData } from './fixtures/seed'

    const required = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'TEST_WORKSPACE_ID',
      'TEST_USER_EMAIL',
      'TEST_USER_PASSWORD',
      'PLAYWRIGHT_TEST_SECRET',
    ]
    const missing = required.filter((k) => !process.env[k])

    test.describe.configure({ mode: 'serial' })

    test.describe('crm-query-tools E2E (UI ↔ DB ↔ tool)', () => {
      test.skip(missing.length > 0, `missing env: ${missing.join(', ')}`)

      let seeded: SeededData

      test.beforeAll(async () => {
        seeded = await seedTestFixture()
      })

      test.afterAll(async () => {
        if (seeded) await cleanupTestFixture(seeded)
      })

      test('configure active stages via UI then tool returns the active order', async ({ page, request }) => {
        await authenticateAsTestUser(page)
        await page.goto('/agentes/crm-tools')

        // Wait for the page to render
        await expect(page.getByRole('heading', { name: 'Herramientas CRM' })).toBeVisible()

        // 1. Pick the X-E2E-Pipeline (native <select>, accessible via aria-label="Pipeline")
        const pipelineSelect = page.getByRole('combobox', { name: 'Pipeline' })
        await pipelineSelect.selectOption({ label: 'X-E2E-Pipeline crm-query-tools' })

        // 2. Open multi-select stages
        const stagesTrigger = page.getByRole('combobox', { name: 'Stages activos' })
        await stagesTrigger.click()

        // 3. Check the two ACTIVO stages
        await page.getByRole('checkbox', { name: 'X-E2E-ACTIVO-1' }).check()
        await page.getByRole('checkbox', { name: 'X-E2E-ACTIVO-2' }).check()
        await page.getByRole('button', { name: 'Cerrar' }).click()

        // 4. Save — wait for the toast or revalidation
        await page.getByRole('button', { name: 'Guardar' }).click()
        await expect(page.getByText('Configuracion guardada')).toBeVisible({ timeout: 5000 })

        // 5. Invoke getActiveOrderByPhone via the test runner endpoint
        const resp = await request.post('/api/test/crm-query-tools/runner', {
          headers: { 'x-test-secret': process.env.PLAYWRIGHT_TEST_SECRET ?? '' },
          data: {
            tool: 'getActiveOrderByPhone',
            input: { phone: '+573009998888' },
          },
        })
        expect(resp.status()).toBe(200)
        const json = await resp.json() as { status: string; data?: { id: string; stageId: string } }

        // 6. Assert tool returned the active order (the newer one, in stage activo1)
        expect(json.status).toBe('found')
        expect(seeded.stageIds.slice(0, 2)).toContain(json.data?.stageId)
      })

      test('without active stages config, getActiveOrderByPhone returns config_not_set', async ({ page, request }) => {
        await authenticateAsTestUser(page)
        await page.goto('/agentes/crm-tools')

        // Open stages multi-select and uncheck both
        const stagesTrigger = page.getByRole('combobox', { name: 'Stages activos' })
        await stagesTrigger.click()
        const a1 = page.getByRole('checkbox', { name: 'X-E2E-ACTIVO-1' })
        const a2 = page.getByRole('checkbox', { name: 'X-E2E-ACTIVO-2' })
        if (await a1.isChecked()) await a1.uncheck()
        if (await a2.isChecked()) await a2.uncheck()
        await page.getByRole('button', { name: 'Cerrar' }).click()

        // Reset pipeline scope to "all"
        await page.getByRole('combobox', { name: 'Pipeline' }).selectOption({ value: '' })

        await page.getByRole('button', { name: 'Guardar' }).click()
        await expect(page.getByText('Configuracion guardada')).toBeVisible({ timeout: 5000 })

        const resp = await request.post('/api/test/crm-query-tools/runner', {
          headers: { 'x-test-secret': process.env.PLAYWRIGHT_TEST_SECRET ?? '' },
          data: {
            tool: 'getActiveOrderByPhone',
            input: { phone: '+573009998888' },
          },
        })
        expect(resp.status()).toBe(200)
        const json = await resp.json() as { status: string }
        expect(json.status).toBe('config_not_set')
      })
    })
    ```

    Note: do NOT run `npx playwright test` from this task — it requires env + dev server. The verification step uses `--list` to confirm syntactic validity only.
  </action>
  <verify>
    <automated>test -f e2e/crm-query-tools.spec.ts && grep -q "Herramientas CRM" e2e/crm-query-tools.spec.ts && grep -q "config_not_set" e2e/crm-query-tools.spec.ts && grep -q "x-test-secret" e2e/crm-query-tools.spec.ts && npx playwright test --list 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - File exists with two tests inside `describe`.
    - `grep -c "Herramientas CRM" {file}` returns ≥1 (page heading assertion).
    - `grep -c "config_not_set" {file}` returns ≥1 (D-27 path).
    - `grep -c "x-test-secret" {file}` returns ≥1 (matches Task 6.1 endpoint).
    - `grep -c "test.skip" {file}` returns ≥1 (env-gated skip — CI-safe).
    - `npx playwright test --list` exits 0 and reports the 2 tests under `crm-query-tools.spec.ts`.
  </acceptance_criteria>
  <done>E2E spec ready. To execute, user must set env + run `npm run test:e2e`.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 6.7: Anti-pattern grep on entire module + commit + push</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (Section "Anti-Patterns Flagged" — final verification block)
    - .claude/rules/code-changes.md
  </read_first>
  <action>
    1. Final BLOCKER 1 grep across the entire shared module (sanity after all 4 plans):
       ```
       grep -E "^import" src/lib/agents/shared/crm-query-tools/*.ts src/lib/agents/shared/crm-query-tools/__tests__/*.ts | grep -E "createAdminClient|@supabase/supabase-js"
       ```
       Expected: 0.

    2. Final hardcoded-stage-name grep:
       ```
       grep -rn "'CONFIRMADO'\|'ENTREGADO'\|'FALTA INFO'\|'NUEVO PAG WEB'\|is_closed" src/lib/agents/shared/crm-query-tools/ --include="*.ts" | grep -v __tests__
       ```
       Expected: 0.

    3. Run full Vitest suite (skip e2e):
       ```
       npm run test -- --run
       ```
       Exit 0 — no regression. Integration suites for crm-query-tools will SKIP if env not set in this environment (CI-safe).

    4. List Playwright tests:
       ```
       npx playwright test --list
       ```
       Should report 2 specs under `crm-query-tools.spec.ts`.

    5. Type-check entire repo: `npx tsc --noEmit -p .` exit 0.

    6. Stage + commit:
       ```
       git add src/__tests__/integration/crm-query-tools src/app/api/test e2e/fixtures/seed.ts e2e/crm-query-tools.spec.ts
       git commit -m "$(cat <<'EOF'
       feat(crm-query-tools): integration + E2E tests + test runner endpoint

       - 3 integration tests (env-gated, real Supabase):
         * cross-workspace.test.ts — D-05 isolation under same phone in 2 workspaces.
         * config-driven.test.ts   — D-13 FK CASCADE on stage delete + D-16 SET NULL on pipeline delete.
         * duplicates.test.ts      — D-08 newest + duplicates_count + duplicates list.
       - src/app/api/test/crm-query-tools/runner/route.ts — env-gated POST endpoint
         (NODE_ENV !== 'production' + x-test-secret + TEST_WORKSPACE_ID).
       - e2e/fixtures/seed.ts — body filled (Plan 01 placeholder removed).
       - e2e/crm-query-tools.spec.ts — 2 Playwright tests:
         * configure active stages → tool returns active order.
         * no config → tool returns config_not_set (D-27 happy path).

       Standalone: crm-query-tools Plan 06 (Wave 5).
       Refs D-05, D-08, D-13, D-16, D-24, D-27.

       Co-authored-by: Claude <noreply@anthropic.com>
       EOF
       )"
       ```

    7. Push: `git push origin main`.
  </action>
  <verify>
    <automated>npm run test -- --run 2>&1 | tail -5 && npx playwright test --list 2>&1 | grep -c "crm-query-tools" && git log -1 --oneline | grep -i "crm-query-tools"</automated>
  </verify>
  <acceptance_criteria>
    - All anti-pattern greps return 0.
    - `npm run test -- --run` exits 0 (integration suites skip on missing env, but no fail).
    - `npx playwright test --list` reports the 2 specs.
    - `npx tsc --noEmit -p .` exits 0.
    - `git log -1 --pretty=%s` matches `feat(crm-query-tools): integration + E2E tests`.
    - `git log @{u}..HEAD` is empty (push succeeded).
  </acceptance_criteria>
  <done>Plan 06 shipped. All test layers (Unit + Integration + E2E) deployed. Plan 07 (handoff) is the final plan.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → /api/test/crm-query-tools/runner | Test-only endpoint (NODE_ENV gate + secret) |
| Playwright runner → Next dev server | localhost:3020 (port locked Regla) |
| Integration tests → Supabase admin client | env-gated (TEST_WORKSPACE_ID, SUPABASE_SERVICE_ROLE_KEY) |
| Test seed/cleanup → production-shape DB | Risk: leaving X-Test data behind |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-W5-01 | Elevation of Privilege | Test runner endpoint exposed in production | HIGH | mitigate | First branch in route handler: `if (NODE_ENV === 'production') return 404`. Plan 07 INTEGRATION-HANDOFF documents why this is safe to ship. |
| T-W5-02 | Spoofing | Caller bypasses x-test-secret with brute force | MEDIUM | mitigate | Header secret comparison via strict equality; rotate secret per env. Production gate (T-W5-01) still applies → secret leak alone insufficient to exploit. |
| T-W5-03 | Information Disclosure | Test runner returns workspace data to wrong caller | MEDIUM | mitigate | `workspaceId = process.env.TEST_WORKSPACE_ID` (server-side env, not body). All tools filter by ctx.workspaceId via domain layer. Body NEVER carries workspaceId. |
| T-W5-04 | Tampering | Body `tool` arg invokes arbitrary function | LOW | mitigate | Allow-list `ALLOWED_TOOLS` of 5 names; anything else 400. |
| T-W5-05 | Denial of Service | Body `input` is malformed and crashes tool | LOW | mitigate | Try/catch around `tool.execute`; returns 500 with error JSON, not stacktrace. |
| T-W5-06 | Tampering | X-Test data left in workspace pollutes prod | MEDIUM | mitigate | Each integration test has `afterAll` cleanup; E2E spec has `afterAll` calling `cleanupTestFixture`. Names prefixed `X-E2E-` / `X-Test-` for easy manual purge. |
| T-W5-07 | Information Disclosure | Phone PII (E2E_PHONE) in seed/cleanup logs | LOW | accept | Test phones are synthetic; no real customer data. Acceptable. |
| T-W5-08 | Spoofing | Playwright auth fixture bypasses 2FA | LOW | accept | Test user is dedicated to the test workspace; no production access. Acceptable risk per RESEARCH Open Q5. |
</threat_model>

<verification>
- `npx tsc --noEmit -p .` exits 0.
- `npm run test -- --run` exits 0 (Plan 03/04 unit tests still green; integration tests skip gracefully without env).
- `npx playwright test --list` reports 2 specs in `e2e/crm-query-tools.spec.ts`.
- BLOCKER 1 grep across the entire shared module returns 0.
- `git push origin main` succeeded.
</verification>

<must_haves>
truths:
  - "Three integration tests run (or skip cleanly) covering cross-workspace, FK CASCADE, duplicates."
  - "Test-runner endpoint /api/test/crm-query-tools/runner returns 404 in production."
  - "Test-runner endpoint requires x-test-secret header and TEST_WORKSPACE_ID env."
  - "E2E spec drives /agentes/crm-tools UI → save → invoke tool → assert."
  - "E2E covers two paths: configured active stages → found, no config → config_not_set (D-27)."
  - "Fixture seed/cleanup leaves prod workspace clean after run."
artifacts:
  - path: "src/__tests__/integration/crm-query-tools/cross-workspace.test.ts"
    provides: "D-05 workspace isolation integration test"
  - path: "src/__tests__/integration/crm-query-tools/config-driven.test.ts"
    provides: "D-13 FK CASCADE + D-16 SET NULL integration test"
  - path: "src/__tests__/integration/crm-query-tools/duplicates.test.ts"
    provides: "D-08 duplicates resolution integration test"
  - path: "src/app/api/test/crm-query-tools/runner/route.ts"
    provides: "Env-gated POST endpoint to invoke tools from Playwright"
  - path: "e2e/fixtures/seed.ts"
    provides: "Real seed/cleanup body (placeholder removed)"
  - path: "e2e/crm-query-tools.spec.ts"
    provides: "2 Playwright tests covering D-24 UI ↔ DB ↔ tool E2E"
key_links:
  - from: "Playwright spec"
    to: "test runner endpoint"
    via: "request.post('/api/test/crm-query-tools/runner', { headers: { 'x-test-secret': ... } })"
    pattern: "request.post.*runner"
  - from: "test runner endpoint"
    to: "createCrmQueryTools"
    via: "import"
    pattern: "from '@/lib/agents/shared/crm-query-tools'"
  - from: "integration tests"
    to: "Supabase admin client + domain layer"
    via: "createClient + createCrmQueryTools / getCrmQueryToolsConfig"
    pattern: "process.env.SUPABASE_SERVICE_ROLE_KEY"
</must_haves>

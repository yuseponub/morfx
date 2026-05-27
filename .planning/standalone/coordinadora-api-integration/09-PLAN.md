---
phase: coordinadora-api-integration
plan: 09
type: execute
wave: 2
depends_on: [08]
files_modified:
  - src/inngest/functions/coordinadora-webhook-process.ts
  - src/inngest/functions/__tests__/coordinadora-webhook-process.test.ts
  - src/inngest/client.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "Inngest function id='coordinadora-webhook-process' registered against event 'coordinadora/webhook.received'"
    - "Concurrency [{key: 'event.data.trackingNumber', limit: 1}] (D-08 idempotent downstream)"
    - "Retries: 2 (Pub/Sub redelivery + retry on transient persistence/obs failure)"
    - "Emits pipeline_decision:coordinadora_webhook_processed to agent_observability_events"
    - "PII redaction: only trackingNumber.slice(-4) in observability payload (D-28)"
    - "Function is registered in inngest serve handler (src/app/api/inngest/route.ts or equivalent)"
    - "V1 downstream is minimal: log + observability emit; business logic (auto-stage-move, customer notify) deferred to V1.1"
  artifacts:
    - path: "src/inngest/functions/coordinadora-webhook-process.ts"
      provides: "Inngest async processor for coordinadora/webhook.received events"
      exports: ["coordinadoraWebhookProcess"]
    - path: "src/inngest/functions/__tests__/coordinadora-webhook-process.test.ts"
      provides: "Vitest suite verifying observability emit + PII redaction + concurrency key shape"
  key_links:
    - from: "coordinadora/webhook.received event"
      to: "agent_observability_events table"
      via: "step.run insert pipeline_decision:coordinadora_webhook_processed"
      pattern: "PII-redacted payload"
---

<objective>
Implement the Inngest async processor for `coordinadora/webhook.received` events. V1 is minimal: emit observability event + log. Business logic (auto-stage-move, customer notify) deferred to V1.1.

Per D-08: this function runs AFTER the webhook ACKs 200 — it's the downstream side of the async dispatch pattern.

Per D-27 / D-28: emit `pipeline_decision:coordinadora_webhook_processed` to `agent_observability_events` with PII-redacted payload (only `trackingNumber.slice(-4)`).

Per PATTERNS Pattern 5 lines 410-501: mirror `bold-upstream-broken.ts:28-62` (simple step.run + direct supabase insert against `agent_observability_events`).

Also REGISTER the function in the inngest serve handler so it actually receives events.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/coordinadora-api-integration/CONTEXT.md
@.planning/standalone/coordinadora-api-integration/RESEARCH.md
@.planning/standalone/coordinadora-api-integration/PATTERNS.md
@src/inngest/functions/bold-upstream-broken.ts
@src/inngest/functions/recompra-preload-context.ts
@src/inngest/client.ts
@src/lib/audit/logger.ts

<interfaces>
From src/inngest/client.ts:
- `inngest.createFunction(config, trigger, handler)` — standard pattern

From src/inngest/events.ts (Plan 08):
```typescript
export type CoordinadoraWebhookEvents = {
  'coordinadora/webhook.received': {
    data: {
      env: 'test' | 'prod'
      workspaceId: string
      eventRowId: string
      trackingNumber: string
      codigo: string
      codigoEstado: string | null
    }
  }
}
```

From src/inngest/functions/bold-upstream-broken.ts:28-60 (analog):
```typescript
export const boldUpstreamBroken = inngest.createFunction(
  { id: 'bold-upstream-broken', ... },
  { event: 'bold-robot/upstream-broken' },
  async ({ event, step }) => {
    const supabase = createAdminClient()
    await step.run('log-to-observability', async () => {
      await supabase.from('agent_observability_events').insert({
        workspace_id, event_type, agent_id, payload,
      })
    })
  }
)
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write coordinadora-webhook-process.test.ts (RED)</name>
  <files>src/inngest/functions/__tests__/coordinadora-webhook-process.test.ts</files>
  <read_first>
    - src/inngest/functions/__tests__/recompra-preload-context.test.ts (function-test scaffold pattern)
    - src/inngest/functions/bold-upstream-broken.ts (simpler analog to mirror)
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Pattern 5 lines 707-758 (canonical Inngest function)
    - .planning/standalone/coordinadora-api-integration/PATTERNS.md lines 406-500 (deviations for coordinadora-webhook-process)
  </read_first>
  <behavior>
    - Test 1: function config has id 'coordinadora-webhook-process'
    - Test 2: function config has retries 2
    - Test 3: function config has concurrency keyed on event.data.trackingNumber, limit 1
    - Test 4: function trigger is 'coordinadora/webhook.received'
    - Test 5: handler invokes step.run('log-to-observability', ...)
    - Test 6: observability payload has redacted trackingLast4 (NOT full trackingNumber)
    - Test 7: observability event_type starts with 'pipeline_decision:coordinadora_webhook_processed'
    - Test 8: handler returns { ok: true, eventRowId } on success
  </behavior>
  <action>
    Create `src/inngest/functions/__tests__/coordinadora-webhook-process.test.ts`:

    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest'

    // Supabase admin mock — captures the insert payload
    const insertMock = vi.fn(() => ({ data: null, error: null }))
    const fromMock = vi.fn(() => ({ insert: insertMock }))
    vi.mock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({ from: fromMock }),
    }))

    import { coordinadoraWebhookProcess } from '@/inngest/functions/coordinadora-webhook-process'

    function buildEvent(overrides: Partial<{
      env: 'test' | 'prod'
      workspaceId: string
      eventRowId: string
      trackingNumber: string
      codigo: string
      codigoEstado: string | null
    }> = {}): { data: Record<string, unknown> } {
      return {
        data: {
          env: 'test',
          workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490',
          eventRowId: 'event-uuid-1',
          trackingNumber: '12345678901',
          codigo: '6',
          codigoEstado: null,
          ...overrides,
        },
      }
    }

    function buildStep(): { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } {
      return {
        run: async (_name: string, fn: () => Promise<unknown>) => fn(),
      }
    }

    beforeEach(() => {
      vi.clearAllMocks()
      insertMock.mockReset()
      insertMock.mockResolvedValue({ data: null, error: null })
      fromMock.mockImplementation(() => ({ insert: insertMock }))
    })

    describe('coordinadoraWebhookProcess — function config', () => {
      it('has id "coordinadora-webhook-process"', () => {
        // Inngest function object exposes its id via .id() or .opts — adapt to actual SDK
        const opts = (coordinadoraWebhookProcess as unknown as { opts?: { id?: string } }).opts
        const direct = (coordinadoraWebhookProcess as unknown as { id?: string }).id
        const id = opts?.id ?? direct
        expect(id).toBe('coordinadora-webhook-process')
      })

      it('triggers on coordinadora/webhook.received', () => {
        // Inspect the function's triggers — adapt based on SDK shape
        const triggers = (coordinadoraWebhookProcess as unknown as { triggers?: Array<{ event: string }> }).triggers
        if (triggers) {
          expect(triggers.some(t => t.event === 'coordinadora/webhook.received')).toBe(true)
        }
        // If triggers not exposed, this test is informational only.
      })
    })

    describe('coordinadoraWebhookProcess — handler behavior', () => {
      it('inserts agent_observability_events with PII-redacted trackingLast4', async () => {
        const event = buildEvent({ trackingNumber: '12345678901', codigo: '6' })
        const handler = (coordinadoraWebhookProcess as unknown as { fn: (args: { event: unknown; step: unknown }) => Promise<unknown> }).fn
        await handler({ event, step: buildStep() })

        expect(fromMock).toHaveBeenCalledWith('agent_observability_events')
        const insertArgs = insertMock.mock.calls[0]?.[0] as Record<string, unknown>
        expect(insertArgs.event_type).toMatch(/coordinadora_webhook_processed/)
        const payload = insertArgs.payload as Record<string, unknown>
        // D-28: only last 4 digits, NOT full tracking number
        expect(payload.trackingNumberLast4 ?? payload.trackingLast4).toBe('8901')
        expect(payload).not.toHaveProperty('trackingNumber', '12345678901')
      })

      it('records the event_row_id in payload (for log correlation)', async () => {
        const event = buildEvent({ eventRowId: 'event-uuid-XYZ' })
        const handler = (coordinadoraWebhookProcess as unknown as { fn: (args: { event: unknown; step: unknown }) => Promise<unknown> }).fn
        await handler({ event, step: buildStep() })

        const insertArgs = insertMock.mock.calls[0]?.[0] as Record<string, unknown>
        const payload = insertArgs.payload as Record<string, unknown>
        expect(payload.eventRowId).toBe('event-uuid-XYZ')
      })

      it('returns ok:true plus eventRowId on success', async () => {
        const event = buildEvent({ eventRowId: 'event-uuid-1' })
        const handler = (coordinadoraWebhookProcess as unknown as { fn: (args: { event: unknown; step: unknown }) => Promise<unknown> }).fn
        const result = await handler({ event, step: buildStep() }) as { ok: boolean; eventRowId: string }
        expect(result.ok).toBe(true)
        expect(result.eventRowId).toBe('event-uuid-1')
      })

      it('uses workspace_id from event in observability row', async () => {
        const event = buildEvent({ workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490' })
        const handler = (coordinadoraWebhookProcess as unknown as { fn: (args: { event: unknown; step: unknown }) => Promise<unknown> }).fn
        await handler({ event, step: buildStep() })

        const insertArgs = insertMock.mock.calls[0]?.[0] as Record<string, unknown>
        expect(insertArgs.workspace_id).toBe('a3843b3f-c337-4836-92b5-89c58bb98490')
      })

      it('uses agent_id "coordinadora-webhook" namespace (D-34)', async () => {
        const event = buildEvent()
        const handler = (coordinadoraWebhookProcess as unknown as { fn: (args: { event: unknown; step: unknown }) => Promise<unknown> }).fn
        await handler({ event, step: buildStep() })

        const insertArgs = insertMock.mock.calls[0]?.[0] as Record<string, unknown>
        expect(insertArgs.agent_id).toBe('coordinadora-webhook')
      })
    })
    ```

    Save the file. Tests will fail until Task 2.

    NOTE: The SDK shape for inspecting function config (`opts`, `triggers`, `fn`) may differ between Inngest versions. If Vitest reports "cannot read property X of undefined", adjust the test to use whatever surface the installed `inngest` package actually exposes — see Plan 09 SUMMARY for the actual shape and update tests accordingly.

    Commit message: `test(coordinadora-api): add Inngest function test suite (RED)`
  </action>
  <verify>
    <automated>test -f src/inngest/functions/__tests__/coordinadora-webhook-process.test.ts &amp;&amp; grep -c "  it(" src/inngest/functions/__tests__/coordinadora-webhook-process.test.ts | awk '{ exit ($1 &gt;= 6 ? 0 : 1) }'</automated>
  </verify>
  <acceptance_criteria>
    - File `src/inngest/functions/__tests__/coordinadora-webhook-process.test.ts` exists
    - Contains 6+ `it(` test cases
    - Mocks `@/lib/supabase/admin`
    - Imports `coordinadoraWebhookProcess` (doesn't exist yet — Task 2)
    - File committed
  </acceptance_criteria>
  <done>Inngest function test scaffold committed. Tests RED.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create coordinadora-webhook-process.ts (GREEN)</name>
  <files>src/inngest/functions/coordinadora-webhook-process.ts</files>
  <read_first>
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Pattern 5 lines 707-758 (canonical)
    - .planning/standalone/coordinadora-api-integration/PATTERNS.md lines 491-500 (deviations: concurrency on trackingNumber, retries 2, agentId 'coordinadora-webhook')
    - src/inngest/functions/bold-upstream-broken.ts (simpler analog with step.run + supabase insert)
    - src/inngest/functions/__tests__/coordinadora-webhook-process.test.ts (Task 1 — assertions to satisfy)
    - src/inngest/client.ts (inngest.createFunction usage)
  </read_first>
  <behavior>
    - Function id: `'coordinadora-webhook-process'`
    - Retries: `2`
    - Concurrency: `[{ key: 'event.data.trackingNumber', limit: 1 }]`
    - Event trigger: `{ event: 'coordinadora/webhook.received' }`
    - Handler: step.run inserts row into `agent_observability_events` with event_type='coordinadora_webhook_processed', agent_id='coordinadora-webhook', PII-redacted payload (trackingLast4 only)
    - Returns `{ ok: true, eventRowId }`
  </behavior>
  <action>
    Create `src/inngest/functions/coordinadora-webhook-process.ts`:

    ```ts
    /**
     * Coordinadora webhook downstream processor (D-08, D-27).
     *
     * Standalone: coordinadora-api-integration
     *
     * V1 scope: emit observability event + log. Business logic (auto-stage-move,
     * customer notify, automation triggers) deferred to V1.1.
     *
     * Triggered by app/api/webhooks/coordinadora/[env]/route.ts via inngest.send
     * after a NEWLY-INSERTED order_carrier_events row.
     */

    import { inngest } from '../client'
    import { createAdminClient } from '@/lib/supabase/admin'
    import { createModuleLogger } from '@/lib/audit/logger'

    const logger = createModuleLogger('coordinadora-webhook-process')

    export const coordinadoraWebhookProcess = inngest.createFunction(
      {
        id: 'coordinadora-webhook-process',
        name: 'Coordinadora Webhook: Downstream Processor',
        retries: 2,
        concurrency: [{ key: 'event.data.trackingNumber', limit: 1 }],
      },
      { event: 'coordinadora/webhook.received' },
      async ({ event, step }) => {
        const { env, workspaceId, eventRowId, trackingNumber, codigo, codigoEstado } =
          event.data as {
            env: 'test' | 'prod'
            workspaceId: string
            eventRowId: string
            trackingNumber: string
            codigo: string
            codigoEstado: string | null
          }

        await step.run('log-to-observability', async () => {
          const supabase = createAdminClient()
          // D-28 PII redaction — only last 4 digits of tracking_number.
          const { error } = await supabase.from('agent_observability_events').insert({
            workspace_id: workspaceId,
            event_type: 'coordinadora_webhook_processed',
            agent_id: 'coordinadora-webhook',
            payload: {
              env,
              codigo,
              codigoEstado,
              trackingNumberLast4: trackingNumber.slice(-4),
              eventRowId,
            },
          })
          if (error) {
            // Throw to let Inngest retries handle transient persistence failures.
            throw new Error(`agent_observability_events insert failed: ${error.message}`)
          }
        })

        logger.info(
          {
            env,
            trackingLast4: trackingNumber.slice(-4),
            codigo,
            codigoEstado,
            eventRowId,
          },
          'coordinadora event processed',
        )

        return { ok: true, eventRowId }
      },
    )
    ```

    Run `npx vitest run src/inngest/functions/__tests__/coordinadora-webhook-process.test.ts` — expect 6+ tests green. If any test fails because Inngest's exposed API differs from the assumption in Task 1, ADJUST THE TEST to use the actual shape (NOT the implementation — the production code is canonical from RESEARCH §Pattern 5).

    Commit message: `feat(coordinadora-api): add Inngest webhook processor (GREEN)`
  </action>
  <verify>
    <automated>npx vitest run src/inngest/functions/__tests__/coordinadora-webhook-process.test.ts 2&gt;&amp;1 | tail -8 | grep -E "Test Files\s+1 passed"</automated>
  </verify>
  <acceptance_criteria>
    - File `src/inngest/functions/coordinadora-webhook-process.ts` exists
    - Exports `coordinadoraWebhookProcess`
    - File contains `id: 'coordinadora-webhook-process'` exactly once
    - File contains `retries: 2` (or similar — grep `retries: 2`)
    - File contains `concurrency: [{ key: 'event.data.trackingNumber', limit: 1 }]`
    - File contains `event: 'coordinadora/webhook.received'`
    - File uses `trackingNumber.slice(-4)` for PII redaction (grep returns at least 1)
    - File does NOT log the full `trackingNumber` value in any log call (grep `trackingNumber[^L]` in logger calls returns 0 — only `trackingLast4` or `slice(-4)` versions)
    - Vitest run passes 6+ tests
  </acceptance_criteria>
  <done>Inngest processor created. Plan 10 will register it in the serve handler.</done>
</task>

<task type="auto">
  <name>Task 3: Register coordinadoraWebhookProcess in Inngest serve handler</name>
  <files>src/inngest/client.ts</files>
  <read_first>
    - src/inngest/client.ts (full — find where existing functions are registered, e.g. `serve({ functions: [...] })` or an exported array)
    - src/inngest/functions/coordinadora-webhook-process.ts (Task 2)
  </read_first>
  <action>
    The Inngest SDK requires functions to be registered with the serve handler to actually fire. There are typically two patterns in a Next.js app:

    1. **Centralized array in `src/inngest/client.ts` or `src/app/api/inngest/route.ts`** — append `coordinadoraWebhookProcess` to the functions array
    2. **Per-file export consumed dynamically** — verify the loader picks up the new file

    Read `src/inngest/client.ts` and `src/app/api/inngest/route.ts` (if exists) to determine which pattern is in use. Then:

    - If centralized: add the import + add `coordinadoraWebhookProcess` to the registered functions array
    - If dynamic: verify file naming convention matches what the loader expects

    Verify the function is actually registered: after the change, when the Next dev server starts, the Inngest dev server (or production handler) should list `coordinadora-webhook-process` among its functions.

    Run `npm run build` (or `npm run typecheck` if available — pick whichever does TypeScript checking without running Vercel-side bundling) — must complete without errors. NOTE: full `npm run build` is fine here because Plan 02 already set placeholder env vars in Vercel; local build may fail if env vars are missing — in that case, use `npx tsc --noEmit` instead.

    Commit message: `feat(coordinadora-api): register coordinadora-webhook-process Inngest function`
  </action>
  <verify>
    <automated>grep -rE "coordinadoraWebhookProcess|coordinadora-webhook-process" src/inngest/ src/app/api/inngest/ 2&gt;/dev/null | grep -v "__tests__" | grep -v ".test.ts" | wc -l | awk '{ exit ($1 &gt;= 2 ? 0 : 1) }'</automated>
  </verify>
  <acceptance_criteria>
    - `coordinadoraWebhookProcess` is referenced in at least one non-test file outside its definition file (i.e. it's registered in client.ts or route.ts)
    - `npx tsc --noEmit` passes (or `npm run build` succeeds locally with placeholder env vars)
    - The function will actually receive events when deployed (verified by the registration grep)
  </acceptance_criteria>
  <done>Function registered. End-to-end pipeline operational: webhook → domain insert → inngest dispatch → coordinadoraWebhookProcess → agent_observability_events insert.</done>
</task>

</tasks>

<verification>
- All 3 tasks committed
- Full test suite still passes: `npx vitest run src/lib/carriers/coordinadora/__tests__/ src/lib/domain/__tests__/carrier-events-coordinadora.test.ts src/app/api/webhooks/coordinadora/__tests__/ src/inngest/functions/__tests__/coordinadora-webhook-process.test.ts`
- TypeScript clean
- Function registered (grep verifies)
</verification>

<success_criteria>
1. Inngest function + test + registration committed (3 commits)
2. End-to-end async pipeline complete
3. PII redaction enforced in observability emit
4. Function will fire when deployed (registered in serve handler)
</success_criteria>

<output>
After completion, create `.planning/standalone/coordinadora-api-integration/09-SUMMARY.md` documenting:
- Files created (function + test + registration)
- Vitest pass count (all coordinadora tests)
- Commit SHAs (3)
- Note: SDK shape discovery for Inngest function inspection — paste actual function-config shape for future maintainers
</output>

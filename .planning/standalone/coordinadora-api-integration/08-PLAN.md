---
phase: coordinadora-api-integration
plan: 08
type: execute
wave: 2
depends_on: [01, 03, 06, 07]
files_modified:
  - src/app/api/webhooks/coordinadora/[env]/route.ts
  - src/app/api/webhooks/coordinadora/__tests__/route.test.ts
  - src/inngest/events.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "Route handler exists at src/app/api/webhooks/coordinadora/[env]/route.ts with POST export"
    - "params is typed as Promise<{ env: string }> and awaited (Next 15 Pitfall 2)"
    - "Invalid env path param → 404"
    - "Invalid JSON body → 400"
    - "Non-PubSub envelope → 400"
    - "Decode failure → 200 + drop (no eternal retry)"
    - "Unmatched nit_cliente → 200 + drop"
    - "Valid + new event → 200 + await inngest.send dispatched"
    - "Valid + duplicate → 200 + NO inngest.send"
    - "Persistence error → 500 (Pub/Sub retries)"
    - "Handler imports from '@/lib/domain/carrier-events' (Regla 3) — NO createAdminClient in route file"
    - "Inngest event 'coordinadora/webhook.received' registered in events.ts type system"
  artifacts:
    - path: "src/app/api/webhooks/coordinadora/[env]/route.ts"
      provides: "Next.js 15 App Router POST handler — Pub/Sub receiver"
      exports: ["POST", "maxDuration", "dynamic", "runtime"]
    - path: "src/app/api/webhooks/coordinadora/__tests__/route.test.ts"
      provides: "Vitest suite covering 404/400/200 + inngest dispatch + domain layer mocking"
    - path: "src/inngest/events.ts"
      provides: "Type union extended with CoordinadoraWebhookEvents (consumed by Plan 09)"
      exports: ["CoordinadoraWebhookEvents"]
  key_links:
    - from: "route.ts POST"
      to: "@/lib/domain/carrier-events recordCoordinadoraEvent"
      via: "domain layer call (Regla 3)"
      pattern: "no direct supabase access in route"
    - from: "route.ts POST"
      to: "@/inngest/client inngest.send"
      via: "AWAITED dispatch only when newly inserted"
      pattern: "MEMORY: NEVER fire-and-forget inngest.send"
---

<objective>
Implement the App Router route handler at `app/api/webhooks/coordinadora/[env]/route.ts` (D-04, D-06). This is the public-facing endpoint that Coordinadora's Pub/Sub pushes events to.

Per D-08: receive → validate envelope → decode payload → resolve workspace via NIT → call domain recordCoordinadoraEvent → if newly inserted, dispatch Inngest event → return 200.

Per Pitfall 2: Next 15 `params` is `Promise` — must await.

Per Pitfall 3 / MEMORY: `inngest.send` MUST be awaited.

Per Regla 3 / D-23: route handler MUST NOT import `createAdminClient` directly; all persistence via `@/lib/domain/carrier-events.recordCoordinadoraEvent`.

Also extend `src/inngest/events.ts` to register the new event type `coordinadora/webhook.received` (consumed by Plan 09).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/coordinadora-api-integration/CONTEXT.md
@.planning/standalone/coordinadora-api-integration/RESEARCH.md
@.planning/standalone/coordinadora-api-integration/PATTERNS.md
@src/app/api/webhooks/whatsapp/route.ts
@src/app/api/v1/tools/[toolName]/route.ts
@src/inngest/client.ts
@src/inngest/events.ts
@src/lib/audit/logger.ts
@src/lib/carriers/coordinadora/pub-sub-envelope.ts
@src/lib/carriers/coordinadora/tenant.ts
@src/lib/domain/carrier-events.ts

<interfaces>
From src/lib/carriers/coordinadora (Plans 03+07):
```typescript
export function isPubSubEnvelope(value: unknown): value is PubSubEnvelope
export function decodePubSubPayload(envelope: PubSubEnvelope): CoordinadoraEvent | null
export function isEventWithNovedad(e: CoordinadoraEvent): e is CoordinadoraEventWithNovedad
export function resolveWorkspaceFromNit(nitCliente: string | null): string | null
```

From src/lib/domain/carrier-events.ts (Plan 06):
```typescript
export async function recordCoordinadoraEvent(
  ctx: DomainContext,
  params: RecordCoordinadoraEventParams,
): Promise<DomainResult<{ id: string; inserted: boolean }>>
```

From src/inngest/client.ts:
- `import { inngest } from '@/inngest/client'`
- `inngest.send({ name: '<event>', data: {...} })` — MUST be awaited
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend src/inngest/events.ts with CoordinadoraWebhookEvents</name>
  <files>src/inngest/events.ts</files>
  <read_first>
    - src/inngest/events.ts (full file — see AgentEvents type definition and any other unions)
    - .planning/standalone/coordinadora-api-integration/PATTERNS.md lines 503-547 (events.ts extension pattern)
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Pattern 5 lines 707-758 (event payload shape: env, workspaceId, eventRowId, trackingNumber, codigo, codigoEstado)
    - src/inngest/client.ts (see how events.ts types are consumed — likely passed via Inngest&lt;{events}&gt; generic)
  </read_first>
  <action>
    First inspect the file structure to find where the type union is combined / exported. Patterns to look for:

    - If file exports `type AgentEvents = {...}`, append a sibling `type CoordinadoraWebhookEvents = {...}`
    - If file exports a combined union (e.g. `type Events = AgentEvents & X`), add the new union to the combined export
    - If `src/inngest/client.ts` references the type generic `Inngest<{ events: AgentEvents }>`, also update that to include the new union

    Add this type union to `src/inngest/events.ts` (appended at the end of the file, before any combined export):

    ```ts
    // ============================================================================
    // Coordinadora webhook events (Standalone: coordinadora-api-integration)
    // Emitted by app/api/webhooks/coordinadora/[env]/route.ts after successful
    // domain insert. Consumed by src/inngest/functions/coordinadora-webhook-process.ts.
    // ============================================================================

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

    Then ensure the inngest client picks it up. Read `src/inngest/client.ts`:

    - If the client uses a combined type like `Inngest<{ events: AgentEvents }>`, change it to `Inngest<{ events: AgentEvents & CoordinadoraWebhookEvents }>` and add the import.
    - If client uses `(inngest.send as any)` cast pattern (per MEMORY note), the type system isn't enforced and we only need to add the type for documentation; verify by grep `as any` in client.ts.
    - If a combined `Events` type is exported, append `& CoordinadoraWebhookEvents`.

    Make whatever surgical edits are needed for the type to actually flow into the inngest client.

    Run `npx tsc --noEmit src/inngest/events.ts src/inngest/client.ts` to verify zero errors.

    Commit message: `feat(coordinadora-api): register coordinadora/webhook.received event type`
  </action>
  <verify>
    <automated>grep -c "coordinadora/webhook.received" src/inngest/events.ts | awk '{ exit ($1 &gt;= 1 ? 0 : 1) }' &amp;&amp; grep -q "CoordinadoraWebhookEvents" src/inngest/events.ts</automated>
  </verify>
  <acceptance_criteria>
    - `src/inngest/events.ts` exports `CoordinadoraWebhookEvents`
    - Event name `'coordinadora/webhook.received'` is referenced exactly once
    - Event payload has exact 6 fields: env, workspaceId, eventRowId, trackingNumber, codigo, codigoEstado
    - `src/inngest/client.ts` knows about the new event (either via combined union OR documented `as any` cast pattern with the new type imported)
    - `npx tsc --noEmit` shows no errors on the modified files
  </acceptance_criteria>
  <done>Event type registered. Route handler (Task 3) and Inngest function (Plan 09) can reference `'coordinadora/webhook.received'` safely.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Write route.test.ts (RED) covering all status codes + Inngest dispatch</name>
  <files>src/app/api/webhooks/coordinadora/__tests__/route.test.ts</files>
  <read_first>
    - src/app/api/webhooks/whatsapp/route.ts:108-179 (handler analog)
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Pattern 3 lines 412-589 (canonical implementation)
    - .planning/standalone/coordinadora-api-integration/PATTERNS.md lines 38-108 (route handler pattern + deviations)
    - src/lib/domain/__tests__/conversations.test.ts (vitest mocking style)
  </read_first>
  <behavior>
    - 404 on invalid env (e.g. `/coordinadora/staging`)
    - 400 on invalid JSON body
    - 400 on body that's not a PubSub envelope (`{ foo: 'bar' }`)
    - 200 + drop on base64/JSON decode failure (logged but no retry)
    - 200 + drop on unmatched nit_cliente
    - 200 + dispatch on valid + new insert (verify `inngest.send` called once with exact event payload)
    - 200 + NO dispatch on duplicate (verify `inngest.send` NOT called)
    - 500 on domain insert error
  </behavior>
  <action>
    Create `src/app/api/webhooks/coordinadora/__tests__/route.test.ts`:

    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest'
    import { NextRequest } from 'next/server'

    // Mock inngest client
    const inngestSendMock = vi.fn(async () => ({ ids: ['evt-test'] }))
    vi.mock('@/inngest/client', () => ({
      inngest: { send: inngestSendMock },
    }))

    // Mock domain layer
    const recordCoordinadoraEventMock = vi.fn()
    vi.mock('@/lib/domain/carrier-events', () => ({
      recordCoordinadoraEvent: (...args: unknown[]) => recordCoordinadoraEventMock(...args),
    }))

    // Mock tenant resolver — return Somnio workspace for known NIT
    vi.mock('@/lib/carriers/coordinadora/tenant', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/carriers/coordinadora/tenant')>()
      return actual
    })

    import { POST } from '@/app/api/webhooks/coordinadora/[env]/route'

    function buildRequest(body: unknown, env: string): { request: NextRequest; context: { params: Promise<{ env: string }> } } {
      const request = new NextRequest('http://localhost/api/webhooks/coordinadora/' + env, {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      })
      return { request, context: { params: Promise.resolve({ env }) } }
    }

    function envelopeFor(payload: unknown): unknown {
      return { message: { data: Buffer.from(JSON.stringify(payload)).toString('base64'), messageId: 'mid-1' } }
    }

    const PAYLOAD_BASE = {
      tracking_number: '12345678901',
      referencia: 'AA1',
      comment: 'ENTREGADA',
      codigo: '6',
      codigo_cliente: 'CLI',
      fecha: '2026-05-26',
      hora: '13:51:43.456818',
      anterior: '',
      referencia_anterior: '',
    }

    const PAYLOAD_NOVEDAD = {
      ...PAYLOAD_BASE,
      tracking_number: '12345678902',
      codigo: '801',
      codigo_estado: '5',
      desc_estado: 'EN REPARTO',
      nit_cliente: '902052328',
      div_cliente: '01',
      vinculo_guia: '',
    }

    beforeEach(() => {
      vi.clearAllMocks()
      recordCoordinadoraEventMock.mockResolvedValue({
        success: true,
        data: { id: 'event-uuid-new', inserted: true },
      })
    })

    describe('POST /api/webhooks/coordinadora/[env]', () => {
      it('404 on invalid env path param (D-06)', async () => {
        const { request, context } = buildRequest(envelopeFor(PAYLOAD_BASE), 'staging')
        const res = await POST(request, context)
        expect(res.status).toBe(404)
        expect(inngestSendMock).not.toHaveBeenCalled()
      })

      it('accepts env=test', async () => {
        const { request, context } = buildRequest(envelopeFor(PAYLOAD_BASE), 'test')
        const res = await POST(request, context)
        expect(res.status).toBe(200)
      })

      it('accepts env=prod', async () => {
        const { request, context } = buildRequest(envelopeFor(PAYLOAD_NOVEDAD), 'prod')
        const res = await POST(request, context)
        expect(res.status).toBe(200)
      })

      it('400 on invalid JSON body', async () => {
        const { request, context } = buildRequest('this is not { json', 'test')
        const res = await POST(request, context)
        expect(res.status).toBe(400)
      })

      it('400 on non-PubSub envelope shape (D-10 defense)', async () => {
        const { request, context } = buildRequest({ foo: 'bar' }, 'test')
        const res = await POST(request, context)
        expect(res.status).toBe(400)
      })

      it('200 + drop on base64/JSON decode failure (ACK to prevent eternal retry)', async () => {
        const { request, context } = buildRequest({ message: { data: 'not-valid-json-base64', messageId: 'm1' } }, 'test')
        // Buffer.from with non-base64 is lenient; we need raw JSON-broken payload:
        const bad = { message: { data: Buffer.from('not-json{').toString('base64'), messageId: 'm1' } }
        const r2 = buildRequest(bad, 'test')
        const res = await POST(r2.request, r2.context)
        expect(res.status).toBe(200)
        expect(inngestSendMock).not.toHaveBeenCalled()
      })

      it('200 + drop on unmatched nit_cliente (D-09)', async () => {
        const orphan = { ...PAYLOAD_NOVEDAD, nit_cliente: '999999999' }
        const { request, context } = buildRequest(envelopeFor(orphan), 'test')
        const res = await POST(request, context)
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.dropped).toBe('no_workspace_match')
        expect(inngestSendMock).not.toHaveBeenCalled()
        expect(recordCoordinadoraEventMock).not.toHaveBeenCalled()
      })

      it('200 + Inngest dispatch on valid + new insert', async () => {
        const { request, context } = buildRequest(envelopeFor(PAYLOAD_BASE), 'test')
        const res = await POST(request, context)
        expect(res.status).toBe(200)
        expect(recordCoordinadoraEventMock).toHaveBeenCalledTimes(1)
        expect(inngestSendMock).toHaveBeenCalledTimes(1)
        expect(inngestSendMock).toHaveBeenCalledWith({
          name: 'coordinadora/webhook.received',
          data: expect.objectContaining({
            env: 'test',
            workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490',
            eventRowId: 'event-uuid-new',
            trackingNumber: '12345678901',
            codigo: '6',
          }),
        })
      })

      it('200 + NO Inngest dispatch on duplicate webhook', async () => {
        recordCoordinadoraEventMock.mockResolvedValueOnce({
          success: true,
          data: { id: 'existing-event-uuid', inserted: false },
        })
        const { request, context } = buildRequest(envelopeFor(PAYLOAD_BASE), 'test')
        const res = await POST(request, context)
        expect(res.status).toBe(200)
        expect(inngestSendMock).not.toHaveBeenCalled()
      })

      it('500 on domain insert error (Pub/Sub retries)', async () => {
        recordCoordinadoraEventMock.mockResolvedValueOnce({
          success: false,
          error: 'DB connection refused',
        })
        const { request, context } = buildRequest(envelopeFor(PAYLOAD_BASE), 'test')
        const res = await POST(request, context)
        expect(res.status).toBe(500)
        expect(inngestSendMock).not.toHaveBeenCalled()
      })

      it('dispatches with codigoEstado from novedad payload', async () => {
        const { request, context } = buildRequest(envelopeFor(PAYLOAD_NOVEDAD), 'test')
        await POST(request, context)
        expect(inngestSendMock).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ codigoEstado: '5' }),
          })
        )
      })

      it('dispatches with codigoEstado=null for events without novedad', async () => {
        const { request, context } = buildRequest(envelopeFor(PAYLOAD_BASE), 'test')
        await POST(request, context)
        expect(inngestSendMock).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ codigoEstado: null }),
          })
        )
      })
    })
    ```

    Save the file. Tests will fail until Task 3.

    Commit message: `test(coordinadora-api): add webhook route test suite (RED)`
  </action>
  <verify>
    <automated>test -f src/app/api/webhooks/coordinadora/__tests__/route.test.ts &amp;&amp; grep -c "  it(" src/app/api/webhooks/coordinadora/__tests__/route.test.ts | awk '{ exit ($1 &gt;= 10 ? 0 : 1) }'</automated>
  </verify>
  <acceptance_criteria>
    - File `src/app/api/webhooks/coordinadora/__tests__/route.test.ts` exists
    - Contains 10+ `it(` cases covering 404/400/200 paths + Inngest dispatch + duplicate handling
    - Mocks `@/inngest/client` and `@/lib/domain/carrier-events`
    - File committed
  </acceptance_criteria>
  <done>Route test suite committed. Tests RED until Task 3.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Create route.ts (GREEN)</name>
  <files>src/app/api/webhooks/coordinadora/[env]/route.ts</files>
  <read_first>
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Pattern 3 lines 412-589 (canonical handler)
    - .planning/standalone/coordinadora-api-integration/PATTERNS.md lines 38-108 (route pattern + deviations)
    - src/app/api/v1/tools/[toolName]/route.ts:31-86 (Next 15 Promise params analog)
    - src/app/api/webhooks/whatsapp/route.ts:108-178 (raw-body validation analog)
    - src/inngest/client.ts (inngest import)
    - src/lib/audit/logger.ts (createModuleLogger)
    - src/app/api/webhooks/coordinadora/__tests__/route.test.ts (Task 2 — assertions to satisfy)
  </read_first>
  <behavior>
    - Validate env in `['test', 'prod']` literal union → 404 otherwise
    - Read body via `request.json()` — catch errors → 400
    - Validate envelope via `isPubSubEnvelope` → 400 otherwise
    - Decode via `decodePubSubPayload` → null returns 200 + dropped:'decode_failed'
    - Resolve workspace via `resolveWorkspaceFromNit(eventWithNovedad?.nit_cliente ?? null)` → null returns 200 + dropped:'no_workspace_match'
    - Call `recordCoordinadoraEvent` with full payload + source:'webhook:coordinadora'
    - On `success:false` → 500
    - On `success:true, inserted:true` → `await inngest.send` + 200
    - On `success:true, inserted:false` → 200 + NO inngest.send
    - Log info on each outcome with PII-redacted trackingNumber (last 4) + codigo
    - Export `maxDuration = 15`, `dynamic = 'force-dynamic'`, `runtime = 'nodejs'`
  </behavior>
  <action>
    Create `src/app/api/webhooks/coordinadora/[env]/route.ts` — VERBATIM (lightly adapted to use the module barrel):

    ```ts
    import { NextRequest, NextResponse } from 'next/server'
    import { createModuleLogger } from '@/lib/audit/logger'
    import { inngest } from '@/inngest/client'
    import {
      isPubSubEnvelope,
      decodePubSubPayload,
      isEventWithNovedad,
      resolveWorkspaceFromNit,
    } from '@/lib/carriers/coordinadora'
    import { recordCoordinadoraEvent } from '@/lib/domain/carrier-events'

    /**
     * Coordinadora webhook receiver — Pub/Sub push endpoint (D-04, D-06, D-08).
     *
     * Pipeline: validate env → parse body → validate envelope → decode payload →
     *           resolve workspace → idempotent domain insert → dispatch Inngest →
     *           return 200 ASAP (Pub/Sub ack deadline ~10s, D-08 lock).
     *
     * Standalone: coordinadora-api-integration
     */

    export const maxDuration = 15
    export const dynamic = 'force-dynamic'
    export const runtime = 'nodejs'

    const logger = createModuleLogger('coordinadora-webhook')

    const VALID_ENVS = ['test', 'prod'] as const
    type CoordEnv = (typeof VALID_ENVS)[number]

    function isValidEnv(value: string): value is CoordEnv {
      return (VALID_ENVS as readonly string[]).includes(value)
    }

    export async function POST(
      request: NextRequest,
      context: { params: Promise<{ env: string }> },
    ) {
      const startTime = Date.now()
      const { env } = await context.params

      // 1. Validate path param (D-06)
      if (!isValidEnv(env)) {
        logger.warn({ env }, 'invalid env path param')
        return NextResponse.json(
          { error: 'Invalid env. Expected test or prod.' },
          { status: 404 },
        )
      }

      // 2. Read body
      let rawBody: unknown
      try {
        rawBody = await request.json()
      } catch {
        logger.warn({ env }, 'invalid JSON body')
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
      }

      // 3. Validate Pub/Sub envelope (D-10 defense)
      if (!isPubSubEnvelope(rawBody)) {
        logger.warn({ env }, 'rejected: not a pub/sub envelope')
        return NextResponse.json(
          { error: 'Expected Pub/Sub envelope' },
          { status: 400 },
        )
      }

      // 4. Decode base64 → JSON. On failure ACK 200 + drop (avoid eternal retry).
      const event = decodePubSubPayload(rawBody)
      if (!event) {
        logger.warn(
          { env, messageId: rawBody.message.messageId },
          'payload decode failed — ack+drop',
        )
        return NextResponse.json(
          { ok: true, dropped: 'decode_failed' },
          { status: 200 },
        )
      }

      // 5. Resolve nit_cliente → workspace (D-09)
      const nitCliente = isEventWithNovedad(event) ? event.nit_cliente : null
      const workspaceId = resolveWorkspaceFromNit(nitCliente)
      if (!workspaceId) {
        logger.warn(
          {
            env,
            // D-28 PII redaction
            nitClienteLast4: nitCliente ? nitCliente.slice(-4) : null,
            trackingLast4: event.tracking_number.slice(-4),
          },
          'no workspace matches nit_cliente — ack+drop',
        )
        return NextResponse.json(
          { ok: true, dropped: 'no_workspace_match' },
          { status: 200 },
        )
      }

      // 6. Idempotent domain insert (Regla 3 / D-23)
      const insertResult = await recordCoordinadoraEvent(
        { workspaceId, source: 'webhook:coordinadora' },
        {
          env,
          trackingNumber: event.tracking_number,
          fecha: event.fecha,
          hora: event.hora,
          codigo: event.codigo,
          codigoEstado: isEventWithNovedad(event) ? event.codigo_estado : null,
          codigoNovedad: isEventWithNovedad(event) ? event.codigo : null,
          descEstado: isEventWithNovedad(event) ? event.desc_estado : null,
          comment: event.comment ?? null,
          referencia: event.referencia ?? null,
          nitCliente: isEventWithNovedad(event) ? event.nit_cliente : null,
          divCliente: isEventWithNovedad(event) ? event.div_cliente : null,
          vinculoGuia: isEventWithNovedad(event) ? event.vinculo_guia : null,
          rawPayload: event,
        },
      )

      if (!insertResult.success) {
        logger.error(
          {
            env,
            trackingLast4: event.tracking_number.slice(-4),
            error: insertResult.error,
          },
          'domain insert failed — return 500 for Pub/Sub retry',
        )
        return NextResponse.json(
          { error: 'Persistence failed' },
          { status: 500 },
        )
      }

      const wasNewlyInserted = insertResult.data?.inserted === true
      const eventRowId = insertResult.data?.id ?? ''

      // 7. Dispatch async downstream — ONLY if newly inserted (idempotent dispatch).
      //    AWAIT inngest.send (Pitfall 3 / MEMORY: NEVER fire-and-forget).
      if (wasNewlyInserted && eventRowId) {
        await inngest.send({
          name: 'coordinadora/webhook.received',
          data: {
            env,
            workspaceId,
            eventRowId,
            trackingNumber: event.tracking_number,
            codigo: event.codigo,
            codigoEstado: isEventWithNovedad(event) ? event.codigo_estado : null,
          },
        })
      }

      // 8. ACK 200
      logger.info(
        {
          env,
          trackingLast4: event.tracking_number.slice(-4),
          codigo: event.codigo,
          newlyInserted: wasNewlyInserted,
          durationMs: Date.now() - startTime,
        },
        'coordinadora webhook processed',
      )
      return NextResponse.json(
        { ok: true, newly_inserted: wasNewlyInserted },
        { status: 200 },
      )
    }
    ```

    Run tests: `npx vitest run src/app/api/webhooks/coordinadora/__tests__/route.test.ts` — expect 10+ tests green.

    Verify Regla 3: `grep -c "createAdminClient" src/app/api/webhooks/coordinadora/[env]/route.ts` returns 0.

    Verify PII redaction: `grep -E "tracking_number(?!.*slice|.*Last4)" src/app/api/webhooks/coordinadora/[env]/route.ts` should not show direct logging of full tracking_number in logger calls (only in domain call args, which is fine).

    Commit message: `feat(coordinadora-api): add webhook route handler (GREEN)`
  </action>
  <verify>
    <automated>npx vitest run src/app/api/webhooks/coordinadora/__tests__/route.test.ts 2&gt;&amp;1 | tail -8 | grep -E "Test Files\s+1 passed"</automated>
  </verify>
  <acceptance_criteria>
    - File `src/app/api/webhooks/coordinadora/[env]/route.ts` exists
    - Exports `POST`, `maxDuration`, `dynamic`, `runtime`
    - All 10+ Vitest cases pass
    - `grep -c "createAdminClient" src/app/api/webhooks/coordinadora/` returns 0 (Regla 3)
    - `grep -c "await inngest.send" src/app/api/webhooks/coordinadora/[env]/route.ts` returns 1 (Pitfall 3)
    - `grep -c "await context.params" src/app/api/webhooks/coordinadora/[env]/route.ts` returns 1 (Pitfall 2)
    - Logger calls use `trackingLast4` not full tracking_number (D-28 PII redaction)
    - Zero `any` types
  </acceptance_criteria>
  <done>Webhook receiver implemented + tested. Plan 09 Inngest function can consume `coordinadora/webhook.received` events.</done>
</task>

</tasks>

<verification>
- Webhook route test suite passes 10+
- Regla 3 grep clean
- Pitfall 2 + 3 satisfied (await params, await inngest.send)
- PII redaction enforced in logger calls
</verification>

<success_criteria>
1. `events.ts` extended, `route.ts` created, test suite passes (3 commits)
2. All 10+ route tests green
3. Inngest event type registered
4. D-04, D-06, D-08, D-10, D-23 all satisfied
</success_criteria>

<output>
After completion, create `.planning/standalone/coordinadora-api-integration/08-SUMMARY.md` documenting:
- Files created (events.ts edit + route.ts + test)
- Vitest pass count (route suite + ensure earlier suites still pass)
- Commit SHAs (3)
- Regla 3 grep + Pitfall 2 + Pitfall 3 verification outputs pasted
</output>

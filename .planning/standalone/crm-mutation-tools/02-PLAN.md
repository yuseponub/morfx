---
plan: 02
wave: 1
phase: standalone-crm-mutation-tools
depends_on:
  - 01
files_modified:
  - src/lib/agents/shared/crm-mutation-tools/types.ts
  - src/lib/agents/shared/crm-mutation-tools/helpers.ts
  - src/lib/agents/shared/crm-mutation-tools/contacts.ts
  - src/lib/agents/shared/crm-mutation-tools/index.ts
  - src/lib/agents/shared/crm-mutation-tools/__tests__/helpers.test.ts
  - src/lib/agents/shared/crm-mutation-tools/__tests__/contacts.test.ts
autonomous: true
requirements:
  - MUT-CT-01  # createContact (proves shape: idempotency-eligible + observability + re-hydration)
---

<objective>
Wave 1 — Module skeleton + helpers + first tool. Crear el factory `createCrmMutationTools(ctx)` con la pieza más compleja como prueba de patrón: `createContact` (idempotency-eligible + observability + re-hydration via getContactById). El resto de tools fan-out en Plan 03/04 sigue este molde.

Purpose: prueba que la triada (1) `withIdempotency` helper, (2) PII-redacted observability events, (3) `MutationResult<T>` discriminated union funcionan end-to-end con un único tool antes de replicar el patrón.

Output: 6 archivos. Tool `createContact` registrable en cualquier agente; helpers reutilizables por Plans 03/04.
</objective>

<context>
@./CLAUDE.md
@.planning/standalone/crm-mutation-tools/CONTEXT.md
@.planning/standalone/crm-mutation-tools/RESEARCH.md
</context>

<interfaces>
<!-- Contracts that downstream plans (03/04) consume from this module. Defined here. -->

From src/lib/agents/shared/crm-mutation-tools/types.ts (NEW in this plan):
```typescript
export interface CrmMutationToolsContext {
  workspaceId: string
  invoker?: string
}

export type ResourceType =
  | 'contact' | 'order' | 'note' | 'task'
  | 'tag' | 'pipeline' | 'stage' | 'template' | 'user'

export type MutationResult<T> =
  | { status: 'executed'; data: T }
  | { status: 'resource_not_found'; error: { code: string; message?: string; missing: { resource: ResourceType; id: string } } }
  | { status: 'stage_changed_concurrently'; error: { code: 'stage_changed_concurrently'; expectedStageId: string; actualStageId: string | null } }
  | { status: 'validation_error'; error: { code: string; message: string; field?: string } }
  | { status: 'duplicate'; data: T }
  | { status: 'workspace_mismatch'; error: { code: 'workspace_mismatch' } }
  | { status: 'error'; error: { code: string; message?: string } }
```

From src/lib/agents/shared/crm-mutation-tools/helpers.ts (NEW in this plan):
```typescript
export function withIdempotency<TResult>(
  domainCtx: DomainContext,
  ctx: CrmMutationToolsContext,
  toolName: string,
  key: string | undefined,
  doMutate: () => Promise<{ id: string; data: TResult }>,
  rehydrate: (id: string) => Promise<TResult | null>,
): Promise<{ status: 'executed' | 'duplicate'; data: TResult; idempotencyKeyHit: boolean }>

export function emitInvoked(base: MutationEventBase, redactedInput: Record<string, unknown>): void
export function emitCompleted(base: MutationEventBase, payload: { resultStatus: string; latencyMs: number; resultId?: string; idempotencyKeyHit?: boolean }): void
export function emitFailed(base: MutationEventBase, payload: { errorCode: string; latencyMs: number }): void

export function phoneSuffix(raw: string): string
export function bodyTruncate(s: string, max?: number): string
export function emailRedact(raw: string): string
export function idSuffix(uuid: string): string

export function mapDomainError(message: string): MutationResult<never>['status']
```

From src/lib/agents/shared/crm-mutation-tools/index.ts (NEW in this plan):
```typescript
export function createCrmMutationTools(ctx: CrmMutationToolsContext): {
  createContact: ReturnType<typeof tool>
  // (more tools spread in Plan 03 + 04)
}
```
</interfaces>

<tasks>

<task type="auto" tdd="false">
  <name>Task 2.1: Create `types.ts` with MutationResult<T> + ResourceType</name>
  <read_first>
    - .planning/standalone/crm-mutation-tools/RESEARCH.md:323-348 (Pattern 2 — types verbatim)
    - src/lib/agents/shared/crm-query-tools/types.ts (mirror file structure)
    - src/lib/agents/crm-writer/types.ts:43-52 (ResourceType reference — DO NOT IMPORT, mirror only per Pitfall 10)
  </read_first>
  <action>
    Crear `src/lib/agents/shared/crm-mutation-tools/types.ts` con el contenido EXACTO del bloque en `<interfaces>` arriba (extraído de RESEARCH § Pattern 2). Imports requeridos:

    ```typescript
    import type { ContactDetail } from '@/lib/domain/contacts'
    import type { OrderDetail } from '@/lib/domain/orders'
    ```

    Note: `ContactDetail` y `OrderDetail` deben existir en domain (verificados en RESEARCH § Domain Layer Audit). Si `ContactDetail` no es exportado todavía, **NO modificar domain en este task** — usar `Awaited<ReturnType<typeof getContactById>>` como tipo derivado en el tool específico (Task 2.4). El plan futuro 03 extenderá si necesario.

    DO NOT import `ResourceType` from `crm-writer/types` — duplicate the union here (Pitfall 10).
  </action>
  <verify>
    <automated>test -f src/lib/agents/shared/crm-mutation-tools/types.ts && grep -c "MutationResult\|ResourceType\|CrmMutationToolsContext" src/lib/agents/shared/crm-mutation-tools/types.ts</automated>
  </verify>
  <acceptance_criteria>
    - File exists with `MutationResult<T>` discriminated union (7 statuses).
    - `grep -c "stage_changed_concurrently" src/lib/agents/shared/crm-mutation-tools/types.ts` ≥ 2 (status + error code).
    - `grep -c "workspace_mismatch" src/lib/agents/shared/crm-mutation-tools/types.ts` ≥ 2.
    - `grep -E "from '@/lib/agents/crm-writer" src/lib/agents/shared/crm-mutation-tools/types.ts` returns 0 matches (Pitfall 10).
    - `npx tsc --noEmit -p .` zero errors in this file.
  </acceptance_criteria>
  <done>Types listos.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2.2: Create `helpers.ts` (withIdempotency + observability emitters + PII redaction + mapDomainError)</name>
  <read_first>
    - .planning/standalone/crm-mutation-tools/RESEARCH.md:382-468 (Pattern 4 idempotency helper + Pattern 5 observability wrapper)
    - .planning/standalone/crm-mutation-tools/RESEARCH.md:679-728 (full helper flow)
    - .planning/standalone/crm-mutation-tools/RESEARCH.md:1018-1024 (Pitfall 7 — mapDomainError regex map)
    - src/lib/agents/shared/crm-query-tools/helpers.ts (mirror structure)
    - src/lib/observability/index.ts (verify `getCollector` export)
  </read_first>
  <action>
    Crear `src/lib/agents/shared/crm-mutation-tools/helpers.ts`. Implementación completa:

    ```typescript
    import { getCollector } from '@/lib/observability'
    import {
      getIdempotencyRow,
      insertIdempotencyRow,
    } from '@/lib/domain/crm-mutation-idempotency'
    import type { DomainContext } from '@/lib/domain/types'
    import type { CrmMutationToolsContext, MutationResult } from './types'

    /** Last 4 digits only — PII redaction for phone in observability payloads. */
    export function phoneSuffix(raw: string): string {
      return raw.replace(/\D/g, '').slice(-4)
    }

    /** Truncate note bodies to N chars + ellipsis. */
    export function bodyTruncate(s: string, max = 200): string {
      return s.length > max ? s.slice(0, max) + '…' : s
    }

    /** Mask local-part of email: `joserome…@gmail.com`. */
    export function emailRedact(raw: string): string {
      const [local, domain] = raw.split('@')
      if (!domain) return '<invalid-email>'
      const head = local.slice(0, 3)
      return `${head}…@${domain}`
    }

    /** Last 8 chars of UUID — log readability. */
    export function idSuffix(uuid: string): string {
      return uuid.slice(-8)
    }

    /** Map domain-layer Spanish error strings to MutationResult statuses (Pitfall 7). */
    export function mapDomainError(message: string): MutationResult<never>['status'] {
      if (/^stage_changed_concurrently$/i.test(message)) return 'stage_changed_concurrently'
      if (/no encontrad[oa]/i.test(message)) return 'resource_not_found'
      if (/requerido|obligatori[oa]|invalid|inválid[oa]/i.test(message)) return 'validation_error'
      return 'error'
    }

    export interface MutationEventBase {
      tool: string
      workspaceId: string
      invoker?: string
    }

    export function emitInvoked(base: MutationEventBase, redactedInput: Record<string, unknown>): void {
      getCollector()?.recordEvent('pipeline_decision', 'crm_mutation_invoked', {
        ...base,
        inputRedacted: redactedInput,
      })
    }

    export function emitCompleted(
      base: MutationEventBase,
      payload: { resultStatus: string; latencyMs: number; resultId?: string; idempotencyKeyHit?: boolean },
    ): void {
      getCollector()?.recordEvent('pipeline_decision', 'crm_mutation_completed', { ...base, ...payload })
    }

    export function emitFailed(
      base: MutationEventBase,
      payload: { errorCode: string; latencyMs: number },
    ): void {
      getCollector()?.recordEvent('pipeline_decision', 'crm_mutation_failed', { ...base, ...payload })
    }

    /**
     * Wrap a creation mutation with idempotency-key dedup.
     * Returns { status: 'executed' | 'duplicate', data, idempotencyKeyHit }.
     *
     * Flow:
     *  - No key → execute + return (no dedup).
     *  - Key + existing row → re-hydrate via rehydrate(resultId); fallback to result_payload.
     *  - Key + race lost on insert → re-fetch winner row + re-hydrate.
     *
     * D-09: ALWAYS prefer fresh re-hydration over cached result_payload.
     */
    export async function withIdempotency<TResult>(
      domainCtx: DomainContext,
      ctx: CrmMutationToolsContext,
      toolName: string,
      key: string | undefined,
      doMutate: () => Promise<{ id: string; data: TResult }>,
      rehydrate: (id: string) => Promise<TResult | null>,
    ): Promise<{ status: 'executed' | 'duplicate'; data: TResult; idempotencyKeyHit: boolean }> {
      if (!key) {
        const { data } = await doMutate()
        return { status: 'executed', data, idempotencyKeyHit: false }
      }

      // 1) Lookup
      const lookup = await getIdempotencyRow(domainCtx, { toolName, key })
      if (lookup.success && lookup.data) {
        const fresh = await rehydrate(lookup.data.resultId)
        return {
          status: 'duplicate',
          data: fresh ?? (lookup.data.resultPayload as TResult),
          idempotencyKeyHit: true,
        }
      }

      // 2) Execute
      const { id, data } = await doMutate()

      // 3) Store with ON CONFLICT DO NOTHING
      const stored = await insertIdempotencyRow(domainCtx, {
        toolName,
        key,
        resultId: id,
        resultPayload: data,
      })

      // 3a) Race detected — winner already wrote
      if (stored.success && stored.data && !stored.data.inserted) {
        const winner = await getIdempotencyRow(domainCtx, { toolName, key })
        if (winner.success && winner.data) {
          const fresh = await rehydrate(winner.data.resultId)
          return {
            status: 'duplicate',
            data: fresh ?? (winner.data.resultPayload as TResult),
            idempotencyKeyHit: true,
          }
        }
      }

      return { status: 'executed', data, idempotencyKeyHit: false }
    }
    ```

    **CRITICAL** — verify NO `createAdminClient` or `@supabase/supabase-js` imports in this file.
  </action>
  <verify>
    <automated>test -f src/lib/agents/shared/crm-mutation-tools/helpers.ts && grep -E "createAdminClient|@supabase/supabase-js" src/lib/agents/shared/crm-mutation-tools/helpers.ts | grep -v "^[[:space:]]*//\|^[[:space:]]*\*" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - File exists with 9 named exports: `phoneSuffix`, `bodyTruncate`, `emailRedact`, `idSuffix`, `mapDomainError`, `emitInvoked`, `emitCompleted`, `emitFailed`, `withIdempotency` (+ types `MutationEventBase`).
    - `grep -E "createAdminClient|@supabase/supabase-js" src/lib/agents/shared/crm-mutation-tools/helpers.ts` returns 0 non-comment matches (Regla 3 — D-pre-02).
    - `grep -c "phoneSuffix\|bodyTruncate\|emailRedact" src/lib/agents/shared/crm-mutation-tools/helpers.ts` ≥ 3 (PII redaction).
    - `npx tsc --noEmit -p .` zero errors in this file.
  </acceptance_criteria>
  <done>Helpers reutilizables listos.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2.3: Unit tests for helpers — withIdempotency + mapDomainError</name>
  <read_first>
    - .planning/standalone/crm-mutation-tools/RESEARCH.md:382-468 (helper expected behaviors)
    - src/lib/agents/shared/crm-query-tools/__tests__/helpers.test.ts (sibling test pattern, if exists; otherwise mirror contacts.test.ts vi.hoisted shape)
    - src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts:1-110 (vi.hoisted + mock pattern)
  </read_first>
  <behavior>
    - Test 1: `withIdempotency` without key → calls `doMutate` once, returns `{status:'executed', idempotencyKeyHit:false}`.
    - Test 2: `withIdempotency` with key + existing row → calls `rehydrate(resultId)`, returns `{status:'duplicate', idempotencyKeyHit:true}` with fresh data.
    - Test 3: `withIdempotency` with key + existing row + rehydrate returns null → falls back to `resultPayload`, still `duplicate`.
    - Test 4: `withIdempotency` with key + insert race (inserted=false) → re-fetches winner + rehydrates, `duplicate`.
    - Test 5: `withIdempotency` with key + clean insert (inserted=true) → returns `executed`.
    - Test 6: `mapDomainError("Pedido no encontrado en este workspace")` returns `'resource_not_found'`.
    - Test 7: `mapDomainError("stage_changed_concurrently")` returns `'stage_changed_concurrently'`.
    - Test 8: `mapDomainError("Campo nombre es requerido")` returns `'validation_error'`.
    - Test 9: `mapDomainError("Some random failure")` returns `'error'`.
  </behavior>
  <action>
    Crear `src/lib/agents/shared/crm-mutation-tools/__tests__/helpers.test.ts` con 9 tests cubriendo los behaviors arriba. Use `vi.hoisted` to declare mocks:

    ```typescript
    const { getIdempotencyRowMock, insertIdempotencyRowMock } = vi.hoisted(() => ({
      getIdempotencyRowMock: vi.fn(),
      insertIdempotencyRowMock: vi.fn(),
    }))

    vi.mock('@/lib/domain/crm-mutation-idempotency', () => ({
      getIdempotencyRow: getIdempotencyRowMock,
      insertIdempotencyRow: insertIdempotencyRowMock,
    }))
    ```

    Use `beforeEach(() => { getIdempotencyRowMock.mockReset(); ... })`.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/shared/crm-mutation-tools/__tests__/helpers.test.ts 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - Test file exists; vitest reports 9 tests passing.
    - All 4 `withIdempotency` paths covered (no-key, lookup-hit-fresh, lookup-hit-fallback, race).
    - `mapDomainError` covered for all 4 status branches.
  </acceptance_criteria>
  <done>Helpers verified by unit tests.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2.4: Implement `contacts.ts` with `createContact` (proves shape)</name>
  <read_first>
    - .planning/standalone/crm-mutation-tools/RESEARCH.md:1092-1101 (tool template)
    - .planning/standalone/crm-mutation-tools/RESEARCH.md:572-587 (zod schema pattern; createOrder example shows shape)
    - src/lib/agents/shared/crm-query-tools/contacts.ts:46-167 (mirror tool structure)
    - src/lib/domain/contacts.ts:95-188 (createContact signature) — verify input/output
    - src/lib/domain/contacts.ts (find getContactById signature) — re-hydration target
  </read_first>
  <behavior>
    - Test 1: createContact happy path — domain returns `{success:true, data:{contactId}}`, getContactById returns `ContactDetail` → result `{status:'executed', data:ContactDetail}`.
    - Test 2: createContact with idempotencyKey, first call → `executed`. Second call same key → `duplicate` + same contact ID.
    - Test 3: createContact validation_error — domain returns `{success:false, error:"Phone es requerido"}` → `{status:'validation_error', error:{code:'validation_error', message:'Phone es requerido'}}`.
    - Test 4: createContact unexpected error — domain returns `{success:false, error:"db connection lost"}` → `{status:'error'}`.
    - Test 5: observability — `recordEventMock.mock.calls.map(c=>c[1])` includes `crm_mutation_invoked` + `crm_mutation_completed` (or `_failed`).
    - Test 6: PII redaction — observability `inputRedacted` contains `phoneSuffix: '4567'` not full phone, `email: 'jos…@gmail.com'` if email provided.
  </behavior>
  <action>
    1. Crear `src/lib/agents/shared/crm-mutation-tools/contacts.ts`:

    ```typescript
    import { tool } from 'ai'
    import { z } from 'zod'
    import {
      createContact as domainCreateContact,
      getContactById,
    } from '@/lib/domain/contacts'
    import type { ContactDetail } from '@/lib/domain/contacts'  // adjust if not exported — derive via Awaited<ReturnType>
    import { createModuleLogger } from '@/lib/audit/logger'
    import type { CrmMutationToolsContext, MutationResult } from './types'
    import {
      withIdempotency,
      emitInvoked,
      emitCompleted,
      emitFailed,
      phoneSuffix,
      emailRedact,
      mapDomainError,
    } from './helpers'

    const logger = createModuleLogger('crm-mutation-tools.contacts')

    /**
     * BLOCKER invariant: NEVER call deleteContact from this module.
     * Soft-delete only via archived_at (Pitfall 4 — D-pre-04).
     * Workspace ALWAYS from ctx — never input (Pitfall 2 — D-pre-03).
     */
    export function makeContactMutationTools(ctx: CrmMutationToolsContext) {
      return {
        createContact: tool({
          description:
            'Crea un nuevo contacto en el workspace del agente. Idempotency-key opcional para evitar duplicados en reintentos.',
          inputSchema: z.object({
            name: z.string().min(1).optional(),
            phone: z.string().min(7).optional(),
            email: z.string().email().optional(),
            tags: z.array(z.string().uuid()).optional(),
            customFields: z.record(z.string(), z.unknown()).optional(),
            idempotencyKey: z.string().min(1).max(128).optional(),
          }).refine(
            (i) => Boolean(i.name || i.phone || i.email),
            { message: 'Al menos uno de name/phone/email es requerido' },
          ),
          execute: async (input): Promise<MutationResult<ContactDetail>> => {
            const startedAt = Date.now()
            const base = { tool: 'createContact', workspaceId: ctx.workspaceId, invoker: ctx.invoker }
            emitInvoked(base, {
              ...(input.phone ? { phoneSuffix: phoneSuffix(input.phone) } : {}),
              ...(input.email ? { email: emailRedact(input.email) } : {}),
              ...(input.name ? { hasName: true } : {}),
              hasIdempotencyKey: Boolean(input.idempotencyKey),
            })

            const domainCtx = { workspaceId: ctx.workspaceId }

            try {
              const result = await withIdempotency<ContactDetail>(
                domainCtx,
                ctx,
                'createContact',
                input.idempotencyKey,
                async () => {
                  const created = await domainCreateContact(domainCtx, {
                    name: input.name ?? null,
                    phone: input.phone ?? null,
                    email: input.email ?? null,
                    tags: input.tags ?? [],
                    customFields: input.customFields ?? {},
                  })
                  if (!created.success || !created.data) {
                    // Forensics: log a structured warning when the domain claims success but data is missing
                    // (this should never happen per domain contract — log helps surface contract violations).
                    if (created.success && !created.data) {
                      logger.error({ tool: 'createContact' }, 'created.success=true but data is null — domain contract violation')
                    }
                    // throw to bubble up to outer catch where mapDomainError runs
                    throw new Error(created.success ? 'createContact returned no data' : created.error)
                  }
                  const detail = await getContactById(domainCtx, { contactId: created.data.contactId })
                  if (!detail.success || !detail.data) {
                    throw new Error(detail.success ? 'Contacto no encontrado tras crear' : detail.error)
                  }
                  return { id: created.data.contactId, data: detail.data }
                },
                async (id) => {
                  const detail = await getContactById(domainCtx, { contactId: id })
                  return detail.success ? detail.data : null
                },
              )

              emitCompleted(base, {
                resultStatus: result.status,
                latencyMs: Date.now() - startedAt,
                resultId: result.data?.id,
                idempotencyKeyHit: result.idempotencyKeyHit,
              })
              return { status: result.status, data: result.data }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              const mapped = mapDomainError(message)
              logger.warn?.({ err: message, tool: 'createContact' }, 'createContact failed')
              emitFailed(base, { errorCode: mapped, latencyMs: Date.now() - startedAt })

              if (mapped === 'resource_not_found') {
                return {
                  status: 'resource_not_found',
                  error: { code: 'contact_not_found', message, missing: { resource: 'contact', id: '' } },
                }
              }
              if (mapped === 'validation_error') {
                return { status: 'validation_error', error: { code: 'validation_error', message } }
              }
              return { status: 'error', error: { code: 'create_contact_failed', message } }
            }
          },
        }),
      }
    }
    ```

    2. Crear `src/lib/agents/shared/crm-mutation-tools/index.ts`:

    ```typescript
    import { makeContactMutationTools } from './contacts'
    import type { CrmMutationToolsContext } from './types'

    export function createCrmMutationTools(ctx: CrmMutationToolsContext) {
      return {
        ...makeContactMutationTools(ctx),
        // Plans 03 + 04 spread additional factories here.
      }
    }

    export type { CrmMutationToolsContext, MutationResult, ResourceType } from './types'
    ```

    3. Crear `src/lib/agents/shared/crm-mutation-tools/__tests__/contacts.test.ts` con 6 tests cubriendo behaviors arriba. Mock targets: `@/lib/domain/contacts` (createContact + getContactById), `@/lib/domain/crm-mutation-idempotency`, `@/lib/observability` (`getCollector` returning `{ recordEvent: vi.fn() }`).

    Use the two-step cast pattern (Pitfall 3):
    ```typescript
    const tools = makeContactMutationTools({ workspaceId: 'ws-1', invoker: 'test' })
    const result = await (tools.createContact as unknown as { execute: (input: unknown) => Promise<unknown> })
      .execute({ name: 'Alice', phone: '+573001234567' })
    ```
  </action>
  <verify>
    <automated>test -f src/lib/agents/shared/crm-mutation-tools/contacts.ts && test -f src/lib/agents/shared/crm-mutation-tools/index.ts && npx vitest run src/lib/agents/shared/crm-mutation-tools/__tests__/contacts.test.ts 2>&1 | tail -15</automated>
  </verify>
  <acceptance_criteria>
    - 3 source files exist: contacts.ts, index.ts, __tests__/contacts.test.ts.
    - `grep -E "createAdminClient|@supabase/supabase-js" src/lib/agents/shared/crm-mutation-tools/contacts.ts | grep -v "^[[:space:]]*//\|^[[:space:]]*\*" | wc -l` == 0 (Regla 3).
    - `grep -E "workspaceId.*z\\.string|workspaceId.*\\.uuid" src/lib/agents/shared/crm-mutation-tools/contacts.ts` returns 0 (Pitfall 2).
    - `grep "deleteContact\b" src/lib/agents/shared/crm-mutation-tools/contacts.ts` returns 0 (Pitfall 4).
    - 6 tests passing in contacts.test.ts (`vitest run ... --reporter=basic` shows `6 passed`).
    - Two-step cast `as unknown as { execute` appears ≥ 1 time in contacts.test.ts.
  </acceptance_criteria>
  <done>Pattern proven con createContact + idempotency + observability + redaction.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2.5: Commit + push (Regla 1)</name>
  <action>
    ```
    git add src/lib/agents/shared/crm-mutation-tools/
    git commit -m "$(cat <<'EOF'
    feat(crm-mutation-tools): wave 1 — module skeleton + helpers + createContact

    - types.ts (MutationResult<T> 7-status union + ResourceType + Context).
    - helpers.ts (withIdempotency + emit{Invoked,Completed,Failed} + phoneSuffix + bodyTruncate + emailRedact + mapDomainError).
    - contacts.ts createContact tool (idempotency-eligible + observability + re-hydration via getContactById).
    - index.ts factory aggregator (Plans 03/04 spread más tools).
    - 9 tests helpers.test.ts (withIdempotency 4 paths + mapDomainError 4 branches).
    - 6 tests contacts.test.ts (createContact happy + dup + validation + error + observability + PII).

    Standalone: crm-mutation-tools Plan 02 (Wave 1).
    Refs MUT-CT-01.

    Co-authored-by: Claude <noreply@anthropic.com>
    EOF
    )"
    git push origin main
    ```
  </action>
  <verify>
    <automated>git log -1 --oneline | grep -i "crm-mutation-tools.*wave 1"</automated>
  </verify>
  <acceptance_criteria>
    - Commit pushed; working tree clean.
  </acceptance_criteria>
  <done>Wave 1 cierra. Plans 03 + 04 unblocked en paralelo.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Agent loop → Tool execute() | Tool trusts ctx.workspaceId from agent invocation |
| Tool → Domain layer | DomainContext built only from ctx.workspaceId; never from input |
| Tool → Observability collector | PII-redacted payload only |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-02-01 | Tampering | workspaceId in input schema | HIGH | mitigate | inputSchema EXPLICITLY excludes workspaceId. Grep gate in acceptance criteria. (Pitfall 2 — D-pre-03) |
| T-02-02 | Information Disclosure | Phone/email in observability | MED | mitigate | phoneSuffix (last 4) + emailRedact (first 3 + masked local). Verified in Test 6. |
| T-02-03 | Tampering | Idempotency race double-create | MED | mitigate | withIdempotency uses ON CONFLICT DO NOTHING + race-detect re-fetch (Pattern 4 + Pitfall 5). Tests 4 + 5 cover. |
| T-02-04 | Repudiation | createContact succeeds without observability | LOW | mitigate | emitInvoked/emitCompleted/emitFailed wrapping; test 5 asserts collector calls. |
| T-02-05 | Elevation of Privilege | Module imports createAdminClient | HIGH | mitigate | Regla 3 — domain layer is sole admin client user. Grep gate in acceptance criteria (zero matches). |
</threat_model>

<must_haves>
truths:
  - "createCrmMutationTools(ctx) is a factory exporting tools by entity domain."
  - "MutationResult<T> discriminated union has exactly 7 statuses including stage_changed_concurrently and duplicate."
  - "withIdempotency dedup helper handles no-key, lookup-hit, race-loss without double-create."
  - "createContact tool emits 3 observability events with PII-redacted payload."
  - "Module has zero createAdminClient or @supabase/supabase-js imports (Regla 3)."
artifacts:
  - path: "src/lib/agents/shared/crm-mutation-tools/types.ts"
    provides: "MutationResult<T> + ResourceType + Context"
    exports: ["MutationResult", "ResourceType", "CrmMutationToolsContext"]
  - path: "src/lib/agents/shared/crm-mutation-tools/helpers.ts"
    provides: "withIdempotency + observability emitters + PII redactors + mapDomainError"
    exports: ["withIdempotency", "emitInvoked", "emitCompleted", "emitFailed", "phoneSuffix", "bodyTruncate", "emailRedact", "idSuffix", "mapDomainError"]
  - path: "src/lib/agents/shared/crm-mutation-tools/contacts.ts"
    provides: "makeContactMutationTools(ctx) factory exporting createContact"
    exports: ["makeContactMutationTools"]
  - path: "src/lib/agents/shared/crm-mutation-tools/index.ts"
    provides: "createCrmMutationTools(ctx) aggregator"
    exports: ["createCrmMutationTools"]
key_links:
  - from: "src/lib/agents/shared/crm-mutation-tools/contacts.ts"
    to: "src/lib/domain/contacts.ts"
    via: "imports createContact + getContactById"
    pattern: "from '@/lib/domain/contacts'"
  - from: "src/lib/agents/shared/crm-mutation-tools/helpers.ts"
    to: "src/lib/domain/crm-mutation-idempotency.ts"
    via: "imports getIdempotencyRow + insertIdempotencyRow"
    pattern: "from '@/lib/domain/crm-mutation-idempotency'"
</must_haves>
</content>
</invoke>
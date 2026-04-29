/**
 * CRM Mutation Tools — internal helpers.
 *
 * Standalone crm-mutation-tools Wave 1 (Plan 02).
 *
 * BLOCKER invariant (Regla 3 / D-pre-02): this file MUST NOT import
 * createAdminClient or @supabase/supabase-js. Domain layer is the SOLE writer
 * (verified via grep gate in plan acceptance criteria).
 *
 * Exports:
 *   - withIdempotency: lookup-then-execute-then-store wrapper for creation tools (Pattern 4).
 *   - emitInvoked / emitCompleted / emitFailed: observability event emitters (Pattern 5).
 *   - phoneSuffix / bodyTruncate / emailRedact / idSuffix: PII redactors for observability payloads.
 *   - mapDomainError: maps domain-layer Spanish error strings to MutationResult statuses (Pitfall 7).
 *
 * D-09 (re-hydration rule): always prefer fresh re-fetch via rehydrate(resultId)
 * over cached result_payload. The payload is a tombstone for crash-recovery only.
 */

import { getCollector } from '@/lib/observability'
import {
  getIdempotencyRow,
  insertIdempotencyRow,
} from '@/lib/domain/crm-mutation-idempotency'
import type { DomainContext } from '@/lib/domain/types'
import type { CrmMutationToolsContext, MutationResult } from './types'

// ============================================================================
// PII Redaction Helpers
// ============================================================================

/** Last 4 digits only — PII redaction for phone in observability payloads. */
export function phoneSuffix(raw: string): string {
  return raw.replace(/\D/g, '').slice(-4)
}

/** Truncate note bodies to N chars + ellipsis. Used for addContactNote/addOrderNote. */
export function bodyTruncate(s: string, max = 200): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}

/**
 * Mask local-part of email: `joserome…@gmail.com`.
 * Returns '<invalid-email>' when input has no '@'.
 */
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

// ============================================================================
// Domain Error → MutationResult Status Mapping (Pitfall 7)
// ============================================================================

/**
 * Map domain-layer Spanish error strings to MutationResult statuses.
 *
 * Rules (in order, first match wins):
 *   1. "stage_changed_concurrently" (verbatim, Standalone crm-stage-integrity D-06) → 'stage_changed_concurrently'
 *   2. /no encontrad[oa]/i (e.g. "Contacto no encontrado", "Pedido no encontrado")  → 'resource_not_found'
 *   3. /requerido|obligatori[oa]|invalid|inválid[oa]/i (e.g. "Telefono invalido")    → 'validation_error'
 *   4. fallback                                                                     → 'error'
 */
export function mapDomainError(message: string): MutationResult<never>['status'] {
  if (/^stage_changed_concurrently$/i.test(message)) return 'stage_changed_concurrently'
  if (/no encontrad[oa]/i.test(message)) return 'resource_not_found'
  if (/requerido|obligatori[oa]|invalid|inválid[oa]/i.test(message)) return 'validation_error'
  return 'error'
}

// ============================================================================
// Observability Emitters
// ============================================================================

export interface MutationEventBase {
  tool: string
  workspaceId: string
  invoker?: string
}

export function emitInvoked(
  base: MutationEventBase,
  redactedInput: Record<string, unknown>,
): void {
  getCollector()?.recordEvent('pipeline_decision', 'crm_mutation_invoked', {
    ...base,
    inputRedacted: redactedInput,
  })
}

export function emitCompleted(
  base: MutationEventBase,
  payload: {
    resultStatus: string
    latencyMs: number
    resultId?: string
    idempotencyKeyHit?: boolean
  },
): void {
  getCollector()?.recordEvent('pipeline_decision', 'crm_mutation_completed', {
    ...base,
    ...payload,
  })
}

export function emitFailed(
  base: MutationEventBase,
  payload: { errorCode: string; latencyMs: number },
): void {
  getCollector()?.recordEvent('pipeline_decision', 'crm_mutation_failed', {
    ...base,
    ...payload,
  })
}

// ============================================================================
// withIdempotency — creation-tool wrapper (Pattern 4)
// ============================================================================

/**
 * Wrap a creation mutation with idempotency-key dedup.
 *
 * Returns `{ status: 'executed' | 'duplicate', data, idempotencyKeyHit }`.
 *
 * Flow:
 *   - No key → execute + return (no dedup).
 *   - Key + existing row → re-hydrate via rehydrate(resultId); fallback to result_payload.
 *   - Key + race lost on insert (inserted=false) → re-fetch winner row + re-hydrate.
 *
 * D-09: ALWAYS prefer fresh re-hydration over cached result_payload.
 *
 * @param domainCtx  DomainContext for the idempotency table queries (workspace-scoped).
 * @param ctx        Tool context (currently unused inside helper — reserved for future invoker logging).
 * @param toolName   Tool name (e.g. 'createContact') used as part of the dedup key.
 * @param key        Caller-provided idempotency key. When undefined, helper short-circuits.
 * @param doMutate   Performs the actual creation; must return `{ id, data }` on success.
 * @param rehydrate  Fetches fresh entity by id; returns null when entity is gone.
 */
export async function withIdempotency<TResult>(
  domainCtx: DomainContext,
  // ctx is part of the public helper signature for symmetry with future
  // invoker-aware logging; underscore-prefix marks unused without TS error.
  _ctx: CrmMutationToolsContext,
  toolName: string,
  key: string | undefined,
  doMutate: () => Promise<{ id: string; data: TResult }>,
  rehydrate: (id: string) => Promise<TResult | null>,
): Promise<{
  status: 'executed' | 'duplicate'
  data: TResult
  idempotencyKeyHit: boolean
}> {
  // No key → execute, no dedup.
  if (!key) {
    const { data } = await doMutate()
    return { status: 'executed', data, idempotencyKeyHit: false }
  }

  // 1. Lookup existing row.
  const lookup = await getIdempotencyRow(domainCtx, { toolName, key })
  if (lookup.success && lookup.data) {
    const fresh = await rehydrate(lookup.data.resultId)
    return {
      status: 'duplicate',
      data: fresh ?? (lookup.data.resultPayload as TResult),
      idempotencyKeyHit: true,
    }
  }

  // 2. Execute the actual mutation.
  const { id, data } = await doMutate()

  // 3. Store with ON CONFLICT DO NOTHING (insertIdempotencyRow uses upsert + ignoreDuplicates).
  const stored = await insertIdempotencyRow(domainCtx, {
    toolName,
    key,
    resultId: id,
    resultPayload: data,
  })

  // 3a. Race detected — winner already wrote.
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

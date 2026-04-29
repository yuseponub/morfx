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
      message: detail.success
        ? 'contact disappeared'
        : (detail.error ?? 'getContactById failed'),
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

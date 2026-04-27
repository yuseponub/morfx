/**
 * Fact resolvers — registered per-Engine instance per-request (Pitfall 7).
 *
 * Each resolver:
 *   1. Imports its data via @/lib/domain/* (Regla 3 — no Supabase admin
 *      client direct usage here; that lives in the domain layer).
 *   2. Wraps the call in try/catch and returns a sentinel on error (Pitfall 4 —
 *      DB hiccups must not reject engine.run).
 *
 * Resolved facts (10 dynamic):
 *   - activeOrderStage    → 'preparation' | 'transit' | 'delivered' | null
 *                           Maps the raw stage NAME from getActiveOrderForContact
 *                           (which returns the textual stage name in the
 *                           `stage_kind` field — there is no `kind` column on
 *                           `pipeline_stages`) to a canonical kind per the
 *                           Plan 01 SNAPSHOT.md mapping. terminal_closed stages
 *                           are already filtered upstream by `is_closed=true`.
 *   - daysSinceLastDelivery → number | null
 *   - daysSinceLastInteraction → number | null
 *   - isClient            → boolean
 *   - hasOrderInLastNDays → number  (counts orders in window — params.days)
 *   - tags                → string[]
 *   - hasPagoAnticipadoTag → boolean
 *   - isInRecompraPipeline → boolean
 *   - lastInteractionAt   → string | null
 *   - recompraEnabled     → boolean (B-1 fix — webhook-processor parity)
 *
 * Note: `lifecycle_state` is NOT registered here — it is set runtime by
 * route.ts between Layer 1 (classifier) and Layer 2 (router) engines.
 */

import type { Engine } from 'json-rules-engine'
import {
  getActiveOrderForContact,
  getLastDeliveredOrderDate,
  countOrdersInLastNDays,
  isContactInRecompraPipeline,
} from '@/lib/domain/orders'
import { getContactTags } from '@/lib/domain/tags'
import { getContactIsClient } from '@/lib/domain/contacts'
import { getLastInboundMessageAt } from '@/lib/domain/messages'
import { getWorkspaceRecompraEnabled } from '@/lib/domain/workspace-agent-config'

const BOGOTA = 'America/Bogota'

/**
 * Returns "now" interpreted in Bogota timezone (Regla 2).
 * Round-trip via Intl#toLocaleString aligns wall-clock math with Bogota days.
 */
function nowMsBogota(): number {
  return new Date(new Date().toLocaleString('en-US', { timeZone: BOGOTA })).getTime()
}

/**
 * Maps a raw pipeline_stages.name (as observed in production Somnio Q3 2026)
 * to a canonical kind label that rules can match on. Source: Plan 01
 * SNAPSHOT.md guidance + Plan 02 SUMMARY notes.
 *
 * Returns null when the name doesn't match any known bucket — rules looking
 * for a specific kind will simply not match (the no-match path is acceptable
 * because terminal_closed stages are already filtered out upstream by
 * `is_closed=true` in getActiveOrderForContact).
 */
export function mapStageNameToKind(
  rawName: string | null | undefined,
): 'preparation' | 'transit' | 'delivered' | null {
  if (!rawName || typeof rawName !== 'string') return null
  const upper = rawName.toUpperCase().trim()

  // delivered (snapshot showed ENTREGADO + SOLUCIONADA both terminal-positive)
  if (upper === 'ENTREGADO' || upper.startsWith('SOLUCIONAD')) return 'delivered'

  // transit (carrier already has the package)
  if (
    upper === 'REPARTO' ||
    upper === 'ENVIA' ||
    upper === 'NOVEDAD' ||
    upper === 'OFI INTER' ||
    upper === 'COORDINADORA' ||
    upper.startsWith('REPARTO') ||
    upper.startsWith('ENVIA') ||
    upper.includes('COORDINADORA') ||
    upper.includes('OFI INTER')
  ) {
    return 'transit'
  }

  // preparation (pre-carrier, includes "FALTA *" and "NUEVO *" wildcards)
  if (
    upper === 'CONFIRMADO' ||
    upper === 'SOMNIO ENVIOS' ||
    upper === 'AGENDADO' ||
    upper === 'BOGOTA' ||
    upper.startsWith('FALTA') ||
    upper.startsWith('NUEVO')
  ) {
    return 'preparation'
  }

  return null
}

export interface FactContext {
  contactId: string
  workspaceId: string
}

export function registerFacts(engine: Engine, ctx: FactContext): void {
  // activeOrderStage — maps raw stage name to canonical kind (preparation|transit|delivered|null)
  engine.addFact('activeOrderStage', async () => {
    try {
      const order = await getActiveOrderForContact(ctx.contactId, ctx.workspaceId)
      return mapStageNameToKind(order?.stage_kind ?? null)
    } catch (err) {
      console.error('[routing.facts] activeOrderStage failed:', err)
      return null
    }
  })

  // activeOrderStageRaw — literal pipeline_stages.name (e.g., "CONFIRMADO", "REPARTO").
  // Use this when you need fine-grained control over a specific stage name; use
  // `activeOrderStage` (canonical kind) for coarser preparation/transit/delivered logic.
  engine.addFact('activeOrderStageRaw', async () => {
    try {
      const order = await getActiveOrderForContact(ctx.contactId, ctx.workspaceId)
      return order?.stage_kind ?? null
    } catch (err) {
      console.error('[routing.facts] activeOrderStageRaw failed:', err)
      return null
    }
  })

  // activeOrderPipeline — literal pipelines.name of the active order (e.g.,
  // "Logistica", "Ventas Somnio Standard"). null if no active order.
  // Combinable with activeOrderStage/activeOrderStageRaw for "stage X within
  // pipeline Y" rules.
  engine.addFact('activeOrderPipeline', async () => {
    try {
      const order = await getActiveOrderForContact(ctx.contactId, ctx.workspaceId)
      return order?.pipeline_name ?? null
    } catch (err) {
      console.error('[routing.facts] activeOrderPipeline failed:', err)
      return null
    }
  })

  // lastInteractionAt — ISO string of last inbound message, or null.
  // Registered before daysSinceLastInteraction so the latter can pull from almanac.
  engine.addFact('lastInteractionAt', async () => {
    try {
      return await getLastInboundMessageAt(ctx.contactId, ctx.workspaceId)
    } catch (err) {
      console.error('[routing.facts] lastInteractionAt failed:', err)
      return null
    }
  })

  // daysSinceLastInteraction — derived from lastInteractionAt via almanac
  engine.addFact('daysSinceLastInteraction', async (_params, almanac) => {
    try {
      const ts = await almanac.factValue<string | null>('lastInteractionAt')
      if (!ts) return null
      const ms = new Date(ts).getTime()
      if (Number.isNaN(ms)) return null
      return Math.floor((nowMsBogota() - ms) / 86_400_000)
    } catch (err) {
      console.error('[routing.facts] daysSinceLastInteraction failed:', err)
      return null
    }
  })

  // daysSinceLastDelivery
  engine.addFact('daysSinceLastDelivery', async () => {
    try {
      const ts = await getLastDeliveredOrderDate(ctx.contactId, ctx.workspaceId)
      if (!ts) return null
      const ms = new Date(ts).getTime()
      if (Number.isNaN(ms)) return null
      return Math.floor((nowMsBogota() - ms) / 86_400_000)
    } catch (err) {
      console.error('[routing.facts] daysSinceLastDelivery failed:', err)
      return null
    }
  })

  // isClient — directly reads contacts.is_client (legacy default false on miss)
  engine.addFact('isClient', async () => {
    try {
      return await getContactIsClient(ctx.contactId, ctx.workspaceId)
    } catch (err) {
      console.error('[routing.facts] isClient failed:', err)
      return false
    }
  })

  // hasOrderInLastNDays — params.days defaults to 7 if missing or non-positive.
  engine.addFact('hasOrderInLastNDays', async (params: { days?: number } | undefined) => {
    try {
      const days =
        typeof params?.days === 'number' && params.days > 0 ? params.days : 7
      return await countOrdersInLastNDays(ctx.contactId, ctx.workspaceId, days)
    } catch (err) {
      console.error('[routing.facts] hasOrderInLastNDays failed:', err)
      return 0
    }
  })

  // tags — always returns an array (getContactTags is non-throwing per Plan 02)
  engine.addFact('tags', async () => {
    try {
      return await getContactTags(ctx.contactId, ctx.workspaceId)
    } catch (err) {
      console.error('[routing.facts] tags failed:', err)
      return []
    }
  })

  // hasPagoAnticipadoTag — derived from tags via almanac
  engine.addFact('hasPagoAnticipadoTag', async (_params, almanac) => {
    try {
      const tags = await almanac.factValue<string[]>('tags')
      return Array.isArray(tags) && tags.includes('pago_anticipado')
    } catch {
      return false
    }
  })

  // isInRecompraPipeline
  engine.addFact('isInRecompraPipeline', async () => {
    try {
      return await isContactInRecompraPipeline(ctx.contactId, ctx.workspaceId)
    } catch (err) {
      console.error('[routing.facts] isInRecompraPipeline failed:', err)
      return false
    }
  })

  // recompraEnabled (B-1 fix) — replicates webhook-processor.ts:172
  // `recompraEnabled = config?.recompra_enabled ?? true`. Used by Plan 07
  // priority-900 legacy parity rule.
  engine.addFact('recompraEnabled', async () => {
    try {
      return await getWorkspaceRecompraEnabled(ctx.workspaceId)
    } catch (err) {
      console.error('[routing.facts] recompraEnabled failed:', err)
      return true // legacy default — preserves behavior on transient DB errors
    }
  })
}

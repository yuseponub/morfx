/**
 * Per-instance LRU cache for compiled rule definitions.
 *
 * D-13: 10s TTL, max 100 workspaces (per Vercel lambda).
 * Pattern 3 (RESEARCH §Architecture Patterns): version-column revalidation via
 * getMaxUpdatedAt — on hit, cheap MAX(updated_at) check before serving cached
 * rules. Avoids stale data when admin edits rules within the TTL window.
 *
 * IMPORTANT: this cache stores rule DEFINITIONS, not Engine instances
 * (Pitfall 7). route.ts constructs `new Engine()` per request from cached
 * definitions.
 */

import { LRUCache } from 'lru-cache'
import type { RuleProperties } from 'json-rules-engine'
import {
  loadActiveRulesForWorkspace,
  getMaxUpdatedAt,
  type RoutingRule,
} from '@/lib/domain/routing'
import { validateRule } from './schema/validate'

export interface CompiledRule {
  id: string
  rule_type: 'lifecycle_classifier' | 'agent_router'
  compiled: RuleProperties
}

export interface CompiledRuleSet {
  classifierRules: CompiledRule[]
  routerRules: CompiledRule[]
  /** Max updated_at across the loaded set; null when no rules. Used by version-column revalidation. */
  maxUpdatedAt: string | null
  /** Epoch ms at which this set was loaded (for diagnostics, not eviction). */
  loadedAt: number
}

const cache = new LRUCache<string, CompiledRuleSet>({
  max: 100, // D-13: max 100 workspaces per lambda
  ttl: 10_000, // D-13: 10 seconds
  updateAgeOnGet: false, // strict TTL — don't reset on read
})

/**
 * Returns active rules for the workspace, using LRU + version-column revalidation.
 *
 * Cost on cache HIT (still within TTL): 1 cheap SELECT (getMaxUpdatedAt).
 * Cost on cache MISS or version delta: full reload via loadActiveRulesForWorkspace.
 * On DB error during reload: returns an empty rule set — route.ts emits
 * `no_rule_matched` and the webhook-processor falls back to legacy if/else.
 */
export async function getRulesForWorkspace(
  workspaceId: string,
): Promise<CompiledRuleSet> {
  const cached = cache.get(workspaceId)
  if (cached) {
    // Soft revalidation — cheap MAX(updated_at) check vs cached snapshot.
    const result = await getMaxUpdatedAt({ workspaceId })
    const currentMax = result.success ? result.data : null
    if (currentMax === cached.maxUpdatedAt) {
      return cached // still fresh
    }
    // Else fall through to reload.
  }
  return reloadRulesForWorkspace(workspaceId)
}

async function reloadRulesForWorkspace(
  workspaceId: string,
): Promise<CompiledRuleSet> {
  const result = await loadActiveRulesForWorkspace({ workspaceId })
  if (!result.success) {
    // Degrade gracefully — empty set leads to no_rule_matched downstream.
    return {
      classifierRules: [],
      routerRules: [],
      maxUpdatedAt: null,
      loadedAt: Date.now(),
    }
  }

  const compileSet = (rules: RoutingRule[]): CompiledRule[] => {
    const out: CompiledRule[] = []
    const seenPriorities = new Set<string>()
    for (const r of rules) {
      // On-load schema validation (Pitfall 5) — skip invalid rows so a bad row
      // never reaches the engine. Migrations should never produce invalid rows
      // (validateRule is also called pre-write in domain.upsertRule), but we
      // double-check on load for defense-in-depth.
      const v = validateRule(r)
      if (!v.ok) {
        console.warn(
          `[routing.cache] skipping invalid rule ${r.id}: ${v.errors.join('; ')}`,
        )
        continue
      }
      // Pitfall 1 defense — UNIQUE INDEX in Plan 01 prevents writes with
      // colliding (workspace_id, rule_type, priority) WHERE active=true, but
      // we keep a runtime check in case the constraint is ever bypassed (e.g.
      // direct SQL by an operator). Keep first occurrence (highest priority
      // rules come first because the domain loader sorts DESC).
      const key = `${r.rule_type}:${r.priority}`
      if (seenPriorities.has(key)) {
        console.warn(
          `[routing.cache] priority collision for ${r.workspace_id}/${key} — skipping rule ${r.id}`,
        )
        continue
      }
      seenPriorities.add(key)

      out.push({
        id: r.id,
        rule_type: r.rule_type,
        compiled: {
          conditions: r.conditions as never,
          event: r.event as never,
          priority: r.priority,
          name: r.name,
        },
      })
    }
    return out
  }

  const classifierRules = compileSet(result.data.classifierRules)
  const routerRules = compileSet(result.data.routerRules)

  // Compute maxUpdatedAt using the SAME domain function that revalidation
  // uses (`getMaxUpdatedAt` — across active + inactive rows). Otherwise a
  // soft-deleted row with a later updated_at than any active row would leave
  // the cached watermark < domain watermark perpetually, causing a reload on
  // every getRulesForWorkspace call until a fresh write lands. (Rule 1 fix —
  // domain.getMaxUpdatedAt scans all rows for forensics; the cache must
  // mirror that semantic to converge.)
  const maxResult = await getMaxUpdatedAt({ workspaceId })
  const maxUpdatedAt = maxResult.success ? maxResult.data : null

  const set: CompiledRuleSet = {
    classifierRules,
    routerRules,
    maxUpdatedAt,
    loadedAt: Date.now(),
  }
  cache.set(workspaceId, set)
  return set
}

/**
 * Explicit invalidation — used by Plan 06 admin Server Actions immediately
 * after a successful upsert/delete so the next webhook sees fresh rules
 * without waiting for the 10s TTL.
 */
export function invalidateWorkspace(workspaceId: string): void {
  cache.delete(workspaceId)
}

/**
 * For tests only — clears the entire cache between test cases.
 */
export function _clearAllCache(): void {
  cache.clear()
}

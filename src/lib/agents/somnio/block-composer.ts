/**
 * Block Composer — Block Composition + Merge Algorithm
 * Phase 31: Pre-Send Check + Interruption + Pending Merge
 *
 * Pure function that composes a block of templates to send, merging new
 * templates (grouped by intent) with pending templates from previous cycles.
 *
 * Algorithm:
 * 1. Intent cap: max 3 intents; excess intents overflow entirely
 * 2. CORE from selected new intents go into block first
 * 3. Remaining templates + pending go into pool
 * 4. Dedup by templateId (prefer pending at same priority)
 * 5. Sort pool by priority (CORE > COMP > OPC), tiebreaker: pending first
 * 6. Fill block up to cap
 * 7. Overflow: OPC -> dropped (permanent), CORE/COMP -> pending (next cycle)
 */

import { BLOCK_MAX_TEMPLATES, BLOCK_MAX_INTENTS } from './constants';

// ============================================================================
// Types
// ============================================================================

export type TemplatePriority = 'CORE' | 'COMPLEMENTARIA' | 'OPCIONAL';

export const PRIORITY_RANK: Record<TemplatePriority, number> = {
  CORE: 0,
  COMPLEMENTARIA: 1,
  OPCIONAL: 2,
};

export interface PrioritizedTemplate {
  templateId: string;
  content: string;
  contentType: 'texto' | 'template' | 'imagen';
  priority: TemplatePriority;
  intent: string;
  orden: number;
  isNew: boolean;
  delaySeconds: number;  // From DB delay_s column — 0 for CORE, 3 for COMPLEMENTARIA
}

export interface BlockCompositionResult {
  /** Templates to send in this block (max BLOCK_MAX_TEMPLATES) */
  block: PrioritizedTemplate[];
  /** CORE/COMP overflow for next cycle */
  pending: PrioritizedTemplate[];
  /** OPC overflow — permanently discarded */
  dropped: PrioritizedTemplate[];
}

// ============================================================================
// Main Algorithm
// ============================================================================

/**
 * Compose a block of templates from new intents and pending templates.
 *
 * @param newByIntent - Templates from current orchestrator, grouped by intent
 * @param pending - Templates saved from previous interrupted block
 * @param maxBlockSize - Maximum templates per block (default BLOCK_MAX_TEMPLATES=3)
 * @returns BlockCompositionResult with block, pending overflow, and dropped OPC
 */
export function composeBlock(
  newByIntent: Map<string, PrioritizedTemplate[]>,
  pending: PrioritizedTemplate[],
  maxBlockSize: number = BLOCK_MAX_TEMPLATES
): BlockCompositionResult {
  const block: PrioritizedTemplate[] = [];
  const overflowPending: PrioritizedTemplate[] = [];
  const dropped: PrioritizedTemplate[] = [];

  // -----------------------------------------------------------------------
  // Step 1: Intent cap — select first N intents, overflow the rest
  // -----------------------------------------------------------------------
  const intentKeys = Array.from(newByIntent.keys());
  const selectedIntentKeys = intentKeys.slice(0, BLOCK_MAX_INTENTS);
  const excessIntentKeys = intentKeys.slice(BLOCK_MAX_INTENTS);

  // Excess intents: CORE/COMP -> pending, OPC -> dropped
  for (const intentKey of excessIntentKeys) {
    const templates = newByIntent.get(intentKey) ?? [];
    for (const t of templates) {
      if (t.priority === 'OPCIONAL') {
        dropped.push(t);
      } else {
        overflowPending.push(t);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Step 2: For each selected intent, extract the CORE template (lowest orden)
  // -----------------------------------------------------------------------
  const coreFromNewIntents: PrioritizedTemplate[] = [];
  const nonCoreFromSelected: PrioritizedTemplate[] = [];

  for (const intentKey of selectedIntentKeys) {
    const templates = newByIntent.get(intentKey) ?? [];
    // Sort by orden to find the CORE (lowest orden)
    const sorted = [...templates].sort((a, b) => a.orden - b.orden);

    const coreTemplate = sorted.find((t) => t.priority === 'CORE');
    if (coreTemplate) {
      coreFromNewIntents.push(coreTemplate);
      // Everything else from this intent goes to pool
      for (const t of sorted) {
        if (t !== coreTemplate) {
          nonCoreFromSelected.push(t);
        }
      }
    } else {
      // No CORE template — all go to pool
      nonCoreFromSelected.push(...sorted);
    }
  }

  // -----------------------------------------------------------------------
  // Step 3: CORE from new intents go into block first
  // -----------------------------------------------------------------------
  for (const t of coreFromNewIntents) {
    if (block.length < maxBlockSize) {
      block.push(t);
    } else {
      // Even CORE can overflow if block is full
      overflowPending.push(t);
    }
  }

  // -----------------------------------------------------------------------
  // Step 4: Build pool from remaining (non-CORE from selected + all pending)
  // -----------------------------------------------------------------------
  const pool: PrioritizedTemplate[] = [...nonCoreFromSelected, ...pending];

  // -----------------------------------------------------------------------
  // Step 5: Deduplication — same templateId, prefer pending at same priority
  // -----------------------------------------------------------------------
  const deduped = deduplicatePool(pool);

  // -----------------------------------------------------------------------
  // Step 6: Sort pool by priority rank, tiebreaker: pending (isNew=false) first
  // -----------------------------------------------------------------------
  deduped.sort((a, b) => {
    const rankDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (rankDiff !== 0) return rankDiff;
    // Tiebreaker: pending (isNew=false) wins over new (isNew=true)
    if (a.isNew !== b.isNew) return a.isNew ? 1 : -1;
    // Further tiebreaker: lower orden first
    return a.orden - b.orden;
  });

  // -----------------------------------------------------------------------
  // Step 7: Fill block up to cap from sorted pool
  // -----------------------------------------------------------------------
  for (const t of deduped) {
    // Check if this templateId is already in the block (e.g., CORE already added in Step 3)
    const existingIdx = block.findIndex((b) => b.templateId === t.templateId);
    if (existingIdx !== -1) {
      // Dedup: prefer pending (isNew=false) over new (isNew=true) at same priority
      const existing = block[existingIdx];
      if (shouldReplace(existing, t)) {
        block[existingIdx] = t;
      }
      continue;
    }
    if (block.length < maxBlockSize) {
      block.push(t);
    } else {
      // Overflow
      if (t.priority === 'OPCIONAL') {
        dropped.push(t);
      } else {
        overflowPending.push(t);
      }
    }
  }

  return {
    block,
    pending: overflowPending,
    dropped,
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Determine if a pool template should replace an existing block template
 * with the same templateId. Prefers higher priority or pending at same priority.
 */
function shouldReplace(
  existing: PrioritizedTemplate,
  candidate: PrioritizedTemplate
): boolean {
  const existingRank = PRIORITY_RANK[existing.priority];
  const candidateRank = PRIORITY_RANK[candidate.priority];
  // Higher priority (lower rank) wins
  if (candidateRank < existingRank) return true;
  // Same priority: prefer pending (isNew=false) over new
  if (candidateRank === existingRank && !candidate.isNew && existing.isNew) {
    return true;
  }
  return false;
}

/**
 * Deduplicate templates by templateId.
 * When duplicates found: prefer the pending (isNew=false) version at same priority.
 */
function deduplicatePool(pool: PrioritizedTemplate[]): PrioritizedTemplate[] {
  const seen = new Map<string, PrioritizedTemplate>();

  for (const t of pool) {
    const existing = seen.get(t.templateId);
    if (!existing) {
      seen.set(t.templateId, t);
    } else {
      // Prefer higher priority (lower rank number)
      const existingRank = PRIORITY_RANK[existing.priority];
      const newRank = PRIORITY_RANK[t.priority];
      if (newRank < existingRank) {
        seen.set(t.templateId, t);
      } else if (newRank === existingRank) {
        // Same priority: prefer pending (isNew=false)
        if (!t.isNew && existing.isNew) {
          seen.set(t.templateId, t);
        }
      }
      // Otherwise keep existing (higher priority or already pending)
    }
  }

  return Array.from(seen.values());
}

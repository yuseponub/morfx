/**
 * Somnio Sales Agent v4 — Per-intent slot coverage classifier (D-02/D-03/T-2)
 *
 * Pure function that answers, per intent independently:
 *   - Does this intent get a deterministic template ('covered') or escalate to RAG ('low')?
 *   - Which RAG sub-query should be used when coverage is 'low'?
 *
 * Reuses `decideSubLoopReason` from escalation.ts as the canonical rule for the
 * razonamiento_libre/outro/low_confidence classification per-intent.
 * NOTE: isCrmMutation and casReject are NEVER passed as true here — those reasons
 * are handled by the CRM gate (crm-gate.ts) and CAS retry logic separately
 * (escalation.ts:49-64 prioritizes cas_reject/crm_mutation; those gates run independently
 * of the slot resolver).
 *
 * Matrix of 4 cases (D-02):
 *   covered+covered → template+template (no RAG)
 *   covered+low     → template primary + RAG secondary
 *   low+covered     → RAG primary + template secondary
 *   low+low         → RAG+RAG (2 invocations per D-08)
 *
 * T-2 sub-query selection:
 *   - low PRIMARY  → ragQuery = rawMessage (full message, behavior unchanged from today)
 *   - low SECONDARY → ragQuery = secondaryQuery (segmented sub-query from comprehension D-04);
 *                     defensive fallback to rawMessage if secondaryQuery is null.
 *
 * Pure module: no async, no DB, no LLM imports. Leaf module consumed by Plan 03 orchestrator.
 *
 * Standalone: v4-hybrid-template-rag-turn / Plan 02.
 */

import { decideSubLoopReason } from './escalation'

// ============================================================================
// Types
// ============================================================================

export type SlotCoverage = 'covered' | 'low'

export interface SlotDecision {
  /** The intent string (primary or secondary) this slot represents. */
  intent: string
  /** Whether this intent is covered by a deterministic template or needs RAG. */
  coverage: SlotCoverage
  /**
   * The escalation reason when coverage === 'low'.
   * null when coverage === 'covered'.
   */
  reason: 'low_confidence' | 'razonamiento_libre' | null
  /**
   * The RAG sub-query to pass to runRagSubLoop when coverage === 'low'.
   * null when coverage === 'covered' (no RAG needed).
   *
   * T-2: low primary → rawMessage; low secondary → secondaryQuery ?? rawMessage.
   */
  ragQuery: string | null
}

export interface SlotPlan {
  /** Always present — the primary intent slot decision. */
  primary: SlotDecision
  /**
   * Present when secondaryIntent !== 'ninguno'.
   * null when there is no secondary intent.
   */
  secondary: SlotDecision | null
}

// ============================================================================
// Input
// ============================================================================

export interface ComputeSlotsArgs {
  primaryIntent: string
  primaryConfidence: number
  /** 'ninguno' when there is no secondary intent. */
  secondaryIntent: string
  /** null when secondaryIntent === 'ninguno' or confidence not reported. */
  secondaryConfidence: number | null
  /**
   * Segmented sub-query for the secondary intent (D-04).
   * null when secondaryIntent === 'ninguno' or not available.
   * Used as ragQuery for low secondary (T-2).
   */
  secondaryQuery: string | null
  /** The full raw message from the user — used as ragQuery for low primary (T-2). */
  rawMessage: string
  /** Confidence threshold from platform_config (D-09 — same threshold for both intents). */
  threshold: number
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Compute the slot plan for a message turn.
 *
 * Classifies each intent independently using the canonical `decideSubLoopReason`
 * rule (reusing the same razonamiento_libre/outro/low_confidence logic).
 * Selects the correct RAG sub-query per slot per T-2.
 */
export function computeSlots(args: ComputeSlotsArgs): SlotPlan {
  const {
    primaryIntent,
    primaryConfidence,
    secondaryIntent,
    secondaryConfidence,
    secondaryQuery,
    rawMessage,
    threshold,
  } = args

  // ─── Primary slot ───────────────────────────────────────────────────────
  const primaryReason = decideSubLoopReason({
    confidence: primaryConfidence,
    threshold,
    intent: primaryIntent,
    isCrmMutation: false, // CRM gates are separate — never true here
    casReject: false,     // CAS retry is separate — never true here
  })

  // `decideSubLoopReason` returns: 'low_confidence' | 'razonamiento_libre' | null
  // (it may also return 'crm_mutation' | 'cas_reject' but we exclude those via the
  // isCrmMutation:false / casReject:false invariant above — they will never appear).
  const primaryCoverage: SlotCoverage = primaryReason !== null ? 'low' : 'covered'

  // Narrow the reason to the 2 valid slot reasons (TypeScript safety — see comment above)
  const primarySlotReason: 'low_confidence' | 'razonamiento_libre' | null =
    primaryReason === 'low_confidence' || primaryReason === 'razonamiento_libre'
      ? primaryReason
      : null

  const primary: SlotDecision = {
    intent: primaryIntent,
    coverage: primaryCoverage,
    reason: primarySlotReason,
    // T-2: low primary uses the raw message (unpartitioned — D-04 only segments the secondary).
    ragQuery: primaryCoverage === 'low' ? rawMessage : null,
  }

  // ─── Secondary slot ──────────────────────────────────────────────────────
  let secondary: SlotDecision | null = null

  if (secondaryIntent !== 'ninguno') {
    // Defensive: treat null secondaryConfidence as 0 (will fail threshold → 'low')
    const effectiveSecondaryConfidence = secondaryConfidence ?? 0

    const secondaryReason = decideSubLoopReason({
      confidence: effectiveSecondaryConfidence,
      threshold,
      intent: secondaryIntent,
      isCrmMutation: false,
      casReject: false,
    })

    const secondaryCoverage: SlotCoverage = secondaryReason !== null ? 'low' : 'covered'

    const secondarySlotReason: 'low_confidence' | 'razonamiento_libre' | null =
      secondaryReason === 'low_confidence' || secondaryReason === 'razonamiento_libre'
        ? secondaryReason
        : null

    secondary = {
      intent: secondaryIntent,
      coverage: secondaryCoverage,
      reason: secondarySlotReason,
      // T-2: low secondary uses secondaryQuery (D-04 sub-query); fallback to rawMessage
      // if comprehension didn't produce one (defensive — should not happen in practice).
      ragQuery: secondaryCoverage === 'low' ? (secondaryQuery ?? rawMessage) : null,
    }
  }

  return { primary, secondary }
}

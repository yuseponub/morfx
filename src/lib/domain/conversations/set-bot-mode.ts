// ============================================================================
// Domain Layer — Conversation Bot Mode (three-state toggle)
//
// This function is ADDITIVE. The existing web `toggleConversationAgent`
// (src/app/actions/agent-config.ts) and the production agent runtime reader
// (src/lib/agents/production/agent-config.ts) are UNCHANGED. Unification of
// `agent_conversational` (legacy tri-state boolean) and `bot_mode` (new three-
// state enum) is a future consolidation phase — until then both columns
// coexist and Regla 6 (protect production agent) is satisfied: the web
// surface and the Inngest agent-timers continue to read/write
// `agent_conversational` exclusively, and this new mobile path writes to
// `bot_mode` + `bot_mute_until` exclusively.
//
// Migration source: supabase/migrations/20260409000000_bot_mode_and_mute_until.sql
//   - bot_mode conversation_bot_mode NOT NULL DEFAULT 'on'
//   - bot_mute_until timestamptz NULL
//   - CHECK (bot_mute_until IS NULL OR bot_mode = 'muted')
//
// Pattern (Regla 3):
//   1. createAdminClient() (bypasses RLS)
//   2. Filter by workspace_id on every query
//   3. Execute mutation, enforce CHECK invariant client-side too
//   4. Return DomainResult<T>
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import type { DomainContext, DomainResult } from '../types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BotMode = 'on' | 'off' | 'muted'

export interface SetBotModeParams {
  conversationId: string
  mode: BotMode
  /** Required when mode === 'muted', MUST be in the future. Must be null otherwise. */
  muteUntil: Date | null
}

export interface SetBotModeResult {
  conversationId: string
  bot_mode: BotMode
  /** ISO string or null (wire-friendly; Date was the input, ISO is the output). */
  bot_mute_until: string | null
}

export interface ResolveBotModeRow {
  bot_mode: BotMode | null
  bot_mute_until: string | null
}

export interface ResolveBotModeResult {
  bot_mode: BotMode
  bot_mute_until: string | null
}

// ---------------------------------------------------------------------------
// setBotMode — the three-state writer
// ---------------------------------------------------------------------------

/**
 * Persist a new bot mode for a conversation.
 *
 * Validation contract (mirrors the DB CHECK constraint, failing fast before
 * hitting Postgres):
 *   - mode='muted'  ⇒ muteUntil MUST be a Date in the future
 *   - mode='on'     ⇒ muteUntil MUST be null
 *   - mode='off'    ⇒ muteUntil MUST be null
 *
 * The mobile UI is the only caller today (Plan 43-11). Web continues to use
 * the legacy `agent_conversational` tri-state boolean via the pre-existing
 * server action — DO NOT add it to this call path without a unification plan.
 */
export async function setBotMode(
  ctx: DomainContext,
  params: SetBotModeParams
): Promise<DomainResult<SetBotModeResult>> {
  // Validate invariants BEFORE hitting the DB. Pushing these through to the
  // CHECK constraint would work, but a precise domain-level error is kinder
  // to the mobile UI than a raw Postgres "violates check constraint" string.
  if (params.mode === 'muted') {
    if (!params.muteUntil) {
      return {
        success: false,
        error: 'muteUntil es requerido cuando mode es "muted"',
      }
    }
    if (params.muteUntil.getTime() <= Date.now()) {
      return {
        success: false,
        error: 'muteUntil debe estar en el futuro',
      }
    }
  } else {
    if (params.muteUntil !== null) {
      return {
        success: false,
        error: 'muteUntil debe ser null cuando mode es "on" u "off"',
      }
    }
  }

  const supabase = createAdminClient()

  // Verify the conversation exists in this workspace (prevents cross-workspace
  // mutation — Memory-resident rule: .single() MUST filter by workspace_id).
  const { data: existing, error: readError } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', params.conversationId)
    .eq('workspace_id', ctx.workspaceId)
    .single()

  if (readError || !existing) {
    return { success: false, error: 'Conversacion no encontrada' }
  }

  const muteUntilIso = params.muteUntil ? params.muteUntil.toISOString() : null

  const { data: updated, error: updateError } = await supabase
    .from('conversations')
    .update({
      bot_mode: params.mode,
      bot_mute_until: muteUntilIso,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.conversationId)
    .eq('workspace_id', ctx.workspaceId)
    .select('id, bot_mode, bot_mute_until')
    .single()

  if (updateError || !updated) {
    console.error(
      '[domain/conversations/set-bot-mode] setBotMode failed:',
      updateError?.message
    )
    return {
      success: false,
      error: updateError?.message || 'Error al actualizar el modo del bot',
    }
  }

  return {
    success: true,
    data: {
      conversationId: params.conversationId,
      bot_mode: (updated.bot_mode as BotMode) ?? 'on',
      bot_mute_until: updated.bot_mute_until ?? null,
    },
  }
}

// ---------------------------------------------------------------------------
// resolveBotMode — the read-side auto-resume coercion helper
// ---------------------------------------------------------------------------

/**
 * Coerce an expired mute back to 'on' at read time.
 *
 * v1 auto-resume strategy: instead of running a scheduled worker that flips
 * `bot_mode='muted'` rows back to `'on'` at the exact moment their
 * `bot_mute_until` expires, we do it lazily on read. Any mobile API read
 * path that pulls a conversation row runs this helper BEFORE serializing,
 * so the mobile UI never sees a stale "still muted" state for a mute that
 * already passed.
 *
 * IMPORTANT: this function is PURE (no DB writes). It returns the coerced
 * snapshot for serialization; it does NOT update the DB row. If a caller
 * wants the DB to eventually catch up, it should call `setBotMode` with
 * mode='on' (a future worker plan can do this in bulk). Keeping this pure
 * means the read endpoints stay cheap and idempotent — the next mobile
 * request sees the same coerced value regardless of DB lag.
 *
 * When Plan 43-01's Postgres trigger-or-worker lands, this helper can stay
 * in place as defense-in-depth without behavior change.
 */
export function resolveBotMode(row: ResolveBotModeRow): ResolveBotModeResult {
  const mode: BotMode = row.bot_mode ?? 'on'
  const muteUntil = row.bot_mute_until

  if (mode !== 'muted') {
    // Defensive: if somehow a non-muted row has a stray mute_until (should be
    // impossible given the CHECK constraint, but legacy caches / fixtures
    // might drift) clear it in the serialized response.
    return { bot_mode: mode, bot_mute_until: null }
  }

  if (!muteUntil) {
    // 'muted' without a mute_until is an impossible state per the CHECK.
    // Coerce defensively so the mobile UI never sees "muted forever".
    return { bot_mode: 'on', bot_mute_until: null }
  }

  const expires = Date.parse(muteUntil)
  if (Number.isNaN(expires) || expires <= Date.now()) {
    // Expired — coerce to 'on' and clear the timestamp.
    return { bot_mode: 'on', bot_mute_until: null }
  }

  // Still muted, still in the future — pass through.
  return { bot_mode: 'muted', bot_mute_until: muteUntil }
}

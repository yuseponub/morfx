// ============================================================================
// Domain Layer — Workspace Settings
// Single source of truth for mutations to `workspaces.settings` JSONB.
// Per CLAUDE.md Rule 3: all mutations go through the domain layer, never
// written directly from server actions, tool handlers, or webhooks.
//
// Pattern:
//   1. createAdminClient() (bypasses RLS — caller must enforce auth)
//   2. Read current settings JSONB
//   3. Merge partial into the targeted namespace without clobbering siblings
//   4. Validate the merged namespace
//   5. Write the full settings JSONB back
//   6. Return a tagged result
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import {
  DEFAULT_METRICS_SETTINGS,
  type MetricsSettings,
} from '@/lib/metricas-conversaciones/types'

export type SettingsResult<T> =
  | { ok: true; settings: T }
  | { ok: false; error: string }

/**
 * Merges a partial `conversation_metrics` settings object into
 * `workspaces.settings` JSONB for the given workspace, without clobbering
 * other sibling keys (e.g. `hidden_modules`, `whatsapp_*`).
 *
 * Defaults are applied for any fields missing from both the caller's partial
 * and the workspace's current settings, so calling this on a workspace that
 * has never had `conversation_metrics` before will seed the full object.
 *
 * Auth/role enforcement is the caller's responsibility — this function uses
 * the admin client and bypasses RLS.
 */
export async function updateConversationMetricsSettings(
  workspaceId: string,
  partial: Partial<MetricsSettings>,
): Promise<SettingsResult<MetricsSettings>> {
  if (!workspaceId) {
    return { ok: false, error: 'workspaceId es requerido' }
  }

  const admin = createAdminClient()

  // Read current settings
  const { data: ws, error: readErr } = await admin
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()

  if (readErr || !ws) {
    return {
      ok: false,
      error: readErr?.message ?? 'workspace no encontrado',
    }
  }

  const currentRoot = (ws.settings as Record<string, unknown> | null) ?? {}
  const currentCm = (currentRoot.conversation_metrics ??
    {}) as Partial<MetricsSettings>

  // Merge with precedence: partial > current > defaults
  const merged: MetricsSettings = {
    enabled:
      partial.enabled ?? currentCm.enabled ?? DEFAULT_METRICS_SETTINGS.enabled,
    reopen_window_days:
      partial.reopen_window_days ??
      currentCm.reopen_window_days ??
      DEFAULT_METRICS_SETTINGS.reopen_window_days,
    scheduled_tag_name:
      partial.scheduled_tag_name ??
      currentCm.scheduled_tag_name ??
      DEFAULT_METRICS_SETTINGS.scheduled_tag_name,
  }

  // Validate
  if (typeof merged.enabled !== 'boolean') {
    return { ok: false, error: 'enabled debe ser booleano' }
  }
  if (
    !Number.isInteger(merged.reopen_window_days) ||
    merged.reopen_window_days < 1 ||
    merged.reopen_window_days > 90
  ) {
    return {
      ok: false,
      error: 'reopen_window_days debe ser un entero entre 1 y 90',
    }
  }
  if (
    typeof merged.scheduled_tag_name !== 'string' ||
    merged.scheduled_tag_name.trim() === ''
  ) {
    return { ok: false, error: 'scheduled_tag_name es requerido' }
  }

  // Write merged settings back, preserving all other sibling keys
  const newSettings = {
    ...currentRoot,
    conversation_metrics: merged,
  }

  const { error: writeErr } = await admin
    .from('workspaces')
    .update({ settings: newSettings })
    .eq('id', workspaceId)

  if (writeErr) {
    return { ok: false, error: writeErr.message }
  }

  return { ok: true, settings: merged }
}

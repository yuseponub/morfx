// ============================================================================
// Phase 20: Twilio Client Factory
// Creates per-workspace Twilio clients from credentials stored in integrations table.
// Uses createAdminClient() to bypass RLS for credential lookup.
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import type { TwilioConfig } from './types'

/**
 * Loads Twilio configuration for a workspace from the integrations table.
 * Throws if no active Twilio integration exists for the workspace.
 */
export async function getTwilioConfig(workspaceId: string): Promise<TwilioConfig> {
  const supabase = createAdminClient()

  const { data: integration, error } = await supabase
    .from('integrations')
    .select('config')
    .eq('workspace_id', workspaceId)
    .eq('type', 'twilio')
    .eq('is_active', true)
    .single()

  if (error || !integration) {
    throw new Error('Twilio no configurado en este workspace')
  }

  const config = integration.config as TwilioConfig

  if (!config.account_sid || !config.auth_token || !config.phone_number) {
    throw new Error('Credenciales de Twilio incompletas en este workspace')
  }

  return config
}

/**
 * Creates a Twilio REST client from the given config.
 * Uses require('twilio') because the twilio package doesn't have ESM default export.
 * Returns the Twilio client instance (typed as any to avoid @types/twilio dependency).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTwilioClient(config: TwilioConfig): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const twilio = require('twilio')
  return twilio(config.account_sid, config.auth_token)
}

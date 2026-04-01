// ============================================================================
// Meta Credential Resolution
// Lookup and decrypt workspace credentials from workspace_meta_accounts.
// Uses createAdminClient() to bypass RLS (read-only credential lookups).
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from './token'
import type { MetaCredentials, MetaChannel } from './types'

// ----------------------------------------------------------------------------
// DB row → MetaCredentials mapping
// ----------------------------------------------------------------------------

interface MetaAccountRow {
  workspace_id: string
  waba_id: string | null
  phone_number_id: string | null
  phone_number: string | null
  page_id: string | null
  ig_account_id: string | null
  business_id: string | null
  access_token_encrypted: string
}

function rowToCredentials(row: MetaAccountRow): MetaCredentials {
  return {
    accessToken: decryptToken(row.access_token_encrypted),
    wabaId: row.waba_id,
    phoneNumberId: row.phone_number_id,
    phoneNumber: row.phone_number,
    pageId: row.page_id,
    igAccountId: row.ig_account_id,
    businessId: row.business_id,
    workspaceId: row.workspace_id,
  }
}

// ----------------------------------------------------------------------------
// Resolve by channel-specific identifiers (inbound webhook routing)
// ----------------------------------------------------------------------------

/**
 * Resolve credentials by WhatsApp phone_number_id.
 * Used for inbound WhatsApp webhook routing.
 */
export async function resolveByPhoneNumberId(
  phoneNumberId: string
): Promise<MetaCredentials | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('workspace_meta_accounts')
    .select(
      'workspace_id, waba_id, phone_number_id, phone_number, page_id, ig_account_id, business_id, access_token_encrypted'
    )
    .eq('phone_number_id', phoneNumberId)
    .eq('is_active', true)
    .single()

  if (!data) return null
  return rowToCredentials(data)
}

/**
 * Resolve credentials by Facebook page_id.
 * Used for inbound Messenger webhook routing.
 */
export async function resolveByPageId(
  pageId: string
): Promise<MetaCredentials | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('workspace_meta_accounts')
    .select(
      'workspace_id, waba_id, phone_number_id, phone_number, page_id, ig_account_id, business_id, access_token_encrypted'
    )
    .eq('page_id', pageId)
    .eq('is_active', true)
    .single()

  if (!data) return null
  return rowToCredentials(data)
}

/**
 * Resolve credentials by Instagram ig_account_id.
 * Used for inbound Instagram DM webhook routing.
 */
export async function resolveByIgAccountId(
  igAccountId: string
): Promise<MetaCredentials | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('workspace_meta_accounts')
    .select(
      'workspace_id, waba_id, phone_number_id, phone_number, page_id, ig_account_id, business_id, access_token_encrypted'
    )
    .eq('ig_account_id', igAccountId)
    .eq('is_active', true)
    .single()

  if (!data) return null
  return rowToCredentials(data)
}

// ----------------------------------------------------------------------------
// Resolve by workspace + channel (outbound sends)
// ----------------------------------------------------------------------------

/**
 * Resolve credentials for a workspace + channel combination.
 * Used for outbound message sends.
 */
export async function resolveByWorkspace(
  workspaceId: string,
  channel: MetaChannel
): Promise<MetaCredentials | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('workspace_meta_accounts')
    .select(
      'workspace_id, waba_id, phone_number_id, phone_number, page_id, ig_account_id, business_id, access_token_encrypted'
    )
    .eq('workspace_id', workspaceId)
    .eq('channel', channel)
    .eq('is_active', true)
    .single()

  if (!data) return null
  return rowToCredentials(data)
}

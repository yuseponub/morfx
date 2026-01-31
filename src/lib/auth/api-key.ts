/**
 * API Key Validation Utility
 * Phase 3: Action DSL Core - Plan 04, Task 1
 *
 * Provides API key validation, generation, and hashing for external API access.
 * Edge Runtime compatible (uses Web Crypto API).
 */

import { createClient } from '@supabase/supabase-js'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('api-key')

/**
 * API Key validation result
 */
export interface ApiKeyValidation {
  valid: boolean
  workspaceId?: string
  permissions?: string[]
  error?: string
}

/**
 * Hash an API key for storage/comparison
 *
 * We use SHA-256 for API keys (not bcrypt) because:
 * 1. API keys are random, not user-chosen (no dictionary attacks)
 * 2. We need fast comparison for every request
 * 3. Keys are long (32+ chars) so brute force is impractical
 *
 * For user passwords, use bcrypt instead.
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(key)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Generate a new API key with prefix
 *
 * Format: mfx_{random 32 chars}
 * Example: mfx_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
 */
export function generateApiKey(): { key: string; prefix: string } {
  const randomBytes = crypto.getRandomValues(new Uint8Array(24))
  const randomPart = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 32)

  const key = `mfx_${randomPart}`
  const prefix = key.substring(0, 8) // "mfx_a1b2"

  return { key, prefix }
}

/**
 * Validate an API key against the database
 *
 * This function is Edge Runtime compatible (uses fetch, not Node.js-only APIs)
 */
export async function validateApiKey(apiKey: string): Promise<ApiKeyValidation> {
  try {
    // Validate format
    if (!apiKey.startsWith('mfx_') || apiKey.length < 36) {
      return { valid: false, error: 'Invalid API key format' }
    }

    // Hash the key
    const keyHash = await hashApiKey(apiKey)

    // Query database (using service role for validation)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      logger.error({ event: 'missing_supabase_config' })
      return { valid: false, error: 'Server configuration error' }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data, error } = await supabase
      .from('api_keys')
      .select('workspace_id, permissions, expires_at')
      .eq('key_hash', keyHash)
      .eq('revoked', false)
      .single()

    if (error || !data) {
      logger.debug({
        event: 'api_key_not_found',
        prefix: apiKey.substring(0, 8)
      })
      return { valid: false, error: 'Invalid API key' }
    }

    // Check expiration
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      logger.debug({
        event: 'api_key_expired',
        prefix: apiKey.substring(0, 8)
      })
      return { valid: false, error: 'API key expired' }
    }

    // Update last_used_at (fire and forget)
    void supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('key_hash', keyHash)

    logger.debug({
      event: 'api_key_validated',
      prefix: apiKey.substring(0, 8),
      workspace_id: data.workspace_id
    })

    return {
      valid: true,
      workspaceId: data.workspace_id,
      permissions: data.permissions || []
    }
  } catch (err) {
    logger.error({
      event: 'api_key_validation_error',
      error: err instanceof Error ? err.message : 'Unknown error'
    })
    return { valid: false, error: 'Validation error' }
  }
}

/**
 * Extract API key from Authorization header
 */
export function extractApiKey(authHeader: string | null): string | null {
  if (!authHeader) return null
  if (!authHeader.startsWith('Bearer ')) return null
  return authHeader.substring(7)
}

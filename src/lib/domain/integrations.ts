// ============================================================================
// Domain Layer — Shopify Integrations (Standalone shopify-dev-dashboard-oauth, D-10)
// Single source of truth for mutations on `integrations` WHERE type='shopify' (Regla 3 CLAUDE.md).
//
// Pattern:
//   1. createAdminClient() (bypasses RLS)
//   2. Read existing row by (workspace_id, type='shopify') to preserve config
//      fields the OAuth callback should NOT overwrite (default_pipeline_id,
//      default_stage_id, enable_fuzzy_matching, product_matching, auto_sync_orders,
//      granted_scope, field_mappings)
//   3. INSERT or UPDATE based on existence
//   4. Return DomainResult<ShopifyIntegration>
//
// Callers (planned):
//   - src/app/api/integrations/shopify/oauth/callback/route.ts (Wave 2, Plan 05)
//   - src/app/actions/shopify.ts (Wave 3, Plan 06 — refactored delete path)
//
// Constraints:
//   - Filtra por `ctx.workspaceId` en CADA query (Regla 3 + threat T-shopify-oauth-05).
//   - NUNCA throws; cualquier error se captura y se devuelve como `{ success: false, error }`.
//   - NUNCA loguea `access_token` ni `api_secret` (T-shopify-oauth-06).
//   - BD constraint `UNIQUE(workspace_id, type='shopify')` garantiza 1 row max
//     por workspace (D-02), por eso usamos `.single()` en upsert / `.maybeSingle()` en get.
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import type { ShopifyConfig, ShopifyIntegration } from '@/lib/shopify/types'

import type { DomainContext, DomainResult } from './types'

// ============================================================================
// Param Types
// ============================================================================

/**
 * Params for upserting a Shopify integration after a successful OAuth flow.
 *
 * - `apiSecret` corresponds to the Dev Dashboard `Client Secret` (used by the
 *   webhook handler to verify HMAC of inbound webhooks). It is the same value
 *   used in `getShopifyOAuthConfig().clientSecret` — the OAuth callback writes
 *   it here so webhook validation does not need to read `platform_config`.
 * - `grantedScope` is the comma-separated list of scopes Shopify confirmed in
 *   the token-exchange response. Optional to remain compatible with manual /
 *   legacy save paths that don't have it (D-11). When undefined, the existing
 *   value (if any) is preserved on UPDATE.
 */
export interface UpsertShopifyIntegrationParams {
  shopDomain: string
  accessToken: string
  apiSecret: string
  shopName: string
  grantedScope?: string
}

// ============================================================================
// upsertShopifyIntegration
// ============================================================================

/**
 * INSERT-or-UPDATE a Shopify integration row for `ctx.workspaceId`.
 *
 * Behavior:
 *   - Looks up existing row by (workspace_id, type='shopify').
 *   - On UPDATE: preserves user-configured fields from existing config
 *     (`default_pipeline_id`, `default_stage_id`, `enable_fuzzy_matching`,
 *     `product_matching`, `auto_sync_orders`, `granted_scope`, `field_mappings`)
 *     EXCEPT when this call provides a non-undefined `grantedScope`, in which
 *     case it overrides. OAuth fields (`shop_domain`, `access_token`,
 *     `api_secret`) always overwrite.
 *   - On INSERT: applies defaults (empty pipeline/stage = user fills via UI;
 *     fuzzy matching off; product matching by SKU; `is_active=true`).
 *
 * Never throws — converts any error to `DomainResult.error`.
 */
export async function upsertShopifyIntegration(
  ctx: DomainContext,
  params: UpsertShopifyIntegrationParams
): Promise<DomainResult<ShopifyIntegration>> {
  const supabase = createAdminClient()

  try {
    // Step 1: read existing row to preserve user-configured fields
    const { data: existing, error: existingErr } = await supabase
      .from('integrations')
      .select('id, config')
      .eq('workspace_id', ctx.workspaceId)
      .eq('type', 'shopify')
      .maybeSingle()

    if (existingErr) {
      return { success: false, error: existingErr.message }
    }

    const existingConfig = (existing?.config ?? {}) as Partial<ShopifyConfig>

    // Step 2: build the new config — OAuth fields overwrite, user-config preserves.
    // Note: `enable_fuzzy_matching` and `product_matching` are required (not optional)
    // in `ShopifyConfig`, so we always set a concrete value (preserve or default).
    const config: ShopifyConfig = {
      shop_domain: params.shopDomain,
      access_token: params.accessToken,
      api_secret: params.apiSecret,
      default_pipeline_id: existingConfig.default_pipeline_id ?? '',
      default_stage_id: existingConfig.default_stage_id ?? '',
      enable_fuzzy_matching: existingConfig.enable_fuzzy_matching ?? false,
      product_matching: existingConfig.product_matching ?? 'sku',
      ...(existingConfig.field_mappings !== undefined && {
        field_mappings: existingConfig.field_mappings,
      }),
      ...(existingConfig.auto_sync_orders !== undefined && {
        auto_sync_orders: existingConfig.auto_sync_orders,
      }),
      // grantedScope precedence: explicit param > existing config > undefined.
      ...(params.grantedScope !== undefined
        ? { granted_scope: params.grantedScope }
        : existingConfig.granted_scope !== undefined
          ? { granted_scope: existingConfig.granted_scope }
          : {}),
    }

    // Step 3: branch on existence
    if (existing) {
      const { data: updated, error } = await supabase
        .from('integrations')
        .update({
          name: `Shopify - ${params.shopName}`,
          config,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('workspace_id', ctx.workspaceId)
        .select()
        .single()

      if (error) return { success: false, error: error.message }
      return { success: true, data: updated as ShopifyIntegration }
    }

    const { data: created, error } = await supabase
      .from('integrations')
      .insert({
        workspace_id: ctx.workspaceId,
        type: 'shopify',
        name: `Shopify - ${params.shopName}`,
        config,
        is_active: true,
      })
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data: created as ShopifyIntegration }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'unknown error in upsertShopifyIntegration',
    }
  }
}

// ============================================================================
// getShopifyIntegration
// ============================================================================

/**
 * Read the Shopify integration row for `ctx.workspaceId`, if any.
 *
 * Returns `{ success: true, data: null }` when no integration exists — that is
 * a valid state, not an error. DB errors propagate as `{ success: false, error }`.
 */
export async function getShopifyIntegration(
  ctx: DomainContext
): Promise<DomainResult<ShopifyIntegration | null>> {
  const supabase = createAdminClient()

  try {
    const { data, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('workspace_id', ctx.workspaceId)
      .eq('type', 'shopify')
      .maybeSingle()

    if (error) return { success: false, error: error.message }
    return { success: true, data: (data as ShopifyIntegration | null) ?? null }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'unknown error in getShopifyIntegration',
    }
  }
}

// ============================================================================
// deleteShopifyIntegration
// ============================================================================

/**
 * Hard-DELETE the Shopify integration row for `ctx.workspaceId` (if any).
 *
 * Used when the operator clicks "Eliminar" in `/configuracion/integraciones`.
 * Idempotent: deleting when no row exists is a successful no-op.
 *
 * NOTE: this is a hard delete (not a soft `is_active=false`) because the table
 * has `UNIQUE(workspace_id, type='shopify')` — leaving a soft-deleted row would
 * block re-connecting via OAuth. The delete cascades to dependent webhook events
 * via the FK constraint defined in the original integrations migration.
 */
export async function deleteShopifyIntegration(
  ctx: DomainContext
): Promise<DomainResult<void>> {
  const supabase = createAdminClient()

  try {
    const { error } = await supabase
      .from('integrations')
      .delete()
      .eq('workspace_id', ctx.workspaceId)
      .eq('type', 'shopify')

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'unknown error in deleteShopifyIntegration',
    }
  }
}

// ============================================================================
// updateShopifyConfig — operator-editable fields only (no OAuth re-flow)
// ============================================================================

export interface UpdateShopifyConfigParams {
  default_pipeline_id?: string
  default_stage_id?: string
  enable_fuzzy_matching?: boolean
  product_matching?: 'sku' | 'name' | 'value'
}

export async function updateShopifyConfig(
  ctx: DomainContext,
  params: UpdateShopifyConfigParams
): Promise<DomainResult<ShopifyIntegration>> {
  const supabase = createAdminClient()

  try {
    const { data: existing, error: existingErr } = await supabase
      .from('integrations')
      .select('id, config')
      .eq('workspace_id', ctx.workspaceId)
      .eq('type', 'shopify')
      .maybeSingle()

    if (existingErr) return { success: false, error: existingErr.message }
    if (!existing) return { success: false, error: 'shopify_integration_not_found' }

    const existingConfig = (existing.config ?? {}) as Partial<ShopifyConfig>

    const config: ShopifyConfig = {
      shop_domain: existingConfig.shop_domain ?? '',
      access_token: existingConfig.access_token ?? '',
      api_secret: existingConfig.api_secret ?? '',
      default_pipeline_id: params.default_pipeline_id ?? existingConfig.default_pipeline_id ?? '',
      default_stage_id: params.default_stage_id ?? existingConfig.default_stage_id ?? '',
      enable_fuzzy_matching: params.enable_fuzzy_matching ?? existingConfig.enable_fuzzy_matching ?? false,
      product_matching: params.product_matching ?? existingConfig.product_matching ?? 'sku',
      ...(existingConfig.field_mappings !== undefined && {
        field_mappings: existingConfig.field_mappings,
      }),
      ...(existingConfig.auto_sync_orders !== undefined && {
        auto_sync_orders: existingConfig.auto_sync_orders,
      }),
      ...(existingConfig.granted_scope !== undefined && {
        granted_scope: existingConfig.granted_scope,
      }),
    }

    const { data: updated, error } = await supabase
      .from('integrations')
      .update({
        config,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data: updated as ShopifyIntegration }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'unknown error in updateShopifyConfig',
    }
  }
}

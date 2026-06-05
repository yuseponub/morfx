// SERVER-ONLY: resolves the IG account off a connected Page; uses the Page token.
// ============================================================================
// Instagram connect helper (Phase 41 — IG-03)
//
// Instagram has NO independent OAuth — it rides on the workspace's already-connected
// Facebook Page (D-IG-04). The rest of the connect chain is REUSED verbatim from
// `messenger-connect.ts` (the long-lived token exchange, the Page-token resolver, and
// the per-Page webhook subscribe) — the ONLY genuinely-new Graph call is resolving the
// Instagram Professional account linked to the Page:
//
//   GET /{pageId}?fields=instagram_business_account{id,username}
//
// This reuses the existing never-expiring Page Access Token (no fresh FB.login when a
// connected Page row already exists). If no IG account is linked to the Page we throw a
// clear Spanish error so the operator knows to link one in their FB Page settings.
//
// Never logs the token.
// ============================================================================

import { metaRequest } from './api'

/**
 * Resolves the Instagram Professional account linked to a connected Facebook Page.
 * Reuses the existing Page token. IG rides on the connected Page (D-IG-04).
 * GET /{pageId}?fields=instagram_business_account{id,username}
 *
 * @param pageToken - the never-expiring Page Access Token (Bearer)
 * @param pageId - the connected Facebook Page id
 * @returns { id, username? } of the linked Instagram Professional account
 * @throws a clear Spanish error if no IG account is linked to the Page
 */
export async function resolveInstagramAccount(
  pageToken: string,
  pageId: string,
): Promise<{ id: string; username?: string }> {
  const res = await metaRequest<{
    instagram_business_account?: { id: string; username?: string }
  }>(pageToken, `/${pageId}?fields=instagram_business_account{id,username}`)
  const ig = res.instagram_business_account
  if (!ig?.id) {
    // D-IG-04 clear error — the operator must link an IG Professional account to the Page.
    throw new Error('vincula una cuenta de Instagram Profesional a tu página de Facebook')
  }
  return ig
}

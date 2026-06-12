// ============================================================================
// Domain Layer — WhatsApp Templates
// Single source of truth for mutations on `whatsapp_templates` (Regla 3).
//
// Orchestration for createTemplate:
//   1. createAdminClient() (bypasses RLS)
//   2. Uniqueness check by (workspace_id, name)
//   3. If params.headerImage is present:
//       3a. Download bytes from Supabase Storage bucket `whatsapp-media`
//       3b. Upload to 360 Dialog resumable API via uploadHeaderImage360()
//       3c. Patch the HEADER component with example.header_handle = [handle]
//   4. INSERT row with status='PENDING'
//   5. Call createTemplate360()
//   6. On success -> UPDATE submitted_at
//   7. On 360 error (post-insert) -> UPDATE status='REJECTED' + rejected_reason
//      (row preserved for diagnostic — D-16, D-17)
//
// Callers:
//   - src/app/actions/templates.ts  (server-action path)
//   - src/lib/config-builder/templates/tools.ts  (AI tool path — Plan 03+)
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import {
  createTemplate360,
} from '@/lib/whatsapp/templates-api'
// Phase 39 (MIG-03 / D-02): the SINGLE provider-decision site for template create.
// `meta_direct` workspaces submit via createTemplateMeta + a Meta resumable upload
// handle; `360dialog` workspaces stay byte-identical (Regla 6 — public Supabase URL).
import { resolveByWorkspace } from '@/lib/meta/credentials'
import {
  createTemplateMeta,
  uploadHeaderHandleMeta,
} from '@/lib/meta/templates'
import type { DomainContext, DomainResult } from './types'
import type {
  Template,
  TemplateCategory,
  TemplateComponent,
} from '@/lib/whatsapp/types'

// ============================================================================
// Param Types
// ============================================================================

export interface CreateTemplateParams {
  name: string
  language: string
  category: TemplateCategory
  components: TemplateComponent[]
  variableMapping: Record<string, string>
  /**
   * Optional — when present, the HEADER component (which must exist with
   * format='IMAGE') will be populated with a permanent handle obtained from
   * 360 Dialog's resumable upload API before submission to Meta.
   */
  headerImage?: {
    storagePath: string
    mimeType: 'image/jpeg' | 'image/png'
  }
  apiKey: string
}

// ============================================================================
// createTemplate
// ============================================================================

/**
 * Create a WhatsApp template in the workspace and submit it to 360 Dialog
 * (and therefore Meta). Handles both TEXT-only and IMAGE-header templates.
 *
 * Returns DomainResult<Template>:
 *   - { success: true, data: Template } on successful submission (status
 *     remains 'PENDING' locally; Meta will later flip it to APPROVED/REJECTED
 *     via the sync path)
 *   - { success: false, error } on uniqueness conflict, validation error,
 *     storage/upload failure, or 360 Dialog rejection
 */
export async function createTemplate(
  ctx: DomainContext,
  params: CreateTemplateParams
): Promise<DomainResult<Template>> {
  const supabase = createAdminClient()

  // Step 0: Provider decision (MIG-03 / D-02 — the single chokepoint, Regla 3).
  // Default/null → '360dialog'. MIG-01: whatsapp_provider already exists in prod.
  const { data: ws } = await supabase
    .from('workspaces')
    .select('whatsapp_provider')
    .eq('id', ctx.workspaceId)
    .single()
  const provider: '360dialog' | 'meta_direct' =
    ws?.whatsapp_provider === 'meta_direct' ? 'meta_direct' : '360dialog'

  // For meta_direct, resolve Meta creds once (from ctx.workspaceId, never input — T-39-02).
  let metaCreds: { accessToken: string; wabaId: string } | null = null
  if (provider === 'meta_direct') {
    const creds = await resolveByWorkspace(ctx.workspaceId, 'whatsapp')
    if (!creds?.accessToken || !creds.wabaId) {
      return { success: false, error: 'Credenciales Meta no configuradas' }
    }
    metaCreds = { accessToken: creds.accessToken, wabaId: creds.wabaId }
  }

  // Step 1: Uniqueness check (workspace_id + name)
  const { data: existing } = await supabase
    .from('whatsapp_templates')
    .select('id')
    .eq('workspace_id', ctx.workspaceId)
    .eq('name', params.name)
    .maybeSingle()

  if (existing) {
    return {
      success: false,
      error: `Ya existe un template con nombre "${params.name}"`,
    }
  }

  // Step 2: Patch the HEADER component with the provider-appropriate handle.
  //   - 360dialog (default): public Supabase URL (the v2 nuance — byte-identical, Regla 6).
  //   - meta_direct: Meta resumable upload handle ("h") obtained from uploadHeaderHandleMeta.
  //
  // NOTA (2026-04-21): El resumable upload a 360 Dialog (uploadHeaderImage360)
  // devuelve un handle con prefijo "4:..." que Meta Cloud API acepta, pero
  // 360 Dialog v2 rechaza con:
  //   Invalid payload (Value `4:xxx` for `header_handle`, it should be valid url address)
  // Por eso pasamos la URL publica de Supabase Storage. El bucket `whatsapp-media`
  // debe ser publico (o tener una policy permissiva) para que 360 Dialog / Meta
  // puedan descargar la imagen durante la revision.
  let components = params.components
  if (params.headerImage) {
    const headerIdx = components.findIndex((c) => c.type === 'HEADER')
    if (headerIdx === -1 || components[headerIdx].format !== 'IMAGE') {
      return {
        success: false,
        error:
          'HEADER IMAGE requiere archivo pero no se encontro componente HEADER con format=IMAGE',
      }
    }

    let headerHandle: string
    if (provider === 'meta_direct' && metaCreds) {
      // Meta wants a resumable upload handle, not a public URL. Download the
      // bytes from the whatsapp-media bucket and push them through Meta's
      // Resumable Upload API to obtain the permanent "h" handle.
      const appId = process.env.META_APP_ID
      if (!appId) {
        return {
          success: false,
          error: 'META_APP_ID no configurado para subir el header a Meta',
        }
      }
      const { data: blob, error: dlErr } = await supabase.storage
        .from('whatsapp-media')
        .download(params.headerImage.storagePath)
      if (dlErr || !blob) {
        return {
          success: false,
          error: 'No se pudo descargar la imagen del header desde Storage',
        }
      }
      const bytes = await blob.arrayBuffer()
      try {
        const { handle } = await uploadHeaderHandleMeta(
          metaCreds.accessToken,
          appId,
          bytes,
          params.headerImage.mimeType
        )
        headerHandle = handle
      } catch (uploadErr) {
        const msg = uploadErr instanceof Error ? uploadErr.message : 'Error desconocido'
        return {
          success: false,
          error: `No se pudo subir la imagen del header a Meta: ${msg}`,
        }
      }
    } else {
      // 360dialog (default, Regla 6 — byte-identical): public Supabase URL.
      const { data: pub } = supabase.storage
        .from('whatsapp-media')
        .getPublicUrl(params.headerImage.storagePath)

      if (!pub?.publicUrl) {
        return {
          success: false,
          error: 'No se pudo generar URL publica de la imagen del header',
        }
      }
      headerHandle = pub.publicUrl
    }

    // Patch del HEADER component con el handle correspondiente al provider
    components = components.map((c, i) =>
      i === headerIdx
        ? {
            ...c,
            example: {
              ...(c.example || {}),
              header_handle: [headerHandle],
            },
          }
        : c
    )
  }

  // Step 3: Insert local row (PENDING)
  const { data: inserted, error: insErr } = await supabase
    .from('whatsapp_templates')
    .insert({
      workspace_id: ctx.workspaceId,
      name: params.name,
      language: params.language,
      category: params.category,
      status: 'PENDING',
      components,
      variable_mapping: params.variableMapping,
    })
    .select()
    .single()

  if (insErr || !inserted) {
    if (insErr?.code === '23505') {
      return {
        success: false,
        error: `Ya existe un template con nombre "${params.name}"`,
      }
    }
    return {
      success: false,
      error: `Error al insertar template: ${insErr?.message || 'unknown'}`,
    }
  }

  // Step 4: Submit to the resolved provider
  try {
    if (provider === 'meta_direct' && metaCreds) {
      // Meta Cloud API arm (the 131047 fix) — creds resolved from ctx.workspaceId.
      await createTemplateMeta(metaCreds, {
        name: params.name,
        language: params.language,
        category: params.category,
        components,
      })
    } else {
      // 360dialog arm (existing path, zero change — Regla 6)
      await createTemplate360(params.apiKey, {
        name: params.name,
        language: params.language,
        category: params.category,
        components,
      })
    }

    // Step 5: Mark submitted_at
    await supabase
      .from('whatsapp_templates')
      .update({ submitted_at: new Date().toISOString() })
      .eq('id', inserted.id)
      .eq('workspace_id', ctx.workspaceId)

    return { success: true, data: inserted as Template }
  } catch (apiErr) {
    const msg = apiErr instanceof Error ? apiErr.message : 'Error desconocido'

    // Step 6: Mark rejected + store reason (audit trail preserved)
    await supabase
      .from('whatsapp_templates')
      .update({ status: 'REJECTED', rejected_reason: msg })
      .eq('id', inserted.id)
      .eq('workspace_id', ctx.workspaceId)

    const rejector = provider === 'meta_direct' ? 'Meta' : '360 Dialog'
    return {
      success: false,
      error: `${rejector} rechazo el template: ${msg}`,
    }
  }
}

// ============================================================================
// applyTemplateStatusUpdate (WA-09 — Meta webhook push)
// ============================================================================

/**
 * Map a Meta `message_template_status_update` event to the local
 * `whatsapp_templates.status` value (mirror `syncTemplateStatus360`).
 * Meta events: APPROVED | REJECTED | PENDING | PAUSED | DISABLED | FLAGGED.
 * Stored verbatim (uppercase) — the column already carries Meta's status enum.
 */
function mapMetaTemplateEvent(event: string): string {
  return (event || '').toUpperCase()
}

export interface ApplyTemplateStatusUpdateParams {
  /** workspace_id resolved from the WABA id (never from arbitrary payload — T-39-02). */
  workspaceId: string | null
  /** Meta `message_template_name`. */
  name: string
  /** Meta `message_template_language` (e.g. 'es'). */
  language?: string
  /** Meta `event` (APPROVED/REJECTED/...). */
  event: string
  /** Meta `reason` — written to `rejected_reason` on REJECTED/PAUSED/DISABLED. */
  reason?: string | null
}

/**
 * Apply a Meta template-status webhook push to the matching local row (WA-09).
 *
 * Writes `status` (mapped from the event) and, when the event is a
 * negative one (REJECTED/PAUSED/DISABLED/FLAGGED) with a meaningful reason,
 * `rejected_reason`. The row is matched by `(workspace_id, name, language)`;
 * `workspace_id` is resolved from the WABA id by the caller (T-39-02 — never
 * taken from arbitrary payload fields).
 *
 * Regla 3: this is the single mutation chokepoint for the webhook handler — the
 * route never INSERT/UPDATEs `whatsapp_templates` directly.
 */
export async function applyTemplateStatusUpdate(
  params: ApplyTemplateStatusUpdateParams
): Promise<DomainResult<{ updated: boolean }>> {
  // CR-01: Hard-abort when workspace is unknown. Running the UPDATE without a
  // workspace_id scope would flip status across EVERY workspace sharing the same
  // template name (names are not globally unique). The route handler should
  // ack-and-drop (200 to Meta); this function must NEVER run a cross-tenant UPDATE.
  if (!params.workspaceId) {
    console.warn(
      '[wa-templates] applyTemplateStatusUpdate called with null workspaceId — aborting (no cross-tenant UPDATE)'
    )
    return { success: true, data: { updated: false } }
  }

  const supabase = createAdminClient()

  const status = mapMetaTemplateEvent(params.event)
  const reason = params.reason && params.reason !== 'NONE' ? params.reason : null
  const negative =
    status === 'REJECTED' ||
    status === 'PAUSED' ||
    status === 'DISABLED' ||
    status === 'FLAGGED'

  const updatePayload: { status: string; rejected_reason?: string | null } = {
    status,
  }
  // Write the reason on negative events; clear it when the template recovers
  // (APPROVED/PENDING after a prior rejection).
  if (negative) {
    updatePayload.rejected_reason = reason
  } else {
    updatePayload.rejected_reason = null
  }

  // Scope by workspace (T-39-02 + CR-01) ALWAYS — params.workspaceId is
  // guaranteed truthy by the guard above. + language when available. Chained
  // filters narrow the match to exactly one row.
  let query = supabase
    .from('whatsapp_templates')
    .update(updatePayload)
    .eq('workspace_id', params.workspaceId)
    .eq('name', params.name)

  if (params.language) {
    query = query.eq('language', params.language)
  }

  const { error } = await query

  if (error) {
    console.error('[wa-templates] status-update failed:', error.message)
    return { success: false, error: error.message }
  }

  return { success: true, data: { updated: true } }
}

/** A remote template status row from the poll/sync path (Meta or 360dialog list). */
export interface RemoteTemplateStatus {
  name: string
  status?: string
  quality_score?: { score?: string } | null
  rejected_reason?: string | null
}

/**
 * Normalize a Meta/360dialog quality score into the value vocabulary accepted by
 * the `whatsapp_templates_quality_rating_check` CHECK constraint
 * (`HIGH | MEDIUM | LOW | PENDING | NULL`).
 *
 * BUG (2026-06-12 live diagnosis — Varixcenter): Meta's WABA API returns
 * `quality_score.score` in its OWN vocabulary (`GREEN | YELLOW | RED | UNKNOWN`).
 * Writing that raw value into `quality_rating` violated the CHECK constraint
 * (error 23514), which aborted the ENTIRE status UPDATE — so every template whose
 * Meta quality was e.g. `UNKNOWN` stayed PENDING forever even after Meta approved
 * it (Varixcenter: 4 templates APPROVED in Meta, stuck PENDING in MorfX). Mapping
 * to the allowed vocabulary (or NULL for unknown) lets the status persist.
 */
function normalizeQualityRating(score?: string | null): string | null {
  if (!score) return null
  switch (score.toUpperCase()) {
    case 'GREEN':
    case 'HIGH':
      return 'HIGH'
    case 'YELLOW':
    case 'MEDIUM':
      return 'MEDIUM'
    case 'RED':
    case 'LOW':
      return 'LOW'
    // UNKNOWN / anything else → NULL (never block the status sync on quality).
    default:
      return null
  }
}

/**
 * Persist a batch of remote template statuses (poll/sync path — WA-08 fallback).
 *
 * Regla 3 chokepoint for `syncTemplateStatuses` (server action). It previously ran
 * the UPDATE through the request-scoped RLS client, where an RLS-filtered UPDATE
 * silently matches 0 rows and returns NO error — so meta_direct approvals never
 * persisted and the row stayed PENDING forever (2026-06-04 live diagnosis: Meta
 * reported APPROVED, local DB stuck PENDING). Same admin client + workspace scope +
 * status normalization as the webhook push (applyTemplateStatusUpdate). A single
 * row error does not abort the batch.
 *
 * @returns count of rows updated without error.
 */
export async function syncRemoteTemplateStatuses(
  workspaceId: string,
  remote: RemoteTemplateStatus[]
): Promise<DomainResult<{ updated: number }>> {
  if (!workspaceId) {
    return { success: false, error: 'workspaceId requerido' }
  }

  const supabase = createAdminClient()
  let updated = 0

  for (const t of remote) {
    // 360dialog returns lowercase status; Meta returns uppercase — normalize either way.
    const status = (t.status || 'PENDING').toUpperCase()
    const rejected =
      t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null

    const { error } = await supabase
      .from('whatsapp_templates')
      .update({
        status,
        quality_rating: normalizeQualityRating(t.quality_score?.score),
        rejected_reason: rejected,
        approved_at: status === 'APPROVED' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspaceId)
      .eq('name', t.name)

    if (!error) updated++
  }

  return { success: true, data: { updated } }
}

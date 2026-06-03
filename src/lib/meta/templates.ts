// ============================================================================
// Phase 39: Meta Cloud API Template Management (WA-08)
// CRUD over the WhatsApp Business Account message_templates edge + the
// MANDATORY D-05 edit-constraint guard.
//
// Mirrors src/lib/whatsapp/templates-api.ts function-for-function (Regla 6 —
// the 360dialog file is NOT modified), swapping the base URL → Meta Graph
// `{waba_id}/message_templates` and the auth → Bearer via `metaRequest`.
//
// D-05 MANDATORY (RESEARCH "D-05 MANDATORY DELIVERABLE" table):
//   - `name` and `language` are NEVER editable (any status).
//   - edit allowed ONLY when status ∈ {APPROVED, REJECTED, PAUSED}.
//   - PENDING / IN_REVIEW / DISABLED → not editable.
//   - after a successful edit the status flips to PENDING (re-review).
// The guard lives here (T-39-08) so every edit call-site inherits it.
// ============================================================================

import { metaRequest } from './api'
import { META_BASE_URL } from './constants'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/**
 * Per-workspace Meta credentials (resolved from workspaceId upstream, never input — T-39-02).
 */
export interface MetaTemplateCreds {
  accessToken: string
  wabaId: string
  phoneNumberId?: string
}

export type MetaTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'

export interface CreateTemplateMetaParams {
  name: string
  language: string
  category: MetaTemplateCategory
  components: unknown[]
}

export interface MetaTemplate {
  id?: string
  name: string
  status: string
  category?: string
  language?: string
  components?: unknown[]
  quality_score?: { score?: string } | null
  rejected_reason?: string | null
}

export interface ListTemplatesMetaResponse {
  data: MetaTemplate[]
  paging?: { cursors?: { before?: string; after?: string }; next?: string }
}

export interface CreateTemplateMetaResponse {
  id: string
  status: string
  category?: string
}

const LIST_FIELDS = [
  'name',
  'status',
  'category',
  'language',
  'components',
  'quality_score',
  'rejected_reason',
].join(',')

/** Statuses for which Meta permits editing components/category (D-05). */
const EDITABLE_STATUSES = new Set(['APPROVED', 'REJECTED', 'PAUSED'])

// ----------------------------------------------------------------------------
// CRUD
// ----------------------------------------------------------------------------

/**
 * Create a new message template (WA-08, §9). Status is PENDING until Meta reviews.
 * `POST /v22.0/{waba_id}/message_templates`.
 */
export async function createTemplateMeta(
  creds: MetaTemplateCreds,
  params: CreateTemplateMetaParams
): Promise<CreateTemplateMetaResponse> {
  return metaRequest<CreateTemplateMetaResponse>(
    creds.accessToken,
    `/${creds.wabaId}/message_templates`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: params.name,
        language: params.language,
        category: params.category,
        components: params.components,
      }),
    }
  )
}

/**
 * List all templates for the WABA (WA-08).
 * `GET /v22.0/{waba_id}/message_templates?limit=250&fields=...`.
 */
export async function listTemplatesMeta(
  creds: MetaTemplateCreds,
  limit = 250
): Promise<ListTemplatesMetaResponse> {
  return metaRequest<ListTemplatesMetaResponse>(
    creds.accessToken,
    `/${creds.wabaId}/message_templates?limit=${limit}&fields=${LIST_FIELDS}`,
    { method: 'GET' }
  )
}

/**
 * Delete a template by name (WA-08). Deletes all languages of that name.
 * `DELETE /v22.0/{waba_id}/message_templates?name=<name>`.
 */
export async function deleteTemplateMeta(
  creds: MetaTemplateCreds,
  name: string
): Promise<{ success?: boolean }> {
  return metaRequest<{ success?: boolean }>(
    creds.accessToken,
    `/${creds.wabaId}/message_templates?name=${encodeURIComponent(name)}`,
    { method: 'DELETE' }
  )
}

// ----------------------------------------------------------------------------
// Edit (NEW capability) + D-05 guard
// ----------------------------------------------------------------------------

export interface EditTemplateMetaParams {
  templateId: string
  /** Current Meta status of the template — the edit gate (D-05). */
  status: string
  /** Immutable — supplying a value triggers the D-05 reject. */
  name?: string
  /** Immutable — supplying a value triggers the D-05 reject. */
  language?: string
  category?: MetaTemplateCategory
  components?: unknown[]
}

/**
 * Edit an existing template (WA-08, NEW capability). Enforces the MANDATORY D-05
 * constraints at the service layer (T-39-08) — the single enforcement point so
 * every call-site (UI, domain, sync) inherits the same rules:
 *   - `name` / `language` are immutable (any status) → reject.
 *   - status MUST be one of {APPROVED, REJECTED, PAUSED} → otherwise reject.
 * On success Meta flips the status to PENDING (re-review).
 *
 * `POST /v22.0/{message_template_id}` body `{ category?, components? }`.
 */
export async function editTemplateMeta(
  creds: MetaTemplateCreds,
  params: EditTemplateMetaParams
): Promise<{ success?: boolean } & Record<string, unknown>> {
  // D-05 guard 1: name + language are NEVER editable, regardless of status.
  if (params.name !== undefined) {
    throw new Error(
      'Template name is immutable and cannot be edited (D-05). Create a new template instead.'
    )
  }
  if (params.language !== undefined) {
    throw new Error(
      'Template language is immutable and cannot be edited (D-05). Create a new template instead.'
    )
  }

  // D-05 guard 2: edits are status-gated.
  if (!EDITABLE_STATUSES.has(params.status)) {
    throw new Error(
      `Template with status "${params.status}" is not editable (D-05). ` +
        `Only APPROVED, REJECTED, or PAUSED templates can be edited.`
    )
  }

  const body: Record<string, unknown> = {}
  if (params.category !== undefined) body.category = params.category
  if (params.components !== undefined) body.components = params.components

  return metaRequest<{ success?: boolean } & Record<string, unknown>>(
    creds.accessToken,
    `/${params.templateId}`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  )
}

// ----------------------------------------------------------------------------
// Status sync (poll fallback — mirror syncTemplateStatus360)
// ----------------------------------------------------------------------------

/**
 * Poll Meta for a single template's current status (WA-08 sync fallback).
 * Used to reconcile local rows when the webhook push (WA-09) is missed.
 * Mirrors `syncTemplateStatus360` (templates-api.ts:189-208).
 *
 * @returns Status info or null if the template is not found in the WABA.
 */
export async function syncTemplateStatusMeta(
  creds: MetaTemplateCreds,
  name: string
): Promise<{
  status: string
  quality_rating: string | null
  rejected_reason: string | null
} | null> {
  const list = await listTemplatesMeta(creds)
  const template = list.data?.find((t) => t.name === name)

  if (!template) {
    return null
  }

  return {
    status: template.status,
    quality_rating: template.quality_score?.score || null,
    rejected_reason: template.rejected_reason || null,
  }
}

// ----------------------------------------------------------------------------
// Resumable upload for template header media → permanent handle
// ----------------------------------------------------------------------------

export interface UploadHeaderHandleResult {
  /** The "h" handle for components[HEADER].example.header_handle[0]. */
  handle: string
}

/**
 * Upload header media via Meta's Resumable Upload API and obtain the permanent
 * handle required in `components[HEADER].example.header_handle[0]` at create time.
 * Same two-step flow 360dialog proxies (`uploadHeaderImage360`, templates-api.ts:235-291),
 * pointing at Graph directly:
 *   1. POST /{app_id}/uploads?file_length&file_type → { id: "upload:..." }
 *   2. POST /{session_id}  headers file_offset:0    → { h: "<handle>" }
 *
 * Uses dedicated `fetch` calls (not metaRequest) because the byte upload is binary.
 *
 * @param accessToken - Meta access token (decrypted) — only in Bearer headers, never logged (T-39-01).
 * @param appId - Meta App ID owning the upload session
 * @param bytes - Raw media bytes
 * @param mime - 'image/jpeg' | 'image/png' | etc.
 * @param fileName - Informational (Meta surfaces it in the UI)
 */
export async function uploadHeaderHandleMeta(
  accessToken: string,
  appId: string,
  bytes: ArrayBuffer | Uint8Array,
  mime: string,
  fileName = 'header'
): Promise<UploadHeaderHandleResult> {
  const fileLength = bytes.byteLength

  // ---- Step 1: create upload session ----
  const sessionUrl = new URL(`${META_BASE_URL}/${appId}/uploads`)
  sessionUrl.searchParams.set('file_length', String(fileLength))
  sessionUrl.searchParams.set('file_type', mime)
  sessionUrl.searchParams.set('file_name', fileName)

  const sessionRes = await fetch(sessionUrl.toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!sessionRes.ok) {
    const err = await sessionRes.json().catch(() => ({}))
    throw new Error(
      err?.error?.message || `Upload session failed: ${sessionRes.status}`
    )
  }

  const { id: sessionId } = (await sessionRes.json()) as { id: string }
  if (!sessionId) {
    throw new Error(`Unexpected upload session id: ${sessionId}`)
  }

  // ---- Step 2: upload bytes ----
  const uploadRes = await fetch(`${META_BASE_URL}/${sessionId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      file_offset: '0',
    },
    body: bytes as BodyInit,
  })

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}))
    throw new Error(
      err?.error?.message || `Upload bytes failed: ${uploadRes.status}`
    )
  }

  const { h } = (await uploadRes.json()) as { h: string }
  if (!h) throw new Error('Upload response missing handle "h"')

  return { handle: h }
}

// ============================================================================
// Phase 8: 360dialog Template Management API Client
// https://docs.360dialog.com/docs/waba-messaging/template-messaging
// ============================================================================

import type {
  TemplateComponent,
  TemplateCategory,
  ListTemplatesResponse,
  CreateTemplateResponse,
} from './types'

// ============================================================================
// CONSTANTS
// ============================================================================

const BASE_URL = 'https://waba-v2.360dialog.io'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Parameters for creating a template.
 */
export interface CreateTemplateParams {
  name: string
  language: string
  category: TemplateCategory
  components: TemplateComponent[]
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Create a new message template in 360dialog.
 *
 * Templates must be approved by Meta before they can be used.
 * This is an async process - status will be PENDING initially.
 *
 * @param apiKey - 360dialog API key
 * @param params - Template definition
 * @returns Response with template ID and initial status
 */
export async function createTemplate360(
  apiKey: string,
  params: CreateTemplateParams
): Promise<CreateTemplateResponse> {
  const response = await fetch(`${BASE_URL}/v1/configs/templates`, {
    method: 'POST',
    headers: {
      'D360-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: params.name,
      language: params.language,
      category: params.category,
      components: params.components,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      error.error?.message ||
        error.meta?.developer_message ||
        `Template creation failed: ${response.status}`
    )
  }

  return response.json()
}

/**
 * List all templates for the WABA account.
 *
 * @param apiKey - 360dialog API key
 * @param limit - Maximum number of templates to return (default 250)
 * @returns List of templates with their status
 */
export async function listTemplates360(
  apiKey: string,
  limit: number = 250
): Promise<ListTemplatesResponse> {
  const response = await fetch(
    `${BASE_URL}/v1/configs/templates?limit=${limit}`,
    {
      headers: {
        'D360-API-KEY': apiKey,
      },
    }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      error.error?.message || `Failed to list templates: ${response.status}`
    )
  }

  return response.json()
}

/**
 * Get a single template by name.
 *
 * @param apiKey - 360dialog API key
 * @param templateName - Template name
 * @returns Template details or null if not found
 */
export async function getTemplateByName360(
  apiKey: string,
  templateName: string
): Promise<ListTemplatesResponse['waba_templates'][0] | null> {
  const response = await fetch(
    `${BASE_URL}/v1/configs/templates/${templateName}`,
    {
      headers: {
        'D360-API-KEY': apiKey,
      },
    }
  )

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      error.error?.message || `Failed to get template: ${response.status}`
    )
  }

  return response.json()
}

/**
 * Delete a template from 360dialog.
 *
 * Note: Deleted templates cannot be recreated with the same name
 * for a period of time.
 *
 * @param apiKey - 360dialog API key
 * @param templateName - Template name to delete
 * @returns true if deleted, false if not found
 */
export async function deleteTemplate360(
  apiKey: string,
  templateName: string
): Promise<boolean> {
  const response = await fetch(
    `${BASE_URL}/v1/configs/templates/${templateName}`,
    {
      method: 'DELETE',
      headers: {
        'D360-API-KEY': apiKey,
      },
    }
  )

  if (response.status === 404) {
    return false
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      error.error?.message || `Failed to delete template: ${response.status}`
    )
  }

  return true
}

/**
 * Sync template status from 360dialog.
 *
 * Fetches the current status of a template from the API.
 * Used to update local database after Meta approval/rejection.
 *
 * @param apiKey - 360dialog API key
 * @param templateName - Template name to check
 * @returns Updated template status info or null if not found
 */
export async function syncTemplateStatus360(
  apiKey: string,
  templateName: string
): Promise<{
  status: string
  quality_rating: string | null
  rejected_reason: string | null
} | null> {
  const template = await getTemplateByName360(apiKey, templateName)

  if (!template) {
    return null
  }

  return {
    status: template.status,
    quality_rating: template.quality_score?.score || null,
    rejected_reason: template.rejected_reason || null,
  }
}

// ============================================================================
// RESUMABLE UPLOAD (for template IMAGE headers)
// Meta requires a permanent file handle (not URL, not temporary media ID) in
// example.header_handle[0] when creating a template with an IMAGE header.
// 360 Dialog proxies Meta's Resumable Upload API with D360-API-KEY auth.
//
// Two-step flow:
//   1. POST /uploads?file_length=X&file_type=image/jpeg  -> { id: "upload:MTphd..." }
//   2. POST /{session_id}   headers file_offset: 0       -> { h: "4::aW..." }
// ============================================================================

export interface UploadHeaderImageResult {
  handle: string // "4::aW..."
}

/**
 * Upload an image to 360 Dialog and obtain a permanent file handle suitable
 * for use in example.header_handle[0] at template creation time.
 *
 * @param apiKey - Workspace D360-API-KEY
 * @param bytes - Raw image bytes (Uint8Array / Buffer / ArrayBuffer)
 * @param mimeType - 'image/jpeg' | 'image/png'
 * @param fileName - Informational only (360 stores it; Meta uses it in the UI)
 * @returns { handle } - the "h" value from Meta
 */
export async function uploadHeaderImage360(
  apiKey: string,
  bytes: ArrayBuffer | Uint8Array,
  mimeType: 'image/jpeg' | 'image/png',
  fileName: string
): Promise<UploadHeaderImageResult> {
  const fileLength =
    bytes instanceof ArrayBuffer ? bytes.byteLength : bytes.length

  // ---- Step 1: create upload session ----
  const sessionUrl = new URL(`${BASE_URL}/uploads`)
  sessionUrl.searchParams.set('file_length', String(fileLength))
  sessionUrl.searchParams.set('file_type', mimeType)
  sessionUrl.searchParams.set('file_name', fileName)

  const sessionRes = await fetch(sessionUrl.toString(), {
    method: 'POST',
    headers: { 'D360-API-KEY': apiKey },
  })

  if (!sessionRes.ok) {
    const err = await sessionRes.json().catch(() => ({}))
    throw new Error(
      err.error?.message || `Upload session failed: ${sessionRes.status}`
    )
  }

  const { id: sessionId } = (await sessionRes.json()) as { id: string }
  if (!sessionId || !sessionId.startsWith('upload:')) {
    throw new Error(`Unexpected session id format: ${sessionId}`)
  }

  // ---- Step 2: upload bytes ----
  // The session id already contains the "upload:" prefix - the endpoint path
  // uses it as-is per docs.360dialog.com's example.
  const uploadRes = await fetch(`${BASE_URL}/${sessionId}`, {
    method: 'POST',
    headers: {
      'D360-API-KEY': apiKey,
      'file_offset': '0',
      'Content-Type': mimeType,
    },
    body: bytes as BodyInit,
  })

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}))
    throw new Error(
      err.error?.message || `Upload bytes failed: ${uploadRes.status}`
    )
  }

  const { h } = (await uploadRes.json()) as { h: string }
  if (!h) throw new Error('Upload response missing handle "h"')

  return { handle: h }
}

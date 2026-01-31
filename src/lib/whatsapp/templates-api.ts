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

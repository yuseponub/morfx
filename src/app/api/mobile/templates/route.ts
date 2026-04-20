// GET /api/mobile/templates — workspace-scoped list of APPROVED WhatsApp
// templates for the mobile TemplatePicker.
//
// Phase 43 Plan 14. Read-only endpoint (Regla 3 applies to mutations only).
// Uses createAdminClient to bypass RLS and filters by workspace_id from the
// authenticated membership.
//
// Contract: `MobileTemplatesListResponseSchema` in shared/mobile-api/schemas.ts.
//
// Data source: the same `whatsapp_templates` table the web reads via
// `src/app/actions/templates.ts::getApprovedTemplates`. The web's canonical
// spec is mirrored here byte-for-byte — mobile only returns APPROVED rows
// ordered by name. Any other status (PENDING, REJECTED, PAUSED, DISABLED)
// is filtered out because Meta will reject the send at the 360dialog API
// level for non-APPROVED templates.
//
// Regla 6: the web template-send path is NOT modified by this endpoint. The
// mobile send path reuses the existing POST /api/mobile/conversations/:id/
// messages with `templateName` + `templateVariables` (Plan 09 wire contract,
// already consumed by `domain/messages-send-idempotent.ts`).

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

import {
  MobileTemplatesListResponseSchema,
  type MobileTemplate,
  type MobileTemplateComponent,
} from '../../../../../shared/mobile-api/schemas'

import { requireMobileAuth } from '../_lib/auth'
import { toMobileErrorResponse } from '../_lib/errors'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// DB row shape (narrow + typed locally — mirrors the web Template type
// minus the fields we don't surface to mobile).
// ---------------------------------------------------------------------------

type DbCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'

interface RawTemplateComponent {
  type?: string
  format?: string
  text?: string
  // Other fields (example, buttons, etc.) are not surfaced to mobile v1.
  // The web template-preview.tsx renders them, mobile only needs HEADER
  // + BODY + FOOTER text for the preview.
}

interface TemplateRow {
  id: string
  name: string
  language: string
  category: DbCategory
  components: RawTemplateComponent[] | null
  variable_mapping: Record<string, string> | null
}

// ---------------------------------------------------------------------------
// Helpers — component normalization + variable counting.
// ---------------------------------------------------------------------------

/**
 * Count distinct `{{n}}` tokens across HEADER + BODY text. Matches the web's
 * template-send-modal logic — we compute it server-side so the mobile client
 * renders the right number of TextInputs without parsing template text itself.
 */
function countTemplateVariables(
  components: RawTemplateComponent[] | null
): number {
  if (!components) return 0
  let allText = ''
  for (const c of components) {
    const t = typeof c.type === 'string' ? c.type.toUpperCase() : ''
    if ((t === 'HEADER' || t === 'BODY') && typeof c.text === 'string') {
      allText += c.text
    }
  }
  const matches = allText.match(/\{\{(\d+)\}\}/g) ?? []
  const uniq = new Set(matches.map((m) => m.replace(/[{}]/g, '')))
  return uniq.size
}

/**
 * Narrow the raw component to the wire shape. We drop fields the mobile UI
 * does not render in v1 (buttons, examples, media handles) — the web's
 * template-preview is richer; mobile's TemplateVariableSheet only renders
 * HEADER + BODY + FOOTER text.
 */
function normalizeComponents(
  components: RawTemplateComponent[] | null
): MobileTemplateComponent[] {
  if (!components) return []
  const out: MobileTemplateComponent[] = []
  for (const c of components) {
    const type = typeof c.type === 'string' ? c.type.toUpperCase() : null
    if (
      type !== 'HEADER' &&
      type !== 'BODY' &&
      type !== 'FOOTER' &&
      type !== 'BUTTONS'
    ) {
      continue
    }
    const format =
      typeof c.format === 'string' &&
      (c.format === 'TEXT' ||
        c.format === 'IMAGE' ||
        c.format === 'VIDEO' ||
        c.format === 'DOCUMENT')
        ? c.format
        : undefined
    out.push({
      type,
      ...(format ? { format } : {}),
      ...(typeof c.text === 'string' ? { text: c.text } : {}),
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { workspaceId } = await requireMobileAuth(req)
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('whatsapp_templates')
      .select('id, name, language, category, components, variable_mapping')
      .eq('workspace_id', workspaceId)
      .eq('status', 'APPROVED')
      .order('name', { ascending: true })

    if (error) {
      console.error('[mobile-api/templates] query failed', error)
      throw error
    }

    const rows = (data ?? []) as unknown as TemplateRow[]

    const templates: MobileTemplate[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      language: r.language,
      category: r.category,
      components: normalizeComponents(r.components),
      variable_count: countTemplateVariables(r.components),
      variable_mapping:
        r.variable_mapping && typeof r.variable_mapping === 'object'
          ? r.variable_mapping
          : {},
    }))

    const body = MobileTemplatesListResponseSchema.parse({ templates })

    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return toMobileErrorResponse(err)
  }
}

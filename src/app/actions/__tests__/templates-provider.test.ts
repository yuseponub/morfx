/**
 * Provider-aware template MANAGEMENT actions + the MANDATORY D-05 edit experience.
 * Phase 39 Plan 07 (Wave 4) — TDD RED scaffold for actions/templates.ts.
 *
 * Contract under test (actions/templates.ts):
 *   - deleteTemplate / syncTemplateStatuses read `workspaces.whatsapp_provider`:
 *       · 'meta_direct'  → deleteTemplateMeta / syncTemplateStatusMeta (creds from workspaceId, T-39-02).
 *       · '360dialog' (DEFAULT) → deleteTemplate360 / listTemplates360 byte-identical (Regla 6).
 *   - NEW editTemplate action:
 *       · 'meta_direct'  → editTemplateMeta (D-05 guard at the service layer); the action surfaces the
 *         thrown D-05 violation as a clean { error } (no crash). name/language never editable.
 *       · '360dialog'    → no edit endpoint → returns a clear "duplica y recrea" result (no silent fail).
 *   - workspaceId + creds resolve from session/ctx, NEVER from input (T-39-02). Token never logged (T-39-01).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth/request-auth', () => ({
  getRequestAuth: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// 360dialog template CRUD edge — the byte-identical arm we must never disturb (Regla 6).
vi.mock('@/lib/whatsapp/templates-api', () => ({
  listTemplates360: vi.fn(),
  deleteTemplate360: vi.fn(),
}))

// Meta template CRUD + D-05 guard (Plan 03).
vi.mock('@/lib/meta/templates', () => ({
  listTemplatesMeta: vi.fn(),
  deleteTemplateMeta: vi.fn(),
  editTemplateMeta: vi.fn(),
  syncTemplateStatusMeta: vi.fn(),
}))

// Meta credential resolver — keyed by workspaceId, never from input (T-39-02).
vi.mock('@/lib/meta/credentials', () => ({
  resolveByWorkspace: vi.fn(),
}))

// Domain create — not exercised here but imported by the module.
vi.mock('@/lib/domain/whatsapp-templates', () => ({
  createTemplate: vi.fn(),
  // WR-01: editTemplate now reflects the post-edit PENDING status through the domain
  // chokepoint instead of a direct table write.
  applyTemplateStatusUpdate: vi.fn().mockResolvedValue({ success: true, data: { updated: true } }),
}))

// Supabase server client — controls `workspaces.whatsapp_provider` + the template row read,
// and stubs the local delete/update tail.
let currentProvider: '360dialog' | 'meta_direct' = '360dialog'
let templateRow: Record<string, unknown> | null = {
  name: 'mi_template',
  language: 'es',
  status: 'APPROVED',
  submitted_at: '2026-06-01T00:00:00Z',
}

vi.mock('@/lib/supabase/server', () => {
  const makeBuilder = (table: string) => {
    const builder: Record<string, unknown> = {}
    const chain = () => builder
    builder.select = vi.fn(chain)
    builder.eq = vi.fn(chain)
    builder.order = vi.fn(chain)
    builder.update = vi.fn(chain)
    builder.delete = vi.fn(chain)
    builder.single = vi.fn(async () => {
      if (table === 'workspaces') {
        return { data: { whatsapp_provider: currentProvider, settings: { whatsapp_api_key: 'D360_KEY' } }, error: null }
      }
      if (table === 'whatsapp_templates') {
        return { data: templateRow, error: templateRow ? null : { message: 'not found' } }
      }
      return { data: null, error: null }
    })
    // delete()/update() chains terminate on .eq() returning a thenable resolving to no error.
    builder.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null })
    return builder
  }
  return {
    createClient: vi.fn(async () => ({
      from: vi.fn((table: string) => makeBuilder(table)),
    })),
  }
})

import { deleteTemplate, syncTemplateStatuses, editTemplate } from '@/app/actions/templates'
import { getRequestAuth } from '@/lib/auth/request-auth'
import { deleteTemplate360, listTemplates360 } from '@/lib/whatsapp/templates-api'
import {
  deleteTemplateMeta,
  syncTemplateStatusMeta,
  editTemplateMeta,
  listTemplatesMeta,
} from '@/lib/meta/templates'
import { resolveByWorkspace } from '@/lib/meta/credentials'

const mockAuth = getRequestAuth as ReturnType<typeof vi.fn>
const mockDelete360 = deleteTemplate360 as ReturnType<typeof vi.fn>
const mockList360 = listTemplates360 as ReturnType<typeof vi.fn>
const mockDeleteMeta = deleteTemplateMeta as ReturnType<typeof vi.fn>
const mockSyncMeta = syncTemplateStatusMeta as ReturnType<typeof vi.fn>
const mockEditMeta = editTemplateMeta as ReturnType<typeof vi.fn>
const mockListMeta = listTemplatesMeta as ReturnType<typeof vi.fn>
const mockResolveByWorkspace = resolveByWorkspace as ReturnType<typeof vi.fn>

const WS_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490'

beforeEach(() => {
  currentProvider = '360dialog'
  templateRow = {
    name: 'mi_template',
    language: 'es',
    status: 'APPROVED',
    submitted_at: '2026-06-01T00:00:00Z',
  }
  mockAuth.mockResolvedValue({ workspaceId: WS_ID })
  mockResolveByWorkspace.mockResolvedValue({
    accessToken: 'BISUAT_decrypted',
    wabaId: 'WABA_1',
    phoneNumberId: 'PNID_1',
  })
  mockDelete360.mockResolvedValue({ success: true })
  mockList360.mockResolvedValue({ waba_templates: [] })
  mockDeleteMeta.mockResolvedValue({ success: true })
  mockSyncMeta.mockResolvedValue({ status: 'APPROVED', quality_rating: null, rejected_reason: null })
  mockEditMeta.mockResolvedValue({ success: true })
  mockListMeta.mockResolvedValue({
    data: [{ id: 'TPL_META_1', name: 'mi_template', language: 'es', status: 'APPROVED' }],
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// deleteTemplate — provider branch
// ---------------------------------------------------------------------------

describe('deleteTemplate — provider-aware (WA-08)', () => {
  it('360dialog (default) → deleteTemplate360, never deleteTemplateMeta (Regla 6)', async () => {
    currentProvider = '360dialog'
    await deleteTemplate('tpl_id_1')
    expect(mockDelete360).toHaveBeenCalledWith('D360_KEY', 'mi_template')
    expect(mockDeleteMeta).not.toHaveBeenCalled()
  })

  it('meta_direct → deleteTemplateMeta(creds, name), never deleteTemplate360', async () => {
    currentProvider = 'meta_direct'
    await deleteTemplate('tpl_id_1')
    expect(mockDeleteMeta).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'BISUAT_decrypted', wabaId: 'WABA_1' }),
      'mi_template'
    )
    expect(mockDelete360).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// syncTemplateStatuses — provider branch
// ---------------------------------------------------------------------------

describe('syncTemplateStatuses — provider-aware (WA-08)', () => {
  it('360dialog (default) → listTemplates360, never syncTemplateStatusMeta (Regla 6)', async () => {
    currentProvider = '360dialog'
    const res = await syncTemplateStatuses()
    expect(mockList360).toHaveBeenCalledWith('D360_KEY')
    expect(mockSyncMeta).not.toHaveBeenCalled()
    expect('success' in res).toBe(true)
  })

  it('meta_direct → uses listTemplatesMeta/syncTemplateStatusMeta, never listTemplates360', async () => {
    currentProvider = 'meta_direct'
    const res = await syncTemplateStatuses()
    // The meta arm reconciles via Meta (either the list or the per-name poll fallback).
    const usedMeta = mockListMeta.mock.calls.length + mockSyncMeta.mock.calls.length > 0
    expect(usedMeta).toBe(true)
    expect(mockList360).not.toHaveBeenCalled()
    expect('success' in res).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// editTemplate — NEW action + D-05 surfacing
// ---------------------------------------------------------------------------

describe('editTemplate — D-05 edit experience', () => {
  it('meta_direct + APPROVED → editTemplateMeta with resolved templateId + components', async () => {
    currentProvider = 'meta_direct'
    const res = await editTemplate({
      id: 'tpl_id_1',
      components: [{ type: 'BODY', text: 'nuevo cuerpo' }],
    })
    expect(mockEditMeta).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'BISUAT_decrypted', wabaId: 'WABA_1' }),
      expect.objectContaining({
        templateId: 'TPL_META_1',
        status: 'APPROVED',
        components: [{ type: 'BODY', text: 'nuevo cuerpo' }],
      })
    )
    expect('success' in res).toBe(true)
  })

  it('meta_direct surfaces a D-05 throw as a clean { error } (no crash)', async () => {
    currentProvider = 'meta_direct'
    templateRow = { name: 'mi_template', language: 'es', status: 'PENDING', submitted_at: '2026-06-01T00:00:00Z' }
    mockListMeta.mockResolvedValue({
      data: [{ id: 'TPL_META_1', name: 'mi_template', language: 'es', status: 'PENDING' }],
    })
    mockEditMeta.mockRejectedValue(
      new Error('Template with status "PENDING" is not editable (D-05).')
    )
    const res = await editTemplate({ id: 'tpl_id_1', components: [{ type: 'BODY', text: 'x' }] })
    expect('error' in res).toBe(true)
    expect((res as { error: string }).error).toMatch(/D-05|editable|PENDING/i)
  })

  it('editTemplate never accepts a name/language change (immutable, T-39-08)', async () => {
    currentProvider = 'meta_direct'
    await editTemplate({
      id: 'tpl_id_1',
      // @ts-expect-error — name is not part of the editable params surface
      name: 'otro_nombre',
      components: [{ type: 'BODY', text: 'x' }],
    })
    // Whatever the action passes to the service, it must NOT forward a name/language change.
    if (mockEditMeta.mock.calls.length > 0) {
      const passed = mockEditMeta.mock.calls[0][1] as Record<string, unknown>
      expect(passed.name).toBeUndefined()
      expect(passed.language).toBeUndefined()
    }
  })

  it('360dialog → no in-place edit; returns a clear "duplica y recrea" result (not a silent fail)', async () => {
    currentProvider = '360dialog'
    const res = await editTemplate({ id: 'tpl_id_1', components: [{ type: 'BODY', text: 'x' }] })
    expect(mockEditMeta).not.toHaveBeenCalled()
    expect('error' in res).toBe(true)
    expect((res as { error: string }).error).toMatch(/duplic|recrea/i)
  })
})

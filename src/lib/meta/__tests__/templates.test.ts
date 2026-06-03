/**
 * Meta template management CRUD + D-05 edit-status guard (WA-08).
 * Phase 39 Plan 01 (Wave 0) — TDD RED scaffold.
 *
 * Contracts under test (all in `@/lib/meta/templates`, NEW — Plan 03/07; mirror templates-api.ts):
 *   createTemplateMeta(creds, { name, language, category, components }) — POST /v22.0/{waba_id}/message_templates (§9)
 *   listTemplatesMeta(creds)   — GET …/message_templates?limit=250&fields=name,status,category,language,components,quality_score,rejected_reason
 *   deleteTemplateMeta(creds, name) — DELETE …/message_templates?name=<name>
 *   editTemplateMeta(creds, { templateId, status, name?, language?, category?, components? })
 *     — POST /v22.0/{message_template_id} body { category?, components? }
 *     — D-05 MANDATORY GUARD (RESEARCH "D-05 MANDATORY DELIVERABLE" table):
 *         · name and language are NEVER editable (any status) → reject.
 *         · edit allowed ONLY when status ∈ {APPROVED, REJECTED, PAUSED}.
 *         · PENDING / IN_REVIEW / DISABLED → reject (not editable).
 *
 * RED STATE: meta/templates.ts does not exist yet (Plan 03/07) — `await import('@/lib/meta/templates')`
 * rejects ERR_MODULE_NOT_FOUND, the intended Wave 0 RED. We stub global fetch so once the module ships
 * the endpoint shapes are pinned. The D-05 guard cases are the mandatory deliverable — they assert the
 * guard rejects, not just that the happy path works.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { META_BASE_URL } from '@/lib/meta/constants'

const CREDS = { accessToken: 'BISUAT_decrypted', wabaId: 'WABA_1', phoneNumberId: '1134593926408063' }
const APPROVED_BODY = [{ type: 'BODY', text: 'Hola {{1}}', example: { body_text: [['Jose']] } }]

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'TPL_1', status: 'PENDING' }),
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('createTemplateMeta (WA-08) — §9', () => {
  it('POSTs to /{waba_id}/message_templates with name/language/category/components', async () => {
    const mod = await import('@/lib/meta/templates')
    await mod.createTemplateMeta(CREDS, {
      name: 'confirmacion_orden',
      language: 'es',
      category: 'UTILITY',
      components: APPROVED_BODY,
    })

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain(`${META_BASE_URL}/${CREDS.wabaId}/message_templates`)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.method || '').toUpperCase()).toBe('POST')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({
      name: 'confirmacion_orden',
      language: 'es',
      category: 'UTILITY',
      components: APPROVED_BODY,
    })
  })
})

describe('listTemplatesMeta (WA-08)', () => {
  it('GETs message_templates with limit=250 and the full fields set', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) })
    const mod = await import('@/lib/meta/templates')
    await mod.listTemplatesMeta(CREDS)

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain(`/${CREDS.wabaId}/message_templates`)
    expect(url).toContain('limit=250')
    expect(url).toContain('fields=')
    for (const f of ['name', 'status', 'category', 'language', 'components', 'quality_score', 'rejected_reason']) {
      expect(url).toContain(f)
    }
  })
})

describe('deleteTemplateMeta (WA-08)', () => {
  it('DELETEs message_templates?name=<name>', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
    const mod = await import('@/lib/meta/templates')
    await mod.deleteTemplateMeta(CREDS, 'confirmacion_orden')

    const url = String(fetchMock.mock.calls[0][0])
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.method || '').toUpperCase()).toBe('DELETE')
    expect(url).toContain(`/${CREDS.wabaId}/message_templates`)
    expect(url).toContain('name=confirmacion_orden')
  })
})

describe('editTemplateMeta (WA-08) — happy path for editable statuses', () => {
  it('POSTs to /{message_template_id} with category/components when status is APPROVED', async () => {
    const mod = await import('@/lib/meta/templates')
    await mod.editTemplateMeta(CREDS, {
      templateId: 'TPL_1',
      status: 'APPROVED',
      category: 'UTILITY',
      components: APPROVED_BODY,
    })

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toBe(`${META_BASE_URL}/TPL_1`)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.method || '').toUpperCase()).toBe('POST')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({ category: 'UTILITY', components: APPROVED_BODY })
  })

  it('allows edit for REJECTED and PAUSED statuses', async () => {
    const mod = await import('@/lib/meta/templates')
    await expect(
      mod.editTemplateMeta(CREDS, { templateId: 'TPL_1', status: 'REJECTED', components: APPROVED_BODY })
    ).resolves.toBeDefined()
    await expect(
      mod.editTemplateMeta(CREDS, { templateId: 'TPL_1', status: 'PAUSED', components: APPROVED_BODY })
    ).resolves.toBeDefined()
  })
})

describe('editTemplateMeta D-05 GUARD (MANDATORY) — name/language immutable + status-gated', () => {
  it('REJECTS changing the template name (never editable, any status)', async () => {
    const mod = await import('@/lib/meta/templates')
    await expect(
      mod.editTemplateMeta(CREDS, { templateId: 'TPL_1', status: 'APPROVED', name: 'nuevo_nombre' })
    ).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('REJECTS changing the template language (never editable, any status)', async () => {
    const mod = await import('@/lib/meta/templates')
    await expect(
      mod.editTemplateMeta(CREDS, { templateId: 'TPL_1', status: 'APPROVED', language: 'en_US' })
    ).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('REJECTS edit when status is PENDING (not editable)', async () => {
    const mod = await import('@/lib/meta/templates')
    await expect(
      mod.editTemplateMeta(CREDS, { templateId: 'TPL_1', status: 'PENDING', components: APPROVED_BODY })
    ).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('REJECTS edit when status is DISABLED (must recreate)', async () => {
    const mod = await import('@/lib/meta/templates')
    await expect(
      mod.editTemplateMeta(CREDS, { templateId: 'TPL_1', status: 'DISABLED', components: APPROVED_BODY })
    ).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

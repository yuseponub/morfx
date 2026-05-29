// ============================================================================
// Standalone somnio-v4-crm-subloop — Plan 03 (D-24, Pitfall 2)
// Tests unitarios para resolveOrCreateContact (find-or-create por telefono).
//
// Cubre los 4 behaviors del plan:
//   1. resolve existing  — searchContacts retorna un contacto cuyo phone
//      normalizado === phone de entrada → retorna ese id SIN insertar (no dup).
//   2. create new        — searchContacts retorna [] → llama insert (createContact)
//      y retorna el nuevo id con created:true.
//   3. invalid phone     — phone que no normaliza → { success:false, error } sin DB.
//   4. match exacto       — searchContacts retorna contactos por ILIKE nombre/email
//      pero ninguno con phone exacto → crea nuevo (no reusa el contacto erroneo).
//
// Mock pattern: S-4 (orders-duplicate-products.test.ts canonical) — chain de
// createAdminClient → from → select/or/limit (searchContacts) + insert/select/single
// (createContact). El test NO toca DB.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Supabase admin client mock --------------------------------------------
// searchContacts chain:  from('contacts').select(cols).eq('workspace_id', x).or(...).limit(n).is('archived_at', null)
//   → resolves to { data, error }  (awaited)
// createContact chain:   from('contacts').insert({...}).select('id, ...').single()
//   → singleMock
//
// searchResultQueue: cada test empuja el { data, error } que devuelve la query
// de searchContacts (consumido al await del builder). singleMock devuelve el row
// del insert de createContact.

type QueryResult = { data: unknown; error: unknown }
const searchResultQueue: QueryResult[] = []
const singleMock = vi.fn()

// Builder de searchContacts: thenable (await) que soporta el chain .eq().or().limit().is()
// Cada metodo retorna el mismo builder; el await consume searchResultQueue.
function makeSearchBuilder() {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  builder.eq = vi.fn(chain)
  builder.or = vi.fn(chain)
  builder.limit = vi.fn(chain)
  builder.is = vi.fn(chain)
  builder.then = (
    onFulfilled: (v: QueryResult) => unknown,
    onRejected?: (err: unknown) => unknown,
  ) => {
    const result = searchResultQueue.shift() ?? { data: [], error: null }
    try {
      return Promise.resolve(onFulfilled(result))
    } catch (err) {
      if (onRejected) return Promise.resolve(onRejected(err))
      return Promise.reject(err)
    }
  }
  return builder
}

// selectMock: usado por searchContacts (.select(cols) → builder)
const selectMock = vi.fn(() => makeSearchBuilder())

// insertMock: usado por createContact (.insert({...}).select(cols).single())
const insertMock = vi.fn(() => ({
  select: vi.fn(() => ({ single: singleMock })),
}))

const fromMock = vi.fn((_table: string) => ({
  select: selectMock,
  insert: insertMock,
}))

const createAdminClientMock = vi.fn(() => ({ from: fromMock }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClientMock(),
}))

// Stub trigger-emitter — createContact emite contact.created (fire-and-forget).
// Evita hit a Inngest (401 sin EVENT_KEY) en tests.
vi.mock('@/lib/automations/trigger-emitter', () => ({
  emitContactCreated: vi.fn(async () => undefined),
  emitFieldChanged: vi.fn(async () => undefined),
}))

// Importar DESPUES del vi.mock (hoisting de vitest).
import { resolveOrCreateContact } from '@/lib/domain/contacts'
import type { DomainContext } from '@/lib/domain/types'

const ctx: DomainContext = {
  workspaceId: 'ws-test',
  source: 'adapter',
  cascadeDepth: 0,
}

// "3001234567" → normalizePhone → "+573001234567"
const RAW_PHONE = '3001234567'
const NORM_PHONE = '+573001234567'

beforeEach(() => {
  vi.clearAllMocks()
  searchResultQueue.length = 0
  singleMock.mockReset()
})

describe('resolveOrCreateContact (D-24, Pitfall 2)', () => {
  it('resolve existing: phone exacto encontrado → retorna id SIN insertar (no duplicado)', async () => {
    // searchContacts devuelve un contacto cuyo phone normaliza al mismo valor.
    searchResultQueue.push({
      data: [
        { id: 'contact-existing', name: 'Juan', phone: NORM_PHONE, email: null, created_at: '2026-01-01' },
      ],
      error: null,
    })

    const res = await resolveOrCreateContact(ctx, { phone: RAW_PHONE, name: 'Juan' })

    expect(res.success).toBe(true)
    expect(res.data).toEqual({ contactId: 'contact-existing', created: false })
    // createContact NO debe haberse invocado → ningun insert.
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('create new: sin match → invoca createContact (insert) y retorna nuevo id created:true', async () => {
    searchResultQueue.push({ data: [], error: null })
    singleMock.mockResolvedValueOnce({
      data: { id: 'contact-new', name: 'Nuevo', phone: NORM_PHONE, email: null, city: null, department: null, address: null },
      error: null,
    })

    const res = await resolveOrCreateContact(ctx, { phone: RAW_PHONE, name: 'Nuevo' })

    expect(res.success).toBe(true)
    expect(res.data).toEqual({ contactId: 'contact-new', created: true })
    expect(insertMock).toHaveBeenCalledTimes(1)
  })

  it('invalid phone: no normaliza → { success:false, error } sin tocar DB', async () => {
    const res = await resolveOrCreateContact(ctx, { phone: 'abc', name: 'X' })

    expect(res.success).toBe(false)
    expect(res.error).toBeTruthy()
    // No search ni insert: el guard de phone corta antes de tocar DB.
    expect(selectMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('match exacto: ILIKE devuelve contactos por nombre/email pero ningun phone exacto → crea nuevo (no reusa erroneo)', async () => {
    // searchContacts (ILIKE) devuelve un contacto con OTRO telefono (match parcial por nombre).
    searchResultQueue.push({
      data: [
        { id: 'contact-wrong', name: 'Juan', phone: '+573009999999', email: null, created_at: '2026-01-01' },
      ],
      error: null,
    })
    singleMock.mockResolvedValueOnce({
      data: { id: 'contact-correct', name: 'Juan', phone: NORM_PHONE, email: null, city: null, department: null, address: null },
      error: null,
    })

    const res = await resolveOrCreateContact(ctx, { phone: RAW_PHONE, name: 'Juan' })

    expect(res.success).toBe(true)
    // NO reusa contact-wrong; crea uno nuevo con phone exacto.
    expect(res.data).toEqual({ contactId: 'contact-correct', created: true })
    expect(insertMock).toHaveBeenCalledTimes(1)
  })
})

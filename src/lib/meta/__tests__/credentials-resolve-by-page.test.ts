import { describe, it, expect, vi, beforeEach } from 'vitest'

// GAP-41-03 regression: a Facebook Page and its linked Instagram account are stored as
// TWO rows sharing the same page_id (uq_meta_page relaxed to channel='facebook' in
// GAP-41-02). resolveByPageId (Messenger inbound routing) MUST filter channel='facebook'
// so the IG row never makes `.single()` throw PGRST116 and silently drop the FB message.
//
// vi.hoisted avoids the mock-factory hoisting trap (factory runs before module-level vars).
const h = vi.hoisted(() => ({
  eqCalls: [] as Array<[string, unknown]>,
  singleResult: { data: null as unknown },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const b: Record<string, unknown> = {}
    b.from = () => b
    b.select = () => b
    b.eq = (col: string, val: unknown) => {
      h.eqCalls.push([col, val])
      return b
    }
    b.single = () => Promise.resolve(h.singleResult)
    return b
  },
}))

vi.mock('@/lib/meta/token', () => ({
  decryptToken: (t: string) => `dec(${t})`,
}))

import { resolveByPageId } from '@/lib/meta/credentials'

const FB_ROW = {
  workspace_id: 'ws-varix',
  waba_id: null,
  phone_number_id: null,
  phone_number: null,
  page_id: '528898033801678',
  ig_account_id: null,
  business_id: null,
  access_token_encrypted: 'enc-page-token',
}

describe('resolveByPageId — GAP-41-03 (page with both FB + IG rows)', () => {
  beforeEach(() => {
    h.eqCalls.length = 0
    h.singleResult = { data: null }
  })

  it('filters by channel=facebook so the IG row sharing the page_id is ignored', async () => {
    h.singleResult = { data: FB_ROW }
    await resolveByPageId('528898033801678')

    // The fix: the query must constrain page_id + channel='facebook' + is_active.
    expect(h.eqCalls).toContainEqual(['page_id', '528898033801678'])
    expect(h.eqCalls).toContainEqual(['channel', 'facebook'])
    expect(h.eqCalls).toContainEqual(['is_active', true])
  })

  it('resolves the facebook row to credentials (workspace + decrypted page token)', async () => {
    h.singleResult = { data: FB_ROW }
    const creds = await resolveByPageId('528898033801678')

    expect(creds).not.toBeNull()
    expect(creds?.workspaceId).toBe('ws-varix')
    expect(creds?.pageId).toBe('528898033801678')
    expect(creds?.accessToken).toBe('dec(enc-page-token)')
  })

  it('returns null when no facebook row matches (single() data null)', async () => {
    h.singleResult = { data: null }
    const creds = await resolveByPageId('999999999999999')
    expect(creds).toBeNull()
  })
})

/**
 * Unit tests for V4MessagingAdapter (Task 4.2) + the refactored
 * ProductionMessagingAdapter parent class.
 *
 * Test categories:
 *   - Refactor preservation: parent's `send()` behavior is byte-identical
 *     externally — the only structural change is that the abort check and
 *     the post-first-send hook are now overridable. Regla 6 hand-trace.
 *   - V4MessagingAdapter override: replaces Phase 31 hasNewInboundMessage
 *     with checkpoint('ckpt_7_pre_template', ...) when lockHandle is present
 *     (D-08 + RESEARCH Open Question 2 option-a).
 *   - V4MessagingAdapter fail-open: when lockHandle is null (sandbox / fail-open),
 *     defers to parent's Phase 31 behavior (RESEARCH Open Question 5).
 *   - LostLockError: thrown when checkpoint returns lostLock (D-15 zombie defense).
 *   - D-16 LREM-self: onFirstSendCompleted calls removeOwnEntry with the exact
 *     ownPendingEntryJson + flips has_sent_anything via keepTtl SUPPORTED branch.
 *
 * Mocking strategy: uses vi.mock async-factory + __mock retrieval pattern from
 * Plan 01 lock.test.ts — vi.mock factories are HOISTED to the top of the file,
 * so any top-level reference to a let-binding from inside the factory throws
 * "Cannot access X before initialization". The fix: declare a closure mock
 * object INSIDE the factory and re-import it lazily at runtime.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---- interruption-system-v2 mocks (async factory pattern) ----
vi.mock('@/lib/agents/interruption-system-v2/checkpoints', () => {
  return { checkpoint: vi.fn(), __mockCheckpoint: vi.fn() }
})

vi.mock('@/lib/agents/interruption-system-v2/pending', () => ({
  removeOwnEntry: vi.fn(),
}))

vi.mock('@/lib/agents/interruption-system-v2/redis-client', () => ({
  redis: {
    set: vi.fn(),
  },
}))

vi.mock('@/lib/agents/interruption-system-v2/observability', () => ({
  emitLockEvent: vi.fn(),
}))

// Domain message send mocks
vi.mock('@/lib/domain/messages', () => ({
  sendTextMessage: vi.fn(),
  sendMediaMessage: vi.fn(),
}))

// Supabase admin client mock
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

// Suppress logger noise.
vi.mock('@/lib/audit/logger', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Disable typing delay so tests don't actually sleep.
vi.mock('@/lib/agents/somnio/char-delay', () => ({
  calculateCharDelay: () => 0,
}))

// ---- imports under test (AFTER mocks) ----
import { V4MessagingAdapter, LostLockError } from '../v4-messaging-adapter'
import { ProductionMessagingAdapter } from '../messaging'
import { checkpoint } from '@/lib/agents/interruption-system-v2/checkpoints'
import { removeOwnEntry } from '@/lib/agents/interruption-system-v2/pending'
import { redis } from '@/lib/agents/interruption-system-v2/redis-client'
import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
import { sendTextMessage, sendMediaMessage } from '@/lib/domain/messages'
import { createAdminClient } from '@/lib/supabase/admin'

const mockCheckpoint = checkpoint as ReturnType<typeof vi.fn>
const mockRemoveOwnEntry = removeOwnEntry as ReturnType<typeof vi.fn>
const mockRedisSet = redis.set as ReturnType<typeof vi.fn>
const mockEmitLockEvent = emitLockEvent as ReturnType<typeof vi.fn>
const mockSendTextMessage = sendTextMessage as ReturnType<typeof vi.fn>
const mockSendMediaMessage = sendMediaMessage as ReturnType<typeof vi.fn>
const mockCreateAdminClient = createAdminClient as ReturnType<typeof vi.fn>

// ---- helpers ----
function buildSupabaseChain(opts: {
  channel?: 'whatsapp' | 'facebook' | 'instagram'
  externalSubscriberId?: string | null
  hasNewInboundCount?: number
  whatsappApiKey?: string
}) {
  const channel = opts.channel ?? 'whatsapp'
  const externalSubscriberId = opts.externalSubscriberId ?? null
  const hasNewInboundCount = opts.hasNewInboundCount ?? 0
  const whatsappApiKey = opts.whatsappApiKey ?? 'test-api-key'

  const mockFrom = vi.fn((table: string) => {
    if (table === 'conversations') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { channel, external_subscriber_id: externalSubscriberId },
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'workspaces') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                settings: {
                  whatsapp_api_key: whatsappApiKey,
                  manychat_api_key: 'manychat-key',
                },
              },
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'messages') {
      // hasNewInboundMessage head: true count query
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              gt: async () => ({ count: hasNewInboundCount }),
            }),
          }),
        }),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  mockCreateAdminClient.mockReturnValue({ from: mockFrom } as never)
  return mockFrom
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSendTextMessage.mockResolvedValue({ success: true, data: { messageId: 'msg-id' } })
  mockSendMediaMessage.mockResolvedValue({ success: true, data: { messageId: 'msg-id' } })
  process.env.WHATSAPP_API_KEY = 'env-fallback'
})

// ---- ProductionMessagingAdapter (refactored parent) preservation ----

describe('ProductionMessagingAdapter (refactored parent — Regla 6 byte-identical behavior)', () => {
  it('still checks hasNewInboundMessage via Phase 31 DB query when triggerTimestamp present', async () => {
    buildSupabaseChain({ channel: 'whatsapp', hasNewInboundCount: 0 })

    const adapter = new ProductionMessagingAdapter(
      null,
      'conv-1',
      'ws-1',
      '+573001234567',
      0,  // responseSpeed=0 → no delay (skip sleep)
    )
    const result = await adapter.send({
      sessionId: 'sess-1',
      conversationId: 'conv-1',
      messages: ['hello'],
      templates: [{ id: 't1', content: 'hello', contentType: 'texto', delaySeconds: 0 }],
      workspaceId: 'ws-1',
      triggerTimestamp: '2026-05-26T00:00:00.000Z',
    })

    // No new inbound → 1 sent.
    expect(result.messagesSent).toBe(1)
    expect(result.interrupted).toBeUndefined()
    expect(mockSendTextMessage).toHaveBeenCalledTimes(1)
  })

  it('interrupts when hasNewInboundMessage detects a new inbound (Phase 31 preserved)', async () => {
    buildSupabaseChain({ channel: 'whatsapp', hasNewInboundCount: 1 })

    const adapter = new ProductionMessagingAdapter(null, 'conv-1', 'ws-1', '+573001234567', 0)
    const result = await adapter.send({
      sessionId: 'sess-1',
      conversationId: 'conv-1',
      messages: ['hello'],
      templates: [{ id: 't1', content: 'hello', contentType: 'texto', delaySeconds: 0 }],
      workspaceId: 'ws-1',
      triggerTimestamp: '2026-05-26T00:00:00.000Z',
    })

    expect(result.messagesSent).toBe(0)
    expect(result.interrupted).toBe(true)
    expect(result.interruptedAtIndex).toBe(0)
    expect(mockSendTextMessage).not.toHaveBeenCalled()
  })

  it('does NOT invoke checkpoint() (interruption-system-v2 mock untouched) — Regla 6', async () => {
    buildSupabaseChain({ channel: 'whatsapp' })

    const adapter = new ProductionMessagingAdapter(null, 'conv-1', 'ws-1', '+573001234567', 0)
    await adapter.send({
      sessionId: 'sess-1',
      conversationId: 'conv-1',
      messages: ['hello'],
      templates: [{ id: 't1', content: 'hello', contentType: 'texto', delaySeconds: 0 }],
      workspaceId: 'ws-1',
      triggerTimestamp: '2026-05-26T00:00:00.000Z',
    })

    expect(mockCheckpoint).not.toHaveBeenCalled()
    expect(mockRemoveOwnEntry).not.toHaveBeenCalled()
    expect(mockRedisSet).not.toHaveBeenCalled()
  })
})

// ---- V4MessagingAdapter override ----

describe('V4MessagingAdapter — overrides per-template abort check + post-first-send hook', () => {
  const lockHandle = {
    key: 'lock:ws-1:whatsapp:+573001234567',
    holderUuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    startedAt: '2026-05-26T00:00:00.000Z',
  }
  const ownPendingEntryJson = JSON.stringify({
    content: 'hola',
    entry_uuid: 'bbbb',
    msg_id: 'wamid.1',
    received_at: '2026-05-26T00:00:00.000Z',
  })

  it('replaces hasNewInboundMessage with checkpoint("ckpt_7_pre_template") when lockHandle present', async () => {
    buildSupabaseChain({ channel: 'whatsapp' })
    mockCheckpoint.mockResolvedValue({ proceed: true })
    mockRemoveOwnEntry.mockResolvedValue(true)
    mockRedisSet.mockResolvedValue('OK')

    const adapter = new V4MessagingAdapter(
      null,
      'conv-1',
      'ws-1',
      '+573001234567',
      0,
      lockHandle,
      ownPendingEntryJson,
    )
    const result = await adapter.send({
      sessionId: 'sess-1',
      conversationId: 'conv-1',
      messages: ['hello'],
      templates: [
        { id: 't1', content: 'hello', contentType: 'texto', delaySeconds: 0 },
        { id: 't2', content: 'world', contentType: 'texto', delaySeconds: 0 },
      ],
      workspaceId: 'ws-1',
      triggerTimestamp: '2026-05-26T00:00:00.000Z',
    })

    expect(result.messagesSent).toBe(2)
    // Two templates → checkpoint called twice (before each template).
    expect(mockCheckpoint).toHaveBeenCalledTimes(2)
    expect(mockCheckpoint).toHaveBeenNthCalledWith(
      1,
      'ckpt_7_pre_template',
      lockHandle,
      'ws-1',
      'whatsapp',
      '+573001234567',
      { templateIndex: 0, hasSentAnything: false },
    )
    expect(mockCheckpoint).toHaveBeenNthCalledWith(
      2,
      'ckpt_7_pre_template',
      lockHandle,
      'ws-1',
      'whatsapp',
      '+573001234567',
      { templateIndex: 1, hasSentAnything: true },
    )
  })

  it('returns interrupted when checkpoint signals interrupt (Path B detection)', async () => {
    buildSupabaseChain({ channel: 'whatsapp' })
    // First template: proceed. Second: interrupt detected.
    mockCheckpoint
      .mockResolvedValueOnce({ proceed: true })
      .mockResolvedValueOnce({
        proceed: false,
        interrupted: { interruptMsgId: 'wamid.follower', pendingListLength: 1 },
      })
    mockRemoveOwnEntry.mockResolvedValue(true)
    mockRedisSet.mockResolvedValue('OK')

    const adapter = new V4MessagingAdapter(
      null,
      'conv-1',
      'ws-1',
      '+573001234567',
      0,
      lockHandle,
      ownPendingEntryJson,
    )
    const result = await adapter.send({
      sessionId: 'sess-1',
      conversationId: 'conv-1',
      messages: ['hello', 'world'],
      templates: [
        { id: 't1', content: 'hello', contentType: 'texto', delaySeconds: 0 },
        { id: 't2', content: 'world', contentType: 'texto', delaySeconds: 0 },
      ],
      workspaceId: 'ws-1',
      triggerTimestamp: '2026-05-26T00:00:00.000Z',
    })

    expect(result.messagesSent).toBe(1)
    expect(result.interrupted).toBe(true)
    expect(result.interruptedAtIndex).toBe(1)
  })

  it('THROWS LostLockError when checkpoint returns { lostLock: true } (D-15 zombie defense)', async () => {
    buildSupabaseChain({ channel: 'whatsapp' })
    mockCheckpoint.mockResolvedValueOnce({ proceed: false, lostLock: true })

    const adapter = new V4MessagingAdapter(
      null,
      'conv-1',
      'ws-1',
      '+573001234567',
      0,
      lockHandle,
      ownPendingEntryJson,
    )

    await expect(
      adapter.send({
        sessionId: 'sess-1',
        conversationId: 'conv-1',
        messages: ['hello'],
        templates: [{ id: 't1', content: 'hello', contentType: 'texto', delaySeconds: 0 }],
        workspaceId: 'ws-1',
        triggerTimestamp: '2026-05-26T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(LostLockError)

    expect(mockSendTextMessage).not.toHaveBeenCalled()
  })

  it('FAILS OPEN to parent Phase 31 behavior when lockHandle is null', async () => {
    const mockFrom = buildSupabaseChain({ channel: 'whatsapp', hasNewInboundCount: 0 })

    const adapter = new V4MessagingAdapter(
      null,
      'conv-1',
      'ws-1',
      '+573001234567',
      0,
      null, // ← null lockHandle (fail-open)
      null,
    )
    const result = await adapter.send({
      sessionId: 'sess-1',
      conversationId: 'conv-1',
      messages: ['hello'],
      templates: [{ id: 't1', content: 'hello', contentType: 'texto', delaySeconds: 0 }],
      workspaceId: 'ws-1',
      triggerTimestamp: '2026-05-26T00:00:00.000Z',
    })

    expect(result.messagesSent).toBe(1)
    // checkpoint NEVER called when lockHandle null.
    expect(mockCheckpoint).not.toHaveBeenCalled()
    // ... but parent's hasNewInboundMessage DID fire (Phase 31 fallback).
    expect(mockFrom).toHaveBeenCalledWith('messages')
  })

  it('D-16: calls removeOwnEntry(exactJson) after first successful send', async () => {
    buildSupabaseChain({ channel: 'whatsapp' })
    mockCheckpoint.mockResolvedValue({ proceed: true })
    mockRemoveOwnEntry.mockResolvedValue(true)
    mockRedisSet.mockResolvedValue('OK')

    const adapter = new V4MessagingAdapter(
      null,
      'conv-1',
      'ws-1',
      '+573001234567',
      0,
      lockHandle,
      ownPendingEntryJson,
    )
    await adapter.send({
      sessionId: 'sess-1',
      conversationId: 'conv-1',
      messages: ['hello', 'world'],
      templates: [
        { id: 't1', content: 'hello', contentType: 'texto', delaySeconds: 0 },
        { id: 't2', content: 'world', contentType: 'texto', delaySeconds: 0 },
      ],
      workspaceId: 'ws-1',
      triggerTimestamp: '2026-05-26T00:00:00.000Z',
    })

    // removeOwnEntry fires EXACTLY ONCE (after first send, not the second).
    expect(mockRemoveOwnEntry).toHaveBeenCalledTimes(1)
    expect(mockRemoveOwnEntry).toHaveBeenCalledWith(
      'ws-1',
      'whatsapp',
      '+573001234567',
      ownPendingEntryJson,
    )
  })

  it('D-15 + REVISION W7: flips has_sent_anything=true in lock value via keepTtl SUPPORTED branch', async () => {
    buildSupabaseChain({ channel: 'whatsapp' })
    mockCheckpoint.mockResolvedValue({ proceed: true })
    mockRemoveOwnEntry.mockResolvedValue(true)
    mockRedisSet.mockResolvedValue('OK')

    const adapter = new V4MessagingAdapter(
      null,
      'conv-1',
      'ws-1',
      '+573001234567',
      0,
      lockHandle,
      ownPendingEntryJson,
    )
    await adapter.send({
      sessionId: 'sess-1',
      conversationId: 'conv-1',
      messages: ['hello'],
      templates: [{ id: 't1', content: 'hello', contentType: 'texto', delaySeconds: 0 }],
      workspaceId: 'ws-1',
      triggerTimestamp: '2026-05-26T00:00:00.000Z',
    })

    expect(mockRedisSet).toHaveBeenCalledTimes(1)
    const [key, value, opts] = mockRedisSet.mock.calls[0]
    expect(key).toBe(lockHandle.key)
    const parsed = JSON.parse(value as string)
    expect(parsed).toEqual({
      holder_uuid: lockHandle.holderUuid,
      started_at: lockHandle.startedAt,
      has_sent_anything: true,
    })
    expect(opts).toEqual({ keepTtl: true })
  })

  it('skips LREM-self + lock value flip when ownPendingEntryJson is null (fail-open)', async () => {
    buildSupabaseChain({ channel: 'whatsapp' })
    mockCheckpoint.mockResolvedValue({ proceed: true })

    const adapter = new V4MessagingAdapter(
      null,
      'conv-1',
      'ws-1',
      '+573001234567',
      0,
      lockHandle,
      null, // ← no ownPendingEntryJson
    )
    await adapter.send({
      sessionId: 'sess-1',
      conversationId: 'conv-1',
      messages: ['hello'],
      templates: [{ id: 't1', content: 'hello', contentType: 'texto', delaySeconds: 0 }],
      workspaceId: 'ws-1',
      triggerTimestamp: '2026-05-26T00:00:00.000Z',
    })

    expect(mockRemoveOwnEntry).not.toHaveBeenCalled()
    expect(mockRedisSet).not.toHaveBeenCalled()
  })

  it('LREM-self failures are swallowed (fail-open) — emits redis_unavailable_fallback_failed', async () => {
    buildSupabaseChain({ channel: 'whatsapp' })
    mockCheckpoint.mockResolvedValue({ proceed: true })
    mockRemoveOwnEntry.mockRejectedValue(new Error('upstash transient'))
    mockRedisSet.mockResolvedValue('OK')

    const adapter = new V4MessagingAdapter(
      null,
      'conv-1',
      'ws-1',
      '+573001234567',
      0,
      lockHandle,
      ownPendingEntryJson,
    )
    const result = await adapter.send({
      sessionId: 'sess-1',
      conversationId: 'conv-1',
      messages: ['hello'],
      templates: [{ id: 't1', content: 'hello', contentType: 'texto', delaySeconds: 0 }],
      workspaceId: 'ws-1',
      triggerTimestamp: '2026-05-26T00:00:00.000Z',
    })

    expect(result.messagesSent).toBe(1) // send still succeeds
    expect(mockEmitLockEvent).toHaveBeenCalledWith(
      'redis_unavailable_fallback_failed',
      expect.objectContaining({ at_step: 'lrem_self_after_first_send' }),
    )
  })
})

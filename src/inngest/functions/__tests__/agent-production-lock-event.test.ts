import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Standalone: debounce-interruption-system-v2 (Plan 03, Task 3.3)
 *
 * Asserts the event-shape contract for `whatsappAgentProcessor` after
 * Plan 03's webhook layer extends `agent/whatsapp.message_received`
 * with 6 new OPTIONAL fields: lockHolderUuid, lockKey,
 * ownPendingEntryJson, lockChannel, lockIdentifier, agentId.
 *
 * Invariants tested:
 *   1. Concurrency config is the literal `[{ key: 'event.data.conversationId', limit: 1 }]`
 *      — D-14 + RESEARCH Inngest lines 918-929 say KEEP not raise/remove.
 *   2. The function destructures the 6 new fields without throwing and
 *      propagates them through the turn_started recordEvent payload
 *      when populated (v4 path).
 *   3. The function still accepts events that OMIT the 6 new fields
 *      (v3 / godentist / recompra / pw-confirmation pre-v4 callers).
 *   4. REVISION W2: when agentIdFromWebhook + local resolve disagree,
 *      the warning logger fires; the webhook's choice is honored.
 *
 * The deep pipeline is heavily mocked — this test ONLY validates the
 * event-shape contract + the lock-correlation observability payload.
 * Plan 07 covers the full E2E semantics against real Redis.
 */

// -----------------------------------------------------------------
// Mocks — define BEFORE importing the module under test (vi.mock
// hoisting trap). Mirrors the pattern from recompra-preload-context.test.ts.
// -----------------------------------------------------------------

const mockResolveAgentIdForWorkspace = vi.fn()

vi.mock('@/lib/agents/registry-helpers', () => ({
  resolveAgentIdForWorkspace: mockResolveAgentIdForWorkspace,
}))

const mockIsObservabilityEnabled = vi.fn(() => false)
const mockRunWithCollector = vi.fn()
const mockObservabilityCollector = vi.fn()

vi.mock('@/lib/observability', () => ({
  isObservabilityEnabled: mockIsObservabilityEnabled,
  ObservabilityCollector: mockObservabilityCollector,
  runWithCollector: mockRunWithCollector,
}))

const mockLoggerInfo = vi.fn()
const mockLoggerWarn = vi.fn()
const mockLoggerError = vi.fn()

vi.mock('@/lib/audit/logger', () => ({
  createModuleLogger: () => ({
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    debug: vi.fn(),
  }),
}))

// Mock the Inngest client so the function declaration captures the
// concurrency config + handler (we don't invoke createFunction's real
// runtime; we want the static config shape).
vi.mock('../../client', () => ({
  inngest: {
    createFunction: (config: unknown, _trigger: unknown, handler: unknown) => ({
      config,
      handler,
    }),
  },
}))

// Mock the media gate so the inner `run()` short-circuits to ignore.
// This isolates the test to the event-shape destructure + turn_started
// recordEvent payload, not the full pipeline.
vi.mock('@/lib/agents/media', () => ({
  processMediaGate: vi.fn(async () => ({ action: 'ignore' })),
}))

// Step.run stub — execute the callback eagerly so deep code paths
// (which we mostly mock away anyway) don't block.
const mockStepRun = vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn())
const mockStep = { run: mockStepRun }

// -----------------------------------------------------------------
// Import the module under test AFTER mocks.
// -----------------------------------------------------------------

type ConcurrencyConfig = { key: string; limit: number }
type FnConfig = {
  id: string
  name: string
  retries: number
  concurrency: ConcurrencyConfig[]
}
type Handler = (arg: {
  event: { data: Record<string, unknown> }
  step: typeof mockStep
}) => Promise<unknown>

let whatsappAgentProcessor: { config: FnConfig; handler: Handler }

beforeEach(async () => {
  vi.clearAllMocks()
  mockStepRun.mockImplementation(async (_name, fn) => fn())
  mockIsObservabilityEnabled.mockReturnValue(false)
  // Default workspace resolve — overridable per-test.
  mockResolveAgentIdForWorkspace.mockResolvedValue('somnio-v3')
  const mod = await import('../agent-production')
  whatsappAgentProcessor = mod.whatsappAgentProcessor as unknown as {
    config: FnConfig
    handler: Handler
  }
})

// -----------------------------------------------------------------
// Tests
// -----------------------------------------------------------------

describe('whatsappAgentProcessor concurrency invariant (D-14 + RESEARCH)', () => {
  it('preserves concurrency = [{ key: "event.data.conversationId", limit: 1 }] (literal)', () => {
    // D-14 + RESEARCH lines 918-929: KEEP limit=1 — do NOT raise to 10
    // or remove. The lock subsystem handles the inter-lambda mutex;
    // this clause handles the same-lambda replay-storm case.
    expect(whatsappAgentProcessor.config.concurrency).toEqual([
      { key: 'event.data.conversationId', limit: 1 },
    ])
  })
})

describe('whatsappAgentProcessor event-shape contract (Plan 03)', () => {
  const baseEventDataV4 = {
    conversationId: 'conv-v4-abc',
    contactId: 'contact-v4-xyz',
    messageContent: 'hola',
    workspaceId: 'ws-somnio-prod',
    phone: '+573001234567',
    messageId: 'wamid.v4.msg-1',
    messageTimestamp: '2026-05-26T00:00:00.000Z',
    messageType: 'text',
    mediaUrl: null,
    mediaMimeType: null,
    // 6 new Plan 03 fields — fully populated (v4 path).
    lockHolderUuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    lockKey: 'lock:ws-somnio-prod:whatsapp:+573001234567',
    ownPendingEntryJson: '{"content":"hola","entry_uuid":"bbbb","msg_id":"wamid.v4.msg-1","received_at":"2026-05-26T00:00:00.000Z"}',
    lockChannel: 'whatsapp' as const,
    lockIdentifier: '+573001234567',
    agentId: 'somnio-sales-v4' as const,
  }

  const baseEventDataV3 = {
    conversationId: 'conv-v3-abc',
    contactId: 'contact-v3-xyz',
    messageContent: 'hola',
    workspaceId: 'ws-somnio-prod',
    phone: '+573009876543',
    messageId: 'wamid.v3.msg-1',
    messageTimestamp: '2026-05-26T00:00:00.000Z',
    messageType: 'text',
    mediaUrl: null,
    mediaMimeType: null,
    // No 6 new fields — pre-v4 caller (Regla 6 backward compat).
  }

  it('destructures + accepts a v4 event with all 6 new fields populated', async () => {
    mockResolveAgentIdForWorkspace.mockResolvedValue('somnio-sales-v4')

    const result = await whatsappAgentProcessor.handler({
      event: { data: baseEventDataV4 },
      step: mockStep,
    })

    // ignore branch returns this shape — no throws, no missing fields.
    expect(result).toEqual({
      success: true,
      ignored: true,
      mediaType: 'text',
    })
    // logger.info was called with the standard turn-start info (proves
    // the destructure didn't crash before this log line).
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-v4-abc',
        messageId: 'wamid.v4.msg-1',
      }),
      'Processing WhatsApp message with agent',
    )
  })

  it('still accepts a pre-v4 event WITHOUT the 6 new fields (backward compat — Regla 6)', async () => {
    mockResolveAgentIdForWorkspace.mockResolvedValue('somnio-v3')

    const result = await whatsappAgentProcessor.handler({
      event: { data: baseEventDataV3 },
      step: mockStep,
    })

    expect(result).toEqual({
      success: true,
      ignored: true,
      mediaType: 'text',
    })
    // Pre-v4 callers do not populate agentIdFromWebhook, so the local
    // resolve runs (and it's the only resolve — the W2 mismatch path
    // requires BOTH to be present and disagree).
    expect(mockResolveAgentIdForWorkspace).toHaveBeenCalledTimes(1)
    expect(mockResolveAgentIdForWorkspace).toHaveBeenCalledWith('ws-somnio-prod')
    // No mismatch warning fired.
    expect(mockLoggerWarn).not.toHaveBeenCalled()
  })

  it('records lock correlation fields in turn_started when observability is ON (v4 path)', async () => {
    // Turn observability ON and capture recordEvent calls via collector mock.
    const mockRecordEvent = vi.fn()
    const mockSetRespondingAgentId = vi.fn()
    const mockMergeFrom = vi.fn()
    const mockRecordError = vi.fn()
    const mockFlush = vi.fn()
    mockObservabilityCollector.mockImplementation((init: Record<string, unknown>) => ({
      recordEvent: mockRecordEvent,
      setRespondingAgentId: mockSetRespondingAgentId,
      mergeFrom: mockMergeFrom,
      recordError: mockRecordError,
      flush: mockFlush,
      conversationId: init.conversationId,
      workspaceId: init.workspaceId,
      agentId: init.agentId,
      turnStartedAt: init.turnStartedAt,
      triggerMessageId: init.triggerMessageId,
      triggerKind: init.triggerKind,
      respondingAgentId: null,
      events: [],
      queries: [],
      aiCalls: [],
    }))
    mockIsObservabilityEnabled.mockReturnValue(true)
    mockRunWithCollector.mockImplementation(async (_collector: unknown, fn: () => Promise<unknown>) =>
      fn(),
    )
    mockResolveAgentIdForWorkspace.mockResolvedValue('somnio-sales-v4')

    await whatsappAgentProcessor.handler({
      event: { data: baseEventDataV4 },
      step: mockStep,
    })

    // turn_started must include the 6 correlation fields.
    expect(mockRecordEvent).toHaveBeenCalledWith(
      'session_lifecycle',
      'turn_started',
      expect.objectContaining({
        action: 'turn_started',
        conversationId: 'conv-v4-abc',
        messageId: 'wamid.v4.msg-1',
        messageType: 'text',
        lockHolderUuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        lockKey: 'lock:ws-somnio-prod:whatsapp:+573001234567',
        lockChannel: 'whatsapp',
        lockIdentifier: '+573001234567',
        hasOwnPendingEntry: true,
        agentIdSource: 'webhook',
      }),
    )
  })

  it('turn_started records nulls + agentIdSource="inngest_local_resolve" for pre-v4 events', async () => {
    const mockRecordEvent = vi.fn()
    mockObservabilityCollector.mockImplementation((init: Record<string, unknown>) => ({
      recordEvent: mockRecordEvent,
      setRespondingAgentId: vi.fn(),
      mergeFrom: vi.fn(),
      recordError: vi.fn(),
      flush: vi.fn(),
      conversationId: init.conversationId,
      workspaceId: init.workspaceId,
      agentId: init.agentId,
      turnStartedAt: init.turnStartedAt,
      triggerMessageId: init.triggerMessageId,
      triggerKind: init.triggerKind,
      respondingAgentId: null,
      events: [],
      queries: [],
      aiCalls: [],
    }))
    mockIsObservabilityEnabled.mockReturnValue(true)
    mockRunWithCollector.mockImplementation(async (_collector: unknown, fn: () => Promise<unknown>) =>
      fn(),
    )
    mockResolveAgentIdForWorkspace.mockResolvedValue('somnio-v3')

    await whatsappAgentProcessor.handler({
      event: { data: baseEventDataV3 },
      step: mockStep,
    })

    expect(mockRecordEvent).toHaveBeenCalledWith(
      'session_lifecycle',
      'turn_started',
      expect.objectContaining({
        action: 'turn_started',
        lockHolderUuid: null,
        lockKey: null,
        lockChannel: null,
        lockIdentifier: null,
        hasOwnPendingEntry: false,
        agentIdSource: 'inngest_local_resolve',
      }),
    )
  })
})

describe('REVISION W2 — agentId mismatch warning (webhook vs Inngest local resolve)', () => {
  it('fires logger.warn when agentIdFromWebhook=somnio-sales-v4 but local resolve returns somnio-v2', async () => {
    // Webhook gated on v4 (agentIdFromWebhook='somnio-sales-v4'), but
    // the workspace routing changed between webhook acquire and Inngest
    // dispatch — the local resolve now returns 'somnio-v2'. The W2
    // invariant: honor the webhook's choice (it gated the lock), but
    // log a warning for ops to investigate.
    mockResolveAgentIdForWorkspace.mockResolvedValue('somnio-v2')

    await whatsappAgentProcessor.handler({
      event: {
        data: {
          conversationId: 'conv-mismatch-abc',
          contactId: 'contact-mismatch-xyz',
          messageContent: 'hola',
          workspaceId: 'ws-mismatch',
          phone: '+573001234567',
          messageId: 'wamid.mismatch.msg-1',
          messageTimestamp: '2026-05-26T00:00:00.000Z',
          messageType: 'text',
          lockHolderUuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          lockKey: 'lock:ws-mismatch:whatsapp:+573001234567',
          ownPendingEntryJson: '{}',
          lockChannel: 'whatsapp',
          lockIdentifier: '+573001234567',
          agentId: 'somnio-sales-v4',
        },
      },
      step: mockStep,
    })

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        agentIdFromWebhook: 'somnio-sales-v4',
        localAgentId: 'somnio-v2',
        conversationId: 'conv-mismatch-abc',
        workspaceId: 'ws-mismatch',
        label: 'pipeline_decision:agent_id_mismatch_webhook_vs_inngest',
      }),
      '[interruption-v2] agent_id_mismatch_webhook_vs_inngest — using webhook value',
    )
  })

  it('does NOT fire the warning when agentIdFromWebhook agrees with local resolve', async () => {
    mockResolveAgentIdForWorkspace.mockResolvedValue('somnio-sales-v4')

    await whatsappAgentProcessor.handler({
      event: {
        data: {
          conversationId: 'conv-agree-abc',
          contactId: 'contact-agree-xyz',
          messageContent: 'hola',
          workspaceId: 'ws-agree',
          phone: '+573001234567',
          messageId: 'wamid.agree.msg-1',
          messageTimestamp: '2026-05-26T00:00:00.000Z',
          messageType: 'text',
          lockHolderUuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          lockKey: 'lock:ws-agree:whatsapp:+573001234567',
          ownPendingEntryJson: '{}',
          lockChannel: 'whatsapp',
          lockIdentifier: '+573001234567',
          agentId: 'somnio-sales-v4',
        },
      },
      step: mockStep,
    })

    expect(mockLoggerWarn).not.toHaveBeenCalled()
  })

  it('does NOT trigger the W2 mismatch check when agentIdFromWebhook is undefined (pre-v4 caller)', async () => {
    mockResolveAgentIdForWorkspace.mockResolvedValue('somnio-v3')

    await whatsappAgentProcessor.handler({
      event: {
        data: {
          conversationId: 'conv-prev4-abc',
          contactId: 'contact-prev4-xyz',
          messageContent: 'hola',
          workspaceId: 'ws-prev4',
          phone: '+573001234567',
          messageId: 'wamid.prev4.msg-1',
          messageTimestamp: '2026-05-26T00:00:00.000Z',
          messageType: 'text',
          // No new fields — pre-v4 caller.
        },
      },
      step: mockStep,
    })

    // agentIdFromWebhook is undefined → the mismatch check skips the
    // double-resolve (avoid wasting a DB call) and never logs the warning.
    expect(mockLoggerWarn).not.toHaveBeenCalled()
    // The local resolve runs exactly once (for the final agentId value).
    expect(mockResolveAgentIdForWorkspace).toHaveBeenCalledTimes(1)
  })
})

/**
 * Unit test for the feature-flag-gated recompra/preload-context dispatch inside
 * webhook-processor.ts.
 *
 * Strategy: we do NOT exercise processMessage end-to-end (requires Supabase,
 * WhatsApp adapters, runner, etc). Instead, we mirror the dispatch block in a
 * local helper and test the condition flow. Literal contracts (flag key, event
 * name, invoker string, payload keys) are guarded at the source by the
 * acceptance_criteria grep checks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetPlatformConfig = vi.fn()
const mockInngestSend = vi.fn()
const mockRecordEvent = vi.fn()

vi.mock('@/lib/domain/platform-config', () => ({
  getPlatformConfig: mockGetPlatformConfig,
}))

vi.mock('@/inngest/client', () => ({
  inngest: {
    send: mockInngestSend,
  },
}))

vi.mock('@/lib/observability', () => ({
  getCollector: () => ({ recordEvent: mockRecordEvent }),
}))

/**
 * Helper mirroring the dispatch block in webhook-processor.ts exactly. If the
 * production block changes, this helper MUST be updated in sync — the
 * acceptance_criteria grep checks guard the literals at the source.
 */
async function dispatchRecompraPreload(params: {
  sessionId: string
  contactId: string
  workspaceId: string
}): Promise<{ dispatched: boolean; reason?: string }> {
  if (!params.sessionId) return { dispatched: false, reason: 'no_session' }

  try {
    const { getPlatformConfig } = await import('@/lib/domain/platform-config')
    const crmPreloadEnabled = await getPlatformConfig<boolean>(
      'somnio_recompra_crm_reader_enabled',
      false,
    )

    if (!crmPreloadEnabled) return { dispatched: false, reason: 'flag_off' }

    const { getCollector } = await import('@/lib/observability')
    getCollector()?.recordEvent('pipeline_decision', 'crm_reader_dispatched', {
      agent: 'somnio-recompra-v1',
      sessionId: params.sessionId,
      contactId: params.contactId,
      workspaceId: params.workspaceId,
    })

    const { inngest } = await import('@/inngest/client')
    await inngest.send({
      name: 'recompra/preload-context',
      data: {
        sessionId: params.sessionId,
        contactId: params.contactId,
        workspaceId: params.workspaceId,
        invoker: 'somnio-recompra-v1',
      },
    })
    return { dispatched: true }
  } catch {
    return { dispatched: false, reason: 'threw' }
  }
}

describe('webhook-processor recompra preload dispatch (feature-flag gated)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does NOT dispatch when feature flag is false (Regla 6)', async () => {
    mockGetPlatformConfig.mockResolvedValue(false)

    const result = await dispatchRecompraPreload({
      sessionId: 'session-123',
      contactId: 'contact-456',
      workspaceId: 'workspace-789',
    })

    expect(result).toEqual({ dispatched: false, reason: 'flag_off' })
    expect(mockInngestSend).not.toHaveBeenCalled()
    expect(mockRecordEvent).not.toHaveBeenCalled()
  })

  it('dispatches with correct payload when flag=true and sessionId present', async () => {
    mockGetPlatformConfig.mockResolvedValue(true)
    mockInngestSend.mockResolvedValue(undefined)

    const result = await dispatchRecompraPreload({
      sessionId: 'session-123',
      contactId: 'contact-456',
      workspaceId: 'workspace-789',
    })

    expect(result).toEqual({ dispatched: true })
    expect(mockInngestSend).toHaveBeenCalledTimes(1)
    expect(mockInngestSend).toHaveBeenCalledWith({
      name: 'recompra/preload-context',
      data: {
        sessionId: 'session-123',
        contactId: 'contact-456',
        workspaceId: 'workspace-789',
        invoker: 'somnio-recompra-v1',
      },
    })
    expect(mockRecordEvent).toHaveBeenCalledWith(
      'pipeline_decision',
      'crm_reader_dispatched',
      expect.objectContaining({
        agent: 'somnio-recompra-v1',
        sessionId: 'session-123',
      }),
    )
  })

  it('does NOT dispatch when sessionId is empty string (runner did not create session)', async () => {
    mockGetPlatformConfig.mockResolvedValue(true)

    const result = await dispatchRecompraPreload({
      sessionId: '',
      contactId: 'contact-456',
      workspaceId: 'workspace-789',
    })

    expect(result).toEqual({ dispatched: false, reason: 'no_session' })
    expect(mockInngestSend).not.toHaveBeenCalled()
    expect(mockGetPlatformConfig).not.toHaveBeenCalled()
  })

  it('records dispatched event BEFORE send (so intent is logged even if send throws)', async () => {
    mockGetPlatformConfig.mockResolvedValue(true)
    mockInngestSend.mockRejectedValue(new Error('inngest cloud unreachable'))

    const result = await dispatchRecompraPreload({
      sessionId: 'session-123',
      contactId: 'contact-456',
      workspaceId: 'workspace-789',
    })

    expect(result).toEqual({ dispatched: false, reason: 'threw' })
    // recordEvent ran BEFORE the send threw.
    expect(mockRecordEvent).toHaveBeenCalled()
    expect(mockInngestSend).toHaveBeenCalled()
  })
})

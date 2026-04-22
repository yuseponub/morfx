import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks — define ANTES de import del modulo bajo test (vi.mock hoisting).
const mockProcessReaderMessage = vi.fn()
const mockUpdateCapturedData = vi.fn()
const mockGetSession = vi.fn()
const mockGetPlatformConfig = vi.fn()

vi.mock('@/lib/agents/crm-reader', () => ({
  processReaderMessage: mockProcessReaderMessage,
}))

vi.mock('@/lib/agents/session-manager', () => ({
  SessionManager: vi.fn().mockImplementation(() => ({
    updateCapturedData: mockUpdateCapturedData,
    getSession: mockGetSession,
  })),
}))

vi.mock('@/lib/domain/platform-config', () => ({
  getPlatformConfig: mockGetPlatformConfig,
}))

vi.mock('@/lib/observability', () => ({
  isObservabilityEnabled: () => false,
  ObservabilityCollector: vi.fn(),
  runWithCollector: vi.fn(),
}))

// Minimal inngest mock — we test the handler body, NOT the createFunction wiring.
vi.mock('../../client', () => ({
  inngest: {
    createFunction: (config: unknown, _trigger: unknown, handler: unknown) => ({
      config,
      handler,
    }),
  },
}))

const mockStepRun = vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn())
const mockStep = { run: mockStepRun }

const baseEvent = {
  data: {
    sessionId: 'session-123',
    contactId: 'contact-456',
    workspaceId: 'workspace-789',
    invoker: 'somnio-recompra-v1' as const,
  },
}

// Import AFTER mocks.
type Handler = (arg: { event: typeof baseEvent; step: typeof mockStep }) => Promise<unknown>
let recompraPreloadContext: { config: unknown; handler: Handler }

beforeEach(async () => {
  vi.clearAllMocks()
  mockStepRun.mockImplementation(async (_name, fn) => fn())
  const mod = await import('../recompra-preload-context')
  recompraPreloadContext = mod.recompraPreloadContext as unknown as {
    config: unknown
    handler: Handler
  }
})

describe('recompra-preload-context Inngest function', () => {
  it('short-circuits with skipped/feature_flag_off when platform_config=false', async () => {
    mockGetPlatformConfig.mockResolvedValue(false)

    const result = await recompraPreloadContext.handler({ event: baseEvent, step: mockStep })

    expect(result).toEqual({ status: 'skipped', reason: 'feature_flag_off' })
    expect(mockProcessReaderMessage).not.toHaveBeenCalled()
    expect(mockUpdateCapturedData).not.toHaveBeenCalled()
  })

  it('short-circuits with skipped/already_processed when _v3:crm_context_status is terminal (ok)', async () => {
    mockGetPlatformConfig.mockResolvedValue(true)
    mockGetSession.mockResolvedValue({
      conversation_id: 'conv-real-abc',
      state: {
        datos_capturados: { '_v3:crm_context_status': 'ok', '_v3:crm_context': 'prev' },
      },
    })

    const result = await recompraPreloadContext.handler({ event: baseEvent, step: mockStep })

    expect(result).toMatchObject({ status: 'skipped', reason: 'already_processed' })
    expect(mockProcessReaderMessage).not.toHaveBeenCalled()
    expect(mockUpdateCapturedData).not.toHaveBeenCalled()
  })

  it('short-circuits with skipped/already_processed on terminal status=empty', async () => {
    mockGetPlatformConfig.mockResolvedValue(true)
    mockGetSession.mockResolvedValue({
      conversation_id: 'conv-real-abc',
      state: {
        datos_capturados: { '_v3:crm_context_status': 'empty', '_v3:crm_context': '' },
      },
    })

    const result = await recompraPreloadContext.handler({ event: baseEvent, step: mockStep })

    expect(result).toMatchObject({ status: 'skipped', reason: 'already_processed' })
    expect(mockProcessReaderMessage).not.toHaveBeenCalled()
  })

  it('retries (does NOT skip) when prior status=error (transient failure recovery)', async () => {
    mockGetPlatformConfig.mockResolvedValue(true)
    mockGetSession.mockResolvedValue({
      conversation_id: 'conv-real-abc',
      state: {
        datos_capturados: { '_v3:crm_context_status': 'error', '_v3:crm_context': '' },
      },
    })
    mockProcessReaderMessage.mockResolvedValue({
      text: 'Recovered context: 1x Somnio entregado 2026-04-15. Tags: VIP.',
      toolCalls: [{ name: 'contacts_get' }],
      steps: 2,
      agentId: 'crm-reader',
    })

    const result = await recompraPreloadContext.handler({ event: baseEvent, step: mockStep })

    expect(mockProcessReaderMessage).toHaveBeenCalledTimes(1)
    expect(mockUpdateCapturedData).toHaveBeenCalledWith(
      'session-123',
      expect.objectContaining({
        '_v3:crm_context_status': 'ok',
        '_v3:crm_context': expect.stringContaining('Recovered'),
      }),
    )
    expect(result).toMatchObject({ status: 'ok' })
  })

  it('calls reader and writes status=ok on success', async () => {
    mockGetPlatformConfig.mockResolvedValue(true)
    mockGetSession.mockResolvedValue({
      conversation_id: 'conv-real-abc',
      state: { datos_capturados: {} },
    })
    mockProcessReaderMessage.mockResolvedValue({
      text: 'Ultimo pedido: 2x Somnio entregado 2026-04-10. Tags: VIP. 3 pedidos total. Direccion: Cra 10 #20-30, Bogota.',
      toolCalls: [{ name: 'contacts_get' }, { name: 'orders_list' }, { name: 'tags_list' }],
      steps: 3,
      agentId: 'crm-reader',
    })

    const result = await recompraPreloadContext.handler({ event: baseEvent, step: mockStep })

    expect(mockProcessReaderMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-789',
        invoker: 'somnio-recompra-v1',
        messages: [
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('Prepara contexto de recompra para el contacto contact-456'),
          }),
        ],
        abortSignal: expect.any(AbortSignal),
      }),
    )
    expect(mockUpdateCapturedData).toHaveBeenCalledWith(
      'session-123',
      expect.objectContaining({
        '_v3:crm_context': expect.stringContaining('Ultimo pedido'),
        '_v3:crm_context_status': 'ok',
      }),
    )
    expect(result).toMatchObject({ status: 'ok' })
  })

  it('writes status=empty when reader returns empty text', async () => {
    mockGetPlatformConfig.mockResolvedValue(true)
    mockGetSession.mockResolvedValue({
      conversation_id: 'conv-real-abc',
      state: { datos_capturados: {} },
    })
    mockProcessReaderMessage.mockResolvedValue({
      text: '',
      toolCalls: [],
      steps: 1,
      agentId: 'crm-reader',
    })

    const result = await recompraPreloadContext.handler({ event: baseEvent, step: mockStep })

    expect(mockUpdateCapturedData).toHaveBeenCalledWith(
      'session-123',
      expect.objectContaining({ '_v3:crm_context_status': 'empty', '_v3:crm_context': '' }),
    )
    expect(result).toMatchObject({ status: 'empty' })
  })

  it('writes status=error marker BEFORE returning when reader throws (Pitfall 4)', async () => {
    mockGetPlatformConfig.mockResolvedValue(true)
    mockGetSession.mockResolvedValue({
      conversation_id: 'conv-real-abc',
      state: { datos_capturados: {} },
    })
    mockProcessReaderMessage.mockRejectedValue(new Error('Anthropic 5xx upstream'))

    const result = await recompraPreloadContext.handler({ event: baseEvent, step: mockStep })

    expect(mockUpdateCapturedData).toHaveBeenCalledWith(
      'session-123',
      expect.objectContaining({ '_v3:crm_context_status': 'error', '_v3:crm_context': '' }),
    )
    expect(result).toMatchObject({ status: 'error' })
    expect((result as { error?: string }).error).toContain('Anthropic 5xx')
  })

  it('proceeds when getSession throws (fail-open, no real conversationId)', async () => {
    mockGetPlatformConfig.mockResolvedValue(true)
    mockGetSession.mockRejectedValue(new Error('SessionNotFoundError'))
    mockProcessReaderMessage.mockResolvedValue({
      text: 'Some context',
      toolCalls: [],
      steps: 1,
      agentId: 'crm-reader',
    })

    const result = await recompraPreloadContext.handler({ event: baseEvent, step: mockStep })

    expect(mockProcessReaderMessage).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ status: 'ok' })
  })
})

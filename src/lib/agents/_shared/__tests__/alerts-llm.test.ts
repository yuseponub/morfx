/**
 * Tests for sendLLMCreditsDepletedAlert + sendBothProvidersDownAlert.
 *
 * Phase: v4-llm-fallback-resilience Plan 02 Task 3.
 * Requirements: D-03 (workspace id+name in body), D-07 (two severities),
 * T-fb-01 (no user content in emails), T-fb-03 (global dedup).
 *
 * Coverage:
 *   (a) fail-soft: RESEND_API_KEY unset → no throw, no send
 *   (b) global dedup: 2 calls within 15min → emails.send called ONCE
 *   (c) separate dedup keys: both_down sends after credits alert fires
 *   (d) subject strings differ by severity
 *   (e) workspace name appears in email body (D-03)
 *
 * No real DB or Resend hit: all domain + resend modules are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---- Mock resend --------------------------------------------------------
// We capture the send spy so each test can assert on it.
const mockEmailsSend = vi.fn().mockResolvedValue({ id: 'test-email-id' })
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockEmailsSend },
  })),
}))

// ---- Mock domain/platform-config (getFromAddress) -----------------------
vi.mock('@/lib/domain/platform-config', () => ({
  getPlatformConfig: vi.fn().mockResolvedValue('alerts@test.morfx.app'),
}))

// ---- Mock domain/workspace-settings (resolveWorkspaceName) --------------
vi.mock('@/lib/domain/workspace-settings', () => ({
  getWorkspaceName: vi.fn().mockResolvedValue('Somnio Workspace'),
  // other exports — stub with no-op so imports don't crash
  updateConversationMetricsSettings: vi.fn(),
}))

// ---- Imports (after mocks) -----------------------------------------------
import {
  sendLLMCreditsDepletedAlert,
  sendBothProvidersDownAlert,
  __resetAlertDedupeForTests,
  type LLMCreditsAlertCtx,
  type BothProvidersDownCtx,
} from '../alerts'

// =========================================================================
// Test setup
// =========================================================================

const WS_ID = 'aaaabbbb-cccc-dddd-eeee-ffffggg00001'
const CALL_SITE = 'comprehension'

function creditsCtx(overrides?: Partial<LLMCreditsAlertCtx>): LLMCreditsAlertCtx {
  return { workspaceId: WS_ID, provider: 'gemini', callSite: CALL_SITE, ...overrides }
}

function bothDownCtx(overrides?: Partial<BothProvidersDownCtx>): BothProvidersDownCtx {
  return {
    workspaceId: WS_ID,
    callSite: CALL_SITE,
    geminiError: 'APICallError',
    anthropicError: 'APICallError',
    ...overrides,
  }
}

beforeEach(() => {
  process.env.NODE_ENV = 'test'
  process.env.RESEND_API_KEY = 'test-resend-key-123'
  __resetAlertDedupeForTests()
  vi.clearAllMocks()
  // Re-apply the mock return value after clearAllMocks
  mockEmailsSend.mockResolvedValue({ id: 'test-email-id' })
})

afterEach(() => {
  delete process.env.RESEND_API_KEY
})

// =========================================================================
// (a) Fail-soft: absent RESEND_API_KEY
// =========================================================================

describe('sendLLMCreditsDepletedAlert — fail-soft', () => {
  it('resolves without throwing when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY
    await expect(sendLLMCreditsDepletedAlert(creditsCtx())).resolves.toBeUndefined()
    expect(mockEmailsSend).not.toHaveBeenCalled()
  })
})

describe('sendBothProvidersDownAlert — fail-soft', () => {
  it('resolves without throwing when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY
    await expect(sendBothProvidersDownAlert(bothDownCtx())).resolves.toBeUndefined()
    expect(mockEmailsSend).not.toHaveBeenCalled()
  })
})

// =========================================================================
// (b) Global dedup: 2 calls → 1 send
// =========================================================================

describe('sendLLMCreditsDepletedAlert — global dedup', () => {
  it('sends once for two rapid calls (global key llm_credits:gemini)', async () => {
    await sendLLMCreditsDepletedAlert(creditsCtx())
    await sendLLMCreditsDepletedAlert(creditsCtx({ workspaceId: 'different-ws-id' }))
    // second call is deduped globally (key is per-provider, not per-workspace)
    expect(mockEmailsSend).toHaveBeenCalledTimes(1)
  })
})

describe('sendBothProvidersDownAlert — global dedup', () => {
  it('sends once for two rapid calls (global key both_down)', async () => {
    await sendBothProvidersDownAlert(bothDownCtx())
    await sendBothProvidersDownAlert(bothDownCtx())
    expect(mockEmailsSend).toHaveBeenCalledTimes(1)
  })
})

// =========================================================================
// (c) Separate dedup keys: both_down can fire after llm_credits alert
// =========================================================================

describe('separate dedup keys', () => {
  it('both_down alert fires even when credits alert just fired', async () => {
    await sendLLMCreditsDepletedAlert(creditsCtx())
    await sendBothProvidersDownAlert(bothDownCtx())
    // Credits sends once, both-down also sends once (separate keys)
    expect(mockEmailsSend).toHaveBeenCalledTimes(2)
  })
})

// =========================================================================
// (d) Subject strings differ by severity
// =========================================================================

describe('subject severity distinction', () => {
  it('sendLLMCreditsDepletedAlert uses NORMAL wording (bot VIVO con Haiku)', async () => {
    await sendLLMCreditsDepletedAlert(creditsCtx())
    expect(mockEmailsSend).toHaveBeenCalledTimes(1)
    const args = mockEmailsSend.mock.calls[0][0]
    expect(args.subject).toContain('Gemini sin créditos')
    expect(args.subject).not.toContain('CRÍTICO')
  })

  it('sendBothProvidersDownAlert uses CRITICAL wording (CRÍTICO)', async () => {
    await sendBothProvidersDownAlert(bothDownCtx())
    expect(mockEmailsSend).toHaveBeenCalledTimes(1)
    const args = mockEmailsSend.mock.calls[0][0]
    expect(args.subject).toContain('CRÍTICO')
    expect(args.subject).toContain('AMBOS')
  })
})

// =========================================================================
// (e) Workspace name in email body (D-03)
// =========================================================================

describe('workspace name in email body', () => {
  it('sendLLMCreditsDepletedAlert includes workspace name from domain', async () => {
    await sendLLMCreditsDepletedAlert(creditsCtx())
    const args = mockEmailsSend.mock.calls[0][0]
    // The mock getWorkspaceName returns 'Somnio Workspace'
    expect(args.text).toContain('Somnio Workspace')
    expect(args.text).toContain(WS_ID)
  })

  it('sendBothProvidersDownAlert includes workspace name from domain', async () => {
    await sendBothProvidersDownAlert(bothDownCtx())
    const args = mockEmailsSend.mock.calls[0][0]
    expect(args.text).toContain('Somnio Workspace')
    expect(args.text).toContain(WS_ID)
  })

  it('resolves gracefully when workspaceId is undefined', async () => {
    await expect(
      sendLLMCreditsDepletedAlert(creditsCtx({ workspaceId: undefined })),
    ).resolves.toBeUndefined()
    // Should still send (or dedup), not throw
  })
})

// =========================================================================
// (f) T-fb-01: no user content or API key in email body
// =========================================================================

describe('T-fb-01: no user content in email body', () => {
  it('credits email body does not contain raw error messages or user input markers', async () => {
    await sendLLMCreditsDepletedAlert(creditsCtx())
    const args = mockEmailsSend.mock.calls[0][0]
    // Should not contain ctx.message / body / userMessage patterns
    expect(args.text).not.toMatch(/ctx\.(message|body|userMessage|text)/)
    // Should not contain the literal call-site interpolation of any user content
    expect(args.subject).toContain('[v4 LLM]')
  })

  it('both-down email includes err.name-level fields only (not raw error strings)', async () => {
    await sendBothProvidersDownAlert(
      bothDownCtx({ geminiError: 'APICallError', anthropicError: 'APICallError' }),
    )
    const args = mockEmailsSend.mock.calls[0][0]
    expect(args.text).toContain('APICallError')
    // Ensure it's the passed err.name value and not something injected from user content
    expect(args.text).not.toMatch(/userMessage|ctx\.message/)
  })
})

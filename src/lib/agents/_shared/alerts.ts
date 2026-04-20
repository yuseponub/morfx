/**
 * CRM Bot Alerts — Runaway Loop + Approaching Limit Email Notifications
 *
 * Phase 44 Plan 02.
 *
 * Shared by /api/v1/crm-bots/reader and /api/v1/crm-bots/writer/* routes.
 * Fire-and-forget (caller wraps in `void`); never throws; dedupes to avoid
 * alert storms (Pitfall 8 from 44-RESEARCH.md).
 *
 * Failure mode: If RESEND_API_KEY is unset or Resend API errors, we log
 * via console.error and return — never crash the route handler (the
 * caller's rate-limit response must still be delivered).
 *
 * Revision 2026-04-19 (Phase 44.1): FROM is now read from platform_config.crm_bot_alert_from
 * (JSONB; null -> sandbox fallback). Cache TTL 30s — post-flip propagation window.
 * Default fallback: Resend sandbox 'onboarding@resend.dev' (works without DKIM verification).
 */

import { Resend } from 'resend'
import { createModuleLogger } from '@/lib/audit/logger'
import { getPlatformConfig } from '@/lib/domain/platform-config'

const logger = createModuleLogger('crm-bot-alerts')

// Lazy Resend client — instantiate on first call so absent RESEND_API_KEY
// during module import does not throw.
let resendClient: Resend | null = null
function getResendClient(): Resend | null {
  if (resendClient) return resendClient
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  resendClient = new Resend(apiKey)
  return resendClient
}

const RECIPIENT = 'joseromerorincon041100@gmail.com'

// FROM address is read from platform_config.crm_bot_alert_from (Phase 44.1).
// Default fallback is Resend sandbox (onboarding@resend.dev) which always
// works without domain verification — any Resend account can send from it.
// In production, operator sets crm_bot_alert_from to a DKIM-verified domain
// (e.g. "alerts@morfx.app") via `UPDATE platform_config SET value='"alerts@morfx.app"'::jsonb ...`.
// Read per-call via getPlatformConfig (cache TTL 30s — no redeploy needed for flips).
async function getFromAddress(): Promise<string> {
  const configured = await getPlatformConfig<string | null>('crm_bot_alert_from', null)
  return configured ?? 'onboarding@resend.dev'
}

const DEDUPE_MS = 15 * 60 * 1000 // 15 minutes — Pitfall 8 mitigation

// In-memory dedupe map. Keys: `{kind}:{workspaceId}:{agentId}`. Value: last
// send timestamp (ms since epoch). Lambda cold starts reset this — that's OK
// because warm-start alert storms are the real risk; a fresh lambda can
// legitimately re-send the first alert after a cold boot.
const lastSent = new Map<string, number>()

// Periodic cleanup to prevent unbounded growth. Runs every 30 min in-process.
// In Edge Runtime / serverless this interval may not fire — that's acceptable
// because the Map is bounded by (workspaces × agents × 2 kinds) ≈ a few hundred
// entries at most. Entries older than DEDUPE_MS * 2 are pruned when cleanup fires.
if (typeof setInterval === 'function') {
  const handle = setInterval(() => {
    const cutoff = Date.now() - DEDUPE_MS * 2
    for (const [key, ts] of lastSent.entries()) {
      if (ts < cutoff) lastSent.delete(key)
    }
  }, 30 * 60 * 1000)
  // Node-only: unref lets the interval not keep the process alive.
  // Guard the call since Edge Runtime setInterval returns a number without .unref.
  ;(handle as unknown as { unref?: () => void }).unref?.()
}

export interface RunawayAlertCtx {
  workspaceId: string
  agentId: 'crm-reader' | 'crm-writer'
  limit: number
}

/**
 * Send email alert when a workspace HITS the rate limit on crm-bot calls.
 * Indicates a suspected runaway loop in the caller agent.
 *
 * Dedupe: 1 alert per (workspaceId, agentId) per 15 minutes.
 * Fire-and-forget; caller should use `void sendRunawayAlert(...)`.
 */
export async function sendRunawayAlert(ctx: RunawayAlertCtx): Promise<void> {
  const key = `runaway:${ctx.workspaceId}:${ctx.agentId}`
  const last = lastSent.get(key) ?? 0
  if (Date.now() - last < DEDUPE_MS) return
  lastSent.set(key, Date.now())

  const client = getResendClient()
  if (!client) {
    logger.warn({ ctx }, 'RESEND_API_KEY unset; alert dropped')
    return
  }

  try {
    await client.emails.send({
      from: await getFromAddress(),
      to: RECIPIENT,
      subject: `[CRM Bot] Runaway loop suspected — ${ctx.agentId} — workspace ${ctx.workspaceId.slice(0, 8)}`,
      text: [
        `Workspace ${ctx.workspaceId} HIT the CRM bot rate limit of ${ctx.limit} calls/min on ${ctx.agentId}.`,
        '',
        'This usually indicates a runaway loop in the caller agent.',
        '',
        'Dedupe: next alert for this workspace+agent in 15 min.',
        '',
        "Kill-switch: UPDATE platform_config SET value='false'::jsonb WHERE key='crm_bot_enabled'. Effect visible within 30s (cache TTL).",
      ].join('\n'),
    })
    logger.info({ ctx }, 'runaway alert sent')
  } catch (err) {
    logger.error({ err, ctx }, 'runaway alert send failed (fail-silent)')
  }
}

export interface ApproachingLimitCtx {
  workspaceId: string
  agentId: 'crm-reader' | 'crm-writer'
  used: number
  limit: number
}

/**
 * Send email alert when a workspace approaches the rate limit (>80% used).
 * Separate dedupe key from runaway so both kinds can alert within 15 min.
 *
 * Dedupe: 1 alert per (workspaceId, agentId) per 15 minutes.
 * Fire-and-forget; caller should use `void maybeSendApproachingLimitAlert(...)`.
 */
export async function maybeSendApproachingLimitAlert(
  ctx: ApproachingLimitCtx,
): Promise<void> {
  const key = `approaching:${ctx.workspaceId}:${ctx.agentId}`
  const last = lastSent.get(key) ?? 0
  if (Date.now() - last < DEDUPE_MS) return
  lastSent.set(key, Date.now())

  const client = getResendClient()
  if (!client) {
    logger.warn({ ctx }, 'RESEND_API_KEY unset; alert dropped')
    return
  }

  try {
    await client.emails.send({
      from: await getFromAddress(),
      to: RECIPIENT,
      subject: `[CRM Bot] Approaching rate limit — ${ctx.agentId} — workspace ${ctx.workspaceId.slice(0, 8)}`,
      text: [
        `Workspace ${ctx.workspaceId} is at ${ctx.used}/${ctx.limit} calls/min on ${ctx.agentId}.`,
        '',
        `This is >${Math.round((ctx.used / ctx.limit) * 100)}% of the configured budget.`,
        '',
        'Review if this is legitimate volume or an emerging runaway loop.',
      ].join('\n'),
    })
    logger.info({ ctx }, 'approaching-limit alert sent')
  } catch (err) {
    logger.error({ err, ctx }, 'approaching-limit alert send failed (fail-silent)')
  }
}

/**
 * Test-only helper: clear the dedupe map. Exported for integration tests
 * in Plan 09. DO NOT call from production code.
 *
 * Revision 2026-04-18 (Warning #15): guarded to throw if called outside test
 * environment. Defense-in-depth — even though the export lives in a production
 * module, it cannot be reached from HTTP (not wired to any route) and will
 * throw if invoked accidentally in dev/prod.
 */
export function __resetAlertDedupeForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__resetAlertDedupeForTests is test-only (NODE_ENV must be "test")')
  }
  lastSent.clear()
}

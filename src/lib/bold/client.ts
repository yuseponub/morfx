// ============================================================================
// BOLD Robot HTTP Client
// Calls the Playwright-based robot on Railway to create payment links
// Robot endpoint: POST /api/create-link
// ============================================================================

import type {
  CreatePaymentLinkInput,
  CreatePaymentLinkResponse,
  BoldRobotError,
} from './types'
import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'

const BOLD_ROBOT_URL = process.env.BOLD_ROBOT_URL

// ============================================================================
// D-07: Reactive telemetry — detect upstream BOLD regression early
// When 3+ consecutive failures match REGRESSION_SIGNATURES (upstream login
// changed / MFA / Auth0), fire `bold-robot/upstream-broken` Inngest event so
// the operator hears about it <5min after the first failure, not 24h later
// from a customer report.
// Counter persists in `platform_config.bold_robot_failure_count` (singleton
// key-value JSONB, same pattern as knowledge-sync-v4). Counter is GLOBAL
// (not workspace-scoped) — tech debt accepted per RESEARCH §Open Questions Q3
// (current setup is single-tenant BOLD).
// ============================================================================

const REGRESSION_SIGNATURES = [
  /Timeout.*waiting for locator/i,
  /Login falló/i,
  /BOLD ahora requiere MFA/i,
  /Playwright sigue en auth\.bold\.co/i,
]

function looksLikeUpstreamRegression(errorMessage: string): boolean {
  return REGRESSION_SIGNATURES.some(rx => rx.test(errorMessage))
}

async function recordFailureAndMaybeAlert(errorMessage: string, workspaceId: string) {
  if (!looksLikeUpstreamRegression(errorMessage)) return

  // Use Supabase `platform_config` as a simple distributed counter.
  // Key format: `bold_robot_failure_count` (singleton across all workspaces;
  // 3 consecutive failures from ANY workspace = upstream issue).
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('platform_config')
    .select('value')
    .eq('key', 'bold_robot_failure_count')
    .single()

  const currentCount = (data?.value as number) ?? 0
  const newCount = currentCount + 1

  await supabase
    .from('platform_config')
    .upsert({ key: 'bold_robot_failure_count', value: newCount }, { onConflict: 'key' })

  if (newCount >= 3) {
    // CRITICAL: ALWAYS await inngest.send in serverless (Vercel terminates early — Pitfall 8)
    await (inngest.send as any)({
      name: 'bold-robot/upstream-broken',
      data: {
        consecutiveFailures: newCount,
        lastErrorMessage: errorMessage.slice(0, 500),
        workspaceId,
        detectedAt: new Date().toISOString(),
      },
    })
    // Reset counter so we don't spam — next 3 failures will re-trigger
    await supabase
      .from('platform_config')
      .upsert({ key: 'bold_robot_failure_count', value: 0 }, { onConflict: 'key' })
  }
}

async function recordSuccess() {
  // Reset counter on any successful call
  const supabase = createAdminClient()
  await supabase
    .from('platform_config')
    .upsert({ key: 'bold_robot_failure_count', value: 0 }, { onConflict: 'key' })
}

/**
 * Call the BOLD robot on Railway to create a payment link.
 * Timeout: 60s (robot takes ~30s typical, Playwright navigation).
 *
 * @returns The checkout URL on success
 * @throws Error with a user-friendly message on failure
 */
export async function callBoldRobot(
  input: CreatePaymentLinkInput & { workspaceId: string }
): Promise<CreatePaymentLinkResponse> {
  if (!BOLD_ROBOT_URL) {
    throw new Error('BOLD_ROBOT_URL no esta configurado en el servidor')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)

  try {
    const res = await fetch(`${BOLD_ROBOT_URL}/api/create-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: input.username,
        password: input.password,
        amount: input.amount,
        description: input.description,
        ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
      }),
      signal: controller.signal,
    })

    const data = await res.json()

    if (!res.ok) {
      const err = data as BoldRobotError
      throw new Error(
        err.error || `Robot respondio con status ${res.status}`
      )
    }

    const result = data as CreatePaymentLinkResponse
    if (!result.url) {
      throw new Error('Robot no devolvio URL de pago')
    }

    // Happy path — reset failure counter
    await recordSuccess()

    return result
  } catch (error) {
    // D-07: telemetry — record failure for upstream-regression detection.
    // `.catch(() => {})` is defensive: if Supabase is down, don't mask the
    // original BOLD error — propagate it unchanged. (Pitfall 8 — await is
    // mandatory inside this branch, but the outer telemetry failure is swallowed.)
    const message = error instanceof Error ? error.message : String(error)
    await recordFailureAndMaybeAlert(message, input.workspaceId).catch(() => {})

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error(
          'El robot tardo demasiado (>60s). Intenta de nuevo.'
        )
      }
      throw error
    }
    throw new Error('Error desconocido al contactar el robot de BOLD')
  } finally {
    clearTimeout(timeout)
  }
}

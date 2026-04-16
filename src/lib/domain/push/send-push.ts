// ============================================================================
// Domain Layer — Push Notifications: Send
// Phase 43 Plan 13: Push Notifications
//
// sendPushToWorkspace — best-effort fan-out to every active push_token
// belonging to a workspace. Uses Expo Push Service (exp.host) which handles
// the FCM → device delivery for us (Research recommendation: "don't
// hand-roll — use expo-notifications + Expo Push Service").
//
// iOS tokens are FILTERED OUT unless `MOBILE_IOS_PUSH_ENABLED === 'true'`.
// This is the server-side guard for the two-guard iOS stub pattern (the
// mobile app has a Platform.OS check as the first guard).
//
// Error handling:
//   - Network / Expo errors: logged, never thrown (push is best-effort;
//     failing to push must not break the triggering flow).
//   - Per-token `DeviceNotRegistered`: we mark the token `revoked_at=NOW()`
//     so it is skipped on future sends. Other per-token errors are just
//     logged.
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

export interface SendPushParams {
  workspaceId: string
  title: string
  body: string
  data?: Record<string, unknown>
}

interface PushTokenRow {
  id: string
  token: string
  platform: 'android' | 'ios'
}

interface ExpoPushTicket {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: {
    error?: string
    [k: string]: unknown
  }
}

interface ExpoPushResponse {
  data?: ExpoPushTicket[] | ExpoPushTicket
  errors?: Array<{ code: string; message: string }>
}

function isIosEnabled(): boolean {
  return process.env.MOBILE_IOS_PUSH_ENABLED === 'true'
}

/**
 * Best-effort push fan-out. Never throws — all failures are logged.
 */
export async function sendPushToWorkspace(params: SendPushParams): Promise<void> {
  const supabase = createAdminClient()

  // 1. Fetch all active tokens for the workspace.
  const { data: tokens, error } = await supabase
    .from('push_tokens')
    .select('id, token, platform')
    .eq('workspace_id', params.workspaceId)
    .is('revoked_at', null)

  if (error) {
    console.error('[domain/push/send-push] fetch tokens failed', error)
    return
  }

  const allRows = (tokens ?? []) as unknown as PushTokenRow[]
  if (allRows.length === 0) return

  // 2. Filter iOS unless feature-flag enabled (second guard; mobile client
  //    already short-circuits before registering, so in practice there should
  //    be no iOS rows yet — but this belt-and-braces guard is cheap).
  const iosOn = isIosEnabled()
  const eligible = allRows.filter((r) => r.platform === 'android' || (r.platform === 'ios' && iosOn))
  if (eligible.length === 0) return

  // 3. POST to Expo Push Service. Expo accepts either a single object or an
  //    array under `to`; using the array form lets us send to up to 100
  //    tokens in a single call.
  const payload = {
    to: eligible.map((r) => r.token),
    title: params.title,
    body: params.body,
    data: params.data ?? {},
    priority: 'high',
    sound: 'default',
  }

  let responseJson: ExpoPushResponse | null = null
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    responseJson = (await res.json()) as ExpoPushResponse
    if (!res.ok) {
      console.error(
        '[domain/push/send-push] expo push non-2xx',
        res.status,
        responseJson
      )
      return
    }
  } catch (err) {
    console.error('[domain/push/send-push] expo push fetch failed', err)
    return
  }

  // 4. Handle per-token tickets — revoke tokens where Expo tells us the
  //    device is no longer registered.
  const tickets: ExpoPushTicket[] = Array.isArray(responseJson?.data)
    ? (responseJson?.data as ExpoPushTicket[])
    : responseJson?.data
      ? [responseJson.data as ExpoPushTicket]
      : []

  if (tickets.length === 0) return

  const toRevoke: string[] = []
  tickets.forEach((ticket, idx) => {
    const row = eligible[idx]
    if (!row) return
    if (ticket.status === 'error') {
      const errCode = ticket.details?.error
      if (errCode === 'DeviceNotRegistered') {
        toRevoke.push(row.id)
      } else {
        console.warn(
          '[domain/push/send-push] ticket error',
          row.id,
          errCode,
          ticket.message
        )
      }
    }
  })

  if (toRevoke.length > 0) {
    // revoked_at stored as UTC ISO — timestamptz column normalizes TZ on read.
    const { error: updErr } = await supabase
      .from('push_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .in('id', toRevoke)
    if (updErr) {
      console.error(
        '[domain/push/send-push] failed to revoke tokens',
        toRevoke,
        updErr
      )
    }
  }
}

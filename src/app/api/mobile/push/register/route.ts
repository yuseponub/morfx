// POST /api/mobile/push/register — register a device push token.
//
// Phase 43 Plan 13: Push Notifications.
//
// The mobile client calls this after obtaining an ExpoPushToken (Android only
// until iOS is activated). On iOS the mobile client short-circuits BEFORE
// hitting this endpoint (Platform.OS === 'ios' → return early), so under
// normal flow the server never sees platform='ios' rows. The server also
// accepts iOS tokens defensively, but sendPushToWorkspace will skip them
// until MOBILE_IOS_PUSH_ENABLED is true.
//
// Auth: requires Bearer JWT + x-workspace-id header + workspace membership.

import { NextResponse } from 'next/server'

import { registerPushToken } from '@/lib/domain/push/register-token'

import {
  RegisterPushTokenRequestSchema,
  RegisterPushTokenResponseSchema,
} from '../../../../../../shared/mobile-api/schemas'

import { requireMobileAuth } from '../../_lib/auth'
import { MobileValidationError, toMobileErrorResponse } from '../../_lib/errors'

export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { user, workspaceId } = await requireMobileAuth(req)

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      throw new MobileValidationError('bad_request', 'Invalid JSON body')
    }

    const parsed = RegisterPushTokenRequestSchema.safeParse(rawBody)
    if (!parsed.success) {
      throw new MobileValidationError('bad_request', 'Invalid body')
    }

    const { platform, token, deviceName } = parsed.data

    const result = await registerPushToken({
      userId: user.id,
      workspaceId,
      platform,
      token,
      deviceName: deviceName ?? null,
    })

    const body = RegisterPushTokenResponseSchema.parse({
      ok: true,
      id: result.id,
    })

    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return toMobileErrorResponse(err)
  }
}

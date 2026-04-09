// GET /api/mobile/health — unauthenticated connectivity probe.
//
// Used by the mobile app at cold start to confirm the API is reachable
// before attempting an authenticated call (which would otherwise hang on
// network-layer failures with a more confusing error). No secrets, no
// DB, no auth — just a timestamped 200 response validated against the
// shared Zod contract so the shape cannot drift.

import { NextResponse } from 'next/server'

import { HealthResponseSchema } from '../../../../../shared/mobile-api/schemas'

import { toMobileErrorResponse } from '../_lib/errors'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  try {
    const body = HealthResponseSchema.parse({
      ok: true,
      ts: new Date().toISOString(),
    })
    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return toMobileErrorResponse(err)
  }
}

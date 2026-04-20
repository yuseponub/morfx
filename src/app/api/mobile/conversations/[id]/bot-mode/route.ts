// POST /api/mobile/conversations/:id/bot-mode
//
// Phase 43 Plan 11. Three-state bot toggle write path. Routes through the
// additive `setBotMode` domain function (Regla 3) — the existing web
// `toggleConversationAgent` action (legacy `agent_conversational` column) is
// unchanged (Regla 6: protect production agent). See
// src/lib/domain/conversations/set-bot-mode.ts for the additive rationale.
//
// Request body (Zod: MobileBotModeRequestSchema):
//   { mode: 'on' | 'off' | 'muted', muteUntil: ISO string | null }
//
// Response body (Zod: MobileBotModeResponseSchema):
//   { conversation_id, bot_mode, bot_mute_until }
//
// Error mapping (all go through toMobileErrorResponse):
//   - Missing / invalid body          → 400 bad_request
//   - muteUntil in the past           → 400 bad_request
//   - mode='on'|'off' + muteUntil!=null → 400 bad_request
//   - Conversation not in workspace   → 404 not_found
//   - Anything else                   → 500 internal

import { NextResponse } from 'next/server'

import { setBotMode } from '@/lib/domain/conversations/set-bot-mode'

import { MobileBotModeRequestSchema, MobileBotModeResponseSchema } from '../../../../../../../shared/mobile-api/schemas'

import { requireMobileAuth } from '../../../_lib/auth'
import {
  MobileNotFoundError,
  MobileValidationError,
  toMobileErrorResponse,
} from '../../../_lib/errors'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId } = await requireMobileAuth(req)
    const { id: conversationId } = await ctx.params

    let rawJson: unknown
    try {
      rawJson = await req.json()
    } catch {
      throw new MobileValidationError('bad_request', 'Body must be JSON')
    }

    const parsed = MobileBotModeRequestSchema.safeParse(rawJson)
    if (!parsed.success) {
      throw new MobileValidationError(
        'bad_request',
        parsed.error.issues.map((i) => i.message).join('; ')
      )
    }

    const { mode, muteUntil } = parsed.data

    // Belt-and-suspenders: Zod validated the shape, the domain enforces the
    // business invariants. Do the Date conversion here so the domain receives
    // a concrete Date (easier to test + clearer contract).
    let muteUntilDate: Date | null = null
    if (mode === 'muted') {
      if (!muteUntil) {
        throw new MobileValidationError(
          'bad_request',
          'muteUntil es requerido cuando mode es "muted"'
        )
      }
      const parsedMs = Date.parse(muteUntil)
      if (Number.isNaN(parsedMs)) {
        throw new MobileValidationError(
          'bad_request',
          'muteUntil debe ser un ISO 8601 valido'
        )
      }
      if (parsedMs <= Date.now()) {
        throw new MobileValidationError(
          'bad_request',
          'muteUntil debe estar en el futuro'
        )
      }
      muteUntilDate = new Date(parsedMs)
    } else if (muteUntil !== null) {
      throw new MobileValidationError(
        'bad_request',
        'muteUntil debe ser null cuando mode es "on" u "off"'
      )
    }

    const result = await setBotMode(
      { workspaceId, source: 'mobile-api' },
      { conversationId, mode, muteUntil: muteUntilDate }
    )

    if (!result.success || !result.data) {
      const msg = result.error || 'internal'
      if (msg.includes('no encontrada')) {
        throw new MobileNotFoundError('not_found', msg)
      }
      if (
        msg.includes('muteUntil') ||
        msg.includes('futuro') ||
        msg.includes('requerido')
      ) {
        throw new MobileValidationError('bad_request', msg)
      }
      console.error('[mobile-api/bot-mode:POST] setBotMode failed', msg)
      throw new Error(msg)
    }

    const body = MobileBotModeResponseSchema.parse({
      conversation_id: result.data.conversationId,
      bot_mode: result.data.bot_mode,
      bot_mute_until: result.data.bot_mute_until,
    })

    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return toMobileErrorResponse(err)
  }
}

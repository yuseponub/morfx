// POST /api/mobile/conversations/:id/media/upload — issue a presigned
// upload URL to Supabase Storage so the mobile app can upload media
// (image / voice note) directly to the existing `whatsapp-media` bucket
// without streaming bytes through our Next.js server.
//
// Phase 43 Plan 09. This endpoint does NOT write to the messages table —
// it only reserves a key + signs a URL. The mobile outbox drain then POSTs
// the mediaKey back to /api/mobile/conversations/:id/messages which goes
// through the domain layer (Regla 3).
//
// Bucket reused: `whatsapp-media` (already public; see
// supabase/migrations/20260131000000_storage_bucket.sql). Object key is
// `mobile/${workspaceId}/${conversationId}/${random}-${extension}` so
// lookups are scoped by workspace on both reads and deletes.
//
// Contract:
//   request:  { mimeType: string, byteSize: number }   MediaUploadRequestSchema
//   response: { uploadUrl: string, mediaKey: string,
//               publicUrl: string, expiresAt: ISO }    MediaUploadResponseSchema
//
// The mobile client PUTs the file to `uploadUrl` with Content-Type set to
// the same mimeType that was declared here. Supabase returns 200 on
// success; anything else means the mobile layer must throw and the outbox
// row stays queued for retry.

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

import {
  MediaUploadRequestSchema,
  MediaUploadResponseSchema,
} from '../../../../../../../../shared/mobile-api/schemas'

import { requireMobileAuth } from '../../../../_lib/auth'
import {
  MobileNotFoundError,
  MobileValidationError,
  toMobileErrorResponse,
} from '../../../../_lib/errors'

export const dynamic = 'force-dynamic'

// 16 MB — matches the WhatsApp outbound media ceiling the web sender uses
// (see src/app/actions/messages.ts MAX_FILE_SIZE comment).
const MAX_UPLOAD_BYTES = 16 * 1024 * 1024

// Signed-upload URLs in Supabase Storage are valid for up to 2 hours; we
// quote 1h back to the mobile so retries within a drain cycle still have
// headroom without reusing expired URLs.
const UPLOAD_URL_TTL_SECONDS = 60 * 60

function extensionFor(mimeType: string): string {
  // Minimal allow-list — everything Plan 09 emits. Unknowns get 'bin'
  // which is still uploadable + playable if the client knows better.
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg'
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'audio/mpeg') return 'mp3'
  if (mimeType === 'audio/mp4' || mimeType === 'audio/m4a') return 'm4a'
  if (mimeType === 'audio/ogg') return 'ogg'
  if (mimeType === 'audio/wav') return 'wav'
  if (mimeType === 'audio/aac') return 'aac'
  return 'bin'
}

function randomToken(): string {
  // Fast 16-byte hex — enough entropy for a per-upload key.
  const bytes = new Uint8Array(16)
  // globalThis.crypto is available in the Vercel serverless runtime.
  ;(globalThis as unknown as { crypto: Crypto }).crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

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

    const parsed = MediaUploadRequestSchema.safeParse(rawJson)
    if (!parsed.success) {
      throw new MobileValidationError(
        'bad_request',
        parsed.error.issues.map((i) => i.message).join('; ')
      )
    }

    const { mimeType, byteSize } = parsed.data

    if (byteSize > MAX_UPLOAD_BYTES) {
      throw new MobileValidationError(
        'bad_request',
        `Archivo excede el limite de ${MAX_UPLOAD_BYTES} bytes`
      )
    }

    const admin = createAdminClient()

    // Verify the conversation belongs to the workspace — same
    // enumeration-defense pattern as GET/POST /messages.
    const { data: convo, error: convoError } = await admin
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('workspace_id', workspaceId)
      .single()

    if (convoError || !convo) {
      throw new MobileNotFoundError(
        'not_found',
        'Conversation not found in workspace'
      )
    }

    // Scoped path keeps reads + deletes workspace-filterable.
    const mediaKey = `mobile/${workspaceId}/${conversationId}/${Date.now()}-${randomToken()}.${extensionFor(mimeType)}`

    // Signed upload URL — Supabase returns a temporary URL the client PUTs
    // the file bytes to. The URL already carries the bucket + key; the
    // client doesn't need to know bucket internals.
    const { data: signed, error: signError } = await admin.storage
      .from('whatsapp-media')
      .createSignedUploadUrl(mediaKey)

    if (signError || !signed) {
      console.error(
        '[mobile-api/media/upload] createSignedUploadUrl failed',
        signError
      )
      throw new Error('Failed to create signed upload URL')
    }

    // Public URL for the future (WhatsApp outbound needs a reachable URL).
    const { data: publicInfo } = admin.storage
      .from('whatsapp-media')
      .getPublicUrl(mediaKey)

    const body = MediaUploadResponseSchema.parse({
      uploadUrl: signed.signedUrl,
      mediaKey,
      publicUrl: publicInfo.publicUrl,
      expiresAt: new Date(
        Date.now() + UPLOAD_URL_TTL_SECONDS * 1000
      ).toISOString(),
    })

    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return toMobileErrorResponse(err)
  }
}

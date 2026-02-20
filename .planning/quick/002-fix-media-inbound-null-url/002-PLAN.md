---
phase: quick-002
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/whatsapp/webhook-handler.ts
  - src/lib/domain/messages.ts
autonomous: true

must_haves:
  truths:
    - "Inbound images show in WhatsApp inbox chat"
    - "Inbound audio plays in WhatsApp inbox chat"
    - "Inbound video plays in WhatsApp inbox chat"
    - "Inbound documents show download link in WhatsApp inbox chat"
    - "Inbound stickers render as WebP images in chat"
    - "If media download fails, message still saves with 'Media no disponible' fallback"
  artifacts:
    - path: "src/lib/whatsapp/webhook-handler.ts"
      provides: "Media download + Supabase Storage upload before domain call"
      contains: "downloadMedia"
    - path: "src/lib/domain/messages.ts"
      provides: "Stores media_url, media_mime_type, media_filename on inbound messages"
      contains: "mediaMimeType"
  key_links:
    - from: "src/lib/whatsapp/webhook-handler.ts"
      to: "src/lib/whatsapp/api.ts"
      via: "downloadMedia(apiKey, mediaId)"
      pattern: "downloadMedia"
    - from: "src/lib/whatsapp/webhook-handler.ts"
      to: "supabase.storage.from('whatsapp-media')"
      via: "upload buffer then getPublicUrl"
      pattern: "storage.*from.*whatsapp-media"
    - from: "src/lib/whatsapp/webhook-handler.ts"
      to: "src/lib/domain/messages.ts"
      via: "mediaUrl, mediaMimeType, mediaFilename params"
      pattern: "domainReceiveMessage.*mediaUrl"
---

<objective>
Fix critical bug: inbound media messages (images, audio, video, documents, stickers) display as "Media no disponible" because media_url is always NULL. The webhook handler receives media_id from WhatsApp but never downloads the file.

Purpose: Download media from 360dialog API, upload to Supabase Storage (whatsapp-media bucket), and pass the permanent public URL to the domain layer before saving the message.

Output: Working inbound media display for all 5 media types in the WhatsApp inbox.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/whatsapp/webhook-handler.ts — processIncomingMessage() builds content with buildMessageContent() but never downloads media. Must add download+upload between buildMessageContent() and domainReceiveMessage().
@src/lib/whatsapp/api.ts — downloadMedia(apiKey, mediaId) already exists and returns { buffer, mimeType, filename }.
@src/lib/domain/messages.ts — receiveMessage() accepts mediaUrl param and stores it. Must also accept mediaMimeType and mediaFilename.
@src/app/actions/quick-replies.ts — Reference implementation for uploading to whatsapp-media bucket (lines 361-384). Pattern: supabase.storage.from('whatsapp-media').upload(path, buffer, { contentType }) then .getPublicUrl(path).
@src/app/(dashboard)/whatsapp/components/message-bubble.tsx — Frontend reads media_url, media_mime_type, media_filename from message. If media_url is null, MediaPreview shows "Media no disponible".
@supabase/migrations/20260131000000_storage_bucket.sql — whatsapp-media bucket exists and is public.
@supabase/migrations/20260131000001_storage_policies.sql — RLS policies exist. Admin client (service_role) bypasses RLS, so webhook handler can upload without policy changes.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add media download+upload to webhook handler and extend domain receiveMessage params</name>
  <files>
    src/lib/whatsapp/webhook-handler.ts
    src/lib/domain/messages.ts
  </files>
  <action>
**1. src/lib/domain/messages.ts — Extend ReceiveMessageParams:**

Add two new optional fields to the `ReceiveMessageParams` interface (after the existing `mediaUrl?: string`):
```typescript
mediaMimeType?: string
mediaFilename?: string
```

In the `receiveMessage` function, update the DB insert (line ~358-368) to include these new fields:
```typescript
...(params.mediaMimeType ? { media_mime_type: params.mediaMimeType } : {}),
...(params.mediaFilename ? { media_filename: params.mediaFilename } : {}),
```

Place these spread lines right after the existing `...(params.mediaUrl ? { media_url: params.mediaUrl } : {})` line.

**2. src/lib/whatsapp/webhook-handler.ts — Add media download + Supabase upload:**

a. Add imports at the top:
```typescript
import { downloadMedia } from './api'
import { createAdminClient } from '@/lib/supabase/admin'
```
Note: createAdminClient is already imported. Just add downloadMedia.

b. Create a helper function `downloadAndUploadMedia` above or below `buildMessageContent`:
```typescript
const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document', 'sticker'])

/**
 * Download media from 360dialog and re-host on Supabase Storage.
 * Returns null if download fails (caller should save message without media).
 */
async function downloadAndUploadMedia(
  apiKey: string,
  mediaId: string,
  workspaceId: string,
  conversationId: string,
  mimeType?: string
): Promise<{ url: string; mimeType: string; filename?: string } | null> {
  try {
    const media = await downloadMedia(apiKey, mediaId)

    // Build storage path: {workspaceId}/{conversationId}/{timestamp}_{sanitized_filename_or_mediaId}
    const ext = getExtensionFromMime(media.mimeType || mimeType || 'application/octet-stream')
    const safeName = media.filename
      ? media.filename.replace(/[^a-zA-Z0-9.-]/g, '_')
      : `${mediaId}${ext}`
    const filePath = `inbound/${workspaceId}/${conversationId}/${Date.now()}_${safeName}`

    const supabase = createAdminClient()
    const { error: uploadError } = await supabase.storage
      .from('whatsapp-media')
      .upload(filePath, Buffer.from(media.buffer), {
        contentType: media.mimeType || mimeType || 'application/octet-stream',
        upsert: false,
      })

    if (uploadError) {
      console.error('[webhook] Media upload failed:', uploadError.message)
      return null
    }

    const { data: { publicUrl } } = supabase.storage
      .from('whatsapp-media')
      .getPublicUrl(filePath)

    return {
      url: publicUrl,
      mimeType: media.mimeType || mimeType || 'application/octet-stream',
      filename: media.filename || undefined,
    }
  } catch (error) {
    console.error('[webhook] Media download/upload failed:', error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Map MIME type to file extension.
 */
function getExtensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/3gpp': '.3gp',
    'audio/aac': '.aac',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/amr': '.amr',
    'audio/opus': '.opus',
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-excel': '.xls',
    'text/plain': '.txt',
  }
  return map[mimeType] || ''
}
```

c. In `processIncomingMessage`, add the media download logic AFTER `buildMessageContent(msg)` (line 151) and BEFORE the domain call (line 164).

Insert this block after `const messageTimestamp = ...` (line 152):

```typescript
    // Download and re-host media if this is a media message
    let mediaUrl: string | undefined
    let mediaMimeType: string | undefined
    let mediaFilename: string | undefined

    if (MEDIA_TYPES.has(msg.type)) {
      const mediaContent = content as MediaContent
      if (mediaContent.mediaId) {
        // Resolve API key for this workspace
        const { data: ws } = await supabase
          .from('workspaces')
          .select('settings')
          .eq('id', workspaceId)
          .single()
        const apiKey = (ws?.settings as any)?.whatsapp_api_key || process.env.WHATSAPP_API_KEY

        if (apiKey) {
          const uploaded = await downloadAndUploadMedia(
            apiKey,
            mediaContent.mediaId,
            workspaceId,
            conversationId,
            mediaContent.mimeType
          )
          if (uploaded) {
            mediaUrl = uploaded.url
            mediaMimeType = uploaded.mimeType
            mediaFilename = uploaded.filename || mediaContent.filename
          }
        } else {
          console.warn('[webhook] No API key found for media download, workspace:', workspaceId)
        }
      }
    }
```

d. Update the `domainReceiveMessage` call (line 164) to pass the new media fields:

```typescript
    const domainResult = await domainReceiveMessage(ctx, {
      conversationId,
      contactId,
      phone,
      messageContent: msg.text?.body ?? buildMessagePreview(msg),
      messageType: msg.type,
      waMessageId: msg.id,
      contentJson: content as unknown as Record<string, unknown>,
      timestamp: messageTimestamp,
      contactName: profileName,
      mediaUrl,
      mediaMimeType,
      mediaFilename,
    })
```

**IMPORTANT:**
- The `downloadMedia` function from api.ts already handles the 360dialog auth header (D360-API-KEY).
- Use `Buffer.from(media.buffer)` because Supabase storage upload expects Buffer, not ArrayBuffer.
- If download or upload fails, log the error and proceed WITHOUT media_url. The message must still be saved -- the frontend shows "Media no disponible" as fallback.
- Storage path uses `inbound/` prefix to distinguish from outbound and quick-reply media.
- The `MediaContent` type is already imported in webhook-handler.ts (line 24).
  </action>
  <verify>
1. `npx tsc --noEmit` passes without errors (type check both files).
2. Manually verify in code: `downloadMedia` is imported and called only when `MEDIA_TYPES.has(msg.type)` is true.
3. Verify the domain insert spreads `media_mime_type` and `media_filename` alongside `media_url`.
4. Verify error handling: the try/catch in `downloadAndUploadMedia` returns null on failure, and the caller proceeds without media fields.
  </verify>
  <done>
- Webhook handler downloads media from 360dialog API for image/video/audio/document/sticker messages
- Media is uploaded to Supabase Storage `whatsapp-media` bucket under `inbound/{workspaceId}/{conversationId}/` path
- Public URL is passed to domain layer as mediaUrl
- media_mime_type and media_filename are stored in the messages table
- If download fails, message is saved without media (graceful degradation)
- TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — no type errors
2. Code review: webhook-handler.ts calls downloadMedia + storage upload for media types
3. Code review: domain/messages.ts insert includes media_mime_type, media_filename
4. Code review: error paths return null/proceed gracefully, never throw
5. Frontend path is unchanged — message-bubble.tsx already reads media_url from the message and passes it to MediaPreview
</verification>

<success_criteria>
- Inbound media messages (image, video, audio, document, sticker) have media_url populated with a Supabase Storage public URL
- media_mime_type and media_filename are stored in the messages table
- Failed media downloads do not break message reception
- TypeScript compiles clean
- No changes to outbound media flow (already working)
</success_criteria>

<output>
After completion, create `.planning/quick/002-fix-media-inbound-null-url/002-SUMMARY.md`
</output>

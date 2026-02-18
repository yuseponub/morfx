---
phase: quick-002
plan: 01
subsystem: whatsapp
tags: [media, webhook, storage, 360dialog, supabase-storage]
dependency-graph:
  requires: [whatsapp-media bucket, 360dialog API, domain/messages]
  provides: [inbound media download+upload, media_url population]
  affects: [message-bubble.tsx display, MediaPreview component]
tech-stack:
  added: []
  patterns: [download-rehost pattern for ephemeral media URLs]
key-files:
  created: []
  modified:
    - src/lib/whatsapp/webhook-handler.ts
    - src/lib/domain/messages.ts
decisions:
  - "Storage path uses inbound/ prefix to distinguish from outbound quick-reply media"
  - "Workspace API key resolved per-message from workspaces.settings, fallback to env var"
  - "Graceful degradation: failed media download saves message without media_url (frontend shows fallback)"
metrics:
  duration: "3 minutes"
  completed: "2026-02-18"
---

# Quick 002: Fix Inbound Media Null URL Summary

**One-liner:** Download media from 360dialog API, re-host on Supabase Storage, and pass permanent public URL to domain layer so inbound images/video/audio/documents/stickers render in chat.

## What Was Done

### Task 1: Media download+upload in webhook handler + domain params extension

**Problem:** Inbound media messages (image, video, audio, document, sticker) always displayed "Media no disponible" because `media_url` was NULL in the database. The webhook handler received `media_id` from WhatsApp but never downloaded the actual file.

**Solution:**

1. **webhook-handler.ts** -- Added `downloadAndUploadMedia()` helper:
   - Downloads media binary from 360dialog via existing `downloadMedia(apiKey, mediaId)` function
   - Uploads to Supabase Storage `whatsapp-media` bucket under `inbound/{workspaceId}/{conversationId}/{timestamp}_{filename}` path
   - Returns permanent public URL, MIME type, and filename
   - Full error handling: returns null on failure (never breaks message reception)

2. **webhook-handler.ts** -- Added `getExtensionFromMime()` helper:
   - Maps common MIME types to file extensions for proper filenames
   - Covers JPEG, PNG, WebP, GIF, MP4, 3GP, AAC, OGG, MP3, AMR, Opus, PDF, DOCX, XLSX, XLS, TXT

3. **webhook-handler.ts** -- Updated `processIncomingMessage()`:
   - After `buildMessageContent()`, checks if message type is in MEDIA_TYPES set
   - Resolves workspace API key from `workspaces.settings.whatsapp_api_key` (fallback to env var)
   - Calls `downloadAndUploadMedia()` and passes result to domain call
   - Passes `mediaUrl`, `mediaMimeType`, `mediaFilename` to `domainReceiveMessage()`

4. **domain/messages.ts** -- Extended `ReceiveMessageParams`:
   - Added `mediaMimeType?: string` and `mediaFilename?: string` optional fields
   - Updated DB insert to spread `media_mime_type` and `media_filename` alongside existing `media_url`

**Commit:** `6d5ae22`

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- [x] `npx tsc --noEmit` passes without errors
- [x] `downloadMedia` imported and called only when `MEDIA_TYPES.has(msg.type)` is true
- [x] Domain insert spreads `media_mime_type` and `media_filename` alongside `media_url`
- [x] Error handling: try/catch in `downloadAndUploadMedia` returns null, caller proceeds without media fields
- [x] Frontend path unchanged -- message-bubble.tsx already reads `media_url` from message

## Data Flow

```
WhatsApp sends media message
  -> 360dialog webhook delivers payload with media_id
  -> processIncomingMessage() detects MEDIA_TYPES.has(msg.type)
  -> downloadAndUploadMedia():
       1. downloadMedia(apiKey, mediaId) -> { buffer, mimeType, filename }
       2. supabase.storage.upload(filePath, buffer, { contentType })
       3. supabase.storage.getPublicUrl(filePath) -> permanent URL
  -> domainReceiveMessage() stores media_url, media_mime_type, media_filename
  -> message-bubble.tsx reads media_url -> MediaPreview renders media
```

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/whatsapp/webhook-handler.ts` | Added downloadMedia import, MEDIA_TYPES set, downloadAndUploadMedia() helper, getExtensionFromMime() helper, media download logic in processIncomingMessage, media fields in domain call |
| `src/lib/domain/messages.ts` | Added mediaMimeType/mediaFilename to ReceiveMessageParams, spread into DB insert |

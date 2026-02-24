# Phase 32: Media Processing - Research

**Researched:** 2026-02-24
**Domain:** WhatsApp media handling (audio transcription, image/sticker vision, reaction mapping)
**Confidence:** HIGH

## Summary

Phase 32 adds a **Media Gate** step inside the existing Inngest pipeline that intercepts non-text messages before they reach the agent's intent detection. The gate classifies incoming messages by type (audio, image, video, sticker, reaction) and routes them through type-specific handlers: audio is transcribed via OpenAI Whisper API and fed back into the normal text pipeline; images/videos trigger immediate handoff; stickers are interpreted by Claude Vision; and reactions are mapped to text equivalents or ignored.

The codebase already handles media download, upload to Supabase Storage, and storage of media metadata in the messages table. The webhook handler (`src/lib/whatsapp/webhook-handler.ts`) currently downloads and re-hosts all media types but only routes `text` messages to the agent pipeline. The key change is expanding the `if (msg.type === 'text')` gate at line 290 to support additional message types.

**Primary recommendation:** Build a `src/lib/agents/media/media-gate.ts` module with pure functions for each media type, called from within the Inngest `whatsappAgentProcessor` step BEFORE `processMessageWithAgent`. The media gate transforms non-text messages into text equivalents or triggers handoff directly.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `openai` | ^4.x | Whisper API for audio transcription | Official OpenAI Node SDK, `audio.transcriptions.create()` with `toFile()` helper for buffer-based uploads |
| `@anthropic-ai/sdk` | ^0.73.0 (existing) | Claude Vision for sticker interpretation | Already installed, used by OCR module (`src/lib/ocr/extract-guide-data.ts`) with same base64 pattern |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Supabase Storage | existing | Media re-hosting | Already used by webhook handler for downloading/uploading media |
| Inngest | existing | Async processing pipeline | Media gate runs as a step inside the existing `whatsappAgentProcessor` function |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| OpenAI Whisper API | Deepgram, AssemblyAI | Whisper is the user's locked decision; $0.006/min is very competitive |
| Separate `openai` npm | `@ai-sdk/openai` (Vercel AI SDK) | AI SDK does not expose audio transcription; must use openai directly |

**Installation:**
```bash
npm install openai
```

**Environment variable needed:**
```
OPENAI_API_KEY=sk-...
```

## Architecture Patterns

### Recommended Project Structure
```
src/lib/agents/media/
  media-gate.ts          # Main entry: classifyAndTransform(msg) -> MediaGateResult
  audio-transcriber.ts   # Whisper transcription (download + transcribe)
  sticker-interpreter.ts # Claude Vision for sticker sentiment
  reaction-mapper.ts     # Pure emoji-to-text mapping (no API calls)
  types.ts               # MediaGateResult, MediaGateAction types
```

### Pattern 1: Media Gate as Pipeline Preprocessor

**What:** A synchronous transformation step that converts non-text messages to text equivalents or signals handoff/ignore.

**When to use:** Every incoming message passes through the media gate before intent detection.

**How it integrates with existing code:**

Currently in `webhook-handler.ts` (line 290):
```typescript
// CURRENT: Only text messages reach agent
if (msg.type === 'text') {
  // ... emit Inngest event or process inline
}
```

Changed to:
```typescript
// NEW: Text + media types all reach agent
const AGENT_PROCESSABLE_TYPES = new Set(['text', 'audio', 'sticker', 'image', 'video', 'reaction'])

if (AGENT_PROCESSABLE_TYPES.has(msg.type)) {
  // Emit Inngest event with full message metadata
  await inngest.send({
    name: 'agent/whatsapp.message_received',
    data: {
      conversationId,
      contactId,
      messageContent: msg.text?.body ?? buildMessagePreview(msg),
      messageType: msg.type,          // NEW field
      mediaUrl: mediaUrl ?? null,     // NEW field (already downloaded)
      mediaMimeType: mediaMimeType,   // NEW field
      workspaceId,
      phone,
      messageId: msg.id,
      messageTimestamp,
    },
  })
}
```

Then in the Inngest function (or inside `processMessageWithAgent`), the media gate runs FIRST:
```typescript
// Inside whatsappAgentProcessor or webhook-processor.ts
const gateResult = await processMediaGate({
  messageType: event.data.messageType ?? 'text',
  messageContent: event.data.messageContent,
  mediaUrl: event.data.mediaUrl,
  mediaMimeType: event.data.mediaMimeType,
  workspaceId: event.data.workspaceId,
  conversationId: event.data.conversationId,
  phone: event.data.phone,
})

switch (gateResult.action) {
  case 'passthrough':
    // Text message or transcribed audio -- continue normal pipeline
    return processMessageWithAgent({ ...input, messageContent: gateResult.text })
  case 'handoff':
    // Image/video -- send handoff message and notify host
    await executeMediaHandoff(conversationId, workspaceId, gateResult.reason)
    return { success: true, newMode: 'handoff' }
  case 'notify_host':
    // Negative reaction -- notify but don't handoff
    await notifyHostOnly(conversationId, workspaceId, gateResult.reason)
    return { success: true }
  case 'ignore':
    // Unrecognized sticker or unmapped reaction
    return { success: true }
}
```

### Pattern 2: Audio Transcription with Buffer (no filesystem)

**What:** Download audio from Supabase Storage URL, pass buffer directly to OpenAI Whisper API without writing to disk.

**Why important:** Vercel serverless has limited /tmp and the audio is already in memory from the media download.

**Example:**
```typescript
// Source: OpenAI Node SDK docs + existing webhook-handler.ts pattern
import OpenAI, { toFile } from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function transcribeAudio(audioUrl: string, mimeType: string): Promise<string> {
  // Fetch audio buffer from Supabase Storage public URL
  const response = await fetch(audioUrl)
  if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())

  // Determine file extension for OpenAI (it needs this hint)
  const ext = mimeTypeToExt(mimeType) // '.ogg' for audio/ogg
  const file = await toFile(buffer, `voice${ext}`, { type: mimeType })

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'es',  // Spanish -- optimizes accuracy for Colombian customers
  })

  return transcription.text
}
```

### Pattern 3: Sticker Vision with Base64 (existing OCR pattern)

**What:** Fetch sticker WebP from Supabase Storage, convert to base64, send to Claude Vision with sentiment prompt.

**Why this pattern:** Already proven in `src/lib/ocr/extract-guide-data.ts`. Stickers are small (max 500KB) so base64 encoding is efficient.

**Example:**
```typescript
// Source: Existing OCR pattern in src/lib/ocr/extract-guide-data.ts
import Anthropic from '@anthropic-ai/sdk'

const STICKER_PROMPT = `Eres un interprete de stickers de WhatsApp. Analiza este sticker y determina que gesto o sentimiento expresa.

Gestos reconocibles (responde con el texto equivalente):
- Pulgar arriba, ok, aprobacion -> "ok"
- Corazon, amor, carino -> "ok"
- Saludo, hola, chao -> "hola"
- Aplausos, celebracion -> "ok"
- Risa, carcajada -> "jaja"
- Gracias, agradecimiento, reverencia -> "gracias"

Si el sticker NO expresa claramente uno de estos gestos basicos, responde SOLO con:
{"gesto": null, "descripcion": "breve descripcion de lo que ves"}

Si SI expresa un gesto reconocible, responde SOLO con:
{"gesto": "ok" | "hola" | "jaja" | "gracias", "descripcion": "breve descripcion"}

Responde UNICAMENTE con JSON valido.`

async function interpretSticker(stickerUrl: string): Promise<{ gesto: string | null; descripcion: string }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const res = await fetch(stickerUrl)
  const buffer = Buffer.from(await res.arrayBuffer())
  const base64Data = buffer.toString('base64')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',  // Use cheapest capable vision model
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/webp', data: base64Data } },
        { type: 'text', text: STICKER_PROMPT },
      ],
    }],
  })
  // ... parse JSON response
}
```

### Pattern 4: Reaction Mapping (Pure TypeScript, no API calls)

**What:** Static map of emoji to text equivalent or action. Zero latency, zero cost.

**Example:**
```typescript
type ReactionAction =
  | { type: 'text'; text: string }
  | { type: 'notify_host'; reason: string }
  | { type: 'ignore' }

const REACTION_MAP: Record<string, ReactionAction> = {
  '\u{1F44D}': { type: 'text', text: 'ok' },        // thumbs up
  '\u2764\uFE0F': { type: 'text', text: 'ok' },      // red heart
  '\u{1F602}': { type: 'text', text: 'jaja' },        // laughing
  '\u{1F64F}': { type: 'text', text: 'gracias' },     // folded hands
  '\u{1F622}': { type: 'notify_host', reason: 'Reaccion triste del cliente' },  // crying
  '\u{1F621}': { type: 'notify_host', reason: 'Reaccion de enojo del cliente' }, // angry
}

function mapReaction(emoji: string): ReactionAction {
  return REACTION_MAP[emoji] ?? { type: 'ignore' }
}
```

### Anti-Patterns to Avoid

- **Processing media inline in the webhook handler:** NEVER do transcription or Vision calls inside the webhook POST handler. Media processing is slow (2-10 seconds). Always delegate to Inngest.
- **Re-downloading media in the Inngest function:** The webhook handler already downloads and re-hosts media to Supabase Storage. The media gate should use the `mediaUrl` (public Supabase URL), never re-download from 360dialog (URLs expire in 5 minutes).
- **Calling OpenAI from the webhook handler:** The webhook must return 200 fast. All API calls happen inside the Inngest function.
- **Creating a new Inngest function per media type:** Use the existing `whatsappAgentProcessor` function. The media gate is a step WITHIN it, not a separate function.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio transcription | Custom Whisper integration | `openai` npm SDK `audio.transcriptions.create()` | Handles auth, retries, file upload format automatically |
| Buffer-to-file conversion | Manual multipart form | OpenAI SDK `toFile()` helper | Correctly builds File objects from buffers for the API |
| Image analysis | Custom HTTP calls to Claude | `@anthropic-ai/sdk` `messages.create()` with image blocks | Already proven pattern in OCR module |
| Emoji Unicode handling | Manual unicode parsing | Native JS string comparison | JS handles emoji comparison natively; use a constant map |
| Media download from 360dialog | New download logic | Existing `downloadAndUploadMedia()` in webhook-handler.ts | Already handles the 360dialog proxy URL replacement and Supabase upload |

**Key insight:** The webhook handler already downloads all media types and re-hosts them. The media gate only needs the Supabase Storage URL -- it never touches 360dialog directly.

## Common Pitfalls

### Pitfall 1: WhatsApp Audio Format (OGG/Opus) vs Whisper Accepted Formats
**What goes wrong:** WhatsApp voice notes arrive as `audio/ogg; codecs=opus`. Opus as a standalone format (.opus) is NOT listed as supported by OpenAI Whisper API. However, OGG container IS supported.
**Why it happens:** Confusion between the container format (OGG -- supported) and the codec (Opus). WhatsApp audio arrives in OGG container with Opus codec.
**How to avoid:** Pass the audio as `.ogg` file to Whisper. The OGG container format IS in the supported list (flac, mp3, mp4, mpeg, mpga, m4a, **ogg**, wav, webm). Use `toFile(buffer, 'voice.ogg', { type: 'audio/ogg' })`. If this fails for some audio files, convert to `.mp3` using a lightweight server-side approach.
**Warning signs:** Transcription returns empty string or API returns 400 error.
**Fallback strategy:** If OGG fails, the audio-transcriber should catch the error and trigger handoff (per CONTEXT.md: "If transcription fails -> handoff silencioso").

### Pitfall 2: Sticker WebP Animated vs Static
**What goes wrong:** Animated stickers are WebP files with multiple frames. Claude Vision processes only the first frame.
**Why it happens:** Claude Vision treats WebP as a static image, extracting only the first frame of animated WebP files.
**How to avoid:** This is acceptable behavior -- the first frame usually captures the main gesture. The CONTEXT.md decision says unrecognizable stickers are silently ignored, so partial interpretation is fine.
**Warning signs:** Animated sticker always returns `{ gesto: null }`.

### Pitfall 3: Inngest Event Schema Must Be Extended
**What goes wrong:** The existing `agent/whatsapp.message_received` event only carries `messageContent` (string). Media messages need `messageType`, `mediaUrl`, `mediaMimeType`.
**Why it happens:** The event was designed for text-only messages in Phase 16.
**How to avoid:** Add optional fields to the event type in `src/inngest/events.ts`. Keep `messageContent` as the primary text field. Add `messageType`, `mediaUrl`, `mediaMimeType` as optional fields that default to `'text'` and `null`.
**Warning signs:** Media messages arrive at Inngest without media URLs.

### Pitfall 4: Reaction Messages Have Different Structure
**What goes wrong:** Reactions don't have `msg.text.body`. The webhook handler passes `buildMessagePreview(msg)` which returns `'[Reaccion]'` -- not useful for mapping.
**Why it happens:** Reactions have `msg.reaction.emoji` and `msg.reaction.message_id`, not text content.
**How to avoid:** The Inngest event needs to carry the raw emoji for reactions. Either: (a) add a `reactionEmoji` field to the event, or (b) extract the emoji in the webhook handler and put it in `messageContent`. Option (b) is simpler -- for reactions, set `messageContent` to the actual emoji string.
**Warning signs:** All reactions arrive as `'[Reaccion]'` string and can't be mapped.

### Pitfall 5: Media Handoff Must Cancel Silence Timer
**What goes wrong:** If the bot sent a SILENCIOSO response and started a 90s silence timer, then the customer sends an image (triggering handoff), the silence timer could fire AFTER handoff, sending the retake message to a customer now being handled by a human.
**Why it happens:** The silence timer listens for `agent/customer.message` but the image handoff might not emit that event.
**How to avoid:** When media triggers handoff, emit `agent/customer.message` for the same sessionId to cancel any active timers. This is the same pattern used by normal text messages.
**Warning signs:** Customer gets bot retake message after being handed off due to an image.

### Pitfall 6: Consecutive Audio Concatenation Window
**What goes wrong:** Customer sends 3 voice notes in quick succession. With Inngest concurrency limit of 1 per conversation, they queue up and process sequentially. Each audio gets transcribed and processed independently instead of being concatenated.
**Why it happens:** The concurrency control ensures sequential processing, but there's no batching/accumulation mechanism for consecutive audio messages.
**How to avoid:** Since the Inngest function has concurrency=1 per conversationId, messages process in order. The simplest approach: in the media gate, when processing an audio message, check if the PREVIOUS message (within last ~15 seconds) was also audio. If so, fetch its transcription from the DB and concatenate. Alternatively, use a short `step.waitForEvent` to batch consecutive audios.
**Warning signs:** Each 5-second voice note gets processed as an independent message, losing context.

## Code Examples

### Complete Media Gate Entry Point
```typescript
// src/lib/agents/media/media-gate.ts
import type { MediaGateResult } from './types'

export interface MediaGateInput {
  messageType: string       // 'text' | 'audio' | 'image' | 'video' | 'sticker' | 'reaction'
  messageContent: string    // text body, or emoji for reactions, or '[Audio]' for media
  mediaUrl: string | null   // Supabase Storage public URL (already re-hosted)
  mediaMimeType: string | null
  workspaceId: string
  conversationId: string
  phone: string
}

export type MediaGateResult =
  | { action: 'passthrough'; text: string }          // Continue to normal pipeline with this text
  | { action: 'handoff'; reason: string }            // Handoff to human
  | { action: 'notify_host'; reason: string }        // Notify host but don't handoff
  | { action: 'ignore' }                              // Silently ignore

export async function processMediaGate(input: MediaGateInput): Promise<MediaGateResult> {
  switch (input.messageType) {
    case 'text':
      return { action: 'passthrough', text: input.messageContent }

    case 'audio':
      return handleAudio(input)

    case 'image':
    case 'video':
      return { action: 'handoff', reason: `Cliente envio ${input.messageType === 'image' ? 'una imagen' : 'un video'}` }

    case 'sticker':
      return handleSticker(input)

    case 'reaction':
      return handleReaction(input)

    default:
      return { action: 'ignore' }
  }
}
```

### OpenAI Whisper Transcription from Buffer
```typescript
// src/lib/agents/media/audio-transcriber.ts
import OpenAI, { toFile } from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function transcribeAudioFromUrl(
  audioUrl: string,
  mimeType: string
): Promise<{ success: true; text: string } | { success: false; error: string }> {
  try {
    const response = await fetch(audioUrl)
    if (!response.ok) {
      return { success: false, error: `Failed to fetch audio: ${response.status}` }
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const ext = mimeType?.includes('ogg') ? '.ogg'
              : mimeType?.includes('mpeg') ? '.mp3'
              : mimeType?.includes('aac') ? '.aac'
              : '.ogg'  // Default for WhatsApp voice notes

    const file = await toFile(buffer, `voice${ext}`, { type: mimeType || 'audio/ogg' })

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'es',
    })

    if (!transcription.text || transcription.text.trim().length === 0) {
      return { success: false, error: 'Empty transcription' }
    }

    return { success: true, text: transcription.text.trim() }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return { success: false, error: msg }
  }
}
```

### Claude Vision for Sticker Interpretation
```typescript
// src/lib/agents/media/sticker-interpreter.ts
import Anthropic from '@anthropic-ai/sdk'

const RECOGNIZED_GESTURES = new Set(['ok', 'hola', 'jaja', 'gracias'])

export async function interpretSticker(
  stickerUrl: string
): Promise<{ gesto: string | null; descripcion: string }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const res = await fetch(stickerUrl)
  if (!res.ok) return { gesto: null, descripcion: 'Could not fetch sticker' }

  const buffer = Buffer.from(await res.arrayBuffer())
  const base64Data = buffer.toString('base64')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/webp', data: base64Data },
        },
        { type: 'text', text: STICKER_VISION_PROMPT },
      ],
    }],
  })

  // Parse response (same JSON extraction pattern as OCR module)
  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { gesto: null, descripcion: 'Could not parse vision response' }

  try {
    const parsed = JSON.parse(jsonMatch[0])
    const gesto = RECOGNIZED_GESTURES.has(parsed.gesto) ? parsed.gesto : null
    return { gesto, descripcion: parsed.descripcion || '' }
  } catch {
    return { gesto: null, descripcion: 'JSON parse error' }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Whisper-1 only | gpt-4o-transcribe, gpt-4o-mini-transcribe also available | Late 2025 | Better accuracy, speaker diarization support. But whisper-1 at $0.006/min is the locked decision and sufficient for short voice notes. |
| Claude Vision URL-based | Claude Vision supports URL, base64, and Files API | 2025 | Base64 is most reliable (proven in OCR module). URL-based can fail with access restrictions. |
| Sticker: pre-mapped IDs | Vision on every sticker | Locked decision | More flexible, handles any sticker, but costs ~$0.002-0.005 per sticker (1 API call at ~200-300 tokens) |

**Deprecated/outdated:**
- None relevant. The openai npm package v4.x is current and stable.

## Open Questions

1. **OGG/Opus transcription reliability**
   - What we know: OGG container is officially supported by Whisper. WhatsApp voice notes use OGG with Opus codec.
   - What's unclear: Whether ALL WhatsApp voice note variants (different Android/iOS versions, different durations) reliably transcribe via the OGG path without conversion.
   - Recommendation: Implement with `.ogg` path first. Add error handling that triggers handoff on transcription failure. Monitor for a week. If failure rate > 5%, add a conversion step.

2. **Consecutive audio batching timing window**
   - What we know: Inngest concurrency=1 per conversationId means audios process sequentially. The CONTEXT.md says "concatenar transcripciones en un solo texto antes de procesar."
   - What's unclear: Exact timing window for "consecutive" audios. 10 seconds? 30 seconds? And whether to use DB lookback or Inngest `step.waitForEvent`.
   - Recommendation: Use a simple DB lookback approach: when processing an audio message, check if the previous message (within 15 seconds, same conversation, inbound, type=audio) was already transcribed. If so, concatenate texts. Simpler than Inngest batching and works with existing concurrency control.

3. **Claude Vision model cost for stickers**
   - What we know: Using claude-sonnet-4-6 for vision. Stickers are 512x512 WebP, ~350-1600 tokens per image. At ~$3/M input tokens, that's ~$0.001-0.005 per sticker.
   - What's unclear: Volume of stickers per day. If high volume, consider using a cheaper model (claude-haiku) if it supports vision adequately.
   - Recommendation: Start with claude-sonnet-4-6 (matches OCR module). Monitor volume. Switch to cheaper model if sticker volume exceeds ~100/day.

4. **Host notification format**
   - What we know: Media handoff and negative reactions need to notify the "host" (human agent). The existing handoff handler creates a task and toggles agent off.
   - What's unclear: Whether "notify host" for negative reactions should use the same task system or a simpler notification (Supabase Realtime broadcast).
   - Recommendation (Claude's discretion): For media handoff (image/video), use the existing `executeHandoff()` with "Regalame 1 min" message. For negative reactions (notify only, no handoff), create a lightweight notification via Supabase Realtime broadcast on the conversation channel -- no task needed.

## Sources

### Primary (HIGH confidence)
- Anthropic Claude Vision docs: https://platform.claude.com/docs/en/build-with-claude/vision -- Image formats, size limits, API format verified
- Existing codebase: `src/lib/ocr/extract-guide-data.ts` -- Proven Claude Vision pattern with base64 encoding
- Existing codebase: `src/lib/whatsapp/webhook-handler.ts` -- Media download pipeline, type handling, agent routing
- Existing codebase: `src/lib/whatsapp/types.ts` -- WhatsApp message types including sticker, reaction, audio structures

### Secondary (MEDIUM confidence)
- OpenAI Whisper API docs: https://platform.openai.com/docs/api-reference/audio/createTranscription -- Supported formats (flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm), model options
- OpenAI Node SDK: https://github.com/openai/openai-node -- `toFile()` helper for buffer-based file uploads
- 360dialog media docs: https://docs.360dialog.com/partner/messaging-and-calling/media-messages -- Audio format is audio/ogg with Opus codec

### Tertiary (LOW confidence)
- Community reports on OGG/Opus compatibility with Whisper API: https://community.openai.com/t/support-for-opus-file-format/1127125 -- Mixed reports on whether .opus files work directly; .ogg container should work

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- OpenAI SDK for transcription is well-documented; Claude Vision is already proven in the codebase
- Architecture: HIGH -- Media gate pattern is a natural extension of the existing pipeline; insertion point is clear
- Pitfalls: HIGH -- Key pitfalls identified from codebase analysis (event schema, timer cancellation, audio format)
- Audio format handling: MEDIUM -- OGG container is listed as supported but real-world WhatsApp audio compatibility needs validation

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (30 days -- stable domain, APIs are mature)

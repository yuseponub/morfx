# Technology Stack: Human Behavior System (v4.0)

**Project:** MorfX - Somnio Human Behavior
**Researched:** 2026-02-23
**Overall Confidence:** HIGH

## Executive Summary

The Human Behavior system requires **one new npm dependency** (OpenAI SDK for Whisper) and **zero framework changes**. Everything else is achievable with existing stack: Inngest concurrency (already proven in `agent-production.ts`), Claude Vision (already used in OCR module), and Haiku via `@anthropic-ai/sdk` (already in project). The architecture change is moving webhook processing from inline to Inngest-queued, which is a refactor of existing code, not a new technology.

---

## Stack Additions

### 1. OpenAI SDK (NEW - Audio Transcription)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `openai` | ^6.22.0 | Whisper API for audio transcription | Only viable server-side transcription API. WhatsApp audios are OGG/Opus, Whisper supports OGG natively. No self-hosting complexity. |

**Installation:**
```bash
npm install openai
```

**Integration point:** New `src/lib/media/transcribe-audio.ts` module. Called inside Inngest step when audio message arrives.

**Pricing (Whisper-1 model):**
- **$0.006/min** (~$0.36/hour)
- WhatsApp voice notes: typically 5-30 seconds = **$0.0005 - $0.003 per audio**
- Estimated volume: 1-5 audios/day = **$0.02-0.10/month** (negligible)
- Alternative: `gpt-4o-mini-transcribe` at **$0.003/min** (half price, newer) -- recommend starting with `whisper-1` for proven reliability, can switch later.

**Audio format compatibility:**
- WhatsApp sends audio as **`audio/ogg; codecs=opus`** (OGG container with Opus codec)
- Whisper API supports: `flac`, `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `ogg`, `wav`, `webm`
- **OGG is natively supported** -- no transcoding needed
- File size limit: **25 MB** (WhatsApp voice notes max ~16 MB, so always within limit)

**SDK usage pattern:**
```typescript
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Audio buffer already available from existing downloadMedia() in whatsapp/api.ts
const file = new File([audioBuffer], 'audio.ogg', { type: 'audio/ogg' })
const transcription = await openai.audio.transcriptions.create({
  model: 'whisper-1',
  file,
  language: 'es',  // Force Spanish for better accuracy
  response_format: 'text',  // Just the text, no timestamps needed
})
// transcription = "Hola, quiero saber el precio del producto"
```

**Latency expectation:** ~1-3 seconds for typical WhatsApp voice note (5-30s audio). Acceptable because the check-before-send delay system (Etapa 3A) absorbs this time naturally.

**Confidence:** HIGH -- Official OpenAI docs confirm OGG support, pricing verified from multiple sources.

---

### 2. Inngest Concurrency (EXISTING - Configuration Change)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `inngest` | ^3.51.0 (current) | Concurrency 1 per conversation for message queuing | Already proven in `agent-production.ts`. The Human Behavior system extends this to ALL message types (not just text). |

**No version change needed.** Current `inngest@^3.51.0` fully supports the concurrency pattern.

**Already working in codebase:**
```typescript
// src/inngest/functions/agent-production.ts (line 34-38)
concurrency: [
  {
    key: 'event.data.conversationId',
    limit: 1,
  },
],
```

**Key Inngest behaviors verified from official docs:**
1. **Limit = steps, not runs.** `step.sleep()` and `step.waitForEvent()` do NOT count against concurrency. Only actively executing `step.run()` blocks count.
2. **Queuing is automatic.** When concurrency 1 is reached, new events queue and execute in order when the previous step completes.
3. **Key expression uses CEL.** Format: `'event.data.conversationId'` -- already working.

**Architecture change:** The webhook handler currently calls `processMessageWithAgent` inline for text messages only (line 250-296 of webhook-handler.ts). Human Behavior changes this to:
```
Webhook receives message (any type)
  -> Save to DB
  -> inngest.send({ name: 'agent/whatsapp.message_received', data: { ... } })
  -> Return 200 (webhook done in ~200ms)
```
The Inngest function picks up with concurrency 1 per conversation, handling ALL message types (text, audio, sticker, reaction, image, video).

**What changes in `agent-production.ts`:**
- Accept all message types (not just text)
- Add media processing step before intent detection
- Add check-before-send loop with `step.sleep()` + `step.run()` pattern

**Confidence:** HIGH -- Pattern already proven in production with same Inngest version.

---

### 3. Claude Vision for Stickers (EXISTING - New Use Case)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@anthropic-ai/sdk` | ^0.73.0 (current) | Interpret WhatsApp stickers | Already used for OCR in `extract-guide-data.ts`. Same SDK, same pattern. |

**No new dependency.** Already in `package.json`.

**Sticker characteristics:**
- WhatsApp stickers: **512x512 px** max, typically **image/webp** format
- Claude Vision supports: JPEG, PNG, GIF, **WebP**
- Token cost formula: `tokens = (width * height) / 750`
- **512x512 sticker = ~349 tokens**

**Cost per sticker interpretation:**
| Model | Input Cost/1M | Tokens per Sticker | Cost per Sticker | Cost + Output (~50 tokens) |
|-------|---------------|-------------------|------------------|---------------------------|
| Haiku 3.5 | $0.80 | ~349 | $0.00028 | **~$0.0005** |
| Haiku 4.5 | $1.00 | ~349 | $0.00035 | **~$0.0006** |
| Sonnet 4 | $3.00 | ~349 | $0.00105 | **~$0.0013** |

**Recommendation: Use Haiku 3.5 for sticker interpretation.** At $0.0005/sticker this is practically free. Sticker interpretation is a simple task (classify as greeting/ok/thumbs-up/laughing/unclear) -- does not need Sonnet reasoning capability.

**Integration pattern (same as existing OCR):**
```typescript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const base64Data = Buffer.from(stickerBuffer).toString('base64')

const response = await client.messages.create({
  model: 'claude-3-5-haiku-20241022',  // Haiku 3.5 -- cheapest
  max_tokens: 100,
  messages: [{
    role: 'user',
    content: [
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/webp', data: base64Data },
      },
      {
        type: 'text',
        text: 'This is a WhatsApp sticker. What does it express? Reply with ONE word: greeting, ok, thumbsup, laughing, love, sad, or unclear.',
      },
    ],
  }],
})
```

**Confidence:** HIGH -- Vision is already working in production for OCR (Phase 27). WebP confirmed supported. Token formula from official docs.

---

### 4. Claude Haiku for Minifrase Generation (EXISTING - New Use Case)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@anthropic-ai/sdk` | ^0.73.0 (current) | Generate minifrases for no-repetition system | Fast, cheap classification. Already used for intent detection. |

**No new dependency.**

**Current Haiku situation in codebase:** The project defines `claude-haiku-4-5` as a model constant but maps it to Sonnet 4 in `MODEL_MAP` (line 27 of `claude-client.ts`):
```typescript
'claude-haiku-4-5': 'claude-sonnet-4-20250514', // Using Sonnet 4 until Haiku 4 available
```

**For minifrase generation, use Haiku 3.5 directly** (not through the MODEL_MAP). The minifrase system needs maximum speed and minimum cost, not orchestrator-level reasoning.

**Haiku 3.5 pricing (verified):**
- Input: **$0.80/1M tokens** ($0.0008/1K)
- Output: **$4.00/1M tokens** ($0.004/1K)
- Context window: 200K tokens

**Haiku 4.5 pricing (for comparison):**
- Input: **$1.00/1M tokens**
- Output: **$5.00/1M tokens**
- 25% more expensive, better quality -- overkill for minifrases

**Cost per minifrase call:**
- Input: ~200 tokens (message content + prompt) = $0.00016
- Output: ~30 tokens (minifrase text) = $0.00012
- **Total: ~$0.0003 per call**

**When minifrases are generated:**
- **Plantillas (~30):** Predefined in code. **$0 runtime cost.**
- **Human/AI messages:** Generated on send. ~2-5 per conversation = **$0.0006-0.0015/conversation**
- **No-repetition Level 2 checks:** ~1-3 per response block = **$0.0003-0.0009/block**

**Estimated monthly cost at 50 conversations/day:** ~$2-5/month (negligible).

**Latency expectation:** ~200-400ms for Haiku calls. Acceptable because minifrase generation happens asynchronously (not blocking the user-facing response).

**Confidence:** HIGH -- Haiku 3.5 pricing verified. Already using Anthropic SDK in project.

---

### 5. Inngest step.sleep + step.run Pattern (EXISTING - Check-Before-Send)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `inngest` | ^3.51.0 (current) | Implement delay + DB check loop for message sequencing | step.sleep does NOT hold compute. step.run re-enters for DB check. Already used in agent-timers.ts. |

**The check-before-send pattern is the core architectural innovation.** It uses Inngest's step system to implement the delay-check-send loop:

```typescript
// Inside Inngest function (concurrency 1 per conversation)
for (const template of responseTemplates) {
  // 1. Calculate delay based on character count
  const delayMs = calculateCharDelay(template.content.length)

  // 2. Sleep (does NOT count against concurrency)
  await step.sleep(`delay-${template.id}`, `${delayMs}ms`)

  // 3. Check for new inbound messages (step.run = DB query)
  const hasNewInbound = await step.run(`check-${template.id}`, async () => {
    const supabase = createAdminClient()
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound')
      .gt('created_at', processingStartedAt)
    return (count ?? 0) > 0
  })

  if (hasNewInbound) {
    // Save unsent templates as pending, break loop
    break
  }

  // 4. Send the template
  await step.run(`send-${template.id}`, async () => {
    await sendWhatsAppMessage(workspaceId, conversationId, template.content)
  })
}
```

**Why this works with Inngest:**
- `step.sleep()` is free (no compute, no concurrency count)
- `step.run()` is a separate HTTP invocation (fresh DB connection each time)
- If the function crashes mid-sequence, Inngest retries from last completed step
- Concurrency 1 means the next message's Inngest event queues automatically while we're sleeping/sending

**Important Inngest behavior for step loops:**
Each `step.run()` in a loop needs a **unique step ID** (e.g., `check-${template.id}`). Inngest uses step IDs for memoization -- duplicate IDs cause skipped execution.

**Confidence:** HIGH -- `step.sleep()` + `step.run()` pattern proven in `agent-timers.ts` (same codebase). The loop pattern with dynamic step IDs is documented in Inngest's "Working with Loops" guide.

---

## Summary: What to Install

```bash
# Only ONE new dependency
npm install openai
```

**Environment variable needed:**
```
OPENAI_API_KEY=sk-...
```

---

## What NOT to Add

| Technology | Why NOT | What to Use Instead |
|-----------|---------|---------------------|
| `ffmpeg` / audio transcoding libs | WhatsApp OGG/Opus is natively supported by Whisper. No transcoding needed. | Direct buffer pass to Whisper API |
| `openai` Realtime API | Streaming transcription is overkill. Voice notes are complete audio files. | Standard `audio.transcriptions.create()` |
| `gpt-4o-transcribe` | Better accuracy but 2x cost of `whisper-1` for Spanish audio. Not needed for short voice notes. | `whisper-1` (proven, cheaper) -- can upgrade later if accuracy issues |
| `bull` / `bullmq` / Redis | Inngest already provides queuing, concurrency, and durability. Adding Redis is redundant complexity. | Inngest concurrency 1 per conversation |
| `sharp` / image processing | Sticker images are already small (512x512 WebP). No resizing needed for Claude Vision. | Pass WebP directly to Claude |
| `@ai-sdk/openai` (Vercel AI SDK) | Whisper is a single API call, not a streaming chat. AI SDK adds complexity for no benefit here. | Direct `openai` SDK |
| Message debounce library | The check-before-send pattern with character delays replaces debouncing entirely. | `step.sleep()` + DB check |
| Separate Haiku 4.5 model constant | Too expensive for minifrase (25% more than 3.5). Minifrase is a trivial classification task. | Haiku 3.5 directly: `claude-3-5-haiku-20241022` |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| Audio transcription | OpenAI Whisper-1 | Google Speech-to-Text | Whisper is simpler (single API call vs stream setup), supports OGG natively, pricing comparable |
| Audio transcription | OpenAI Whisper-1 | AssemblyAI | Additional vendor relationship, more complex SDK, no meaningful advantage for short audio |
| Sticker interpretation | Claude Haiku 3.5 Vision | GPT-4o Vision | Already have Anthropic SDK + API key in project, adding OpenAI Vision means managing two Vision APIs |
| Minifrase generation | Claude Haiku 3.5 | GPT-4o-mini | Same reason -- keep one LLM vendor for text generation |
| Message queuing | Inngest | BullMQ + Redis | Inngest already in stack with proven concurrency pattern, adding Redis is ops burden |
| Check-before-send | Inngest step.sleep + step.run | setTimeout in serverless | setTimeout dies when Vercel function times out. Inngest sleeps are durable across restarts. |

---

## Cost Estimates (Monthly at 50 conversations/day)

| API | Per-Call Cost | Calls/Day | Monthly Cost |
|-----|-------------|-----------|-------------|
| Whisper (audio transcription) | $0.001 avg | 5-10 | **$0.15-0.30** |
| Claude Vision (stickers) | $0.0005 | 3-5 | **$0.05-0.08** |
| Claude Haiku (minifrases) | $0.0003 | 50-100 | **$0.45-0.90** |
| Claude Haiku (no-repetition L2) | $0.0003 | 100-200 | **$0.90-1.80** |
| **TOTAL new API costs** | | | **$1.55-3.08/month** |

**Context:** Existing Claude costs for intent detection + orchestration are ~$15-25/month at this volume. Human Behavior adds **~10-15%** to existing AI costs.

---

## Integration Points with Existing Stack

| Existing Component | How It Changes | Impact |
|-------------------|----------------|--------|
| `webhook-handler.ts` | Remove inline agent call (L250-296), emit Inngest event for ALL message types | Medium -- core webhook refactor |
| `agent-production.ts` | Expand to handle audio/sticker/reaction, add check-before-send loop | Large -- becomes the central message processor |
| `messaging.ts` (ProductionMessagingAdapter) | Replace fixed `delaySeconds` with `calculateCharDelay()`, add check-before-send | Medium -- delay logic change |
| `agent-timers.ts` | Add silence timer (90s retoma) using same `step.waitForEvent()` pattern | Small -- new timer, existing pattern |
| `events.ts` | Add `agent/silence.detected` event type | Small -- type addition |
| `claude-client.ts` | Add direct Haiku 3.5 model for minifrase (bypass MODEL_MAP) | Small -- new method |
| `whatsapp/api.ts` | `downloadMedia()` already returns buffer -- pipe to Whisper | None -- already works |
| Supabase | Add `processed_by_agent` column to messages, create `disambiguation_log` table | Small -- 2 migrations |

---

## Sources

- [Inngest Concurrency Documentation](https://www.inngest.com/docs/functions/concurrency) -- Verified key expression syntax, step-level limiting
- [Inngest Sleeps Documentation](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/sleeps) -- Confirmed sleep does not hold compute
- [OpenAI Whisper API Reference](https://platform.openai.com/docs/api-reference/audio/) -- Supported formats: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm
- [OpenAI Pricing](https://platform.openai.com/docs/pricing) -- Whisper-1: $0.006/min
- [Anthropic Claude Vision Documentation](https://platform.claude.com/docs/en/docs/build-with-claude/vision) -- Image token formula: (width*height)/750, WebP supported
- [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing) -- Haiku 3.5: $0.80/$4.00 per 1M tokens
- [360dialog Media Documentation](https://docs.360dialog.com/docs/waba-messaging/media/upload-retrieve-or-delete-media) -- WhatsApp audio format: audio/ogg (opus codec)
- [OpenAI npm package](https://www.npmjs.com/package/openai) -- v6.22.0 (latest)
- Existing codebase: `src/inngest/functions/agent-production.ts` -- Proven concurrency 1 per conversation
- Existing codebase: `src/lib/ocr/extract-guide-data.ts` -- Proven Claude Vision with base64 images
- Existing codebase: `src/lib/whatsapp/api.ts` -- Proven media download returning ArrayBuffer

---
*Research completed: 2026-02-23*

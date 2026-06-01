---
phase: v4-media-audio-image
plan: "03"
subsystem: media-gate + image-classifier + agent-production + webhook-processor
tags: [media, vision, gemini, v4-only, regla6, tdd, image-classifier, audio-transcription]
dependency_graph:
  requires: [02]   # Message.transcription + setMessageTranscription (Wave 1)
  provides:
    - classifyImage (Gemini Vision single-call, 6 categorias, decision in code)
    - handleAudioV4 (transcribe + carry transcription for persist step)
    - handleImageV4 (classify → vision_respond or informed handoff)
    - MediaGateResult.vision_respond variant
    - MediaGateInput.resolvedAgentId field
    - persist-transcription Inngest step (setMessageTranscription via Regla 3 domain fn)
    - ProcessMessageInput.visionContext stub (Plan 04 consumes)
  affects:
    - src/lib/agents/media/types.ts
    - src/lib/agents/media/media-gate.ts
    - src/lib/agents/media/image-classifier.ts   # NEW
    - src/lib/agents/media/index.ts
    - src/inngest/functions/agent-production.ts
    - src/lib/agents/production/webhook-processor.ts
tech_stack:
  added:
    - "@ai-sdk/google google('gemini-2.5-flash') with Output.object + BLOCK_NONE x4 (image-classifier.ts)"
  patterns:
    - "v4-only gating via resolvedAgentId === SOMNIO_V4_AGENT_ID in switch cases (Regla 6)"
    - "decision computed in code from categoria (Pitfall 4 — LLM returns only categoria+descripcion)"
    - "MediaGateResult union extended additively — passthrough.transcription optional, new vision_respond variant"
    - "persist-transcription Inngest step: best-effort, non-blocking, Regla 3 (UPDATE by wamid)"
    - "fetchAsBase64 pattern from extract-guide-data.ts adapted to AI SDK image part"
    - "TDD RED/GREEN: 2 RED commits (d0ffd8dc, 4309653e) + 2 GREEN commits (c39270c8, d9bc6a92)"
key_files:
  created:
    - src/lib/agents/media/image-classifier.ts
    - src/lib/agents/media/__tests__/image-classifier.test.ts
    - src/lib/agents/media/__tests__/media-gate-v4.test.ts
  modified:
    - src/lib/agents/media/types.ts
    - src/lib/agents/media/media-gate.ts
    - src/lib/agents/media/index.ts
    - src/inngest/functions/agent-production.ts
    - src/lib/agents/production/webhook-processor.ts
decisions:
  - "MediaGateResult passthrough extended with optional transcription?: string (additive, non-breaking)"
  - "New vision_respond MediaGateResult variant carries { descripcion, categoria } — media-gate has NO send"
  - "handleAudio body byte-identical (Regla 6) — handleAudioV4 is a sibling function, not a replacement"
  - "vision_respond and passthrough both route to process-message step (engine produces the answer in Plan 04)"
  - "persist-transcription step: non-blocking try/catch, logs on failure, does NOT block pipeline"
  - "visionContext stub in ProcessMessageInput declared here so tsc enforces the Plan 04 interface contract"
  - "imageMediaType uses AI SDK ImagePart.mediaType field (not mimeType — tsc enforced)"
metrics:
  duration: "~35 minutes"
  completed: "2026-06-01T17:09:45Z"
  tasks_completed: 3
  files_changed: 8
  commits: 5
---

# Phase v4-media-audio-image Plan 03: Media Gate v4 Branches + Image Classifier Summary

v4-only audio/image branches in the media gate: Gemini Vision single-call classifier,
`vision_respond` MediaGateResult variant + agent-production dispatch, persist-transcription step.

## What Was Built

### `classifyImage` — Gemini Vision Single-Call Classifier

**File:** `src/lib/agents/media/image-classifier.ts`

**Signature:**
```ts
export async function classifyImage(
  imageUrl: string,
  mimeType: string,
  caption?: string,
): Promise<ImageClassification>
```

**Return type:**
```ts
export interface ImageClassification {
  categoria: ImageCategoria  // 'producto' | 'pagina' | 'comprobante_pago' | 'documento_identidad' | 'captura_conversacion' | 'ambiguo'
  descripcion: string        // 1-2 sentence description of what is visible
  decision: 'responder' | 'handoff'  // computed IN CODE from categoria (Pitfall 4)
}
```

**Implementation:**
- Fetches image as base64 (pattern from `extract-guide-data.ts`)
- Calls `generateText({ model: google('gemini-2.5-flash'), ... })` with `Output.object({ schema: ClassificationSchema })`
- Schema has ONLY `categoria` + `descripcion` — NO `decision` field (Pitfall 4 enforced)
- `decision` computed: `categoria === 'producto' || categoria === 'pagina' ? 'responder' : 'handoff'`
- `safetySettings BLOCK_NONE` for all 4 harm categories (Pitfall 6, verbatim from `generation-call.ts:69-78`)
- D-07 fail-safe: any error → `{ categoria:'ambiguo', descripcion:'', decision:'handoff' }`, no throw

**D-06 taxonomy:**
- `producto` / `pagina` → `decision='responder'` (engine produces grounded RAG answer, Plan 04)
- `comprobante_pago` / `documento_identidad` / `captura_conversacion` / `ambiguo` → `decision='handoff'`

### `MediaGateResult` Extended Union (types.ts)

```ts
export type MediaGateResult =
  | { action: 'passthrough'; text: string; transcription?: string }  // transcription only on v4 audio
  | { action: 'handoff'; reason: string }
  | { action: 'notify_host'; reason: string }
  | { action: 'ignore' }
  | { action: 'vision_respond'; descripcion: string; categoria: string }  // NEW — v4 image responder
```

**`vision_respond`:** carries the Gemini Vision classification context forward into the engine. The media-gate has NO send primitive — the engine (Plan 04) produces the grounded RAG answer and delivers it via the `rag:` send path with full no-rep + interruption + turn-ledger machinery.

### `MediaGateInput` Extended (types.ts)

```ts
resolvedAgentId: string  // gates v4-only branches (D-01 / Regla 6)
```

Passed at `agent-production.ts:204` as `resolvedAgentId: agentId` (already resolved before the gate).

### Gate Branch Shape (media-gate.ts)

```ts
case 'audio':
  return input.resolvedAgentId === SOMNIO_V4_AGENT_ID
    ? handleAudioV4(input)    // carry transcription for persist step
    : handleAudio(input)       // NON-V4 byte-identical (Regla 6)

case 'image':
  return input.resolvedAgentId === SOMNIO_V4_AGENT_ID
    ? handleImageV4(input)    // Gemini Vision → vision_respond or informed handoff
    : { action: 'handoff', reason: 'Cliente envio una imagen' }  // BYTE-IDENTICAL
```

**handleAudio body:** unchanged (Regla 6). **handleAudioV4:** same logic but success path returns `{ action: 'passthrough', text, transcription: text }`.

**handleImageV4:** `classifyImage(url, mimeType, caption)` → `decision='handoff'` → informed handoff with descripcion; `decision='responder'` → `{ action: 'vision_respond', descripcion, categoria }`.

### `vision_respond` Agent-Production Dispatch

**File:** `src/inngest/functions/agent-production.ts`

`vision_respond` routes into the engine exactly like `passthrough` — both flow to the `process-message` Inngest step. No send here. The dispatch:

```ts
// Both 'passthrough' and 'vision_respond' proceed to process-message
const engineMessageContent =
  gateResult.action === 'passthrough' ? gateResult.text : event.data.messageContent ?? ''
const visionContext =
  gateResult.action === 'vision_respond'
    ? { descripcion: gateResult.descripcion, categoria: gateResult.categoria }
    : undefined
// ... processMessageWithAgent({ ..., visionContext })
```

**No generation, no send in the media layer.** The engine (Plan 04) uses `visionContext` to run `kb_search(descripcion)` + `buildGenerationPrompt` + `runGenerationCall` and applies `RESPONSE_CONFIDENCE_THRESHOLD`.

### `persist-transcription` Inngest Step

**Location:** `src/inngest/functions/agent-production.ts` — inside the `run` function, BEFORE the `process-message` step, gated on `gateResult.action === 'passthrough' && gateResult.transcription`.

```ts
await step.run('persist-transcription', async () => {
  const { setMessageTranscription } = await import('@/lib/domain/messages')
  await setMessageTranscription(
    { workspaceId, source: 'inngest', cascadeDepth: 0 },
    { wamid: event.data.messageId, transcription: gateResult.transcription as string }
  )
})
```

Best-effort: failures are caught and logged inside the step — they do NOT block message delivery. Regla 3 compliant (UPDATE by wamid via `createAdminClient()` in domain layer).

### `ProcessMessageInput.visionContext` Stub

**File:** `src/lib/agents/production/webhook-processor.ts`

```ts
visionContext?: { descripcion: string; categoria: string }
```

Declared here (Plan 03) so TypeScript enforces the contract at the call site in `agent-production.ts`. **Consumed in Plan 04** which wires it through `EngineInput → V4AgentInput → the engine vision branch`.

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | `28f04758` | feat (Task 1) | Thread resolvedAgentId + extend MediaGateResult |
| 2 | `d0ffd8dc` | test (RED) | Failing tests for image-classifier (4 cases) |
| 3 | `c39270c8` | feat (GREEN) | image-classifier.ts + index.ts exports |
| 4 | `4309653e` | test (RED) | Failing tests for media-gate v4 branches (5 cases) |
| 5 | `d9bc6a92` | feat (GREEN) | v4-gated branches + persist step + vision_respond dispatch |

## TDD Gate Compliance

- RED gate commit (test): `d0ffd8dc` (image-classifier) + `4309653e` (media-gate-v4)
- GREEN gate commit (feat): `c39270c8` (image-classifier) + `d9bc6a92` (media-gate-v4)
- REFACTOR: none needed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] AI SDK ImagePart uses `mediaType` not `mimeType`**
- **Found during:** Task 2 tsc check
- **Issue:** `{ type: 'image', image: base64, mimeType: ... }` → TS error `property 'mimeType' does not exist on type 'ImagePart'`
- **Fix:** Changed to `mediaType` (correct field name per `@ai-sdk/provider-utils` types)
- **Files modified:** `src/lib/agents/media/image-classifier.ts`
- **Commit:** `c39270c8`

**2. [Rule 1 - Bug] Tests needed `fetch` global mock (fetchAsBase64 makes real HTTP)**
- **Found during:** Task 2 RED → GREEN transition (tests got 404 from `https://example.com/...`)
- **Issue:** image-classifier.ts calls `fetchAsBase64(imageUrl)` before calling generateText; unit tests need to mock `fetch` to avoid real HTTP calls
- **Fix:** Added `vi.stubGlobal('fetch', mockFetch)` + `makeFetchOk()` helper + `beforeEach` setup in test
- **Files modified:** `src/lib/agents/media/__tests__/image-classifier.test.ts`
- **Commit:** `c39270c8`

**3. [Rule 1 - Fix] Task 1 interim cast for tsc cleanliness**
- **Found during:** Task 1 — after adding `vision_respond` to MediaGateResult union, existing passthrough block `.text` accesses couldn't narrow the union (TypeScript can't narrow by elimination for complex union types)
- **Fix:** Added `const passthroughResult = gateResult as Extract<typeof gateResult, { action: 'passthrough' }>` as interim ref; Task 3 rewrote the entire block with proper `engineMessageContent` + `visionContext` computation
- **Files modified:** `src/inngest/functions/agent-production.ts`
- **Commit:** `28f04758` (Task 1), cleaned up in `d9bc6a92` (Task 3)

## Known Stubs

- `ProcessMessageInput.visionContext` is declared in webhook-processor.ts but is NOT consumed by the engine yet — Plan 04 wires it through `EngineInput → V4AgentInput → engine vision branch`. The stub is intentional: declaring first + consuming in Plan 04 is the interface-first ordering required by the plan.
- `vision_respond` dispatch in agent-production.ts threads `visionContext` into `processMessageWithAgent` but the engine currently ignores it — Plan 04 adds the engine branch. If v4 receives an image before Plan 04 is deployed, it will get the `visionContext` passed but the engine won't use it (safe — falls through to normal comprehension).

## Threat Flags

None. No new network endpoints. The `classifyImage` function calls Gemini Vision API (existing `@ai-sdk/google` provider, same key as comprehension/generation). No new trust boundary.

## Self-Check: PASSED

- `src/lib/agents/media/image-classifier.ts` FOUND, exports `classifyImage`, `ImageCategoria`, `ImageClassification`
- `src/lib/agents/media/types.ts` FOUND, contains `resolvedAgentId` + `vision_respond` + `transcription?`
- `src/lib/agents/media/media-gate.ts` FOUND, contains `SOMNIO_V4_AGENT_ID` + `handleAudioV4` + `handleImageV4`
- `src/lib/agents/media/__tests__/image-classifier.test.ts` FOUND, 4 tests pass
- `src/lib/agents/media/__tests__/media-gate-v4.test.ts` FOUND, 5 tests pass
- `src/inngest/functions/agent-production.ts` FOUND, contains `persist-transcription` + `vision_respond` dispatch + `visionContext`
- `src/lib/agents/production/webhook-processor.ts` FOUND, contains `visionContext?` stub
- Commits `28f04758`, `d0ffd8dc`, `c39270c8`, `4309653e`, `d9bc6a92` verified in git log
- `npx tsc --noEmit` clean (excluding 2 pre-existing errors)
- `npx vitest run` 9/9 tests passed across both test files

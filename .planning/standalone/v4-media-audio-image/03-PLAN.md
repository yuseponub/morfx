---
phase: v4-media-audio-image
plan: 03
type: execute
wave: 2
depends_on: [02]
baseline_sha: "85092058e4495fc0e97ff0be2c6da582ca06c563"
files_modified:
  - src/lib/agents/media/types.ts
  - src/lib/agents/media/media-gate.ts
  - src/lib/agents/media/image-classifier.ts   # NEW
  - src/lib/agents/media/index.ts
  - src/inngest/functions/agent-production.ts
  - src/lib/agents/production/webhook-processor.ts   # ProcessMessageInput.visionContext stub (consumed in Plan 04)
autonomous: true
requirements:
  - D-01   # Scope: SOLO v4 (gating por agente)
  - D-02   # Imagen: visión clasifica y bifurca
  - D-04   # Persistencia: solo transcript de audio (persist step)
  - D-06   # Taxonomía: responde producto+página, handoff el resto
  - D-07   # Fail-safe: cualquier fallo → handoff
  - D-08   # Modelo de visión = Gemini 2.5 Flash (RQ-2)
must_haves:
  truths:
    - "resolvedAgentId is threaded into MediaGateInput and passed at agent-production.ts:204"
    - "image/audio branch ONLY when resolvedAgentId === SOMNIO_V4_AGENT_ID; all other agents byte-identical (Regla 6)"
    - "current handleAudio() and the image immediate-handoff path are unchanged for non-v4 agents"
    - "image-classifier returns {categoria, descripcion, decision} where decision is computed IN CODE from categoria (Pitfall 4 — never by the LLM)"
    - "vision classifier uses gemini-2.5-flash with safetySettings BLOCK_NONE x4 (Pitfall 6); any failure → handoff (D-07)"
    - "audio transcript is persisted via setMessageTranscription in a v4-gated step.run('persist-transcription')"
    - "image classified as producto/pagina returns the NEW action 'vision_respond' carrying {descripcion, categoria} — the media-gate NEVER generates or sends the answer (Plan 04 produces it INSIDE the engine)"
  artifacts:
    - path: "src/lib/agents/media/image-classifier.ts"
      provides: "Gemini Vision single-call classifier (categoria+descripcion) + code-derived decision"
      contains: "gemini-2.5-flash"
      min_lines: 60
    - path: "src/lib/agents/media/media-gate.ts"
      provides: "v4-gated image/audio branches; non-v4 byte-identical; image responder → vision_respond"
      contains: "SOMNIO_V4_AGENT_ID"
    - path: "src/lib/agents/media/types.ts"
      provides: "resolvedAgentId on MediaGateInput + MediaGateResult vision_respond variant + passthrough.transcription"
      contains: "vision_respond"
  key_links:
    - from: "agent-production.ts:204"
      to: "processMediaGate"
      via: "resolvedAgentId: agentId"
      pattern: "resolvedAgentId: agentId"
    - from: "media-gate handleAudioV4"
      to: "setMessageTranscription (Wave 1)"
      via: "step.run('persist-transcription') in agent-production passthrough"
      pattern: "persist-transcription"
    - from: "handleImageV4 (decision==='responder')"
      to: "agent-production vision_respond branch"
      via: "return { action: 'vision_respond', descripcion, categoria }"
      pattern: "action: 'vision_respond'"
---

<objective>
Thread `resolvedAgentId` into the media gate and add the v4-only branches: audio (transcribe + carry
transcript for persistence) and image (Gemini Vision single-call classifier producing
`{categoria, descripcion, decision}`). All non-v4 agents fall to byte-identical existing behavior
(Regla 6). Persist the audio transcript via the Wave 1 domain function in a v4-gated Inngest step.

IMPORTANT ARCHITECTURE (revised after plan-check): the media-gate **classifies and decides ONLY**. It
does NOT generate or send any vision answer. When an image is `producto`/`pagina` (decision='responder'),
`handleImageV4` returns a NEW `MediaGateResult` variant `{ action: 'vision_respond', descripcion, categoria }`
that carries the vision context forward. `agent-production.ts` threads that context INTO the engine
(Plan 04), where the proven `rag:` send path produces + delivers the answer automatically. The
media-gate layer has NO send primitive, so producing the answer here would have been architecturally
wrong (the engine owns no-repetition + interruption Path A/B + turn-ledger + `messaging.send`).

Purpose: D-01 gating + D-02/D-06/D-08 image classification + D-04 audio persistence + D-07 fail-safe.
This wave classifies images and, for `decision==='handoff'`, returns an informed handoff with the
description; for `decision==='responder'` it returns `vision_respond` (handled by the engine in Wave 3).
Output: gating threading, `handleAudioV4`, `handleImageV4` (classify + emit vision_respond) +
`image-classifier.ts`, the `vision_respond` agent-production branch that threads visionContext into the
engine, and the `persist-transcription` step.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-media-audio-image/RESEARCH.md
@.planning/standalone/v4-media-audio-image/02-SUMMARY.md

<interfaces>
<!-- Extracted from codebase — use directly. -->

src/lib/agents/media/types.ts — current MediaGateInput / MediaGateResult:
```ts
export interface MediaGateInput {
  messageType: string
  messageContent: string
  mediaUrl: string | null
  mediaMimeType: string | null
  workspaceId: string
  conversationId: string
  phone: string
}
export type MediaGateResult =
  | { action: 'passthrough'; text: string }
  | { action: 'handoff'; reason: string }
  | { action: 'notify_host'; reason: string }
  | { action: 'ignore' }
```

src/lib/agents/media/media-gate.ts — current switch (media-gate.ts:38-59), KEEP non-v4 paths byte-identical:
```ts
case 'audio':  return handleAudio(input)                                   // line 43
case 'image':  return { action: 'handoff', reason: 'Cliente envio una imagen' }  // line 46
```
handleAudio (media-gate.ts:69-100) stays INTACT — non-v4 audio still calls it.

src/lib/agents/media/audio-transcriber.ts: `export async function transcribeAudioFromUrl(url, mime): Promise<{success:true,text}|{success:false,error}>`.

src/lib/agents/somnio-v4/config.ts:9: `export const SOMNIO_V4_AGENT_ID = 'somnio-sales-v4' as const`.

agent-production.ts:150-151 — agentId already resolved BEFORE the gate:
```ts
const agentId: AgentId = agentIdFromWebhook ?? (await resolveAgentIdForWorkspace(workspaceId))
```
Call site at :202-213 (`processMediaGate({...})`). Action dispatch branches:
ignore :240, notify_host :253, handoff :294, passthrough → `process-message` step :358-364
(`processMessageWithAgent({...})` via webhook-processor). event.data has: messageType,
messageContent, mediaUrl, mediaMimeType, messageId (= wamid), workspaceId, conversationId, phone.

processMessageWithAgent input (src/lib/agents/production/webhook-processor.ts:46+) — the v4 branch
(:892-912) builds `runner.processMessage(EngineInput)`. visionContext will be threaded:
agent-production → ProcessMessageInput → EngineInput → V4AgentInput (Plan 04 wires the V4 fields;
THIS plan only adds the `visionContext` arg to the `processMessageWithAgent({...})` call and proves
it typechecks once Plan 04 adds the field — see Task 3 note).

Vision code pattern (canonical, ADAPT to AI SDK Gemini): src/lib/ocr/extract-guide-data.ts:35-142
(fetchAsBase64 → content block → parse JSON via /\{[\s\S]*\}/ → EMPTY_RESULT fail-safe).

AI SDK Gemini + Output.object + safetySettings (REUSE verbatim, Pitfall 6) — src/lib/agents/somnio-v4/sub-loop/generation-call.ts:55-79:
```ts
import { generateText, Output } from 'ai'
import { google } from '@ai-sdk/google'
// providerOptions.google.safetySettings = [HARASSMENT, HATE_SPEECH, SEXUALLY_EXPLICIT, DANGEROUS_CONTENT] each BLOCK_NONE
```
</interfaces>

<facts>
- RQ-3 (HIGH): gate v4-only by passing resolvedAgentId into processMediaGate and branching inside the switch. agent-production.ts changes = ONE added param to the gate + a new `vision_respond` dispatch branch. All concentration of media logic stays in media/.
- D-06 taxonomy: producto / pagina → decision='responder'; comprobante_pago / documento_identidad / captura_conversacion / ambiguo → decision='handoff'.
- Pitfall 4: `decision` computed in CODE from `categoria`. The LLM returns ONLY categoria + descripcion.
- Pitfall 6: reuse BLOCK_NONE x4 in the vision call.
- D-07: any vision failure / unparseable JSON / no mediaUrl → handoff with a reason that includes the (best-effort) description if available, else generic.
- RQ-6/Pitfall 2: transcript persistence is an UPDATE by wamid (= event.data.messageId), done in the Inngest function, not inside the pure gate.
- DELIVERY MODEL (revised): the media-gate decides; the ENGINE produces + sends the vision answer. `vision_respond` must route the turn INTO the engine (like `passthrough` proceeds into the engine), carrying `visionContext`. It is NOT ignore/notify/handoff.
</facts>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Thread resolvedAgentId into the gate + extend MediaGateResult (vision_respond + passthrough.transcription)</name>
  <files>src/lib/agents/media/types.ts, src/inngest/functions/agent-production.ts</files>
  <read_first>
    - `src/lib/agents/media/types.ts` (full — extend MediaGateInput + MediaGateResult).
    - `src/inngest/functions/agent-production.ts:150-151` (agentId) and `:202-213` (call site).
  </read_first>
  <action>
    (a) In `media/types.ts`: add `resolvedAgentId: string` to `MediaGateInput`. Extend the
    `MediaGateResult` union additively:
    - extend the passthrough variant for audio v4 so the function can persist the transcript without
      changing the gate's purity: `| { action: 'passthrough'; text: string; transcription?: string }`
      (transcription only set on the v4 audio path; everything else omits it — additive, non-breaking).
    - add a NEW variant for the v4 image-respond path:
      `| { action: 'vision_respond'; descripcion: string; categoria: string }`.
      This carries the vision context forward; the media-gate does NOT generate or send anything.

    (b) In `agent-production.ts` at the call site (~:204): add `resolvedAgentId: agentId,` to the
    `processMediaGate({...})` object. This is the ONLY change to agent-production.ts in this task
    (the `vision_respond` dispatch branch is added in Task 3 alongside the persist step).
  </action>
  <acceptance_criteria>
    - `grep -c "resolvedAgentId" src/lib/agents/media/types.ts` >= 1.
    - `grep -c "vision_respond" src/lib/agents/media/types.ts` returns 1 (new MediaGateResult variant).
    - `grep -c "resolvedAgentId: agentId" src/inngest/functions/agent-production.ts` returns 1.
    - MediaGateResult passthrough variant has optional `transcription` (additive — existing `{action:'passthrough', text}` returns still typecheck).
    - `npx tsc --noEmit` clean.
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Image classifier (Gemini Vision single-call) — image-classifier.ts</name>
  <files>src/lib/agents/media/image-classifier.ts, src/lib/agents/media/__tests__/image-classifier.test.ts, src/lib/agents/media/index.ts</files>
  <read_first>
    - `src/lib/ocr/extract-guide-data.ts:35-142` (base64 fetch + JSON parse + EMPTY_RESULT fail-safe pattern to adapt).
    - `src/lib/agents/somnio-v4/sub-loop/generation-call.ts:55-79` (AI SDK google() + Output.object + safetySettings BLOCK_NONE x4 — copy the providerOptions block verbatim, Pitfall 6).
  </read_first>
  <behavior>
    - classifyImage(imageUrl, mimeType, caption?) returns { categoria, descripcion, decision }.
    - categoria ∈ {producto, pagina, comprobante_pago, documento_identidad, captura_conversacion, ambiguo}.
    - decision computed IN CODE: producto|pagina → 'responder'; else → 'handoff' (Pitfall 4 — LLM never returns decision).
    - On fetch failure / model error / unparseable output → returns { categoria:'ambiguo', descripcion:'', decision:'handoff' } (D-07 fail-safe), no throw.
    - The Gemini call uses gemini-2.5-flash with BLOCK_NONE x4 safety settings (Pitfall 6).
  </behavior>
  <action>
    Create `src/lib/agents/media/image-classifier.ts`:
    - Export `type ImageCategoria = 'producto' | 'pagina' | 'comprobante_pago' | 'documento_identidad' | 'captura_conversacion' | 'ambiguo'`.
    - Export `interface ImageClassification { categoria: ImageCategoria; descripcion: string; decision: 'responder' | 'handoff' }`.
    - Export `async function classifyImage(imageUrl: string, mimeType: string, caption?: string): Promise<ImageClassification>`.
    - Implementation: use AI SDK `generateText({ model: google('gemini-2.5-flash'), messages:[{role:'user', content:[{type:'image', image: <base64 or fetched URL>}, {type:'text', text: PROMPT}]}], output: Output.object({ schema }), providerOptions: <BLOCK_NONE x4 from generation-call.ts> })`.
      - Schema (zod via Output.object): `{ categoria: enum(...6...), descripcion: string }` — NOTE: NO `decision` in the schema (Pitfall 4).
      - PROMPT (Spanish): instruct the model to classify a customer-sent image into one of the 6 categorias and write a 1-2 sentence `descripcion` of what is visible. Examples: foto del frasco/producto → producto; screenshot de la web/landing → pagina; recibo/transferencia/Nequi/Bancolombia → comprobante_pago; cédula/documento → documento_identidad; screenshot de otro chat → captura_conversacion; cualquier otra cosa/no claro → ambiguo. "NUNCA confirmes pagos. Solo describe lo que ves."
      - Prefer the base64 approach (extract-guide-data.ts fetchAsBase64) for reliability; if simpler, the AI SDK image part also accepts a URL — pick base64 to match prior art.
    - Compute `decision` in code: `const decision = (categoria === 'producto' || categoria === 'pagina') ? 'responder' : 'handoff'`.
    - Wrap the whole thing in try/catch → on any error return `{ categoria:'ambiguo', descripcion:'', decision:'handoff' }` and `console.warn('[image-classifier] ...')`.
    - Add `export { classifyImage } from './image-classifier'` + the types to `media/index.ts`.

    Unit test `media/__tests__/image-classifier.test.ts` (mock `ai`'s generateText / google):
    - mock returns categoria='producto' → decision='responder'.
    - mock returns categoria='comprobante_pago' → decision='handoff'.
    - mock returns categoria='documento_identidad' → decision='handoff'.
    - generateText throws → returns the fail-safe ambiguo/handoff object (D-07).
    Assert decision is derived from categoria in ALL cases (never read from the model output).
  </action>
  <acceptance_criteria>
    - `grep -c "gemini-2.5-flash" src/lib/agents/media/image-classifier.ts` >= 1.
    - `grep -c "BLOCK_NONE" src/lib/agents/media/image-classifier.ts` == 4 (Pitfall 6).
    - The Output.object schema does NOT contain a `decision` field (Pitfall 4): `grep -A8 "Output.object" src/lib/agents/media/image-classifier.ts` shows only categoria + descripcion.
    - `decision` assignment derives from `categoria` in code (grep shows `categoria === 'producto'`).
    - `npx vitest run src/lib/agents/media/__tests__/image-classifier.test.ts` passes (4 cases incl. fail-safe).
    - `npx tsc --noEmit` clean.
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 3: v4-gated branches (handleAudioV4 + handleImageV4 emit vision_respond) + persist step + vision_respond dispatch</name>
  <files>src/lib/agents/media/media-gate.ts, src/lib/agents/media/__tests__/media-gate-v4.test.ts, src/inngest/functions/agent-production.ts</files>
  <read_first>
    - `src/lib/agents/media/media-gate.ts` (full — KEEP handleAudio + image immediate-handoff intact; add gated branches).
    - `src/inngest/functions/agent-production.ts:240-364` (ignore/notify/handoff/passthrough dispatch + the `process-message` step at :358-364).
    - `02-SUMMARY.md` (setMessageTranscription signature).
  </read_first>
  <behavior>
    - For non-v4 agents: `case 'audio'` → handleAudio (unchanged); `case 'image'` → `{action:'handoff', reason:'Cliente envio una imagen'}` (byte-identical).
    - For SOMNIO_V4_AGENT_ID: `case 'audio'` → handleAudioV4 (transcribe via transcribeAudioFromUrl; on success returns `{action:'passthrough', text, transcription:text}`; on failure → handoff, identical fail-safe to handleAudio per D-07); `case 'image'` → handleImageV4 (calls classifyImage; if decision==='handoff' → informed handoff with descripcion per D-02/D-06; if decision==='responder' → `{action:'vision_respond', descripcion, categoria}` — the media-gate does NOT generate/send; the engine produces the answer in Plan 04).
    - In agent-production.ts:
      (a) when the gate returns passthrough WITH `transcription` set, run `step.run('persist-transcription')` → setMessageTranscription({workspaceId},{wamid: event.data.messageId, transcription}). Gate the step by presence of `gateResult.transcription`.
      (b) when the gate returns `action === 'vision_respond'`, route the turn INTO the engine exactly like `passthrough` does (the SAME `process-message` step / `processMessageWithAgent` call), but thread the vision context via a new `visionContext: { descripcion, categoria }` arg on the `processMessageWithAgent({...})` call. Do NOT add any send here — the engine emits a `rag:` template and the runner sends it (Plan 04). `vision_respond` is NOT ignore/notify/handoff.
  </behavior>
  <action>
    (a) media-gate.ts:
    - Import `SOMNIO_V4_AGENT_ID` from `@/lib/agents/somnio-v4/config` and `classifyImage` from `./image-classifier`.
    - Change `case 'audio'`:
      ```ts
      case 'audio':
        return input.resolvedAgentId === SOMNIO_V4_AGENT_ID ? handleAudioV4(input) : handleAudio(input)
      ```
    - Change `case 'image'`:
      ```ts
      case 'image':
        return input.resolvedAgentId === SOMNIO_V4_AGENT_ID
          ? handleImageV4(input)
          : { action: 'handoff', reason: 'Cliente envio una imagen' }   // BYTE-IDENTICAL to baseline
      ```
    - Add `handleAudioV4(input)`: same body as handleAudio BUT on `result.success` return
      `{ action: 'passthrough', text: result.text, transcription: result.text }`. On failure → identical handoff (D-07).
    - Add `handleImageV4(input)`:
      ```ts
      async function handleImageV4(input: MediaGateInput): Promise<MediaGateResult> {
        if (!input.mediaUrl) return { action: 'handoff', reason: 'Cliente envió una imagen (sin URL)' }
        const cls = await classifyImage(input.mediaUrl, input.mediaMimeType ?? 'image/jpeg', input.messageContent)
        if (cls.decision === 'handoff') {
          return { action: 'handoff', reason: `Cliente envió una imagen: ${cls.descripcion || 'no se pudo describir'}` }  // informed handoff (D-02/D-06)
        }
        // decision === 'responder' — carry the vision context into the ENGINE (Plan 04).
        // The media-gate has NO send primitive; the engine emits a rag: template that the
        // production runner delivers with no-rep + interruption + ledger machinery.
        return { action: 'vision_respond', descripcion: cls.descripcion, categoria: cls.categoria }
      }
      ```
      NOTE: there is NO half-built/placeholder state anymore. `responder` returns `vision_respond`
      immediately; Plan 04 adds the engine branch + threading that turns it into a sent answer
      (and falls back to informed handoff below confidence threshold, inside the engine).

    (b) agent-production.ts — persist-transcription step (in the passthrough branch, before/right after
    `process-message`, keyed on the transcription being present):
      ```ts
      if (gateResult.action === 'passthrough' && 'transcription' in gateResult && gateResult.transcription) {
        await step.run('persist-transcription', async () => {
          const { setMessageTranscription } = await import('@/lib/domain/messages')
          await setMessageTranscription(
            { workspaceId },
            { wamid: event.data.messageId, transcription: gateResult.transcription as string }
          )
        })
      }
      ```
      Best-effort persist; log on failure inside the step. Do NOT block the pipeline on its result.

    (c) agent-production.ts — `vision_respond` dispatch branch. Add it ALONGSIDE the existing dispatch
    branches (after handoff at :294, and treat it like passthrough: it proceeds INTO the engine). The
    cleanest implementation is to fold it into the existing passthrough path so the SAME
    `process-message` step runs, passing the vision context. Concretely:
      - Compute the engine message text. For vision_respond, the user did not send text; pass the client
        caption if any (`event.data.messageContent`) else an empty string — the engine's vision branch
        uses `visionContext.descripcion` as the KB query, not the message text.
      - When dispatching to `processMessageWithAgent({...})` (the call inside the `process-message`
        step at :401-421), add:
        ```ts
        visionContext: gateResult.action === 'vision_respond'
          ? { descripcion: gateResult.descripcion, categoria: gateResult.categoria }
          : undefined,
        ```
        and ensure the step runs for BOTH `passthrough` and `vision_respond` (extend the guard that
        currently gates on `passthrough` to also admit `vision_respond`). The `messageContent` passed
        to `processMessageWithAgent` for vision_respond = `event.data.messageContent ?? ''` (caption).
      - Emit `collector?.recordEvent('media_gate', 'vision_respond', { categoria: gateResult.categoria })`.
      NOTE: `processMessageWithAgent` does not yet declare the `visionContext` param — Plan 04 Task adds
      it to ProcessMessageInput → EngineInput → V4AgentInput. To keep THIS plan typecheck-clean, add the
      OPTIONAL `visionContext?: { descripcion: string; categoria: string }` field to ProcessMessageInput
      (webhook-processor.ts) HERE as a passthrough-only stub (declared + accepted, not yet consumed) and
      note that Plan 04 wires it through EngineInput → V4AgentInput → the engine branch. (Declaring the
      field here, consuming it in Plan 04, is the interface-first ordering.)

    (d) media-gate-v4.test.ts (Regla 6 behavioral + v4 behavior):
    - resolvedAgentId='somnio-sales-v3' + messageType='image' → `{action:'handoff', reason:'Cliente envio una imagen'}` (BYTE-IDENTICAL — Regla 6 proof).
    - resolvedAgentId='somnio-sales-v3' + messageType='audio' → calls handleAudio path (mock transcribeAudioFromUrl) → passthrough WITHOUT a transcription field.
    - resolvedAgentId='somnio-sales-v4' + messageType='audio' success → passthrough WITH transcription === text.
    - resolvedAgentId='somnio-sales-v4' + messageType='image', classifyImage mocked decision='handoff' → informed handoff reason contains descripcion.
    - resolvedAgentId='somnio-sales-v4' + messageType='image', classifyImage mocked decision='responder' → `{action:'vision_respond', descripcion, categoria}` (NOT handoff, NOT passthrough).
  </action>
  <acceptance_criteria>
    - `grep -c "SOMNIO_V4_AGENT_ID\|somnio-sales-v4" src/lib/agents/media/media-gate.ts` >= 2 (Pitfall 1 / image + audio).
    - `grep -c "vision_respond" src/lib/agents/media/media-gate.ts` returns 1 (the responder branch emits it).
    - Non-v4 image returns the EXACT baseline string `'Cliente envio una imagen'` (behavioral test passes).
    - `git diff 85092058 -- src/lib/agents/media/media-gate.ts` shows the original handleAudio + the original image-handoff string still present unchanged in the non-v4 branch (no edits to handleAudio body).
    - `grep -c "persist-transcription" src/inngest/functions/agent-production.ts` returns 1.
    - `grep -c "vision_respond" src/inngest/functions/agent-production.ts` >= 1 (dispatch branch threads visionContext into the engine; no send added here).
    - `grep -c "visionContext" src/inngest/functions/agent-production.ts` >= 1.
    - `npx vitest run src/lib/agents/media/__tests__/media-gate-v4.test.ts` passes (5 cases including the Regla 6 byte-identical image case + the vision_respond case).
    - `npx tsc --noEmit` clean.
  </acceptance_criteria>
</task>

</tasks>

<verification>
- All image/audio behavior changes gated by `resolvedAgentId === SOMNIO_V4_AGENT_ID`.
- handleAudio + image immediate-handoff string byte-identical for non-v4 (Regla 6 behavioral test green).
- Classifier: decision computed in code (Pitfall 4); BLOCK_NONE x4 (Pitfall 6); fail-safe handoff (D-07).
- Audio transcript persisted via Wave 1 domain fn in a v4-gated step (Regla 3, UPDATE by wamid).
- Image `responder` case returns `vision_respond` carrying {descripcion, categoria}; the media-gate
  NEVER generates or sends — `agent-production` threads visionContext INTO the engine (Plan 04 produces
  + delivers the answer via the `rag:` send path).
- Per-commit `npx tsc --noEmit` clean.
</verification>

<success_criteria>
- v4 audio transcribes + persists; non-v4 unchanged.
- v4 image classifies; sensitive/ambiguous → informed handoff; producto/pagina → `vision_respond` routed
  into the engine (the engine emits the answer in Plan 04).
</success_criteria>

<output>
After completion, create `.planning/standalone/v4-media-audio-image/03-SUMMARY.md` documenting:
classifyImage signature + categorias, the gate branch shape, the `vision_respond` MediaGateResult variant
+ its agent-production dispatch (threads visionContext into the engine, no send), the
ProcessMessageInput.visionContext stub field (consumed in Plan 04), and the persist-transcription step
location. Plan 04 consumes all of this.
</output>

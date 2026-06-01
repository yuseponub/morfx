---
phase: v4-media-audio-image
plan: 05
type: execute
wave: 4
depends_on: [02]   # needs Message.transcription typed; independent of Waves 3 (image)
baseline_sha: "85092058e4495fc0e97ff0be2c6da582ca06c563"
files_modified:
  - src/app/(dashboard)/whatsapp/components/media-preview.tsx
  - src/app/(dashboard)/whatsapp/components/message-bubble.tsx
autonomous: false   # final checkpoint: human visual verify of transcript render (deferred to v4 activation for live audio)
requirements:
  - D-04   # Persistencia + mostrar transcript bajo el player
  - D-09   # transcription column
must_haves:
  truths:
    - "When a message is type audio AND has a non-null transcription, the transcript renders under the <audio> player in the inbox"
    - "Render is additive — image/video/document/sticker/text rendering is unchanged"
    - "Realtime UPDATE on the messages table propagates the transcript without a page refresh (confirmed: use-messages.ts already subscribes to UPDATE)"
  artifacts:
    - path: "src/app/(dashboard)/whatsapp/components/media-preview.tsx"
      provides: "transcription prop + render block under <audio>"
      contains: "transcription"
    - path: "src/app/(dashboard)/whatsapp/components/message-bubble.tsx"
      provides: "threads message.transcription to MediaPreview"
      contains: "transcription={message.transcription}"
  key_links:
    - from: "message-bubble.tsx MessageContent (audio case)"
      to: "MediaPreview transcription prop"
      via: "transcription={message.transcription}"
      pattern: "transcription=\\{message.transcription\\}"
    - from: "use-messages.ts realtime UPDATE handler"
      to: "messages state"
      via: "postgres_changes event UPDATE on messages (already present)"
      pattern: "event: 'UPDATE'"
---

<objective>
Render the persisted audio transcript under the inbox audio player, additively, and confirm the
realtime UPDATE path surfaces it without a refresh.

Purpose: D-04 — the operator needs to read what the client said in an audio (debug/audit).
Output: a `transcription` prop on `MediaPreview` rendered under `<audio>`, threaded from
`message.transcription` in `message-bubble.tsx`, plus a validation that realtime UPDATE works (RQ-5/A1).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-media-audio-image/RESEARCH.md

<interfaces>
<!-- Extracted from codebase — use directly. -->

MediaPreviewProps (src/app/(dashboard)/whatsapp/components/media-preview.tsx:9-15):
```ts
interface MediaPreviewProps {
  type: 'image' | 'video' | 'audio' | 'document' | 'sticker'
  url?: string | null
  filename?: string | null
  mimeType?: string | null
  caption?: string
}
```
Audio render block (media-preview.tsx:152-166): `<audio src={url} controls preload="metadata" className="w-48" ...>` inside `<div className="space-y-1">`.

MessageContent audio/image/... case (message-bubble.tsx:63-78) renders:
```tsx
<MediaPreview type={type} url={...} filename={...} mimeType={...} caption={mediaContent.caption} />
```
`message` (a Message) is in scope; Message.transcription was added in Wave 2 (Plan 02).

Realtime (CONFIRMED present — RQ-5/A1 resolved): src/hooks/use-messages.ts subscribes to BOTH
`event:'INSERT'` (line 186) AND `event:'UPDATE'` (line 220) on `table:'messages'`; the UPDATE handler
sets the full `payload.new as Message` into state (lines 225-228). So a transcription UPDATE propagates
automatically — Task 2 only VERIFIES this, no code change expected.
</interfaces>

<facts>
- RQ-5 (HIGH read path): the inbox fetch uses select('*'); Message.transcription (Wave 2) flows through.
- A1 (resolved during planning): use-messages.ts already handles UPDATE — the transcript appears without refresh once persisted.
- The transcript is written as an UPDATE AFTER the audio row exists, so the operator first sees the audio, then the transcript appears (realtime UPDATE).
</facts>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Render transcript under the audio player</name>
  <files>src/app/(dashboard)/whatsapp/components/media-preview.tsx, src/app/(dashboard)/whatsapp/components/message-bubble.tsx</files>
  <read_first>
    - `media-preview.tsx:9-15` (props) + `:151-167` (audio block).
    - `message-bubble.tsx:63-78` (MessageContent media case).
  </read_first>
  <action>
    (a) media-preview.tsx:
    - Add `transcription?: string | null` to `MediaPreviewProps`.
    - Destructure `transcription` in the component signature.
    - In the audio block (the `if (type === 'audio')` return, ~:152-166), add under the `<audio>`:
      ```tsx
      {transcription && (
        <p className="text-sm text-muted-foreground italic mt-1 whitespace-pre-wrap">{transcription}</p>
      )}
      ```
      Keep it inside the existing `<div className="space-y-1">`. Do NOT touch the image/video/document/
      sticker/fallback branches.

    (b) message-bubble.tsx:
    - In the `case 'image': case 'video': case 'audio': ...` MediaPreview call (:70-77), add
      `transcription={message.transcription}`. (It is only consumed by the audio branch; harmless for others.)
  </action>
  <acceptance_criteria>
    - `grep -c "transcription" src/app/(dashboard)/whatsapp/components/media-preview.tsx` >= 2 (prop + render).
    - The render block is inside the `type === 'audio'` branch only (grep context shows it under `<audio`).
    - `grep -c "transcription={message.transcription}" src/app/(dashboard)/whatsapp/components/message-bubble.tsx` returns 1.
    - Image/video/document/sticker/text rendering is unchanged (no diff to those branches).
    - `npx tsc --noEmit` clean.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Verify realtime UPDATE propagation (RQ-5 / A1)</name>
  <files>src/hooks/use-messages.ts</files>
  <read_first>
    - `src/hooks/use-messages.ts:183-230` (the postgres_changes INSERT + UPDATE subscriptions).
  </read_first>
  <action>
    VERIFY ONLY — no code change expected. Confirm:
    - There is an `event: 'UPDATE'` subscription on `table: 'messages'`.
    - Its handler replaces/merges the message in state from `payload.new as Message` (so the new
      `transcription` field is included).
    If — and only if — the UPDATE handler does NOT include the full updated row (e.g. it only patches
    `status` and drops other fields), make the minimal additive fix so the merged message carries
    `transcription`. Otherwise leave the file untouched and record in SUMMARY that A1 is confirmed.
  </action>
  <acceptance_criteria>
    - `grep -c "event: 'UPDATE'" src/hooks/use-messages.ts` >= 1 and the handler uses `payload.new as Message`.
    - SUMMARY records A1 confirmed (or the minimal fix if one was needed).
    - No change to non-message realtime behavior.
  </acceptance_criteria>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Transcript render under the inbox audio player + realtime UPDATE confirmed.
  </what-built>
  <how-to-verify>
    NOTE (D-19 parity with debounce): live audio→transcript smoke requires v4 active in a real
    WhatsApp workspace with 360dialog inbound media (D-11). If v4 is still DORMANT, defer the LIVE
    smoke to v4 activation and verify statically instead:

    Static verification (now):
    1. In the Supabase SQL editor, pick an existing audio message row and set a test transcript:
       `UPDATE messages SET transcription='prueba de transcripción' WHERE id='<an audio message id>';`
    2. Open that conversation in the inbox (/whatsapp). Confirm the italic transcript text appears
       under the audio player WITHOUT reloading the page (realtime UPDATE).
    3. Confirm other message types (image/text) render unchanged.
    4. Revert the test row: `UPDATE messages SET transcription=NULL WHERE id='<that id>';`

    Live smoke (defer to v4 activation): send a real WhatsApp audio to a v4 workspace → transcript
    appears under the player after a moment.
  </how-to-verify>
  <resume-signal>Type "transcript render OK" (static or live), or describe what rendered wrong.</resume-signal>
</task>

</tasks>

<verification>
- Transcript renders under `<audio>` only when present; all other media unchanged (additive).
- Realtime UPDATE on messages confirmed (use-messages.ts already subscribes; A1 resolved).
- Per-commit `npx tsc --noEmit` clean.
- Regla 6: UI is agent-agnostic (renders whatever transcription is present); only v4 writes it (Wave 3 gate) — no non-v4 behavior change.
</verification>

<success_criteria>
- The operator sees the audio transcript under the player, updating in realtime.
</success_criteria>

<output>
After completion, create `.planning/standalone/v4-media-audio-image/05-SUMMARY.md` noting the render
location, the A1 realtime confirmation, and whether the live smoke was deferred to v4 activation.
</output>

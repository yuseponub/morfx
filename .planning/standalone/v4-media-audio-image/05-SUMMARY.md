---
phase: v4-media-audio-image
plan: "05"
subsystem: inbox-ui
tags: [audio, transcription, realtime, media-preview, wave-4]
dependency_graph:
  requires: ["02"]   # Message.transcription typed (Wave 2)
  provides: ["transcript-render-under-audio-player"]
  affects: ["media-preview.tsx", "message-bubble.tsx"]
tech_stack:
  added: []
  patterns: ["conditional-render-in-audio-branch-only", "prop-threading-message-to-media-preview"]
key_files:
  modified:
    - src/app/(dashboard)/whatsapp/components/media-preview.tsx
    - src/app/(dashboard)/whatsapp/components/message-bubble.tsx
  created: []
decisions:
  - "Transcription renders only inside the audio branch (lines 152-172 of media-preview.tsx). Other branches (image/video/document/sticker) are byte-identical."
  - "transcription={message.transcription} threaded unconditionally — harmless for non-audio types because the prop is only consumed inside the audio branch."
  - "A1 confirmed: use-messages.ts UPDATE handler replaces full message with payload.new as Message — transcription propagates in realtime without page refresh."
  - "Live visual smoke deferred to v4 activation (v4 DORMANT, no live audio inbound in current prod)."
metrics:
  duration: "< 5 min"
  completed: "2026-06-01"
  tasks_completed: 2
  files_changed: 2
---

# Phase v4-media-audio-image Plan 05: Transcript Render Under Audio Player Summary

One-liner: audio transcript prop added to MediaPreview and rendered as italic muted text under the `<audio>` element, threaded from `message.transcription`; realtime UPDATE path confirmed without code change.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Render transcript under the audio player | 02a60098 | media-preview.tsx, message-bubble.tsx |
| 2 | Verify realtime UPDATE propagation (A1) | — (no code change needed) | use-messages.ts (read-only) |

## Render Location

`src/app/(dashboard)/whatsapp/components/media-preview.tsx` lines 167-169 (audio branch only):

```tsx
{transcription && (
  <p className="text-sm text-muted-foreground italic mt-1 whitespace-pre-wrap">{transcription}</p>
)}
```

Positioned inside `<div className="space-y-1">`, directly below `<audio>`. The image/video/document/sticker/fallback branches are **unchanged**.

## A1 Realtime Confirmation

`src/hooks/use-messages.ts` lines 218-234 already subscribes to `event: 'UPDATE'` on `table: 'messages'`.

The handler:
```ts
const updatedMessage = payload.new as Message
setMessages(prev =>
  prev.map(msg => msg.id === updatedMessage.id ? updatedMessage : msg)
)
```

Replaces the full message with `payload.new as Message`, which includes `transcription`. No code change was needed. **A1 is confirmed**: when the Wave 3 Gemini transcriber writes `transcription` via an UPDATE, the inbox displays the transcript under the player without a page refresh.

## Visual Smoke (Deferred)

v4 (`somnio-sales-v4`) is DORMANT in production — no workspace has `conversational_agent_id='somnio-sales-v4'`. Live audio inbound through 360dialog (D-11) is not active.

The live smoke is deferred to v4 activation. When the operator is ready:
1. `UPDATE messages SET transcription='prueba de transcripción' WHERE id='<an audio message id>';`
2. Open that conversation in `/whatsapp` — the italic text should appear under the player without reloading.
3. `UPDATE messages SET transcription=NULL WHERE id='<that id>';` to revert.

The static analysis confirms the wire is correct end-to-end.

## Acceptance Criteria

- `grep -c "transcription" media-preview.tsx` = 4 (interface prop, destructure, conditional, text body). PASS.
- Render block is inside `type === 'audio'` branch only. PASS.
- `grep -c "transcription={message.transcription}" message-bubble.tsx` = 1. PASS.
- `grep -c "event: 'UPDATE'" use-messages.ts` = 1, handler uses `payload.new as Message`. PASS.
- `npx tsc --noEmit` exit code 0 (excluding 2 pre-existing errors). PASS.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `02a60098` exists: confirmed.
- `media-preview.tsx` modified: confirmed (`transcription` in 4 places).
- `message-bubble.tsx` modified: confirmed (`transcription={message.transcription}` present).
- `use-messages.ts` untouched: confirmed (no diff).
- TSC clean: confirmed (exit code 0).

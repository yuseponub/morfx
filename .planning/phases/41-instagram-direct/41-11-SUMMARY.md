---
phase: 41-instagram-direct
plan: 11
subsystem: instagram-inbound
tags: [instagram, webhook, gap-closure, transcription, tdd]
gap_closure: true
requirements: [IG-01]
dependency_graph:
  requires:
    - "src/lib/instagram/webhook-handler.ts (processInstagramWebhook, shipped 41-05)"
    - "src/lib/agents/media/audio-transcriber.ts (transcribeAudioFromUrl, shipped v4-media 2026-06-01)"
    - "src/lib/domain/messages.ts (setMessageTranscription, shipped v4-media 2026-06-01)"
    - "supabase/migrations/20260601000000_messages_transcription.sql (messages.transcription column — already in prod)"
  provides:
    - "labelInstagramEvent (pure helper) — non-empty body for non-standard IG inbound types"
    - "never-empty-body fallback in processInstagramWebhook"
    - "inline best-effort IG inbound audio transcription persisted by wamid"
  affects:
    - "IG inbound DMs of type share/ig_reel/story_mention/story-reply/reaction/unknown"
    - "IG inbound voice notes (transcription now populated)"
tech_stack:
  added: []
  patterns:
    - "pure labeler returning string|null so caller decides fallback"
    - "inline (non-Inngest) best-effort transcription wrapped in try/catch — never breaks stored:true"
    - "dynamic await import to keep OpenAI/domain off the non-audio hot path (mirrors agent-production.ts)"
key_files:
  created: []
  modified:
    - "src/lib/instagram/webhook-handler.ts"
    - "src/lib/instagram/__tests__/webhook-handler.test.ts"
decisions:
  - "GAP-41-06 outcome = WIRED (not deferred): lookaside.fbsbx.com/ig_messaging_cdn is a public-but-signed CDN link in the HMAC-verified webhook payload, fetchable server-side at webhook time; transcribeAudioFromUrl's plain fetch handles non-OK gracefully."
  - "IG audio mime defaulted to 'audio/mp4' (IG voice notes are m4a/mp4; mimeTypeToExtension maps mp4 -> .mp4)."
metrics:
  duration: "~25 min"
  completed: "2026-06-06"
  tasks: 3
  commits: 3
  files: 2
---

# Phase 41 Plan 11: IG inbound non-standard types + audio transcription Summary

**One-liner:** Closed GAP-41-05 (empty IG inbound bubble) with a pure `labelInstagramEvent` labeler + never-empty-body fallback, and GAP-41-06 (audio not transcribed) by wiring inline best-effort Whisper transcription persisted via `setMessageTranscription` — both inside the meta_direct IG inbound handler only.

## What Was Built

### Task 1 — GAP-41-05 (TDD RED→GREEN)
- Extended `InstagramMessagingEvent` (additive, all optional): `message.reply_to.story` + top-level `reaction:{ reaction?, emoji? }`.
- Added exported pure `labelInstagramEvent(ev): string | null`:
  - `share` / `ig_reel` → `'[Publicación compartida]'` (+ URL when `payload.url` present)
  - `story_mention` or `message.reply_to.story` → `'[Respuesta a tu historia]'`
  - top-level `reaction` → `'[Reacción: <emoji|reaction>]'` (`'[Reacción]'` if neither)
  - unknown non-text/non-media subtype → `'[Mensaje de Instagram no compatible]'` (diagnostic — never empty/null)
  - plain text OR mapped media (image|audio|video|file) → `null` (existing paths keep handling them)
- Wired into `processInstagramWebhook`: when NOT text and NOT mapped media, `effectiveText`/`effectiveType` come from `labelInstagramEvent`, so `contentJson.body` and `messageContent` are never `''`.
- Tests: 9 unit cases for the labeler + 1 integration case (a `share` event stores the label, not `''`). Original 8 tests stay GREEN → **18/18 GREEN**.

### Task 2 — GAP-41-06 (WIRED)
- After the message is stored (post `domainResult.success`), an inline best-effort branch:
  `if (messageType === 'audio' && mediaUrl)` → `transcribeAudioFromUrl(mediaUrl, 'audio/mp4')` → on success `setMessageTranscription(ctx, { wamid: waMessageId, transcription })`.
- Same `waMessageId` as the `receiveMessage` insert, so the UPDATE matches the inserted row.
- Wrapped in try/catch + `tr.success` check → a failed/unfetchable transcription leaves `transcription=null` and never breaks `stored:true`.
- Dynamic `await import` keeps OpenAI/domain modules off the non-audio hot path (mirrors the v4 agent-production pattern).

### Task 3 — Push (Regla 1)
- 3 atomic commits pushed to `origin/main` (`fdd44228..1ee0857a`) → Vercel deploy. No DB migration (Regla 5 N/A — `messages.transcription` already in prod from v4-media 2026-06-01).

## GAP-41-06 Lookaside Feasibility Assessment

**Outcome: WIRED (not deferred).** `transcribeAudioFromUrl` does a plain `fetch(audioUrl)` (no Bearer header) and on a non-OK response returns `{ success: false }`. The `lookaside.fbsbx.com/ig_messaging_cdn` audio URL is a public-but-signed CDN link delivered in the (HMAC-verified upstream) webhook payload and is fetchable server-side at webhook time — which is why transcription runs immediately (the URL may expire later). This is the identical consumption pattern the v4 media-gate uses (`media-gate.ts:97/137`). If a future payload proves the URL token-gated, the path degrades gracefully (transcription stays null) rather than crashing — but no defer was needed.

## Verification

- `pnpm vitest run src/lib/instagram/__tests__/webhook-handler.test.ts` → **18/18 GREEN** (8 original + 10 new).
- Grep gates: `export function labelInstagramEvent`=1; `'[Publicación compartida]'`=1; `'[Respuesta a tu historia]'`=1; `[Reacción:`=1; `body: ''`=0; `setMessageTranscription`=2; `transcribeAudioFromUrl`=3; `messageType === 'audio'`=1.
- `pnpm exec tsc --noEmit` → 0 errors mentioning `instagram/webhook-handler.ts`.
- **Regla 6:** `git diff --name-only src/lib/channels/ src/lib/messenger/ src/lib/agents/godentist-fb-ig/` = EMPTY. Only the 2 planned files changed.
- **Regla 3:** `grep -c createAdminClient` in webhook-handler.ts = 0 (transcription persists via domain `setMessageTranscription`).
- **D-IG-01:** `grep -cE 'inngest|acquireLock'` in webhook-handler.ts = 0 (transcription is inline, no Inngest).
- **Regla 5:** no new file under `supabase/migrations/` for this plan.

## TDD Gate Compliance

- RED commit `75ba93bc` (`test(41-11)`) precedes GREEN commits `2bb70e22` + `1ee0857a` (`feat(41-11)`). RED-by-signature confirmed: 9 fails on `labelInstagramEvent is not a function` + 1 fail on actual stored body `''` (vs the expected label), with the original 8 still passing.

## Deviations from Plan

None — plan executed exactly as written. GAP-41-06 resolved to the WIRED branch the plan documented as the expected outcome.

## Commits

- `75ba93bc` — test(41-11): RED labelInstagramEvent + never-empty IG inbound body (GAP-41-05)
- `2bb70e22` — feat(41-11): etiquetar tipos IG inbound no estandar, nunca burbuja vacia (GAP-41-05)
- `1ee0857a` — feat(41-11): transcribir audio IG inbound via setMessageTranscription (GAP-41-06)

## Known Stubs

None.

## Threat Flags

None — no new ingress added. The transcription `fetch` targets a URL from the HMAC-verified Meta payload (covered by T-41-11-03, mitigated: best-effort + try/catch, only audio-typed events with a present url reach the fetch).

## Self-Check: PASSED

- Files: webhook-handler.ts FOUND, webhook-handler.test.ts FOUND, 41-11-SUMMARY.md FOUND.
- Commits: 75ba93bc FOUND, 2bb70e22 FOUND, 1ee0857a FOUND (all on origin/main).

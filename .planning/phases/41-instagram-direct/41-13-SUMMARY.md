---
phase: 41-instagram-direct
plan: 13
subsystem: outbound-media-classification
tags: [gap-closure, ig-02, meta-direct, tdd, mp4-reclassification]
gap_closure: GAP-41-08
requirements: [IG-02]
requires:
  - "src/app/actions/messages.ts sendMediaMessage (channel resolution + MIME derivation + domainSendMediaMessage call)"
provides:
  - "pure exported helper isAudioOnlyMp4(buf: Buffer): boolean"
  - "channel-gated (IG/FB) audio-only mp4/quicktime → 'audio' reclassification in sendMediaMessage"
affects:
  - "outbound IG/FB media sends of audio-only .mp4/.mov clips (now delivered as audio, Meta 200)"
tech-stack:
  added: []
  patterns:
    - "pure bounded buffer heuristic (524288-byte scan cap, never throws) for container handler detection"
    - "channel-gated server-side reclassification (Regla 6 — WhatsApp branch untouched)"
    - "independent bounded-prefix base64 decode decoupled from the full-buffer upload decode"
key-files:
  created:
    - "src/app/actions/__tests__/is-audio-only-mp4.test.ts"
  modified:
    - "src/app/actions/messages.ts"
decisions:
  - "isAudioOnlyMp4 scans ASCII 'vide'/'soun' hdlr handler_type tokens (not full box parsing) — robust against malformed atoms; vide presence is authoritative for a video track"
  - "scan bounded to first 524288 bytes (T-41-13-01 DoS mitigation); markers live in the front moov region"
  - "reclassification gated to channel instagram/facebook only — WhatsApp media classification byte-identical (Regla 6)"
  - "bounded prefix decode Buffer.from(fileData.slice(0,700000),'base64') is independent of the full-buffer upload decode at line ~469 (left untouched)"
metrics:
  duration: "~10 min"
  tasks: 2
  files: 2
  tests: 8
  completed: "2026-06-06"
---

# Phase 41 Plan 13: Reclassify audio-only mp4/mov to 'audio' for IG/FB sends (GAP-41-08) Summary

Server-side reclassification of audio-only `.mp4`/`.mov` clips (a `soun` handler with NO `vide` handler) from `'video'` to `'audio'` in `sendMediaMessage`, gated to Instagram/Facebook only — so a chat-downloaded `audioclip-*.mp4` re-sent to IG/FB is delivered as audio (Meta 200) instead of rejected as a trackless video (Meta 400 subcode 2018047). Implemented as a pure, bounded, never-throwing exported helper `isAudioOnlyMp4` plus a channel-gated guard, with a RED→GREEN unit test using synthetic buffers.

## What Was Built

- **`isAudioOnlyMp4(buf: Buffer): boolean`** (pure, exported, module-scope in `messages.ts`): guards `!Buffer.isBuffer || length < 8 → false`, bounds the scan to the first 524288 bytes, returns `false` if a `'vide'` marker is present, else `true` iff a `'soun'` marker is present, all wrapped in try/catch so it never throws.
- **Channel-gated reclassification block** in `sendMediaMessage`, placed AFTER the MIME-prefix derivation (the corrected `mediaType` flows into the existing `domainSendMediaMessage` call) and BEFORE the workspace-settings fetch: when `channel` is instagram/facebook AND `mediaType === 'video'` AND MIME is `video/mp4`|`video/quicktime`, it decodes a bounded 700KB base64 prefix and reclassifies to `'audio'` if `isAudioOnlyMp4` returns true.
- **`is-audio-only-mp4.test.ts`** (8 cases, synthetic buffers): audio-only→true, vide+soun→false, video-only→false, garbage/tiny/empty/non-Buffer→false (no throw), large bounded buffer→true.

## Verification

- `pnpm vitest run src/app/actions/__tests__/is-audio-only-mp4.test.ts` → **8/8 GREEN** (RED first: 8/8 failed with `isAudioOnlyMp4 is not a function`).
- Grep gates all pass: `export function isAudioOnlyMp4`=1, `slice.indexOf('vide'...)`=1, `slice.indexOf('soun'...)`=1, `524288`=1, gate `(channel === 'instagram' || channel === 'facebook') &&`=1, MIME pair=1, `isAudioOnlyMp4(scanBuffer)`=1, prefix decode=1.
- **Regla 6:** the guard does NOT contain `whatsapp` (whatsapp-in-guard grep = 0); the WhatsApp 24h block at :370 unchanged; only `src/app/actions/messages.ts` + the new test file changed — NO sender / domain / registry / godentist-fb-ig file touched.
- **Regla 3:** `createAdminClient` count = 2 (pre-existing import + the line ~468 storage upload); the new helper adds zero DB access (pure buffer scan).
- **Regla 5:** no DB migration — code-only change. No pre-deploy migration gate applies.
- `pnpm exec tsc --noEmit` → 0 errors mentioning `src/app/actions/messages.ts`.

## TDD Gate Compliance

- RED: `test(41-13): RED isAudioOnlyMp4 helper...` — commit `b37070a4` (8/8 failing).
- GREEN: `fix(41-13): reclasificar mp4/mov audio-only...` — commit `0d872f0e` (8/8 passing).
- No REFACTOR commit (implementation was minimal/clean as written).

## Deviations from Plan

None — plan executed exactly as written. 0 stubs, 0 auth gates.

## Commits

- `b37070a4` — test(41-13): RED isAudioOnlyMp4 helper para reclasificar mp4/mov audio-only (GAP-41-08)
- `0d872f0e` — fix(41-13): reclasificar mp4/mov audio-only a 'audio' en sendMediaMessage IG/FB (GAP-41-08)

Both pushed to `origin/main` (`...40409cd8..0d872f0e`; RED was already on origin from the prior session's push, GREEN pushed this run). Vercel deploy triggered (Regla 1).

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: src/app/actions/messages.ts (isAudioOnlyMp4 + reclassification block)
- FOUND: src/app/actions/__tests__/is-audio-only-mp4.test.ts
- FOUND commit: b37070a4 (on origin/main)
- FOUND commit: 0d872f0e (on origin/main)

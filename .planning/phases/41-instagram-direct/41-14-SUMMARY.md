---
phase: 41-instagram-direct
plan: 14
subsystem: whatsapp-inbox / media-optimistic-ui
tags: [instagram, facebook, media, optimistic-ui, gap-closure, tdd]
gap_closure: true
requirements: [IG-02]
requires:
  - "src/lib/media/mp4-detect.ts (isAudioOnlyMp4 — GAP-41-13)"
  - "src/app/actions/messages.ts server reclassification (GAP-41-13, UNCHANGED)"
provides:
  - "isAudioOnlyMp4Bytes(Uint8Array) — browser-safe audio-only mp4 detector"
  - "composer optimistic-type override (IG/FB) mirroring the server reclassification"
affects:
  - "outbound media optimistic bubble reconciliation for IG/FB audio-only .mp4/.mov"
tech-stack:
  added: []
  patterns:
    - "Pure browser-safe byte scanner (Uint8Array, zero Buffer) + Node Buffer entry delegating to it"
    - "Client mirrors server reclassification at the INPUT to a realtime reconciler (fix the input, not the matcher)"
key-files:
  created:
    - "src/lib/media/__tests__/mp4-detect.test.ts"
  modified:
    - "src/lib/media/mp4-detect.ts"
    - "src/app/(dashboard)/whatsapp/components/message-input.tsx"
decisions:
  - "Refactor over duplicate: isAudioOnlyMp4(Buffer) delegates to isAudioOnlyMp4Bytes(Uint8Array) — single source of heuristic, server test unaffected."
  - "Override gated to channel IG/FB only (Regla 6) — WhatsApp media byte-identical; reconciler in use-messages.ts NOT touched."
  - "Bounded 700KB atob prefix decode mirrors the server's 700KB scan (T-41-14-01 DoS mitigation)."
metrics:
  duration: "~20m"
  completed: "2026-06-06"
  tasks: 2
  commits: 4
  files_changed: 3
---

# Phase 41 Plan 14: Optimistic Media Type Alignment (GAP-41-09) Summary

Aligned the client optimistic media type with the server's audio-only-mp4 reclassification so an audio-only `.mp4`/`.mov` sent to Instagram/Facebook no longer leaves a phantom `status='sending'` bubble stuck forever.

## What Was Built

**Root cause (GAP-41-09):** the realtime INSERT reconciler in `src/hooks/use-messages.ts:382-396` matches the optimistic media bubble to the real DB row by `msg.type === newMessage.type && caption === caption`. The composer computed the optimistic type from the MIME (`video/mp4 → 'video'`), but GAP-41-13 reclassifies the SERVER row to `type='audio'` for audio-only mp4. So real `'audio'` != optimistic `'video'` → no match → the real row is appended AND the optimistic clone stays at `'sending'` forever.

**Fix:** mirror the server reclassification at the composer (the INPUT to the reconciler), not the matcher itself.

- **Task 1 (TDD RED→GREEN):** Added `isAudioOnlyMp4Bytes(bytes: Uint8Array)` — a browser-safe scanner with ZERO `Buffer` reference (`indexOfAscii` helper compares `charCodeAt` against array bytes). Bounded 512KB scan, defensive (`instanceof Uint8Array` + length<8 guard + try/catch → false, never throws). `'vide'` wins over `'soun'`. Refactored the Node `isAudioOnlyMp4(Buffer)` to keep its `Buffer.isBuffer` guard + signature and delegate (`return isAudioOnlyMp4Bytes(buf)` — Buffer IS a Uint8Array). The existing GAP-41-13 server test (`is-audio-only-mp4.test.ts`, 8 cases) stays byte-behavior green.
- **Task 2 (composer override):** In `message-input.tsx`'s `attachedFile` send path, before `addOptimisticMessage`, compute `optimisticType` starting from `deriveMediaType(mimeType)`; for IG/FB + `video/mp4|quicktime` + audio-only (bounded 700KB `atob` prefix → Uint8Array → `isAudioOnlyMp4Bytes`), override to `'audio'`. Passed `type: optimisticType` to the optimistic bubble. WhatsApp gate excluded.

## Verification Results

- `pnpm vitest run` mp4-detect.test.ts + is-audio-only-mp4.test.ts → **16/16 pass** (new bytes A–H + unchanged Node Buffer 8 cases).
- `npx tsc --noEmit` → 0 errors in changed files (4 pre-existing errors in unrelated test files — see Deferred Issues).
- **`pnpm build` (next build) → PASSES (exit 0)** — `/whatsapp` route compiled clean (HARD gate; catches 'use server'/build errors that tsc+vitest miss; the pure detector correctly lives in a non-server module).
- **Regla 6:** `git diff <pre-HEAD> -- src/hooks/use-messages.ts` → EMPTY (reconciler untouched); override gated IG/FB only; WhatsApp unchanged; server `messages.ts` untouched.
- **Regla 5:** no file under `supabase/migrations/` in the diff (client-only fix).
- **Regla 1:** pushed to origin/main (`0b02a18c..a8147b4d`).

## Commits

| Task | Type | Hash | Description |
|------|------|------|-------------|
| 1 RED | test | `da2e3f61` | failing tests for isAudioOnlyMp4Bytes |
| 1 GREEN | feat | `0b02a18c` | browser-safe isAudioOnlyMp4Bytes; Node entry delegates |
| 2 | fix | `a8147b4d` | composer optimistic-type override IG/FB (GAP-41-09) + push |

(Plus RED test commit `da2e3f61` was bundled before GREEN per TDD gate sequence.)

## Deviations from Plan

None — plan executed exactly as written.

## Deferred Issues

Pre-existing tsc errors in unrelated files (NOT caused by this plan, out of scope per executor scope boundary):
- `src/lib/domain/__tests__/conversations.test.ts` (eqMock implicit-any TS7022/TS7024)
- `src/lib/instagram/__tests__/webhook-handler.test.ts` + `src/lib/messenger/__tests__/webhook-handler.test.ts` (cannot find module `@/lib/inngest/client` TS2307)

These are test-only files outside the changed surface; `pnpm build` (production compile) passes regardless.

## Human Live-Smoke (cannot be automated)

Re-send a chat-downloaded `audioclip-*.mp4` to an IG and a FB conversation; confirm exactly ONE bubble appears and transitions `'sending' → 'sent'` (no greyed stuck clone). Confirm a normal image + a real video still send/reconcile, and a WhatsApp media send is unchanged.

## Self-Check: PASSED

- FOUND: src/lib/media/__tests__/mp4-detect.test.ts
- FOUND: src/lib/media/mp4-detect.ts (isAudioOnlyMp4Bytes export)
- FOUND: src/app/(dashboard)/whatsapp/components/message-input.tsx (type: optimisticType)
- FOUND commit: da2e3f61, 0b02a18c, a8147b4d (all on origin/main)

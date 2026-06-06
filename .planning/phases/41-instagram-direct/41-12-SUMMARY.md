---
phase: 41-instagram-direct
plan: 12
subsystem: whatsapp-composer / meta-direct media guard
tags: [gap-closure, ig-direct, fb-messenger, composer, media-validation, tdd, regla-6]
gap_closure: true
requirements: [IG-02]
requires:
  - "41-10: validateMetaUpload(file, channel) pure guard (HEIC + per-type size)"
provides:
  - "Per-channel, per-mediaType FORMAT whitelists (IG strict / FB permissive) layered onto validateMetaUpload"
  - "EXT_TO_MIME extension fallback for empty/generic file.type"
  - "formatRejectMessage + prettyFormat: exact Spanish reject messages per channel/kind"
affects:
  - "src/app/(dashboard)/whatsapp/components/message-input.tsx (composer pre-upload guard)"
tech-stack:
  added: []
  patterns:
    - "Additive extension of a shipped pure function (41-10) — same signature, new whitelist block after HEIC, single resolved kind shared with size checks"
    - "Extension-fallback MIME resolution when file.type is empty/generic (iOS / audio recorders)"
key-files:
  created: []
  modified:
    - "src/app/(dashboard)/whatsapp/components/message-input.tsx"
    - "src/app/(dashboard)/whatsapp/components/__tests__/meta-upload-guard.test.ts"
decisions:
  - "IG audio whitelist excludes audio/mpeg (mp3) — live-verified IG+mp3 → HTTP 400 subcode 2534080; FB audio includes mpeg (FB+mp3 → 200 OK)"
  - "Format whitelist applied to ALL instagram/facebook conversations (both meta_direct + manychat providers) — provider is server-only and unavailable in composer; rejecting unsupported formats early is correct for both"
  - "Narrowed deriveMediaType return via cast to the 4 media kinds (MessageType is wider) to satisfy tsc Record index"
metrics:
  duration: "~12 min"
  completed: "2026-06-06"
  tasks: 2
  commits: 3
  files_changed: 2
  tests: "25/25 GREEN (8 existing + 17 new)"
---

# Phase 41 Plan 12: Per-channel Media Format Whitelists (GAP-41-07) Summary

Closed GAP-41-07 (nonblocking): extended the 41-10 `validateMetaUpload(file, channel)` composer guard with per-channel, per-mediaType FORMAT whitelists (Instagram STRICT, Facebook PERMISSIVE) so operators get a clear Spanish reason BEFORE upload instead of Meta's cryptic post-upload `(#100)`. Additive on top of the existing HEIC + size logic; WhatsApp keeps NO format gate (Regla 6).

## What was built

- **`message-input.tsx`** — Added `IG_FORMATS` / `FB_FORMATS` (`Record<kind, Set<MIME>>`) + `EXT_TO_MIME` fallback map above `validateMetaUpload`. Inside the function, after the HEIC special-case, an effective-MIME is resolved (prefer `file.type`, fall back to extension when empty/`application/octet-stream`), `deriveMediaType` (reused) classifies the kind, and a per-channel Set lookup rejects unsupported formats via the new pure `formatRejectMessage(channel, kind, mime)` (+ `prettyFormat` for `audio/mpeg → MP3`). The same resolved `kind` now feeds the existing size checks (the only edit to the size block).
- **`meta-upload-guard.test.ts`** — Appended Tests 9–25 (IG strict: mp3/doc/gif/webp reject + aac/m4a/wav/mp4/pdf accept; FB permissive: mp3/docx accept, webm reject; extension-fallback empty-MIME mp3 reject / wav accept; WhatsApp mp3/doc/gif passthrough). Tests 1–8 unchanged.

## Verification

- `pnpm vitest run` on meta-upload-guard.test.ts → **25/25 GREEN** (RED first: 6 format-reject cases failed pre-impl).
- grep gates: `IG_FORMATS`=2, `FB_FORMATS`=2, IG audio msg=1, IG doc msg=1, `audio/aac`=4, `audio/mpeg`=4 (FB + EXT_TO_MIME, **NOT** in IG audio Set), WA early-return=1, HEIC msg=1, `MAX_FILE_SIZE = 16 * 1024 * 1024`=1, `META_IMAGE_MAX = 8 * 1024 * 1024`=1.
- `pnpm exec tsc --noEmit` → 0 errors mentioning message-input.tsx.
- **Regla 6:** `git diff --name-only` over the 3 commits = ONLY the 2 files; senders (instagram-api.ts / meta-facebook-sender.ts), `src/lib/meta/`, `src/lib/channels/`, `src/lib/domain/`, `src/lib/agents/godentist-fb-ig/` all EMPTY (untouched).
- **Regla 5:** no DB migration (client-only change).
- **Regla 1:** pushed to origin/main (`8f18810f..8c95e58f`); `git log origin/main -1` contains GAP-41-07.

## TDD Gate Compliance

- RED commit `49a0d526` `test(41-12): ...` (6 format-reject cases failing) precedes GREEN commit `8c95e58f` `fix(41-12): ...`. No REFACTOR commit needed.

## Commits

- `49a0d526` test(41-12): RED para whitelist de formato por canal en validateMetaUpload (GAP-41-07)
- `8c95e58f` fix(41-12): validar formato de media por canal en validateMetaUpload (GAP-41-07)
- (push of the above to origin/main — Task 2, Regla 1)

## Deviations from Plan

**1. [Rule 3 - Blocking] tsc Record-index error on `deriveMediaType` return type**
- **Found during:** Task 1 GREEN (post-implementation tsc).
- **Issue:** `deriveMediaType` returns the wide `Message['type']` (MessageType), which can't index `Record<'image'|'video'|'audio'|'document', Set<string>>` (TS7053 / TS2345).
- **Fix:** Annotated the resolved `kind` with `as 'image' | 'video' | 'audio' | 'document'` (the helper only ever returns these 4). No behavior change.
- **Files modified:** message-input.tsx
- **Commit:** 8c95e58f

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: src/app/(dashboard)/whatsapp/components/message-input.tsx (modified)
- FOUND: src/app/(dashboard)/whatsapp/components/__tests__/meta-upload-guard.test.ts (modified)
- FOUND: commit 49a0d526 (RED)
- FOUND: commit 8c95e58f (GREEN, on origin/main)

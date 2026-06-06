---
phase: 41-instagram-direct
plan: 10
subsystem: ui
tags: [instagram, facebook, meta-direct, file-upload, composer, react, vitest, tdd]

# Dependency graph
requires:
  - phase: 41-instagram-direct
    provides: "IG/FB meta_direct send path (instagram-api.ts, meta-instagram-sender.ts) + channel='instagram' conversations in the inbox composer"
provides:
  - "Pure validateMetaUpload(file, channel) guard that rejects HEIC + oversized (image 8MB / video|audio|file 25MB) uploads for instagram/facebook BEFORE upload"
  - "channel prop threaded chat-view.tsx -> message-input.tsx (conversation.channel)"
  - "Media-failure toast surfaces the REAL result.error (e.g. Meta 2018047 / window-closed) instead of the generic constant"
affects: [instagram-direct, meta-direct-outbound, facebook-messenger-direct]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Channel-aware client-side pre-upload guard as a PURE exported function (testable in isolation, no React render)"
    - "Surface result.error on the failing send branch; keep a constant fallback only on the network-throw catch (no error object available)"

key-files:
  created:
    - "src/app/(dashboard)/whatsapp/components/__tests__/meta-upload-guard.test.ts"
  modified:
    - "src/app/(dashboard)/whatsapp/components/message-input.tsx"
    - "src/app/(dashboard)/whatsapp/components/chat-view.tsx"

key-decisions:
  - "Apply the tighter Meta limits to ALL instagram/facebook conversations (both meta_direct and manychat providers) — provider awareness is server-only and unavailable in the composer; rejecting an oversized/HEIC image early is correct for both because Meta enforces the same per-type limits regardless of provider."
  - "validateMetaUpload is a PURE exported function so it is unit-tested without rendering the composer; the guard's wiring in handleFileChange is covered structurally (grep) + tsc."
  - "Undefined channel is treated as 'whatsapp' by the caller so every existing MessageInput caller is unaffected (Regla 6)."
  - "The .catch() network-throw branch keeps the constant 'Error al enviar archivo' fallback (there is no result object to surface); only the .then() result branch gains result.error."

patterns-established:
  - "Pure validateMetaUpload guard: gate on channel, HEIC by MIME OR extension (iOS empty/wrong MIME), per-type size via deriveMediaType."
  - "Real-error surfacing: result.error || constant on the result branch; constant-only on the throw branch."

requirements-completed: [IG-02]

# Metrics
duration: ~20min
completed: 2026-06-06
---

# Phase 41 Plan 10: GAP-41-04 Meta upload guard Summary

**Channel-aware pre-upload guard (validateMetaUpload) rejecting HEIC + >8MB-image / >25MB-other uploads for Instagram/Facebook with clear Spanish reasons, plus media-failure toasts that surface the REAL Meta error instead of a generic constant — WhatsApp 16MB behavior byte-identical (Regla 6).**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-06T10:18:00Z
- **Completed:** 2026-06-06T10:30:00Z
- **Tasks:** 3
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- Pure `validateMetaUpload(file, channel)` guard exported from message-input.tsx: HEIC (by MIME or `.heic`/`.heif` extension, case-insensitive) and per-type size caps (image 8MB, video/audio/file 25MB) for `instagram`/`facebook`; no-op for `whatsapp`.
- Guard wired into `handleFileChange` BEFORE the existing 16MB `MAX_FILE_SIZE` check; `channel` added to its dependency array.
- `channel={conversation.channel}` threaded from chat-view.tsx into MessageInput (additive prop, default-safe).
- Media-failure toast on the `.then()` result branch now surfaces `result.error || 'Error al enviar archivo'` (the real Meta 2018047 / window-closed reason); the `.catch()` network-throw branch keeps the constant fallback.
- 8/8 guard tests GREEN; tsc clean on both touched production files.

## Task Commits

Each task was committed atomically (TDD RED -> GREEN):

1. **Task 1 (RED): validateMetaUpload tests** - `96fc7d7f` (test)
2. **Task 1 (GREEN): validateMetaUpload pure guard** - `5dc63aed` (feat)
3. **Task 2: wire guard into composer + surface real error** - `dba5a347` (feat)
4. **Task 3: push to origin/main (Regla 1)** - push of `dba5a347` (no new commit — the three files were already committed via the TDD flow)

## Files Created/Modified
- `src/app/(dashboard)/whatsapp/components/__tests__/meta-upload-guard.test.ts` - 8 RED/GREEN cases pinning HEIC + 8MB image + 25MB video on IG/FB, and WhatsApp pass-through (HEIC + 9MB).
- `src/app/(dashboard)/whatsapp/components/message-input.tsx` - exported pure `validateMetaUpload` + META_* constants; guard call in `handleFileChange`; `channel` prop + dep; `result.error` surfaced on the media result branch.
- `src/app/(dashboard)/whatsapp/components/chat-view.tsx` - passes `channel={conversation.channel}` to MessageInput.

## Decisions Made
- Both IG/FB providers (meta_direct + manychat) get the tighter limits — provider is server-only, and Meta enforces the same per-type caps regardless. See key-decisions in frontmatter for the full rationale.
- TDD discipline produced separate RED/GREEN commits for the pure function; Task 3's plan-suggested single combined commit message was not needed because the three files were already committed atomically — Task 3 reduced to the push (Regla 1).

## Deviations from Plan
None - plan executed exactly as written. (Task 3's commit step was a no-op because all three files were already committed via the TDD RED/GREEN/feat commits; the push proceeded as specified.)

## Issues Encountered
- A `grep -c` acceptance check initially returned 0 for the `result.error || 'Error al enviar archivo'` and total-constant patterns due to shell escaping of the `||` pipe in the pattern. Re-ran with `grep -cF` (fixed-string): fallback=1, total constant=2 — both acceptance criteria confirmed (result branch + catch). No code issue.

## Regla 6 Verification
- `git diff --name-only 96fc7d7f^ dba5a347` lists ONLY the test file, message-input.tsx, chat-view.tsx.
- No sender (instagram-api.ts / meta-facebook-sender.ts), domain, or registry file touched.
- WhatsApp 16MB constant unchanged: `grep -c 'MAX_FILE_SIZE = 16 * 1024 * 1024'` = 1.
- HEIC guard is meta-only (Test 8 GREEN: HEIC on whatsapp -> ok:true).

## TDD Gate Compliance
- RED commit `96fc7d7f` (test) precedes GREEN `5dc63aed` (feat). RED proof: 8/8 failed with `validateMetaUpload is not a function` (missing impl, not syntax). GREEN: 8/8 pass.

## User Setup Required
None - client-only change, no external service configuration, no DB migration (Regla 5 N/A).

## Next Phase Readiness
- GAP-41-04 is closed and live on origin/main (Vercel deploy).
- Remaining Phase 41 open gaps: GAP-41-05 (unrecognized IG inbound types -> empty bubble) and GAP-41-06 (IG inbound audio transcription) — planned in 41-11.
- Live operator smoke (attach a HEIC / >8MB image to an IG/FB thread and confirm the Spanish rejection) is the human-verification follow-up.

---
*Phase: 41-instagram-direct*
*Completed: 2026-06-06*

## Self-Check: PASSED
- All 4 files verified present on disk (test, message-input.tsx, chat-view.tsx, 41-10-SUMMARY.md).
- All 3 commits verified in git history (96fc7d7f test, 5dc63aed feat, dba5a347 feat).
- Pushed to origin/main (`git log origin/main -1` contains GAP-41-04).

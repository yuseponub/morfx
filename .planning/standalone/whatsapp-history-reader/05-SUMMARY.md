---
phase: whatsapp-history-reader
plan: 05
subsystem: robot-whatsapp-reader (CLI orchestrator)
tags: [cli, playwright, wa-js, read-only, anti-ban, pilot-gate]
requires: [01, 02, 03, 04]
provides: ["runnable CLI orchestrator (src/index.ts)", "operator runbook (README.md)", "D-06 null-rate gate in code", "D-16 pilot HALT gate", "D-15 zero-send fail-safe", "project-wide zero-send invariant"]
affects: [robot-whatsapp-reader]
tech-stack:
  added: []
  patterns: ["CLI arg-parse (kommo idiom)", "manifest 3-state resume (not flat Set)", "write-then-checkpoint ordering", "pilot-halts-before-sweep gate", "top-level fail-safe try/catch"]
key-files:
  created:
    - robot-whatsapp-reader/src/index.ts
    - robot-whatsapp-reader/README.md
  modified: []
decisions: [D-06, D-13, D-14, D-15, D-16]
metrics:
  duration: "~15 min"
  completed: 2026-06-06
---

# Phase whatsapp-history-reader Plan 05: CLI Orchestrator + Operator Runbook Summary

Wired all Plan 01-04 modules into a runnable read-only CLI (`src/index.ts`) that opens a persistent QR session, enumerates 1:1 chats, and per-chat resolves the number → scrapes full history → writes atomically → checkpoints the manifest — with the D-06 null-rate gate, D-16 pilot HALT, D-13 anti-ban pacing, D-14 per-number dirs, and the D-15 zero-send fail-safe all enforced in code; plus a Spanish operator README and a passing project-wide zero-send grep.

## What Was Built

### Task 1 — `src/index.ts` (CLI orchestrator)
- **Arg parse** (`--number` REQUIRED, `--pilot`, `--limit N`, `--resume`) mirroring the kommo-scraper idiom; `--number` digits drive D-14 dirs.
- **D-14 per-number isolation:** `output/<number>/` + `profiles/<number>/` (isolated userDataDir), both `mkdir -p`.
- **Full flow:** `openSession` → `injectWaJs` → `assertAuthenticated` (throws `NOT_AUTHENTICATED`) → `captureBusinessIdentity` (D-08) → `loadManifest` → `enumerateChats` → `filterRemaining` (D-11 resume always on) → effective-limit slice → per-chat loop → `closeSession` in `finally`.
- **Per-chat pipeline:** `markPending` → settle (`postOpenDelayMs`) → `resolveNumber` (+ null counting) → `scrapeMessages` → `buildChatBackup` → `writeChatBackup` → `markDone`. **Order is load-bearing** (write THEN checkpoint, Pitfall 5/D-12). Per-chat error → `markFailed` + continue.
- **D-06 gate:** after each chat, once `processed >= nullRateMinSample` and `nulls/processed > nullRateThreshold (0.08)`, throws `NULL_RATE_GATE_TRIPPED`. Guarded by minSample so the 5-chat pilot is never tripped.
- **D-15 fail-safe:** mid-loop `isLoggedOut(page)` → clean pause + alert + `break`; in-flight chat stays `pending`; never sends. Top-level `main().catch()` logs clean, sets `process.exitCode = 1`, never sends.
- **D-13 pacing:** `randDelay(config.interChatDelayMs)` between chats.
- **D-16 pilot HALT:** in pilot mode, after the sample prints `PILOT COMPLETE ... NOT sweeping.` and `return`s — never auto-continues to a sweep.
- **Graceful shutdown:** SIGTERM/SIGINT handlers (robot-godentist idiom); NO HTTP server bootstrap (CLI deviation).
- Running null-rate logged every chat (the key pilot metric).

### Task 2 — `README.md` (operator runbook) + zero-send gate
- Sections: qué hace / qué NO hace, install, **piloto-primero (D-16)**, barrido completo, resume/fail-safe, **desvincular (unlink) post-barrido**, multi-cliente (D-14), D-06 gate explanation, and a **Zero-send guarantee** section with the verifiable grep.
- Project-wide zero-send grep over `src/` (`sendText|sendMessage|WPP.chat.send|requestPhoneNumber`) returns **0 matches** — D-15 headline invariant satisfied.

## Verification

- `cd robot-whatsapp-reader && npm run build` exits 0 (full project compiles, NodeNext ESM `.js` imports).
- Task 1 acceptance greps: `--pilot` 4, `PILOT COMPLETE|NOT sweeping` 2, `--number` 4, `nullRateThreshold` 4, `nullRateMinSample` 3, `NULL_RATE_GATE_TRIPPED` 1, `randDelay(config.interChatDelayMs)` 1, `isLoggedOut` 2, `app.listen|createServer` 0, write-then-markDone `ORDER_OK`. All pass.
- Task 2 acceptance greps: `--pilot` 3, `unlink|desvincular|linked devices|...` 3, `never|nunca|...` 4, project-wide zero-send 0. All pass.

Live behavior (real QR, real gate trip, real fail-safe) is intentionally deferred to the Plan 06 human pilot — not claimed verified by code inspection here (per plan `<verification>`).

## Deviations from Plan

**1. [Rule 3 - Blocking] Renamed acceptance-string in comments to satisfy the `app.listen|createServer == 0` gate.**
- **Found during:** Task 1 verification.
- **Issue:** My initial explanatory comments used the literal strings ``app.listen``/``createServer`` (describing what a CLI does NOT do), which made `grep -Ec 'app.listen|createServer'` return >0 and failed the acceptance gate.
- **Fix:** Reworded the two comments to "HTTP server bootstrap" — no behavioral change.
- **Files modified:** `robot-whatsapp-reader/src/index.ts`
- **Commit:** 91f1e376 (folded into Task 1 commit).

No other deviations. `markPending` signature required a `file` field at in-flight time (before the number/file are known), so it is passed `file:''` provisionally and overwritten by `markDone` with the real filename — consistent with the module's documented contract.

## Known Stubs

None. The CLI wires real module functions end-to-end; no placeholder/empty data paths.

## Authentication Gates

None during execution. (The robot's own QR login is operator-driven at runtime, documented in the README — not an executor auth gate.)

## Self-Check: PASSED

- FOUND: `robot-whatsapp-reader/src/index.ts`
- FOUND: `robot-whatsapp-reader/README.md`
- FOUND commit: `91f1e376` (feat — orchestrator)
- FOUND commit: `3f05ae1e` (docs — README + zero-send gate)

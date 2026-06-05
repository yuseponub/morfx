---
phase: 41-instagram-direct
plan: 07
subsystem: instagram-direct / gated-cutover
tags: [instagram, meta-direct, regla-6, regla-5, cutover, human-action-gate]
status: AT_CHECKPOINT
requires: [41-00, 41-01, 41-02, 41-03, 41-04, 41-05, 41-06]
provides: [phase-41-autonomous-verification, ig-05-gate-verified, regla-6-confirmed]
affects: []
tech-stack:
  added: []
  patterns: [byte-identical-regla-6-diff, grep-verify-no-code-change, gated-cutover-checkpoint]
key-files:
  created:
    - .planning/phases/41-instagram-direct/41-07-SUMMARY.md
  modified: []
decisions:
  - "Autonomous verification portion ran sequentially on main (no worktree); human-action cutover STOPPED for operator (autonomous:false)."
  - "NO push performed: Regla 5 HARD GATE — 41-00 prod migration must be confirmed applied first."
metrics:
  duration: ~25min
  completed: 2026-06-05
---

# Phase 41 Plan 07: Gated Cutover (Instagram Direct) — Autonomous Verification Summary

The autonomous half of the FINAL Phase 41 gated cutover. Full suite + Regla 6 byte-identical diff + IG-05 action-layer gate grep-verify + tsc all PASS on the committed-but-unpushed Phase 41 work. STOPPED at the human-action cutover checkpoint (push, prod-migration confirmation, 1-workspace flip, A1/A2 linchpins, live IG smoke, 24h block) — operator action required. NO code change (files_modified empty), NO push, NO workspace flipped.

## What Was Verified (Autonomous — ALL PASS)

### 1. Full test suite (pnpm vitest — repo is pnpm-only)
- **Phase 41 five-file run: `5 passed (5)` files / `42 passed (42)` tests** — all GREEN.
  - `src/lib/meta/__tests__/instagram-api.test.ts` (11)
  - `src/lib/channels/__tests__/meta-instagram-sender.test.ts` (8)
  - `src/lib/domain/__tests__/messages-instagram.test.ts` (9)
  - `src/lib/instagram/__tests__/webhook-handler.test.ts` (8)
  - `src/app/api/webhooks/meta/__tests__/instagram-branch.test.ts` (6)
- **Full suite: `8 failed | 127 passed | 12 skipped (147)` files / `10 failed | 1252 passed | 42 skipped (1320)` tests.**
  - The 10 failures are **pre-existing, non-Phase-41** somnio-v4 RAG-generative wording assertions (e.g. `few-shots.test.ts` `toMatch(/compañero (humano )?experto/)`), exactly the class documented in prior STATE entries as known non-regressions.
  - **Phase 41 touched ZERO somnio-v4 files** (`git diff --name-only 82d3e91b HEAD -- src/lib/agents/somnio-v4/` = empty). Confirmed isolated: a standalone `somnio-v4` run = `3 failed | 25 passed` files / `5 failed | 289 passed` tests, all in the RAG area.
  - **No Phase 41 test file appears in any failure context.**

### 2. Regla 6 byte-identical diff vs pre-phase baseline `82d3e91b`
- `git diff 82d3e91b -- src/lib/channels/registry.ts` → **EMPTY** (byte-identical).
- `git diff 82d3e91b -- src/lib/channels/manychat-sender.ts` → **EMPTY** (byte-identical).
- `git diff 82d3e91b -- src/lib/agents/godentist-fb-ig/` → **EMPTY** (byte-identical — D-IG-03, NOT migrated).
- `grep -c metaInstagramSender src/lib/channels/registry.ts` → **0** (Pitfall 4 — sender is domain-direct-imported, NOT in the channel-keyed map).
- `git status --porcelain src/lib/agents/godentist-fb-ig/` → EMPTY (clean working tree).

### 3. IG-05 action-layer window gate — grep VERIFY ONLY (wired in 41-04; NO code change here)
In `src/app/actions/messages.ts`:
- `grep -c "channel === 'instagram'"` → **6** (≥2 ✓)
- `grep -c resolveMessengerWindowSend` → **5** (≥4 ✓ — import + 2 FB + 2 IG sites)
- `grep -c instagram_provider` → **9** (≥2 ✓ — both `.select(...)`)
- `git status --porcelain src/app/actions/messages.ts` → EMPTY (the gate lives in committed 41-04 work; this plan made NO edit).

### 4. tsc --noEmit
- **0 errors in any production (non-test) file** — `tsc --noEmit | grep -v __tests__ | grep "error TS"` = empty.
- **0 errors in any Phase 41 production file.**
- The 3 remaining errors are test-only and pre-existing: `domain/__tests__/conversations.test.ts` (unchanged since baseline), `messenger/__tests__/webhook-handler.test.ts` (unchanged since baseline, the FB sibling with the same `@/lib/inngest/client` module-resolution quirk), and the IG `webhook-handler.test.ts` mirroring that identical FB-sibling quirk — the IG test still runs GREEN under vitest (8/8).

## Phase 41 source files changed (baseline → HEAD, all committed, NOT pushed)
```
src/app/(dashboard)/configuracion/integraciones/page.tsx
src/app/actions/messages.ts
src/app/actions/meta-onboarding.ts
src/app/api/webhooks/meta/route.ts
src/components/settings/connect-instagram.tsx
src/lib/channels/meta-instagram-sender.ts
src/lib/domain/messages.ts
src/lib/domain/meta-accounts.ts
src/lib/instagram/webhook-handler.ts
src/lib/meta/instagram-api.ts
src/lib/meta/instagram-connect.ts
supabase/migrations/20260605120000_add_instagram_provider.sql
(+ the 5 Phase 41 __tests__ files)
```
The protected Regla 6 trio (`registry.ts`, `manychat-sender.ts`, `godentist-fb-ig/`) is NOT in this list.

## Deviations from Plan
None — autonomous portion executed exactly as written. No code change (files_modified empty per the plan). Task 2 is a `checkpoint:human-verify` gate, reached and STOPPED.

## Human-Action Cutover — AWAITING OPERATOR
The push (Regla 1), prod-migration confirmation (Regla 5 HARD GATE), 1-workspace SQL flip, A1/A2 linchpins, live IG DM smoke, and outside-24h block are operator-only. Exact steps + SQL are in the checkpoint returned to the orchestrator. Phase NOT marked complete past this gate.

## Self-Check: PASSED
- `41-07-SUMMARY.md` written (this file).
- All verification commands re-runnable; counts above are exact tool output.

---
phase: 40-facebook-messenger-direct
plan: 04
subsystem: domain-layer-messaging
tags: [messenger, meta-direct, chokepoint, regla-3, regla-6, tdd-green]
requires:
  - "40-00: messenger_provider column in prod (Regla 5)"
  - "40-01: messenger-provider.test.ts RED scaffold"
  - "40-02: metaFacebookSender + messenger-api.ts"
provides:
  - "readMessengerProvider single-read chokepoint (default manychat)"
  - "facebook meta_direct arm in sendTextMessage/sendMediaMessage"
  - "SendTextMessageParams.tag / SendMediaMessageParams.tag (optional HUMAN_AGENT)"
affects:
  - "src/lib/domain/messages.ts (facebook send path)"
tech-stack:
  added: []
  patterns:
    - "Single provider-decision site mirroring readWhatsappProvider (Phase 39)"
    - "Creds from resolveByWorkspace(ctx.workspaceId, 'facebook') — never from input (T-40-02)"
key-files:
  created: []
  modified:
    - "src/lib/domain/messages.ts"
decisions:
  - "D-10: messenger_provider read ONCE per facebook send (Regla 3 chokepoint), default manychat on null/unknown"
  - "Regla 6: manychat facebook arm + instagram arm kept byte-identical via getChannelSender('facebook')"
metrics:
  duration: "~25 min"
  completed: "2026-06-04"
  tasks: 1
  files: 1
---

# Phase 40 Plan 04: Messenger Provider Chokepoint Summary

JWT-style provider chokepoint for facebook sends: `readMessengerProvider` reads `workspaces.messenger_provider` once per facebook send and routes `meta_direct` through `metaFacebookSender` (creds from `resolveByWorkspace`), keeping the default `manychat` path byte-identical to the existing `getChannelSender('facebook')` path (Regla 6).

## What Was Built

- **`readMessengerProvider(supabase, workspaceId)`** — sibling of `readWhatsappProvider`. Reads `workspaces.messenger_provider`, defaults to `'manychat'` on null/unknown. Single read per facebook send (Regla 3 chokepoint — never per-call-site).
- **`sendTextMessage` facebook arm** — split the catch-all `else` into `else if (channel === 'facebook')` (provider branch) + `else` (instagram/future, untouched). `meta_direct` → `resolveByWorkspace(ctx.workspaceId, 'facebook')` → `metaFacebookSender.sendText({ accessToken, pageId }, PSID, body, tag)`. `manychat` → existing `getChannelSender('facebook')` byte-identical.
- **`sendMediaMessage` facebook arm** — same split inside the existing `image`-only guard. `meta_direct` → `metaFacebookSender.sendImage(...)`. `manychat` byte-identical.
- **Optional `tag?: 'HUMAN_AGENT'`** added to `SendTextMessageParams` + `SendMediaMessageParams` (additive, defaults undefined = RESPONSE; the Plan 06 window gate supplies it).

## Verification

- `npx vitest run src/lib/domain/__tests__/messenger-provider.test.ts` → **5 passed (5)** GREEN (2 manychat parity guards + 3 meta_direct arm).
- `npx vitest run src/lib/domain/__tests__/messages-provider.test.ts` (P39 whatsapp chokepoint) → **5 passed (5)** — no regression.
- `npx tsc --noEmit` → no errors in `src/lib/domain/messages.ts`.

## Regla 6 / Regla 3 Gates

- `git diff --stat src/lib/channels/registry.ts src/lib/channels/manychat-sender.ts` → **EMPTY**.
- `src/lib/agents/godentist-fb-ig/` → **untouched**.
- `grep -c readMessengerProvider src/lib/domain/messages.ts` → 3 (1 def + 2 reads, ≤2 send fns — single chokepoint per fn).
- `grep -c metaFacebookSender src/lib/domain/messages.ts` → 4 (import + sendText + sendImage arms).
- `grep -c "resolveByWorkspace(ctx.workspaceId, 'facebook')" src/lib/domain/messages.ts` → 2.
- Diff to `messages.ts`: **+97 / -2** (minimal, additive — no refactor/reorder of existing code).

## Deviations from Plan

**1. [Rule 3 - Blocking] Worktree rebased onto current main to obtain plan dependencies**
- **Found during:** initial file read.
- **Issue:** The worktree was branched from `f313e087` (planning-complete HEAD), which predates the Plan 40-01 (RED test) and 40-02 (`metaFacebookSender`, `messenger-api.ts`) commits. Those dependency files (`depends_on: [40-00, 40-01, 40-02]`) were committed on `main` (`1fc2ad71`, `57701ef0`, `6fd44075`) by concurrent sessions but absent from the worktree base, so the plan could not execute.
- **Fix:** `git rebase main` from inside the worktree — pulled the dependency commits cleanly (no conflicts), anchoring this plan's additive edit on the up-to-date `messages.ts` (including the concurrent Phase 999.1 `sendInteractiveMessage` chokepoint).
- **Impact:** Worktree branch now contains main HEAD + this plan's commit. Merge back is conflict-free. STATE.md / ROADMAP.md untouched (orchestrator owns them).
- **Commit:** rebase (no new commit) + `ecaf2bc9` (the implementation).

## Self-Check: PASSED

- `src/lib/domain/messages.ts` modified — FOUND.
- Commit `ecaf2bc9` — FOUND.
- messenger-provider.test.ts GREEN 5/5 — VERIFIED.
- Regla 6 diff EMPTY — VERIFIED.

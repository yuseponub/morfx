---
phase: 41-instagram-direct
plan: 04
subsystem: instagram-direct
type: tdd
tags: [instagram, meta-direct, tdd-green, domain-chokepoint, regla-3, regla-6, window-gate, ig-05]
requirements: [MIG-02, IG-02, IG-05]
requires:
  - "41-00 instagram_provider column in prod (Regla 5 gate — read by both the domain chokepoint and the action-layer .select)"
  - "41-01 RED tests (messages-instagram.test.ts — 6 meta_direct + 3 manychat parity)"
  - "41-02 metaInstagramSender (domain-imported sender adapter)"
provides:
  - "readInstagramProvider — the SINGLE instagram provider-decision site in domain/messages.ts (Regla 3 chokepoint)"
  - "instagram arm in sendTextMessage + sendMediaMessage (meta_direct → metaInstagramSender; manychat byte-identical to prior final-else)"
  - "IG-05 action-layer window gate at BOTH gate sites in actions/messages.ts (reused resolveMessengerWindowSend, D-IG-09)"
affects:
  - "Plan 41-07 (gated cutover) VERIFIES + live-smokes this code; only flips instagram_provider per-workspace via SQL"
tech-stack:
  added: []
  patterns:
    - "TDD GREEN by cloning the shipped Phase 40 FB chokepoint (readMessengerProvider) with messenger_provider→instagram_provider"
    - "New else-if instagram arm inserted BEFORE the prior final else; the prior final-else body relocated VERBATIM into the manychat sub-arm (Regla 6)"
    - "Window-gate policy helper REUSED verbatim (D-IG-09 — no IG sibling, no new policy test)"
    - "Action-layer change purely additive: facebook/manychat/whatsapp branches byte-identical"
key-files:
  created: []
  modified:
    - src/lib/domain/messages.ts
    - src/app/actions/messages.ts
    - src/lib/domain/__tests__/messages-instagram.test.ts
decisions:
  - "manychat IG media parity asserts sender.sendImage (not sendMedia — ChannelSender has no sendMedia; the byte-identical legacy path calls sendImage). Corrected the 41-01 RED test method name (Rule 1)."
  - "igTag threaded into the domain call as `fbTag ?? igTag` (channels are mutually exclusive, so the coalesce is safe and additive)."
metrics:
  duration: ~18m
  completed: 2026-06-05
  tasks: 2
  files: 3
  tests_total: 30
  tests_green: 30
---

# Phase 41 Plan 04: Instagram Direct — domain readInstagramProvider chokepoint + IG-05 action-layer window gate (TDD GREEN) Summary

Turned the 6 Wave-1 RED `messages-instagram.test.ts` meta_direct tests GREEN (MIG-02 / IG-02) by adding the SINGLE provider-decision site for `channel === 'instagram'` in the domain layer (Regla 3 chokepoint), and wired the IG-05 action-layer 24h window gate at BOTH gate sites in `actions/messages.ts` (reused `resolveMessengerWindowSend`, D-IG-09). The default ManyChat instagram path stays byte-identical (Regla 6) — the 3 manychat-parity guards from 41-01 remain GREEN. Code committed locally only (Regla 5 — reads `instagram_provider`, not pushed until the 41-07 cutover confirms the prod migration).

## What Was Built

Two atomic commits, one per task:

| Task | Commit | Files | Tests (GREEN) |
| ---- | ------ | ----- | ------------- |
| 1 — domain chokepoint + instagram arm | `25fd1a01` | `domain/messages.ts` (+ RED-test method-name fix) | messages-instagram 9/9 |
| 2 — IG-05 action-layer window gate | `2de8266d` | `app/actions/messages.ts` | (grep-verified; policy covered by reused messenger-window 11/11) |

**No-regression run: 4 files, 30/30 GREEN** (messages-instagram 9 + messages-provider 5 + messenger-provider 5 + messenger-window 11).

### Task 1 — `domain/messages.ts` (MIG-02 / IG-02 / Regla 3 / Regla 6)
- `readInstagramProvider(supabase, workspaceId)` — clones `readMessengerProvider` verbatim, reads `workspaces.instagram_provider`, returns `'meta_direct'` only when `=== 'meta_direct'`, else `'manychat'` (null/unknown → manychat default). Single read per instagram send (Regla 3 chokepoint).
- `sendTextMessage`: new `else if (channel === 'instagram')` block inserted BEFORE the prior final `else`. `meta_direct` → `resolveByWorkspace(ctx.workspaceId, 'instagram')` (creds from ctx, NEVER input — T-41-04-03) → `metaInstagramSender.sendText({accessToken,pageId}, IGSID-string, body, params.tag)`; missing creds → `{success:false, error:'Credenciales Meta no configuradas'}`. The `manychat` sub-arm is BYTE-IDENTICAL to the prior final-else ManyChat body (`getChannelSender('instagram').sendText`).
- `sendMediaMessage`: same instagram arm. `meta_direct` → `metaInstagramSender.sendMedia(...)` (image + audio/video/document via attachments); `manychat` image → `sender.sendImage` (byte-identical legacy), non-image → the existing graceful `Tipo de media no soportado` error.
- `metaInstagramSender` imported DIRECTLY from `'@/lib/channels/meta-instagram-sender'` (NOT in the channel-keyed registry map — Regla 6).
- The trailing `else` (future channels) preserved; FB + WA arms untouched.

### Task 2 — `app/actions/messages.ts` (IG-05 / D-IG-09 / Regla 6 additive-only)
- Both workspace-settings reads now `.select('settings, messenger_provider, instagram_provider')` (text path ~134, media path ~376).
- Both apiKey guards extended with `isMetaDirectInstagram` so the meta_direct instagram arm skips the ManyChat key requirement (it uses the Page token resolved in the domain) — `if (!isMetaDirectFacebook && !isMetaDirectInstagram)`.
- New instagram window-gate `if` block added at BOTH gate sites, immediately after the facebook block, mirroring it verbatim with `facebook→instagram` + `messenger_provider→instagram_provider`. Consults the REUSED `resolveMessengerWindowSend({hoursSinceCustomerMessage, featureGranted: META_HUMAN_AGENT_ENABLED === 'true'})`. Outside-24h → `return { error: decision.error }` (the SAME Spanish BLOCK_MESSAGE the FB arm returns). IG has no templates → block-only (Pitfall 6).
- `igTag` threaded into the domain call as `tag: fbTag ?? igTag` at both sites.
- Additive-only: the facebook / manychat / whatsapp branches are byte-identical (Regla 6).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 41-01 RED media-parity test asserted a non-existent `sender.sendMedia` method**
- **Found during:** Task 1 (the manychat media-parity test failed RED-on-impl).
- **Issue:** `messages-instagram.test.ts` mocked `getChannelSender('instagram')` to return a `sendMedia` spy and asserted `manychatSendMedia` is called once for the manychat media path. But the `ChannelSender` interface (`channels/types.ts`) exposes only `sendText` + `sendImage` — there is NO `sendMedia` method on real ManyChat senders. The byte-identical legacy IG media path calls `sender.sendImage` (Regla 6). With the spy named `sendMedia`, the `sendImage` mock returned `undefined` → `result.success` threw, and the assertion could never hold without breaking Regla 6.
- **Fix:** Renamed the spy to `manychatSendImage` and pointed the mock at `sendImage` (the actual byte-identical method). Updated the manychat-media assertion to `expect(manychatSendImage).toHaveBeenCalledTimes(1)` and the meta_direct media assertion to `expect(manychatSendImage).not.toHaveBeenCalled()`. The contract intent (manychat path used, Meta path inert) is preserved; Regla 6 byte-identical mandate (a hard CLAUDE.md constraint) takes precedence over the incorrect test method name. The canonical FB `messenger-provider.test.ts` only asserts text parity, confirming media-parity-via-sendMedia was never the established contract.
- **Files modified:** `src/lib/domain/__tests__/messages-instagram.test.ts`
- **Commit:** `25fd1a01`

## Verification

- `messages-instagram.test.ts` 9/9 GREEN (6 meta_direct now passing + 3 manychat parity STILL GREEN — Regla 6 no-regression).
- `messages-provider.test.ts` 5/5 + `messenger-provider.test.ts` 5/5 GREEN (Regla 6 — WA + FB chokepoints unchanged).
- `messenger-window.test.ts` 11/11 GREEN (the reused IG-05 policy helper — D-IG-09, no new IG test).
- instagram_provider read ONCE per send; meta_direct → metaInstagramSender; manychat → byte-identical legacy path; null/unknown → manychat.
- Action-layer IG-05 gate wired at BOTH gate sites; outside-24h → Spanish block; FB/manychat/WA branches byte-identical.

## Acceptance Greps (all PASS)

domain/messages.ts:
- `readInstagramProvider`: 3 (def + text call + media call)
- `instagram_provider`: 5
- `metaInstagramSender`: 5 (import + sendText arm + sendMedia arm + comments)
- `channel === 'instagram'`: 2 (text + media blocks)
- FB + WA arms untouched (diff = additions + 2 comment-line rewords; 88 insertions / 2 deletions)
- `tsc --noEmit`: 0 errors mentioning domain/messages.ts

app/actions/messages.ts:
- `channel === 'instagram'`: 6 (≥2 — the gate arms + apiKey/recipient guards)
- `instagram_provider`: 9 (≥2 — the two .select + the gate ifs + isMetaDirectInstagram)
- `resolveMessengerWindowSend`: 5 (import + 2 FB + 2 IG ≥4)
- `return { error: decision.error }`: 4 (2 FB + 2 IG)
- additive-only: diff deletions = only the two .select, the two `if (!isMetaDirectFacebook)`, two comment lines, two `tag: fbTag` lines (FB/manychat/WA gate logic byte-identical; 53 insertions / 10 deletions)
- `tsc --noEmit`: 0 errors mentioning actions/messages.ts

## TDD Gate Compliance

- RED gate: `82b072fc` (Plan 41-01 — `test(...)` pinning the IG domain meta_direct arm + Regla 6 parity).
- GREEN gate: `25fd1a01` (this plan — `feat(41-04)` domain chokepoint). Task 2 (action-layer gate) is grep-verified + covered by the reused `messenger-window.test.ts` helper (D-IG-09), exercised live in 41-07 (matching the FB precedent which is grep + live-smoke verified, not unit-tested).

## Self-Check: PASSED

- `src/lib/domain/messages.ts` — FOUND (modified).
- `src/app/actions/messages.ts` — FOUND (modified).
- Commit `25fd1a01` — FOUND.
- Commit `2de8266d` — FOUND.

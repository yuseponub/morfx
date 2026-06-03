---
phase: 39-whatsapp-outbound-templates
plan: 02
subsystem: whatsapp-outbound-meta
tags: [tdd, green, meta-cloud-api, send-edge, interactive, read-receipt, regla-6]
requires:
  - "Wave 0 RED scaffolds (39-01) — send.test.ts + meta-whatsapp-sender.test.ts pin the contracts"
provides:
  - "sendWhatsAppMedia / sendWhatsAppInteractive / markWhatsAppRead helpers in meta/api.ts (siblings of text/template)"
  - "metaWhatsappSender — ChannelSender-shaped module taking {accessToken, phoneNumberId}, the domain branch (Plan 04) will import directly"
  - "WA-04 interactive clamps applied at the send edge (≤3 buttons, ≤20 title, ≤10 sections, ≤24 row title)"
affects:
  - src/lib/domain/messages.ts   # Plan 04 calls metaWhatsappSender.send*(creds, ...) from the meta_direct branch
tech-stack:
  added: []   # zero new deps
  patterns:
    - "Thin envelope helpers in meta/api.ts mirror existing sendWhatsAppText/Template style (Bearer via metaRequest)"
    - "Clamp interactive payloads at the sender edge BEFORE send (T-39-05) — mirror 360dialog sendButtonMessage guards"
    - "Creds object {accessToken, phoneNumberId} instead of apiKey string (D-02b)"
    - "Provider sender NOT registered in channel-keyed senders map — imported directly by domain (Regla 6)"
key-files:
  created:
    - src/lib/channels/meta-whatsapp-sender.ts
  modified:
    - src/lib/meta/api.ts
decisions:
  - "sendWhatsAppInteractive is a thin envelope pass-through — the clamp logic lives in metaWhatsappSender so the api helper stays a pure wire mirror (matches plan: 'the clamp logic lives in the sender, Task 2')."
  - "metaWhatsappSender exposes more methods than the test asserts (sendMedia, sendTemplate, sendRead) to give Plan 04's domain branch the full surface it will call — must_haves.truths require media/interactive/read alongside text/template."
metrics:
  duration_minutes: 9
  tasks_completed: 2
  files_created: 1
  files_modified: 1
  tests_green: 6
  completed: 2026-06-03
---

# Phase 39 Plan 02: Meta Send Edge Summary

Built the Meta Cloud API send-edge at the helper level: extended `meta/api.ts` with media/interactive/read-receipt helpers (siblings of the existing text/template helpers) and created `metaWhatsappSender` — the `ChannelSender`-shaped module (taking `{accessToken, phoneNumberId}` creds) the domain provider branch will call in Plan 04. Turned the WA-01/03/07 send contracts and the WA-04 interactive-clamp contracts GREEN, with the 360dialog path byte-identical.

## What Was Built

### Task 1 — meta/api.ts media/interactive/read helpers (commit `f0b77010`)
Three exported helpers added in the exact style of `sendWhatsAppText`/`sendWhatsAppTemplate` (Bearer via `metaRequest`, `/{phoneNumberId}/messages` endpoint, `messaging_product:'whatsapp'` envelope):
- `sendWhatsAppMedia(accessToken, phoneNumberId, to, type, link, caption?, filename?)` — mirrors the 360dialog `sendMediaMessage` gating: `caption` only for image/video/document; `filename` only for document; audio/sticker get neither (Pitfall 4 / §2).
- `sendWhatsAppInteractive(accessToken, phoneNumberId, to, interactive)` — passes a pre-built `interactive` object through the envelope (clamp logic lives in the sender — §4-5).
- `markWhatsAppRead(accessToken, phoneNumberId, wamid)` — `{ messaging_product:'whatsapp', status:'read', message_id: wamid }` (§8, WA-07).

The existing `sendWhatsAppText`/`sendWhatsAppTemplate`/`metaRequest` signatures and bodies were left untouched. The access token is only ever passed to `metaRequest`'s fetch header, never logged (T-39-01).

### Task 2 — metaWhatsappSender module (commit `eb41a664`)
Created `src/lib/channels/meta-whatsapp-sender.ts`, mirroring `whatsapp-sender.ts` structure (same `messages?.[0]?.id` → `ChannelSendResult` unwrap) but taking a `{ accessToken, phoneNumberId }` creds object (D-02b) instead of an `apiKey` string. Methods: `sendText`, `sendImage`, `sendMedia`, `sendTemplate`, `sendButtons`, `sendList`, `sendRead`.

WA-04 clamps applied at the send edge BEFORE the Graph call (T-39-05), mirroring the proven 360dialog `sendButtonMessage` guards:
- buttons: `.slice(0, 3)` + title `.slice(0, 20)`
- list: sections `.slice(0, 10)`, row title `.slice(0, 24)`, menu button label `.slice(0, 20)`

Per the 39-PATTERNS.md KEY DESIGN NOTE and Regla 6: the module is NOT registered in the channel-keyed `senders` map in `registry.ts` (that map is keyed by `ChannelType`, not by provider), and `whatsapp-sender.ts` was not modified — the domain branch imports `metaWhatsappSender` directly.

## Verification

```
pnpm exec vitest run src/lib/meta/__tests__/send.test.ts \
  src/lib/channels/__tests__/meta-whatsapp-sender.test.ts
→ 2 files, 6 tests: 6 passed (0 failed)
```

- `send.test.ts` (WA-01/03/07): 3/3 GREEN — text §1, template §3 wire shapes pinned, `markWhatsAppRead` §8 now resolves.
- `meta-whatsapp-sender.test.ts` (WA-04): 3/3 GREEN — ChannelSender shape (`{accessToken, phoneNumberId}` not apiKey), button clamp (≤3 / ≤20), list clamp (≤10 sections / ≤24 row title).
- `pnpm exec tsc --noEmit` → 0 new errors mentioning `meta/api` or `meta-whatsapp-sender`.
- **Regla 6:** `git diff --stat` (working tree vs HEAD) shows only unrelated pre-existing planning `.md` files dirty — `whatsapp-sender.ts`, `whatsapp/api.ts`, `registry.ts` are UNCHANGED. `grep -c "senders\[" registry.ts` == 1 (unchanged).

### Sibling Wave 0 suites (intentionally still RED — out of scope)
`meta/__tests__/media.test.ts` (7) and `meta/__tests__/templates.test.ts` (9) remain RED — they fail with `ERR_MODULE_NOT_FOUND` for `@/lib/meta/media` and `@/lib/meta/templates`, which are built in Plan 03/06/07. Confirmed these are module-not-found (not assertion regressions caused by this plan's changes to `meta/api.ts`).

## Deviations from Plan

None — plan executed exactly as written. Two design notes (recorded in frontmatter `decisions`) clarify intent already prescribed by the plan: (1) `sendWhatsAppInteractive` is a thin pass-through with clamps in the sender (plan Task 1 says "the clamp logic lives in the sender, Task 2"); (2) `metaWhatsappSender` exposes the full method surface (media/template/read) the `must_haves.truths` require, beyond the 4 methods the tests directly assert.

## Authentication Gates

None. No live credentials, no external services — tests stub `global.fetch` / mock `@/lib/meta/api`. T-39-01 honored: tokens only flow to `metaRequest`, never logged.

## TDD Gate Compliance

This plan is the GREEN half of the Wave 0 RED scaffolds (`type: execute`, not a fresh RED/GREEN cycle). The RED gate was satisfied in 39-01 (`test(39-01)` commits `ad848f56`). This plan's two `feat(39-02)` commits (`f0b77010`, `eb41a664`) are the GREEN gate that turns send.test.ts + meta-whatsapp-sender.test.ts green. No REFACTOR needed.

## Self-Check: PASSED

Created/modified files (all FOUND):
- `src/lib/channels/meta-whatsapp-sender.ts` (created)
- `src/lib/meta/api.ts` (modified — 3 new exports)

Commits (all FOUND in git log):
- `f0b77010` feat(39-02): add Meta media/interactive/read-receipt send helpers
- `eb41a664` feat(39-02): add metaWhatsappSender channel module (WA-04 clamps)

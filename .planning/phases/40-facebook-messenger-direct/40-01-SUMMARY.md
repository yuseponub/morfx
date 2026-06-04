---
phase: 40-facebook-messenger-direct
plan: 01
subsystem: facebook-messenger-direct
tags: [tdd, red-scaffold, meta-messenger, graph-api, regla-6, provider-branch, human-agent]
requires: []
provides:
  - "Six RED test files pinning every Phase 40 Meta Messenger requirement contract (SIGNUP-04, FB-01..04, MIG-02) + D-09 + Regla 6 parity"
  - "Regla 6 first-class parity test (messenger_provider=manychat → ManyChat path byte-identical; resolveByWorkspace/metaFacebookSender NEVER called)"
  - "PSID-as-string contract asserted end-to-end (> Number.MAX_SAFE_INTEGER survives, never Number-coerced)"
  - "D-09 window/tag gate cases (inside-24h RESPONSE / 24h-7d HUMAN_AGENT / 24h-7d-no-feature BLOCK / >7d BLOCK)"
  - "Dead-tag absence guard (CONFIRMED_EVENT_UPDATE/ACCOUNT_UPDATE/POST_PURCHASE_UPDATE only inside negative assertions)"
affects:
  - src/lib/meta/messenger-api.ts            # Plan 02 must satisfy messenger-api.test.ts (send shapes + profile)
  - src/lib/channels/meta-facebook-sender.ts # Plan 02 — ChannelSender-shaped Meta sender (creds object)
  - src/lib/domain/messages.ts               # Plan 04 must satisfy messenger-provider.test.ts (readMessengerProvider + facebook arm)
  - src/lib/messenger/webhook-handler.ts     # Plan 05 — processMessengerWebhook (FB-01/03/04)
  - src/app/actions/meta-onboarding.ts       # Plan 03 — connectFacebookPage (SIGNUP-04)
  - src/lib/messenger/window-gate.ts         # Plan 06 — resolveMessengerWindowSend (D-09)
tech-stack:
  added: []   # zero new deps — vitest + native fetch stubbing only
  patterns:
    - "Stub global fetch to inspect Graph wire shape (real metaRequest captures fetch at module load — mirror Phase 39 send.test.ts)"
    - "Lazy `await import()` of unbuilt modules → clean per-test RED on module-not-found, not a collection crash"
    - "Mock chainable Supabase admin builder to control workspaces.messenger_provider"
    - "Static import of a not-yet-exported action (connectFacebookPage) → undefined binding → RED on call ('is not a function')"
    - "Pure table-driven window-gate helper (resolveMessengerWindowSend) decouples the D-09 policy from the send action for isolated RED coverage"
key-files:
  created:
    - src/lib/meta/__tests__/messenger-api.test.ts
    - src/lib/channels/__tests__/meta-facebook-sender.test.ts
    - src/lib/domain/__tests__/messenger-provider.test.ts
    - src/lib/messenger/__tests__/webhook-handler.test.ts
    - src/app/actions/__tests__/connect-facebook.test.ts
    - src/app/actions/__tests__/messenger-window.test.ts
  modified: []
decisions:
  - "Stub global fetch (not vi.mock metaRequest) for messenger-api.test.ts — the meta helpers capture their fetch ref at module-load, so fetch-stubbing pins the real wire body deterministically (Phase 39 lesson carried forward)."
  - "messenger-provider.test.ts mocks metaFacebookSender + resolveByWorkspace + getChannelSender so the meta_direct arm runs RED on assertion while the manychat parity tests run GREEN against the real (unchanged) facebook arm — the Regla 6 byte-identical guard that Plan 04 must not break."
  - "messenger-window.test.ts targets a FUTURE pure helper `resolveMessengerWindowSend({hoursSinceCustomerMessage, featureGranted})` in `@/lib/messenger/window-gate` rather than driving the whole sendMessage action, so the D-09 policy table is RED in isolation (Plan 06 owns both the helper and its wiring into the meta_direct arm; provider decision stays in the domain per D-10)."
  - "connect-facebook.test.ts imports connectFacebookPage statically from @/app/actions/meta-onboarding (the FUTURE sibling of connectWhatsAppNumber) — undefined export yields a clean RED ('is not a function'), pinning the SIGNUP-04 owner-gate + Page-token-store + per-Page-subscribe + no-provider-flip + token-not-leaked contract."
metrics:
  duration_minutes: 22
  tasks_completed: 3
  files_created: 6
  completed_date: 2026-06-04
---

# Phase 40 Plan 01: Wave 1 RED Test Scaffolds Summary

**One-liner:** Six RED Vitest files pin the entire Meta Messenger surface (send shapes + HUMAN_AGENT tag, provider chokepoint + Regla 6 parity, inbound `object==='page'` PSID create-or-get, connect Page token + subscribe, 24h/7d window gate) BEFORE any implementation — every Phase 40 requirement now has a failing test pinning its contract, PSID stays a string end-to-end, and the dead 2026-04-27 tags are asserted absent.

## What Was Built

This is a `type: tdd` plan whose deliverable is the **six failing tests** (not implementation). Per 40-VALIDATION.md every later-wave implementation task verifies against a test that must already exist; this plan converts all six Wave-0 MISSING references into concrete RED files. No production code was touched.

| Test File | Req(s) | RED reason (turns GREEN in…) |
|-----------|--------|------------------------------|
| `src/lib/meta/__tests__/messenger-api.test.ts` | FB-02 | `@/lib/meta/messenger-api` module-not-found (Plan 02) |
| `src/lib/channels/__tests__/meta-facebook-sender.test.ts` | FB-02 | `@/lib/channels/meta-facebook-sender` module-not-found (Plan 02) |
| `src/lib/domain/__tests__/messenger-provider.test.ts` | MIG-02 + Regla 6 | meta_direct arm absent in `domain/messages.ts` (Plan 04); manychat-parity 2 tests GREEN today |
| `src/lib/messenger/__tests__/webhook-handler.test.ts` | FB-01/03/04 | `@/lib/messenger/webhook-handler` module-not-found (Plan 05) |
| `src/app/actions/__tests__/connect-facebook.test.ts` | SIGNUP-04 | `connectFacebookPage` not exported from meta-onboarding (Plan 03) |
| `src/app/actions/__tests__/messenger-window.test.ts` | D-09 | `@/lib/messenger/window-gate` module-not-found (Plan 06) |

### Contracts pinned

- **FB-02 send shapes** — inside-24h → `{ messaging_type:'RESPONSE', recipient:{id:PSID}, message:{text} }`; outside-24h → `{ messaging_type:'MESSAGE_TAG', tag:'HUMAN_AGENT', ... }`; image → `attachment{type:'image', payload:{url, is_reusable:true}}` with **no caption field** (caption sent as a follow-up text — `metaFacebookSender.sendImage` parity with `manychatFacebookSender`).
- **PSID-as-string** — a value `24178263901234567` (> `Number.MAX_SAFE_INTEGER`) is asserted to survive verbatim on the wire and through the conversation/recipient path; `not.toBe(Number(PSID))` guards against silent coercion (Pitfall 5).
- **Dead tags absent** — `CONFIRMED_EVENT_UPDATE / ACCOUNT_UPDATE / POST_PURCHASE_UPDATE` appear ONLY inside `not.toBe` / `not.toContain` negative assertions; the only tag the surface can emit is `HUMAN_AGENT`.
- **MIG-02 chokepoint + Regla 6 parity (first-class)** — the `manychat` default arm uses `getChannelSender('facebook')` and the test asserts `resolveByWorkspace` + `metaFacebookSender` are **never** called (`not.toHaveBeenCalled` ×3); the `meta_direct` arm asserts `resolveByWorkspace(WS_ID,'facebook')` + `metaFacebookSender.sendText(creds,…)` with a `{ accessToken, pageId }` creds object (NOT `params.apiKey`).
- **FB-01/03/04 inbound** — `processMessengerWebhook(ev, workspaceId, pageId)` creates a conversation `channel:'facebook'`, `externalSubscriberId: PSID`, `phone: fb-${PSID}`; resolves-or-creates the contact strictly by the PSID identity (no phone/email fuzzy search — `phoneSearchSingle` asserted un-called, D-04/D-05); stores via `receiveMessage` with `waMessageId: ev.message.mid`; and **omits any Inngest dispatch** (D-12 human-only).
- **SIGNUP-04 connect** — owner-gate (non-owner/unauth → `{success:false}`, workspaceId session-derived); on success encrypts the Page token → `upsertMetaAccount({channel:'facebook', pageId, accessTokenEncrypted})` → `subscribeMessengerPage(pageToken, pageId)`; **no `workspaces.update` touching `messenger_provider`** (Regla 6); plaintext token never in the result envelope (T-40-01-02).
- **D-09 window gate** — table over `hoursSince ∈ {1,30,100,200}` × `featureGranted ∈ {true,false}` → RESPONSE / HUMAN_AGENT / BLOCK(no feature) / BLOCK(>7d), with a clear Spanish block message.

## RED State (success condition for a TDD RED plan)

Full 6-file run:

```
 Test Files  6 failed (6)
      Tests  20 failed | 2 passed (22)
```

Every RED failure is a **missing-implementation** failure — `ERR_MODULE_NOT_FOUND` (messenger-api, meta-facebook-sender, webhook-handler, window-gate), undefined-export (`connectFacebookPage is not a function`), or an absent provider branch (messenger-provider meta_direct arm) — never a syntax/collection error. The **2 passing** tests are the `manychat` Regla 6 parity guards in `messenger-provider.test.ts`: they hold TODAY because the existing facebook arm already routes through `getChannelSender('facebook')` and never resolves Meta creds — that is precisely the byte-identical guard Plan 04 must not break.

## Deviations from Plan

**None — plan executed exactly as written.** All three tasks created the prescribed files, the verify greps all passed, and each file fails RED on missing implementation as intended.

One in-scope refinement worth recording (not a deviation from the plan text, which explicitly said "Import the FUTURE window-gate helper / the extended `sendTextMessage` action path"): `messenger-window.test.ts` targets a dedicated FUTURE pure helper `resolveMessengerWindowSend` in `@/lib/messenger/window-gate` rather than the `sendMessage` action. This keeps the D-09 policy table RED in isolation and matches the plan's stated preference for a "window-gate helper"; Plan 06 owns both the helper and its wiring into the meta_direct send arm.

## TDD Gate Compliance

This plan is the **RED gate** for the phase-wide feature. It emits three `test(40-01): …` commits (no `feat`/`refactor` — correct for a pure-RED scaffold plan). The GREEN gates live in the dependent plans: Plan 02 (messenger-api + metaFacebookSender), Plan 03 (connect), Plan 04 (provider chokepoint), Plan 05 (webhook handler), Plan 06 (window gate). No test was made to pass by stubbing an implementation; the only GREEN tests are the always-green Regla 6 parity guards.

## Out-of-Scope Observations (NOT touched)

- `src/lib/domain/messages.ts` shows an unrelated working-tree modification (a `SendInteractiveMessageParams` interface) and `src/lib/domain/__tests__/messages-interactive-provider.test.ts` exists — these belong to the **parallel Phase 999.1 (whatsapp-interactive-message-composer)** session, predate this plan, and were correctly left alone (scope boundary). Likewise `src/lib/agents/somnio-v3/ARCHITECTURE.md` (untracked) is unrelated.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | RED messenger-api + metaFacebookSender (FB-02) | `6936bfbe` | messenger-api.test.ts, meta-facebook-sender.test.ts |
| 2 | RED provider chokepoint (MIG-02+Regla 6) + inbound webhook (FB-01/03/04) | `1fc2ad71` | messenger-provider.test.ts, webhook-handler.test.ts |
| 3 | RED connect-facebook (SIGNUP-04) + window gate (D-09) | `a3f5f3bc` | connect-facebook.test.ts, messenger-window.test.ts |

## Self-Check: PASSED

- All 6 created files verified present on disk.
- All 3 commit hashes verified in `git log`.
- `git status --porcelain` for my commits contains only `__tests__/` files — verification gate (no production code modified) PASS.

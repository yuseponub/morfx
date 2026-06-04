---
phase: 40-facebook-messenger-direct
plan: 06
subsystem: messaging
tags: [facebook, messenger, meta_direct, window-gate, human_agent, tdd, regla-6]
requires: [40-00, 40-01, 40-04]
provides: ["facebook 24h/HUMAN_AGENT window gate (meta_direct only)", "pure resolveMessengerWindowSend policy helper"]
affects: [src/app/actions/messages.ts]
tech-stack:
  added: []
  patterns: ["pure-helper-policy (no I/O) for unit-testability", "meta_direct-only gate keeps manychat byte-identical (Regla 6)", "env feature flag META_HUMAN_AGENT_ENABLED gates HUMAN_AGENT tag"]
key-files:
  created: [src/lib/messenger/window-gate.ts]
  modified: [src/app/actions/messages.ts]
decisions:
  - "D-09 window gate lives as a PURE helper in src/lib/messenger/window-gate.ts (test-pinned signature) — the action computes hours + reads the flag and asks the helper for the single send decision"
  - "Gate applies ONLY when channel=facebook AND workspaces.messenger_provider=meta_direct — manychat facebook + instagram + whatsapp paths untouched (Regla 6)"
  - "HUMAN_AGENT tag gated behind META_HUMAN_AGENT_ENABLED env flag (RESEARCH Open Q1) — defaults off → 24h-7d sends BLOCK until the Meta Human Agent App-Review feature is granted"
metrics:
  duration: ~10min
  completed: 2026-06-04
---

# Phase 40 Plan 06: Facebook 24h/HUMAN_AGENT Window Gate (meta_direct) Summary

Window gate for facebook meta_direct sends (D-09): inside 24h → messaging_type RESPONSE (no tag); 24h–7d with the Meta Human Agent feature granted → HUMAN_AGENT tag; otherwise → BLOCK with a clear Spanish message. The decision is a pure helper (`resolveMessengerWindowSend`) so the RED contract unit-tests it in isolation; the messages server action wires it for facebook meta_direct only and passes the resolved tag to the domain send. The manychat facebook path is unaffected (Regla 6).

## What Was Built

**Task 1 (TDD GREEN) — turns `src/app/actions/__tests__/messenger-window.test.ts` GREEN (11/11):**

1. `src/lib/messenger/window-gate.ts` (NEW, pure — no I/O):
   - `resolveMessengerWindowSend({ hoursSinceCustomerMessage, featureGranted }) → MessengerWindowDecision`
   - `< 24h` → `{ messaging_type: 'RESPONSE' }` (no tag)
   - `24h ≤ h < 168h (7d)` AND `featureGranted` → `{ messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' }`
   - `24h ≤ h < 168h` AND `!featureGranted`, OR `h ≥ 168h` → `{ blocked: true, error: 'Ventana de 24h cerrada. Activa el permiso Human Agent o espera a que el cliente escriba.' }`
   - Boundaries `SESSION_WINDOW_HOURS = 24` and `HUMAN_AGENT_WINDOW_HOURS = 7 * 24` (168). The only tag the gate can yield is `HUMAN_AGENT`; the dead tags (CONFIRMED_EVENT_UPDATE/ACCOUNT_UPDATE/POST_PURCHASE_UPDATE, dead since 2026-04-27) are never produced.

2. `src/app/actions/messages.ts` wiring (additive):
   - Import `resolveMessengerWindowSend` from `@/lib/messenger/window-gate`.
   - `sendMessage` + `sendMediaMessage`: the existing `workspaces` settings query now also selects `messenger_provider`.
   - Gate block (in both send paths): `if (channel === 'facebook' && workspaceSettings?.messenger_provider === 'meta_direct')` → compute `hoursSinceCustomerMessage` from `conversation.last_customer_message_at` (`Infinity` when unknown) → `resolveMessengerWindowSend({ hoursSinceCustomerMessage, featureGranted: process.env.META_HUMAN_AGENT_ENABLED === 'true' })` → on `blocked` return `{ error: decision.error }`; else resolve `fbTag` (`HUMAN_AGENT` or `undefined`).
   - The resolved `tag: fbTag` is passed to `domainSendTextMessage` / `domainSendMediaMessage` (the optional `tag?: 'HUMAN_AGENT'` param added in Plan 04). The instagram + whatsapp + manychat-facebook code paths stay byte-identical — `fbTag` is `undefined` for all of them.

## Verification

- `npx vitest run src/app/actions/__tests__/messenger-window.test.ts` → **Test Files 1 passed (1), Tests 11 passed (11)**.
- Acceptance greps on `src/app/actions/messages.ts`: `HUMAN_AGENT`=5, `META_HUMAN_AGENT_ENABLED`=2, `meta_direct`=8 (gate conditioned on it). Block message "Activa el permiso Human Agent" present in `window-gate.ts`. 7-day boundary (`168`/`7 * 24`) present in `window-gate.ts` (5 matches — the pure helper is the correct home for the boundary).
- `npx tsc --noEmit` → 0 errors in `messages.ts` and `window-gate.ts`.
- **Regla 6 gate:** `git diff --stat src/lib/domain/messages.ts src/lib/whatsapp/manychat-sender.ts src/lib/agents/registry.ts` → EMPTY (all three untouched). The whatsapp window check + instagram path in `messages.ts` are unchanged (only the FB meta_direct gate + the `messenger_provider` select column were added).

## TDD Gate Compliance

The RED `test(...)` commit for `messenger-window.test.ts` was produced in Wave 1 (Plan 40-01, commit `a3f5f3bc` — it pins this exact `resolveMessengerWindowSend` contract). This plan supplies the GREEN gate: `feat(40-06)` commit `8301d0c9` (helper + wiring). RED → GREEN sequence satisfied.

## Deviations from Plan

The plan's inline sketch wired the D-09 logic directly inside `messages.ts`. The RED test (the contract) instead pins a PURE helper `resolveMessengerWindowSend` in `@/lib/messenger/window-gate` with signature `{ hoursSinceCustomerMessage, featureGranted } → { messaging_type | blocked }`. Followed the test contract (it IS the spec): created the pure helper and had the action delegate to it. This is stronger than the sketch (the policy is unit-tested in isolation) and keeps the 7-day boundary + Spanish block message in one testable place. Net behavior at the action site is identical to the plan's intent (RESPONSE / HUMAN_AGENT tag / BLOCK). Not a deviation requiring user input.

## Commits

- `8301d0c9` — feat(40-06): GREEN gate ventana 24h/HUMAN_AGENT messenger (meta_direct) — creates `src/lib/messenger/window-gate.ts` + wires the gate into `sendMessage`/`sendMediaMessage`.

## Self-Check: PASSED

- FOUND: src/lib/messenger/window-gate.ts
- FOUND: commit 8301d0c9 (feat(40-06))
- messenger-window.test.ts GREEN 11/11
- domain/messages.ts / manychat-sender.ts / registry.ts diff EMPTY (Regla 6)

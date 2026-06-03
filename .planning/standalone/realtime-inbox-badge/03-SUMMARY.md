---
phase: standalone-realtime-inbox-badge
plan: 03
subsystem: realtime-frontend
tags: [realtime, reconnect, watchdog, hooks, react-query]
requires: [01, 02]
provides:
  - useRealtimeReconnect (shared hook — Capa 2 + Capa 3)
  - inbox/badge re-sync on visibilitychange/online/watchdog
  - chat re-sync on visibilitychange/online/watchdog
affects:
  - src/hooks/use-conversations.ts
  - src/hooks/use-messages.ts
tech-stack:
  added: []
  patterns:
    - per-consumer hook with own listeners + watchdog (not a global registry)
    - ref-to-latest-callback to avoid stale closures / listener churn
    - re-sync on browser/timer events, NOT channel status (closes hole 2d)
key-files:
  created:
    - src/hooks/use-realtime-reconnect.ts
  modified:
    - src/hooks/use-conversations.ts
    - src/hooks/use-messages.ts
decisions:
  - "D-06: nuevo hook compartido use-realtime-reconnect.ts (per-consumer, no global registry)"
  - "D-07: use-conversations registra fetchConversations; use-messages registra softRefetch"
  - "D-08: reconciliacion depende de eventos del navegador/timer, NO de transicion de status del canal"
  - "D-09: watchdog 45s (banda 30-60s) auto-rearmado, solo con tab visible"
  - "D-10: listener contact_tags intacto (grep=1)"
  - "D-14: logs [realtime:*] + 'New message received:' intactos"
metrics:
  completed: 2026-06-03
  tasks: 3
  files: 3
---

# Phase standalone-realtime-inbox-badge Plan 03: Capa 2 + Capa 3 (useRealtimeReconnect) Summary

Shared `useRealtimeReconnect` hook re-syncs both realtime state models on the browser/timer events that actually fire when a Supabase socket dies silently (`visibilitychange`, `online`) plus a 45s staleness watchdog — closing hole 2d, where the existing auto-heal never fires because a silently-dead socket stays `SUBSCRIBED` with no status transition.

## What was built

- **Task 1 (`0c4e9379`)** — New `src/hooks/use-realtime-reconnect.ts`: per-consumer hook that wires `document` `visibilitychange` (fires only when `!document.hidden`, 2b), `window` `online` (2c), and a self-re-arming `setInterval` watchdog at `WATCHDOG_INTERVAL_MS=45_000` (Capa 3, D-09) that skips while `document.hidden`. The re-sync callback is held in a ref (`onResyncRef`) so a new closure each render never re-attaches listeners. All three listeners + the interval are cleaned up on unmount. `enabled` param lets a consumer skip wiring when there is nothing to sync. No socket force-reconnect, no token logging, no import of the supabase client (reconciliation goes through the consumer callback — D-02 best-effort socket + reliable reconciliation).
- **Task 2 (`e3dde79b`)** — `use-conversations.ts`: added the import + a single `useRealtimeReconnect(fetchConversations)` call after the existing `fetchConversationsRef` ref-sync effect. Inbox/badge (`useState` model) now reconciles on the same events. 6 insertions, 0 deletions.
- **Task 3 (`2cd9417d`)** — `use-messages.ts`: added the import + a single `useRealtimeReconnect(softRefetch, !!conversationId)` call (gated on an open chat). Chat (React Query cache) now reconciles on the same events. 7 insertions, 0 deletions.

## Deviations from Plan

None — plan executed exactly as written. All three tasks added only an import + a single hook call (and the new file); no body of any existing function was rewritten.

## Verification

| Check | Expected | Result |
|-------|----------|--------|
| `grep -c "table: 'contact_tags'" use-conversations.ts` (D-10) | 1 | 1 PASS |
| `grep -c "[realtime:inbox]" use-conversations.ts` (D-14) | 4 | 4 PASS |
| `grep -c "[realtime:messages]" use-messages.ts` (D-14) | 3 | 3 PASS |
| `grep -c "New message received:" use-messages.ts` (D-14) | 1 | 1 PASS |
| `grep -c "useRealtimeReconnect(fetchConversations)"` | 1 | 1 PASS |
| `grep -c "useRealtimeReconnect(softRefetch, !!conversationId)"` | 1 | 1 PASS |
| Task 1 hook grep gates (use client / add+remove listeners / setInterval / clearInterval / export) | all 1 | all 1 PASS |
| `npx tsc --noEmit` on the 3 modified files | clean | 0 errors in my files PASS |
| Commit deletion check (`--diff-filter=D`) | none | none PASS |

## Deferred Issues / Out-of-scope

`npx tsc --noEmit` reports pre-existing errors NOT in this plan's files and NOT introduced here — they were present before this plan (Plan 02 SUMMARY shipped at `1d350191` without touching them):
- `.next/dev/types/validator.ts(962,*)` — generated Next.js dev-type noise (route literal parse).
- `src/lib/domain/__tests__/conversations.test.ts`, `messages-provider.test.ts` — test typing (`eqMock` implicit any, missing `source` in `DomainContext`).
- `src/lib/meta/__tests__/media.test.ts`, `send.test.ts` — unused `@ts-expect-error` directives.

Logged here per SCOPE BOUNDARY; not fixed (unrelated files). `pnpm build` was not run to green because these pre-existing test-file errors are unrelated to the change; the production build path does not compile `__tests__`, and the three plan files typecheck clean in isolation.

Also: `src/lib/domain/whatsapp-templates.ts` + two `somnio-v4-rag-generative` SMOKE markdowns are dirty in the working tree from unrelated work — deliberately NOT staged (explicit-path staging only).

## Git hygiene

Stayed on `main`. Staged only the three `files_modified` with explicit paths (never `git add -A`). Not pushed (per execution constraint — Regla 1 push deferred to operator/Plan 04 UAT).

## Live validation

Deferred to Plan 04 MANUAL UAT (scenarios 2 tab-switch + 3 wifi-toggle, with a manager account per D-15). The `[realtime:*]` logs (kept per D-14) confirm hole 2d live.

## Self-Check: PASSED
- `src/hooks/use-realtime-reconnect.ts` — FOUND
- commit `0c4e9379` — FOUND
- commit `e3dde79b` — FOUND
- commit `2cd9417d` — FOUND

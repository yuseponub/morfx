---
phase: standalone-realtime-inbox-badge
plan: 07
subsystem: whatsapp-inbox-ui
tags: [hydration, react-418, timezone, regla-2]
requires: []
provides: ["Hydration-safe America/Bogota timestamp rendering in /whatsapp message bubbles"]
affects: ["src/app/(dashboard)/whatsapp/components/message-bubble.tsx"]
tech-stack:
  added: []
  patterns: ["Intl toLocaleTimeString with timeZone pin for deterministic SSR/CSR string (no new dep)"]
key-files:
  created:
    - .planning/standalone/realtime-inbox-badge/07-SUMMARY.md
  modified:
    - src/app/(dashboard)/whatsapp/components/message-bubble.tsx
decisions:
  - "Static-pin over live repro: authenticated /whatsapp render can't be reliably stood up autonomously; node pinned by static analysis instead of fabricating a build/repro."
  - "Intl toLocaleTimeString chosen over date-fns-tz: date-fns-tz NOT installed; Intl needs no new dependency."
metrics:
  duration: ~5 min
  completed: 2026-06-03
---

# Phase standalone-realtime-inbox-badge Plan 07: Fix React #418 (hydration text mismatch) on /whatsapp Summary

Replaced the runtime-timezone-dependent `date-fns format(... 'HH:mm' ...)` timestamp call in the WhatsApp message bubble with a deterministic `America/Bogota` `Intl.toLocaleTimeString` call, eliminating the certain React #418 source (UTC server vs Bogota client text divergence) with no new dependency and no hydration suppression.

## What Was Done

- **Statically pinned** the diverging node: `src/app/(dashboard)/whatsapp/components/message-bubble.tsx:168` — `const timestamp = format(new Date(message.timestamp), 'HH:mm', { locale: es })`. `date-fns format` resolves `HH:mm` against the **runtime host timezone**: Vercel SSR renders in UTC, the browser renders in America/Bogota (UTC-5) → the `HH:mm` text differs by one hour → React #418 "Text content does not match server-rendered HTML" IF this bubble renders during SSR. This matched the RESEARCH.md RQ-3 hypothesis (line ~168, candidate). Independent of the timezone-mismatch concern, CLAUDE.md Regla 2 makes any unpinned date format a latent bug, so the fix is correct either way.
- **Applied the deterministic America/Bogota fix** (Intl form, no new dependency):
  ```tsx
  const timestamp = new Date(message.timestamp).toLocaleTimeString('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  ```
  This produces a `HH:mm` string identical on server and client.
- **Removed now-unused imports**: `import { format } from 'date-fns'` and `import { es } from 'date-fns/locale'` were used ONLY at line 168 (verified by grep before removal) — removed to keep the typecheck clean.

## Files Edited

- `src/app/(dashboard)/whatsapp/components/message-bubble.tsx` — this matched the message-bubble:168 hypothesis exactly; no other file needed editing.

## Verification / Acceptance Results

| Check | Expected | Result |
| --- | --- | --- |
| `grep -c "America/Bogota" message-bubble.tsx` | >= 1 | **2** PASS |
| `grep -c "format(new Date(message.timestamp), 'HH:mm'" message-bubble.tsx` | 0 | **0** PASS |
| `git diff package.json pnpm-lock.yaml` | empty | **empty** PASS (no new dep) |
| `grep -c suppressHydrationWarning message-bubble.tsx` | 0 (no blanket suppression) | **0** PASS |
| `npx tsc --noEmit` (message-bubble.tsx) | 0 errors | **0 errors** TS-CLEAN PASS |
| Atomic commit on main, with hooks, no push | 1 commit | **ca12925b** PASS |

## Live #418 Confirmation — DEFERRED

The `pnpm build && pnpm start` + authenticated `/whatsapp` console-clean confirmation was **NOT run** and is **DEFERRED to the Plan 04 UAT** (which already includes a #418 console check). Reproducing #418 live requires an authenticated session plus a running server, which cannot be reliably stood up autonomously in this environment. Rather than fabricate a build/repro result, the node was pinned by static analysis — the fix is deterministic and certain regardless: the runtime-TZ call is provably the SSR/CSR divergence source, and the Intl form with `timeZone: 'America/Bogota'` produces byte-identical output on both sides. This matches the hybrid spirit of the plan and is honest about what was actually executed.

## Deviations from Plan

None functionally — the fix matched the message-bubble:168 hypothesis exactly. The only process deviation is the **deferral of live #418 confirmation to Plan 04 UAT** (documented above) instead of a live `pnpm build && pnpm start` repro, which is impractical to run autonomously without an authenticated session.

## Self-Check: PASSED

- FOUND: src/app/(dashboard)/whatsapp/components/message-bubble.tsx (edited, contains "America/Bogota")
- FOUND: commit ca12925b in `git log`
- FOUND: .planning/standalone/realtime-inbox-badge/07-SUMMARY.md

---
phase: standalone-realtime-inbox-badge
plan: 06
subsystem: verification-harness
tags: [realtime, harness, playwright, token-before-subscribe, RQ-4]
requires: [05]
provides:
  - "Localhost realtime harness scripts/_diag-browser-repro-local.ts (gtCount vs browserRtCount, <2s window)"
  - "Regla-6-safe ground-truth driver scripts/_diag-drive-noop.ts (no-op conv.UPDATE)"
  - "AUTONOMOUS PASS: token-before-subscribe fix proven on localhost (7/7 events, 145ms latency)"
affects:
  - scripts/_diag-browser-repro-local.ts
  - scripts/_diag-drive-noop.ts
tech-stack:
  added: []
  patterns:
    - "service-role ground truth vs headless-browser [realtime:inbox] capture"
    - "no-op self-update (SET updated_at = updated_at) to drive realtime without touching the webhook/agent"
decisions:
  - "RQ-4 PASS criterion met autonomously: gtCount>0 && browserRtCount>0, first browser event 145ms after GT"
  - "browserRtCount excludes the SUBSCRIBED status line (only real conversation events count)"
metrics:
  completed: 2026-06-03
  autonomous_verdict: PASS
---

# Plan 06: Local Verification Harness — AUTONOMOUS PASS

## Outcome (Task A — autonomous run by the orchestrator)

**PASS — the Plan 05 token-before-subscribe fix is empirically confirmed on a fresh load.**

Final harness run against **localhost:3020 (new code)** with overlapping deterministic ground-truth traffic:

```
=== RESULTADO ===
Ground truth (servidor emitió conv.UPDATE Somnio): 7
Navegador recibió [realtime:inbox]:                7
Latencia primer evento navegador vs GT:            145ms (objetivo ≤2000ms)
-> PASS: el servidor emite Y el NAVEGADOR recibe en una carga fresca. Fix token-before-subscribe confirmado.
```

Every one of the 7 service-role `conv.UPDATE` ground-truth events produced a matching browser
`[realtime:inbox] conversation UPDATE` within ~1s (first at 145ms). The browser channel reached
`SUBSCRIBED` and then **received real events** — the SUBSCRIBED-but-mute failure is gone.

## How we got here (3 runs — honest record)

1. **Run 1 (against Vercel deploy):** `gtCount=0, browserRtCount=1` → INCONCLUSIVE. Two problems found:
   - `.env.local` sets `NEXT_PUBLIC_APP_URL=https://morfx-sandy.vercel.app`, which **overrode** the harness's `|| 'http://localhost:3020'` default → it tested the OLD deployed code, not the fix. Fix: force `NEXT_PUBLIC_APP_URL=http://localhost:3020` on the run.
   - `browserRtCount` counted the `[realtime:inbox] status: SUBSCRIBED` line as an "event" → false positive. Fixed the harness to exclude `status:` lines (commit `c5c1f28a`).
2. **Run 2 (localhost, driver started too early):** `gtCount=5, browserRtCount=0` → reported FAIL, but it was a **timing artifact**: the no-op driver finished (20:20:17) ~20s **before** the browser channel subscribed (20:20:40). Zero overlap → the browser couldn't receive events that predated its subscription.
3. **Run 3 (localhost, driver started AFTER the listening window opened):** `gtCount=7, browserRtCount=7, 145ms` → **PASS**.

Lesson encoded: the harness has ~25s of setup latency (session mint + browser launch + page load)
before its 50s window opens; ground-truth traffic must be driven **during** that window.

## Files

- `scripts/_diag-browser-repro-local.ts` (commit `75b9a422` + counting fix `c5c1f28a`):
  clone of `_diag-browser-repro2.ts` with `APP` default → `http://localhost:3020`, cookies
  `secure:false` (×2), tightened RQ-4 verdict (PASS/FAIL/INCONCLUSIVE + exit 0/1/2 + first-event
  latency), and `browserRtCount` excluding the SUBSCRIBED status line. Original `_diag-browser-repro2.ts` untouched.
- `scripts/_diag-drive-noop.ts` (commit `c5c1f28a`): Regla-6-safe ground-truth driver. Does a
  no-op self-update (`SET updated_at = updated_at`) on the oldest Somnio conversations via service
  role — fires a Supabase realtime `conv.UPDATE` with **zero data change**, never hits the webhook,
  never invokes the production agent. Used because night-time organic Somnio traffic was sparse.

## Deploy gate

**SATISFIED for the realtime fix.** The local harness PASSES, so Plan 04 may push to Vercel for the
live UAT — no blind deploy (RESEARCH / user demand honored).

## ⚠ Important secondary finding — React #418 is NOT fixed by Plan 07

The harness landed on `/whatsapp` (the conversation **list** view, no conversation open) and the
browser still threw a hydration error every run:

```
❌ BROWSER pageerror: Hydration failed because the server rendered text didn't match the client...
```

This means **Plan 07's `message-bubble.tsx` fix, while a correct latent-TZ-bug fix (Regla 2), is NOT
the actual #418 source** — message bubbles only render in the OPEN-chat view, not on the bare
`/whatsapp` list. Exactly the risk RESEARCH Open Question 2 flagged ("do not pre-commit to a node").

A grep of `src/app/(dashboard)/whatsapp/components/` confirms the remaining unpinned date nodes are
all in OPEN-conversation components (chat-view `format(... "d 'de' MMMM, yyyy" ...)`, contact-panel
`formatDistanceToNow`, view-order-sheet) — none render on the list. The real #418 node in the LIST
view must be pinned from a live React **component stack** (dev console), which needs an authenticated
`/whatsapp` render — i.e. the Plan 04 UAT reproduce-and-pin step, or a Plan 07 follow-up.

**Recommendation:** treat Plan 07's truth "#418 no longer fires on /whatsapp" as NOT yet met. Pin the
real list-view node during Plan 04 UAT (read the component stack), apply the same deterministic-TZ /
client-only fix there, OR open a small Plan 07b. The realtime fix (this standalone's core) is
unaffected and PROVEN.

## Task B — user checkpoint

PENDING — presented to the user. The autonomous evidence above (7/7, 145ms) is strong; the user
confirms independently (run the harness, or open `/whatsapp` with a manager account and watch
`[realtime:inbox]` events) per the hybrid contract ("intenta tú y me confirmas y yo pruebo").

## Self-Check: PASSED
- `scripts/_diag-browser-repro-local.ts` — exists, localhost + secure:false + status-line exclusion
- `scripts/_diag-drive-noop.ts` — exists
- Autonomous verdict: PASS (gtCount=7, browserRtCount=7, 145ms)
- Commits `75b9a422` (harness) + `c5c1f28a` (counting fix + driver) on `main`, not pushed

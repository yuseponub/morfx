---
phase: standalone-realtime-inbox-badge
plan: 06
type: execute
wave: 2
depends_on: [05]
files_modified:
  - scripts/_diag-browser-repro-local.ts
autonomous: false
requirements:
  - RQ-4
user_setup: []

must_haves:
  truths:
    - "On a fresh load of localhost:3020/whatsapp with a manager session, the browser logs >=1 [realtime:inbox] conversation event within <2s of the matching service-role ground-truth conv.UPDATE (gtCount>0 && browserRtCount>0)"
    - "The autonomous attempt runs the harness itself (pnpm dev on 3020 + headless Chromium); if the local env cannot run it, it degrades gracefully to the user-run checkpoint without blocking"
    - "The user independently confirms the PASS criterion (hybrid: autonomous FIRST, user SECOND)"
  artifacts:
    - path: "scripts/_diag-browser-repro-local.ts"
      provides: "Localhost-targeted harness (APP=http://localhost:3020, cookies secure:false) measuring gtCount vs browserRtCount"
      contains: "localhost:3020"
  key_links:
    - from: "scripts/_diag-browser-repro-local.ts"
      to: "service-role conv.UPDATE ground truth + headless [realtime:inbox] capture"
      via: "gtCount vs browserRtCount with <2s first-event window"
      pattern: "browserRtCount"
---

<objective>
Build and run the LOCAL verification harness that proves the Plan 05 fix delivers realtime on a fresh load — BEFORE any Vercel deploy (RESEARCH: no blind deploys; user demand).

HYBRID per user decision ("intenta tú y me confirmas y yo pruebo"):
- Task A (autonomous): the executor adapts `scripts/_diag-browser-repro2.ts` for localhost (new file `scripts/_diag-browser-repro-local.ts`, `APP='http://localhost:3020'`, cookies `secure:false`), brings up `pnpm dev` on port 3020 in the background, runs the headless harness itself, and reports PASS/FAIL against the exact RQ-4 criterion. If the local env can't complete the run (port busy, service-role/env missing, login redirect), it degrades GRACEFULLY to Task B — it must NOT block.
- Task B (checkpoint:human-verify): the user runs `pnpm dev` + the harness (or just loads `/whatsapp` with a manager account) and approves the PASS criterion.

This plan GATES the deploy: only after the harness PASSES (autonomously or via the user) does the live UAT plan push to Vercel.

Purpose: empirically confirm `gtCount>0 && browserRtCount>0` (broken state was `gtCount>0 && browserRtCount===0`).
Output: `scripts/_diag-browser-repro-local.ts` + a PASS/FAIL record.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/realtime-inbox-badge/RESEARCH.md
@.planning/standalone/realtime-inbox-badge/05-SUMMARY.md

<interfaces>
<!-- The original deploy-targeted harness to clone. Adapt ONLY the marked lines for localhost. -->

scripts/_diag-browser-repro2.ts (CURRENT — targets the Vercel https deploy):
- `const APP = (process.env.NEXT_PUBLIC_APP_URL || 'https://morfx-sandy.vercel.app')...`  ← change default to http://localhost:3020
- cookies use `secure: true` (twice: the chunks map + the morfx_workspace cookie) ← change to `secure: false` for http localhost
- mints a manager session via admin.generateLink('magiclink') + verifyOtp (KEEP)
- builds @supabase/ssr cookie chunks via createChunks + stringToBase64URL (KEEP)
- morfx_workspace cookie = WS default 'a3843b3f-c337-4836-92b5-89c58bb98490' (Somnio, manager-visible, high traffic) (KEEP)
- GROUND TRUTH: service-role channel on conversations UPDATE for WS, increments gtCount (KEEP)
- headless Chromium with injected cookies, listens to page console for /\[realtime:inbox\]/i → increments browserRtCount (KEEP)
- WINDOW_MS = 50_000; prints RESULTADO comparing gtCount vs browserRtCount (KEEP, but tighten the verdict — see action)

Runner: `pnpm exec tsx scripts/_diag-browser-repro-local.ts` (repo uses tsx ^4.21.0; package.json script `knowledge:sync` = `tsx scripts/...`). `pnpm dev` = `next dev -p 3020`. pnpm ONLY — never npm (repo is pnpm-only; npm broke pnpm-lock → 4 broken deploys).

Env (RESEARCH Environment Availability — all present in .env.local): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DIAG_EMAIL (default joseromerorincon041100@gmail.com — a manager).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task A: Adapt harness for localhost + attempt an autonomous PASS/FAIL run</name>
  <read_first>
- scripts/_diag-browser-repro2.ts (the script being cloned — full content above; only APP default + the two `secure:` flags change)
- RESEARCH.md "Verification Architecture (RQ-4)" (lines 359-381) — local harness steps + the EXACT PASS criterion
- 05-SUMMARY.md (confirm Plan 05 token-before-subscribe landed in both hooks — the harness validates it)
  </read_first>
  <action>
1. Create `scripts/_diag-browser-repro-local.ts` by copying `scripts/_diag-browser-repro2.ts` VERBATIM, then applying ONLY these localhost adaptations (do NOT mutate the original deploy-targeted file):
   - Default APP to localhost: `const APP = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3020').replace(/['"]/g, '').trim()`.
   - Cookies: set `secure: false` in BOTH places (the `chunks.map(...)` cookie objects AND the `morfx_workspace` cookie) — localhost is http, `secure:true` cookies are dropped over http.
   - Keep EVERYTHING else: the manager-session mint (generateLink magiclink + verifyOtp), `@supabase/ssr` createChunks + stringToBase64URL, `morfx_workspace` = Somnio WS default, `/whatsapp` path, the service-role ground-truth `conv.UPDATE` channel (gtCount), the headless Chromium `[realtime:inbox]` console capture (browserRtCount), the `pageerror` listener.
   - Tighten the verdict block to the EXACT RQ-4 criterion: record the timestamp of the first browser `[realtime:inbox]` event and of its matching ground-truth `conv.UPDATE`; print:
     - `PASS` when `gtCount > 0 && browserRtCount > 0` (fix works — server emits AND browser receives). Print the first-browser-event latency relative to its matching GT event (target ≤2s).
     - `FAIL (still broken)` when `gtCount > 0 && browserRtCount === 0` (server emits, browser mute — the original bug).
     - `INCONCLUSIVE` when `gtCount === 0` (no organic Somnio traffic in the window — retry or drive traffic via scripts/_diag-protocol.ts).
   - Exit code: 0 on PASS, 1 on FAIL, 2 on INCONCLUSIVE — so the autonomous run can branch.
   - NEVER log the access_token anywhere (Security V7).

2. Attempt the autonomous run (degrade gracefully — do NOT block on failure):
   - Start the dev server in the background: `pnpm dev` (next dev -p 3020). Wait until `http://localhost:3020` responds (poll, ~30-60s budget — Next dev cold start).
   - Run the harness: `pnpm exec tsx scripts/_diag-browser-repro-local.ts` (50s window). Optionally, if organic Somnio traffic is sparse and the window returns INCONCLUSIVE, drive deterministic traffic with `scripts/_diag-protocol.ts` (send p1..p6) in a second attempt.
   - Capture the RESULTADO block (gtCount, browserRtCount, verdict, first-event latency).
   - Stop the background dev server when done.
   - If ANY step cannot complete locally (port 3020 busy, SUPABASE_SERVICE_ROLE_KEY missing, `/whatsapp` redirects to login, Chromium launch fails, no network), record "autonomous run could not complete: <reason>" and proceed — Task B (user-run checkpoint) is the fallback. Do NOT fail the plan on an env-only blocker.

3. Record the outcome (PASS / FAIL / INCONCLUSIVE / could-not-run + the reason) for the SUMMARY and for the user checkpoint in Task B.
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && test -f scripts/_diag-browser-repro-local.ts && grep -q "localhost:3020" scripts/_diag-browser-repro-local.ts && echo HARNESS-READY</automated>
  </verify>
  <acceptance_criteria>
- `test -f scripts/_diag-browser-repro-local.ts` succeeds (new file exists; original `_diag-browser-repro2.ts` UNCHANGED — `git status --porcelain scripts/_diag-browser-repro2.ts` empty).
- `grep -c "localhost:3020" scripts/_diag-browser-repro-local.ts` >= 1.
- `grep -c "secure: false" scripts/_diag-browser-repro-local.ts` = 2 (both cookie sites).
- `grep -c "secure: true" scripts/_diag-browser-repro-local.ts` = 0 (no leftover https-only cookies).
- `grep -c "browserRtCount" scripts/_diag-browser-repro-local.ts` >= 1 AND `grep -c "gtCount" scripts/_diag-browser-repro-local.ts` >= 1 (ground-truth-vs-browser comparison preserved).
- SECURITY: `grep -nE "console\.(log|warn|error|info).*access_token" scripts/_diag-browser-repro-local.ts` returns 0 matches.
- An outcome line is recorded: one of PASS (`gtCount>0 && browserRtCount>0`), FAIL (`gtCount>0 && browserRtCount===0`), INCONCLUSIVE (`gtCount===0`), or "could-not-run: <reason>". The plan does NOT block on a could-not-run env blocker.
- No npm used anywhere (pnpm/`pnpm exec tsx` only).
  </acceptance_criteria>
  <done>scripts/_diag-browser-repro-local.ts exists (localhost APP + secure:false), the original repro2 is untouched, and an autonomous PASS/FAIL/INCONCLUSIVE/could-not-run outcome is recorded for the user checkpoint.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
A localhost-targeted realtime harness `scripts/_diag-browser-repro-local.ts` (clone of the deploy harness with `APP=http://localhost:3020` + `secure:false` cookies) that compares service-role ground-truth `conv.UPDATE` events against what a headless browser with an injected MANAGER session actually receives as `[realtime:inbox]` logs — proving the Plan 05 token-before-subscribe fix.

The executor already ATTEMPTED an autonomous run (Task A) and recorded the outcome above (PASS / FAIL / INCONCLUSIVE / could-not-run + reason). Now it's your turn to confirm.
  </what-built>
  <how-to-verify>
Run it yourself (pnpm ONLY — never npm; repo is pnpm-only):

  1. In one terminal: `pnpm dev`  (starts Next on http://localhost:3020).
  2. In another terminal, once the server is up: `pnpm exec tsx scripts/_diag-browser-repro-local.ts`
     - It mints a MANAGER session (D-15), injects it into headless Chromium, loads `localhost:3020/whatsapp`, and listens ~50s.
     - Somnio (`a3843b3f-...`) has continuous organic traffic — you don't need to do anything. (Optionally drive p1..p6 via `scripts/_diag-protocol.ts` if the window is quiet.)
  3. Read the RESULTADO block.

  PASS criterion (exact, RQ-4): on a FRESH load, the browser logs >=1 `[realtime:inbox] conversation <eventType>` within <2s of the matching service-role ground-truth `conv.UPDATE` — i.e. `gtCount > 0 && browserRtCount > 0`. The broken state is `gtCount > 0 && browserRtCount === 0`.

  Optional manual cross-check: open `http://localhost:3020/whatsapp` in your own browser with a manager account, open DevTools console, and confirm `[realtime:inbox]` lines appear as conversations change (badge/preview update without a reload).

If FAIL (browserRtCount===0 while gtCount>0): the token is still not on the socket at first join — report the console output (was there a `[realtime:inbox] status: SUBSCRIBED` followed by zero events?) so Plan 05 can be revisited before any deploy.
  </how-to-verify>
  <resume-signal>Type "approved" if the harness shows gtCount>0 && browserRtCount>0 (or you confirmed [realtime:inbox] events on a fresh /whatsapp load with a manager account). Otherwise paste the RESULTADO block + console output around the failure.</resume-signal>
</task>

</tasks>

<verification>
- `scripts/_diag-browser-repro-local.ts` exists with `localhost:3020` + `secure:false` (×2) and the original `_diag-browser-repro2.ts` is untouched.
- An autonomous outcome is recorded; the user checkpoint confirms PASS (`gtCount>0 && browserRtCount>0`) or surfaces a FAIL for Plan 05 revisit.
- No Vercel push in this plan — the deploy is gated on this PASS and happens in the live-UAT plan.
- pnpm-only throughout.
</verification>

<success_criteria>
- The token-before-subscribe fix is PROVEN locally: server emits AND the browser receives on a fresh load (`gtCount>0 && browserRtCount>0`), first browser event ≤2s after its GT match.
- Hybrid honored: autonomous attempt FIRST, user confirmation SECOND, graceful degradation if the local env can't run it.
- Deploy gate satisfied — the live UAT plan may now push to Vercel.
</success_criteria>

<output>
After approval, create `.planning/standalone/realtime-inbox-badge/06-SUMMARY.md` recording: the harness file + its localhost adaptations, the autonomous run outcome (gtCount/browserRtCount/verdict/latency or could-not-run reason), and the user-confirmation result. State explicitly that the deploy gate is now satisfied (or not, with the FAIL evidence).
</output>

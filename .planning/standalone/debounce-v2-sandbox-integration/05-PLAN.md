---
phase: standalone-debounce-v2-sandbox-integration
plan: 05
type: execute
wave: 4
depends_on: [01, 02, 03, 04]
files_modified:
  - .planning/standalone/debounce-v2-sandbox-integration/LEARNINGS.md
  - .planning/standalone/debounce-v2-sandbox-integration/SUMMARY.md
  - .planning/standalone/debounce-v2-sandbox-integration/SMOKE-RESULTS.md
autonomous: false
requirements:
  - D-08  # Interruption tab in /sandbox shows real events — verified by manual smoke S1/S2/S3
  - D-11  # Cron sweep tolerated (option c) — documented in LEARNINGS as known edge case
  - D-14  # Manual smoke S1 (happy) + S2 (Path A combo) + S3 (Path B solo)

must_haves:
  truths:
    - "NEW file `.planning/standalone/debounce-v2-sandbox-integration/SMOKE-RESULTS.md` documents the THREE manual smoke scenarios S1, S2, S3 executed by the user in /sandbox with agentId='somnio-sales-v4' selected; each scenario has a PASS or FAIL verdict + screenshot/log evidence + Interruption tab event timeline."
    - "NEW file `.planning/standalone/debounce-v2-sandbox-integration/LEARNINGS.md` captures the standalone's reusable patterns, gotchas, and decisions for future standalones (mirrors sibling debounce-v2-interrupt-reprocess/LEARNINGS.md pattern)."
    - "NEW file `.planning/standalone/debounce-v2-sandbox-integration/SUMMARY.md` is the standalone close-out summary covering: what shipped, plans count, files touched, LOC delta, decisions honored (D-01..D-15), pitfalls avoided, current v4 dormant status, activation path."
    - "S1 happy path PASS criteria: send 'hola' in /sandbox with v4 selected → bot responds → Interruption tab toggled on → tab shows at least ONE row for `lock_acquired` AND ONE row for `lock_released_normal` (the conversation_id filter matches sandboxLockSessionId). No restart events."
    - "S2 Path A combo PASS criteria: send msg1 'hola', within <500ms send msg2 'tienes promos?' → bot eventually replies ONCE with a combined response covering both → Interruption tab shows: `lock_acquired` (msg1), `lock_acquire_failed_follower` + `interrupt_written` (msg2), at least one `msg_aborted_path_a_combined` + `pending_list_combined` with `restart_iteration: 1` (from CKPT-0 or agent-discriminator catching the interrupt + draining pending), `lock_released_normal`. UI must show the FOLLOWER request was deferred (deferred indicator shown briefly) and then resolved with the combined response from the long-poll."
    - "S3 Path B solo PASS criteria: send msg1 'hola' → bot starts sending template stream → after the FIRST template appears in chat but BEFORE the second arrives, send msg2 'espera, ya pensé' → the first template stays visible, the second is aborted, and msg2 is processed as an independent new turn (with its own `lock_acquired` event for a NEW lock acquisition). Interruption tab shows: msg1's `lock_acquired` + `msg_aborted_path_b_solo` (CKPT-7.N at i=1 caught the interrupt) + `lock_released_normal`, then msg2's separate `lock_acquired` + `lock_released_normal`."
    - "Each smoke scenario in SMOKE-RESULTS.md includes: (a) Exact UI steps performed, (b) bot's actual text responses, (c) Interruption tab event timeline (list of `label: timestamp_iso` pairs), (d) PASS or FAIL verdict, (e) deviations from expected behavior (if any) + root-cause hypothesis."
    - "If any smoke FAILS: LEARNINGS.md documents the failure mode and a follow-up task list (cannot mark standalone shipped if S1 fails; S2/S3 partial failures can ship with documented known issues + un-defer checklist)."
    - "SUMMARY.md cross-references: parent standalone `debounce-interruption-system-v2/SUMMARY.md` + sibling `debounce-v2-interrupt-reprocess/SUMMARY.md` (both shipped 2026-05-26)."
    - "After Task 5.5 (atomic SUMMARY commit) is committed, the standalone directory is considered SHIPPED. Future un-defer items (e.g., D-19 Phase 3 real WhatsApp smoke during v4 activation-time) reference this SUMMARY's closing state."
    - "BLOCKER 3 atomic-commit split: Task 5.4 commits ONLY SMOKE-RESULTS.md (+ screenshots if any); Task 5.5 commits LEARNINGS.md + SUMMARY.md (+ optional STATUS.md updates). The two commits are INDEPENDENT and REVERSIBLE — reverting Task 5.5's commit leaves SMOKE-RESULTS.md in repo; reverting Task 5.4's commit leaves LEARNINGS+SUMMARY without smoke evidence (would re-block the standalone from being SHIPPED until re-recorded)."
  artifacts:
    - path: ".planning/standalone/debounce-v2-sandbox-integration/SMOKE-RESULTS.md"
      provides: "Manual smoke S1/S2/S3 execution log + event timelines + PASS/FAIL verdicts"
      contains: "S1\\|S2\\|S3"
    - path: ".planning/standalone/debounce-v2-sandbox-integration/LEARNINGS.md"
      provides: "Reusable patterns + gotchas from this standalone for future ones"
      contains: "Reusable patterns"
    - path: ".planning/standalone/debounce-v2-sandbox-integration/SUMMARY.md"
      provides: "Standalone close-out — what shipped, plans, decisions honored, v4 dormant status, activation path"
      contains: "SHIPPED"
  key_links:
    - from: ".planning/standalone/debounce-v2-sandbox-integration/SMOKE-RESULTS.md"
      to: "src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx (UI being smoke-tested)"
      via: "documents the events that appear in the Interruption tab per scenario"
      pattern: "Interruption tab"
    - from: ".planning/standalone/debounce-v2-sandbox-integration/SUMMARY.md"
      to: ".planning/standalone/debounce-interruption-system-v2/SUMMARY.md (parent)"
      via: "Closes D-19 Phase 4 from parent (sandbox visual smoke)"
      pattern: "D-19 Phase 4"
    - from: ".planning/standalone/debounce-v2-sandbox-integration/SUMMARY.md"
      to: ".planning/standalone/debounce-v2-interrupt-reprocess/SUMMARY.md (sibling)"
      via: "Documents that restart-loop semantics from this sibling are mirrored in SomnioV4Engine"
      pattern: "restart-loop"
---

<objective>
Wave 4 — Close the standalone with documentation + manual smoke evidence. No code touched in this plan. The user (operator) runs S1/S2/S3 in /sandbox, the executor (Claude) documents the results, captures reusable LEARNINGS, and writes the SUMMARY.

This plan has CHECKPOINTS: the manual smoke scenarios require human-in-the-loop action (open browser, click /sandbox, send messages, observe Interruption tab). Claude prepares the documentation scaffold + records each scenario's outcome based on user's verbal/screenshot report.

Per BLOCKER 3, the doc artifacts are split across TWO atomic commits: Task 5.4 commits SMOKE-RESULTS.md (+ screenshots); Task 5.5 commits LEARNINGS.md + SUMMARY.md. Both commits are independent + reversible.

Output: 3 NEW markdown files in `.planning/standalone/debounce-v2-sandbox-integration/`. Plus all atomic commits + final push to Vercel for any pending changes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/standalone/debounce-v2-sandbox-integration/DISCUSSION-LOG.md
@.planning/standalone/debounce-v2-sandbox-integration/RESEARCH.md
@.planning/standalone/debounce-v2-sandbox-integration/01-SUMMARY.md
@.planning/standalone/debounce-v2-sandbox-integration/02-SUMMARY.md
@.planning/standalone/debounce-v2-sandbox-integration/03-SUMMARY.md
@.planning/standalone/debounce-v2-sandbox-integration/04-SUMMARY.md
@.planning/standalone/debounce-v2-interrupt-reprocess/SUMMARY.md
@.planning/standalone/debounce-interruption-system-v2/SUMMARY.md
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 5.1: Pre-smoke deployment + prerequisites check</name>
  <read_first>
    - All four prior summaries (01-SUMMARY.md, 02-SUMMARY.md, 03-SUMMARY.md, 04-SUMMARY.md) to confirm prior plans landed cleanly
  </read_first>
  <action>
    1. Verify all 4 prior plans landed:
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       ls .planning/standalone/debounce-v2-sandbox-integration/*-SUMMARY.md
       # Expected: 01-SUMMARY.md, 02-SUMMARY.md, 03-SUMMARY.md, 04-SUMMARY.md present.
       ```

    2. Verify git state — all prior plans committed + pushed:
       ```bash
       git log --oneline -20 | head -20
       git status
       # Expected: clean working tree (or only this Plan 05 file changes); no unpushed commits.
       ```

    3. If anything is uncommitted from prior plans, push first:
       ```bash
       git push origin HEAD:main
       ```

    4. Verify the dev server can be started locally (smoke runs against `localhost:3020`):
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       # Background-start the dev server if not running.
       # User opens http://localhost:3020/sandbox for manual smoke.
       # Alternative: smoke against Vercel preview URL deployed from latest push.
       ```

    5. Confirm prerequisites for smoke:
       - User logged into `/sandbox`
       - v4 agent visible in dropdown (`agentRegistry` includes 'somnio-sales-v4')
       - Debug Panel → Interruption tab toggle is available
       - Workspace selected: any test workspace (sandbox uses workspace_id ?? 'sandbox-workspace')
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && ls .planning/standalone/debounce-v2-sandbox-integration/*-SUMMARY.md 2>&1 | grep -cE "01-SUMMARY|02-SUMMARY|03-SUMMARY|04-SUMMARY"</automated>
  </verify>
  <acceptance_criteria>
    - All 4 prior `*-SUMMARY.md` files exist in `.planning/standalone/debounce-v2-sandbox-integration/`.
    - `git status` is clean (no uncommitted changes from prior plans).
    - User confirms dev server (or Vercel preview) is accessible.
  </acceptance_criteria>
  <done>Prerequisites verified; ready for smoke.</done>
  <atomic_commit>(none — verification only, no file changes)</atomic_commit>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 5.2: Execute manual smoke S1 (Happy path)</name>
  <what-built>
    Plans 01-04 wired the interruption-system-v2 lock + 8 checkpoints + collector + Interruption tab into the /sandbox v4 path. Plan 05 verifies behavior in the actual browser UI.
  </what-built>
  <how-to-verify>
    **S1: Happy path (1 message, no interrupt).**

    1. Open `http://localhost:3020/sandbox` (or Vercel preview URL).
    2. From the agent dropdown, select `somnio-sales-v4`.
    3. In the Debug Panel right-side area, click the gear/settings icon (or the tab-toggle area) and enable the `Interruption` tab.
    4. In the chat input, type `hola` and press Enter.
    5. Wait for the bot to respond (~3-10 seconds depending on Gemini latency).
    6. Click the `Interruption` tab in the Debug Panel.

    **Expected result (PASS criteria):**

    - The chat shows a bot response (any v4 reply text).
    - The Interruption tab event timeline shows AT LEAST these labels in order:
      - `lock_acquired`
      - (possibly checkpoint-progress events — depends on collector implementation)
      - `lock_released_normal`
    - The timeline shows ZERO restart events (`msg_aborted_path_a_combined`, `pending_list_combined` with `restart_iteration` should NOT appear).
    - The timeline shows ZERO follower events (`lock_acquire_failed_follower`, `interrupt_written` should NOT appear).

    **Failure modes to watch for:**

    - Interruption tab shows "no events" or "placeholder" → sandboxSessionId is not being threaded correctly OR collector is not being wrapped (Pitfall 3 in RESEARCH).
    - HTTP 500 in browser network tab → engine error; check terminal logs.
    - HTTP 400 "sandboxSessionId required" → UI is not sending the new body field (Plan 02 Task 2.3 incomplete).
    - Bot responds but events tab is empty → Pitfall 3 (collector wrap missing).

    **Capture for SMOKE-RESULTS.md (Task 5.4):**

    - Screenshot of the Interruption tab event timeline.
    - Browser DevTools Network tab showing the POST to /api/sandbox/process (status 200).
    - Bot's actual response text.
    - Verdict: PASS or FAIL with notes.
  </how-to-verify>
  <resume-signal>Type "S1 PASS" or "S1 FAIL: {details}" or paste a screenshot/log.</resume-signal>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 5.3: Execute manual smoke S2 (Path A combo) — with timing-fallback substitution (WARNING 4)</name>
  <what-built>
    Restart-loop semantics from Plan 01 (mirrors sibling `debounce-v2-interrupt-reprocess` shipped 2026-05-26) + HOLDER/FOLLOWER discrimination from Plan 02.
  </what-built>
  <how-to-verify>
    **S2: Path A combo (msg1 + msg2 fast — same lock, drained + combined).**

    ## Primary attempt: human-typed msg2 within ~1s of msg1 send

    1. In the same `/sandbox` tab (same `sandboxLockSessionId` — opening a NEW tab would generate a different id and isolate the two locks per D-09).
    2. From the chat input, type `hola` and press Enter.
    3. **Within ~1s** (before the bot responds), type `tienes promos?` and press Enter again.
    4. Wait for the bot to respond.
    5. Check the Interruption tab event timeline.

    ## Fallback A (timing too tight — debug-toggle artificial delay)

    If human-typed timing is unreliable (you cannot reliably hit msg2 before msg1 begins processing because Gemini Flash is fast or you can't type that quickly), introduce a temporary artificial delay in the engine for THIS SMOKE SESSION ONLY:

    1. Open `src/lib/agents/somnio-v4/engine-v4.ts`.
    2. Add `await new Promise(r => setTimeout(r, 3000))` between `acquireLock` (no — that's in the route; it's `startHeartbeat`) and the CKPT-0 invocation INSIDE the engine. Specifically: insert immediately after `startHeartbeat(input.lockHandle)` and before the `while (shouldRestart)` block opens:
       ```typescript
       // TEMPORARY S2 SMOKE — REVERT BEFORE COMMIT (WARNING 4 fallback).
       await new Promise(r => setTimeout(r, 3000))
       ```
    3. Save (no commit; dev server hot-reloads in <1s).
    4. Repeat steps 1-5 above. Now msg2 has a comfortable 3s window before CKPT-0 runs.
    5. **CRITICAL: revert the line BEFORE committing anything to git.** Use git stash/checkout to undo the edit. Verify with:
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       grep -c "setTimeout(r, 3000)" src/lib/agents/somnio-v4/engine-v4.ts
       # MUST be 0 after smoke completes.
       ```

    ## Fallback B (stage msg2 via curl/Postman concurrent with msg1)

    Alternative to Fallback A: keep the engine untouched and stage msg2 via curl/Postman ~100ms after the browser msg1 POST starts:

    1. From the `/sandbox` browser tab, send msg1 'hola' normally.
    2. IMMEDIATELY after pressing Enter, in a separate terminal run:
       ```bash
       curl -X POST http://localhost:3020/api/sandbox/process \
         -H 'Content-Type: application/json' \
         -H 'Cookie: <copy from browser DevTools — auth cookie>' \
         -d '{
           "message": "tienes promos?",
           "state": {<copy from prior state snapshot>},
           "history": [],
           "turnNumber": 2,
           "agentId": "somnio-sales-v4",
           "sandboxSessionId": "<copy from browser DevTools — sandboxLockSessionId from prior POST body>"
         }'
       ```
    3. The curl response should be `{ success: true, deferred: true, ... }` (FOLLOWER path).
    4. Wait for the browser msg1's response — it should be a combined reply.

    ## Expected result (PASS criteria)

    - The chat eventually shows ONE bot response that addresses BOTH messages (combined). The exact wording depends on v4 agent behavior, but the response should cover both intents (greeting + promo inquiry) rather than only one.
    - The Interruption tab event timeline shows (order may vary slightly):
      - `lock_acquired` (msg1 became HOLDER)
      - `lock_acquire_failed_follower` (msg2 tried to acquire, got null → FOLLOWER)
      - `interrupt_written` (msg2 wrote interrupt key)
      - `msg_aborted_path_a_combined` with `restart_iteration: 1` (msg1's HOLDER caught the interrupt at some CKPT — likely CKPT-0 if msg2 arrived before agent comprehension started, OR sub-loop CKPT-3/4/5 surfacing as agent-discriminator if msg2 arrived during/after the agent's Gemini call)
      - `pending_list_combined` with `restart_iteration: 1`
      - `lock_released_normal`
    - The msg2 client request: in DevTools Network, msg2's POST returned `{ success: true, deferred: true, sandboxSessionId, reason: 'follower_appended_to_pending', pendingListLength: 1 }` HTTP 200.
    - The msg2 client UI: showed the "FOLLOWER deferred" loading indicator briefly, then resolved to the combined response (long-polled `/api/sandbox/lock-result/{id}` and received the HOLDER's result).

    ## Failure modes to watch for

    - Both messages get TWO separate responses (no combining) → restart-loop not firing; CKPT-0 not catching the interrupt.
    - msg2's HTTP response is 200 with the v4 result (not deferred) → both messages somehow got into separate locks (lock-key shape bug) OR msg1 finished before msg2 arrived (test timing failure — retry with Fallback A or B).
    - Long-poll times out (after 30s) → HOLDER didn't write `sandbox-result:{id}` Redis key (Pitfall 5).
    - Bot mute (no response at all) → restart-loop has a bug where it silently exits without returning (the "invariant violation" Plan 01 throw).

    ## Capture for SMOKE-RESULTS.md (Task 5.4)

    - Screenshot of Interruption tab showing both msg1 + msg2 events interleaved.
    - DevTools Network tab showing msg2's `deferred: true` response + the subsequent `/lock-result/{id}` long-poll.
    - **Substitution method used:** Document whether the smoke ran with (Primary / Fallback A / Fallback B). Future maintainers reading SMOKE-RESULTS.md MUST know which method produced the captured timeline so they can re-verify in equivalent conditions.
    - Verdict: PASS or FAIL with notes.
  </how-to-verify>
  <resume-signal>Type "S2 PASS via Primary" or "S2 PASS via Fallback A" or "S2 PASS via Fallback B" or "S2 FAIL: {details}" or paste a screenshot/log. If Fallback A used, confirm the `setTimeout(r, 3000)` line was REVERTED before answering.</resume-signal>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 5.4: Execute manual smoke S3 (Path B solo) + commit SMOKE-RESULTS.md (atomic commit #1 per BLOCKER 3)</name>
  <what-built>
    CKPT-7.N synthetic per-template gate from Plan 01 Step G (mirrors V4MessagingAdapter.shouldAbortBeforeTemplate per-template behavior).
  </what-built>
  <how-to-verify>
    **S3: Path B solo (msg1 + msg2 AFTER bot sent ≥1 template — msg2 NOT combined, processed as new turn).**

    ## Smoke steps

    1. Open `/sandbox` (same tab as S1/S2 OR a fresh tab — both work; if fresh, the sandboxLockSessionId regenerates).
    2. Open Config tab in Debug Panel; raise the response delay slider to maximum (slows per-template delay; gives a window between template_0 and template_1).
    3. Type `hola` and press Enter.
    4. Watch the chat — after the FIRST bot template appears (e.g., the greeting) but BEFORE the SECOND template arrives (e.g., a price list or follow-up), type `espera, ya pensé` and press Enter.
    5. Observe what happens to the second template, the bot's response to msg2, and the Interruption tab.

    ## Expected result (PASS criteria)

    - The FIRST template stays visible in chat (already sent — Path B).
    - The SECOND template does NOT arrive (aborted at CKPT-7.N i=1).
    - msg2 is processed as an INDEPENDENT new turn — the bot eventually responds to "espera, ya pensé" with its own reply.
    - The Interruption tab event timeline shows:
      - msg1 turn: `lock_acquired` → `msg_aborted_path_b_solo` (CKPT-7.N caught the interrupt at i=1 — `at_step: 'ckpt_7_pre_template_1'`) → `lock_released_normal`
      - msg2 turn: NEW `lock_acquired` (separate from msg1's lock_acquired; different `holder_uuid`) → … → `lock_released_normal`
    - NO `restart_iteration` field in any payload (D-05 — CKPT-7.N is post-send, no restart).
    - NO `msg_aborted_path_a_combined` event in msg1's segment (because Path B fires at i=1, not i=0).

    ## Failure modes

    - msg2 gets combined with msg1's leftover templates → CKPT-7.N is incorrectly restarting (should not — D-05 violation).
    - msg2 gets deferred (FOLLOWER response) → msg1's HOLDER didn't release the lock before msg2's acquire attempt; check release-in-finally code path.
    - Bot sends the second template anyway → CKPT-7.N gate not firing; check Plan 01 Step G synthetic loop.

    ## Capture for SMOKE-RESULTS.md

    - Screenshot showing only first template + msg2's independent response.
    - Interruption tab event timeline showing both turns' lock acquire/release.
    - Verdict: PASS or FAIL or N/A (v4 single-template turns — see note below).

    **Timing note:** If the v4 agent only returns 1 template per turn (e.g., a simple greeting), S3 cannot be tested as-is because there is no "second template" to abort. In that case, mark S3 as N/A and document the v4 agent's per-turn template count behavior in SMOKE-RESULTS.md — S3 will become testable when v4 turns include multi-template responses (e.g., a price list flow).

    ## After smoke: write SMOKE-RESULTS.md + commit (atomic commit #1 per BLOCKER 3)

    After S1 (from Task 5.2 resume signal), S2 (from Task 5.3 resume signal), and S3 (above) are all complete:

    1. Create `.planning/standalone/debounce-v2-sandbox-integration/SMOKE-RESULTS.md`:

       ```markdown
       # SMOKE-RESULTS — debounce-v2-sandbox-integration

       **Date:** {YYYY-MM-DD}
       **Tester:** {user}
       **Environment:** {localhost:3020 | Vercel preview {url}}
       **Build:** {git short SHA at smoke time}

       ---

       ## S1: Happy path (1 msg, no interrupt)

       **Steps:** {1..6 per Task 5.2}
       **Bot response text:** > {actual text}
       **Interruption tab event timeline:**
       - `lock_acquired` at {timestamp_iso}
       - `lock_released_normal` at {timestamp_iso}
       - (additional events observed)

       **Verdict:** PASS | FAIL
       **Notes:** {deviations, observations}

       ---

       ## S2: Path A combo (msg1 + msg2 fast)

       **Steps:** {Primary / Fallback A / Fallback B per Task 5.3}
       **Substitution method:** {Primary | Fallback A (setTimeout 3000ms, reverted post-smoke) | Fallback B (curl staged msg2)}
       **Bot response text:** > {actual combined response}
       **msg1 (HOLDER) DevTools response:** {200, v4 result shape}
       **msg2 (FOLLOWER) DevTools response:** {200, deferred=true shape}
       **msg2 long-poll response (/api/sandbox/lock-result/{id}):** {ready: true, result: {...}}

       **Interruption tab event timeline:**
       - {chronological event list with restart_iteration values}

       **Verdict:** PASS | FAIL
       **Notes:** {restart_iteration values observed, at_step values, deviations}

       ---

       ## S3: Path B solo (msg1 templates sent, msg2 mid-stream)

       **Steps:** {1..5 above}
       **Bot response text (msg1):** {first template text}
       **Templates aborted (post-CKPT-7.N i=1):** {indicator if visible}
       **Bot response text (msg2, separate turn):** {actual reply}
       **Interruption tab event timeline:**
       - {chronological event list spanning both turns}

       **Verdict:** PASS | FAIL | N/A (v4 single-template turns)
       **Notes:** {observations}

       ---

       ## Overall verdict

       **S1:** {PASS/FAIL}
       **S2:** {PASS/FAIL} via {Primary/Fallback A/Fallback B}
       **S3:** {PASS/FAIL/N/A}

       **Standalone status:** {SHIPPED | SHIPPED with known issues | BLOCKED}

       ## Follow-ups identified

       - {any issues that need future work}
       ```

       Fill the placeholders with actual smoke outcomes.

    2. (Optional) Drop screenshots into the same directory under `.planning/standalone/debounce-v2-sandbox-integration/smoke-evidence/` (mkdir if needed). The atomic commit will include them.

    3. **Atomic commit #1 — smoke evidence only** (BLOCKER 3 split):
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       git add .planning/standalone/debounce-v2-sandbox-integration/SMOKE-RESULTS.md
       # If screenshots:
       git add .planning/standalone/debounce-v2-sandbox-integration/smoke-evidence/ 2>/dev/null || true
       git commit -m "$(cat <<'EOF'
       docs(debounce-v2-sandbox-integration): record smoke S1/S2/S3 results

       Manual smoke S1 (happy) / S2 (Path A combo) / S3 (Path B solo) executed
       in /sandbox per D-14. Verdicts + Interruption tab event timelines
       captured. S2 substitution method (Primary / Fallback A / Fallback B)
       documented per WARNING 4.

       Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
       EOF
       )"
       ```

       This commit is INDEPENDENT of Task 5.5's LEARNINGS+SUMMARY commit. Reverting this commit removes SMOKE-RESULTS.md but leaves LEARNINGS+SUMMARY (if Task 5.5 already ran) — which is intentional: it forces re-recording smoke evidence before the standalone can re-claim "SHIPPED" status.

    4. **Push (Regla 1):**
       ```bash
       git push origin HEAD:main
       ```

    **Verify atomic commit #1:**
    ```bash
    cd /mnt/c/Users/Usuario/Proyectos/morfx-new
    git log --oneline -1
    # Expected: most recent commit is "docs(debounce-v2-sandbox-integration): record smoke S1/S2/S3 results"
    git diff HEAD~1 HEAD --stat
    # Expected: SMOKE-RESULTS.md + (optionally) smoke-evidence/* — NO LEARNINGS.md, NO SUMMARY.md
    ```
  </how-to-verify>
  <resume-signal>Type "S3 PASS" or "S3 FAIL: {details}" or "S3 N/A: v4 single-template turns" + confirm SMOKE-RESULTS.md committed (atomic commit #1) — paste `git log --oneline -1` output.</resume-signal>
</task>

<task type="auto" tdd="false">
  <name>Task 5.5: Write LEARNINGS.md + SUMMARY.md + commit (atomic commit #2 per BLOCKER 3)</name>
  <read_first>
    - Resume signals captured from Tasks 5.2, 5.3, 5.4 (S1/S2/S3 PASS/FAIL verdicts + details)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-v2-sandbox-integration/SMOKE-RESULTS.md (committed by Task 5.4)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-v2-sandbox-integration/01-SUMMARY.md
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-v2-sandbox-integration/02-SUMMARY.md
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-v2-sandbox-integration/03-SUMMARY.md
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-v2-sandbox-integration/04-SUMMARY.md
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-v2-interrupt-reprocess/LEARNINGS.md (template — mirror this structure)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-v2-interrupt-reprocess/SUMMARY.md (template — mirror this structure)
  </read_first>
  <action>
    BLOCKER 3 split: SMOKE-RESULTS.md is already committed by Task 5.4. This task creates LEARNINGS.md + SUMMARY.md + (optional) updates to the sibling/parent STATUS.md files, all in ONE atomic commit that is INDEPENDENT and REVERSIBLE relative to Task 5.4's commit.

    1. Create `.planning/standalone/debounce-v2-sandbox-integration/LEARNINGS.md`:

       ```markdown
       # LEARNINGS — debounce-v2-sandbox-integration

       **Shipped:** {YYYY-MM-DD}
       **Plans:** 01-05 (5 plans, 4 waves)
       **LOC delta:** {actual numbers from SUMMARYs}
       **Sibling:** debounce-v2-interrupt-reprocess (shipped 2026-05-26)
       **Parent:** debounce-interruption-system-v2 (shipped 2026-05-26)

       ---

       ## Reusable patterns

       1. **Distributed-lock wiring into existing engines** — pattern: extend Input interface with 5 OPTIONAL fields (lockHandle, lockChannel, lockIdentifier, ownPendingEntryJson, sandboxSessionId), wrap body in `while (shouldRestart)`, mirror sibling's restart-loop. When all 5 fields are absent (legacy callers), engine behaves byte-identical to pre-wiring. This enables incremental migration: shipped consumers continue working; new consumer (sandbox route) is the only caller passing the new fields.

       2. **D-02 Option C lock-key shape — using existing union members + identifier prefix** — when D-15 forbids module changes but you need a new isolation namespace, prefix the identifier rather than extending the LockChannel union. Lock key `lock:{ws}:whatsapp:sandbox-{id}` isolates from real WhatsApp phones without touching the shipped module.

       3. **Sync-request HOLDER/FOLLOWER vs async Inngest dispatch** — webhook path uses Inngest; sandbox path is sync request/response. The FOLLOWER waiting mechanism is a long-poll endpoint reading a Redis key (`sandbox-result:{id}`) that the HOLDER writes BEFORE finally releases the lock (Pitfall 5 ordering). Long-poll with 300ms interval + 30s timeout is sufficient for 1-2 concurrent sandbox tabs; would NOT scale for production traffic (use Inngest dispatch instead).

       4. **Per-tab runtime session id (NOT localStorage) for tab isolation** — D-09 requires tabs of same workspace to be independent. localStorage is origin-scoped; using it would defeat isolation. React `useState(() => generateSessionId())` survives renders within the tab but regenerates on full reload; each tab gets its own. localStorage stays as the history-save mechanism for SavedSandboxSession (separate concern from lock id).

       5. **Collector wrap is mandatory or events disappear silently** — Pitfall 3. Without `runWithCollector(collector, () => engine.processMessage(...))`, `getCollector()` returns null in `emitLockEvent` and every event is a `console.log`-only emit. The Interruption tab queries the DB, not console, so the tab stays empty. Symptom: bot works, Interruption tab is empty. Always wrap; always pass `conversationId` to the collector (verified pattern from CRM reader route).

       6. **Regla 6 anti-leak tests as CI-enforceable contracts (with negative-assertion robustness)** — R6/R7/R8/R9 in route-v4-lock.test.ts spy on `acquireLock` and assert ZERO calls when `agentId !== 'somnio-sales-v4'`. This catches future edits that pull lock logic out of the v4 branch into shared code. CRITICAL pattern: wrap the POST handler call in `try { ... } catch { /* expected */ }` so the assertion is robust to non-v4 engine mock failures — engine-success and Regla-6-enforcement are SEPARATE claims, and conflating them creates brittle tests (BLOCKER 2 lesson from this standalone). Pattern: every "this code only runs for X" decision should have a test that asserts X's effect spy is not called for ¬X, AND the test should be robust to ¬X's own internal failures under minimal mocks.

       7. **TriggerKind union extension as scoped infra edit** — adding `'sandbox'` literal to `src/lib/observability/types.ts` was a single-line edit OUTSIDE D-15's locked scope (D-15 protects interruption-system-v2/ module only). Pattern: when a sibling infra type needs a new member to support a new consumer, distinguish "locked module" (D-15) from "sibling type" (free to extend) and document the boundary explicitly in plan frontmatter (WARNING 1 lesson).

       ---

       ## Gotchas

       - **Sub-loop CKPT-3/4/5 interrupts propagate via agent's errorMessage prefix** — the engine MUST detect `output.errorMessage?.startsWith('interrupted_at_ckpt_')` after the agent call to trigger restart for sub-loop CKPTs (Pitfall 7 from sibling). Without this, sub-loop interrupts silently handoff (the original sibling bug).
       - **Chronological combine order matters** — sibling shipped a chronological-fix commit (494d3bb4) on 2026-05-27 that changed combine order from `[...pending, priorMsg].join('\\n')` to `[priorMsg, ...pending].join('\\n')`. Sandbox engine mirrors this. Wrong order surfaces as bot responding to msg2 first then msg1, confusing the conversation.
       - **CKPT-7.N synthetic loop is sandbox-only** — production uses V4MessagingAdapter.shouldAbortBeforeTemplate inside MessagingProductionAdapter.send. Sandbox returns messages directly to UI without calling that adapter. We synthesize the per-template gate in the engine's mapping loop. Code-comment cross-references must make this distinction clear or future maintainers will think the engine is double-gating.
       - **Sandbox engine has 3 Path A sites; V4ProductionRunner has 4** — sandbox omits CKPT-6a (the pending-templates pre-send branch at `v4-production-runner.ts:464`) because sandbox doesn't pre-send templates from a prior turn. Cross-reference comment in `engine-v4.ts` MUST point to the omitted anchor for future maintainers (BLOCKER 4 lesson — internal consistency between truth-count and body-count matters; document the asymmetry).
       - **S2 smoke timing is unreliable in fast environments** — Gemini Flash can complete a turn in under 500ms, leaving no window for msg2-typed-by-human. Substitution methods (Fallback A: 3000ms artificial delay reverted post-smoke / Fallback B: curl-staged msg2) keep S2 testable. Document which method was used in SMOKE-RESULTS.md so future maintainers can re-verify (WARNING 4 lesson).

       ---

       ## Decision honored (D-01..D-15)

       D-01: ✓ Only somnio-sales-v4 branch in route.ts touched (R6/R7/R8/R9 tests as anchors with negative-assertion pattern)
       D-02 (AMENDED Option C): ✓ channel='whatsapp' + identifier prefix 'sandbox-{id}'; no LockChannel union extension
       D-03: ✓ sandboxSessionId source = useState lazy init via generateSessionId(); sent in POST body
       D-04: ✓ 8 CKPTs paridad — CKPT-1..5 fire via threading; CKPT-0/6 new in engine; CKPT-7.N synthetic
       D-05: ✓ Heartbeat outside while loop; Pitfall 6 no stacking
       D-06 (AMENDED restart-loop): ✓ Engine mirrors V4ProductionRunner restart-loop semantics (3 sites in sandbox vs 4 in prod; CKPT-6a omitted per Wave 1 cross-ref comment)
       D-07: ✓ FOLLOWER returns deferred=true shape; new long-poll endpoint /api/sandbox/lock-result/[id] (covered by L1/L2 tests per WARNING 2)
       D-08: ✓ InterruptionTab.conversationId={sandboxLockSessionId}; events visible in tab
       D-09: ✓ Per-tab runtime sandboxLockSessionId (NOT localStorage)
       D-10: ✓ identifier prefix 'sandbox-' guarantees lock keys never collide with prod
       D-11: ✓ Cron sweep option (c) — sandbox lives with default cron; documented as acceptable edge case
       D-12: ✓ Zero SQL migrations
       D-13: ✓ Zero feature flags
       D-14: ✓ 20 vitest scenarios (8 engine + 10 route + 2 long-poll); manual smoke S1/S2/S3
       D-15: ✓ Module + cron + V4ProductionRunner + webhook handler all byte-identical. NOTE: `src/lib/observability/types.ts` extended (WARNING 1) — this is a SIBLING infra module, NOT part of D-15's locked scope.

       ---

       ## Cost patterns / notes

       {Anything observed about Gemini latency, lock-acquire latency, long-poll behavior, etc.}

       ---

       ## Activation path

       This standalone makes the v4 path more debuggable in /sandbox but does NOT activate v4 in production. v4 is still DORMANT (0 workspaces flipped). To activate per-workspace:
       ```sql
       UPDATE workspace_agent_config
       SET conversational_agent_id = 'somnio-sales-v4'
       WHERE workspace_id = '<uuid>';
       ```
       After activation, parent standalone's D-19 Phase 3 (Vercel preview + real WhatsApp smoke) should be executed by the user.

       ---

       ## Files touched (final count)

       - NEW: `src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts`
       - NEW: `src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts`
       - NEW: `src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts`
       - NEW: `src/app/api/sandbox/lock-result/[sandboxSessionId]/__tests__/route.test.ts` (WARNING 2)
       - EDIT: `src/lib/agents/somnio-v4/engine-v4.ts` ({LOC delta from 01-SUMMARY})
       - EDIT: `src/app/api/sandbox/process/route.ts` ({LOC delta from 02-SUMMARY})
       - EDIT: `src/app/(dashboard)/sandbox/components/sandbox-layout.tsx` ({LOC delta from 02+03 SUMMARYs})
       - EDIT: `src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx` ({LOC delta from 03-SUMMARY})
       - EDIT: `src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx` ({LOC delta from 03-SUMMARY})
       - EDIT: `src/lib/observability/types.ts` (single-line TriggerKind extension per WARNING 1; SIBLING module, outside D-15 lock)

       Module `interruption-system-v2/` UNCHANGED (D-15). Cron UNCHANGED. V4ProductionRunner UNCHANGED. Webhook handler UNCHANGED.
       ```

       Fill placeholders from prior SUMMARYs + SMOKE-RESULTS.md.

    2. Create `.planning/standalone/debounce-v2-sandbox-integration/SUMMARY.md`:

       ```markdown
       # SUMMARY — debounce-v2-sandbox-integration

       **Status:** {SHIPPED | SHIPPED with known issues | BLOCKED}
       **Shipped date:** {YYYY-MM-DD}
       **Plans:** 5 (01-engine, 02-route, 03-debug-panel, 04-tests, 05-smoke-close)
       **Waves:** 4 (W1 = 01; W2 = 02; W3 = 03 || 04; W4 = 05)
       **Total LOC delta:** ~+{X}/-{Y} across {N} files
       **Sibling:** debounce-v2-interrupt-reprocess (shipped 2026-05-26)
       **Parent:** debounce-interruption-system-v2 (shipped 2026-05-26)

       ---

       ## What shipped

       The sandbox v4 path (`/sandbox` → `agentId='somnio-sales-v4'`) now exercises the SAME interruption-system-v2 lock + 8 checkpoints + observability events as production WhatsApp/FB/IG. Engine wraps with try { startHeartbeat; while(shouldRestart) { CKPT-0; agent; CKPT-6; for-msg CKPT-7.N }; sandbox-result write; } finally { stopHeartbeat; releaseLockIfOwner }. Route does HOLDER/FOLLOWER discrimination + collector wrap. UI threads runtime sandboxLockSessionId + handles deferred response via long-poll endpoint. Interruption debug-panel tab consumes real conversation_id.

       ## Decisions honored

       D-01..D-15 all green. See LEARNINGS.md §Decision honored. Note: D-15 module-lock unviolated; the single-line TriggerKind extension in `src/lib/observability/types.ts` is a SIBLING infra module (not under D-15 lock) per WARNING 1.

       ## Closes parent D-19 Phase 4

       Parent standalone (`debounce-interruption-system-v2`) deferred D-19 Phase 4 (sandbox visual smoke) "explicitly to this standalone". This standalone delivers it.

       Parent D-19 Phase 3 (Vercel preview + real WhatsApp smoke) remains deferred to v4 activation-time per-workspace.

       ## v4 production status

       Still DORMANT. 0 workspaces have `conversational_agent_id='somnio-sales-v4'`. Activation is per-workspace via SQL (single UPDATE, no migration, no flag). This standalone does not change activation status.

       ## Manual smoke results

       See `.planning/standalone/debounce-v2-sandbox-integration/SMOKE-RESULTS.md` (committed independently per BLOCKER 3 atomic-commit split).

       - S1 (happy path): {PASS/FAIL}
       - S2 (Path A combo): {PASS/FAIL} via {Primary/Fallback A/Fallback B}
       - S3 (Path B solo): {PASS/FAIL/N/A}

       ## Test suite

       20 new vitest scenarios:
       - `src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts` — 8 scenarios E1..E8 (engine extension)
       - `src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts` — 10 scenarios R1..R10 (route HOLDER/FOLLOWER + Regla 6 anchors with negative-assertion pattern per BLOCKER 2)
       - `src/app/api/sandbox/lock-result/[sandboxSessionId]/__tests__/route.test.ts` — 2 scenarios L1..L2 (long-poll endpoint with fake timers per WARNING 2)

       Parent's 6-suite interruption-v2 test directory continues green (no regression).

       ## Follow-ups

       - {any deferred items from smoke}
       - When v4 activates: execute parent D-19 Phase 3 with real WhatsApp.
       - When v4 turns regularly include multi-template responses: re-run S3 if it was N/A.

       ---

       **References:**
       - Parent: `.planning/standalone/debounce-interruption-system-v2/SUMMARY.md`
       - Sibling: `.planning/standalone/debounce-v2-interrupt-reprocess/SUMMARY.md`
       - Plans: 01-PLAN.md through 05-PLAN.md
       - Per-plan SUMMARYs: 01-SUMMARY.md through 04-SUMMARY.md
       - Manual smoke: SMOKE-RESULTS.md (atomic commit #1 per BLOCKER 3)
       - Reusable patterns: LEARNINGS.md (this commit)
       ```

    3. (Optional) Update parent + sibling STATUS.md files to mark this sibling as SHIPPED. Apply ONLY if the parent/sibling STATUS.md files have a "Children" / "Siblings" section that tracks shipped state:
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       ls .planning/standalone/debounce-interruption-system-v2/STATUS.md 2>/dev/null
       ls .planning/standalone/debounce-v2-interrupt-reprocess/STATUS.md 2>/dev/null
       # If they exist, edit them to mark debounce-v2-sandbox-integration as SHIPPED.
       # If they do not exist, skip this step.
       ```

    4. **Atomic commit #2 — close-out docs only** (BLOCKER 3 split; SMOKE-RESULTS.md is NOT in this commit):
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       git add .planning/standalone/debounce-v2-sandbox-integration/LEARNINGS.md \
               .planning/standalone/debounce-v2-sandbox-integration/SUMMARY.md \
               .planning/standalone/debounce-v2-sandbox-integration/05-PLAN.md
       # If parent/sibling STATUS.md updates were applied in step 3:
       git add .planning/standalone/debounce-interruption-system-v2/STATUS.md 2>/dev/null || true
       git add .planning/standalone/debounce-v2-interrupt-reprocess/STATUS.md 2>/dev/null || true
       git commit -m "$(cat <<'EOF'
       docs(debounce-v2-sandbox-integration): close standalone with learnings + summary

       Standalone debounce-v2-sandbox-integration SHIPPED.
       - LEARNINGS.md captures 7 reusable patterns + gotchas (incl. BLOCKER 2
         negative-assertion pattern, BLOCKER 4 site-count asymmetry, WARNING 1
         scoped-infra-edit boundary, WARNING 4 smoke-timing fallbacks).
       - SUMMARY.md closes parent D-19 Phase 4 (sandbox visual smoke).
       - v4 remains DORMANT in prod (per-workspace flip required).

       SMOKE-RESULTS.md committed independently (BLOCKER 3 atomic-commit split).

       Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
       EOF
       )"
       git push origin HEAD:main
       ```

       This commit is INDEPENDENT of Task 5.4's SMOKE-RESULTS.md commit. Each can be reverted in isolation:
       - Revert Task 5.5 commit → standalone retains SMOKE-RESULTS but loses LEARNINGS+SUMMARY (no "SHIPPED" claim).
       - Revert Task 5.4 commit → standalone retains LEARNINGS+SUMMARY but loses smoke evidence (re-blocks "SHIPPED" claim).

    5. Final verification — repo state:
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       ls .planning/standalone/debounce-v2-sandbox-integration/
       # Expected: 01-PLAN.md, 02-PLAN.md, 03-PLAN.md, 04-PLAN.md, 05-PLAN.md,
       #           01-SUMMARY.md, 02-SUMMARY.md, 03-SUMMARY.md, 04-SUMMARY.md,
       #           SMOKE-RESULTS.md, LEARNINGS.md, SUMMARY.md,
       #           DISCUSSION-LOG.md, RESEARCH.md.
       git log --oneline -10
       # Expected: most recent 2 commits are "docs(...): close with learnings + summary"
       #           and (1 prior) "docs(...): record smoke S1/S2/S3 results"
       git status  # clean
       ```
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && test -f .planning/standalone/debounce-v2-sandbox-integration/SMOKE-RESULTS.md && test -f .planning/standalone/debounce-v2-sandbox-integration/LEARNINGS.md && test -f .planning/standalone/debounce-v2-sandbox-integration/SUMMARY.md && (grep -c "SHIPPED" .planning/standalone/debounce-v2-sandbox-integration/SUMMARY.md) && (git status --porcelain | wc -l) && (git log --oneline -5 | grep -c "debounce-v2-sandbox-integration") && (git log --oneline -5 | grep -c "record smoke S1/S2/S3") && (git log --oneline -5 | grep -c "close standalone with learnings")</automated>
  </verify>
  <acceptance_criteria>
    - `test -f .planning/standalone/debounce-v2-sandbox-integration/SMOKE-RESULTS.md` succeeds (committed by Task 5.4).
    - `test -f .planning/standalone/debounce-v2-sandbox-integration/LEARNINGS.md` succeeds (committed by this Task 5.5).
    - `test -f .planning/standalone/debounce-v2-sandbox-integration/SUMMARY.md` succeeds (committed by this Task 5.5).
    - `grep -c "SHIPPED" .planning/standalone/debounce-v2-sandbox-integration/SUMMARY.md` ≥ 1.
    - `grep -c "S1:\|S2:\|S3:" .planning/standalone/debounce-v2-sandbox-integration/SMOKE-RESULTS.md` ≥ 3 (all three scenarios documented).
    - `grep -c "Reusable patterns\|Gotchas\|Decision honored" .planning/standalone/debounce-v2-sandbox-integration/LEARNINGS.md` ≥ 3.
    - `git status --porcelain | wc -l` returns 0 (working tree clean post-commit).
    - **BLOCKER 3 atomic-commit split verified:** `git log --oneline -5 | grep -c "record smoke S1/S2/S3"` ≥ 1 AND `git log --oneline -5 | grep -c "close standalone with learnings"` ≥ 1 (TWO separate commits in history; their relative order is 5.4 first then 5.5).
    - **BLOCKER 3 commit independence verified:** `git diff HEAD~1 HEAD -- .planning/standalone/debounce-v2-sandbox-integration/SMOKE-RESULTS.md | wc -l` returns 0 (Task 5.5's commit does NOT touch SMOKE-RESULTS.md) AND `git diff HEAD~2 HEAD~1 -- .planning/standalone/debounce-v2-sandbox-integration/LEARNINGS.md | wc -l` returns 0 (Task 5.4's commit did NOT touch LEARNINGS.md).
  </acceptance_criteria>
  <done>LEARNINGS+SUMMARY docs created + committed + pushed as atomic commit #2 (independent of Task 5.4's atomic commit #1). Standalone is SHIPPED (or documented as SHIPPED-with-known-issues).</done>
  <atomic_commit>docs(debounce-v2-sandbox-integration): close standalone with learnings + summary</atomic_commit>
</task>

</tasks>

<verification>
1. 3 new files exist + committed (in TWO atomic commits per BLOCKER 3) + pushed.
2. SMOKE-RESULTS.md documents S1/S2/S3 verdicts; S2 records which substitution method was used (Primary/Fallback A/Fallback B per WARNING 4).
3. LEARNINGS.md captures 7 reusable patterns + gotchas + decision-honored matrix.
4. SUMMARY.md declares SHIPPED + cross-references parent + sibling.
5. Repo working tree clean post-commit.
6. Standalone directory contains: 01-PLAN.md, 02-PLAN.md, 03-PLAN.md, 04-PLAN.md, 05-PLAN.md + 01-SUMMARY.md through 04-SUMMARY.md + SMOKE-RESULTS.md + LEARNINGS.md + SUMMARY.md + DISCUSSION-LOG.md + RESEARCH.md = 14 files.
7. **BLOCKER 3 split verified by git history:** Task 5.4 commit (SMOKE-RESULTS only) and Task 5.5 commit (LEARNINGS+SUMMARY only) appear as TWO distinct commits, each independently revertible.
8. **WARNING 4 fallback hygiene (only relevant if Fallback A used in Task 5.3):** `grep -c "setTimeout(r, 3000)" src/lib/agents/somnio-v4/engine-v4.ts` returns 0 — the temporary debug toggle was reverted before any commit.
</verification>

<success_criteria>
- Standalone closed with SHIPPED status (or documented partial-ship).
- S1/S2/S3 manual smoke executed + verdicts documented; S2 substitution method recorded per WARNING 4.
- LEARNINGS.md available as future-reference template.
- SUMMARY.md cross-referenced from parent + sibling.
- v4 remains DORMANT in prod (no change to activation status — that is a per-workspace UPDATE the user runs when ready).
- Parent standalone's D-19 Phase 4 (sandbox visual smoke) closed.
- Two independent atomic commits in git history per BLOCKER 3 (smoke evidence vs close-out docs).
</success_criteria>

<push_to_vercel>
Pushed in Task 5.4 (smoke evidence commit) and Task 5.5 (close-out docs commit). Nothing more to push.
</push_to_vercel>

<output>
After completion, no separate SUMMARY needed — this Plan's deliverable IS the SUMMARY.md for the entire standalone. Cross-reference final state in MEMORY.md (user-side update — not Claude's task) when the standalone shipping is logged into the project memory.

Future-Claude reading this should:
1. Check `.planning/standalone/debounce-v2-sandbox-integration/SUMMARY.md` for ship-state.
2. Check SMOKE-RESULTS.md for any failing scenarios that need follow-up work (note: SMOKE-RESULTS lives in a separate atomic commit from LEARNINGS+SUMMARY per BLOCKER 3 — revert isolation is preserved).
3. Reference LEARNINGS.md when planning analogous wiring tasks for other agents (when more agents migrate from production-only lock-aware to sandbox+production lock-aware).
</output>
</content>

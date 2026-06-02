---
phase: 42-session-lifecycle
plan: 05
type: execute
wave: 3
depends_on: [02, 03, 04]
files_modified:
  - docs/analysis/04-estado-actual-plataforma.md
autonomous: false

must_haves:
  truths:
    - "All Wave 2 code (cron + helper + 6 timer checks + createSession recovery) is pushed to Vercel main"
    - "First post-deploy cron run logged closedCount in Inngest dashboard logs"
    - "Recurring-customer UAT scenario passes: customer with closed session sends a new message and gets a fresh-start response"
    - "No 23505 errors in Vercel/Inngest logs in the 30 minutes following deploy"
    - "docs/analysis/04-estado-actual-plataforma.md updated to reflect Phase 42 (Regla 4)"
  artifacts:
    - LEARNINGS.md (Phase 42 entry)
  key_links:
    - "Maps to all 5 success criteria from CONTEXT §6 / ROADMAP Phase 42"
---

<objective>
Final wave: push everything to Vercel, run conditional first-cron-run safety logic based on Q3 results from 01-PLAN, perform manual UAT against the 5 success criteria from CONTEXT §6, update affected documentation per Regla 4, and capture LEARNINGS.

Purpose: Verify Phase 42 actually works in production end-to-end and that no regression hits live customers.
Output: Pushed deploy, signed-off UAT, updated docs, LEARNINGS entry.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/42-session-lifecycle/42-CONTEXT.md
@.planning/phases/42-session-lifecycle/42-RESEARCH.md
@.planning/phases/42-session-lifecycle/42-01-SUMMARY.md
@.planning/phases/42-session-lifecycle/42-02-SUMMARY.md
@.planning/phases/42-session-lifecycle/42-03-SUMMARY.md
@.planning/phases/42-session-lifecycle/42-04-SUMMARY.md
@docs/analysis/04-estado-actual-plataforma.md
</context>

<tasks>

<task type="checkpoint:decision">
  <name>Task 1: Conditional one-off cleanup based on Q3 results</name>
  <files>—</files>
  <action>
Read 42-01-SUMMARY.md to retrieve the Q3 result (`stale_cron_rule` count) captured during 01-PLAN's user checkpoint.

Decision tree (per 42-RESEARCH.md ## Open Questions #1):
- If `stale_cron_rule <= 1000`: skip this task. The first automated cron run will close them all in one go safely. Proceed to Task 2.
- If `stale_cron_rule > 1000`: PAUSE and ask user to run a tighter one-off cleanup BEFORE the cron is enabled in production. Provide this exact SQL for the user to run in Supabase SQL editor:
  ```sql
  UPDATE agent_sessions
  SET status = 'closed',
      updated_at = timezone('America/Bogota', NOW())
  WHERE status = 'active'
    AND last_activity_at < NOW() - INTERVAL '30 days';
  ```
  Wait for user confirmation before continuing.

This ensures the first automated cron run at 02:00 COT only sweeps a small incremental set, avoiding any single-run blast that could spike Supabase load.
  </action>
  <verify>
- Either the task was skipped because Q3 was small, OR
- User confirmed manual one-off cleanup was applied in prod
  </verify>
  <done>The first automated cron run will close at most ~1000 sessions.</done>
</task>

<task type="auto">
  <name>Task 2: Push to Vercel</name>
  <files>—</files>
  <action>
Per CLAUDE.md Regla 1, push all Wave 2 changes to Vercel before user testing.

Steps:
1. `git status` — verify staged + unstaged files match the union of files_modified across 02-PLAN, 03-PLAN, 04-PLAN:
   - `src/inngest/functions/close-stale-sessions.ts`
   - `src/app/api/inngest/route.ts`
   - `src/lib/agents/timer-guard.ts`
   - `src/inngest/functions/agent-timers.ts`
   - `src/inngest/functions/agent-timers-v3.ts`
   - `src/lib/agents/session-manager.ts`
2. `git diff` — quick sanity scan that no out-of-scope file is included.
3. `git add` each file by name (NOT `git add .` per CLAUDE.md commit guidance).
4. `git commit` with a descriptive message in Spanish, ending with the standard Co-Authored-By line. Example:
   ```
   feat(agents): cron de cierre de sesiones + defensive check en timers (Phase 42)

   - Nuevo cron Inngest close-stale-sessions a las 02:00 COT
   - Helper timer-guard y check defensivo en 6 handlers V1+V3
   - Recovery 23505 en SessionManager.createSession para race del partial unique index
   - Migracion del schema (partial unique index + RPC) ya aplicada en prod

   Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
   ```
5. `git push origin main`.
6. Wait for Vercel deploy to finish (check Vercel CLI or dashboard).
7. Confirm Inngest dashboard shows `close-stale-sessions` in the function list (per 42-RESEARCH.md ## Common Pitfalls — Pitfall 3).
  </action>
  <verify>
- `git log -1` shows the new commit
- `git status` clean
- Vercel deploy succeeded
- Inngest dashboard lists `close-stale-sessions` function
  </verify>
  <done>Code is live in production behind the previously-applied schema migration.</done>
</task>

<task type="checkpoint:human-verify">
  <name>Task 3: UAT — verify the 5 success criteria from CONTEXT §6</name>
  <files>—</files>
  <action>
Walk the user through manual verification of each success criterion. Present them ONE AT A TIME and record pass/fail.

**Criterion 1:** Cliente con conversacion cerrada hace >24h vuelve a escribir y recibe respuesta normal.
- Identify (with user help) one production conversation where the V3 agent has been silent (e.g. customer who said "no" weeks ago, or a known stuck conversation).
- Manually run: `UPDATE agent_sessions SET status='closed' WHERE conversation_id = '<X>' AND status='active';` in Supabase SQL editor (simulates cron action on ONE specific session).
- Have user trigger a real WhatsApp message from that contact (or simulate via webhook test).
- Verify in DB: a NEW row appeared in `agent_sessions` for the same `(conversation_id, agent_id)` with `status='active'` and fresh `accionesEjecutadas=[]`.
- Verify the bot replied with a fresh greeting (not contaminated by old state).
- PASS / FAIL.

**Criterion 2:** DB muestra multiples filas en agent_sessions.
- Run: `SELECT COUNT(*), conversation_id, agent_id FROM agent_sessions GROUP BY conversation_id, agent_id HAVING COUNT(*) > 1;`
- Should return at least 1 row (the test conversation from criterion 1).
- PASS / FAIL.

**Criterion 3:** Cron ejecuta 02:00 COT diario, logea count.
- Wait until 02:00 COT or trigger the cron manually via Inngest dashboard "Invoke" button.
- Check Inngest function logs for the closeStaleSessionsCron run.
- Verify `closedCount` field in the structured log.
- Verify no error in the run.
- PASS / FAIL.

**Criterion 4:** Clientes previamente bloqueados por handed_off + unique constraint reciben respuesta; no 23505 en logs.
- Use Q6 from 42-DIAGNOSTICS.md to find a `handed_off` conversation.
- Reactivate it (have the contact send a message OR simulate). Verify a new `active` row coexists with the old `handed_off` row.
- Grep Vercel + Inngest logs for `23505` since deploy: should be zero.
- PASS / FAIL.

**Criterion 5:** Sesiones activas en curso al momento del deploy no sufren regresion.
- Identify (with user) a conversation that was actively chatting in the last hour.
- Verify it still has `status='active'` and is responding normally.
- PASS / FAIL.

If ANY criterion fails: pause, do NOT mark phase complete, document the failure, route to debug.
  </action>
  <verify>All 5 criteria marked PASS by user.</verify>
  <done>Phase 42 success criteria empirically verified in production.</done>
</task>

<task type="auto">
  <name>Task 4: Update docs/analysis/04-estado-actual-plataforma.md (Regla 4)</name>
  <files>docs/analysis/04-estado-actual-plataforma.md</files>
  <action>
Per CLAUDE.md Regla 4, update the platform state document to reflect Phase 42 completion.

1. Read the current file.
2. Find the section discussing agent sessions / V3 / agent engine state (likely under "Agentes Conversacionales" or similar).
3. Update:
   - Status: note that session lifecycle bug is fixed as of Phase 42
   - Bugs: remove the "sesiones nunca se cierran" / "23505 en clientes recurrentes" entries if listed
   - Deuda tecnica: ADD a P2 entry "SessionManager bypassing src/lib/domain/ — refactor candidate" (per 42-RESEARCH.md Open Question #3)
   - Deuda tecnica: ADD "Bug pre-existente agent-production.ts:154 filtrando por columna inexistente is_active" (out of scope for Phase 42 per CONTEXT §2.5)
4. If a Phase 42 entry doesn't exist anywhere in the document, add a brief one-line note.

Do NOT touch sections unrelated to agent sessions.
  </action>
  <verify>
- File reflects Phase 42 completion
- Two new tech-debt items added
- Old "sesiones zombie" bug entries removed if present
  </verify>
  <done>Docs synchronized with code per Regla 4.</done>
</task>

<task type="auto">
  <name>Task 5: Write Phase 42 LEARNINGS entry</name>
  <files>LEARNINGS.md</files>
  <action>
Append a Phase 42 entry to LEARNINGS.md (or create the file if it doesn't exist) covering:

- **Bug root cause:** Sessions never closed in runtime; the only `status` writes were `handed_off` (handoff path) and the static `'active'` default. `closeSession()` had zero callers.
- **Phase derivada vs status confusion:** `derivePhase()` returning `'closed'` from `accionesEjecutadas` is in-memory only; never reflected in `agent_sessions.status`. This created the "bot permanentemente mudo tras decir no" symptom because reused sessions kept the same `accionesEjecutadas`.
- **Partial unique index pattern:** `CREATE UNIQUE INDEX ... WHERE status='active'` is the canonical Postgres way to enforce "at most one of X per group" while allowing historical archives. Use this pattern when you need both uniqueness AND audit history.
- **Inngest cron TZ syntax:** `{ cron: 'TZ=America/Bogota 0 2 * * *' }` — inline prefix, no separate timezone option in v3.51.0.
- **Defensive check > cancel-by-reference:** Inngest lacks trivial cancel-by-reference, so the simplest correct pattern is a 2-line read-only status check at the start of each handler. Survives any future close path automatically.
- **Race window on partial unique index:** Concurrent inserts ARE serialized by Postgres (verified against official docs), but the loser still sees 23505. Always wrap INSERT with retry-via-fetch when using a unique index that competing writers might hit.
- **Tech debt documented:**
  - SessionManager bypasses `src/lib/domain/` (Regla 3 exception, ratified by precedent — refactor in dedicated phase)
  - `agent-production.ts:154` filtering by non-existent `is_active` column (pre-existing, out of Phase 42 scope)
  - `closeSession()` wrapper kept as dead API for future use
  - `paused` status never written but still in CHECK constraint
- **First cron run consideration:** Phases that fix systemic bugs that have accumulated state for months should always include a "size the blast radius" diagnostic step before automating the cleanup.

Reference the SUMMARY files from each plan as the source of detailed findings.
  </action>
  <verify>
- LEARNINGS.md contains a Phase 42 section with all 8 bullet points above
  </verify>
  <done>Phase learnings captured for future reference.</done>
</task>

</tasks>

<verification>
- Cron visible in Inngest dashboard
- All 5 success criteria PASS in UAT
- docs/analysis/04-estado-actual-plataforma.md updated
- LEARNINGS.md has Phase 42 entry
- No 23505 errors in production logs since deploy
</verification>

<success_criteria>
All 5 criteria from CONTEXT §6 / ROADMAP Phase 42:
1. Recurring customer with closed session writes and gets clean response
2. DB shows multiple rows per (conv, agent) for cycled customers
3. Cron runs 02:00 COT, logs closedCount, post-midnight sessions survive
4. Previously blocked handed_off customers receive responses; no 23505 errors
5. Active sessions at deploy time are not regressed
</success_criteria>

<output>
Create `.planning/phases/42-session-lifecycle/42-05-SUMMARY.md` with:
- Deploy commit SHA + timestamp
- UAT results table (5 criteria, pass/fail, evidence)
- Q3 conditional outcome (skipped or one-off ran)
- Cron first-run closedCount
- Any post-deploy issues observed
</output>

---
phase: 42-session-lifecycle
plan: 04
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/agents/session-manager.ts
autonomous: true

must_haves:
  truths:
    - "SessionManager.createSession catches Postgres 23505 (unique violation) on the partial index and transparently recovers by returning the concurrently-created active session"
    - "Somnio V1 reachability documented: either confirmed dead code or defensive check plan defined"
  artifacts:
    - src/lib/agents/session-manager.ts
  key_links:
    - "Retry-on-23505 closes the race window where two webhooks concurrently call createSession"
---

<objective>
Harden `SessionManager.createSession` against the concurrent-insert race window surfaced by the new partial unique index, and document the Somnio V1 reachability status (does `/api/agents/somnio` still receive traffic?).

Purpose: Eliminate the final class of 23505 errors that could surface after deploy, and close Open Questions #2 and #4 from 42-RESEARCH.md.
Output: Updated `createSession` with try/catch + recovery path; a documented answer to "is Somnio V1 dead code?".
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/42-session-lifecycle/42-CONTEXT.md
@.planning/phases/42-session-lifecycle/42-RESEARCH.md
@src/lib/agents/session-manager.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add retry-on-23505 to SessionManager.createSession</name>
  <files>src/lib/agents/session-manager.ts</files>
  <action>
Wrap the existing INSERT in `createSession` (around line 122, per 42-RESEARCH.md ## Query Audit row #1) with try/catch logic that recovers from a unique-violation by re-fetching the session that the racing request just created.

Reference 42-RESEARCH.md ## Common Pitfalls — Pitfall 1 and ## Open Questions #2.

Strategy:
1. Locate the existing INSERT block in `createSession` (research says line ~122).
2. Wrap it in a try/catch.
3. In catch, check whether the error is a Postgres unique violation (`code === '23505'`). Supabase surfaces this via `error.code` on the returned error object, or inside the thrown Error if you use `.throwOnError()`. Existing code uses the `{ data, error } = await ...` pattern — check `error?.code === '23505'`.
4. If it IS a unique violation: call `this.getSessionByConversation(conversationId, agentId)` which is already implemented at line ~202 and already filters by `status='active'`. If it returns a session, return that session (the racing request won). If it returns null (impossible under the partial index, but defensive), rethrow the original error.
5. Any other error: rethrow as before.

Insertion sketch (adapt to the exact existing shape — do NOT copy-paste blindly; match the variable names already in the file):

```typescript
const { data: inserted, error: insertError } = await this.supabase
  .from('agent_sessions')
  .insert({ /* existing fields */ })
  .select()
  .single()

if (insertError) {
  // Phase 42: handle concurrent-insert race against partial unique index
  // on (conversation_id, agent_id) WHERE status='active'
  if (insertError.code === '23505') {
    const existing = await this.getSessionByConversation(conversationId, agentId)
    if (existing) {
      return existing
    }
  }
  throw insertError
}
```

Important:
- The existing rollback-on-state-insert-failure path at line ~162 must be preserved. Only the INSERT itself needs the 23505 handler.
- Do NOT add a retry loop — one recovery attempt is enough. If the recovery fetch also fails, the original error propagates.
- Add a brief comment citing Phase 42 and the partial unique index name.
- Use the existing logger (if any) to log at info level when recovery succeeds (helps detect race frequency in prod).
- The `isUniqueViolation` name in 42-RESEARCH.md ## Open Questions #2 is pseudocode — the actual check is `error.code === '23505'`.

Before editing, Read the existing `createSession` carefully to understand the current structure (it may use a transaction, it may have additional side-effects — preserve everything except the INSERT error handling).
  </action>
  <verify>
- `grep -n "23505" src/lib/agents/session-manager.ts` returns at least 1 hit in createSession.
- `npm run typecheck` passes.
- Existing rollback path for state insert failure (line ~162) is untouched.
- `getSessionByConversation` is called in the recovery branch with the same conversationId + agentId args that createSession received.
  </verify>
  <done>createSession transparently recovers from concurrent inserts; callers never see a 23505 error from the partial unique index race.</done>
</task>

<task type="auto">
  <name>Task 2: Verify Somnio V1 reachability (Open Question #4)</name>
  <files>—</files>
  <action>
Per 42-RESEARCH.md ## Open Questions #4, determine whether `/api/agents/somnio/route.ts` is still reachable:

1. Run Glob for `src/app/api/agents/somnio/route.ts` — confirm file exists.
2. Grep for any internal callers:
   ```
   grep -rn "/api/agents/somnio" src/
   grep -rn "somnio-engine" src/
   ```
3. Grep for any reference to `SomnioEngine` outside of `somnio/somnio-engine.ts` itself.

Document findings in `.planning/phases/42-session-lifecycle/42-04-SUMMARY.md`:

- If ZERO internal callers AND file clearly orphaned: document as dead code, note that Somnio V1 engine does NOT need a defensive check in Phase 42 (no timer handlers route through it). Add to LEARNINGS.md as a deletion candidate for a future cleanup phase.
- If ANY internal caller found: list them. Flag to the user that a defensive check may be needed in the V1 handler path — defer the actual implementation to a follow-up plan because V1 handler structure differs from V3.
- Either way: do NOT modify V1 code in this phase (out of scope per the Phase 42 scope definition).

This task is pure audit — no code changes. Its output is a documented answer in the summary.
  </action>
  <verify>
- Summary document contains a clear conclusion ("dead code" OR "live — list of callers").
- No files under `src/app/api/agents/somnio/` or `somnio/` were modified.
- If any internal caller exists in runtime path, a follow-up debug item is created under `.planning/debug/`.
  </verify>
  <done>Open Question #4 is answered in writing. Phase 42 scope decision about V1 defensive check is documented.</done>
</task>

</tasks>

<verification>
- createSession has 23505 recovery path, typechecks, preserves existing rollback
- Somnio V1 reachability is documented in summary
- No files outside session-manager.ts and the summary were modified
</verification>

<success_criteria>
- Two concurrent createSession calls for same (conv, agent) both return successfully — one wins the INSERT, the other recovers via getSessionByConversation
- No 23505 errors surface to upstream callers under normal operation
- Somnio V1 decision is recorded (dead code OR follow-up needed)
</success_criteria>

<output>
Create `.planning/phases/42-session-lifecycle/42-04-SUMMARY.md` with:
- Final location of the 23505 handler in session-manager.ts (line number)
- Somnio V1 audit results (list of callers or "none found")
- Any surprises in createSession structure that required adapting the snippet
</output>

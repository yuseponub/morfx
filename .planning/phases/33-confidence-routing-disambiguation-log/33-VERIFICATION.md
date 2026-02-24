---
phase: 33-confidence-routing-disambiguation-log
verified: 2026-02-24T19:13:50Z
status: passed
score: 8/8 must-haves verified
---

# Phase 33: Confidence Routing + Disambiguation Log Verification Report

**Phase Goal:** Bot routes low-confidence intent detections to human agents instead of guessing, and logs the full context of ambiguous situations for human review and future training.
**Verified:** 2026-02-24T19:13:50Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | classifyMessage returns HANDOFF with reason 'low_confidence:N' when confidence < 80 | VERIFIED | Rule 1.5 in message-category-classifier.ts line 74: `if (confidence < LOW_CONFIDENCE_THRESHOLD)` returns `{ category: 'HANDOFF', reason: 'low_confidence:${confidence}' }` |
| 2 | classifyMessage returns RESPONDIBLE for confidence >= 80 (normal flow unchanged) | VERIFIED | Rule 3 at line 91 returns `{ category: 'RESPONDIBLE', reason: 'default_respondible' }` as default after confidence check passes |
| 3 | Timer-forced and ingest-complete calls bypass confidence check (confidence=100) | VERIFIED | somnio-agent.ts line 259-268: forceIntent/justCompletedIngest paths set confidence=100; line 306: `if (!input.forceIntent && !justCompletedIngest)` gates the entire classifyMessage call |
| 4 | Migration file creates disambiguation_log table with workspace isolation and RLS | VERIFIED | 20260302000000_disambiguation_log.sql has CREATE TABLE with workspace_id FK, 4 indexes, 3 RLS policies (SELECT/INSERT/UPDATE) with is_workspace_member predicate |
| 5 | Every low-confidence handoff creates a disambiguation_log record with full context | VERIFIED | somnio-agent.ts line 343-362: fire-and-forget logDisambiguation call inside `if (classification.reason.startsWith('low_confidence:'))` guard, before HANDOFF return |
| 6 | Disambiguation log write is fire-and-forget — handoff proceeds even if log fails | VERIFIED | Call uses `.catch(err => { console.warn(...) })` pattern without await; HANDOFF return at line 364 executes regardless |
| 7 | Log captures customer message, intent, confidence, alternatives, agent state, templates_enviados, pending_templates, and last 10 conversation turns | VERIFIED | All 13 fields passed: workspaceId, sessionId, conversationId, contactId, customerMessage, detectedIntent, confidence, alternatives, reasoning, agentState, templatesEnviados, pendingTemplates, conversationHistory (via input.history.slice(-10)) |
| 8 | Step 7 (old IntentDetector handoff) includes timer cancel signal to prevent phantom timers | VERIFIED | somnio-agent.ts line 402: `timerSignals: [{ type: 'cancel', reason: 'handoff' }]` (was previously empty array per SUMMARY) |

**Score:** 8/8 truths verified

---

## Required Artifacts

| Artifact | Expected | Exists | Lines | Stubs | Wired | Status |
|----------|----------|--------|-------|-------|-------|--------|
| `supabase/migrations/20260302000000_disambiguation_log.sql` | disambiguation_log table, 4 indexes, 3 RLS policies | YES | 54 | None | N/A (migration) | VERIFIED |
| `src/lib/agents/somnio/constants.ts` | LOW_CONFIDENCE_THRESHOLD = 80 constant | YES | 93 | None | Imported by classifier | VERIFIED |
| `src/lib/agents/somnio/message-category-classifier.ts` | Rule 1.5 confidence check, imports LOW_CONFIDENCE_THRESHOLD | YES | 92 | None | Called by somnio-agent | VERIFIED |
| `src/lib/agents/somnio/log-disambiguation.ts` | logDisambiguation async helper + DisambiguationLogInput type | YES | 70 | None | Imported by somnio-agent | VERIFIED |
| `src/lib/agents/somnio/somnio-agent.ts` | Disambiguation log call in step 5.5 HANDOFF path, timer fix in step 7 | YES | ~700 | None | Core pipeline file | VERIFIED |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `message-category-classifier.ts` | `constants.ts` | `import LOW_CONFIDENCE_THRESHOLD` | WIRED | Line 20: `LOW_CONFIDENCE_THRESHOLD` imported; used at line 74 in Rule 1.5 |
| `somnio-agent.ts` | `message-category-classifier.ts` | `import classifyMessage`, called line 307 | WIRED | classifyMessage called with real intent.confidence value from IntentDetector |
| `somnio-agent.ts` | `log-disambiguation.ts` | `import logDisambiguation`, fire-and-forget call line 344 | WIRED | Call guarded by `classification.reason.startsWith('low_confidence:')`, uses `.catch()` pattern |
| `log-disambiguation.ts` | `disambiguation_log` (Supabase table) | `createAdminClient().from('disambiguation_log').insert()` | WIRED | Line 43: actual insert with all 13 columns mapped |
| `somnio-agent.ts` newMode='handoff' | `webhook-processor.ts` → `executeHandoff()` | `result.newMode === 'handoff'` check line 310 | WIRED | Full handoff workflow executes: sends "Regalame 1 min" message, toggles bot off, creates task for host |

---

## Requirements Coverage

| Requirement | Success Criterion | Status | Evidence |
|-------------|-------------------|--------|----------|
| CONF-01 | Low-confidence (<80%) triggers real HANDOFF (bot off, "Regalame 1 min", notify host) | SATISFIED | classifyMessage Rule 1.5 → somnio-agent returns newMode='handoff' → webhook-processor calls executeHandoff() which sends handoff message, toggles agent off, and creates task |
| CONF-02 | Every low-confidence handoff creates disambiguation_log record with full context | SATISFIED | logDisambiguation called fire-and-forget in step 5.5 HANDOFF path with all 13 context fields |
| CONF-03 | Human reviewer can fill correct_intent, correct_action, guidance_notes in Supabase dashboard | SATISFIED | Migration includes those three nullable TEXT columns plus reviewed BOOLEAN, reviewed_at TIMESTAMPTZ, reviewed_by UUID, with UPDATE RLS policy for workspace members |
| INFRA-02 | disambiguation_log preserves full block system context (templates_enviados, pending_templates) | SATISFIED | Both JSONB columns present in table schema and both passed from input.session.state in the logDisambiguation call |

---

## Anti-Patterns Found

None. No TODOs, FIXMEs, placeholders, empty returns, or stub patterns found in Phase 33 artifacts.

---

## Human Verification Required

### 1. End-to-end low-confidence handoff flow

**Test:** Send a message to the Somnio bot where the intent would be detected with low confidence (ambiguous message like "quiero algo"). Verify the bot:
1. Does NOT attempt a response
2. Sends "Regalame 1 min" handoff message
3. Toggles the conversational agent off for that conversation
4. Creates a task assigned to a human agent

**Expected:** Customer receives handoff message; agent panel shows bot toggled off; tasks list has a new high-priority task.

**Why human:** Real IntentDetector response confidence cannot be verified programmatically; requires live WhatsApp/webhook flow.

### 2. Disambiguation log record in Supabase dashboard

**Test:** After triggering a low-confidence handoff (above test), open Supabase dashboard and query the `disambiguation_log` table.

**Expected:** A record exists with: customer_message, detected_intent, confidence < 80, populated alternatives array, agent_state, templates_enviados, pending_templates, and last conversation turns in conversation_history. Fields correct_intent, correct_action, guidance_notes are NULL; reviewed is false.

**Why human:** Requires live Supabase dashboard access with production data; cannot verify record creation programmatically from static analysis.

### 3. Human review update via Supabase dashboard

**Test:** In Supabase dashboard, UPDATE a disambiguation_log record: set correct_intent, correct_action, guidance_notes, and reviewed=true.

**Expected:** Update succeeds (RLS UPDATE policy allows workspace members to update). reviewed_at can be set manually.

**Why human:** Requires actual Supabase dashboard session with authenticated workspace member.

---

## Gaps Summary

No gaps. All 8 observable truths verified. All artifacts are substantive, wired, and free of stub patterns. TypeScript compiles cleanly (excluding pre-existing vitest test file issue unrelated to Phase 33). The full handoff chain is confirmed: confidence < 80 → classifyMessage Rule 1.5 → HANDOFF → logDisambiguation (fire-and-forget) → executeHandoff (sends message, toggles bot off, notifies host via task).

The only items requiring human verification are behavioral (live WhatsApp flow and Supabase dashboard interaction), not structural.

---

_Verified: 2026-02-24T19:13:50Z_
_Verifier: Claude (gsd-verifier)_

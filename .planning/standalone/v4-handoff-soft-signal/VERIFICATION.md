---
phase: v4-handoff-soft-signal
verified: 2026-06-14T21:05:00Z
status: human_needed
score: 22/22 automatable must-haves verified
overrides_applied: 0
human_verification:
  - test: "Inbox note renders as '⚠ HANDOFF SUGERIDO — motivo: X' (direction:'outbound', NOT sent to customer)"
    expected: "After v4 activation/sandbox, triggering a content-gap handoff (e.g. low_confidence) shows a direction:'outbound' note in the inbox conversation WITHOUT a corresponding WhatsApp send"
    why_human: "v4 is DORMANT in prod — no live traffic to assert against until activation; UI render is visual"
  - test: "Zombie ckpt_0 no longer shows [ERROR AGENTE] in inbox; observability event still present"
    expected: "Sending 2 rapid messages to a v4 conversation produces no '[ERROR AGENTE] V4_ZOMBIE_LAMBDA_EXIT' note in inbox, but zombie_lambda_exit event still in agent_observability_events"
    why_human: "Requires back-to-back inbound messages to produce a zombie lambda; benign-case is timing-dependent + v4 DORMANT"
---

# Phase v4-handoff-soft-signal Verification Report

**Phase Goal:** ADITIVE refactor of the DORMANT `somnio-sales-v4` agent that SEPARATES the handoff SIGNAL from the handoff DECISION — (1) hard handoff → soft signal, (2) handoff reason visible in inbox as a suggestion, (3) zombie ckpt_0 false-positive cleanup. Regla 6: zero change to v3/godentist/recompra/pw-confirmation/varixcenter.
**Verified:** 2026-06-14T21:05:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

#### Plan 01 — Core soft handoff signal

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | When v4 resolves a handoff gate, storage.handoff() is NOT called (session stays active) | ✓ VERIFIED | `grep storage\.handoff v4-production-runner.ts` → 0 call sites (only D-04 comment at :377). The whole `if (output.newMode === 'handoff') { storage.handoff(...) }` block deleted; `updateMode` kept (intentional). |
| 2 | When v4 resolves a handoff gate, executeHandoff() is NOT called | ✓ VERIFIED | webhook-processor.ts:1089 hard path gated `&& !result.handoffSuggested`; soft branch (:1117) only inserts inbox note, never calls executeHandoff. |
| 3 | EngineOutput carries handoffSuggested:true and handoffSignal:{reason,gate,topic?} when v4 signals handoff | ✓ VERIFIED | types.ts:167/172 fields added; v4-production-runner.ts:637-652 spreads `handoffSuggested:true` + `handoffSignal` only when `output.newMode === 'handoff' && !suppressTurnEffects`. |
| 4 | handoff_suggested observability event emitted at every gate point with D-03 payload | ✓ VERIFIED | 4 emit sites in somnio-v4-agent.ts (vision error :230, vision no_match :332, guard R0/R1 :501, resolveLowSlot :878). Test output confirms payload shape `{sessionId, source:'somnio-v4', layer, gate, reason, topic, createdAt}`. |
| 5 | Existing agents (v3/godentist/recompra/pw-confirmation/varixcenter) still call executeHandoff when newMode='handoff' | ✓ VERIFIED | Only v4-production-runner.ts:639 sets `handoffSuggested:true`. For all other agents the field is undefined → `!undefined === true` → hard path (executeHandoff) fires unchanged. webhook-processor.ts:995 only propagates whatever engineOutput carries. |
| 6 | Covered slots in a partial handoff are still sent (combinedMessages unchanged) | ✓ VERIFIED | somnio-v4-agent.ts:1065 `templates: combinedMessages` untouched. Test "partial handoff (covered+low): covered template SENT + newMode=handoff + requiresHuman (R1-A)" passes. |
| 7 | D-02: no handoff_suggested event for interrupted_at_ckpt_* reasons | ✓ VERIFIED | somnio-v4-agent.ts:870 guard `if (!outcome.reason?.startsWith('interrupted_at_ckpt_'))` wraps the resolveLowSlot emit. |
| 8 | tsc --noEmit exits 0 | ✓ VERIFIED | Ran `npx tsc --noEmit` → exit 0. |
| 9 | npx vitest somnio-v4 passes (updated assertions) | ✓ VERIFIED | somnio-v4-agent.test.ts + vision-branch.test.ts → 21/21 pass. |

#### Plan 02 — Inbox note

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 10 | Inbox shows note: ⚠ HANDOFF SUGERIDO — motivo: <reason> | ✓ VERIFIED | webhook-processor.ts:1125 `content: { body: \`⚠ HANDOFF SUGERIDO — motivo: ${handoffReason}\` }` inside the `result.handoffSuggested` branch. |
| 11 | Note has direction:'outbound' — NOT sent to customer via WhatsApp | ✓ VERIFIED | webhook-processor.ts:1123 `direction: 'outbound'` + `type:'text'` direct DB insert; no send call in the branch. |
| 12 | Note insert uses admin (createAdminClient) supabase client — no silent 0-row | ✓ VERIFIED | `supabase = createAdminClient()` at webhook-processor.ts:140; insert reuses that in-scope admin client (bypasses RLS). |
| 13 | Note inserted ONLY on v4 soft path (result.handoffSuggested === true) | ✓ VERIFIED | Insert is inside `if (result.success && result.newMode === 'handoff' && result.handoffSuggested)` at :1117. |
| 14 | tsc --noEmit exits 0 | ✓ VERIFIED | exit 0. |
| 15 | All v4 test suites still pass | ✓ VERIFIED | Named deterministic suites pass; full deterministic 235/236 (the 1 failure pre-existing, see below). |

#### Plan 03 — Zombie false-positive cleanup

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 16 | V4_ZOMBIE_LAMBDA_EXIT at ckpt_0_post_acquire no longer writes [ERROR AGENTE] | ✓ VERIFIED | Guard `isZombieAtCkpt0` in both paths: agent-production.ts:587-590 (Inngest) + webhook-handler.ts:549-552 (inline). `if (!isZombieAtCkpt0)` wraps the insert. |
| 17 | zombie_lambda_exit observability event still emitted (mechanism unchanged) | ✓ VERIFIED | `grep zombie_lambda_exit checkpoints.ts` → 1 match, file untouched (Plan 03 modified only agent-production.ts + webhook-handler.ts). |
| 18 | Zombies at later checkpoints still write [ERROR AGENTE] (safety net kept) | ✓ VERIFIED | Guard requires `error.message?.includes('ckpt_0_post_acquire')` — later-ckpt zombies fail the includes check → insert fires. |
| 19 | V4 non-zombie errors (V4_ENGINE_ERROR, V4_AGENT_ERROR) still write [ERROR AGENTE] | ✓ VERIFIED | Guard requires `error.code === 'V4_ZOMBIE_LAMBDA_EXIT'` — other codes fail → insert fires. |
| 20 | Non-v4 agents: error insert paths NOT modified | ✓ VERIFIED | Same guard conditions are code+ckpt0 specific; non-v4 errors never match. Exception-path catch (webhook-handler.ts:568) left untouched. |
| 21 | tsc --noEmit exits 0 | ✓ VERIFIED | exit 0. |
| 22 | interruption-system-v2 tests pass | ✓ VERIFIED | checkpoints.ts mechanism unmodified; the single restart-loop.test.ts S1 failure is PRE-EXISTING (out of scope, see note). |

**Score:** 22/22 automatable must-haves verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/lib/agents/engine/types.ts` | handoffSuggested + handoffSignal on EngineOutput | ✓ VERIFIED | Lines 167, 172 (gate union of 7 values). |
| `src/lib/agents/engine/v4-production-runner.ts` | mapResult sets handoffSuggested; commitTurn skips storage.handoff | ✓ VERIFIED | storage.handoff removed (:377 comment only); deriveHandoffGate :605; spread :637-652. |
| `src/lib/agents/somnio-v4/somnio-v4-agent.ts` | handoff_suggested at R0/R1 + vision + resolveLowSlot | ✓ VERIFIED | 4 emit sites; D-02 guard :870; D-08 rag:handoff_ack :536-546. |
| `src/lib/agents/production/webhook-processor.ts` | hard path gated on !handoffSuggested; soft branch w/ note | ✓ VERIFIED | Hard :1089, soft :1117 with HANDOFF SUGERIDO insert :1125. |
| `src/lib/agents/somnio/somnio-engine.ts` | SomnioEngineResult propagates fields (deviation) | ✓ VERIFIED | Fields at :91/:93; mapping at webhook-processor.ts:995-996. |
| `src/inngest/functions/agent-production.ts` | Zombie ckpt_0 guard (Inngest path) | ✓ VERIFIED | isZombieAtCkpt0 :587-590, declared outside step.run. |
| `src/lib/whatsapp/webhook-handler.ts` | Zombie ckpt_0 guard (inline path) | ✓ VERIFIED | isZombieAtCkpt0 :549-552; exception-path :568 untouched. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| v4-production-runner mapResult | EngineOutput.handoffSuggested | newMode==='handoff' && !suppressTurnEffects | ✓ WIRED | :637 conditional spread. |
| webhook-processor hard path | executeHandoff | !result.handoffSuggested guard | ✓ WIRED | :1089 → :1101 executeHandoff (only call site). |
| somnio-v4-agent guards | agent_observability_events | recordV4Event('handoff_suggested', D-03 payload) | ✓ WIRED | 4 sites; payload confirmed in test stdout. |
| webhook-processor soft branch | messages table | supabase.insert direction:'outbound' HANDOFF SUGERIDO | ✓ WIRED | :1120-1127, admin client. |
| agent-production / webhook-handler | messages [ERROR AGENTE] insert | guard !(V4_ZOMBIE && ckpt_0_post_acquire) | ✓ WIRED | Both paths guarded. |
| engineOutput → SomnioEngineResult | result.handoffSuggested | mapping in catch/return | ✓ WIRED | :995-996 propagation. |

### Data-Flow Trace (Level 4)

The soft-signal field flows: v4 agent `decisionInfo.reason` → runner `mapResult` sets `handoffSuggested:true` + derived `gate` → `EngineOutput` → mapped into `SomnioEngineResult.handoffSuggested` → consumed in webhook-processor `result.handoffSuggested` gate → drives both (a) suppression of executeHandoff and (b) inbox note insert. Real data confirmed via passing test that emits the populated `handoff_suggested` payload with concrete `reason: 'out_of_scope'`, `gate: 'no_kb'`. Not HOLLOW.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Typecheck predicts green build | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| v4 agent + vision deterministic suites | `vitest run somnio-v4-agent.test.ts vision-branch.test.ts` | 21/21 pass | ✓ PASS |
| Only v4 runner sets handoffSuggested:true (Regla 6) | `grep -rn "handoffSuggested:\s*true" src/lib/agents` | 1 match (v4 runner) | ✓ PASS |
| zombie_lambda_exit mechanism preserved | `grep -c zombie_lambda_exit checkpoints.ts` | 1 | ✓ PASS |
| Live RAG smokes (out of scope) | smoke-rag-b.test.ts | non-deterministic LLM | ? SKIP — requires API keys; independent of this additive diff |

### Requirements Coverage

All plans declare `requirements: []` (standalone, no REQUIREMENTS.md IDs). Decision coverage D-01..D-08 from CONTEXT.md:

| Decision | Status | Evidence |
| -------- | ------ | -------- |
| D-01 (signal at real determination points) | ✓ SATISFIED | 4 agent emit sites + runner derivation map. |
| D-02 (exclude interrupted_at_ckpt_*) | ✓ SATISFIED | :870 guard. |
| D-03 (signal contract) | ✓ SATISFIED | Payload shape confirmed in tests + EngineOutput.handoffSignal. |
| D-04 (soft = default, no flag, suppress storage.handoff) | ✓ SATISFIED | No feature flag added; storage.handoff removed. |
| D-05 (inbox note as suggestion) | ✓ SATISFIED | HANDOFF SUGERIDO direction:outbound. |
| D-06 (zombie ckpt_0 suppression) | ✓ SATISFIED | Both paths guarded; observability kept. |
| D-07 (Regla 6 additive) | ✓ SATISFIED | Only v4 runner sets flag; non-v4 unaffected. |
| D-08 (R0/R1 minimal ack vs silence) | ✓ SATISFIED | rag:handoff_ack injected at :536-546; content-gaps stay silent. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| webhook-processor.ts | 1117-1136 | (none — soft branch is a real insert, not a stub) | — | The Plan 01 logger.info skeleton was correctly replaced by Plan 02 with the real insert. |

No blockers. `topic: undefined` at the runner level is documented as intentional (the granular per-slot topic flows via the resolveLowSlot event's `outcome.sourceTopic`). The `conversationId/turnId: null` in agent emit sites is a documented deviation (V4AgentInput does not expose them; sessionId is the proxy) — does not affect goal achievement.

### Human Verification Required

Two manual-only checks per VALIDATION.md (both blocked by v4 being DORMANT — no live traffic):

1. **Inbox note render** — After activation/sandbox, trigger a content-gap handoff (e.g. low_confidence) and confirm a `direction:'outbound'` note "⚠ HANDOFF SUGERIDO — motivo: X" appears in the inbox WITHOUT a WhatsApp send. (Code path verified; only the live UI render + no-send is unverifiable statically.)
2. **Zombie ckpt_0 suppression** — Send 2 rapid messages to a v4 conversation; confirm no "[ERROR AGENTE] V4_ZOMBIE_LAMBDA_EXIT" note in inbox while `zombie_lambda_exit` still appears in `agent_observability_events`. (Guard logic verified; only the live timing-dependent benign-zombie reproduction is unverifiable statically.)

### Gaps Summary

No gaps. All 22 automatable must-haves across the three plans are verified in the actual codebase: storage.handoff is removed from the v4 runner, executeHandoff is correctly gated on `!handoffSuggested` (Regla 6 — only the v4 runner ever sets the flag, so all other agents are untouched), the 4 handoff_suggested emit sites fire with the D-03 payload (D-02 interruption exclusion + D-08 R0/R1 ack both present), the inbox note inserts as a direction:'outbound' admin-client note only on the soft path, and the zombie ckpt_0 [ERROR AGENTE] suppression is applied to both insert paths while preserving the observability event. tsc exits 0 and the named deterministic suites pass.

The status is `human_needed` (not `passed`) solely because VALIDATION.md defines two manual-only verifications that require live v4 traffic, which is impossible while v4 is DORMANT. These are NOT gaps — the underlying code paths are statically verified; only the live visual/timing behaviors await activation.

**Out-of-scope known failures (not regressions, per orchestrator):**
- `interruption-system-v2/__tests__/restart-loop.test.ts` S1 — PRE-EXISTING at base commit 08b5743a, unrelated to this additive diff.
- `smoke-rag-b.test.ts` razonamiento_libre cases — non-deterministic live-LLM smokes requiring API keys.

---

_Verified: 2026-06-14T21:05:00Z_
_Verifier: Claude (gsd-verifier)_

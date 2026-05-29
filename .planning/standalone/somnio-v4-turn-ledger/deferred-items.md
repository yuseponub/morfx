# Deferred Items — somnio-v4-turn-ledger

Pre-existing issues discovered during execution, out of scope for this standalone.

## Plan 01

- **Pre-existing tsc error (not introduced by this plan):**
  `src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts:213,218`
  — `intentInfo` fixtures omit required `timestamp` field. Present at HEAD before any
  Plan 01 change (verified via `git stash` + tsc). Out of scope (SCOPE BOUNDARY).

- **Flaky live-LLM smoke failures (not introduced by this plan):**
  - `smoke-rag-a.test.ts > Smoke A > 15. apnea` — `AI_RetryError: This model is
    currently experiencing high demand` (live Gemini/GPT overload, network/quota).
  - `smoke-rag-b.test.ts > Smoke B > 1. razonamiento_libre` — assertion
    `expected 'generated' to be 'no_match'` (live model classification nondeterminism).
  Both hit real `kb_search` embeddings + live model generation (120s timeouts) in the
  RAG sub-loop — a code path this plan did NOT touch (types + serialization only).
  Out of scope (SCOPE BOUNDARY). The deterministic suites + `state.test.ts` (7/7) pass.

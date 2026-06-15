---
phase: v4-llm-fallback-resilience
plan: 05
type: execute
wave: 4
depends_on: [04]
files_modified:
  - scripts/_repro-gemini-schema.ts
autonomous: false
requirements: [D-08]
user_setup:
  - service: vercel
    why: "RESEND_API_KEY must be set in Vercel for credits/critical emails to actually arrive. Deploy is fail-soft without it."
    env_vars:
      - name: RESEND_API_KEY
        source: "resend.com/api-keys → Vercel env (Sensitive). Verify >0 chars after pull; redeploy after set."

must_haves:
  truths:
    - "The whole somnio-v4 test suite + tsc are green before push (no regression to the LIVE agent)"
    - "The change is deployed to Vercel main (Regla 1) before asking the operator to verify in prod"
    - "The D-08 repro script tells the operator to recharge when it detects a credits-depleted error (optional, manual)"
    - "D-08 schema-slim remains OUT of scope — comprehension-schema.ts is NOT modified"
  artifacts:
    - path: "scripts/_repro-gemini-schema.ts"
      provides: "credits-depleted detection branch advising recharge (D-08 optional)"
      contains: "credits"
  key_links:
    - from: "all prior plans"
      to: "Vercel prod"
      via: "git push origin main"
      pattern: "git push"
---

<objective>
Ship the phase: run the full v4 regression + tsc to prove the LIVE agent is not broken, add the optional D-08 credits-detection branch to the repro script (NOT schema-slim — that stays out of scope), push to Vercel (Regla 1), then a human checkpoint to (a) optionally set RESEND_API_KEY, (b) re-run the D-08 repro with a credited Gemini key, (c) verify in prod.

Purpose: D-08 (verify, don't assume) as a manual post-recharge task; Regla 1 (push before asking the operator to test); Regla 6 (no regression to the live agent).
Output: repro branch + deployed code + documented operator verification steps.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-llm-fallback-resilience/CONTEXT.md
@.planning/standalone/v4-llm-fallback-resilience/RESEARCH.md
@.planning/standalone/v4-llm-fallback-resilience/03-SUMMARY.md
@.planning/standalone/v4-llm-fallback-resilience/04-SUMMARY.md

<interfaces>
<!-- scripts/_repro-gemini-schema.ts already has a union-types branch (line 65-72) in the catch.
     The `otherErr` branch (line 70-72) currently just prints the raw error. D-08 adds a credits-detection
     sub-branch there. The script loads .env.local GOOGLE_GENERATIVE_AI_API_KEY and runs 5 calls. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: D-08 — credits-detection branch in repro script (NO schema-slim)</name>
  <read_first>
    - scripts/_repro-gemini-schema.ts (full file — the catch at lines 63-73, the union/other branches)
    - CONTEXT.md D-08 (schema-slim OUT of scope; repro is verification, not implementation)
  </read_first>
  <action>
    In the `catch` of the repro loop, add a credits-detection sub-branch BEFORE the generic `otherErr` print, mirroring the new isGeminiBillingError regex:
    ```typescript
    const isCredits = /prepayment credits are depleted|billing|insufficient.*credit|RESOURCE_EXHAUSTED[^]*quota/i.test(msg)
    if (isUnion) {
      // ... existing union branch ...
    } else if (isCredits) {
      otherErr++
      console.log(`  [${i}/${RUNS}] 💳 KEY SIN SALDO — la key de Gemini no tiene créditos. Recargá y reintentá.`)
      console.log(`     (Este repro NO prueba el límite del schema mientras la key esté sin saldo — D-08.)`)
    } else {
      // ... existing otherErr branch ...
    }
    ```
    Do NOT modify `src/lib/agents/somnio-v4/comprehension-schema.ts` (D-08 — schema-slim out of scope). The repro is the ONLY D-08 change.
  </action>
  <verify>
    <automated>grep -qi "SIN SALDO\|credits" scripts/_repro-gemini-schema.ts && grep -c "MessageAnalysisSchema" src/lib/agents/somnio-v4/comprehension-schema.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - credits branch present: `grep -qi "SIN SALDO\|recarg" scripts/_repro-gemini-schema.ts`
    - schema file UNCHANGED in this phase: `git diff --name-only | grep -q "comprehension-schema.ts"` returns NON-zero (i.e. NOT modified)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Repro advises recharge on credits-depleted; comprehension-schema.ts untouched.</done>
</task>

<task type="auto">
  <name>Task 2: Full regression + push to Vercel (Regla 1)</name>
  <read_first>
    - CLAUDE.md Regla 1 (push to Vercel) + Regla 6 (protect live agent)
    - .claude/rules/code-changes.md (atomic commits, push before user test)
  </read_first>
  <action>
    Run the gates and, only if green, commit + push:
    1. `npx tsc --noEmit` (must be 0).
    2. Full v4 fallback + agent suites: `npx vitest run src/lib/agents/somnio-v4/llm-fallback/__tests__/ src/lib/agents/somnio-v4/__tests__/ src/lib/agents/_shared/__tests__/alerts-llm.test.ts`.
    3. Regla 6 no-regression baseline — run a representative non-v4 agent suite to prove no spillover: `npx vitest run src/lib/agents/godentist/__tests__/` (and recompra/pw if quick). Must stay green.
    4. Commit atomically (Spanish message, co-authored) and `git push origin main`:
       `git add src/lib/agents/somnio-v4/llm-fallback src/lib/agents/_shared/alerts.ts src/lib/agents/_shared/__tests__ src/lib/agents/somnio-v4/somnio-v4-agent.ts src/lib/agents/somnio-v4/__tests__ src/lib/agents/engine/v4-production-runner.ts src/lib/agents/production/webhook-processor.ts scripts/_repro-gemini-schema.ts`
       then `git commit` then `git push origin main`.
    If any gate fails, STOP and fix before pushing (never push incomplete work — code-changes.md).
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run src/lib/agents/somnio-v4/llm-fallback/__tests__/ src/lib/agents/somnio-v4/__tests__/ src/lib/agents/_shared/__tests__/alerts-llm.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npx tsc --noEmit` exits 0
    - v4 + alerts suites exit 0
    - non-v4 baseline green: `npx vitest run src/lib/agents/godentist/__tests__/` exits 0 (Regla 6)
    - pushed: `git log origin/main -1 --oneline` shows the new commit (run after push)
  </acceptance_criteria>
  <done>All gates green incl. a non-v4 baseline; change committed and pushed to origin/main.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Operator verification — RESEND_API_KEY, D-08 repro, prod smoke</name>
  <what-built>
    Fallback now covers Gemini credits-depleted + union-types → Haiku (bot stays alive), emits llm_credits_depleted / gemini_schema_capacity_fallback events, sends a NORMAL credits email + CRITICAL both-down email (fail-soft), and on double-fail flags a soft handoff that coexists with [ERROR AGENTE]. Deployed to Vercel main.
  </what-built>
  <how-to-verify>
    1. (For emails to ARRIVE) In Vercel, set `RESEND_API_KEY` (resend.com/api-keys). Gotcha (memory vercel_env_gotchas): Sensitive vars pull empty — verify >0 chars; redeploy after setting. Without it, the deploy is fail-soft (events + handoff still work, emails just log a warning). Optionally set `platform_config.crm_bot_alert_from` to a DKIM-verified domain to avoid spam.
    2. (D-08 — verify, don't assume) With a Gemini key that HAS credits in `.env.local`, run: `npx tsx scripts/_repro-gemini-schema.ts`. Interpret:
       - 5/5 OK → Gemini accepts the 17-anyOf schema → schema-slim is dead debt (D-08 closed).
       - any "union types" rejection → the schema limit is real independent of credits → reopen schema-slim as a SEPARATE phase.
       - "💳 KEY SIN SALDO" → the key has no credits; recharge and re-run before concluding.
    3. (Prod smoke, optional) When a real Gemini outage occurs (or by temporarily exhausting credits), confirm: the bot keeps responding via Haiku; an `llm_credits_depleted` event appears in the sandbox debug panel / agent_observability_events; a NORMAL email arrives (if RESEND set). For a forced double-fail, confirm BOTH the [ERROR AGENTE] note and the ⚠ HANDOFF SUGERIDO note appear in the inbox and a CRITICAL email arrives.
  </how-to-verify>
  <resume-signal>Type "approved" with the D-08 repro result (accepts/rejects), or describe issues.</resume-signal>
  <acceptance_criteria>
    - Operator has run the D-08 repro and reported the result (accepts → close schema-slim; rejects → reopen as separate phase).
    - Operator confirms prod behavior OR explicitly defers the live-outage smoke.
  </acceptance_criteria>
  <done>Operator has set RESEND_API_KEY (or accepted fail-soft), reported the D-08 repro outcome, and verified/deferred the prod smoke.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repro script → local Gemini key | Reads .env.local key only; no prod/Vercel egress |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-fb-07 | Availability (regression to live agent) | full deploy | mitigate | tsc + v4 suite + non-v4 baseline gate before push; Regla 6 — change is additive + v4-scoped. |
| T-fb-08 | Information disclosure | repro script | accept | Script is local-only, reads .env.local; never pushes secrets; no PII (uses 'hola' fixture). |
</threat_model>

<verification>
- `npx tsc --noEmit` exits 0
- v4 + alerts suites exit 0; non-v4 baseline green (Regla 6)
- code pushed to origin/main (Regla 1)
- comprehension-schema.ts NOT modified (D-08 scope)
</verification>

<success_criteria>
Phase shipped to Vercel with green v4 + non-v4 baselines; D-08 handled as a manual repro/verification (schema-slim untouched); operator has RESEND guidance + prod-verification steps.
</success_criteria>

<output>
After completion, create `.planning/standalone/v4-llm-fallback-resilience/05-SUMMARY.md`
</output>

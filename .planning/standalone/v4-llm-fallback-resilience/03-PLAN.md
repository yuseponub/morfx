---
phase: v4-llm-fallback-resilience
plan: 03
type: execute
wave: 2
depends_on: [01, 02]
files_modified:
  - src/lib/agents/somnio-v4/llm-fallback/index.ts
  - src/lib/agents/somnio-v4/llm-fallback/__tests__/index.test.ts
autonomous: true
requirements: [D-01, D-02, D-04, D-06, D-07]

must_haves:
  truths:
    - "A credits-depleted or union-types Gemini error falls back to Haiku instead of re-throwing"
    - "A genuine parse/schema error (NoObjectGeneratedError) still re-throws WITHOUT fallback (Pitfall #4)"
    - "On billing error → emit llm_credits_depleted event + fire sendLLMCreditsDepletedAlert (NORMAL)"
    - "On schema-capacity error → emit gemini_schema_capacity_fallback event (noisy, D-02)"
    - "On double-fail (Gemini fails AND Haiku fails) → fire sendBothProvidersDownAlert (CRITICAL) and throw an error whose message carries the sentinel prefix llm_providers_down:"
    - "workspaceId is read via getCollector()?.workspaceId without changing the 4 call-site signatures"
  artifacts:
    - path: "src/lib/agents/somnio-v4/llm-fallback/index.ts"
      provides: "billing/schema-cap branches + email wiring + double-fail sentinel"
      contains: "llm_providers_down:"
  key_links:
    - from: "index.ts catch branch"
      to: "isGeminiBillingError / isGeminiSchemaCapacity (Plan 01)"
      via: "import + predicate call"
      pattern: "isGeminiBillingError"
    - from: "index.ts billing branch"
      to: "sendLLMCreditsDepletedAlert (Plan 02)"
      via: "void import-and-call"
      pattern: "sendLLMCreditsDepletedAlert"
    - from: "index.ts double-fail branch"
      to: "agent sentinel detection (Plan 04)"
      via: "thrown error message prefix"
      pattern: "llm_providers_down:"
---

<objective>
Wire the orchestrator `callWithGeminiFallback` (the single chokepoint for all 4 call-sites) to: (1) fall back to Haiku on billing + schema-capacity errors (D-01/D-02), keeping Pitfall #4 intact; (2) emit the two new events; (3) fire the NORMAL credits email on billing; (4) on double-fail fire the CRITICAL email AND throw a sentinel-prefixed error (`llm_providers_down:`) that survives comprehension's re-wrap so Plan 04's agent can early-return a soft handoff.

Purpose: this is the heart of the phase — D-01/D-02/D-04/D-06/D-07 all converge in this one file. workspaceId comes from `getCollector()?.workspaceId` (no signature changes — RESEARCH Q3).
Output: extended `index.ts` + tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-llm-fallback-resilience/CONTEXT.md
@.planning/standalone/v4-llm-fallback-resilience/RESEARCH.md
@.planning/standalone/v4-llm-fallback-resilience/01-SUMMARY.md
@.planning/standalone/v4-llm-fallback-resilience/02-SUMMARY.md

<interfaces>
<!-- The current orchestrator. From src/lib/agents/somnio-v4/llm-fallback/index.ts. -->
Current catch (lines 67-100): `const isSaturation = isGeminiSaturation(err); const isTimeout = isTimeoutError(err); if (!isSaturation && !isTimeout) throw err` then openBreaker + emit fallback_triggered → `try { return await callAnthropic() } catch (anthropicErr) { emit fallback_failed; throw anthropicErr }`.
There is ALSO a circuit-open path (lines 36-53) that calls Haiku directly and has its OWN double-fail catch (emits fallback_failed + throw).

From Plan 01 (saturation.ts): `export function isGeminiBillingError(err): boolean`, `export function isGeminiSchemaCapacity(err): boolean`.
From Plan 01 (observability.ts): labels `'llm_credits_depleted'` { callSite, provider:'gemini', errorCode }, `'gemini_schema_capacity_fallback'` { callSite, errorCode }.
From Plan 02 (alerts.ts): `sendLLMCreditsDepletedAlert({ workspaceId, provider:'gemini', callSite })`, `sendBothProvidersDownAlert({ workspaceId, callSite, geminiError, anthropicError })`.
From collector: `import { getCollector } from '@/lib/observability'` → `getCollector()?.workspaceId` (string | undefined).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Billing + schema-capacity branches in the catch (Pitfall #4 intact)</name>
  <read_first>
    - src/lib/agents/somnio-v4/llm-fallback/index.ts (full file — both the main catch AND the circuit-open path)
    - 01-SUMMARY.md (exact predicate names) and 02-SUMMARY.md (exact alert function signatures)
  </read_first>
  <behavior>
    - gemini() throws billing error → predicate isGeminiBillingError true → does NOT re-throw → emits llm_credits_depleted → fires sendLLMCreditsDepletedAlert → calls callAnthropic() (Haiku) → returns Haiku result
    - gemini() throws union-types error → isGeminiSchemaCapacity true → emits gemini_schema_capacity_fallback → falls to Haiku → returns
    - gemini() throws NoObjectGeneratedError (none of the 4 predicates) → re-throws WITHOUT fallback, no email, no new events (Pitfall #4)
    - gemini() throws saturation/timeout → existing behavior unchanged
  </behavior>
  <action>
    Add imports at top of index.ts:
    ```typescript
    import { isGeminiSaturation, isTimeoutError, isGeminiBillingError, isGeminiSchemaCapacity } from './saturation'
    import { getCollector } from '@/lib/observability'
    ```
    Compute once near the catch start:
    ```typescript
    const isSaturation = isGeminiSaturation(err)
    const isTimeout    = isTimeoutError(err)
    const isBilling    = isGeminiBillingError(err)
    const isSchemaCap  = isGeminiSchemaCapacity(err)
    // Pitfall #4 — parse/schema/NoObjectGenerated → re-throw, NO fallback.
    if (!isSaturation && !isTimeout && !isBilling && !isSchemaCap) throw err
    ```
    After the existing openBreaker + circuit_opened/probe_failed emits, BEFORE the `try { return await callAnthropic() }`, add the discriminated reporting:
    ```typescript
    const workspaceId = getCollector()?.workspaceId
    if (isBilling) {
      emitFallbackEvent('llm_credits_depleted', { callSite, provider: 'gemini', errorCode })
      // fail-soft fire-and-forget — NEVER await, NEVER let it break the Haiku turn.
      void (async () => {
        const { sendLLMCreditsDepletedAlert } = await import('@/lib/agents/_shared/alerts')
        await sendLLMCreditsDepletedAlert({ workspaceId, provider: 'gemini', callSite })
      })()
    }
    if (isSchemaCap) {
      // D-02 — evento RUIDOSO (no enmascarar en silencio). Cubierto por Haiku con schema saneado.
      emitFallbackEvent('gemini_schema_capacity_fallback', { callSite, errorCode })
    }
    ```
    Keep `errorKind` enrichment optional — billing/schemaCap can reuse the existing 'saturation'/'timeout' errorKind branch OR add `: isBilling ? 'billing' : isSchemaCap ? 'schema_capacity' :` to the existing ternary; do whichever keeps the existing fallback_triggered emit type-valid. Do NOT pass user content anywhere (T-fb-01).
    NOTE: the `void import(...)` dynamic import keeps the leaf fallback module from a static dependency on alerts.ts/domain (lighter cold-start surface). errorCode = `err instanceof Error ? err.name : String(err)` (already computed in the file as `errorCode`).
  </action>
  <verify>
    <automated>grep -q "isGeminiBillingError(err)" src/lib/agents/somnio-v4/llm-fallback/index.ts && grep -q "isGeminiSchemaCapacity(err)" src/lib/agents/somnio-v4/llm-fallback/index.ts && grep -q "llm_credits_depleted" src/lib/agents/somnio-v4/llm-fallback/index.ts && grep -q "gemini_schema_capacity_fallback" src/lib/agents/somnio-v4/llm-fallback/index.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - all 4 predicates referenced in the guard: `grep -q "!isSaturation && !isTimeout && !isBilling && !isSchemaCap" src/lib/agents/somnio-v4/llm-fallback/index.ts`
    - billing email wired fail-soft (void, not awaited at top level): `grep -q "sendLLMCreditsDepletedAlert" src/lib/agents/somnio-v4/llm-fallback/index.ts`
    - workspaceId via collector, no signature change: `grep -q "getCollector()?.workspaceId" src/lib/agents/somnio-v4/llm-fallback/index.ts` AND the function signature still only accepts `{ callSite, gemini, anthropic }`: `grep -q "callSite: CallSite" src/lib/agents/somnio-v4/llm-fallback/index.ts`
    - T-fb-01: no user-content variable passed to emit/alert (`grep -E "message:|userMessage|body:" src/lib/agents/somnio-v4/llm-fallback/index.ts` shows only payload keys, no user text — manual confirm; automated: `grep -c "input.message\|userMessage" src/lib/agents/somnio-v4/llm-fallback/index.ts` returns 0)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Billing/schema-cap errors fall to Haiku with the right events + NORMAL email; Pitfall #4 re-throw intact; no signature changes; T-fb-01 respected.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Double-fail → CRITICAL email + sentinel throw (D-06/D-07b)</name>
  <read_first>
    - src/lib/agents/somnio-v4/llm-fallback/index.ts (BOTH double-fail catch blocks: the circuit-open path ~lines 45-52 AND the post-saturation path ~lines 92-99)
    - .planning/standalone/v4-llm-fallback-resilience/RESEARCH.md §Q6 (sentinel must survive comprehension re-wrap) + Pitfall #7
  </read_first>
  <behavior>
    - gemini billing/saturation → Haiku ALSO throws → emits fallback_failed (existing) → fires sendBothProvidersDownAlert (CRITICAL) → re-throws an Error whose .message STARTS WITH `llm_providers_down:`
    - The sentinel prefix is on the THROWN error so it survives comprehension.ts's `new Error(...)` re-wrap (which preserves message text)
    - Single-provider success (Gemini fails, Haiku OK) → NO sentinel, NO critical email (only the credits email if billing)
    - The circuit-open path's double-fail ALSO fires the critical email + sentinel (RESEARCH M-02: most calls during a sustained outage go through circuit-open)
  </behavior>
  <action>
    Define a module-level constant: `export const PROVIDERS_DOWN_SENTINEL = 'llm_providers_down:'`.
    In BOTH double-fail catch blocks (circuit-open path AND post-saturation path), after the existing `emitFallbackEvent('fallback_failed', {...})`, add:
    ```typescript
    const workspaceId = getCollector()?.workspaceId
    void (async () => {
      const { sendBothProvidersDownAlert } = await import('@/lib/agents/_shared/alerts')
      await sendBothProvidersDownAlert({
        workspaceId,
        callSite,
        geminiError: <the gemini-side code>,        // circuit-open: 'circuit_open'; sat path: errorCode
        anthropicError: anthropicErr instanceof Error ? anthropicErr.name : String(anthropicErr),
      })
    })()
    // D-06 — sentinel que sobrevive el re-wrap de comprehension → Plan 04 lo detecta y hace handoff suave.
    throw new Error(`${PROVIDERS_DOWN_SENTINEL} callSite=${callSite} gemini=<code> anthropic=${anthropicErr instanceof Error ? anthropicErr.name : String(anthropicErr)}`)
    ```
    Replace `<the gemini-side code>` / `<code>` appropriately per path (circuit-open uses the literal `'circuit_open'`; the post-saturation path uses the existing `errorCode` var). The thrown message must contain ONLY error NAMES + callSite — NO user content, NO stack, NO API keys (T-fb-01). The string MUST start with the sentinel constant so `message.startsWith(PROVIDERS_DOWN_SENTINEL)` is true even after re-wrap embeds it mid-string (Plan 04 uses `.includes(PROVIDERS_DOWN_SENTINEL)` to be re-wrap-robust — RESEARCH Q6/Pitfall #7).
    Keep emails fire-and-forget (`void`), never awaited inline, never able to mask the throw.
  </action>
  <verify>
    <automated>grep -q "PROVIDERS_DOWN_SENTINEL" src/lib/agents/somnio-v4/llm-fallback/index.ts && grep -q "sendBothProvidersDownAlert" src/lib/agents/somnio-v4/llm-fallback/index.ts && grep -c "sendBothProvidersDownAlert" src/lib/agents/somnio-v4/llm-fallback/index.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - sentinel constant exported: `grep -q "export const PROVIDERS_DOWN_SENTINEL = 'llm_providers_down:'" src/lib/agents/somnio-v4/llm-fallback/index.ts`
    - critical email fired in BOTH double-fail paths: `grep -c "sendBothProvidersDownAlert" src/lib/agents/somnio-v4/llm-fallback/index.ts` returns >= 2
    - sentinel thrown in BOTH double-fail paths: `grep -c "PROVIDERS_DOWN_SENTINEL}" src/lib/agents/somnio-v4/llm-fallback/index.ts` returns >= 2 (interpolated into throw)
    - existing fallback_failed emits preserved: `grep -c "fallback_failed" src/lib/agents/somnio-v4/llm-fallback/index.ts` returns >= 2
    - T-fb-01: thrown message uses err.name only: `grep -c "input.message\|userMessage\|\.stack" src/lib/agents/somnio-v4/llm-fallback/index.ts` returns 0
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Both double-fail paths fire the CRITICAL email and throw a sentinel-prefixed, PII-safe error; single-provider success unaffected.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Orchestrator tests — branches, Pitfall #4, double-fail sentinel</name>
  <read_first>
    - src/lib/agents/somnio-v4/llm-fallback/__tests__/index.test.ts (existing structure — closures gemini/anthropic, __resetBreakers, how it asserts fallback)
  </read_first>
  <behavior>
    Add cases on top of the existing index suite. Mock `@/lib/agents/_shared/alerts` (vi.mock) so the two send fns are spies. Mock `@/lib/observability` getCollector to return `{ workspaceId: 'ws-test' }`.
    - billing error from gemini, anthropic OK → returns anthropic result; sendLLMCreditsDepletedAlert spy called once; llm_credits_depleted recorded.
    - union-types error, anthropic OK → returns; gemini_schema_capacity_fallback recorded; NO credits email.
    - NoObjectGeneratedError from gemini → throws SAME error; NO fallback call to anthropic; NO email (Pitfall #4).
    - billing error AND anthropic throws → final thrown error message includes 'llm_providers_down:'; sendBothProvidersDownAlert spy called.
  </behavior>
  <action>
    Extend index.test.ts. Use `vi.mock('@/lib/agents/_shared/alerts', () => ({ sendLLMCreditsDepletedAlert: vi.fn(), sendBothProvidersDownAlert: vi.fn() }))` and `vi.mock('@/lib/observability', ...)` returning a getCollector stub. Because the email calls are `void (async () => { await import(...) })()` fire-and-forget, await a microtask flush (`await new Promise(r => setTimeout(r, 0))`) before asserting the spy. Construct billing/union/NoObjectGenerated errors with the same `apiError`/constructor helpers used in saturation.test.ts (copy them or import). Assert thrown sentinel with `await expect(callWithGeminiFallback(...)).rejects.toThrow(/llm_providers_down:/)`.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/llm-fallback/__tests__/index.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run src/lib/agents/somnio-v4/llm-fallback/__tests__/index.test.ts` exits 0
    - sentinel assertion present: `grep -q "llm_providers_down" src/lib/agents/somnio-v4/llm-fallback/__tests__/index.test.ts`
    - Pitfall #4 case present (NoObjectGeneratedError re-throw, no anthropic call): `grep -q "NoObjectGeneratedError" src/lib/agents/somnio-v4/llm-fallback/__tests__/index.test.ts`
    - full suite green: `npx vitest run src/lib/agents/somnio-v4/llm-fallback/__tests__/` exits 0
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Orchestrator branch coverage incl. Pitfall #4 + double-fail sentinel + email spies; whole fallback suite green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Gemini error → orchestrator → email/event | Provider error text crosses into events + email + thrown sentinel |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-fb-01 | Information disclosure | events + thrown sentinel + email args | mitigate | Only callSite/provider/err.name passed; acceptance grep forbids input.message/userMessage/.stack in index.ts. |
| T-fb-04 | Availability | fire-and-forget email | mitigate | Emails are `void (async...)()`, never awaited inline, never throw past the catch — a Haiku-saved turn cannot be broken by Resend. |
| T-fb-02 | Tampering (masking) | Pitfall #4 guard | mitigate | 4-predicate guard re-throws genuine errors; test asserts NoObjectGeneratedError re-throws with no anthropic call. |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/somnio-v4/llm-fallback/__tests__/` exits 0
- `npx tsc --noEmit` exits 0
- Regla 6: only `llm-fallback/index.ts` + its test touched.
</verification>

<success_criteria>
The single chokepoint falls back to Haiku on billing+union-types (Pitfall #4 intact), emits the two events, fires the NORMAL credits email, and on double-fail fires the CRITICAL email + throws the re-wrap-surviving sentinel — all PII-safe and fail-soft.
</success_criteria>

<output>
After completion, create `.planning/standalone/v4-llm-fallback-resilience/03-SUMMARY.md`
</output>

---
phase: v4-llm-fallback-resilience
plan: 04
type: execute
wave: 3
depends_on: [03]
files_modified:
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts
  - src/lib/agents/engine/v4-production-runner.ts
  - src/lib/agents/production/webhook-processor.ts
  - src/lib/agents/somnio-v4/__tests__/double-fail-handoff.test.ts
autonomous: true
requirements: [D-05, D-06]

must_haves:
  truths:
    - "When the fallback double-fails, the sentinel llm_providers_down: survives comprehension's re-wrap and reaches the agent catch"
    - "The agent catch detects the sentinel and returns an error output flagged for handoff (requiresHuman + handoffReasonDetail + newMode 'handoff') while keeping success:false"
    - "The runner emits handoffSuggested + handoffSignal on the error output when the agent flagged a double-fail handoff"
    - "The inbox shows BOTH a [ERROR AGENTE] note (D-05, success:false) AND a ⚠ HANDOFF SUGERIDO note (D-06) for a double-fail turn — they coexist"
    - "Single-provider success (Gemini→Haiku OK) produces NO [ERROR AGENTE] and NO handoff note (success turn)"
    - "Genuine non-sentinel errors keep the existing error behavior unchanged (no handoff flag injected)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/somnio-v4-agent.ts"
      provides: "sentinel detection in the catch → handoff-flagged error return"
      contains: "PROVIDERS_DOWN_SENTINEL"
    - path: "src/lib/agents/engine/v4-production-runner.ts"
      provides: "handoffSuggested on error output for double-fail"
    - path: "src/lib/agents/production/webhook-processor.ts"
      provides: "soft-handoff note that coexists with [ERROR AGENTE]"
  key_links:
    - from: "index.ts thrown sentinel (Plan 03)"
      to: "agent catch detection"
      via: "errMsg.includes(PROVIDERS_DOWN_SENTINEL)"
      pattern: "PROVIDERS_DOWN_SENTINEL"
    - from: "agent error output (handoff-flagged)"
      to: "webhook-processor soft note"
      via: "runner handoffSuggested mapping"
      pattern: "handoffSuggested"
---

<objective>
Close the D-06 loop: a fallback double-fail throws a sentinel-prefixed error (Plan 03) that survives comprehension's re-wrap and reaches the agent catch; the catch detects it and returns an error output flagged for a SOFT handoff so a human attends — WITHOUT suppressing the `[ERROR AGENTE]` note (D-05, the user wants max raw visibility). The two notes coexist for a double-fail turn.

Purpose: D-05 (keep `[ERROR AGENTE]` always) + D-06 (double-fail → soft handoff so the client is not left with a technical error). RESEARCH Q6 + the D-05↔D-06 reconciliation in CONTEXT.md D-05 (coexistence) is the authority.
Output: agent catch detection + runner error-path handoff mapping + webhook-processor coexisting note + tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-llm-fallback-resilience/CONTEXT.md
@.planning/standalone/v4-llm-fallback-resilience/RESEARCH.md
@.planning/standalone/v4-llm-fallback-resilience/03-SUMMARY.md

<interfaces>
<!-- Agent catch (somnio-v4-agent.ts ~1125-1166): success:false error return with errorMessage/errorStage,
     preserves input.* state, totalTokens:0. errMsg = error.message. The sentinel from Plan 03 lives in errMsg
     (comprehension.ts:197-201 re-wraps in new Error but EMBEDS the original message → sentinel survives as substring). -->
<!-- Existing interrupted_at_ckpt_* pattern uses errorMessage prefix discriminators (lines 405, 608, 811, 863). -->

<!-- V4AgentOutput (types.ts): has requiresHuman?, handoffReasonDetail?, newMode?, errorMessage?, errorStage?, success.
     Does NOT have handoffSuggested (that is EngineOutput-only — the runner synthesizes it). -->

<!-- Runner (v4-production-runner.ts:598-663): 
     outputDiscarded = result.outputDiscarded === true
     suppressTurnEffects = outputDiscarded || result.wasInterruptedWithZeroSends
     error block (630-633): { code:'V4_AGENT_ERROR', message: buildCleanErrorMessage(output) } when !output.success
     handoff block (637-662): fires handoffSuggested+handoffSignal ONLY when output.newMode==='handoff' && !suppressTurnEffects -->

<!-- webhook-processor.ts:
     line 1117: soft note guard `if (result.success && result.newMode === 'handoff' && result.handoffSuggested)` → inserts `⚠ HANDOFF SUGERIDO — motivo: ...` (direction outbound, NOT to WhatsApp)
     The [ERROR AGENTE] note is inserted in webhook-handler.ts:546-561 when `!agentResult.success && agentResult.error` -->

From Plan 03 (index.ts): `export const PROVIDERS_DOWN_SENTINEL = 'llm_providers_down:'`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Agent catch detects sentinel → handoff-flagged error return</name>
  <read_first>
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts lines 1125-1166 (the catch + error return) AND the interrupted_at_ckpt_* early-returns (405, 608) as the discriminator molde
    - src/lib/agents/somnio-v4/comprehension.ts lines 184-202 (confirm the re-wrap embeds errMsg → sentinel survives as substring)
    - 03-SUMMARY.md (confirm PROVIDERS_DOWN_SENTINEL export name + path)
  </read_first>
  <behavior>
    - A double-fail at the comprehension call-site → comprehend() throws → re-wrapped error reaches the agent catch → errMsg.includes('llm_providers_down:') → the returned V4AgentOutput has success:false (D-05 keeps [ERROR AGENTE]) AND requiresHuman:true AND handoffReasonDetail:'ambos proveedores LLM caídos' AND newMode:'handoff'
    - A genuine non-sentinel error (e.g. NoObjectGeneratedError surfaced) → returns the EXISTING error shape, NO handoff flag injected (requiresHuman/newMode untouched)
  </behavior>
  <action>
    Import the sentinel: `import { PROVIDERS_DOWN_SENTINEL } from './llm-fallback'`. CONFIRMED by checker against live code: the constant is defined+exported directly in `llm-fallback/index.ts` (Plan 03 Task 2) and `'./llm-fallback'` resolves to that index.ts — so this import works as-is. There is NO barrel re-export today and you do NOT need to add one. Verify the export name in 03-SUMMARY.md only.
    In the catch block (around line 1125), compute `const isProvidersDown = errMsg.includes(PROVIDERS_DOWN_SENTINEL)` (use `.includes`, NOT `.startsWith` — the re-wrap embeds the sentinel mid-string; RESEARCH Q6/Pitfall #7).
    Keep the existing `recordV4Event('engine_error', ...)` emit (D-05 visibility — do NOT suppress).
    In the returned error object (the `return { success: false, ... }`), conditionally add the handoff flags ONLY when isProvidersDown:
    ```typescript
    return {
      success: false,
      messages: [],
      errorMessage: errStack ? `${errMsg} :: ${errStack}` : errMsg,
      errorStage: currentStage,
      // D-06 — doble-fallo LLM: marca handoff suave para que un humano atienda, SIN
      // suprimir el [ERROR AGENTE] (D-05). Coexisten (CONTEXT.md D-05 reconciliación).
      ...(isProvidersDown ? {
        requiresHuman: true,
        newMode: 'handoff' as const,
        handoffReasonDetail: 'ambos proveedores LLM caídos (Gemini + Haiku)',
      } : {}),
      intentsVistos: input.intentsVistos,
      // ... rest of existing fields unchanged ...
    }
    ```
    Do NOT change the non-sentinel path. Do NOT add user content anywhere (T-fb-01).
  </action>
  <verify>
    <automated>grep -q "PROVIDERS_DOWN_SENTINEL" src/lib/agents/somnio-v4/somnio-v4-agent.ts && grep -q "ambos proveedores LLM caídos" src/lib/agents/somnio-v4/somnio-v4-agent.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - sentinel imported + detected with .includes: `grep -q "PROVIDERS_DOWN_SENTINEL" src/lib/agents/somnio-v4/somnio-v4-agent.ts` AND `grep -q "includes(PROVIDERS_DOWN_SENTINEL)" src/lib/agents/somnio-v4/somnio-v4-agent.ts`
    - success:false preserved on this path (D-05): the catch still returns `success: false` — `grep -c "success: false" src/lib/agents/somnio-v4/somnio-v4-agent.ts` unchanged-or-greater (no path flipped to success:true)
    - engine_error emit NOT suppressed for double-fail (D-05): `grep -q "recordV4Event('engine_error'" src/lib/agents/somnio-v4/somnio-v4-agent.ts` (the existing emit remains; no isProvidersDown guard around it)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>The catch detects the re-wrap-surviving sentinel and flags handoff while keeping success:false + the engine_error emit (D-05).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Runner emits handoffSuggested on the double-fail error output</name>
  <read_first>
    - src/lib/agents/engine/v4-production-runner.ts lines 598-663 (outputDiscarded/suppressTurnEffects + error block + handoff block + deriveHandoffGate)
  </read_first>
  <behavior>
    - For the double-fail error output (success:false, requiresHuman:true, newMode:'handoff', handoffReasonDetail set) → EngineOutput carries error.code='V4_AGENT_ERROR' (UNCHANGED, D-05) AND handoffSuggested:true AND handoffSignal.reason='ambos proveedores LLM caídos (Gemini + Haiku)'
    - For a normal handoff (success:true, newMode:'handoff') → existing behavior unchanged
    - For a genuine non-handoff error (success:false, no requiresHuman) → no handoffSuggested
  </behavior>
  <action>
    The existing handoff mapping (line 637) only fires when `output.newMode === 'handoff' && !suppressTurnEffects`. CHECKER FINDING (verified against live code): on the double-fail path the agent catch RETURNS `success:false` (it does NOT throw), so the core completes with `kind:'completed'`, `wasInterruptedWithZeroSends=false`, `outputDiscarded` undefined → `suppressTurnEffects=false` → the EXISTING `newMode==='handoff' && !suppressTurnEffects` branch already fires for this output. The extra `isProvidersDownHandoff` OR-clause below is therefore defense-in-depth (harmless), NOT strictly required — keep it as a belt-and-suspenders guard against future suppress changes.
    Extend the handoff mapping so the double-fail error ALSO emits the signal even if a future change forces suppressTurnEffects true. Add the OR-clause scoped to the double-fail reason:
    ```typescript
    const isProvidersDownHandoff =
      output.requiresHuman === true &&
      output.handoffReasonDetail === 'ambos proveedores LLM caídos (Gemini + Haiku)'
    ...
    ...((output.newMode === 'handoff' && !suppressTurnEffects) || isProvidersDownHandoff
      ? (() => {
          const realReason = output.handoffReasonDetail ?? output.decisionInfo?.reason ?? 'unknown'
          return { handoffSuggested: true, handoffSignal: { reason: realReason, gate: deriveHandoffGate(realReason), topic: undefined } }
        })()
      : {}),
    ```
    Add a `gate` mapping for the new reason in `deriveHandoffGate` if needed (e.g. `if (reason.startsWith('ambos proveedores')) return 'no_kb'` or add a dedicated gate value ONLY if the EngineOutput.handoffSignal.gate union already allows it — do NOT widen the union; pick an existing gate value like 'no_kb' or the closest, and note it). Leave the error block (code V4_AGENT_ERROR) UNCHANGED (D-05).
  </action>
  <verify>
    <automated>grep -q "isProvidersDownHandoff\|ambos proveedores" src/lib/agents/engine/v4-production-runner.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - error block untouched (D-05): `grep -q "code: 'V4_AGENT_ERROR'" src/lib/agents/engine/v4-production-runner.ts`
    - double-fail handoff signal emitted on error path: `grep -q "isProvidersDownHandoff\|ambos proveedores" src/lib/agents/engine/v4-production-runner.ts`
    - handoffSignal.gate uses an EXISTING gate value (no union widening): `grep -c "handoffSignal" src/lib/agents/engine/types.ts` unchanged AND tsc passes
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>The runner threads handoffSuggested on the double-fail error output while keeping V4_AGENT_ERROR (D-05).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: webhook-processor soft note coexists with [ERROR AGENTE]</name>
  <read_first>
    - src/lib/agents/production/webhook-processor.ts lines 1113-1136 (existing soft-note guard requiring result.success)
    - src/lib/whatsapp/webhook-handler.ts lines 546-561 ([ERROR AGENTE] insert on !success)
  </read_first>
  <behavior>
    - Double-fail turn (result.success === false, result.handoffSuggested === true) → a ⚠ HANDOFF SUGERIDO note is inserted (in addition to the [ERROR AGENTE] note from webhook-handler) → both visible in inbox
    - Normal success handoff (success:true) → existing single note path unchanged (no double note)
    - Normal error without handoffSuggested → no handoff note (unchanged)
  </behavior>
  <action>
    The current guard at line 1117 is `if (result.success && result.newMode === 'handoff' && result.handoffSuggested)`. A double-fail has success:false → it is skipped. Add a SEPARATE branch (or relax the condition) so the soft note also fires for the double-fail:
    ```typescript
    // v4-llm-fallback-resilience (D-06): doble-fallo LLM → nota handoff que COEXISTE con
    // [ERROR AGENTE] (D-05). El [ERROR AGENTE] lo inserta webhook-handler en el path success:false;
    // aquí agregamos la nota de handoff suave para que el operador sepa que debe atender.
    if (!result.success && result.handoffSuggested && result.newMode === 'handoff') {
      try {
        const handoffReason = result.handoffSignal?.reason ?? 'ambos proveedores LLM caídos'
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          workspace_id: workspaceId,
          direction: 'outbound',
          type: 'text',
          content: { body: `⚠ HANDOFF SUGERIDO — motivo: ${handoffReason}` },
          timestamp: new Date().toISOString(),
        })
      } catch (noteError) {
        logger.warn({ error: noteError, conversationId }, 'Failed to insert double-fail handoff note')
      }
    }
    ```
    Do NOT modify the existing success-path note (line 1117). Do NOT touch the [ERROR AGENTE] insert in webhook-handler (D-05 — it must keep firing for success:false). CHECKER FINDING (verified flow): place the coexisting note in `webhook-processor.ts` — `processMessageWithAgent` returns the `SomnioEngineResult` carrying `handoffSuggested`+`handoffSignal` (mapped ~line 995), and the soft-note path (line 1117) runs BEFORE that return; the `[ERROR AGENTE]` note fires separately in `webhook-handler.ts:546` on the returned `!success`. They coexist by construction — no need to trace further or relocate the note.
  </action>
  <verify>
    <automated>grep -q "doble-fallo LLM\|double-fail handoff note" src/lib/agents/production/webhook-processor.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - new coexisting branch present (success:false + handoffSuggested): `grep -q "!result.success && result.handoffSuggested" src/lib/agents/production/webhook-processor.ts`
    - existing success-path note unchanged: `grep -q "result.success && result.newMode === 'handoff' && result.handoffSuggested" src/lib/agents/production/webhook-processor.ts`
    - [ERROR AGENTE] insert in webhook-handler untouched (D-05): `grep -q "\[ERROR AGENTE\]" src/lib/whatsapp/webhook-handler.ts`
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>For a double-fail, the inbox shows both [ERROR AGENTE] (D-05) and ⚠ HANDOFF SUGERIDO (D-06); success-path note unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Tests — sentinel survival + handoff coexistence</name>
  <read_first>
    - existing somnio-v4 agent test files for the test harness pattern: `ls src/lib/agents/somnio-v4/__tests__/`
    - v4-handoff-soft-signal tests if present (same coexistence concern)
  </read_first>
  <behavior>
    - Unit: given an error whose message contains 'llm_providers_down: callSite=comprehension ...', the agent catch returns success:false + requiresHuman:true + newMode:'handoff' + handoffReasonDetail set.
    - Unit: a non-sentinel error returns success:false with NO requiresHuman/newMode handoff flags.
    - (If feasible) sentinel-survival assertion: simulate comprehension's re-wrap (`new Error('[Comprehension-v4 generateText] Error: llm_providers_down: ... | ...')`) and assert `.includes(PROVIDERS_DOWN_SENTINEL)` is true.
  </behavior>
  <action>
    Create `src/lib/agents/somnio-v4/__tests__/double-fail-handoff.test.ts`. Drive `processUserMessage` (or the smallest agent entry that hits the catch) with a mocked `comprehend` that throws a re-wrapped sentinel error, OR if the catch is reachable only via the full pipeline, mock `callWithGeminiFallback`/`comprehend` at the module boundary (vi.mock). Assert the returned V4AgentOutput shape. Add a focused string test: `expect(rewrapped.message).toContain(PROVIDERS_DOWN_SENTINEL)`. Mock alerts + observability so no real egress. Keep the test v4-scoped (Regla 6).
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/double-fail-handoff.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/double-fail-handoff.test.ts` exits 0
    - asserts success:false + handoff flags coexist: `grep -q "requiresHuman" src/lib/agents/somnio-v4/__tests__/double-fail-handoff.test.ts && grep -q "success" src/lib/agents/somnio-v4/__tests__/double-fail-handoff.test.ts`
    - sentinel-survival assertion present: `grep -q "PROVIDERS_DOWN_SENTINEL\|llm_providers_down" src/lib/agents/somnio-v4/__tests__/double-fail-handoff.test.ts`
    - regression baseline green: `npx vitest run src/lib/agents/somnio-v4/__tests__/` exits 0
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Sentinel survival + handoff/error coexistence proven by tests; v4 suite green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Thrown sentinel → agent catch → inbox notes | Error text flows into operator-facing notes (never to WhatsApp client) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-fb-01 | Information disclosure | inbox notes | mitigate | Handoff note carries only the fixed reason string + handoffSignal.reason (no user content); [ERROR AGENTE] already truncates to 500 chars of err.message (pre-existing). |
| T-fb-05 | Repudiation (silent handoff bug) | sentinel masking | mitigate | engine_error emit NOT suppressed (D-05); test asserts non-sentinel errors keep existing behavior so genuine bugs aren't swallowed (RESEARCH Pitfall #7 — silent handoff bug class). |
| T-fb-06 | Tampering (Regla 6) | scope | mitigate | Only v4 agent + v4 runner + the v4 branch of webhook-processor touched; no v3/godentist/recompra/pw path modified. |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/somnio-v4/__tests__/` exits 0
- `npx tsc --noEmit` exits 0
- Regla 6: webhook-processor change is a NEW branch gated on v4 output shape (handoffSuggested+newMode handoff); no other agent's path altered. Confirm with: `git diff` shows only additive branches.
- D-05 honored: [ERROR AGENTE] insert in webhook-handler unchanged.
</verification>

<success_criteria>
A double-fail produces a re-wrap-surviving sentinel → agent flags soft handoff (keeping success:false + engine_error) → runner emits handoffSuggested → inbox shows BOTH [ERROR AGENTE] (D-05) and ⚠ HANDOFF SUGERIDO (D-06). Single-provider success unaffected; genuine errors unchanged; v4 suite green.
</success_criteria>

<output>
After completion, create `.planning/standalone/v4-llm-fallback-resilience/04-SUMMARY.md`
</output>

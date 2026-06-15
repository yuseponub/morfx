---
phase: v4-llm-fallback-resilience
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v4/llm-fallback/saturation.ts
  - src/lib/agents/somnio-v4/llm-fallback/observability.ts
  - src/lib/agents/somnio-v4/llm-fallback/__tests__/saturation.test.ts
  - src/lib/agents/somnio-v4/llm-fallback/__tests__/observability.test.ts
autonomous: true
requirements: [D-02, D-04, D-09]
user_setup: []

must_haves:
  truths:
    - "isGeminiBillingError(err) returns true for a credits-depleted error (message or responseBody match) and false otherwise"
    - "isGeminiSchemaCapacity(err) returns true for the union-types error and false otherwise"
    - "NoObjectGeneratedError matches NEITHER new predicate (Pitfall #4 — genuine schema bugs still re-throw)"
    - "Both predicates match by message FIRST (survives comprehension re-wrap) and by responseBody/statusCode when raw APICallError"
    - "FallbackEventLabel union includes llm_credits_depleted and gemini_schema_capacity_fallback"
  artifacts:
    - path: "src/lib/agents/somnio-v4/llm-fallback/saturation.ts"
      provides: "isGeminiBillingError + isGeminiSchemaCapacity predicates"
      contains: "isGeminiBillingError"
    - path: "src/lib/agents/somnio-v4/llm-fallback/observability.ts"
      provides: "two new typed labels on FallbackEventLabel"
      contains: "llm_credits_depleted"
    - path: "src/lib/agents/somnio-v4/llm-fallback/__tests__/saturation.test.ts"
      provides: "table-driven coverage of both new predicates incl. Pitfall #4 negatives"
  key_links:
    - from: "saturation.ts new predicates"
      to: "index.ts orchestrator (Plan 03)"
      via: "named exports consumed in the catch branch"
      pattern: "export function isGeminiBillingError"
    - from: "observability.ts FallbackEventLabel"
      to: "index.ts emitFallbackEvent calls (Plan 03)"
      via: "typed union compile-time gate"
      pattern: "'llm_credits_depleted'"
---

<objective>
Add the two NAMED, SPECIFIC fallback predicates (`isGeminiBillingError`, `isGeminiSchemaCapacity`) and the two new typed observability labels (`llm_credits_depleted`, `gemini_schema_capacity_fallback`). These are leaf-module changes with zero wiring — Plan 03 consumes them.

Purpose: D-01/D-02 require credits-depleted AND union-types errors to fall back to Haiku, while D-09 mandates the discrimination stays predicate-based (NEVER "any error → Haiku"). This plan delivers the discriminators + the durable event contract.
Output: extended `saturation.ts` + `observability.ts` + their tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-llm-fallback-resilience/CONTEXT.md
@.planning/standalone/v4-llm-fallback-resilience/RESEARCH.md

<interfaces>
<!-- Existing predicate pattern the executor MUST mirror. From saturation.ts (Plan target). -->
Existing exports in src/lib/agents/somnio-v4/llm-fallback/saturation.ts:
```typescript
// SATURATION_MSG = /high demand|overloaded|MODEL_CAPACITY_EXHAUSTED|capacity available|RESOURCE_EXHAUSTED|UNAVAILABLE/i
function unwrap(err: unknown): unknown      // RetryError.isInstance → lastError; else err
export function isGeminiSaturation(err: unknown): boolean
export function isTimeoutError(err: unknown): boolean
```
Pattern of isGeminiSaturation (lines 24-43): if APICallError → check statusCode, then SATURATION_MSG against e.message AND e.responseBody; then a final fallback `SATURATION_MSG.test(msg)` against `err instanceof Error ? err.message : String(err)` — this last line is what survives comprehension's re-wrap (Pitfall #5).

Existing FallbackEventLabel union in observability.ts (lines 21-33): 6 labels
('fallback_triggered' | 'circuit_opened' | 'circuit_closed' | 'probe_ok' | 'probe_failed' | 'fallback_failed').
emitFallbackEvent(label, payload) → collector.recordEvent('pipeline_decision', label, payload) + console.log.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add isGeminiBillingError + isGeminiSchemaCapacity predicates</name>
  <read_first>
    - src/lib/agents/somnio-v4/llm-fallback/saturation.ts (the full file — mirror isGeminiSaturation's shape: unwrap → APICallError branch → final message fallback)
    - .planning/standalone/v4-llm-fallback-resilience/RESEARCH.md §Q2 (exact strings + dual-shape requirement)
  </read_first>
  <behavior>
    - isGeminiBillingError(apiError({ message: 'Your prepayment credits are depleted' })) → true
    - isGeminiBillingError(new Error('[Comprehension-v4 generateText] Error: Your prepayment credits are depleted | ...')) → true (re-wrap survives via message fallback)
    - isGeminiBillingError(apiError({ responseBody: '{"error":{"message":"RESOURCE_EXHAUSTED ... quota"}}' })) → true
    - isGeminiBillingError(apiError({ statusCode: 503 })) → false (that's saturation, not billing)
    - isGeminiBillingError(new NoObjectGeneratedError(...)) → false (Pitfall #4)
    - isGeminiSchemaCapacity(apiError({ message: 'Schemas contains too many parameters with union types (17 parameters...)' })) → true
    - isGeminiSchemaCapacity(new Error('... too many states for serving ...')) → true
    - isGeminiSchemaCapacity(apiError({ message: 'some anyOf parse failure' })) → false (bare anyOf is too generic — Pitfall #4 / RESEARCH Q2)
    - isGeminiSchemaCapacity(new NoObjectGeneratedError(...)) → false (Pitfall #4)
  </behavior>
  <action>
    Add TWO new exported predicates to saturation.ts, each mirroring isGeminiSaturation's structure exactly (reuse the existing `unwrap` helper; check APICallError message+responseBody; END with a `.test(msg)` fallback over `err instanceof Error ? err.message : String(err)` so the comprehension re-wrap is covered — RESEARCH Q2 / Pitfall #5).

    Define module-level regex constants (do NOT extend SATURATION_MSG — RESEARCH Q2 explicitly RECHAZADO):
    ```typescript
    // D-01/D-09 — créditos agotados. Match por message PRIMERO (robusto al re-wrap de comprehension).
    // OQ-1: el statusCode real en prod (429/400) NO está confirmado → NO se matchea por statusCode
    // solo; el message es la fuente. RESOURCE_EXHAUSTED a secas YA es saturación → aquí solo la
    // variante con quota/credits para no conflacionar (RESEARCH Q2).
    const BILLING_MSG =
      /prepayment credits are depleted|billing|insufficient.*credit|RESOURCE_EXHAUSTED[^]*quota|quota[^]*RESOURCE_EXHAUSTED/i

    // D-02/D-09 — union-types capacity. NO incluir `anyOf` suelto (falso-positivo con parse errors — Pitfall #4).
    const SCHEMA_CAP_MSG =
      /too many parameters with union types|too many states for serving|union type/i
    ```

    ```typescript
    /** D-01/D-09 — créditos de Gemini agotados → fallback a Haiku + correo + evento.
     *  Match por message (sobrevive el re-wrap de comprehension) y responseBody si es APICallError.
     *  NoObjectGeneratedError NO matchea (Pitfall #4). */
    export function isGeminiBillingError(err: unknown): boolean {
      const e = unwrap(err)
      if (APICallError.isInstance(e)) {
        if (typeof e.message === 'string' && BILLING_MSG.test(e.message)) return true
        if (typeof e.responseBody === 'string' && BILLING_MSG.test(e.responseBody)) return true
      }
      const msg = err instanceof Error ? err.message : String(err)
      return BILLING_MSG.test(msg)
    }

    /** D-02/D-09 — error union-types (límite real de structured-output de Gemini) → fallback
     *  a Haiku (schema saneado) + evento RUIDOSO. NoObjectGeneratedError NO matchea (Pitfall #4). */
    export function isGeminiSchemaCapacity(err: unknown): boolean {
      const e = unwrap(err)
      if (APICallError.isInstance(e)) {
        if (typeof e.message === 'string' && SCHEMA_CAP_MSG.test(e.message)) return true
        if (typeof e.responseBody === 'string' && SCHEMA_CAP_MSG.test(e.responseBody)) return true
      }
      const msg = err instanceof Error ? err.message : String(err)
      return SCHEMA_CAP_MSG.test(msg)
    }
    ```
    Add a header comment block on each citing D-01/D-02/D-09 + Pitfall #4. Do NOT modify isGeminiSaturation or isTimeoutError.
  </action>
  <verify>
    <automated>grep -q "export function isGeminiBillingError" src/lib/agents/somnio-v4/llm-fallback/saturation.ts && grep -q "export function isGeminiSchemaCapacity" src/lib/agents/somnio-v4/llm-fallback/saturation.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "export function isGeminiBillingError" src/lib/agents/somnio-v4/llm-fallback/saturation.ts` exits 0
    - `grep -q "export function isGeminiSchemaCapacity" src/lib/agents/somnio-v4/llm-fallback/saturation.ts` exits 0
    - `grep -c "anyOf" src/lib/agents/somnio-v4/llm-fallback/saturation.ts` returns 0 (Pitfall #4: bare anyOf NOT matched)
    - SATURATION_MSG regex is UNCHANGED: `grep -q "high demand|overloaded|MODEL_CAPACITY_EXHAUSTED" src/lib/agents/somnio-v4/llm-fallback/saturation.ts` exits 0
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Two named predicates exist, each matching message-first + responseBody, with Pitfall #4 negatives encoded; SATURATION_MSG untouched; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 2: Add two typed observability labels</name>
  <read_first>
    - src/lib/agents/somnio-v4/llm-fallback/observability.ts (full file — the FallbackEventLabel union + emitFallbackEvent)
  </read_first>
  <action>
    Extend the `FallbackEventLabel` union in observability.ts with TWO new labels, with payload-shape doc comments matching the existing style (lines 22-33). Add per RESEARCH Q4:
    ```typescript
    /** D-01/D-04 — créditos de Gemini agotados (bot vivo con Haiku). { callSite, provider:'gemini', errorCode } */
    | 'llm_credits_depleted'
    /** D-02 — evento RUIDOSO: union-types cubierto por Haiku (no enmascarar en silencio). { callSite, errorCode } */
    | 'gemini_schema_capacity_fallback'
    ```
    Do NOT change emitFallbackEvent's body. The payload discipline comment (T-fb-01) already present at top MUST remain.
  </action>
  <verify>
    <automated>grep -q "'llm_credits_depleted'" src/lib/agents/somnio-v4/llm-fallback/observability.ts && grep -q "'gemini_schema_capacity_fallback'" src/lib/agents/somnio-v4/llm-fallback/observability.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "'llm_credits_depleted'" src/lib/agents/somnio-v4/llm-fallback/observability.ts` exits 0
    - `grep -q "'gemini_schema_capacity_fallback'" src/lib/agents/somnio-v4/llm-fallback/observability.ts` exits 0
    - emitFallbackEvent body unchanged: `grep -q "collector.recordEvent('pipeline_decision', label, payload)" src/lib/agents/somnio-v4/llm-fallback/observability.ts` exits 0
    - T-fb-01 comment intact: `grep -qi "T-fb-01" src/lib/agents/somnio-v4/llm-fallback/observability.ts` exits 0
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>FallbackEventLabel union has 8 labels; emitter unchanged; tsc clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Tests for new predicates + labels</name>
  <read_first>
    - src/lib/agents/somnio-v4/llm-fallback/__tests__/saturation.test.ts (mirror the `apiError(...)` helper + table-driven `it.each` style + afterEach __resetBreakers)
    - src/lib/agents/somnio-v4/llm-fallback/__tests__/observability.test.ts
  </read_first>
  <behavior>
    Encode the Task 1 behavior table as vitest cases. Plus a Pitfall #4 group asserting NoObjectGeneratedError → false for BOTH predicates AND that isGeminiSaturation still returns false for billing/schema-cap strings (no overlap regression).
  </behavior>
  <action>
    In saturation.test.ts add two describe blocks importing the new predicates:
    `import { isGeminiBillingError, isGeminiSchemaCapacity } from '../saturation'`. Reuse the existing `apiError(...)` helper.
    - `isGeminiBillingError`: true for message 'Your prepayment credits are depleted'; true for the re-wrapped `new Error('[Comprehension-v4 generateText] Error: Your prepayment credits are depleted | finishReason=...')`; true for responseBody containing 'RESOURCE_EXHAUSTED ... quota'; false for statusCode 503 alone; false for NoObjectGeneratedError.
    - `isGeminiSchemaCapacity`: true for 'too many parameters with union types'; true for re-wrapped Error with 'too many states for serving'; false for bare 'anyOf parse failure'; false for NoObjectGeneratedError.
    - Pitfall #4 group: construct `NoObjectGeneratedError` like the existing test does; assert both new predicates return false.
    Use `new NoObjectGeneratedError({ message, cause: undefined, text: '', response: { id:'x', timestamp: new Date(), modelId:'x' }, usage: { inputTokens:0, outputTokens:0, totalTokens:0 }, finishReason: 'stop' } as any)` matching whatever the existing test file already constructs — copy its exact construction.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/llm-fallback/__tests__/saturation.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run src/lib/agents/somnio-v4/llm-fallback/__tests__/saturation.test.ts` exits 0
    - test file references both new predicates: `grep -q "isGeminiBillingError" src/lib/agents/somnio-v4/llm-fallback/__tests__/saturation.test.ts && grep -q "isGeminiSchemaCapacity" src/lib/agents/somnio-v4/llm-fallback/__tests__/saturation.test.ts`
    - a Pitfall #4 / NoObjectGeneratedError negative case exists: `grep -q "NoObjectGeneratedError" src/lib/agents/somnio-v4/llm-fallback/__tests__/saturation.test.ts`
    - full fallback suite green: `npx vitest run src/lib/agents/somnio-v4/llm-fallback/__tests__/` exits 0
  </acceptance_criteria>
  <done>New predicate tests pass; Pitfall #4 negatives covered; whole fallback suite green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Gemini API error → predicate | Untrusted provider error text matched by regex; must not leak into events/emails |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-fb-01 | Information disclosure | new predicates + labels | mitigate | Predicates return boolean only; new labels carry ONLY {callSite, provider, errorCode=err.name} — never message/responseBody/keys. Enforced by acceptance grep in Plan 03 wiring. |
| T-fb-02 | Tampering (false-negative masking) | isGeminiSchemaCapacity | mitigate | Bare `anyOf` excluded (Pitfall #4); NoObjectGeneratedError negative test asserts genuine schema bugs still re-throw. |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/somnio-v4/llm-fallback/__tests__/` exits 0
- `npx tsc --noEmit` exits 0
- Regla 6: no file outside `src/lib/agents/somnio-v4/llm-fallback/` touched (git diff scope).
</verification>

<success_criteria>
Two named predicates + two typed labels exist with full positive/negative test coverage including Pitfall #4 negatives; SATURATION_MSG and emitFallbackEvent unchanged; tsc + suite green.
</success_criteria>

<output>
After completion, create `.planning/standalone/v4-llm-fallback-resilience/01-SUMMARY.md`
</output>

---
phase: v4-hybrid-template-rag-turn
plan: 02
type: tdd
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v4/slots.ts
  - src/lib/agents/somnio-v4/__tests__/slots.test.ts
autonomous: true
requirements: [D-02, D-03, D-06, D-09, T-2]
must_haves:
  truths:
    - "A pure function computes per-intent coverage ('covered' | 'low') from confidence + threshold + intent, reusing the same razonamiento_libre/otro escalation rule as the primary"
    - "computeSlots returns the 4-case matrix: covered+covered, covered+low, low+covered, low+low, plus the secondary='none' case"
    - "The RAG sub-query for a low PRIMARY is the raw message; for a low SECONDARY it is secondary_query (T-2)"
  artifacts:
    - path: src/lib/agents/somnio-v4/slots.ts
      provides: "computeSlots pure function + SlotPlan/SlotCoverage types + per-slot sub-query selection"
    - path: src/lib/agents/somnio-v4/__tests__/slots.test.ts
      provides: "unit tests for all 4 matrix cells + none case + razonamiento_libre routing + sub-query selection"
  key_links:
    - from: slots.ts
      to: escalation.ts decideSubLoopReason
      via: "reuse the same low/razonamiento_libre classification per intent"
      pattern: "decideSubLoopReason"
---

<objective>
Create a pure, testable slot-coverage classifier that generalizes the binary early-return lever into a per-intent decision (D-02/D-03). It answers, for the primary and the secondary independently: does this intent get a deterministic template ('covered') or escalate to RAG ('low')? It also selects the correct RAG sub-query per slot (raw message for low primary, secondary_query for low secondary — T-2). This is a leaf module (no DB, no LLM) so it is a clean TDD candidate; Plan 03 consumes it to orchestrate the real flow.

Purpose: Isolate the coverage decision so the orchestrator refactor (Plan 03) stays thin and the matrix logic is independently verified.
Output: `slots.ts` (pure functions + types) + full unit coverage.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-hybrid-template-rag-turn/CONTEXT.md
@.planning/standalone/v4-hybrid-template-rag-turn/RESEARCH.md

<interfaces>
From src/lib/agents/somnio-v4/escalation.ts (the per-intent rule to reuse):
```ts
export function decideSubLoopReason(input: {
  confidence: number; threshold: number; intent: string;
  isCrmMutation: boolean; casReject: boolean;
}): SubLoopReason | null
// returns 'razonamiento_libre' if intent === 'razonamiento_libre' || intent === 'otro';
//         'low_confidence' if confidence < threshold; else null (covered).
```
SubLoopReason is from './sub-loop/output-schema'. The slot classifier reuses this with isCrmMutation:false, casReject:false (CRM never goes through the slot resolver — escalation.ts:49-64 prioritizes cas_reject/crm_mutation; the gate handles those separately).

From src/lib/agents/somnio-v4/comprehension-schema.ts (post-Plan-01) — the analysis shape this consumes:
```ts
analysis.intent.primary: string
analysis.intent.secondary: string  // V4_INTENTS | 'ninguno'
analysis.intent.intent_confidence: number   // 0..1 PRIMARY
analysis.intent.secondary_confidence: number | null  // NEW
analysis.intent.secondary_query: string | null       // NEW
```
</interfaces>
</context>

<feature>
  <name>computeSlots — per-intent coverage + RAG sub-query selection</name>
  <files>src/lib/agents/somnio-v4/slots.ts, src/lib/agents/somnio-v4/__tests__/slots.test.ts</files>
  <behavior>
RED first — write slots.test.ts, then slots.ts to pass.

Types (in slots.ts):
```ts
export type SlotCoverage = 'covered' | 'low'
export interface SlotDecision {
  intent: string
  coverage: SlotCoverage
  reason: 'low_confidence' | 'razonamiento_libre' | null  // null when covered
  ragQuery: string | null  // sub-query for RAG when coverage==='low'; null when covered
}
export interface SlotPlan {
  primary: SlotDecision
  secondary: SlotDecision | null  // null when analysis.intent.secondary === 'ninguno'
}
```

`computeSlots(args: { primaryIntent: string; primaryConfidence: number; secondaryIntent: string; secondaryConfidence: number | null; secondaryQuery: string | null; rawMessage: string; threshold: number }): SlotPlan`

Rules (D-02/D-03/T-2):
1. primary: reason = decideSubLoopReason({confidence: primaryConfidence, threshold, intent: primaryIntent, isCrmMutation:false, casReject:false}); coverage = reason ? 'low' : 'covered'; ragQuery = coverage==='low' ? rawMessage : null  (T-2: low primary uses RAW message).
2. secondary: if secondaryIntent === 'ninguno' → null. Else reason = decideSubLoopReason({confidence: secondaryConfidence ?? 0, threshold, intent: secondaryIntent, isCrmMutation:false, casReject:false}); coverage = reason ? 'low' : 'covered'; ragQuery = coverage==='low' ? (secondaryQuery ?? rawMessage) : null  (T-2: low secondary uses secondary_query; defensive fallback to raw if null).
3. secondaryConfidence === null + secondaryIntent !== 'ninguno' (defensive) → treat as confidence 0 → 'low'.

Test cases (all 4 matrix cells + edge):
- covered+covered: precio@0.92 + contenido@0.85, threshold 0.70 → primary.coverage='covered', secondary.coverage='covered', both ragQuery null.
- covered+low: precio@0.92 + contraindicaciones@0.25, secondary_query='puedo tomarlo si tengo apnea?' → primary covered, secondary low, secondary.ragQuery==='puedo tomarlo si tengo apnea?'.
- low+covered: contraindicaciones@0.25 (primary) + tiempo_entrega@0.88, rawMessage='...' → primary low, primary.ragQuery===rawMessage, secondary covered.
- low+low: contraindicaciones@0.25 + dependencia@0.30, secondary_query='X' → primary low (ragQuery=rawMessage), secondary low (ragQuery='X').
- secondary none: precio@0.92 + 'ninguno' → secondary === null.
- razonamiento_libre primary: intent='razonamiento_libre'@0.90 → coverage='low', reason='razonamiento_libre' (even though confidence high — reuse escalation rule).
- 'otro' secondary → coverage='low', reason='razonamiento_libre'.
- secondaryConfidence null but intent not ninguno → coverage='low', ragQuery falls back to rawMessage.
  </behavior>
  <implementation>
Import `decideSubLoopReason` from `./escalation`. Map its return: `'low_confidence'` and `'razonamiento_libre'` → coverage 'low' (carry the reason string narrowed to those two); `null` → 'covered'. The classifier must NEVER pass isCrmMutation/casReject true (those reasons are out of scope — assert in code comment referencing escalation.ts:49-64). Keep the module pure: no imports from comprehension/runner/sub-loop, no DB, no async.
  </implementation>
</feature>

<verification>
- `npx vitest run src/lib/agents/somnio-v4/__tests__/slots.test.ts` exits 0.
- slots.ts has zero async, zero DB imports, zero LLM imports.
</verification>

<success_criteria>
- computeSlots returns correct SlotPlan for all 4 matrix cells + none + razonamiento_libre + null-confidence edge.
- ragQuery selection matches T-2 (raw for low primary, secondary_query for low secondary).
- `grep -c "from './escalation'" src/lib/agents/somnio-v4/slots.ts` returns 1 (reuses the canonical rule, no duplication).
- `grep -cE "createAdminClient|generateText|from '@/lib/domain" src/lib/agents/somnio-v4/slots.ts` returns 0 (pure module).
- `npx tsc --noEmit` exits 0.
</success_criteria>

<output>
After completion, create `.planning/standalone/v4-hybrid-template-rag-turn/02-SUMMARY.md`
</output>

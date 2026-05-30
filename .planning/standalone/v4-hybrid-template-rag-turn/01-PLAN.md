---
phase: v4-hybrid-template-rag-turn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v4/comprehension-schema.ts
  - src/lib/agents/somnio-v4/comprehension-prompt.ts
  - src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts
autonomous: true
requirements: [D-01, D-04, D-06, D-09, T-5]
must_haves:
  truths:
    - "Comprehension emits secondary_confidence (0..1) for the secondary intent in the same Gemini call"
    - "Comprehension emits secondary_query (self-contained sub-question) for the secondary intent"
    - "When secondary === 'ninguno', secondary_confidence and secondary_query are null"
    - "MessageAnalysisSchema shape stays stable (no AI_NoOutputGeneratedError) across the schema unit suite"
  artifacts:
    - path: src/lib/agents/somnio-v4/comprehension-schema.ts
      provides: "secondary_confidence + secondary_confidence_reasoning + secondary_query nullable fields inside intent object"
    - path: src/lib/agents/somnio-v4/comprehension-prompt.ts
      provides: "few-shot anchors with opposite primary/secondary coverages + null-when-ninguno instruction"
    - path: src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts
      provides: "schema parse tests for the 3 new nullable fields (present + null cases)"
  key_links:
    - from: comprehension-schema.ts
      to: comprehension.ts parseAnalysis
      via: "MessageAnalysisSchema.safeParse accepts the new nullable fields"
      pattern: "secondary_confidence"
---

<objective>
Extend the v4 comprehension structured output (Gemini 2.5 Flash) so a single call reports per-intent coverage for BOTH intents and segments the message into a secondary sub-query. This is the data foundation for the per-intent slot resolver (Plan 03). Today only the primary has `intent_confidence`; the secondary template is stacked without measuring coverage (the bug at `response-track.ts:90-96`).

Purpose: Provide `secondary_confidence` (D-01) + `secondary_query` (D-04) so downstream slot logic can decide template-vs-RAG per intent and feed the RAG a partitioned sub-query (resolves H2 — RAG must not see the whole message or it duplicates the template part).
Output: 3 new `.nullable()` fields on the `intent` object + prompt few-shot anchors + schema unit tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-hybrid-template-rag-turn/CONTEXT.md
@.planning/standalone/v4-hybrid-template-rag-turn/RESEARCH.md

<interfaces>
<!-- Current MessageAnalysisSchema intent block — read_first confirms exact shape -->
From src/lib/agents/somnio-v4/comprehension-schema.ts (lines 28-55):
```ts
export const MessageAnalysisSchema = z.object({
  intent: z.object({
    primary: z.enum(V4_INTENTS),
    secondary: z.enum([...V4_INTENTS, 'ninguno'] as const).describe(...),
    confidence: z.number().describe(...),       // legacy 0-100
    reasoning: z.string().describe(...),
    intent_confidence: z.number().min(0).max(1).describe(...),       // PRIMARY 0..1
    intent_confidence_reasoning: z.string().optional().describe(...),
  }),
  extracted_fields: z.object({ ... }),
  classification: z.object({ ... }),
  negations: z.object({ ... }),
})
```
Note: `intent_confidence_reasoning` uses `.optional()` (legacy). The NEW fields use `.nullable()` per T-5 (shape stability — Gemini structured output is more robust with always-present nullable fields than optional fields that appear/disappear; the AI_NoOutputGeneratedError lesson was a DIFFERENT schema, the sub-loop ToolingOutputSchema with ~32 nullable combos).

Prompt assembly (comprehension-prompt.ts):
- `CONFIDENCE_FEW_SHOT` is a const template literal (lines 39-185).
- `buildSystemPrompt` returns `` `${baseSystemPrompt}\n\n${CONFIDENCE_FEW_SHOT}` `` (line 289).
- The secondary intent is described in baseSystemPrompt lines ~244-245 ("secondary: solo si hay DOS intenciones...").
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add secondary_confidence + secondary_confidence_reasoning + secondary_query to MessageAnalysisSchema</name>
  <read_first>
    - src/lib/agents/somnio-v4/comprehension-schema.ts (the full intent object, lines 28-55 — replicate the exact .describe() style)
    - src/lib/agents/somnio-v4/comprehension.ts (lines 169-203 parseAnalysis — confirm the sanitize/re-parse path tolerates new fields)
    - RESEARCH.md §R3 (the exact Zod snippet to copy verbatim)
  </read_first>
  <behavior>
    - MessageAnalysisSchema.safeParse succeeds when intent includes secondary_confidence:0.25, secondary_confidence_reasoning:"...", secondary_query:"..." (covered+low case).
    - MessageAnalysisSchema.safeParse succeeds when secondary_confidence:null, secondary_confidence_reasoning:null, secondary_query:null (secondary === 'ninguno' case).
    - MessageAnalysisSchema.safeParse FAILS if secondary_confidence is a string (type guard intact).
    - z.infer type exposes intent.secondary_confidence as number | null.
  </behavior>
  <action>
Inside the `intent: z.object({ ... })` block in `comprehension-schema.ts`, AFTER the existing `intent_confidence_reasoning` field (line 54) and BEFORE the closing `})` of the intent object (line 55), add these THREE fields verbatim (copy from RESEARCH.md §R3):

```ts
    // === V4 NEW (v4-hybrid-template-rag-turn D-01 + D-04) ===
    secondary_confidence: z.number().min(0).max(1).nullable().describe(
      '0..1 self-reported confidence en la clasificacion SECUNDARIA. ' +
      'null si secondary === "ninguno". Misma calibracion template-fit que intent_confidence: ' +
      '0.85+ = la respuesta automatica del secondary CUBRE la pregunta; ' +
      '0.20-0.40 = NO CUBRE (caso especifico/sustancia/condicion); 0.45-0.65 = ambiguo.'
    ),
    secondary_confidence_reasoning: z.string().nullable().describe(
      'Breve explicacion del secondary_confidence (observability + tuning). null si secondary === "ninguno".'
    ),
    secondary_query: z.string().nullable().describe(
      'Sub-query segmentada del SEGUNDO intent — la parte del mensaje que corresponde al ' +
      'secondary, reformulada como pregunta auto-contenida. null si secondary === "ninguno". ' +
      'Ej: "cuanto vale y lo puedo tomar si tengo apnea?" -> secondary_query="puedo tomar el ' +
      'producto si tengo apnea del sueno?"'
    ),
```

Use `.nullable()` NOT `.optional()` (T-5). Do NOT make the fields conditional in the schema — the conditionality (null when secondary==='ninguno') is enforced in the PROMPT (Task 2), keeping the schema shape fixed.

Do NOT touch parseAnalysis in comprehension.ts — the sanitize/re-parse path (lines 177-196) already tolerates extra fields and the strict safeParse will accept null values. (A defensive null-default is added in Plan 03 where the fields are consumed, not here.)
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "secondary_confidence: z.number().min(0).max(1).nullable()" src/lib/agents/somnio-v4/comprehension-schema.ts` returns 1
    - `grep -c "secondary_query: z.string().nullable()" src/lib/agents/somnio-v4/comprehension-schema.ts` returns 1
    - `grep -c "secondary_confidence_reasoning: z.string().nullable()" src/lib/agents/somnio-v4/comprehension-schema.ts` returns 1
    - `grep -c ".optional()" src/lib/agents/somnio-v4/comprehension-schema.ts` is UNCHANGED from baseline (the 3 new fields use .nullable(), not .optional())
    - `npx tsc --noEmit` exits 0 (no type errors from the schema change)
  </acceptance_criteria>
  <done>The three nullable fields exist on the intent object; the schema unit suite passes including a null-case and a populated-case assertion.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add comprehension-schema.test.ts cases for the new fields</name>
  <read_first>
    - src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts (mirror its existing describe/it/expect style and the way it builds a valid analysis fixture)
    - src/lib/agents/somnio-v4/comprehension-schema.ts (the post-Task-1 schema)
  </read_first>
  <behavior>
    - Test "secondary fields present (covered+low)": a fixture with secondary='contraindicaciones', secondary_confidence=0.25, secondary_query='puedo tomarlo si tengo apnea?' → safeParse.success === true; parsed.intent.secondary_confidence === 0.25.
    - Test "secondary fields null when ninguno": fixture with secondary='ninguno', secondary_confidence=null, secondary_query=null → safeParse.success === true.
    - Test "secondary_confidence wrong type rejected": fixture with secondary_confidence='high' (string) → safeParse.success === false.
  </behavior>
  <action>
Add a `describe('secondary intent coverage fields (D-01/D-04)', ...)` block to `comprehension-schema.test.ts`. Reuse the existing valid-analysis fixture builder in that file (find the helper that produces a minimal valid `MessageAnalysis`; if none, construct an inline object that satisfies the full schema — intent + extracted_fields + classification + negations). For each of the 3 behaviors above, call `MessageAnalysisSchema.safeParse(fixture)` and assert `.success` + the parsed value. Use exact literal strings matching the canonical case (`'contraindicaciones'`, `'puedo tomarlo si tengo apnea?'`).
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "secondary intent coverage fields" src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts` returns 1
    - The test file contains at least 3 new `it(` assertions referencing `secondary_confidence`
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts` exits 0
  </acceptance_criteria>
  <done>Three new tests cover present/null/wrong-type for the secondary fields and pass.</done>
</task>

<task type="auto">
  <name>Task 3: Add prompt instructions + opposite-coverage few-shot anchors for the secondary fields</name>
  <read_first>
    - src/lib/agents/somnio-v4/comprehension-prompt.ts (CONFIDENCE_FEW_SHOT 39-185 + baseSystemPrompt secondary description ~244-245 + return at 289)
    - RESEARCH.md §R3 "Few-shot calibration para el secondary" + "Riesgo de confundir primary/secondary confidence"
  </read_first>
  <action>
Two edits in `comprehension-prompt.ts`:

(A) In `CONFIDENCE_FEW_SHOT`, after the existing "## REGLA OPERACIONAL" block (before the closing backtick at line 185), append a new section:

```
## SECONDARY INTENT — COBERTURA Y SUB-QUERY (v4-hybrid D-01/D-04)

Cuando secondary != "ninguno", aplica la MISMA calibracion template-fit al secondary:
- secondary_confidence = "la respuesta automatica del secondary CUBRE esta sub-pregunta?" (0..1, mismas bandas que intent_confidence).
- secondary_query = la parte del mensaje que corresponde al secondary, reformulada como pregunta auto-contenida.
- Si secondary == "ninguno": secondary_confidence=null, secondary_confidence_reasoning=null, secondary_query=null.

REGLA DURA anti-swap: el confidence/query del PRIMARY describe la 1a intencion; el del SECONDARY la 2a. NO los intercambies.

ANCLAS MULTI-INTENT (muestran AMBOS confidences con coberturas OPUESTAS):
- "cuanto vale y lo puedo tomar si tengo apnea?"
  -> primary=precio CUBRE (intent_confidence=0.92),
     secondary=contraindicaciones NO CUBRE (secondary_confidence=0.25),
     secondary_query="puedo tomar el producto si tengo apnea del sueno?"
- "ok pero la entrega cuando?"
  -> primary=acknowledgment (intent_confidence=0.45),
     secondary=tiempo_entrega CUBRE (secondary_confidence=0.88),
     secondary_query="cuando llega el pedido?"
- "hola, puedo tomarlo si tomo sertralina?"
  -> primary=saludo CUBRE (intent_confidence=0.95),
     secondary=contraindicaciones NO CUBRE (secondary_confidence=0.25),
     secondary_query="puedo tomar el producto si tomo sertralina?"
- "cuanto cuesta y de que esta hecho?"
  -> primary=precio CUBRE (intent_confidence=0.92),
     secondary=contenido CUBRE (secondary_confidence=0.85),
     secondary_query="de que esta hecho el producto?"
```

(B) In `buildSystemPrompt` baseSystemPrompt secondary description (~244-245), append one line after the existing secondary bullet:
`- Si secondary != "ninguno", SIEMPRE poblar secondary_confidence + secondary_query; si secondary == "ninguno", ponerlos en null.`

Do NOT change the `return ${baseSystemPrompt}\n\n${CONFIDENCE_FEW_SHOT}` assembly at line 289.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "SECONDARY INTENT — COBERTURA Y SUB-QUERY" src/lib/agents/somnio-v4/comprehension-prompt.ts` returns 1
    - `grep -c "anti-swap" src/lib/agents/somnio-v4/comprehension-prompt.ts` returns 1
    - `grep -c "puedo tomar el producto si tengo apnea" src/lib/agents/somnio-v4/comprehension-prompt.ts` returns at least 1
    - `grep -c "secondary_confidence=0.25" src/lib/agents/somnio-v4/comprehension-prompt.ts` returns at least 2 (two opposite-coverage anchors)
  </acceptance_criteria>
  <done>The few-shot has 4 multi-intent anchors with both confidences shown and opposite coverages; the null-when-ninguno rule is in both the schema describe() and the prompt.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Gemini structured output → parseAnalysis | LLM-produced JSON crosses into typed domain; malformed/missing fields possible |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-v4hy-01 | Tampering | MessageAnalysisSchema | mitigate | `.nullable()` + min/max bounds reject malformed types; parseAnalysis sanitize/re-parse path tolerates extras (no new attack surface — v4 DORMANT, internal LLM only) |
| T-v4hy-02 | Denial of Service | comprehension call | accept | Schema fragility could cause AI_NoOutputGeneratedError; mitigated by .nullable() shape stability + smoke gate in Plan 05; v4 has 0 prod traffic |
</threat_model>

<verification>
- Schema unit suite green; tsc clean.
- No `.optional()` added (T-5 — nullable only).
- Prompt anchors present with opposite coverages (R3 anti-swap).
</verification>

<success_criteria>
- secondary_confidence, secondary_confidence_reasoning, secondary_query exist as `.nullable()` on the intent object.
- Schema unit tests pass for present/null/wrong-type.
- Few-shot has 4 multi-intent opposite-coverage anchors + null-when-ninguno rule.
- `npx tsc --noEmit` exits 0.
</success_criteria>

<output>
After completion, create `.planning/standalone/v4-hybrid-template-rag-turn/01-SUMMARY.md`
</output>

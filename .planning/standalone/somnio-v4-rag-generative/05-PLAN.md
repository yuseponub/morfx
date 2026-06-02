---
plan: 05
wave: 4
phase: standalone-somnio-v4-rag-generative
depends_on: [03, 04]
files_modified:
  - src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts
  - scripts/somnio-v4-rag-smoke-judge.ts
  - .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md
autonomous: true
requirements: []
user_setup: []

must_haves:
  truths:
    - "Los 17 casos del Smoke A (STATUS.md líneas 44-89) corren end-to-end contra runSubLoop con env vars productivas (OPENAI_API_KEY_SALESV4 + GOOGLE_GENERATIVE_AI_API_KEY)."
    - "Cada caso captura: tooling output + generation output + invariantViolation + nuncaDecirViolation + latencyMs."
    - "El script LLM-as-judge (scripts/somnio-v4-rag-smoke-judge.ts) emite veredicto preliminar por caso usando Gemini Flash SEPARADO (no el de generación)."
    - "SMOKE-A-RESULTS.md generado con tabla por caso: Caso | Expected | Tooling output | Generation output | Judge (PASS/PARTIAL/FAIL + faithfulness/relevance/calibration) | Jose (pendiente — marcar manual) | Invención detectada (Y/N) | Notes."
    - "El test verifica explícitamente para CADA caso si hay invención (claim no presente en material) — esto es la salvaguarda de D-21 + RESEARCH A2."
    - "Aggregate metrics + Decision checklist incluidos en SMOKE-A-RESULTS.md."
    - "v4 sigue dormant en producción."
  artifacts:
    - path: "src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts"
      provides: "Vitest suite con 17 casos + LLM-as-judge automation"
      contains: "Smoke A (rediseño RAG"
    - path: "scripts/somnio-v4-rag-smoke-judge.ts"
      provides: "judgeRagOutput function — Gemini Flash separado"
      exports: ["judgeRagOutput"]
    - path: ".planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md"
      provides: "Per-case results + aggregate metrics + Jose review pending"
      contains: "Aggregate metrics"
  key_links:
    - from: "src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts"
      to: "src/lib/agents/somnio-v4/sub-loop/index.ts (runSubLoop)"
      via: "import + invocation real con env vars productivas"
      pattern: "runSubLoop"
    - from: "src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts"
      to: "scripts/somnio-v4-rag-smoke-judge.ts"
      via: "import judgeRagOutput por cada caso"
      pattern: "judgeRagOutput"
---

<objective>
Wave 4 (paralelo con Plan 06) — Smoke A: validación E2E del rediseño RAG-generative contra los 17 casos lockeados en STATUS.md líneas 44-89.

Para cada caso:
1. Invocar `runSubLoop({ reason: 'low_confidence', ctx: { ... caso ... } })` con env vars productivas.
2. Capturar tooling output + generation output + outcome + invariantViolation/nuncaDecirViolation.
3. Pasar al LLM-as-judge (Gemini Flash SEPARADO — no el mismo de generación, para evitar self-enhancement bias RESEARCH líneas 740-743).
4. Persistir veredicto del judge en `SMOKE-A-RESULTS.md` con la tabla estructurada de PATTERNS líneas 786-842.
5. **CRITICAL — Per-case invención check** (RESEARCH A2): cada caso tiene columna explícita "Invención detectada (Y/N)" — el judge la auto-evalúa Y Jose la revisa manualmente después.

Output:
- 1 archivo de TEST nuevo: smoke-rag-a.test.ts con 17 casos.
- 1 script auxiliar: somnio-v4-rag-smoke-judge.ts (judgeRagOutput function).
- 1 archivo de RESULTS: SMOKE-A-RESULTS.md generado por el test.

**Criterio de éxito (CONTEXT.md líneas 115-119):**
- ≥15/17 casos pasan en evaluación Jose.
- 3/3 casos negativos (apnea, Miami, cripto) disparan handoff silente correctamente.
- 0 casos donde el modelo inventó info fuera del KB (validación Jose manual).

**Bloqueante para Plan 08:** Si <15/17 OK Jose → abrir Plan 07 (HOLD iter) antes de Plan 06. Si ≥1 invención → bloquear Plan 08 + considerar implementar `checkSourceGrounding` (V2 — RESEARCH A2).

**Jose revisa manualmente los 17 después de que el test corra (D-26 — Jose es ground truth final).** El test NO bloquea por Jose review; el test bloquea por errores runtime (throw, invariant violation).
</objective>

<context>
@./CLAUDE.md
@.planning/standalone/somnio-v4-rag-generative/CONTEXT.md
@.planning/standalone/somnio-v4-rag-generative/DISCUSSION-LOG.md
@.planning/standalone/somnio-v4-rag-generative/RESEARCH.md
@.planning/standalone/somnio-v4-rag-generative/PATTERNS.md
@.planning/standalone/somnio-v4-rag-generative/STATUS.md
@.planning/standalone/somnio-v4-rag-generative/03-SUMMARY.md
@.planning/standalone/somnio-v4-rag-generative/04-SUMMARY.md
@src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts
@src/lib/agents/somnio-v4/sub-loop/index.ts
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 5.1: Crear script auxiliar `scripts/somnio-v4-rag-smoke-judge.ts` (judgeRagOutput)</name>
  <read_first>
    - .planning/standalone/somnio-v4-rag-generative/RESEARCH.md líneas 731-849 (LLM-as-Judge Pattern + rubric + structure de SMOKE-A-RESULTS.md)
    - .planning/standalone/somnio-v4-rag-generative/RESEARCH.md líneas 1148-1187 (judgeRagOutput code example verbatim)
    - .planning/standalone/somnio-v4-rag-generative/PATTERNS.md líneas 819-849 (LLM-as-judge schema verbatim)
    - src/lib/agents/somnio-v4/sub-loop/generation-call.ts (post-Plan 03 — para entender Gemini Flash + Output.object pattern)
  </read_first>
  <action>
    Crear `scripts/somnio-v4-rag-smoke-judge.ts` con la función `judgeRagOutput`:

    ```ts
    /**
     * LLM-as-judge para Smoke A/B.
     * Usa gemini-2.5-flash SEPARADO (no el mismo de generación — evita self-enhancement bias
     * RESEARCH líneas 740-743).
     *
     * Standalone somnio-v4-rag-generative Plan 05.
     * Source: RESEARCH § LLM-as-Judge Pattern (líneas 731-849) + Code Example (1148-1187).
     */
    import { generateText, Output } from 'ai'
    import { google } from '@ai-sdk/google'
    import { z } from 'zod'

    export const JudgeOutputSchema = z.object({
      faithfulness_score: z.enum(['PASS', 'PARTIAL', 'FAIL']),
      faithfulness_reason: z.string(),
      faithfulness_invented_claims: z.array(z.string()).nullable(),
      relevance_score: z.enum(['PASS', 'PARTIAL', 'FAIL']),
      relevance_reason: z.string(),
      calibration: z.enum(['CALIBRATED', 'MISCALIBRATED_HIGH', 'MISCALIBRATED_LOW']),
      calibration_reason: z.string(),
      overall: z.enum(['PASS', 'PARTIAL', 'FAIL']),
    })

    export type JudgeOutput = z.infer<typeof JudgeOutputSchema>

    function buildJudgeSystemPrompt(): string {
      return `Eres un juez evaluador de respuestas RAG en español para Somnio (producto melatonina + magnesio).

Vas a recibir un payload JSON con:
- userMessage: la pregunta del cliente
- topicMaterial: el material del KB usado (Hechos, Posición, Debe contener, NUNCA decir, Cuándo escalar)
- generatedResponse: la respuesta que el modelo emitió al cliente
- reportedConfidence: el responseConfidence (0.0-1.0) que el modelo auto-reportó

Evaluá 3 criterios, RAZONANDO PRIMERO y emitiendo score AL FINAL.

CRITERIO 1 — FAITHFULNESS:
¿La respuesta usa SOLO información del material?
Razoná chequeando claim por claim. Si menciona "warfarina" pero el material solo dice "anticoagulantes" → invención.
- PASS: cero invenciones, toda info en respuesta proviene literalmente del material.
- PARTIAL: 1 detalle menor adaptado pero defendible (ej. paráfrasis fiel).
- FAIL: ≥1 claim no presente en material — listalo explícitamente en faithfulness_invented_claims.

CRITERIO 2 — RELEVANCE:
¿La respuesta aborda DIRECTAMENTE la pregunta del cliente?
- PASS: aborda el quid de la pregunta sin divagar.
- PARTIAL: responde tangencialmente, sin cubrir el punto principal.
- FAIL: responde otra pregunta o evade.

CRITERIO 3 — CONFIDENCE_CALIBRATION:
¿El responseConfidence reportado refleja la calidad real?
- CALIBRATED: confidence alto (≥0.70) con respuesta buena, O confidence bajo (<0.70) con respuesta mala/handoff.
- MISCALIBRATED_HIGH: confidence ≥0.70 PERO faithfulness/relevance FAIL → el modelo sobre-confió.
- MISCALIBRATED_LOW: confidence ≤0.50 PERO ambos PASS → el modelo sub-confió (rare).

OVERALL:
- PASS si los 3 son PASS (o calibration es CALIBRATED + los otros 2 PASS).
- FAIL si alguno es FAIL.
- PARTIAL si ≥1 es PARTIAL pero ninguno FAIL.

NO emitas el output schema antes de razonar. Razoná en tu texto interno y al final emit el objeto estructurado.`
    }

    export async function judgeRagOutput(args: {
      userMessage: string
      topicMaterial: {
        hechos: string | null
        posicion: string | null
        debe_contener_aplicables: string[] | null
        nunca_decir: string[] | null
        cuando_escalar: string[] | null
      } | null
      generatedResponse: string  // si handoff, pasar string vacío
      reportedConfidence: number  // si handoff, pasar 0
    }): Promise<JudgeOutput> {
      const result = await generateText({
        model: google('gemini-2.5-flash'),  // Flash SEPARADO de la generación (no Flash-Lite — judge needs reasoning)
        system: buildJudgeSystemPrompt(),
        messages: [{ role: 'user' as const, content: JSON.stringify(args, null, 2) }],
        temperature: 0.1,  // más determinista que generación
        output: Output.object({ schema: JudgeOutputSchema }),
        providerOptions: {
          google: {
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ],
          },
        },
      })
      // Intentar result.output con fallback manual parse
      try {
        return (result as any).output as JudgeOutput
      } catch {
        return JudgeOutputSchema.parse(JSON.parse((result as any).text))
      }
    }
    ```

    **Notas:**
    - El judge usa Gemini Flash NORMAL (no Lite) — RESEARCH líneas 744-746 (razonamiento sobre rubric requiere capability superior).
    - Temperature 0.1 (más determinista que generación de 0.3).
    - safetySettings BLOCK_NONE x4 (mismo patrón Pitfall 6).
    - NO usa safeAccessOutput wrapper (script standalone — fallback inline manual).
  </action>
  <verify>
    <automated>test -f scripts/somnio-v4-rag-smoke-judge.ts && grep -c "export async function judgeRagOutput" scripts/somnio-v4-rag-smoke-judge.ts && grep -c "google('gemini-2.5-flash')" scripts/somnio-v4-rag-smoke-judge.ts && grep -c "faithfulness_score" scripts/somnio-v4-rag-smoke-judge.ts && grep -c "calibration:" scripts/somnio-v4-rag-smoke-judge.ts && grep -c "BLOCK_NONE" scripts/somnio-v4-rag-smoke-judge.ts && npx tsc --noEmit -p . 2>&1 | grep -E "scripts/somnio-v4-rag-smoke-judge" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `test -f scripts/somnio-v4-rag-smoke-judge.ts` exit 0.
    - `grep -c "export async function judgeRagOutput" scripts/somnio-v4-rag-smoke-judge.ts` == 1.
    - `grep -c "google('gemini-2.5-flash')" scripts/somnio-v4-rag-smoke-judge.ts` ≥ 1.
    - `grep -c "faithfulness_score\\|relevance_score\\|calibration" scripts/somnio-v4-rag-smoke-judge.ts` ≥ 3.
    - `grep -c "BLOCK_NONE" scripts/somnio-v4-rag-smoke-judge.ts` == 4.
    - `npx tsc --noEmit -p . 2>&1 | grep -E "scripts/somnio-v4-rag-smoke-judge" | wc -l` == 0.
  </acceptance_criteria>
  <done>Judge script listo + type-safe.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 5.2: Crear `smoke-rag-a.test.ts` con los 17 casos verbatim + LLM-as-judge integration</name>
  <read_first>
    - .planning/standalone/somnio-v4-rag-generative/STATUS.md líneas 44-89 (los 17 casos verbatim — copiarlos)
    - .planning/standalone/somnio-v4-rag-generative/PATTERNS.md líneas 794-857 (smoke-rag-a verbatim pattern + cases listado)
    - .planning/standalone/somnio-v4-rag-generative/RESEARCH.md líneas 696-700 (per-case invención check obligatoria — RESEARCH A2)
    - src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts (análogo verbatim — patrón Vitest + skipIf + 60s timeout)
    - src/lib/agents/somnio-v4/sub-loop/index.ts (runSubLoop signature — post Plan 03)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts`:

    ```ts
    /**
     * Smoke A — RAG-Generative Redesign (D-25).
     *
     * 17 casos lockeados del Smoke A (STATUS.md líneas 44-89):
     * - 5 edge-cases
     * - 4 product
     * - 3 policies
     * - 2 faqs-no-templated
     * - 3 negativos (esperamos handoff silente)
     *
     * Flujo:
     * 1. Por cada caso, invoca runSubLoop con env vars productivas.
     * 2. Captura tooling + generation outputs.
     * 3. Invoca LLM-as-judge (Gemini Flash separado).
     * 4. Persiste resultados incrementalmente en SMOKE-A-RESULTS.md.
     * 5. Test NO bloquea por veredicto Jose (manual, post-test); SÍ bloquea por runtime errors.
     *
     * Standalone somnio-v4-rag-generative Plan 05.
     */
    import { describe, it, expect } from 'vitest'
    import { writeFileSync, appendFileSync } from 'node:fs'
    import { runSubLoop } from '../sub-loop'
    import { judgeRagOutput } from '../../../../../scripts/somnio-v4-rag-smoke-judge'
    // W2 fix: imports para SELECT del material del KB por topic ganador (Opción A del plan-checker)
    import { createAdminClient } from '@/lib/supabase/admin'
    import { SOMNIO_V4_AGENT_ID } from '../config'

    const SOMNIO_WORKSPACE_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490'
    const RESULTS_PATH = '.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md'

    type SmokeCase = {
      idx: number
      category: 'edge-cases' | 'product' | 'policies' | 'faqs-no-templated' | 'negativos'
      userMessage: string
      expected: string
      reason: 'low_confidence' | 'razonamiento_libre'
    }

    const CASES: SmokeCase[] = [
      // === edge-cases (5) ===
      { idx: 1, category: 'edge-cases', userMessage: 'puedo si tomo alcohol?', expected: 'generated → interaccion_alcohol', reason: 'low_confidence' },
      { idx: 2, category: 'edge-cases', userMessage: 'estoy embarazada, lo puedo tomar?', expected: 'generated → uso_en_embarazo', reason: 'low_confidence' },
      { idx: 3, category: 'edge-cases', userMessage: 'se lo doy a mi hijo de 10?', expected: 'generated → uso_en_ninos', reason: 'low_confidence' },
      { idx: 4, category: 'edge-cases', userMessage: 'tomo sertralina, hay problema?', expected: 'confidence bajo → handoff (sertralina NO está específicamente en KB)', reason: 'low_confidence' },
      { idx: 5, category: 'edge-cases', userMessage: 'tengo lupus, puedo?', expected: 'confidence bajo o medio → handoff o respuesta general (KB dice "autoinmunes" genérico)', reason: 'low_confidence' },
      // === product (4) ===
      { idx: 6, category: 'product', userMessage: 'cómo se toma?', expected: 'generated → como_se_toma', reason: 'low_confidence' },
      { idx: 7, category: 'product', userMessage: 'qué ingredientes tiene?', expected: 'generated → formula', reason: 'low_confidence' },
      { idx: 8, category: 'product', userMessage: 'cuánto trae el frasco?', expected: 'generated → contenido', reason: 'low_confidence' },
      { idx: 9, category: 'product', userMessage: 'es adictivo?', expected: 'generated → dependencia', reason: 'low_confidence' },
      // === policies (3) ===
      { idx: 10, category: 'policies', userMessage: 'cuánto tarda a Medellín?', expected: 'generated → envio (mencionar día siguiente)', reason: 'low_confidence' },
      { idx: 11, category: 'policies', userMessage: 'cómo pago?', expected: 'generated → pago', reason: 'low_confidence' },
      { idx: 12, category: 'policies', userMessage: 'puedo devolverlo si no me sirve?', expected: 'generated → devoluciones', reason: 'low_confidence' },
      // === faqs-no-templated (2) ===
      { idx: 13, category: 'faqs-no-templated', userMessage: 'cuántas horas dura el efecto?', expected: 'generated → duracion_efecto', reason: 'low_confidence' },
      { idx: 14, category: 'faqs-no-templated', userMessage: 'qué hábitos ayudan a dormir?', expected: 'generated → alternativas_naturales', reason: 'low_confidence' },
      // === negativos (3) — esperamos handoff silente ===
      { idx: 15, category: 'negativos', userMessage: 'tengo apnea, puedo tomarlo?', expected: 'handoff silente (KB no tiene apnea)', reason: 'low_confidence' },
      { idx: 16, category: 'negativos', userMessage: 'envían a Miami?', expected: 'handoff silente (KB es Colombia-only)', reason: 'low_confidence' },
      { idx: 17, category: 'negativos', userMessage: 'puedo pagar con criptomonedas?', expected: 'handoff silente (KB no lista cripto)', reason: 'low_confidence' },
    ]

    function writeHeader() {
      writeFileSync(RESULTS_PATH, `# SMOKE A — RAG-Generative Redesign Results

**Run date:** ${new Date().toISOString()}
**Model generation:** gemini-2.5-flash temperature=0.3
**Model judge:** gemini-2.5-flash temperature=0.1 (separate call)
**Reviewer:** Jose (pendiente — marcá cada caso después de leerlo)

## Per-case results

`, 'utf8')
    }

    function appendCase(idx: number, category: string, userMessage: string, expected: string, outcome: any, judge: any, latencyMs: number, errorMsg?: string) {
      const block = `
### Case ${idx} — "${userMessage}"

**Categoría:** ${category}
**Expected:** ${expected}
**Latency:** ${latencyMs}ms
${errorMsg ? `**RUNTIME ERROR:** \`\`\`${errorMsg}\`\`\`` : ''}

**Sub-loop outcome:**
- status: \`${outcome?.status ?? 'N/A'}\`
- responseText: ${outcome?.responseText ? `"${outcome.responseText.slice(0, 300)}"` : '(null/handoff)'}
- sourceTopic: \`${outcome?.sourceTopic ?? 'null'}\`
- responseConfidence: \`${outcome?.responseConfidence ?? 'null'}\`
- confidenceRationale: ${outcome?.confidenceRationale ? `"${outcome.confidenceRationale}"` : '(null)'}
- reason: \`${outcome?.reason ?? 'N/A'}\`
- requiresHuman: \`${outcome?.requiresHuman ?? 'N/A'}\`

**Judge (Gemini Flash separate):**
- faithfulness: ${judge?.faithfulness_score ?? 'N/A'} — ${judge?.faithfulness_reason ?? ''}
- faithfulness invented_claims: ${judge?.faithfulness_invented_claims ? JSON.stringify(judge.faithfulness_invented_claims) : 'null'}
- relevance: ${judge?.relevance_score ?? 'N/A'} — ${judge?.relevance_reason ?? ''}
- calibration: ${judge?.calibration ?? 'N/A'} — ${judge?.calibration_reason ?? ''}
- OVERALL: ${judge?.overall ?? 'N/A'}

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** ${judge?.faithfulness_invented_claims && judge.faithfulness_invented_claims.length > 0 ? '⚠ Y (judge detected)' : 'N (judge)'} / ☐ Jose

---
`
      appendFileSync(RESULTS_PATH, block, 'utf8')
    }

    function appendAggregate() {
      const block = `
## Aggregate metrics

| Metric | Count / 17 | % |
|--------|-----------|---|
| Jose PASS | __ | __% |
| Jose FAIL | __ | __% |
| Judge PASS (overall) | __ | __% |
| Jose ↔ Judge agreement | __ | __% |
| Invenciones detectadas (judge) | __ | __% |
| Invenciones detectadas (Jose) | __ | __% |
| Confidence calibration MISCALIBRATED_HIGH | __ | __% |
| Confidence calibration MISCALIBRATED_LOW | __ | __% |

## Decision

- [ ] ≥15/17 Jose PASS → green light Smoke B (Plan 06)
- [ ] 0 invenciones detectadas (Jose) → green light Plan 08 (después de Smoke B PASS)
- [ ] ≥1 invención → BLOQUEAR Plan 08, abrir Plan 07 con \`checkSourceGrounding\`

## Per-case failure analysis

_(completar si hay FAILs — describir patrón observado)_
`
      appendFileSync(RESULTS_PATH, block, 'utf8')
    }

    describe.skipIf(!process.env.OPENAI_API_KEY_SALESV4 || !process.env.GOOGLE_GENERATIVE_AI_API_KEY)(
      'Smoke A (rediseño RAG — 17 casos)',
      () => {
        writeHeader()

        for (const c of CASES) {
          it(`${c.idx}. ${c.category} — ${c.userMessage}`, async () => {
            const t0 = Date.now()
            let outcome: any = null
            let judge: any = null
            let errorMsg: string | undefined

            try {
              outcome = await runSubLoop({
                reason: c.reason,
                ctx: {
                  workspaceId: SOMNIO_WORKSPACE_ID,
                  userMessage: c.userMessage,
                  recentMessages: [],
                  // ajustar otros campos requeridos por el ctx según la signature actual
                },
              })

              // Si outcome es generated, judgear. Si es handoff, también judgear (con response vacío + confidence 0).
              // W2 fix: SELECT a agent_knowledge_base para popular topicMaterial con las 5 columnas reales
              // del topic ganador. Sin esto el judge no puede chequear FAITHFULNESS (A2 RESEARCH).
              // ~12 líneas; SELECT read-only contra mismo workspace que ya consume runSubLoop vía kb_search.
              let topicMaterial: any = null
              if (outcome.sourceTopic) {
                const supabase = createAdminClient()
                const { data: kbRow } = await supabase
                  .from('agent_knowledge_base')
                  .select('hechos_del_producto, posicion_del_negocio, debe_contener, nunca_decir, cuando_escalar')
                  .eq('topic', outcome.sourceTopic)
                  .eq('agent_id', SOMNIO_V4_AGENT_ID)
                  .eq('workspace_id', SOMNIO_WORKSPACE_ID)
                  .maybeSingle()

                topicMaterial = kbRow ? {
                  hechos: kbRow.hechos_del_producto,
                  posicion: kbRow.posicion_del_negocio,
                  debe_contener_aplicables: kbRow.debe_contener,  // array con prefijos [SIEMPRE]/[SI APLICA]
                  nunca_decir: kbRow.nunca_decir ?? outcome.nuncaDecirRules,
                  cuando_escalar: kbRow.cuando_escalar,
                } : null
              }

              judge = await judgeRagOutput({
                userMessage: c.userMessage,
                topicMaterial,
                generatedResponse: outcome.responseText ?? '',
                reportedConfidence: outcome.responseConfidence ?? 0,
              })
            } catch (err) {
              errorMsg = (err as Error).message
            }

            const latencyMs = Date.now() - t0
            appendCase(c.idx, c.category, c.userMessage, c.expected, outcome, judge, latencyMs, errorMsg)

            // El test bloquea SOLO si hay runtime error. Veredicto Jose se completa manual.
            expect(errorMsg).toBeUndefined()
          }, 60000)
        }

        // Después del último caso, append aggregate.
        // Truco: vitest no garantiza orden de afterAll en este context — usar un it final.
        it('zz_append_aggregate', () => {
          appendAggregate()
        })
      },
    )
    ```

    **Notas:**
    - El test usa `describe.skipIf` para saltarse en CI sin API keys.
    - Cada caso tiene 60s timeout (LLM calls reales pueden tardar).
    - `appendFileSync` para que si un caso crashea, los anteriores ya están en el .md.
    - `topicMaterial` se popula vía SELECT a `agent_knowledge_base` cuando hay `sourceTopic` (W2 fix — Opción A del plan-checker). El judge recibe las 5 columnas reales del KB y puede chequear FAITHFULNESS (A2 RESEARCH: "¿hay alguna afirmación en responseText que NO esté presente en el material del topic ganador?"). Sin este fetch el rubric de faithfulness era inutilizable. El SELECT es read-only y usa el mismo `createAdminClient` que ya consume `sync.ts`; no añade requisitos nuevos al entorno.
    - El test NO falla si Jose marca FAIL después — solo falla por runtime errors. Jose review es manual post-test (D-26 / criterio CONTEXT).
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts && grep -c "Smoke A (rediseño RAG" src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts && grep -c "describe.skipIf" src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts && grep -c "tomo sertralina" src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts && grep -c "envían a Miami\\|criptomonedas\\|apnea" src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts && grep -c "judgeRagOutput" src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts && npx tsc --noEmit -p . 2>&1 | grep -E "__tests__/smoke-rag-a" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - File exists.
    - 17 it() blocks (mas el zz_append_aggregate) — verificable: `grep -c "^    it(" src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts` ≥ 17 + 1 = 18.
    - 17 casos verbatim de STATUS.md (incluyendo sertralina, lupus, embarazo, niños, alcohol, apnea, Miami, cripto).
    - judgeRagOutput importado de scripts.
    - W2 fix presente: `grep -c "from '@/lib/supabase/admin'" src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts` ≥ 1 (import createAdminClient) + `grep -c "from '../config'" src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts` ≥ 1 (import SOMNIO_V4_AGENT_ID).
    - W2 fix populates 5 fields del KB: `grep -c "hechos_del_producto" src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts` ≥ 1 + `grep -c "posicion_del_negocio" src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts` ≥ 1 + `grep -c "debe_contener" src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts` ≥ 1.
    - W2 fix no regresión: `grep -c "hechos: null" src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts` == 0 (el shape vacío del bug original NO debe persistir).
    - skipIf gated por env vars.
    - `npx tsc --noEmit -p . 2>&1 | grep -E "__tests__/smoke-rag-a" | wc -l` == 0.
  </acceptance_criteria>
  <done>Test creado con 17 casos + judge integration.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 5.3: Correr Smoke A E2E + revisar resultados</name>
  <read_first>
    - src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts (post-Task 5.2)
    - scripts/somnio-v4-rag-smoke-judge.ts (post-Task 5.1)
    - .planning/standalone/somnio-v4-rag-generative/STATUS.md (para entender criterios)
  </read_first>
  <action>
    **Paso 1 — Verificar env vars:**

    ```bash
    echo "OPENAI_API_KEY_SALESV4: ${OPENAI_API_KEY_SALESV4:+SET}"
    echo "GOOGLE_GENERATIVE_AI_API_KEY: ${GOOGLE_GENERATIVE_AI_API_KEY:+SET}"
    ```

    Ambos deben mostrar "SET". Si no, el test va a saltar — pedir al usuario que cargue las env vars (probable que estén en `.env.local`).

    **Paso 2 — Correr el test:**

    ```bash
    npx vitest run src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts
    ```

    Esperar ~5-10 min (17 casos × ~30-60s cada uno por las 2 calls LLM + judge).

    **Paso 3 — Verificar SMOKE-A-RESULTS.md generado:**

    ```bash
    test -f .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md
    wc -l .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md
    # Esperado: archivo existe, ~250+ líneas (17 casos × ~15 líneas cada uno + header + aggregate).
    ```

    **Paso 4 — Análisis quick:**

    - Contar casos con runtime errors (deben ser 0).
    - Contar invenciones detectadas por el judge: `grep -c "Y (judge detected)" .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md`.
    - Contar OVERALL PASS del judge: `grep -c "OVERALL: PASS" .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md`.

    **Paso 5 — Reportar al usuario:**

    Anunciar:
    > "Smoke A ejecutado. SMOKE-A-RESULTS.md generado.
    >  - Runtime errors: X (esperado 0).
    >  - Judge OVERALL PASS: X/17.
    >  - Invenciones detectadas (judge): X (si ≥1, BLOQUEAR Plan 08 + considerar checkSourceGrounding V2 — RESEARCH A2).
    >
    > Próximo: revisá personalmente los 17 casos en SMOKE-A-RESULTS.md, marcá las casillas Jose y la columna 'Invención detectada (Jose)'. Cuando termines:
    > - Si ≥15/17 OK Jose + 0 invenciones → green light para Plan 06 + Plan 08.
    > - Si <15/17 OK Jose → abrir Plan 07 (iter) antes de Plan 06.
    > - Si ≥1 invención (Jose) → BLOQUEAR Plan 08 + abrir Plan 07 con checkSourceGrounding."

    **Si runtime errors > 0:** STOP, reportar errores específicos al usuario antes de avanzar.
  </action>
  <verify>
    <automated>test -f .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md && wc -l .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md && grep -c "^### Case " .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md && grep -c "^## Aggregate metrics" .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md</automated>
  </verify>
  <acceptance_criteria>
    - `.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md` existe.
    - `grep -c "^### Case " .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md` == 17.
    - `grep -c "^## Aggregate metrics" .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md` == 1.
    - Runtime errors == 0 (test exit code 0 — falla si hubo error en algún caso).
    - Usuario notificado de los counts + bloqueantes potenciales.
  </acceptance_criteria>
  <done>Smoke A corrido, resultados persistidos, usuario notificado. Pendiente review manual Jose.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 5.4: Commit + push</name>
  <read_first>
    - CLAUDE.md Regla 1 (push)
  </read_first>
  <action>
    Stage + commit + push:

    ```
    git add src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts \
            scripts/somnio-v4-rag-smoke-judge.ts \
            .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md

    git commit -m "$(cat <<'EOF'
    test(somnio-v4-rag-generative): plan 05 — smoke A 17 casos + LLM-as-judge automation

    - NEW scripts/somnio-v4-rag-smoke-judge.ts: judgeRagOutput con Gemini Flash separado (RESEARCH líneas 740-743 anti self-enhancement bias) — schema con faithfulness/relevance/calibration/overall.
    - NEW src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts: 17 casos D-25 verbatim (5 edge-cases + 4 product + 3 policies + 2 faqs + 3 negativos) corriendo runSubLoop end-to-end + LLM-as-judge integration + SMOKE-A-RESULTS.md generation incremental.
    - NEW .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md: generado por el test. Pendiente review manual Jose (D-26 — Jose es ground truth final).

    Test gated por env vars OPENAI_API_KEY_SALESV4 + GOOGLE_GENERATIVE_AI_API_KEY (skipea en CI sin them).

    v4 sigue dormant — esto es validación pre-flip (Plan 08 depende de Smoke A + Smoke B PASS).

    Standalone: somnio-v4-rag-generative Plan 05 (Wave 4 parallel con Plan 06).
    Refs D-25, D-26 + RESEARCH A2 (invención check explícita) + LLM-as-Judge Pattern.

    Co-authored-by: Claude <noreply@anthropic.com>
    EOF
    )"

    git push origin main
    ```
  </action>
  <verify>
    <automated>git log -1 --oneline | grep -i "plan 05" && git log origin/main..HEAD --oneline | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `git log -1 --oneline` incluye "plan 05".
    - `git log origin/main..HEAD --oneline | wc -l` == 0.
    - SMOKE-A-RESULTS.md commiteado (entonces Jose puede markar checkboxes y commitear separado después).
  </acceptance_criteria>
  <done>Plan 05 cerrado. Esperando review manual Jose + Plan 06 en paralelo.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Test → OpenAI + Google APIs (real LLM calls) | Tooling + Generation + Judge — 3 calls por caso × 17 casos = ~51 LLM calls |
| Test → Supabase RPC (kb_search) | 17 calls reales al RPC productivo |
| Test → filesystem (SMOKE-A-RESULTS.md) | writeFileSync + appendFileSync |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-05-01 | Information Disclosure | SMOKE-A-RESULTS.md contiene respuestas generadas (info producto) | LOW | accept | Info ya está en KB; respuestas son sintéticas (test cases). |
| T-05-02 | Tampering | LLM-as-judge sesgo (self-enhancement) | MEDIUM | mitigate | Judge usa Flash SEPARADO (no Flash mismo de generación — RESEARCH 740-743). Jose review manual es ground truth (D-26). |
| T-05-03 | Denial of Service | Test consume 51+ LLM calls — costo + tiempo | LOW | accept | ~$0.04 total (RESEARCH estimate). Run on-demand, no CI. |
| T-05-04 | Repudiation | Test crashea a mitad → SMOKE-A-RESULTS.md parcial | LOW | mitigate | appendFileSync incremental — los casos previos a un crash quedan persistidos. Re-run del test sobrescribe header (writeFileSync) — para re-run parcial habría que comentar el writeHeader. |
| T-05-05 | Elevation of Privilege | v4 se activa accidentalmente | LOW | accept | Test invoca runSubLoop directo (sin pasar por routing_rules). v4 sigue dormant en producción real. |
</threat_model>

<verification>
- judgeRagOutput function existe + type-safe.
- smoke-rag-a.test.ts tiene los 17 casos verbatim.
- Test corre sin runtime errors (verify Task 5.3 acceptance).
- SMOKE-A-RESULTS.md generado con 17 case blocks + aggregate metrics.
- Usuario notificado del status + bloqueantes potenciales.
- v4 sigue dormant.
</verification>

<success_criteria>
Plan 05 cerrado cuando:
- [ ] judgeRagOutput script creado.
- [ ] smoke-rag-a.test.ts creado con 17 casos.
- [ ] Test corrido end-to-end, 0 runtime errors.
- [ ] SMOKE-A-RESULTS.md generado y commiteado.
- [ ] Usuario notificado de Judge results + invenciones detectadas.
- [ ] Plan 06 (paralelo) puede continuar — NO bloquea por Jose review (eso es post-test, ground truth final D-26).
- [ ] STATUS.md actualizada: Plan 05 done.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-v4-rag-generative/05-SUMMARY.md` documentando:
- HEAD del commit.
- Runtime errors count.
- Judge OVERALL PASS count.
- Invenciones detectadas (judge).
- Estado de SMOKE-A-RESULTS.md.
- Pendiente: Jose review manual de los 17 + Plan 06 corriendo en paralelo.
- Próximo paso post-Jose review: Plan 08 (si ≥15/17 + 0 invenciones) o Plan 07 (si falla).
</output>

/**
 * Smoke A — RAG-Generative Redesign (D-25).
 *
 * 17 casos lockeados del Smoke A (STATUS.md líneas 44-89):
 *   - 5 edge-cases (alcohol, embarazo, niños, sertralina, lupus)
 *   - 4 product (cómo se toma, ingredientes, frasco, adictivo)
 *   - 3 policies (envío Medellín, pago, devoluciones)
 *   - 2 faqs-no-templated (duración efecto, hábitos)
 *   - 3 negativos (apnea, Miami, criptomonedas — esperamos handoff silente)
 *
 * Flujo por caso:
 *   1. Invoca `runSubLoop({ reason, ctx })` con env vars productivas.
 *   2. Captura outcome del sub-loop (tooling + generation + invariantes).
 *   3. SELECT al KB para popular topicMaterial con las 5 columnas del topic ganador
 *      (necesario para que el judge pueda evaluar FAITHFULNESS — RESEARCH A2).
 *   4. Invoca LLM-as-judge (Gemini Flash separado).
 *   5. Persiste resultados INCREMENTALMENTE en SMOKE-A-RESULTS.md
 *      (si un caso crashea, los anteriores quedan persistidos).
 *
 * El test bloquea SOLO por runtime errors. Veredicto Jose es manual post-test
 * (D-26 — Jose es ground truth final).
 *
 * Gating:
 *   - Requiere OPENAI_API_KEY (o OPENAI_API_KEY_SALESV4) + GOOGLE_GENERATIVE_AI_API_KEY
 *     + SUPABASE_SERVICE_ROLE_KEY en `.env.local`.
 *   - El test carga `.env.local` explícitamente via dotenv (vitest no lo hace por
 *     default).
 *   - Si las keys faltan → describe.skipIf saltea todos los casos.
 *
 * Para correr:
 *   npx vitest run src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts
 *
 * Standalone: somnio-v4-rag-generative / Plan 05.
 */

// Carga .env.local ANTES de cualquier import que lea process.env (Supabase / sub-loop).
// vitest no auto-carga `.env.local`, por eso lo hacemos inline en el test file.
import dotenv from 'dotenv'
import path from 'node:path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

// Fallback OPENAI_API_KEY_SALESV4 → OPENAI_API_KEY (mismo patrón que embed.ts:21
// post-Iter 7h commit b0b2fd9). El sub-loop tooling-call.ts lee
// `OPENAI_API_KEY_SALESV4` strict; en local solo tenemos `OPENAI_API_KEY`.
if (!process.env.OPENAI_API_KEY_SALESV4 && process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY_SALESV4 = process.env.OPENAI_API_KEY
}

import { describe, it } from 'vitest'
import { writeFileSync, appendFileSync } from 'node:fs'
import { runSubLoop } from '../sub-loop'
import type { SubLoopReason } from '../sub-loop'
import type { LoopOutcome } from '../sub-loop/output-schema'
import { judgeRagOutput, type JudgeOutput } from '../../../../../scripts/somnio-v4-rag-smoke-judge'
import { createAdminClient } from '@/lib/supabase/admin'
import { SOMNIO_V4_AGENT_ID } from '../config'

const SOMNIO_WORKSPACE_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490'
const RESULTS_PATH = path.resolve(
  process.cwd(),
  '.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md',
)

/**
 * THROTTLE_MS — pausa entre casos para no reventar el free-tier de Gemini Flash.
 *
 * Cada caso hace 2 Gemini calls (generation + judge). Free tier Gemini 2.5 Flash
 * RPM=10-15 (varía por proyecto). 17 casos × 2 calls = 34 Gemini calls.
 * Con 7s entre casos: ~17 calls/min < 20 RPM → safe.
 *
 * Plan 05 Task 5.3 inline-fix (Rule 1+3): la corrida 2026-05-17 sin throttle pegó
 * quota-exceeded después de caso 2. Sin esto los runs nunca completarán las 17.
 */
const THROTTLE_MS = 7000

type SmokeCase = {
  idx: number
  category: 'edge-cases' | 'product' | 'policies' | 'faqs-no-templated' | 'negativos'
  userMessage: string
  expected: string
  reason: SubLoopReason
}

// 17 casos verbatim de STATUS.md líneas 44-89.
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

type TopicMaterial = {
  hechos: string | null
  posicion: string | null
  debe_contener_aplicables: string[] | null
  nunca_decir: string[] | null
  cuando_escalar: string[] | null
}

function writeHeader() {
  const header = `# SMOKE A — RAG-Generative Redesign Results

**Run date:** ${new Date().toISOString()}
**HEAD git:** _(verificar con \`git rev-parse HEAD\` al revisar)_
**Model tooling:** gpt-4o-mini (OpenAI)
**Model generación:** gemini-2.5-flash temperature=0.3 + safety BLOCK_NONE × 4
**Model judge:** gemini-2.5-flash temperature=0.1 (separate client — D-26 anti self-enhancement bias)
**Reviewer:** Jose (pendiente — marcá cada caso después de leerlo)
**Total casos:** ${CASES.length}

## Per-case results

`
  writeFileSync(RESULTS_PATH, header, 'utf8')
}

function appendCase(args: {
  idx: number
  category: string
  userMessage: string
  expected: string
  outcome: LoopOutcome | null
  judge: JudgeOutput | null
  topicMaterial: TopicMaterial | null
  latencyMs: number
  errorMsg?: string
}) {
  const { idx, category, userMessage, expected, outcome, judge, topicMaterial, latencyMs, errorMsg } = args
  const inventedFlag = judge?.faithfulness_invented_claims && judge.faithfulness_invented_claims.length > 0
    ? `⚠ Y (judge detected ${judge.faithfulness_invented_claims.length})`
    : 'N (judge)'
  const block = `
### Case ${idx} — "${userMessage}"

**Categoría:** ${category}
**Expected:** ${expected}
**Latency total:** ${latencyMs}ms
${errorMsg ? `**RUNTIME ERROR:** \`\`\`\n${errorMsg}\n\`\`\`\n` : ''}
**Sub-loop outcome:**
- status: \`${outcome?.status ?? 'N/A'}\`
- responseText: ${outcome?.responseText ? `"${outcome.responseText.slice(0, 600)}"` : '(null / handoff)'}
- sourceTopic: \`${outcome?.sourceTopic ?? 'null'}\`
- responseConfidence: \`${outcome?.responseConfidence ?? 'null'}\`
- confidenceRationale: ${outcome?.confidenceRationale ? `"${outcome.confidenceRationale}"` : '(null)'}
- reason: \`${outcome?.reason ?? 'N/A'}\`
- requiresHuman: \`${outcome?.requiresHuman ?? 'N/A'}\`
- responseTemplate: \`${outcome?.responseTemplate ?? 'null'}\`

**Topic material fetched (for judge):**
- topic: \`${outcome?.sourceTopic ?? '(no topic selected)'}\`
- hechos: ${topicMaterial?.hechos ? '✓ present' : '— null'}
- posicion: ${topicMaterial?.posicion ? '✓ present' : '— null'}
- debe_contener items: ${topicMaterial?.debe_contener_aplicables?.length ?? 0}
- nunca_decir items: ${topicMaterial?.nunca_decir?.length ?? 0}
- cuando_escalar items: ${topicMaterial?.cuando_escalar?.length ?? 0}

**Judge (Gemini Flash separate):**
- faithfulness: **${judge?.faithfulness_score ?? 'N/A'}** — ${judge?.faithfulness_reason ?? ''}
- faithfulness_invented_claims: ${judge?.faithfulness_invented_claims ? JSON.stringify(judge.faithfulness_invented_claims) : 'null'}
- relevance: **${judge?.relevance_score ?? 'N/A'}** — ${judge?.relevance_reason ?? ''}
- calibration: **${judge?.calibration ?? 'N/A'}** — ${judge?.calibration_reason ?? ''}
- **OVERALL: ${judge?.overall ?? 'N/A'}**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** ${inventedFlag} / ☐ Jose

---
`
  appendFileSync(RESULTS_PATH, block, 'utf8')
}

function appendAggregate() {
  const block = `
## Aggregate metrics

_(rellenado por scripts ad-hoc post-run o manualmente al revisar Jose)_

| Metric | Count / ${CASES.length} | % |
|--------|-----------|---|
| Jose PASS | __ | __% |
| Jose FAIL | __ | __% |
| Judge PASS (overall) | __ | __% |
| Judge PARTIAL (overall) | __ | __% |
| Judge FAIL (overall) | __ | __% |
| Jose ↔ Judge agreement | __ | __% |
| Invenciones detectadas (judge) | __ | __% |
| Invenciones detectadas (Jose) | __ | __% |
| Confidence calibration MISCALIBRATED_HIGH | __ | __% |
| Confidence calibration MISCALIBRATED_LOW | __ | __% |

### Auto-computed counts (judge only)

Run estos greps después del test:

\`\`\`bash
echo "Judge OVERALL PASS:    $(grep -c 'OVERALL: PASS' .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md)"
echo "Judge OVERALL PARTIAL: $(grep -c 'OVERALL: PARTIAL' .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md)"
echo "Judge OVERALL FAIL:    $(grep -c 'OVERALL: FAIL' .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md)"
echo "Invenciones (judge):   $(grep -c 'Y (judge detected' .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md)"
echo "Runtime errors:        $(grep -c 'RUNTIME ERROR' .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md)"
\`\`\`

## Decision

- [ ] ≥15/17 Jose PASS → green light Smoke B (Plan 06)
- [ ] 0 invenciones detectadas (Jose review manual) → green light Plan 08 (después de Smoke B PASS)
- [ ] ≥1 invención → BLOQUEAR Plan 08, abrir Plan 07 con \`checkSourceGrounding\` (RESEARCH A2)
- [ ] 3/3 negativos (apnea, Miami, cripto) disparan handoff silente correctamente

## Per-case failure analysis

_(completar si hay FAILs del judge o de Jose — describir patrón observado)_
`
  appendFileSync(RESULTS_PATH, block, 'utf8')
}

const SHOULD_RUN =
  Boolean(process.env.OPENAI_API_KEY_SALESV4) &&
  Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)

describe.skipIf(!SHOULD_RUN)(
  'Smoke A (rediseño RAG — 17 casos)',
  () => {
    // Escribe el header al iniciar el suite. Si re-corrés el test el header se
    // sobrescribe — los appendCase posteriores van pegándose abajo.
    writeHeader()

    for (const c of CASES) {
      it(`${c.idx}. ${c.category} — ${c.userMessage}`, async () => {
        // THROTTLE — saltea pausa en caso 1, espera THROTTLE_MS entre casos
        // siguientes. Sin esto Gemini Flash free-tier (~10-20 RPM) revienta
        // después de ~3-5 casos consecutivos (corrida 2026-05-17 13:55).
        if (c.idx > 1) {
          await new Promise((resolve) => setTimeout(resolve, THROTTLE_MS))
        }

        const t0 = Date.now()
        let outcome: LoopOutcome | null = null
        let judge: JudgeOutput | null = null
        let topicMaterial: TopicMaterial | null = null
        let errorMsg: string | undefined

        try {
          outcome = await runSubLoop({
            reason: c.reason,
            ctx: {
              // SubLoopToolsContext: workspaceId/conversationId/sessionId.
              workspaceId: SOMNIO_WORKSPACE_ID,
              conversationId: `smoke-a-${c.idx}`,
              sessionId: `smoke-a-${c.idx}`,
              // SubLoopContext extension:
              userMessage: c.userMessage,
              recentMessages: [],
            },
          })

          // Si el tooling seleccionó topic, hacer SELECT al KB para popular
          // topicMaterial con las 5 columnas reales — el judge NECESITA esto
          // para evaluar FAITHFULNESS (RESEARCH A2). Sin esto el rubric era
          // inutilizable (W2 fix del plan-checker, Opción A).
          if (outcome.sourceTopic) {
            const supabase = createAdminClient()
            const { data: kbRow, error } = await supabase
              .from('agent_knowledge_base')
              .select('hechos_del_producto, posicion_del_negocio, debe_contener, nunca_decir, cuando_escalar')
              .eq('topic', outcome.sourceTopic)
              .eq('agent_id', SOMNIO_V4_AGENT_ID)
              .eq('workspace_id', SOMNIO_WORKSPACE_ID)
              .maybeSingle()
            if (error) {
              // No bloqueante — el judge puede evaluar con null pero será menos preciso.
              console.warn(`[smoke-a case ${c.idx}] kb fetch error: ${error.message}`)
            }
            if (kbRow) {
              topicMaterial = {
                hechos: kbRow.hechos_del_producto as string | null,
                posicion: kbRow.posicion_del_negocio as string | null,
                debe_contener_aplicables: (kbRow.debe_contener as string[] | null) ?? null,
                nunca_decir: (kbRow.nunca_decir as string[] | null) ?? outcome.nuncaDecirRules ?? null,
                cuando_escalar: (kbRow.cuando_escalar as string[] | null) ?? null,
              }
            }
          }

          judge = await judgeRagOutput({
            userMessage: c.userMessage,
            topicMaterial,
            generatedResponse: outcome.responseText ?? '',
            reportedConfidence: outcome.responseConfidence ?? 0,
          })
        } catch (err) {
          errorMsg = (err as Error).message ?? String(err)
        }

        const latencyMs = Date.now() - t0
        appendCase({
          idx: c.idx,
          category: c.category,
          userMessage: c.userMessage,
          expected: c.expected,
          outcome,
          judge,
          topicMaterial,
          latencyMs,
          errorMsg,
        })

        // El test bloquea SOLO si hay runtime error.
        if (errorMsg) {
          throw new Error(`Case ${c.idx} runtime error: ${errorMsg}`)
        }
      }, 120_000)
    }

    // Append aggregate después del último caso. Vitest no garantiza orden de
    // afterAll por todos los suites, pero un it() final dentro del mismo
    // describe sí mantiene orden secuencial dentro del bloque.
    it('zz_append_aggregate_section', () => {
      appendAggregate()
    })
  },
)

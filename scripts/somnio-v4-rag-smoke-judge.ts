/**
 * LLM-as-judge para Smoke A/B del rediseño RAG-generative de somnio-v4.
 *
 * Usa gemini-2.5-flash SEPARADO (no el mismo de generación — evita self-enhancement
 * bias RESEARCH líneas 740-743). Pattern verbatim de RESEARCH §LLM-as-Judge Pattern
 * (líneas 731-849) + Code Example (1148-1187).
 *
 * - FLASH (no Flash-Lite): judge necesita razonamiento sobre rubric (RESEARCH 744-746).
 * - Temperature 0.1 (más determinista que generación de 0.3).
 * - SafetySettings BLOCK_NONE x4 (Pitfall 6 — sin esto Gemini bloquea palabras
 *   como "alcohol"/"embarazo"/"anticoagulantes" con finishReason='SAFETY').
 * - NO usa safeAccessOutput wrapper (script standalone — fallback inline manual).
 *
 * Standalone: somnio-v4-rag-generative / Plan 05.
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

export interface JudgeArgs {
  userMessage: string
  topicMaterial: {
    hechos: string | null
    posicion: string | null
    debe_contener_aplicables: string[] | null
    nunca_decir: string[] | null
    cuando_escalar: string[] | null
  } | null
  /** Si el sub-loop emitió handoff sin texto al cliente, pasar string vacío. */
  generatedResponse: string
  /** Si el sub-loop emitió handoff, pasar 0. */
  reportedConfidence: number
}

function buildJudgeSystemPrompt(): string {
  return `Eres un juez evaluador de respuestas RAG en español para Somnio (producto melatonina + magnesio).

Vas a recibir un payload JSON con:
- userMessage: la pregunta del cliente
- topicMaterial: el material del KB usado (Hechos, Posición, Debe contener, NUNCA decir, Cuándo escalar). Puede ser null si el sub-loop hizo handoff sin seleccionar topic.
- generatedResponse: la respuesta que el modelo emitió al cliente. String vacío si fue handoff silente.
- reportedConfidence: el responseConfidence (0.0-1.0) que el modelo auto-reportó. 0 si handoff.

Evaluá 3 criterios, RAZONANDO PRIMERO y emitiendo score AL FINAL.

CRITERIO 1 — FAITHFULNESS:
¿La respuesta usa SOLO información del material?
Razoná chequeando claim por claim. Si menciona "warfarina" pero el material solo dice "anticoagulantes" → invención.
- PASS: cero invenciones, toda info en respuesta proviene literalmente del material. Si la respuesta está vacía (handoff), también es PASS — no hay claims que evaluar.
- PARTIAL: 1 detalle menor adaptado pero defendible (ej. paráfrasis fiel).
- FAIL: ≥1 claim no presente en material — listalo explícitamente en faithfulness_invented_claims.

CRITERIO 2 — RELEVANCE:
¿La respuesta aborda DIRECTAMENTE la pregunta del cliente?
- PASS: aborda el quid de la pregunta sin divagar. Si fue handoff silente Y la pregunta requería info que NO estaba en el material (fuera de scope / falta info), también es PASS — el handoff es la respuesta correcta.
- PARTIAL: responde tangencialmente, sin cubrir el punto principal.
- FAIL: responde otra pregunta, evade, o respondió cuando debía hacer handoff (o hizo handoff cuando debía responder).

CRITERIO 3 — CONFIDENCE_CALIBRATION:
¿El responseConfidence reportado refleja la calidad real?
- CALIBRATED: confidence alto (≥0.70) con respuesta buena (faithfulness+relevance PASS), O confidence bajo (<0.70) con respuesta mala/handoff.
- MISCALIBRATED_HIGH: confidence ≥0.70 PERO faithfulness/relevance FAIL → el modelo sobre-confió.
- MISCALIBRATED_LOW: confidence ≤0.50 PERO ambos PASS → el modelo sub-confió (rare).

OVERALL:
- PASS si los 3 son PASS (o calibration es CALIBRATED + los otros 2 PASS).
- FAIL si alguno es FAIL.
- PARTIAL si ≥1 es PARTIAL pero ninguno FAIL.

Razoná internamente antes de emitir el objeto estructurado. Sé estricto con faithfulness: si dudás, llamá FAIL y listá el claim.`
}

export async function judgeRagOutput(args: JudgeArgs): Promise<JudgeOutput> {
  const result = await generateText({
    model: google('gemini-2.5-flash'),
    system: buildJudgeSystemPrompt(),
    messages: [
      {
        role: 'user' as const,
        content: JSON.stringify(args, null, 2),
      },
    ],
    temperature: 0.1,
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
  // Intentar result.output (AI SDK v6 structured output) con fallback manual parse.
  try {
    const out = (result as unknown as { output: unknown }).output
    if (out) {
      return JudgeOutputSchema.parse(out)
    }
  } catch {
    /* fall through */
  }
  const text = (result as unknown as { text: string }).text
  return JudgeOutputSchema.parse(JSON.parse(text))
}

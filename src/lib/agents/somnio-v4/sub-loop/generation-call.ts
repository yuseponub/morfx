/**
 * CALL 2 del sub-loop RAG-generative: Gemini 2.5 Flash con Output.object SIN tools.
 * Redacta respuesta al cliente usando SOLO el material del topic ganador + auto-reporta
 * responseConfidence (D-15) y binary backstop (M3 RESEARCH A1).
 *
 * Standalone somnio-v4-rag-generative Plan 03.
 * Source: RESEARCH § Code Examples § Generation call (líneas 1097-1145) verbatim.
 * SafetySettings BLOCK_NONE: análogo verbatim de nunca-decir-check.ts (Pitfall 6).
 *
 * D-08: Gemini Flash NORMAL (gemini-2.5-flash), NO Flash-Lite. A/B Flash-Lite es Plan 05.
 * D-10: temperature 0.3.
 * M3 (RESEARCH A1): binary enum RESPONDE_BIEN | FALTA_INFO | FUERA_SCOPE como backstop
 *   numérico — el orchestrator dispara handoff si binary in (FALTA_INFO, FUERA_SCOPE)
 *   independiente del responseConfidence.
 * H-2 (RESEARCH): Gemini API rechaza tools + Output.object juntos — por eso esta call
 *   es SIN tools (solo material del KB ya preseleccionado por tooling-call).
 */
import { generateText, Output } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import { runWithPurpose } from '@/lib/observability'
import { safeAccessOutput } from './safe-output'

export const GenerationOutputSchema = z.object({
  responseText: z.string()
    .describe('Texto final al cliente, en español, tono cálido pero firme (D-05).'),
  responseConfidence: z.number()
    .describe('0..1 auto-reportado por el modelo (D-15). Threshold 0.70 → handoff (D-19).'),
  confidenceRationale: z.string()
    .describe('1 frase razón del confidence — observability.'),
  binary: z.enum(['RESPONDE_BIEN', 'FALTA_INFO', 'FUERA_SCOPE'])
    .describe('M3 backstop (RESEARCH A1): RESPONDE_BIEN si cubrís la pregunta con el material; FALTA_INFO si necesitarías más data; FUERA_SCOPE si la pregunta no está en el material en absoluto.'),
})

export type GenerationOutput = z.infer<typeof GenerationOutputSchema>

/**
 * Resultado completo del generation call (output + raw para debug payload).
 *
 * `rawResult` tipado `any` para evitar TS variance issues con
 * GenerateTextResult<ToolSet, Output<...>> generic inference.
 */
export interface GenerationCallResult {
  output: GenerationOutput
  rawResult: any
  latencyMs: number
}

export async function runGenerationCall(args: {
  systemPrompt: string  // includes TONE_BASE + few-shots + reglas + material del topic
  userMessage: string
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<GenerationCallResult> {
  const t0 = performance.now()
  const rawResult = await runWithPurpose('subloop_generation', () =>
    generateText({
      model: google('gemini-2.5-flash'),  // D-08 (NO Lite). A/B Flash-Lite es Plan 05.
      system: args.systemPrompt,
      messages: [
        ...args.recentMessages.slice(-4),  // history corto — el prompt ya tiene material
        { role: 'user' as const, content: args.userMessage },
      ],
      temperature: 0.3,  // D-10
      output: Output.object({ schema: GenerationOutputSchema }),
      // Pitfall 6: BLOCK_NONE x4 — sin esto, Gemini bloquea silentemente menciones de
      // "alcohol"/"embarazo"/"anticoagulantes" → NoOutputGeneratedError con
      // finishReason='SAFETY'. Verbatim de nunca-decir-check.ts:55-64.
      // Standalone somnio-sales-v4-runtime-wiring / Plan 07 debug Iter 5b learning.
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
    }),
  )
  const latencyMs = performance.now() - t0
  const output = safeAccessOutput(rawResult, GenerationOutputSchema)
  return { output, rawResult, latencyMs }
}

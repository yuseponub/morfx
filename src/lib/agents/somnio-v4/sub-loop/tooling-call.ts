/**
 * CALL 1 del sub-loop RAG-generative: GPT-4o mini con kb_search tool + Output.object.
 * Selecciona UN topic ganador del KB (D-11) y emite su material parseado.
 *
 * Standalone somnio-v4-rag-generative Plan 03.
 * Source: RESEARCH § Code Examples § Tooling call (líneas 1037-1095) verbatim.
 */
import { generateText, Output, stepCountIs } from 'ai'
import { z } from 'zod'
import { createOpenAI } from '@ai-sdk/openai'
import { kbSearchTool } from './kb-search-tool'
import { runWithPurpose } from '@/lib/observability'
import { safeAccessOutput } from './safe-output'

export const ToolingOutputSchema = z.object({
  topic_seleccionado: z.string().nullable()
    .describe('Topic ganador del KB doc, null si ningún hit es relevante.'),
  material_del_topic: z.object({
    hechos: z.string().nullable(),
    posicion: z.string().nullable(),
    debe_contener_aplicables: z.array(z.string()).nullable(),
    nunca_decir: z.array(z.string()).nullable(),
    cuando_escalar: z.array(z.string()).nullable(),
  }).nullable()
    .describe('Material del topic ganador para pasar a la generación (D-11). Null si should_handoff.'),
  should_handoff: z.boolean()
    .describe('true si ningún hit es relevante a la pregunta del cliente.'),
  handoff_reason: z.string().nullable()
    .describe('Razón corta del handoff — observability. Ej: "no_relevant_hit".'),
})

export type ToolingOutput = z.infer<typeof ToolingOutputSchema>

/**
 * Lazy singleton — OpenAI client con key custom OPENAI_API_KEY_SALESV4 (D-30).
 * MOVIDO desde sub-loop/index.ts (líneas 33-45 pre-refactor Plan 03).
 *
 * El sufijo `_SALESV4` aísla esta key de la antigua OPENAI_API_KEY (KB sync,
 * scopes restringidos). Usar `createOpenAI({ apiKey })` en vez del default
 * `openai()` (que auto-lee `OPENAI_API_KEY`) garantiza el aislamiento.
 */
let openaiClient: ReturnType<typeof createOpenAI> | null = null
function getOpenAI() {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY_SALESV4
    if (!apiKey) {
      throw new Error(
        '[somnio-v4 sub-loop tooling] OPENAI_API_KEY_SALESV4 not set — required for sub-loop (D-30 Plan 05)',
      )
    }
    openaiClient = createOpenAI({ apiKey })
  }
  return openaiClient
}

export interface ToolingCallContext {
  workspaceId: string
  userMessage: string
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
}

/**
 * Resultado completo del tooling call (output + diagnostic data para debug payload).
 *
 * El raw `result` del generateText se preserva para que el orchestrator pueda extraer
 * step data via su extractStepData helper (kbHits, toolCalls, finishReason, stepCount).
 *
 * `rawResult` se tipa como `any` porque el shape concreto del GenerateTextResult con
 * generics inferidos no es asignable al genérico — y el orchestrator solo lee
 * propiedades a través del helper extractStepData con structural checks defensivos.
 */
export interface ToolingCallResult {
  output: ToolingOutput
  rawResult: any
  latencyMs: number
}

export async function runToolingCall(args: {
  reason: 'low_confidence' | 'razonamiento_libre'
  ctx: ToolingCallContext
  systemPrompt: string
}): Promise<ToolingCallResult> {
  const t0 = performance.now()

  // Diagnostic wrap (Plan 07d debug 2026-05-20): same pattern as
  // comprehension.ts — captura finishReason/text/response/cause del error
  // para diagnosticar AI_NoOutputGeneratedError (stepCount=0, toolCalls=[]).
  // El payload va al sub-loop emitRagError → subLoopDebug.errorMessage en DB.
  // `rawResult` tipado como any por la misma razón que en ToolingCallResult:
  // el shape concreto del GenerateTextResult con generics inferidos
  // (tools + Output.object) no es asignable al ToolSet genérico.
  let rawResult: any
  try {
    rawResult = await runWithPurpose('subloop_tooling', () =>
      generateText({
        model: getOpenAI()('gpt-4o-mini'),
        system: args.systemPrompt,
        messages: [
          ...args.ctx.recentMessages,
          { role: 'user' as const, content: args.ctx.userMessage },
        ],
        tools: { kb_search: kbSearchTool({ workspaceId: args.ctx.workspaceId }) },
        toolChoice: 'auto',  // NO 'required' (W-06 — bloquearía output final)
        stopWhen: stepCountIs(4),
        output: Output.object({ schema: ToolingOutputSchema }),
      }),
    )
  } catch (genErr) {
    const e = genErr as Record<string, unknown>
    const errName = (e?.name as string) ?? 'Error'
    const errMsg = (e?.message as string) ?? String(genErr)
    const cause = e?.cause ? JSON.stringify(e.cause).slice(0, 400) : 'no-cause'
    const text = (e?.text as string) ?? (e?.responseBody as string) ?? 'no-text'
    const finishReason = (e?.finishReason as string) ?? 'no-finishReason'
    const responseStr = e?.response
      ? JSON.stringify(e.response).slice(0, 600)
      : 'no-response'
    throw new Error(
      `[ToolingCall-v4 generateText] ${errName}: ${errMsg} | ` +
      `finishReason="${finishReason}" | text="${(text as string).slice(0, 300)}" | ` +
      `cause="${cause}" | response="${responseStr}"`
    )
  }

  const latencyMs = performance.now() - t0
  const output = safeAccessOutput(rawResult, ToolingOutputSchema)
  return { output, rawResult, latencyMs }
}

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

/**
 * Detecta errores transitorios del LLM (cold start GPT-4o-mini, rate limits,
 * network blips) que justifican 1 retry. Errores no-transitorios (auth, schema
 * validation persistente) NO se reintentan — propagan al primer fallo.
 *
 * 2026-05-22: agregado tras incidente sesión 31f597ab ("tengo gastritis...")
 * donde GPT-4o-mini retornó stepCount=0 + AI_NoOutputGeneratedError. La causa
 * raíz es flakeo intermitente del API de OpenAI; el 90%+ de los retries funcionan.
 */
function isTransientToolingError(err: unknown): boolean {
  const e = err as Record<string, unknown>
  const name = (e?.name as string) ?? ''
  const originalName = (e?.originalName as string) ?? ''
  const msg = (e?.message as string) ?? ''
  const composite = `${name} ${originalName} ${msg}`.toLowerCase()
  // AI SDK transient error names
  if (composite.includes('nooutputgenerated')) return true
  if (composite.includes('ai_retryerror')) return true
  if (composite.includes('ai_apicallerror')) return true
  if (composite.includes('no output generated')) return true
  // HTTP transient codes
  if (composite.includes('429')) return true       // rate limit
  if (composite.includes('503')) return true       // service unavailable
  if (composite.includes('504')) return true       // gateway timeout
  // Network transient errors
  if (composite.includes('econnreset')) return true
  if (composite.includes('etimedout')) return true
  if (composite.includes('socket hang up')) return true
  return false
}

/**
 * Un solo intento del tooling call. Wrap diagnostic incluye AHORA tanto
 * generateText como safeAccessOutput (el bug previo: safeAccessOutput estaba
 * FUERA del try/catch, así AI_NoOutputGeneratedError lazy-thrown al acceder
 * .output escapaba el wrap).
 */
async function attemptToolingCall(args: {
  reason: 'low_confidence' | 'razonamiento_libre'
  ctx: ToolingCallContext
  systemPrompt: string
}): Promise<{ rawResult: any; output: ToolingOutput }> {
  try {
    const rawResult = await runWithPurpose('subloop_tooling', () =>
      generateText({
        model: getOpenAI()('gpt-4o-mini'),
        system: args.systemPrompt,
        messages: [
          ...args.ctx.recentMessages,
          { role: 'user' as const, content: args.ctx.userMessage },
        ],
        tools: { kb_search: kbSearchTool({ workspaceId: args.ctx.workspaceId }) },
        toolChoice: 'auto',
        stopWhen: stepCountIs(4),
        output: Output.object({ schema: ToolingOutputSchema }),
      }),
    )
    // safeAccessOutput ahora dentro del try — captures lazy-thrown
    // AI_NoOutputGeneratedError al acceder rawResult.output.
    const output = safeAccessOutput(rawResult, ToolingOutputSchema)
    return { rawResult, output }
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
    const wrapped = new Error(
      `[ToolingCall-v4] ${errName}: ${errMsg} | ` +
      `finishReason="${finishReason}" | text="${(text as string).slice(0, 300)}" | ` +
      `cause="${cause}" | response="${responseStr}"`
    )
    // Preservar el nombre original del error para que isTransientToolingError lo detecte
    // — el new Error() default name es "Error" pero el original puede ser
    // AI_NoOutputGeneratedError.
    ;(wrapped as any).originalName = errName
    throw wrapped
  }
}

/**
 * Tooling call con 1 retry automático en errores transitorios.
 *
 * Flow:
 *   - attempt 1 → success → return
 *   - attempt 1 → transient error → wait 500ms → attempt 2 → return o throw final
 *   - attempt 1 → non-transient error → throw immediato (sin retry)
 *
 * Si attempt 2 falla, propaga el SEGUNDO error (también tiene diagnostic wrap)
 * al sub-loop orchestrator que lo manda a emitRagError.
 */
export async function runToolingCall(args: {
  reason: 'low_confidence' | 'razonamiento_libre'
  ctx: ToolingCallContext
  systemPrompt: string
}): Promise<ToolingCallResult> {
  const t0 = performance.now()

  let attempt: { rawResult: any; output: ToolingOutput }
  try {
    attempt = await attemptToolingCall(args)
  } catch (firstErr) {
    if (!isTransientToolingError(firstErr)) {
      // Non-transient: no retry, propagate first error directly.
      throw firstErr
    }
    console.log(
      '[somnio-v4 tooling] transient error attempt 1, retrying in 500ms:',
      (firstErr as Error).message?.slice(0, 200) ?? String(firstErr),
    )
    await new Promise((r) => setTimeout(r, 500))
    try {
      attempt = await attemptToolingCall(args)
      console.log('[somnio-v4 tooling] retry attempt 2 succeeded')
    } catch (secondErr) {
      console.log(
        '[somnio-v4 tooling] retry attempt 2 also failed:',
        (secondErr as Error).message?.slice(0, 200) ?? String(secondErr),
      )
      throw secondErr
    }
  }

  const latencyMs = performance.now() - t0
  return { output: attempt.output, rawResult: attempt.rawResult, latencyMs }
}

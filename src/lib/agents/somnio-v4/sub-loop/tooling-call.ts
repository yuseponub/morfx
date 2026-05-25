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

/**
 * Plan 09 iter 2 — schema reformulado para reducir ambigüedad bajo OpenAI strict
 * mode sin violar la regla "root debe ser type:object" (iter 1 falló con
 * discriminated union → anyOf en root → rechazado por OpenAI 400).
 *
 * Cambios vs original pre-Plan 09:
 *   1. `z.union([T, z.null()])` en vez de `.nullable()` — patrón canónico de
 *      OpenAI structured outputs (Zod `.nullable()` se traduce a `"nullable": true`
 *      que OpenAI ignora silenciosamente, vs `union with null` que se traduce a
 *      `"type": ["string", "null"]` que OpenAI respeta correctamente).
 *   2. Campos INTERNOS de material_del_topic son required (no nullable) — elimina
 *      las 32+ combinaciones de null nesting que confundían al modelo bajo strict
 *      mode (ver 09-PLAN.md + auditor #10235/#13075).
 *   3. Top-level sigue como `z.object` (NO discriminated union) para satisfacer
 *      requisito OpenAI "root debe ser type:object".
 *
 * El contract conceptual (should_handoff:true ↔ material null) NO se expresa en
 * tipo TS, se valida runtime en sub-loop/index.ts:230 (ya existe).
 */
export const ToolingOutputSchema = z.object({
  should_handoff: z.boolean()
    .describe('true si ningún hit es relevante a la pregunta del cliente.'),
  topic_seleccionado: z.union([z.string(), z.null()])
    .describe('Topic ganador del KB doc, null si ningún hit es relevante.'),
  material_del_topic: z.union([
    z.object({
      hechos: z.string(),
      posicion: z.string(),
      debe_contener_aplicables: z.array(z.string()),
      nunca_decir: z.array(z.string()),
      cuando_escalar: z.array(z.string()),
    }),
    z.null(),
  ])
    .describe('Material del topic ganador (verbatim) para pasar a la generación. Null si should_handoff.'),
  handoff_reason: z.union([z.string(), z.null()])
    .describe('Razón corta del handoff — observability. Ej: "no_relevant_hit". Null si !should_handoff.'),
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
  /** 2026-05-25: timing diagnostics para detectar retries silenciosos en producción */
  attempts: number                  // 1 = success first try; 2 = retried once
  attemptLatencies: number[]        // ms por attempt (incluye attempt fallido si retried)
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
        // Plan 09 iter 3 (2026-05-25): swap gpt-4o-mini → gpt-4.1-mini tras
        // experimento empírico (scripts/debug-tooling-call-experiment.mjs +
        // scripts/debug-tooling-models-experiment.mjs). Resultados:
        //   - gpt-4o-mini con combo tools+Output.object+schema iter 2: 118/150 fail (78.7%)
        //   - gpt-4.1-mini con MISMO setup: 0/50 fail
        //   - gpt-4o full: 0/50 fail pero 17x más caro
        //   - gemini-flash/lite: 100% fail (rechaza combo a nivel API)
        // 4.1-mini cuesta ~2.7x el precio nominal pero ~50-100% en costo efectivo
        // (sin retries por bug). Latencia p50 también baja: 8.3s → 4.5s.
        model: getOpenAI()('gpt-4.1-mini'),
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
  const attemptLatencies: number[] = []

  let attempt: { rawResult: any; output: ToolingOutput }
  let attempts = 1
  const tAttempt1 = performance.now()
  try {
    attempt = await attemptToolingCall(args)
    attemptLatencies.push(performance.now() - tAttempt1)
  } catch (firstErr) {
    attemptLatencies.push(performance.now() - tAttempt1)
    if (!isTransientToolingError(firstErr)) {
      // Non-transient: no retry, propagate first error directly.
      throw firstErr
    }
    console.log(
      '[somnio-v4 tooling] transient error attempt 1, retrying in 500ms:',
      (firstErr as Error).message?.slice(0, 200) ?? String(firstErr),
    )
    await new Promise((r) => setTimeout(r, 500))
    attempts = 2
    const tAttempt2 = performance.now()
    try {
      attempt = await attemptToolingCall(args)
      attemptLatencies.push(performance.now() - tAttempt2)
      console.log('[somnio-v4 tooling] retry attempt 2 succeeded')
    } catch (secondErr) {
      attemptLatencies.push(performance.now() - tAttempt2)
      console.log(
        '[somnio-v4 tooling] retry attempt 2 also failed:',
        (secondErr as Error).message?.slice(0, 200) ?? String(secondErr),
      )
      throw secondErr
    }
  }

  const latencyMs = performance.now() - t0
  return { output: attempt.output, rawResult: attempt.rawResult, latencyMs, attempts, attemptLatencies }
}

import { generateText, Output, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { runWithPurpose, getCollector } from '@/lib/observability'
import {
  LoopOutcomeSchema,
  validateLoopOutcomeInvariants,
  type LoopOutcome,
  type SubLoopReason,
} from './output-schema'
import { buildSubLoopTools, type SubLoopToolsContext } from './tools'
import { buildSubLoopPrompt } from './prompt'
import { checkNuncaDecir } from './nunca-decir-check'
import { SOMNIO_V4_AGENT_ID } from '../config'
import type {
  SubLoopDebugPayload,
  SubLoopToolCallSnapshot,
  SubLoopKbHitSnapshot,
} from './debug-payload'

export type { SubLoopReason } from './output-schema'

/**
 * Lazy singleton — OpenAI client con key custom OPENAI_API_KEY_SALESV4 (D-30).
 *
 * El sufijo `_SALESV4` aísla esta key de la antigua OPENAI_API_KEY (KB sync,
 * scopes restringidos), que sigue intacta para otros consumidores. Usar
 * `createOpenAI({ apiKey })` en vez del default `openai()` (que auto-lee
 * `OPENAI_API_KEY`) garantiza el aislamiento.
 *
 * Lazy para evitar leer env var en cold-boot si el sub-loop no se invoca en
 * un lambda cycle determinado (D-01: sub-loop solo dispara bajo triggers D-02).
 */
let openaiClient: ReturnType<typeof createOpenAI> | null = null
function getOpenAI() {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY_SALESV4
    if (!apiKey) {
      throw new Error(
        '[somnio-v4 sub-loop] OPENAI_API_KEY_SALESV4 not set — required for sub-loop (D-30 Plan 05)',
      )
    }
    openaiClient = createOpenAI({ apiKey })
  }
  return openaiClient
}

/**
 * Contexto que el caller del sub-loop debe pasar.
 *
 * - `workspaceId / conversationId / sessionId`: heredado de SubLoopToolsContext.
 * - `userMessage`: mensaje actual del cliente (último turn).
 * - `recentMessages`: últimos N turnos para contexto del modelo (recomendado 4-6).
 */
export interface SubLoopContext extends SubLoopToolsContext {
  userMessage: string
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
}

/**
 * Entrypoint del sub-loop AI SDK v6 (D-01, D-09, D-62).
 *
 * - D-01: solo se invoca bajo triggers D-02. NO es el path por defecto.
 * - D-09 (post-D-30 swap): GPT-4o mini, 3-5 tools por reason,
 *   stopWhen=stepCountIs(4), latencia ~600ms-1.5s. Plan 05 migró de Haiku 4.5 a
 *   GPT-4o mini porque Gemini API NO soporta tools + Output.object combinados
 *   (RESEARCH H-2) y GPT-4o mini es la única option viable para esa combinación.
 * - D-62: output ESTRICTAMENTE LoopOutcome (template / canonical / no_match) — sin
 *         texto libre. ENFORCED por `Output.object({ schema: LoopOutcomeSchema })`,
 *         NO por toolChoice — see RESEARCH §Pattern 2 line 406. `toolChoice='required'`
 *         bloquearía el structured output final step (W-06).
 * - D-51: si outcome 'canonical', post-gen NUNCA-decir check (latencia +150ms).
 *         W-09: rules vienen de `output.nuncaDecirRules` que el LLM copió del
 *         hit de kb_search (que a su vez vienen del DB column nunca_decir vía RPC
 *         match_knowledge_base).
 *
 * Anti-patterns aplicados:
 * - NO `generateObject` (deprecated AI SDK v6) — usamos `generateText + Output.object()`.
 * - NO `toolChoice: 'required'` — bloquea el structured output final (W-06).
 * - NO `stopWhen` > 4 — D-09 scope acotado.
 * - NO imports desde `@/lib/agents/somnio-v3/*` (D-24).
 *
 * Standalone: somnio-sales-v4 / Plan 05 / Task 4.
 */
export async function runSubLoop(args: {
  reason: SubLoopReason
  ctx: SubLoopContext
  /**
   * Optional debug callback (D-03) — fires before each return/throw with a
   * snapshot of telemetry (toolCalls, toolResults, kbHits, outcome, violations,
   * errorMessage, latencyMs). Caller can capture into a closure variable to
   * propagate to V4AgentOutput.subLoopDebug. Synchronous — not awaited.
   * Standalone: v4-subloop-debug-view / Plan 02.
   */
  onDebug?: (payload: SubLoopDebugPayload) => void
}): Promise<LoopOutcome> {
  // Latency timer for SubLoopDebugPayload (Plan 02). performance.now() is
  // available in Vercel Node 18+ runtime without import.
  const t0 = performance.now()

  const tools = buildSubLoopTools(args.reason, args.ctx)

  // Extract AI SDK v6 step data using CORRECT field names (Pitfall 1: input/output, NOT args/result).
  // Canonical pattern from src/lib/agents/crm-reader/index.ts:59-68.
  function extractStepData(
    result: Awaited<ReturnType<typeof generateText>> | null,
  ): {
    toolCalls: SubLoopToolCallSnapshot[]
    toolResults: SubLoopToolCallSnapshot[]
    kbHits?: SubLoopKbHitSnapshot[]
    stepCount: number
    finishReason?: string
  } {
    if (!result) {
      return { toolCalls: [], toolResults: [], stepCount: 0 }
    }
    const steps = result.steps ?? []
    const toolCalls: SubLoopToolCallSnapshot[] = steps.flatMap((step) =>
      (step.toolCalls ?? []).map((tc) => ({
        toolName: tc.toolName,
        input: tc.input,
        output: null,
        outputPreview: undefined,
      })),
    )
    // Build toolResults — separate flat list keyed for the UI per D-02 verbatim.
    const toolResults: SubLoopToolCallSnapshot[] = steps.flatMap((step) =>
      (step.toolResults ?? []).map((tr) => {
        const out: unknown = tr.output
        // Pitfall 6: truncate at emission site, capped 500 chars.
        const outputPreview =
          typeof out === 'string'
            ? out.slice(0, 500)
            : JSON.stringify(out).slice(0, 500)
        return {
          toolName: tr.toolName,
          input: tr.input,
          output: out,
          outputPreview,
        }
      }),
    )

    // D-06: extract kb_search hits with structural type check; silent omission on shape mismatch.
    let kbHits: SubLoopKbHitSnapshot[] | undefined = undefined
    const kbResult = toolResults.find((tr) => tr.toolName === 'kb_search')
    if (kbResult) {
      const hits = kbResult.output
      if (Array.isArray(hits)) {
        if (hits.length === 0) {
          kbHits = []
        } else {
          const first = hits[0] as Record<string, unknown>
          if (
            typeof first?.topic === 'string' &&
            typeof first?.similarity === 'number'
          ) {
            // Structural check passed — safe to cast.
            // Cast targets the runtime shape returned by kb-search-tool.ts (KbHit[]).
            type KbHitRow = {
              topic: string
              similarity: number
              canonicalResponse: string | null
              nuncaDecirRules?: string[]
            }
            kbHits = (hits as KbHitRow[]).map((h) => ({
              topic: h.topic,
              similarity: h.similarity,
              contentPreview: (h.canonicalResponse ?? '').slice(0, 200),
              hasNuncaDecir: (h.nuncaDecirRules?.length ?? 0) > 0,
            }))
          }
        }
      }
    }

    return {
      toolCalls,
      toolResults,
      kbHits,
      stepCount: steps.length,
      finishReason: result.finishReason,
    }
  }

  // Diagnostic wrap (Plan 07 debug iter 4 + iter 8 + iter 9): captura errores
  // del generateText con context completo del provider Y del result object.
  //
  // Iter 9 fix: AI_NoOutputGeneratedError no carga finishReason/text/cause en sí
  // mismo — esos datos viven en `result` (subLoopResult). Por eso declaramos
  // subLoopResult ANTES del try, así el catch puede peek-ear sus campos
  // (finishReason, text, steps con tool calls) para diagnostico real.
  let output: LoopOutcome
  let subLoopResult: Awaited<ReturnType<typeof generateText>> | null = null
  try {
    subLoopResult = await runWithPurpose('subloop', () =>
      generateText({
        model: getOpenAI()('gpt-4o-mini'),
        system: buildSubLoopPrompt(args.reason),
        messages: [
          ...args.ctx.recentMessages.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user' as const, content: args.ctx.userMessage },
        ],
        tools,
        // W-06 — D-62 enforced by Output.object() schema, not by toolChoice. See
        // RESEARCH §Pattern 2 line 406: 'required' would block the structured-output
        // final step. 'auto' lets the model search KB / call CRM tools and then emit
        // the LoopOutcome object as the last step.
        toolChoice: 'auto',
        // Iter 7d: bump 4 → 6. Con stopWhen=4, GPT-4o mini en low_confidence con KB
        // vacio loopeaba 4x kb_search sin emitir LoopOutcome final (finishReason=
        // 'tool-calls'). 6 da headroom para 2-3 kb_search retries + step final
        // que emite output. El prompt low_confidence ahora obliga no_match tras
        // 2 búsquedas vacías (forzando convergencia incluso con headroom extra).
        stopWhen: stepCountIs(6),
        output: Output.object({ schema: LoopOutcomeSchema }),
      })
    )
    // Destructure DENTRO del try — el getter puede throw AI_NoOutputGeneratedError
    output = subLoopResult.output
  } catch (genErr) {
    const e = genErr as Record<string, unknown>
    const errName = (e?.name as string) ?? 'Error'
    const errMsg = (e?.message as string) ?? String(genErr)
    const cause = e?.cause ? JSON.stringify(e.cause).slice(0, 300) : 'no-cause'

    // Peek subLoopResult fields if generateText succeeded but .output getter threw.
    // Iter 7d: AI SDK v6 usa `input` (no `args`) y `output` (no `result`) en los
    // tool calls/results de step. Por eso antes los toolResults se veian vacios.
    const sr = subLoopResult as Record<string, unknown> | null
    const srFinishReason = (sr?.finishReason as string) ?? null
    const srText = (sr?.text as string) ?? null
    const srSteps = sr?.steps as Array<{
      toolCalls?: Array<{ toolName?: string; input?: unknown }>
      toolResults?: Array<{ toolName?: string; input?: unknown; output?: unknown }>
    }> | undefined
    const stepCount = srSteps?.length ?? 0
    const toolCallsBrief = srSteps
      ? srSteps.flatMap((s) => s.toolCalls ?? []).map((tc) => ({
          toolName: tc.toolName,
          input:
            typeof tc.input === 'string'
              ? tc.input.slice(0, 120)
              : JSON.stringify(tc.input).slice(0, 120),
        }))
      : []
    const toolResultsBrief = srSteps
      ? srSteps.flatMap((s) => s.toolResults ?? []).map((tr) => ({
          toolName: tr.toolName,
          output:
            typeof tr.output === 'string'
              ? tr.output.slice(0, 180)
              : JSON.stringify(tr.output).slice(0, 180),
        }))
      : []

    // Prefer subLoopResult fields (post-generation) over error fields (pre).
    const finishReason = srFinishReason ?? (e?.finishReason as string) ?? 'no-finishReason'
    const text = srText ?? (e?.text as string) ?? (e?.responseBody as string) ?? 'no-text'

    // D-03: emit debug payload BEFORE throw so caller closure captures it (Pitfall 7 option a).
    const errStep = extractStepData(subLoopResult)
    args.onDebug?.({
      fired: true,
      reason: args.reason,
      finishReason: errStep.finishReason ?? srFinishReason ?? undefined,
      stepCount: errStep.stepCount,
      toolCalls: errStep.toolCalls,
      toolResults: errStep.toolResults,
      kbHits: errStep.kbHits,
      outcome: undefined,
      latencyMs: performance.now() - t0,
      errorMessage: `${errName}: ${errMsg}`,
    })

    throw new Error(
      `[SubLoop generateText reason=${args.reason}] ${errName}: ${errMsg} | ` +
      `finishReason="${finishReason}" | steps=${stepCount} | ` +
      `toolCalls=${JSON.stringify(toolCallsBrief).slice(0, 250)} | ` +
      `toolResults=${JSON.stringify(toolResultsBrief).slice(0, 250)} | ` +
      `text="${(text as string).slice(0, 200)}" | cause="${cause}"`
    )
  }

  // D-29 post-hoc invariant validation — Plan 02 RE-SHAPE.
  // The flat schema (no discriminated union) permite combinaciones inválidas
  // que el shape previo no permitía: ej. status='canonical' con canonicalText=null.
  // validateLoopOutcomeInvariants enforce las reglas semánticas que el schema flat
  // no captura. Si la invariante se rompe → escalación suave a no_match (NO throw —
  // consistent con D-57 handoff humano).
  const invariantCheck = validateLoopOutcomeInvariants(output)
  if (!invariantCheck.ok) {
    getCollector()?.recordEvent(
      'pipeline_decision',
      'subloop_invariant_violation',
      {
        agent: SOMNIO_V4_AGENT_ID,
        reason: args.reason,
        violation: invariantCheck.violation ?? 'unknown',
        rawStatus: output.status,
      }
    )
    const escalated: LoopOutcome = {
      status: 'no_match',
      responseTemplate: 'handoff_humano',
      canonicalText: null,
      sourceTopic: null,
      nuncaDecirRules: null,
      knowledgeQueried: [],
      requiresHuman: true,
      reason: `invariant_violation: ${invariantCheck.violation ?? 'unspecified'}`,
    }
    // D-03: emit debug payload before returning escalated outcome.
    const invStep = extractStepData(subLoopResult)
    args.onDebug?.({
      fired: true,
      reason: args.reason,
      finishReason: invStep.finishReason,
      stepCount: invStep.stepCount,
      toolCalls: invStep.toolCalls,
      toolResults: invStep.toolResults,
      kbHits: invStep.kbHits,
      outcome: escalated,
      invariantViolation: invariantCheck.violation ?? 'unspecified',
      latencyMs: performance.now() - t0,
    })
    return escalated
  }

  // D-51: post-gen NUNCA-decir check solo en outcome 'canonical' (D-50 verbatim KB).
  // Plan 02: tras flat schema canonicalText/sourceTopic son string|null. La
  // invariante anterior ya garantizó non-null aquí (sin invariantCheck pasamos),
  // por lo que es seguro asumir non-null. El non-null assertion (!) está
  // protegido defensivamente — si en el futuro alguien remueve invariantCheck
  // arriba, este bloque fallaría en runtime con un error claro.
  if (output.status === 'canonical') {
    const canonicalText = output.canonicalText!
    const sourceTopic = output.sourceTopic!
    const rules = output.nuncaDecirRules ?? []
    const check = await checkNuncaDecir({
      candidateText: canonicalText,
      nuncaDecirRules: rules,
    })
    if (!check.ok) {
      // Forzar handoff humano (D-51 violation → D-57 no_match).
      const escalated: LoopOutcome = {
        status: 'no_match',
        responseTemplate: 'handoff_humano',
        canonicalText: null,
        sourceTopic: null,
        nuncaDecirRules: null,
        knowledgeQueried: [sourceTopic],
        requiresHuman: true,
        reason: `nunca_decir_violation: ${check.violation ?? 'unspecified'}`,
      }
      getCollector()?.recordEvent(
        'pipeline_decision',
        'subloop_nunca_decir_violation',
        {
          agent: SOMNIO_V4_AGENT_ID,
          reason: args.reason,
          sourceTopic,
          violation: check.violation ?? null,
        }
      )
      // D-03: emit debug payload before returning escalated outcome.
      const ndStep = extractStepData(subLoopResult)
      args.onDebug?.({
        fired: true,
        reason: args.reason,
        finishReason: ndStep.finishReason,
        stepCount: ndStep.stepCount,
        toolCalls: ndStep.toolCalls,
        toolResults: ndStep.toolResults,
        kbHits: ndStep.kbHits,
        outcome: escalated,
        nuncaDecirViolation: check.violation ?? 'unspecified',
        latencyMs: performance.now() - t0,
      })
      return escalated
    }
  }

  // Observability D-58 (familia D-2): outcome del sub-loop.
  getCollector()?.recordEvent('pipeline_decision', 'subloop_completed', {
    agent: SOMNIO_V4_AGENT_ID,
    reason: args.reason,
    outcome: output.status,
    sourceTopic: output.status === 'canonical' ? output.sourceTopic : null,
    requiresHuman: output.requiresHuman,
  })

  // D-03: emit debug payload on success path.
  const okStep = extractStepData(subLoopResult)
  args.onDebug?.({
    fired: true,
    reason: args.reason,
    finishReason: okStep.finishReason,
    stepCount: okStep.stepCount,
    toolCalls: okStep.toolCalls,
    toolResults: okStep.toolResults,
    kbHits: okStep.kbHits,
    outcome: output,
    latencyMs: performance.now() - t0,
  })

  return output
}

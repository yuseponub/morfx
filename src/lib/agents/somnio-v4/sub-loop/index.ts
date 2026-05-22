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
import { buildToolingPrompt, buildGenerationPrompt } from './prompt'
import { TONE_BASE } from './tone-base'
import { checkNuncaDecir } from './nunca-decir-check'
import { runToolingCall } from './tooling-call'
import { runGenerationCall } from './generation-call'
import { safeAccessOutput } from './safe-output'
import { SOMNIO_V4_AGENT_ID } from '../config'
import type {
  SubLoopDebugPayload,
  SubLoopToolCallSnapshot,
  SubLoopKbHitSnapshot,
} from './debug-payload'

export type { SubLoopReason } from './output-schema'

/**
 * Threshold post-generation: si responseConfidence < THRESHOLD → handoff (D-19).
 * Default 0.70. Plan 04+ podría leerlo de platform_config.somnio_v4_low_confidence_threshold.
 */
const RESPONSE_CONFIDENCE_THRESHOLD = 0.70

/**
 * Lazy singleton — OpenAI client con key custom OPENAI_API_KEY_SALESV4 (D-30).
 * Usado SOLO por el path LEGACY (crm_mutation / cas_reject D-12). El path RAG
 * nuevo tiene su propio singleton lazy dentro de tooling-call.ts (Plan 03 Task 3.4).
 *
 * El sufijo `_SALESV4` aísla esta key de la antigua OPENAI_API_KEY (KB sync,
 * scopes restringidos), que sigue intacta para otros consumidores.
 */
let openaiClient: ReturnType<typeof createOpenAI> | null = null
function getOpenAI() {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY_SALESV4
    if (!apiKey) {
      throw new Error(
        '[somnio-v4 sub-loop legacy] OPENAI_API_KEY_SALESV4 not set — required for sub-loop (D-30 Plan 05)',
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
 * Args del orchestrator del sub-loop.
 */
export interface RunSubLoopArgs {
  reason: SubLoopReason
  ctx: SubLoopContext
  /**
   * Optional debug callback (D-03) — fires before each return/throw with a
   * snapshot of telemetry. Plan 03 RAG-generative refactor: para low_confidence /
   * razonamiento_libre el callback recibe payload con toolingCall + generationCall
   * fields. Para crm_mutation / cas_reject sigue siendo el shape legacy.
   * Standalone: v4-subloop-debug-view / Plan 02.
   */
  onDebug?: (payload: SubLoopDebugPayload) => void
}

/**
 * Helper para extraer step data de un rawResult de generateText (AI SDK v6).
 * Patrón verbatim del flujo legacy (sub-loop/index.ts:104-183 pre-refactor),
 * usado por ambos paths para construir el debug payload.
 */
function extractStepData(rawResult: any): {
  toolCalls: SubLoopToolCallSnapshot[]
  toolResults: SubLoopToolCallSnapshot[]
  kbHits?: SubLoopKbHitSnapshot[]
  stepCount: number
  finishReason?: string
} {
  if (!rawResult) {
    return { toolCalls: [], toolResults: [], stepCount: 0 }
  }
  const steps = rawResult.steps ?? []
  const toolCalls: SubLoopToolCallSnapshot[] = steps.flatMap((step: any) =>
    (step.toolCalls ?? []).map((tc: any) => ({
      toolName: tc.toolName,
      input: tc.input,
      output: null,
      outputPreview: undefined,
    })),
  )
  const toolResults: SubLoopToolCallSnapshot[] = steps.flatMap((step: any) =>
    (step.toolResults ?? []).map((tr: any) => {
      const out: unknown = tr.output
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
          type KbHitRow = {
            topic: string
            similarity: number
            canonicalResponse: string | null
            nuncaDecirRules?: string[]
            hechosDelProducto?: string | null
            posicionDelNegocio?: string | null
          }
          // 2026-05-22: contentPreview ahora usa hechosDelProducto || posicionDelNegocio
          // (RAG-generative columns). canonicalResponse era el source legacy y es null
          // para todos los topics v4 — por eso el preview salía vacío en la UI.
          kbHits = (hits as KbHitRow[]).map((h) => {
            const previewSource =
              h.hechosDelProducto ?? h.posicionDelNegocio ?? h.canonicalResponse ?? ''
            return {
              topic: h.topic,
              similarity: h.similarity,
              contentPreview: previewSource.slice(0, 200),
              hasNuncaDecir: (h.nuncaDecirRules?.length ?? 0) > 0,
            }
          })
        }
      }
    }
  }

  return {
    toolCalls,
    toolResults,
    kbHits,
    stepCount: steps.length,
    finishReason: rawResult.finishReason,
  }
}

/**
 * Entrypoint del sub-loop AI SDK v6.
 *
 * Plan 03 RAG-generative refactor — switch por reason:
 *
 * - `low_confidence | razonamiento_libre` → flujo NUEVO RAG-generative split:
 *     Call 1 tooling (GPT-4o mini + kb_search) → selecciona topic + emite material parseado
 *     Call 2 generation (Gemini Flash + Output.object SIN tools) → redacta respuesta
 *     Threshold 0.70 (D-19) + M3 binary backstop (FALTA_INFO/FUERA_SCOPE) + NUNCA-decir check
 *     Outcome success: status='generated' con responseText + responseConfidence + sourceTopic.
 *
 * - `crm_mutation | cas_reject` → flujo LEGACY preservado verbatim (D-12):
 *     Single generateText con tools + Output.object con LoopOutcomeSchema.
 *     Outcome posibles: 'template' (success) o 'no_match' (handoff).
 *     NOTA: el agente legacy emitía status='canonical' verbatim del KB en algunos
 *     casos — post Plan 03 schema refactor ese path emite 'no_match' (la canonical
 *     verbatim path queda obsoleta; el orchestrator escala suave). El path
 *     mutation/cas_reject conceptualmente NO debería tirar canonical (siempre
 *     era para low_confidence/razonamiento_libre), así que en la práctica solo
 *     emite template o no_match.
 *
 * Standalone: somnio-v4-rag-generative / Plan 03.
 */
export async function runSubLoop(args: RunSubLoopArgs): Promise<LoopOutcome> {
  // === SWITCH POR REASON ===
  if (args.reason === 'crm_mutation' || args.reason === 'cas_reject') {
    return runLegacySubLoop(args)
  }

  // === FLUJO NUEVO RAG-generative — low_confidence | razonamiento_libre ===
  return runRagSubLoop(args)
}

// ============================================================================
// FLUJO RAG-GENERATIVE (Plan 03 nuevo) — low_confidence | razonamiento_libre
// ============================================================================

async function runRagSubLoop(args: RunSubLoopArgs): Promise<LoopOutcome> {
  const t0 = performance.now()

  // CALL 1 — Tooling (GPT-4o mini + kb_search + Output.object)
  let toolingResult: Awaited<ReturnType<typeof runToolingCall>>
  try {
    toolingResult = await runToolingCall({
      reason: args.reason as 'low_confidence' | 'razonamiento_libre',
      ctx: {
        workspaceId: args.ctx.workspaceId,
        userMessage: args.ctx.userMessage,
        recentMessages: args.ctx.recentMessages,
      },
      systemPrompt: buildToolingPrompt(args.reason),
    })
  } catch (err) {
    return emitRagError(args, err, t0, 'tooling_call_error', undefined, undefined)
  }

  const tooling = toolingResult.output
  const toolingStep = extractStepData(toolingResult.rawResult)

  // Si tooling decidió handoff (no topic relevante) → escalar inmediato.
  if (
    tooling.should_handoff ||
    !tooling.topic_seleccionado ||
    !tooling.material_del_topic
  ) {
    const escalated: LoopOutcome = {
      status: 'no_match',
      responseText: null,
      sourceTopic: null,
      responseConfidence: null,
      confidenceRationale: null,
      nuncaDecirRules: null,
      responseTemplate: 'handoff_humano',
      knowledgeQueried: tooling.topic_seleccionado ? [tooling.topic_seleccionado] : [],
      requiresHuman: true,
      reason: tooling.handoff_reason ?? 'no_relevant_hit',
    }
    const inv = validateLoopOutcomeInvariants(escalated)
    if (!inv.ok) {
      return emitRagError(
        args,
        new Error(`Invariant violation post-tooling-handoff: ${inv.violation}`),
        t0,
        `invariant_violation: ${inv.violation}`,
        toolingResult,
        undefined,
      )
    }
    getCollector()?.recordEvent('pipeline_decision', 'subloop_completed', {
      agent: SOMNIO_V4_AGENT_ID,
      reason: args.reason,
      outcome: escalated.status,
      sourceTopic: null,
      requiresHuman: escalated.requiresHuman,
    })
    args.onDebug?.({
      fired: true,
      reason: args.reason,
      finishReason: toolingStep.finishReason,
      stepCount: toolingStep.stepCount,
      toolCalls: toolingStep.toolCalls,
      toolResults: toolingStep.toolResults,
      kbHits: toolingStep.kbHits,
      outcome: escalated,
      latencyMs: performance.now() - t0,
      toolingCall: {
        stepCount: toolingStep.stepCount,
        finishReason: toolingStep.finishReason ?? 'unknown',
        output: tooling,
        latencyMs: toolingResult.latencyMs,
      },
    })
    return escalated
  }

  // CALL 2 — Generation (Gemini Flash + Output.object SIN tools)
  let generationResult: Awaited<ReturnType<typeof runGenerationCall>>
  try {
    generationResult = await runGenerationCall({
      systemPrompt: buildGenerationPrompt(
        tooling.material_del_topic,
        TONE_BASE,
        /* fewShots — Plan 04 inyectará */ [],
      ),
      userMessage: args.ctx.userMessage,
      recentMessages: args.ctx.recentMessages,
    })
  } catch (err) {
    return emitRagError(
      args,
      err,
      t0,
      'generation_call_error',
      toolingResult,
      undefined,
    )
  }

  const generation = generationResult.output

  // D-19 — threshold check
  if (generation.responseConfidence < RESPONSE_CONFIDENCE_THRESHOLD) {
    return emitRagHandoff(
      args,
      t0,
      toolingResult,
      generationResult,
      tooling,
      generation,
      'low_response_confidence',
    )
  }

  // M3 — binary backstop (RESEARCH A1)
  if (generation.binary === 'FALTA_INFO' || generation.binary === 'FUERA_SCOPE') {
    return emitRagHandoff(
      args,
      t0,
      toolingResult,
      generationResult,
      tooling,
      generation,
      `binary_backstop_${generation.binary}`,
    )
  }

  // D-09 / D-20 — NUNCA-decir check (sin cambios al archivo nunca-decir-check.ts)
  const nuncaCheck = await checkNuncaDecir({
    candidateText: generation.responseText,
    nuncaDecirRules: tooling.material_del_topic.nunca_decir ?? [],
  })
  if (!nuncaCheck.ok) {
    getCollector()?.recordEvent(
      'pipeline_decision',
      'subloop_nunca_decir_violation',
      {
        agent: SOMNIO_V4_AGENT_ID,
        reason: args.reason,
        sourceTopic: tooling.topic_seleccionado,
        violation: nuncaCheck.violation ?? null,
      },
    )
    return emitRagHandoff(
      args,
      t0,
      toolingResult,
      generationResult,
      tooling,
      generation,
      `nunca_decir_violation: ${nuncaCheck.violation ?? 'unspecified'}`,
      nuncaCheck.violation ?? 'unspecified',
    )
  }

  // SUCCESS — status='generated'
  const outcome: LoopOutcome = {
    status: 'generated',
    responseText: generation.responseText,
    sourceTopic: tooling.topic_seleccionado,
    responseConfidence: generation.responseConfidence,
    confidenceRationale: generation.confidenceRationale,
    nuncaDecirRules: tooling.material_del_topic.nunca_decir ?? null,
    responseTemplate: null,
    knowledgeQueried: [tooling.topic_seleccionado],
    requiresHuman: false,
    reason: 'rag_generated',
  }
  const inv = validateLoopOutcomeInvariants(outcome)
  if (!inv.ok) {
    return emitRagError(
      args,
      new Error(`Invariant violation post-generation: ${inv.violation}`),
      t0,
      `invariant_violation: ${inv.violation}`,
      toolingResult,
      generationResult,
    )
  }

  getCollector()?.recordEvent('pipeline_decision', 'subloop_completed', {
    agent: SOMNIO_V4_AGENT_ID,
    reason: args.reason,
    outcome: outcome.status,
    sourceTopic: outcome.sourceTopic,
    requiresHuman: outcome.requiresHuman,
  })

  const generationStep = extractStepData(generationResult.rawResult)
  args.onDebug?.({
    fired: true,
    reason: args.reason,
    finishReason: generationStep.finishReason,
    stepCount: generationStep.stepCount,
    // En el RAG path los toolCalls vienen del Call 1 (tooling). El Call 2 es sin tools.
    toolCalls: toolingStep.toolCalls,
    toolResults: toolingStep.toolResults,
    kbHits: toolingStep.kbHits,
    outcome,
    latencyMs: performance.now() - t0,
    toolingCall: {
      stepCount: toolingStep.stepCount,
      finishReason: toolingStep.finishReason ?? 'unknown',
      output: tooling,
      latencyMs: toolingResult.latencyMs,
    },
    generationCall: {
      finishReason: generationStep.finishReason ?? 'unknown',
      output: generation,
      latencyMs: generationResult.latencyMs,
    },
  })

  return outcome
}

/**
 * Emit handoff outcome del RAG path con debug payload.
 */
function emitRagHandoff(
  args: RunSubLoopArgs,
  t0: number,
  toolingResult: Awaited<ReturnType<typeof runToolingCall>>,
  generationResult: Awaited<ReturnType<typeof runGenerationCall>>,
  tooling: Awaited<ReturnType<typeof runToolingCall>>['output'],
  generation: Awaited<ReturnType<typeof runGenerationCall>>['output'],
  reason: string,
  nuncaDecirViolation?: string,
): LoopOutcome {
  const outcome: LoopOutcome = {
    status: 'no_match',
    responseText: null,
    sourceTopic: tooling.topic_seleccionado,
    responseConfidence: generation.responseConfidence,
    confidenceRationale: generation.confidenceRationale,
    nuncaDecirRules: tooling.material_del_topic?.nunca_decir ?? null,
    responseTemplate: 'handoff_humano',
    knowledgeQueried: tooling.topic_seleccionado ? [tooling.topic_seleccionado] : [],
    requiresHuman: true,
    reason,
  }

  getCollector()?.recordEvent('pipeline_decision', 'subloop_completed', {
    agent: SOMNIO_V4_AGENT_ID,
    reason: args.reason,
    outcome: outcome.status,
    sourceTopic: outcome.sourceTopic,
    requiresHuman: outcome.requiresHuman,
  })

  const toolingStep = extractStepData(toolingResult.rawResult)
  const generationStep = extractStepData(generationResult.rawResult)
  args.onDebug?.({
    fired: true,
    reason: args.reason,
    finishReason: generationStep.finishReason,
    stepCount: generationStep.stepCount,
    toolCalls: toolingStep.toolCalls,
    toolResults: toolingStep.toolResults,
    kbHits: toolingStep.kbHits,
    outcome,
    nuncaDecirViolation,
    latencyMs: performance.now() - t0,
    toolingCall: {
      stepCount: toolingStep.stepCount,
      finishReason: toolingStep.finishReason ?? 'unknown',
      output: tooling,
      latencyMs: toolingResult.latencyMs,
    },
    generationCall: {
      finishReason: generationStep.finishReason ?? 'unknown',
      output: generation,
      latencyMs: generationResult.latencyMs,
    },
  })

  return outcome
}

/**
 * Emit error outcome del RAG path. Throw — preserva el contrato del legacy (D-22).
 * NOTA: si el caller (somnio-v4-agent) prefiere no throw, mantenerse como ahora — el
 * pipeline upstream tiene try/catch a turno-level (response-track) que captura.
 */
function emitRagError(
  args: RunSubLoopArgs,
  err: unknown,
  t0: number,
  reason: string,
  toolingResult: Awaited<ReturnType<typeof runToolingCall>> | undefined,
  generationResult: Awaited<ReturnType<typeof runGenerationCall>> | undefined,
): never {
  const e = err as Record<string, unknown>
  const errName = (e?.name as string) ?? 'Error'
  const errMsg = (e?.message as string) ?? String(err)

  const toolingStep = toolingResult ? extractStepData(toolingResult.rawResult) : undefined
  const generationStep = generationResult ? extractStepData(generationResult.rawResult) : undefined

  args.onDebug?.({
    fired: true,
    reason: args.reason,
    finishReason: generationStep?.finishReason ?? toolingStep?.finishReason,
    stepCount: generationStep?.stepCount ?? toolingStep?.stepCount ?? 0,
    toolCalls: toolingStep?.toolCalls ?? [],
    toolResults: toolingStep?.toolResults ?? [],
    kbHits: toolingStep?.kbHits,
    outcome: undefined,
    latencyMs: performance.now() - t0,
    errorMessage: `${errName}: ${errMsg}`,
    toolingCall: toolingResult
      ? {
          stepCount: toolingStep?.stepCount ?? 0,
          finishReason: toolingStep?.finishReason ?? 'unknown',
          output: toolingResult.output,
          latencyMs: toolingResult.latencyMs,
        }
      : undefined,
    generationCall: generationResult
      ? {
          finishReason: generationStep?.finishReason ?? 'unknown',
          output: generationResult.output,
          latencyMs: generationResult.latencyMs,
        }
      : undefined,
  })

  throw new Error(`[SubLoop RAG reason=${args.reason} stage=${reason}] ${errName}: ${errMsg}`)
}

// ============================================================================
// FLUJO LEGACY (D-12 preservado verbatim) — crm_mutation | cas_reject
// ============================================================================

/**
 * Path legacy preservado verbatim (D-12). Single generateText con tools + Output.object
 * usando LoopOutcomeSchema. Outcomes posibles: 'template' (success — apuntar a un intent
 * template del catálogo) o 'no_match' (handoff humano).
 *
 * Plan 03 NOTE: post-refactor schema, este path NO debería emitir 'generated' (es para
 * RAG nuevo) ni 'canonical' (eliminado del enum). El prompt LEGACY explícitamente lista
 * solo 2 status válidos para mutations. Si el modelo intenta emitir un status inválido,
 * Zod schema parse falla y se escala suave via invariantCheck (`no_match`).
 */
async function runLegacySubLoop(args: RunSubLoopArgs): Promise<LoopOutcome> {
  const t0 = performance.now()

  const tools = buildSubLoopTools(args.reason, args.ctx)

  let output: LoopOutcome
  let subLoopResult: any = null
  try {
    subLoopResult = await runWithPurpose('subloop', () =>
      generateText({
        model: getOpenAI()('gpt-4o-mini'),
        system: buildToolingPrompt(args.reason),
        messages: [
          ...args.ctx.recentMessages.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user' as const, content: args.ctx.userMessage },
        ],
        tools,
        toolChoice: 'auto',
        stopWhen: stepCountIs(6),
        output: Output.object({ schema: LoopOutcomeSchema }),
      }),
    )
    // safeAccessOutput wraps NoObjectGeneratedError (vercel/ai#11348) — beneficio del wrapper también para legacy path.
    output = safeAccessOutput(subLoopResult, LoopOutcomeSchema)
  } catch (genErr) {
    const e = genErr as Record<string, unknown>
    const errName = (e?.name as string) ?? 'Error'
    const errMsg = (e?.message as string) ?? String(genErr)
    const cause = e?.cause ? JSON.stringify(e.cause).slice(0, 300) : 'no-cause'

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

    const finishReason = srFinishReason ?? (e?.finishReason as string) ?? 'no-finishReason'
    const text = srText ?? (e?.text as string) ?? (e?.responseBody as string) ?? 'no-text'

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
      `[SubLoop legacy reason=${args.reason}] ${errName}: ${errMsg} | ` +
      `finishReason="${finishReason}" | steps=${stepCount} | ` +
      `toolCalls=${JSON.stringify(toolCallsBrief).slice(0, 250)} | ` +
      `toolResults=${JSON.stringify(toolResultsBrief).slice(0, 250)} | ` +
      `text="${(text as string).slice(0, 200)}" | cause="${cause}"`,
    )
  }

  // Post-hoc invariant validation. Schema flat permite combinaciones inválidas;
  // si invariante roto → escalación suave a no_match (consistent con D-57 handoff).
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
      },
    )
    const escalated: LoopOutcome = {
      status: 'no_match',
      responseText: null,
      sourceTopic: null,
      responseConfidence: null,
      confidenceRationale: null,
      nuncaDecirRules: null,
      responseTemplate: 'handoff_humano',
      knowledgeQueried: [],
      requiresHuman: true,
      reason: `invariant_violation: ${invariantCheck.violation ?? 'unspecified'}`,
    }
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

  // Observability outcome del sub-loop.
  getCollector()?.recordEvent('pipeline_decision', 'subloop_completed', {
    agent: SOMNIO_V4_AGENT_ID,
    reason: args.reason,
    outcome: output.status,
    sourceTopic: output.status === 'generated' ? output.sourceTopic : null,
    requiresHuman: output.requiresHuman,
  })

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

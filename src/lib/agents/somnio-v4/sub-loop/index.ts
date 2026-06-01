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
import { deriveCrmActions } from './crm-echo'
import type { CrmActionRegistrada, Atendido } from '../types'
import { TONE_BASE } from './tone-base'
import { checkCompliance } from './compliance-check'
import { runToolingCall } from './tooling-call'
import { runGenerationCall } from './generation-call'
import { safeAccessOutput } from './safe-output'
import { SOMNIO_V4_AGENT_ID } from '../config'
import type {
  SubLoopDebugPayload,
  SubLoopToolCallSnapshot,
  SubLoopKbHitSnapshot,
} from './debug-payload'
// ============================================================================
// Standalone: debounce-interruption-system-v2 (Plan 05 Task 5.2)
// CKPT-3 (post-tooling) + CKPT-4 (post-generation) + CKPT-5 (post-compliance)
// fire in runRagSubLoop. A single combined CKPT (representing 3+4+5) fires in
// runLegacySubLoop after its sole generateText call (coverage matrix line 881).
// All call sites are skip-gated when ctx.lockHandle/lockChannel/lockIdentifier
// are null — sandbox / pre-v4 / fail-open callers are unaffected.
// ============================================================================
import { checkpoint, type CheckpointId } from '@/lib/agents/interruption-system-v2/checkpoints'
import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
import type { LockHandle } from '@/lib/agents/interruption-system-v2/lock'
import { LostLockError } from '../../engine-adapters/production/v4-messaging-adapter'

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
 * - `lockHandle / lockChannel / lockIdentifier` (Plan 05 — debounce-interruption-system-v2):
 *   threaded from V4ProductionRunner → somnio-v4-agent → here. CKPT-3/4/5 (RAG)
 *   + combined CKPT (legacy) fire only when all three are non-null. Sandbox / pre-v4
 *   callers leave them null and skip all checkpoints transparently.
 */
export interface SubLoopContext extends SubLoopToolsContext {
  userMessage: string
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  /** Standalone: debounce-interruption-system-v2 (D-18). Null on sandbox/pre-v4/fail-open. */
  lockHandle?: LockHandle | null
  lockChannel?: 'whatsapp' | 'facebook' | 'instagram' | null
  lockIdentifier?: string | null
  /**
   * #2 v4-subloop-context-pass (C-01): contexto del state para el path RAG.
   * SOLO informacional (no-repetición con filtrado/scoring es trabajo futuro).
   * El path CRM (crm-gate.ts) NO lo pasa — campo opcional para no romper esos callers.
   */
  stateContext?: {
    datosCapturados?: Record<string, string>
    atendidoPrevio?: Atendido[]      // input.turnLedgerDims.atendido del turno anterior
    recentBotMessages?: string[]     // últimas respuestas del bot (ya computadas en el agente)
  } | null
}

/**
 * Standalone: debounce-interruption-system-v2 (Plan 05 Task 5.2) — sub-loop checkpoint helper.
 *
 * Wraps `checkpoint(ckptId, handle, ws, channel, identifier)` with the sub-loop-specific
 * skip-guard + throw-on-lostLock + Path A emission. Returns { proceed: true } when:
 *   - the lock plumbing is missing (sandbox / pre-v4 / fail-open) — caller continues
 *   - the checkpoint says proceed (happy path)
 *
 * Returns { proceed: false } only when the holder was interrupted by a follower.
 * Throws LostLockError when the holder no longer owns the lock (zombie defense —
 * propagates to V4ProductionRunner's outer catch which emits `zombie_lambda_exit`).
 */
async function ckptInSubLoop(
  ckptId: CheckpointId,
  ctx: SubLoopContext,
): Promise<{ proceed: boolean }> {
  if (!ctx.lockHandle || !ctx.lockChannel || !ctx.lockIdentifier) {
    return { proceed: true }
  }
  const ck = await checkpoint(
    ckptId,
    ctx.lockHandle,
    ctx.workspaceId,
    ctx.lockChannel,
    ctx.lockIdentifier,
  )
  if (ck.lostLock) throw new LostLockError(ckptId)
  if (!ck.proceed && ck.interrupted) {
    emitLockEvent('msg_aborted_path_a_combined', {
      combined_msg_count: 1,
      total_chars: ctx.userMessage.length,
    })
    return { proceed: false }
  }
  return { proceed: true }
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

  // ==========================================================================
  // CKPT-3 `ckpt_3_post_tooling` (D-18 + Plan 05 Task 5.2)
  // Fires after the tooling call returns. lostLock → throw. interrupted →
  // escalate to no_match (safe outcome: runner finally-block releases lock).
  // ==========================================================================
  const ck3 = await ckptInSubLoop('ckpt_3_post_tooling', args.ctx)
  if (!ck3.proceed) {
    return {
      status: 'no_match',
      responseText: null,
      sourceTopic: null,
      responseConfidence: null,
      confidenceRationale: null,
      nuncaDecirRules: null,
      responseTemplate: 'handoff_humano',
      knowledgeQueried: [],
      requiresHuman: true,
      reason: 'interrupted_at_ckpt_3_post_tooling',
    }
  }

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
        attempts: toolingResult.attempts,
        attemptLatencies: toolingResult.attemptLatencies,
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
        // #2 v4-subloop-context-pass (C-02): solo generation, NO tooling.
        args.ctx.stateContext,
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

  // ==========================================================================
  // CKPT-4 `ckpt_4_post_generation` (D-18 + Plan 05 Task 5.2)
  // Fires after the generation call returns. lostLock → throw. interrupted →
  // escalate to no_match (the candidate text is discarded — runner releases
  // the lock; the combined next-turn handles the user's follow-up).
  // ==========================================================================
  const ck4 = await ckptInSubLoop('ckpt_4_post_generation', args.ctx)
  if (!ck4.proceed) {
    return {
      status: 'no_match',
      responseText: null,
      sourceTopic: tooling.topic_seleccionado,
      responseConfidence: null,
      confidenceRationale: null,
      nuncaDecirRules: null,
      responseTemplate: 'handoff_humano',
      knowledgeQueried: tooling.topic_seleccionado ? [tooling.topic_seleccionado] : [],
      requiresHuman: true,
      reason: 'interrupted_at_ckpt_4_post_generation',
    }
  }

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

  // 2026-05-22: compliance check post-generación — Gemini Flash independiente.
  // Single call evalúa 2 dimensiones (D-09 NUNCA-decir + escalation gate).
  // Reemplaza checkNuncaDecir; mismo costo + latencia (~150-500ms), 0 sesgo
  // de auto-evaluación (otro modelo, no compuso la respuesta).
  const compliance = await checkCompliance({
    userMessage: args.ctx.userMessage,
    candidateText: generation.responseText,
    nuncaDecirRules: tooling.material_del_topic.nunca_decir ?? [],
    cuandoEscalar: tooling.material_del_topic.cuando_escalar ?? [],
  })

  // ==========================================================================
  // CKPT-5 `ckpt_5_post_compliance` (D-18 + Plan 05 Task 5.2)
  // Fires after the compliance check returns. lostLock → throw. interrupted →
  // escalate to no_match (response not yet sent; runner releases lock).
  // ==========================================================================
  const ck5 = await ckptInSubLoop('ckpt_5_post_compliance', args.ctx)
  if (!ck5.proceed) {
    return {
      status: 'no_match',
      responseText: null,
      sourceTopic: tooling.topic_seleccionado,
      responseConfidence: null,
      confidenceRationale: null,
      nuncaDecirRules: tooling.material_del_topic.nunca_decir ?? null,
      responseTemplate: 'handoff_humano',
      knowledgeQueried: tooling.topic_seleccionado ? [tooling.topic_seleccionado] : [],
      requiresHuman: true,
      reason: 'interrupted_at_ckpt_5_post_compliance',
    }
  }

  if (compliance.nuncaDecirViolation) {
    getCollector()?.recordEvent(
      'pipeline_decision',
      'subloop_nunca_decir_violation',
      {
        agent: SOMNIO_V4_AGENT_ID,
        reason: args.reason,
        sourceTopic: tooling.topic_seleccionado,
        violation: compliance.nuncaDecirViolation,
      },
    )
    return emitRagHandoff(
      args,
      t0,
      toolingResult,
      generationResult,
      tooling,
      generation,
      `nunca_decir_violation: ${compliance.nuncaDecirViolation}`,
      compliance.nuncaDecirViolation,
      compliance,
    )
  }

  if (compliance.escalationTrigger || (!compliance.ok && !compliance.nuncaDecirViolation)) {
    const trigger = compliance.escalationTrigger ?? 'unspecified'
    getCollector()?.recordEvent(
      'pipeline_decision',
      'subloop_escalation_trigger_match',
      {
        agent: SOMNIO_V4_AGENT_ID,
        reason: args.reason,
        sourceTopic: tooling.topic_seleccionado,
        matchedTrigger: trigger,
      },
    )
    return emitRagHandoff(
      args,
      t0,
      toolingResult,
      generationResult,
      tooling,
      generation,
      `escalation_trigger_match: ${trigger}`,
      undefined,
      compliance,
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
      attempts: toolingResult.attempts,
      attemptLatencies: toolingResult.attemptLatencies,
    },
    generationCall: {
      finishReason: generationStep.finishReason ?? 'unknown',
      output: generation,
      latencyMs: generationResult.latencyMs,
    },
    complianceCheck: { output: compliance.raw, latencyMs: compliance.latencyMs },
  })

  return outcome
}

/**
 * Emit handoff outcome del RAG path con debug payload.
 *
 * `compliance` opcional — solo presente para handoffs disparados por el verifier
 * post-generación (nunca_decir / escalation_trigger). Para handoffs disparados por
 * threshold/binary del generator (low_response_confidence/binary_backstop_*) la
 * compliance call no llegó a correr, así que se omite del debug payload.
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
  compliance?: Awaited<ReturnType<typeof checkCompliance>>,
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
      attempts: toolingResult.attempts,
      attemptLatencies: toolingResult.attemptLatencies,
    },
    generationCall: {
      finishReason: generationStep.finishReason ?? 'unknown',
      output: generation,
      latencyMs: generationResult.latencyMs,
    },
    complianceCheck: compliance
      ? { output: compliance.raw, latencyMs: compliance.latencyMs }
      : undefined,
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
          attempts: toolingResult.attempts,
          attemptLatencies: toolingResult.attemptLatencies,
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
/**
 * Variante interna del legacy sub-loop que devuelve TAMBIEN el rawResult del AI SDK
 * (Plan 05 Task 3 — contrato de salida CRM, D-14/D-23/Pitfall 1+6). `runLegacySubLoop`
 * la envuelve devolviendo solo el outcome (preserva los callers RAG/cas_reject actuales).
 * `runCrmSubLoop` la usa para derivar `crmActions[]` del rawResult (ground-truth).
 *
 * El prompt crm_mutation inyecta el grounding + crmHint (threadeados via ctx).
 */
async function runLegacySubLoopRaw(
  args: RunSubLoopArgs,
): Promise<{ outcome: LoopOutcome; rawResult: any }> {
  const t0 = performance.now()

  const tools = buildSubLoopTools(args.reason, args.ctx)

  let output: LoopOutcome
  let subLoopResult: any = null
  try {
    subLoopResult = await runWithPurpose('subloop', () =>
      generateText({
        model: getOpenAI()('gpt-4o-mini'),
        // D-04/D-14: inyectar grounding + hint determinista al prompt crm_mutation.
        // Callers RAG/cas_reject no pasan grounding/crmHint → prompt verbatim viejo.
        system: buildToolingPrompt(args.reason, {
          grounding: args.ctx.grounding,
          crmHint: args.ctx.crmHint,
        }),
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

    // ========================================================================
    // Combined CKPT-3+4+5 for legacy path (Plan 05 Task 5.2 +
    // RESEARCH coverage matrix line 881)
    // The legacy sub-loop is a SINGLE generateText call — tooling + generation
    // + (implicit) compliance happen in one model call. A single checkpoint
    // after it covers the three RAG-path checkpoints in aggregate. We emit
    // under the `ckpt_3_post_tooling` CheckpointId (per coverage-matrix
    // convention). lostLock → throw with a disambiguating suffix in the message
    // (via LostLockError('ckpt_3_post_tooling_legacy_combined')). interrupted →
    // escalate to no_match.
    // ========================================================================
    if (args.ctx.lockHandle && args.ctx.lockChannel && args.ctx.lockIdentifier) {
      const ckLegacy = await checkpoint(
        'ckpt_3_post_tooling',
        args.ctx.lockHandle,
        args.ctx.workspaceId,
        args.ctx.lockChannel,
        args.ctx.lockIdentifier,
      )
      if (ckLegacy.lostLock) {
        throw new LostLockError('ckpt_3_post_tooling_legacy_combined')
      }
      if (!ckLegacy.proceed && ckLegacy.interrupted) {
        emitLockEvent('msg_aborted_path_a_combined', {
          combined_msg_count: 1,
          total_chars: args.ctx.userMessage.length,
        })
        return {
          outcome: {
            status: 'no_match',
            responseText: null,
            sourceTopic: null,
            responseConfidence: null,
            confidenceRationale: null,
            nuncaDecirRules: null,
            responseTemplate: 'handoff_humano',
            knowledgeQueried: [],
            requiresHuman: true,
            reason: 'interrupted_at_ckpt_3_post_tooling_legacy_combined',
          },
          rawResult: subLoopResult,
        }
      }
    }
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
    return { outcome: escalated, rawResult: subLoopResult }
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

  return { outcome: output, rawResult: subLoopResult }
}

/**
 * Wrapper que preserva la firma publica original `runLegacySubLoop -> Promise<LoopOutcome>`
 * para los callers RAG/cas_reject existentes (no requieren el rawResult). Delega en la
 * variante raw y descarta el rawResult.
 */
async function runLegacySubLoop(args: RunSubLoopArgs): Promise<LoopOutcome> {
  const { outcome } = await runLegacySubLoopRaw(args)
  return outcome
}

/**
 * Contrato de salida CRM del sub-loop (Plan 05 Task 3 — D-14/D-23 + Pitfall 6).
 * Devuelve el outcome del sub-loop + los crmActions DERIVADOS del rawResult
 * (ground-truth de los tool-results, NO auto-reporte del LLM).
 */
export interface SubLoopResult {
  outcome: LoopOutcome
  /** Acciones CRM derivadas de rawResult.steps[].toolResults (origen:'rag'). */
  crmActions: CrmActionRegistrada[]
}

/**
 * Entrypoint DEDICADO para el path crm_mutation (D-04/D-14/D-23). Corre el mismo
 * legacy sub-loop PERO captura el rawResult y deriva `crmActions[]` (ground-truth)
 * antes de retornar. El caller (gate del Plan 06) usa estos crmActions para:
 *   (a) poblar el ledger (D-14, origen:'rag'), y
 *   (b) extraer orderId/contactId/success para el flujo de vuelta al runner (Pitfall 6).
 *
 * NO cambia la firma de `runSubLoop` global (los callers RAG/cas_reject siguen igual).
 * El grounding + crmHint se threadean via args.ctx (SubLoopContext extends SubLoopToolsContext).
 */
export async function runCrmSubLoop(args: RunSubLoopArgs): Promise<SubLoopResult> {
  const { outcome, rawResult } = await runLegacySubLoopRaw(args)
  const crmActions = deriveCrmActions(rawResult)
  return { outcome, crmActions }
}
